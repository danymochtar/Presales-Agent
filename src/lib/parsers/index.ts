// Multi-format document parser dispatcher.
// Returns a normalized parse result that the extraction pipeline consumes.

import * as XLSX from "xlsx";
import { parseRvtools } from "@/lib/inventory/rvtools";
import type { WorkloadSet } from "@/lib/inventory/workload";
import { parseDocx } from "./docx";
import { parsePdf } from "./pdf";
import { parseText } from "./text";
import { tryParseAzureMigrate } from "./azure-migrate";

const MAX_TEXT_CHARS = 50_000;

export type InputKind =
  | "rvtools"
  | "azure_migrate"
  | "generic_csv"
  | "rfp"
  | "meeting_notes"
  | "requirements"
  | "assessment_report"
  | "other";

export type ParseResult = {
  kind: InputKind;
  filename: string;
  contentType: string;
  workloads?: WorkloadSet;
  textContent?: string;
  rawSummary: string;
  truncated: boolean;
  warnings: string[];
};

const TEXT_EXT = [".txt", ".md", ".markdown", ".csv"];
const DOCX_EXT = [".docx"];
const PDF_EXT  = [".pdf"];
const XLSX_EXT = [".xlsx", ".xls"];

function ext(filename: string): string {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot >= 0 ? lower.slice(dot) : "";
}

function inferKindFromName(filename: string): InputKind {
  const n = filename.toLowerCase();
  if (n.includes("rvtools")) return "rvtools";
  if (n.includes("azure") && (n.includes("migrate") || n.includes("assessment"))) return "azure_migrate";
  if (n.includes("rfp") || n.includes("rfq") || n.includes("rfi")) return "rfp";
  if (n.includes("meeting") || n.includes("notes") || n.includes("minutes")) return "meeting_notes";
  if (n.includes("assessment") || n.includes("readiness")) return "assessment_report";
  if (n.includes("requirement") || n.includes("brief")) return "requirements";
  return "other";
}

export async function parseDocument(
  buffer: ArrayBuffer,
  filename: string,
  contentType: string,
): Promise<ParseResult> {
  const e = ext(filename);
  const warnings: string[] = [];

  // Excel: try Azure Migrate format, then RVTools. If neither matches,
  // extract every sheet as CSV-formatted text so the LLM can still read
  // the content during the synthesis step.
  if (XLSX_EXT.includes(e)) {
    let workloads: WorkloadSet | null = null;
    try { workloads = tryParseAzureMigrate(buffer); } catch (err) {
      warnings.push(`azure-migrate parse failed: ${err instanceof Error ? err.message : "unknown"}`);
    }
    let kind: InputKind = "azure_migrate";
    if (!workloads) {
      try { workloads = parseRvtools(buffer); kind = "rvtools"; } catch (err) {
        warnings.push(`rvtools parse failed: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }
    if (workloads && workloads.workloads.length > 0) {
      const t = workloads.totals;
      return {
        kind,
        filename,
        contentType,
        workloads,
        rawSummary: `${t.count} workloads, ${t.cpu} vCPU, ${t.ramGb} GB RAM, ${t.storageGb} GB storage. OS mix: ${JSON.stringify(t.osMix)}`,
        truncated: false,
        warnings,
      };
    }
    // Fallback: extract sheet contents as CSV text — preserves context for
    // the LLM extractor even when columns don't match canonical formats.
    const wb = XLSX.read(buffer, { type: "array" });
    const sheetTexts: string[] = [];
    let totalRows = 0;
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
      const trimmed = csv.trim();
      if (!trimmed) continue;
      const rowCount = trimmed.split("\n").length;
      totalRows += rowCount;
      sheetTexts.push(`# Sheet: ${sheetName} (${rowCount} rows)\n${trimmed}`);
    }
    let combined = sheetTexts.join("\n\n");
    let truncated = false;
    if (combined.length > MAX_TEXT_CHARS) {
      combined = combined.slice(0, MAX_TEXT_CHARS);
      truncated = true;
    }
    return {
      kind: inferKindFromName(filename),
      filename,
      contentType,
      textContent: combined,
      rawSummary: `Spreadsheet (${wb.SheetNames.length} sheet${wb.SheetNames.length === 1 ? "" : "s"}, ${totalRows} rows total) — content extracted as text${truncated ? " (truncated)" : ""}`,
      truncated,
      warnings: ["Did not match RVTools or Azure Migrate format — workloads not auto-sized; content kept as reference text for the agent"],
    };
  }

  if (DOCX_EXT.includes(e)) {
    const { text, truncated } = await parseDocx(buffer);
    return {
      kind: inferKindFromName(filename),
      filename, contentType, textContent: text,
      rawSummary: `DOCX, ${text.length.toLocaleString()} chars${truncated ? " (truncated)" : ""}`,
      truncated, warnings,
    };
  }

  if (PDF_EXT.includes(e)) {
    const { text, pages, truncated } = await parsePdf(buffer);
    return {
      kind: inferKindFromName(filename),
      filename, contentType, textContent: text,
      rawSummary: `PDF, ${pages} page${pages === 1 ? "" : "s"}, ${text.length.toLocaleString()} chars${truncated ? " (truncated)" : ""}`,
      truncated, warnings,
    };
  }

  if (TEXT_EXT.includes(e) || contentType.startsWith("text/")) {
    const { text, truncated } = parseText(buffer);
    return {
      kind: inferKindFromName(filename),
      filename, contentType, textContent: text,
      rawSummary: `Text, ${text.length.toLocaleString()} chars${truncated ? " (truncated)" : ""}`,
      truncated, warnings,
    };
  }

  warnings.push(`unsupported file type: ${e || contentType}`);
  return {
    kind: "other",
    filename, contentType,
    rawSummary: `Unsupported file type — agent will skip its content`,
    truncated: false, warnings,
  };
}
