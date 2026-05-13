// Reads an Excel workbook + maps source-tracker columns onto the canonical
// Opportunity shape. Pure functions — `xlsx` is the only dependency.

import * as XLSX from "xlsx";
import type { PipelineStatus } from "./status";
import { normalizeStatus } from "./status";

export type CanonicalField =
  | "externalId"
  | "customer"
  | "name"
  | "status"
  | "valueUsd"
  | "valueMyr"
  | "closeDate"
  | "ownerName"
  | "vendor"
  | "fundingProgram"
  | "fundingExpiresAt"
  | "notes";

export const CANONICAL_FIELDS: CanonicalField[] = [
  "externalId",
  "customer",
  "name",
  "status",
  "valueUsd",
  "valueMyr",
  "closeDate",
  "ownerName",
  "vendor",
  "fundingProgram",
  "fundingExpiresAt",
  "notes",
];

export const FIELD_LABELS: Record<CanonicalField, string> = {
  externalId: "External ID",
  customer: "Customer / Account",
  name: "Opportunity name",
  status: "Status / Stage",
  valueUsd: "Value (USD)",
  valueMyr: "Value (MYR)",
  closeDate: "Close date",
  ownerName: "Owner / Rep",
  vendor: "Vendor (Microsoft/AWS/GCP/...)",
  fundingProgram: "Funding program",
  fundingExpiresAt: "Funding expiry",
  notes: "Notes",
};

export type FieldMapping = Partial<Record<CanonicalField, string | null>>;

export type SheetPreview = { sheet: string; headers: string[]; sampleRows: Record<string, unknown>[] };

/**
 * Scores a row's likelihood of being the header row. Higher = more likely.
 * Real header rows are mostly non-empty strings, no duplicates, and the rows
 * BELOW them line up content-wise (a value in column N in the header means
 * the data rows usually have values in column N too).
 */
function headerScore(row: unknown[], nextRows: unknown[][]): number {
  if (!row || row.length === 0) return 0;
  let nonEmpty = 0;
  let strings = 0;
  let numbers = 0;
  const seenLower = new Set<string>();
  let duplicates = 0;
  for (const c of row) {
    if (c === null || c === undefined || c === "") continue;
    nonEmpty++;
    if (typeof c === "string") {
      strings++;
      const lower = c.trim().toLowerCase();
      if (lower && seenLower.has(lower)) duplicates++;
      seenLower.add(lower);
    } else if (typeof c === "number") {
      numbers++;
    }
  }
  // Header needs at least 3 cells with content; otherwise it's a title/blank row.
  if (nonEmpty < 3) return 0;
  // A row that's mostly numbers is data, not header.
  if (numbers >= strings) return 0;

  const fillRate = nonEmpty / row.length;
  const stringRate = strings / nonEmpty;
  const uniqueRate = 1 - duplicates / nonEmpty;

  let alignmentBonus = 0;
  if (nextRows.length > 0) {
    let aligned = 0;
    let totalNonEmpty = 0;
    for (const next of nextRows) {
      if (!Array.isArray(next)) continue;
      for (let i = 0; i < row.length; i++) {
        if (row[i] !== null && row[i] !== undefined && row[i] !== "") {
          totalNonEmpty++;
          if (next[i] !== null && next[i] !== undefined && next[i] !== "") aligned++;
        }
      }
    }
    if (totalNonEmpty > 0) alignmentBonus = (aligned / totalNonEmpty) * 0.3;
  }

  return fillRate * 0.3 + stringRate * 0.3 + uniqueRate * 0.1 + alignmentBonus;
}

/**
 * Walks the first N rows of the sheet looking for the row that looks most
 * like a header. Skips title rows, merged-cell branding, blank rows,
 * section dividers, etc. Falls back to row 0 when nothing scores well.
 * Returns header strings (deduped + cleaned, blanks become "Column N") +
 * sample data rows shaped as `{ header: value }`.
 */
