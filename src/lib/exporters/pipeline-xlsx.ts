// Consolidated pipeline workbook builder. Three sheets:
//   - Summary:       KPI pivots (status × value, closing this month/quarter).
//   - All opportunities: normalized rows across every tracker.
//   - By tracker:    one sheet per tracker keeping the original source columns
//                    (round-trip-friendly for hand-off to finance / sales).

import * as XLSX from "xlsx";
import type { PipelineStatus } from "@/lib/pipeline/status";
import { STATUS_LABELS, PIPELINE_STATUSES } from "@/lib/pipeline/status";
import { OPPORTUNITY_ORIGINS, ORIGIN_LABELS, type OpportunityOrigin } from "@/lib/pipeline/origin";

export type PipelineOpportunityRow = {
  id: string;
  trackerName: string;
  trackerSource: string;
  externalId: string | null;
  customer: string;
  name: string;
  status: PipelineStatus;
  rawStatus: string | null;
  originKind: string;
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

export type PipelineTrackerExport = {
  id: string;
  name: string;
  source: string;
  opportunities: PipelineOpportunityRow[];
};

export type PipelineExportContext = {
  tenantName: string;
  fxMyrPerUsd: number | null;
  asOf: Date;
};

function formatDate(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
}
function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}
function endOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3 + 3, 0, 23, 59, 59);
}

export function summarize(rows: PipelineOpportunityRow[], asOf: Date) {
  const byStatus: Record<PipelineStatus, { count: number; usd: number; myr: number }> = {} as never;
  for (const s of PIPELINE_STATUSES) byStatus[s] = { count: 0, usd: 0, myr: 0 };
  const byOrigin: Record<OpportunityOrigin, { count: number; usd: number; myr: number }> = {} as never;
  for (const o of OPPORTUNITY_ORIGINS) byOrigin[o] = { count: 0, usd: 0, myr: 0 };
  let totalCount = 0;
  let totalUsd = 0;
  let totalMyr = 0;

  const monthStart = startOfMonth(asOf), monthEnd = endOfMonth(asOf);
  const qStart = startOfQuarter(asOf), qEnd = endOfQuarter(asOf);
  let closingMonthCount = 0, closingMonthUsd = 0;
  let closingQuarterCount = 0, closingQuarterUsd = 0;

  for (const r of rows) {
    byStatus[r.status].count += 1;
    byStatus[r.status].usd += r.valueUsd ?? 0;
    byStatus[r.status].myr += r.valueMyr ?? 0;
    const o = (OPPORTUNITY_ORIGINS as readonly string[]).includes(r.originKind)
      ? (r.originKind as OpportunityOrigin)
      : "unknown";
    byOrigin[o].count += 1;
    byOrigin[o].usd += r.valueUsd ?? 0;
    byOrigin[o].myr += r.valueMyr ?? 0;
    totalCount += 1;
    totalUsd += r.valueUsd ?? 0;
    totalMyr += r.valueMyr ?? 0;
    if (r.closeDate && r.closeDate >= monthStart && r.closeDate <= monthEnd) {
      closingMonthCount += 1;
      closingMonthUsd += r.valueUsd ?? 0;
    }
    if (r.closeDate && r.closeDate >= qStart && r.closeDate <= qEnd) {
      closingQuarterCount += 1;
      closingQuarterUsd += r.valueUsd ?? 0;
    }
  }
  return {
    byStatus, byOrigin, totalCount, totalUsd, totalMyr,
    closingMonthCount, closingMonthUsd,
    closingQuarterCount, closingQuarterUsd,
  };
}

