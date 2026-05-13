import { describe, it, expect } from "vitest";
import {
  periodRange,
  computeActual,
  attainmentPct,
  metricIsCurrency,
  metricIsCount,
} from "@/lib/business/targets";
import type { FiscalYearConfig } from "@/lib/fiscal-year";

const MSFT: FiscalYearConfig = { startMonth: 7, startDay: 1, currentLabel: "FY27" };

describe("periodRange (Microsoft FY: Jul 1 → Jun 30)", () => {
  it("year covers Jul 1 → Jul 1 next year", () => {
    const r = periodRange(MSFT, "year", new Date(2026, 8, 15)); // Sep 2026 → FY27
    expect(r.start.toISOString().slice(0, 10)).toBe("2026-07-01");
    expect(r.end.toISOString().slice(0, 10)).toBe("2027-07-01");
  });

  it("q1 covers Jul → Sep", () => {
    const r = periodRange(MSFT, "q1", new Date(2026, 8, 15));
    expect(r.start.toISOString().slice(0, 10)).toBe("2026-07-01");
    expect(r.end.toISOString().slice(0, 10)).toBe("2026-10-01");
  });

  it("q3 covers Jan → Mar of the next calendar year", () => {
    const r = periodRange(MSFT, "q3", new Date(2026, 8, 15));
    expect(r.start.toISOString().slice(0, 10)).toBe("2027-01-01");
    expect(r.end.toISOString().slice(0, 10)).toBe("2027-04-01");
  });

  it("m07 (Jan of the FY) covers Jan only", () => {
    const r = periodRange(MSFT, "m07", new Date(2026, 8, 15));
    expect(r.start.toISOString().slice(0, 10)).toBe("2027-01-01");
    expect(r.end.toISOString().slice(0, 10)).toBe("2027-02-01");
  });
});

describe("computeActual", () => {
  const opps = [
    { valueUsd: 100, status: "committed" },
    { valueUsd: 50,  status: "won" },
    { valueUsd: 30,  status: "upside" },
    { valueUsd: 20,  status: "at_risk" },
    { valueUsd: 25,  status: "lost" },
  ];

  it("revenue sums committed + won only", () => {
    expect(computeActual("revenue", opps)).toBe(150);
  });

  it("deal_count counts committed + won only", () => {
    expect(computeActual("deal_count", opps)).toBe(2);
  });

  it("win_rate_pct = won / (won + lost) * 100", () => {
    // 1 won + 1 lost → closed=2, won=1 → 50%.
    expect(computeActual("win_rate_pct", opps)).toBe(50);
  });

  it("returns 0 for cost / margin / csat (not auto-computable)", () => {
    expect(computeActual("cost", opps)).toBe(0);
    expect(computeActual("gross_margin_pct", opps)).toBe(0);
    expect(computeActual("csat", opps)).toBe(0);
  });
});

describe("attainmentPct", () => {
  it("returns null when target is null or zero", () => {
    expect(attainmentPct(100, null)).toBeNull();
    expect(attainmentPct(100, 0)).toBeNull();
  });
  it("computes percent", () => {
    expect(attainmentPct(500, 1000)).toBe(50);
    expect(attainmentPct(1200, 1000)).toBe(120);
  });
});

describe("metric flags", () => {
  it("currency metrics", () => {
    expect(metricIsCurrency("revenue")).toBe(true);
    expect(metricIsCurrency("cost")).toBe(true);
    expect(metricIsCurrency("acr")).toBe(true);
    expect(metricIsCurrency("csat")).toBe(false);
  });
  it("count metrics", () => {
    expect(metricIsCount("deal_count")).toBe(true);
    expect(metricIsCount("revenue")).toBe(false);
  });
});