export function detectSheetShape(
  rowsAoa: unknown[][],
  sampleSize: number,
): { headers: string[]; sampleRows: Record<string, unknown>[]; headerRowIndex: number; dataRowCount: number } {
  if (rowsAoa.length === 0) return { headers: [], sampleRows: [], headerRowIndex: 0, dataRowCount: 0 };

  const maxScan = Math.min(15, rowsAoa.length);
  let bestRow = 0;
  let bestScore = -1;
  for (let i = 0; i < maxScan; i++) {
    const row = rowsAoa[i];
    if (!Array.isArray(row)) continue;
    const next = rowsAoa.slice(i + 1, i + 4);
    const score = headerScore(row, next);
    if (score > bestScore) {
      bestScore = score;
      bestRow = i;
    }
  }

  const rawHeaders = (rowsAoa[bestRow] ?? []) as unknown[];
  // Clean: trim strings, replace blank with "Column N", dedupe by appending _2,_3
  const cleaned: string[] = [];
  const seen = new Map<string, number>();
  for (let i = 0; i < rawHeaders.length; i++) {
    const raw = rawHeaders[i];
    let label = raw === null || raw === undefined ? "" : String(raw).trim();
    if (!label) label = `Column ${i + 1}`;
    const n = seen.get(label) ?? 0;
    seen.set(label, n + 1);
    cleaned.push(n === 0 ? label : `${label} (${n + 1})`);
  }

  // Trim trailing blank columns (Excel often pads to 256 cols).
  while (cleaned.length > 0 && /^Column \d+$/.test(cleaned[cleaned.length - 1])) {
    const lastIdx = cleaned.length - 1;
    const hasAnyData = rowsAoa.slice(bestRow + 1).some((r) => {
      const v = Array.isArray(r) ? r[lastIdx] : undefined;
      return v !== null && v !== undefined && v !== "";
    });
    if (hasAnyData) break;
    cleaned.pop();
  }

  // Data rows: skip rows that are entirely empty.
  const dataRows = rowsAoa.slice(bestRow + 1).filter((r) =>
    Array.isArray(r) && r.some((c) => c !== null && c !== undefined && c !== ""),
  );

  const sampleRows: Record<string, unknown>[] = dataRows.slice(0, sampleSize).map((row) => {
    const obj: Record<string, unknown> = {};
    cleaned.forEach((h, i) => {
      obj[h] = (row as unknown[])[i] ?? null;
    });
    return obj;
  });

  return { headers: cleaned, sampleRows, headerRowIndex: bestRow, dataRowCount: dataRows.length };
}

export function readWorkbookPreview(buffer: ArrayBuffer | Buffer, sampleSize = 5): SheetPreview[] {
  const wb = XLSX.read(buffer, { type: buffer instanceof ArrayBuffer ? "array" : "buffer" });
  const previews: SheetPreview[] = [];
  for (const sheet of wb.SheetNames) {
    const ws = wb.Sheets[sheet];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: false });
    const { headers, sampleRows } = detectSheetShape(aoa, sampleSize);
    previews.push({ sheet, headers, sampleRows });
  }
  // Sort by descending data-row count so the wizard surfaces the meatiest
  // sheet first (e.g. a workbook with a "Cover" + "Pipeline" sheet picks
  // Pipeline). Empty / heading-only sheets sink to the end.
  previews.sort((a, b) => b.sampleRows.length - a.sampleRows.length);
  return previews;
}

export function readWorkbookRows(
  buffer: ArrayBuffer | Buffer,
  sheetName?: string,
): { sheet: string; rows: Record<string, unknown>[] } {
  const wb = XLSX.read(buffer, { type: buffer instanceof ArrayBuffer ? "array" : "buffer" });
  // Pick the requested sheet, or the sheet with the most data rows.
  let name = sheetName && wb.Sheets[sheetName] ? sheetName : wb.SheetNames[0];
  if (!sheetName) {
    let bestCount = -1;
    for (const s of wb.SheetNames) {
      const ws = wb.Sheets[s];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: false });
      const { dataRowCount } = detectSheetShape(aoa, 0);
      if (dataRowCount > bestCount) {
        bestCount = dataRowCount;
        name = s;
      }
    }
  }
  const ws = wb.Sheets[name];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: false });
  const { headers, headerRowIndex } = detectSheetShape(aoa, 0);
  const rows: Record<string, unknown>[] = [];
  for (let i = headerRowIndex + 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!Array.isArray(row)) continue;
    if (!row.some((c) => c !== null && c !== undefined && c !== "")) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] ?? null;
    });
    rows.push(obj);
  }
  return { sheet: name, rows };
}