function buildSummarySheet(
  rows: PipelineOpportunityRow[],
  trackers: PipelineTrackerExport[],
  ctx: PipelineExportContext,
): XLSX.WorkSheet {
  const s = summarize(rows, ctx.asOf);
  const data: (string | number | null)[][] = [];
  data.push(["Consolidated Pipeline Summary"]);
  data.push([`Tenant: ${ctx.tenantName}`]);
  data.push([`As of: ${formatDate(ctx.asOf)}`]);
  if (ctx.fxMyrPerUsd) data.push([`FX: 1 USD = ${ctx.fxMyrPerUsd} MYR`]);
  data.push([]);
  data.push(["Trackers", trackers.length, "Opportunities", s.totalCount]);
  data.push(["Total value (USD)", s.totalUsd, "Total value (MYR)", s.totalMyr]);
  data.push([]);
  data.push(["By status", "Count", "Value (USD)", "Value (MYR)"]);
  for (const status of PIPELINE_STATUSES) {
    const v = s.byStatus[status];
    if (v.count === 0) continue;
    data.push([STATUS_LABELS[status], v.count, +v.usd.toFixed(2), +v.myr.toFixed(2)]);
  }
  data.push([]);
  data.push(["By origin", "Count", "Value (USD)", "Value (MYR)"]);
  for (const origin of OPPORTUNITY_ORIGINS) {
    const v = s.byOrigin[origin];
    if (v.count === 0) continue;
    data.push([ORIGIN_LABELS[origin], v.count, +v.usd.toFixed(2), +v.myr.toFixed(2)]);
  }
  data.push([]);
  data.push(["Closing this month", s.closingMonthCount, +s.closingMonthUsd.toFixed(2)]);
  data.push(["Closing this quarter", s.closingQuarterCount, +s.closingQuarterUsd.toFixed(2)]);
  data.push([]);
  data.push(["By tracker", "Source", "Opportunities"]);
  for (const t of trackers) data.push([t.name, t.source, t.opportunities.length]);
  return XLSX.utils.aoa_to_sheet(data);
}

function buildAllSheet(rows: PipelineOpportunityRow[]): XLSX.WorkSheet {
  const header = [
    "Tracker", "Source", "External ID", "Customer", "Opportunity",
    "Origin", "Status", "Raw status", "Value (USD)", "Value (MYR)",
    "Close date", "Owner", "Vendor", "Funding program",
    "Funding expires", "Notes",
  ];
  const data: (string | number | null)[][] = [header];
  for (const r of rows) {
    const originLabel = ORIGIN_LABELS[r.originKind as OpportunityOrigin] ?? r.originKind;
    data.push([
      r.trackerName, r.trackerSource, r.externalId, r.customer, r.name,
      originLabel, STATUS_LABELS[r.status], r.rawStatus, r.valueUsd, r.valueMyr,
      formatDate(r.closeDate), r.ownerName, r.vendor, r.fundingProgram,
      formatDate(r.fundingExpiresAt), r.notes,
    ]);
  }
  return XLSX.utils.aoa_to_sheet(data);
}

// Per-tracker sheet preserves the source columns from `raw` so the file
// round-trips back to finance / sales in the shape they're used to.
function buildTrackerSheet(t: PipelineTrackerExport): XLSX.WorkSheet {
  const cols = new Set<string>();
  for (const o of t.opportunities) for (const k of Object.keys(o.raw)) cols.add(k);
  const colArr = Array.from(cols);
  const header = ["Status (normalized)", ...colArr];
  const data: (string | number | null)[][] = [header];
  for (const o of t.opportunities) {
    const row: (string | number | null)[] = [STATUS_LABELS[o.status]];
    for (const c of colArr) {
      const v = o.raw[c];
      if (v === null || v === undefined) row.push(null);
      else if (typeof v === "number" || typeof v === "string") row.push(v);
      else if (v instanceof Date) row.push(formatDate(v));
      else row.push(JSON.stringify(v));
    }
    data.push(row);
  }
  return XLSX.utils.aoa_to_sheet(data);
}

// Excel sheet names cap at 31 chars and disallow : \ / ? * [ ]
function safeSheetName(name: string, used: Set<string>): string {
  let s = name.replace(/[\\\/\?\*\[\]:]/g, " ").slice(0, 31).trim() || "Sheet";
  let base = s;
  let i = 2;
  while (used.has(s)) {
    const suffix = ` (${i})`;
    s = (base.slice(0, 31 - suffix.length) + suffix);
    i += 1;
  }
  used.add(s);
  return s;
}

export function buildPipelineWorkbook(
  trackers: PipelineTrackerExport[],
  ctx: PipelineExportContext,
): Buffer {
  const allRows = trackers.flatMap((t) => t.opportunities);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSummarySheet(allRows, trackers, ctx), "Summary");
  XLSX.utils.book_append_sheet(wb, buildAllSheet(allRows), "All opportunities");
  const used = new Set<string>(["Summary", "All opportunities"]);
  for (const t of trackers) {
    XLSX.utils.book_append_sheet(wb, buildTrackerSheet(t), safeSheetName(t.name, used));
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
