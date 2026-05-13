// Business-target helpers — period enum + actuals rollup from pipeline.
//
// A target is one row scoped by (fiscalYear, period, metric, cloud, productKey,
// segment, ownerId). Actuals are computed from the pipeline:
//   - Sum Opportunity.valueUsd where:
//     - cloudOfVendor(o.vendor) matches target.cloud (or target.cloud === "all")
//     - o.closeDate ∈ [periodStart, periodEnd)
//     - status filter applied per metric (revenue counts committed+won;
//       deal_count counts everything; cost / margin require manual entry)
//     - owner filter: if target.ownerId set, opportunity must have an
//       OpportunityAssignment to that person in a sales role.
//
// Pure functions where possible. The "load actuals from DB" call lives in
// the dashboard page (so server-side rendering can decide which slices to
// compute).

import type { FiscalYearConfig } from "@/lib/fiscal-year";
import { fyStart } from "@/lib/fiscal-year";

export type TargetPeriod =
  | "year"
  | "q1" | "q2" | "q3" | "q4"
  | "m01" | "m02" | "m03" | "m04" | "m05" | "m06"
  | "m07" | "m08" | "m09" | "m10" | "m11" | "m12";

export const TARGET_PERIODS: TargetPeriod[] = [
  "year", "q1", "q2", "q3", "q4",
  "m01", "m02", "m03", "m04", "m05", "m06",
  "m07", "m08", "m09", "m10", "m11", "m12",
];

export const PERIOD_LABELS: Record<TargetPeriod, string> = {
  year: "Full year",
  q1: "Q1", q2: "Q2", q3: "Q3", q4: "Q4",
  m01: "Month 1", m02: "Month 2", m03: "Month 3", m04: "Month 4",
  m05: "Month 5", m06: "Month 6", m07: "Month 7", m08: "Month 8",
  m09: "Month 9", m10: "Month 10", m11: "Month 11", m12: "Month 12",
};

export type TargetMetric =
  | "revenue"
  | "cost"
  | "gross_margin_pct"
  | "deal_count"
  | "win_rate_pct"
  | "acr"
  | "csat"
  | "other";

export const TARGET_METRICS: TargetMetric[] = [
  "revenue", "cost", "gross_margin_pct", "deal_count", "win_rate_pct", "acr", "csat", "other",
];

export const METRIC_LABELS: Record<TargetMetric, string> = {
  revenue:          "Revenue",
  cost:             "Cost",
  gross_margin_pct: "Gross margin %",
  deal_count:       "Deal count",
  win_rate_pct:     "Win rate %",
  acr:              "ACR (Annual Cloud Revenue)",
  csat:             "CSAT",
  other:            "Other",
};

export function metricIsCurrency(m: string): boolean {
  return m === "revenue" || m === "cost" || m === "acr";
}

export function metricIsCount(m: string): boolean {
  return m === "deal_count";
}

/**
 * Given the tenant's fiscal-year config and a target's period, return the
 * [start, end) date range to filter opportunities by.
 *
 * Months are indexed *within the fiscal year* — m01 is the first month
 * starting from `fy.startMonth`, m02 is the next, etc. Allows the same
 * "Q1" / "M01" label to mean different calendar months for different
 * tenants without recomputing.
 */
export function periodRange(fy: FiscalYearConfig, period: TargetPeriod, asOf: Date): { start: Date; end: Date } {
  const fyS = fyStart(fy, asOf);
  if (period === "year") {
    return { start: fyS, end: addMonths(fyS, 12) };
  }
  if (period.startsWith("q")) {
    const q = Number(period.slice(1)); // 1..4
    return { start: addMonths(fyS, (q - 1) * 3), end: addMonths(fyS, q * 3) };
  }
  if (period.startsWith("m")) {
    const m = Number(period.slice(1)); // 1..12
    return { start: addMonths(fyS, m - 1), end: addMonths(fyS, m) };
  }
  return { start: fyS, end: addMonths(fyS, 12) };
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate(), 0, 0, 0, 0);
}

/**
 * Compute the actual value of `metric` from a list of opportunities. The
 * caller pre-filters by cloud / segment / owner / period so this is just
 * the final reduce step.
 */
export type ActualInputOpportunity = {
  valueUsd: number | null;
  status: string; // committed | upside | uncommitted | at_risk | won | lost | …
};

export function computeActual(metric: string, opps: ActualInputOpportunity[]): number {
  if (metric === "revenue" || metric === "acr") {
    // Count committed + won as in-flight revenue. Upside / uncommitted /
    // at-risk excluded — those are scenarios, not realized actuals.
    return opps
      .filter((o) => o.status === "committed" || o.status === "won")
      .reduce((s, o) => s + (o.valueUsd ?? 0), 0);
  }
  if (metric === "deal_count") {
    return opps.filter((o) => o.status === "committed" || o.status === "won").length;
  }
  if (metric === "win_rate_pct") {
    const closed = opps.filter((o) => o.status === "won" || o.status === "lost").length;
    const won = opps.filter((o) => o.status === "won").length;
    return closed === 0 ? 0 : Math.round((won / closed) * 100);
  }
  // cost, margin, csat, other: not auto-computable from pipeline — caller
  // shows "—" + relies on manual entry / a future cost-import path.
  return 0;
}

export function attainmentPct(actual: number, target: number | null): number | null {
  if (target === null || target === 0) return null;
  return Math.round((actual / target) * 100);
}