// Header → canonical field heuristics. Many real-world trackers use the same
// vocabulary ("Account", "TCV", "Close Date") so a small regex table covers
// the common case; the UI lets the user fix mismatches.
const HEADER_PATTERNS: Array<{ field: CanonicalField; re: RegExp }> = [
  { field: "externalId", re: /\b(id|opp[\s_-]*id|opportunity[\s_-]*id|crm[\s_-]*id|record[\s_-]*id)\b/i },
  { field: "customer", re: /\b(account|customer|client|company|organi[sz]ation)\b/i },
  { field: "name", re: /\b(opportunity|opp[\s_-]*name|deal|project|engagement|workload|name)\b/i },
  { field: "status", re: /\b(stage|status|state|forecast|category|phase)\b(?![\s_-]*date)/i },
  { field: "valueMyr", re: /\b(myr|rm|ringgit)\b/i },
  { field: "valueUsd", re: /\b(tcv|acv|amount|value|revenue|deal[\s_-]*size|usd|us\$)\b/i },
  { field: "closeDate", re: /\bclose\b|\bforecast[\s_-]*date\b|\bdue[\s_-]*date\b/i },
  { field: "ownerName", re: /\b(owner|rep|seller|account[\s_-]*manager|sa|architect|psm|am)\b/i },
  { field: "vendor", re: /\b(vendor|cloud[\s_-]*provider|product[\s_-]*line)\b/i },
  { field: "fundingProgram", re: /\b(program|funding|accelerate|map|ecif|cfac)\b/i },
  { field: "fundingExpiresAt", re: /\bconsent\b|\bexpir(es|ing|ed|y|ation)\b|\bvalid[\s_-]*until\b/i },
  { field: "notes", re: /\b(notes?|comments?|remarks?|next[\s_-]*step)\b/i },
];

export function suggestMapping(headers: string[]): FieldMapping {
  const out: FieldMapping = {};
  // First pass: name field — first remaining unused header that matches `name`
  for (const field of CANONICAL_FIELDS) out[field] = null;
  const claimed = new Set<string>();
  for (const { field, re } of HEADER_PATTERNS) {
    if (out[field]) continue;
    const hit = headers.find((h) => !claimed.has(h) && re.test(h));
    if (hit) {
      out[field] = hit;
      claimed.add(hit);
    }
  }
  // Common ambiguity: when a sheet only has one of {customer,name},
  // duplicate it into the missing slot so neither is blank.
  if (!out.customer && out.name) out.customer = out.name;
  if (!out.name && out.customer) out.name = out.customer;
  return out;
}

function toStringSafe(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const cleaned = String(v).replace(/[^\d.\-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  // Excel serial number
  if (typeof v === "number") {
    // SSF epoch is 1899-12-30
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

export type NormalizedOpportunity = {
  externalId: string | null;
  customer: string;
  name: string;
  status: PipelineStatus;
  rawStatus: string | null;
  valueUsd: number | null;
  valueMyr: number | null;
  closeDate: Date | null;
  ownerName: string | null;
  vendor: string | null;
  fundingProgram: string | null;
  fundingExpiresAt: Date | null;
  notes: string | null;
  raw: Record<string, unknown>;
};

export function applyMapping(
  rows: Record<string, unknown>[],
  mapping: FieldMapping,
  opts: { statusMapping?: Record<string, PipelineStatus> | null; fxMyrPerUsd?: number | null } = {},
): NormalizedOpportunity[] {
  const get = (row: Record<string, unknown>, field: CanonicalField) => {
    const col = mapping[field];
    if (!col) return null;
    return row[col] ?? null;
  };
  const out: NormalizedOpportunity[] = [];
  for (const row of rows) {
    const customer = toStringSafe(get(row, "customer"));
    const name = toStringSafe(get(row, "name")) || customer;
    if (!customer && !name) continue;
    const rawStatus = toStringSafe(get(row, "status")) || null;
    const valueUsd = toNumber(get(row, "valueUsd"));
    let valueMyr = toNumber(get(row, "valueMyr"));
    if (valueMyr === null && valueUsd !== null && opts.fxMyrPerUsd) {
      valueMyr = +(valueUsd * opts.fxMyrPerUsd).toFixed(2);
    }
    out.push({
      externalId: toStringSafe(get(row, "externalId")) || null,
      customer: customer || name,
      name: name || customer,
      status: normalizeStatus(rawStatus, opts.statusMapping ?? null),
      rawStatus,
      valueUsd,
      valueMyr,
      closeDate: toDate(get(row, "closeDate")),
      ownerName: toStringSafe(get(row, "ownerName")) || null,
      vendor: toStringSafe(get(row, "vendor")) || null,
      fundingProgram: toStringSafe(get(row, "fundingProgram")) || null,
      fundingExpiresAt: toDate(get(row, "fundingExpiresAt")),
      notes: toStringSafe(get(row, "notes")) || null,
      raw: row,
    });
  }
  return out;
}
