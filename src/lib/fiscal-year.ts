// Fiscal-year helpers. The tenant configures (startMonth, startDay, currentLabel)
// once at first-login setup; every subsequent dashboard query uses these to
// frame KPIs (closing this month / quarter / fiscal year, target vs actual).
//
// Common configurations:
//   - Microsoft FY: July 1 → June 30. FY27 = 1 Jul 2026 → 30 Jun 2027.
//   - AWS / Google calendar FY: January 1 → December 31.
//   - Custom (e.g. April 1 → March 31 for many APAC firms).

export type FiscalYearConfig = {
  startMonth: number;   // 1..12 (Jan = 1)
  startDay: number;     // 1..31
  currentLabel: string; // e.g. "FY27"
};

export function isFiscalYearConfig(v: unknown): v is FiscalYearConfig {
  if (!v || typeof v !== "object") return false;
  const x = v as { startMonth?: unknown; startDay?: unknown; currentLabel?: unknown };
  return typeof x.startMonth === "number" && x.startMonth >= 1 && x.startMonth <= 12
      && typeof x.startDay === "number"   && x.startDay >= 1   && x.startDay <= 31
      && typeof x.currentLabel === "string" && x.currentLabel.length > 0;
}

/** Start date of the fiscal year that the given `asOf` date falls into. */
export function fyStart(fy: FiscalYearConfig, asOf: Date): Date {
  const startThisYear = new Date(asOf.getFullYear(), fy.startMonth - 1, fy.startDay, 0, 0, 0, 0);
  if (asOf >= startThisYear) return startThisYear;
  return new Date(asOf.getFullYear() - 1, fy.startMonth - 1, fy.startDay, 0, 0, 0, 0);
}

/** End date (exclusive) of the fiscal year that `asOf` falls into. */
export function fyEnd(fy: FiscalYearConfig, asOf: Date): Date {
  const start = fyStart(fy, asOf);
  return new Date(start.getFullYear() + 1, start.getMonth(), start.getDate(), 0, 0, 0, 0);
}

/** Quarter index 1..4 within the fiscal year that `asOf` falls into. */
export function fyQuarterIndex(fy: FiscalYearConfig, asOf: Date): 1 | 2 | 3 | 4 {
  const start = fyStart(fy, asOf);
  const diffMs = asOf.getTime() - start.getTime();
  const days = diffMs / (24 * 60 * 60 * 1000);
  const q = Math.min(4, Math.max(1, Math.floor(days / (365 / 4)) + 1)) as 1 | 2 | 3 | 4;
  return q;
}

/** Start of FY quarter that `asOf` falls into. */
export function fyQuarterStart(fy: FiscalYearConfig, asOf: Date): Date {
  const start = fyStart(fy, asOf);
  const q = fyQuarterIndex(fy, asOf);
  return new Date(start.getFullYear(), start.getMonth() + (q - 1) * 3, start.getDate(), 0, 0, 0, 0);
}

/** End of FY quarter (exclusive) that `asOf` falls into. */
export function fyQuarterEnd(fy: FiscalYearConfig, asOf: Date): Date {
  const start = fyQuarterStart(fy, asOf);
  return new Date(start.getFullYear(), start.getMonth() + 3, start.getDate(), 0, 0, 0, 0);
}

/** Human label for current quarter, e.g. "Q3 FY27". */
export function fyQuarterLabel(fy: FiscalYearConfig, asOf: Date): string {
  return `Q${fyQuarterIndex(fy, asOf)} ${fy.currentLabel}`;
}

/** Common presets surfaced in the setup form. */
export const FY_PRESETS: { value: string; label: string; startMonth: number; startDay: number }[] = [
  { value: "msft", label: "Microsoft (July → June)",      startMonth: 7,  startDay: 1 },
  { value: "cal",  label: "Calendar (January → December)",startMonth: 1,  startDay: 1 },
  { value: "apr",  label: "April → March",                 startMonth: 4,  startDay: 1 },
  { value: "oct",  label: "October → September (US Gov)",  startMonth: 10, startDay: 1 },
];

/**
 * Helper for the setup form: given a start month + today, suggest the
 * "current FY" label using the Microsoft convention — FY ends in the year
 * of the END date. E.g. start=Jul 2026 → ends Jun 2027 → "FY27".
 */
export function suggestFyLabel(startMonth: number, startDay: number, asOf: Date = new Date()): string {
  const cfg: FiscalYearConfig = { startMonth, startDay, currentLabel: "FY" };
  const end = fyEnd(cfg, asOf);
  // fyEnd is exclusive — the inclusive last day is one day earlier. Anchoring
  // on the inclusive last day gives Microsoft "FY27" (Jun 30 2027) AND
  // calendar "FY26" (Dec 31 2026) without a special case.
  const lastDay = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return `FY${String(lastDay.getFullYear()).slice(-2)}`;
}
