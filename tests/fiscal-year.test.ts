import { describe, it, expect } from "vitest";
import {
  fyStart,
  fyEnd,
  fyQuarterIndex,
  fyQuarterLabel,
  isFiscalYearConfig,
  suggestFyLabel,
  type FiscalYearConfig,
} from "@/lib/fiscal-year";

const MSFT: FiscalYearConfig = { startMonth: 7, startDay: 1, currentLabel: "FY27" };
const CAL:  FiscalYearConfig = { startMonth: 1, startDay: 1, currentLabel: "2026" };

describe("isFiscalYearConfig", () => {
  it("accepts the canonical shape", () => {
    expect(isFiscalYearConfig(MSFT)).toBe(true);
  });
  it("rejects junk", () => {
    expect(isFiscalYearConfig(null)).toBe(false);
    expect(isFiscalYearConfig({ startMonth: 13, startDay: 1, currentLabel: "" })).toBe(false);
    expect(isFiscalYearConfig({ startMonth: 7, startDay: 1 })).toBe(false);
  });
});

describe("Microsoft FY (Jul 1 → Jun 30)", () => {
  it("Aug 15, 2026 falls in FY ending Jun 30, 2027", () => {
    const aug15 = new Date(2026, 7, 15);
    expect(fyStart(MSFT, aug15).toISOString().slice(0, 10)).toBe("2026-07-01");
    expect(fyEnd(MSFT, aug15).toISOString().slice(0, 10)).toBe("2027-07-01");
  });
  it("Mar 5, 2027 falls in same FY", () => {
    const mar5 = new Date(2027, 2, 5);
    expect(fyStart(MSFT, mar5).toISOString().slice(0, 10)).toBe("2026-07-01");
  });
  it("Jun 30 boundary stays in the prior FY", () => {
    const jun30 = new Date(2027, 5, 30);
    expect(fyStart(MSFT, jun30).toISOString().slice(0, 10)).toBe("2026-07-01");
  });
  it("Q1 is Jul-Sep, Q2 Oct-Dec, Q3 Jan-Mar, Q4 Apr-Jun", () => {
    expect(fyQuarterIndex(MSFT, new Date(2026, 7, 1))).toBe(1);   // Aug
    expect(fyQuarterIndex(MSFT, new Date(2026, 10, 1))).toBe(2);  // Nov
    expect(fyQuarterIndex(MSFT, new Date(2027, 1, 1))).toBe(3);   // Feb
    expect(fyQuarterIndex(MSFT, new Date(2027, 4, 1))).toBe(4);   // May
  });
  it("quarter label uses tenant's currentLabel", () => {
    expect(fyQuarterLabel(MSFT, new Date(2026, 7, 1))).toBe("Q1 FY27");
  });
});

describe("Calendar FY (Jan 1 → Dec 31)", () => {
  it("Mar 15, 2026 falls in calendar FY 2026", () => {
    const mar15 = new Date(2026, 2, 15);
    expect(fyStart(CAL, mar15).toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(fyEnd(CAL, mar15).toISOString().slice(0, 10)).toBe("2027-01-01");
  });
});

describe("suggestFyLabel", () => {
  it("Microsoft-style label uses end-year suffix", () => {
    const aug15 = new Date(2026, 7, 15);
    expect(suggestFyLabel(7, 1, aug15)).toBe("FY27");
  });
  it("Calendar-style label uses the same year", () => {
    const mar15 = new Date(2026, 2, 15);
    expect(suggestFyLabel(1, 1, mar15)).toBe("FY26");
  });
});
