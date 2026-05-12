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

export function readWorkbookPreview(buffer: ArrayBuffer | Buffer, sampleSize = 5): SheetPreview[] {
  const wb = XLSX.read(buffer, { type: buffer instanceof ArrayBuffer ? "array" : "buffer" });
  return wb.SheetNames.map((sheet) => {
    const ws = wb.Sheets[sheet];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { sheet, headers, sampleRows: rows.slice(0, sampleSize) };
  });
}

export function readWorkbookRows(
  buffer: ArrayBuffer | Buffer,
  sheetName?: string,
): { sheet: string; rows: Record<string, unknown>[] } {
  const wb = XLSX.read(buffer, { type: buffer instanceof ArrayBuffer ? "array" : "buffer" });
  const name = sheetName && wb.Sheets[sheetName] ? sheetName : wb.SheetNames[0];
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
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
