import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { buildPipelineWorkbook, summarize, type PipelineOpportunityRow, type PipelineTrackerExport } from "@/lib/exporters/pipeline-xlsx";

const today = new Date("2026-05-12T00:00:00Z");

function row(over: Partial<PipelineOpportunityRow> = {}): PipelineOpportunityRow {
  return {
    id: "x", trackerName: "Microsoft biweekly", trackerSource: "microsoft",
    externalId: null, customer: "Acme", name: "Acme Cloud",
    status: "committed", rawStatus: "Commit",
    valueUsd: 100000, valueMyr: 470000, closeDate: new Date("2026-05-20"),
    ownerName: "Alice", vendor: "Microsoft",
    fundingProgram: null, fundingExpiresAt: null,
    notes: null, raw: { Account: "Acme", Stage: "Commit", "TCV USD": 100000 },
    ...over,
  };
}

const trackerA: PipelineTrackerExport = {
  id: "ta", name: "Microsoft biweekly", source: "microsoft",
  opportunities: [
    row({ id: "1", customer: "Acme", valueUsd: 100000, valueMyr: 470000, closeDate: new Date("2026-05-20"), status: "committed" }),
    row({ id: "2", customer: "Beta", valueUsd: 45000,  valueMyr: 211500, closeDate: new Date("2026-08-01"), status: "upside" }),
    row({ id: "3", customer: "Gamma", valueUsd: 0,      valueMyr: 0,      closeDate: null, status: "at_risk" }),
  ],
};
const trackerB: PipelineTrackerExport = {
  id: "tb", name: "ENT/PS", source: "ent_ps",
  opportunities: [
    row({ id: "4", trackerName: "ENT/PS", trackerSource: "ent_ps", customer: "Petronas", valueUsd: 500000, valueMyr: 2350000, closeDate: new Date("2026-06-30"), status: "committed" }),
  ],
};

describe("summarize", () => {
  it("groups by status and computes closing-month / closing-quarter pivots", () => {
    const s = summarize([...trackerA.opportunities, ...trackerB.opportunities], today);
    expect(s.totalCount).toBe(4);
    expect(s.totalUsd).toBe(645000);
    expect(s.byStatus.committed.count).toBe(2);
    expect(s.byStatus.committed.usd).toBe(600000);
    expect(s.byStatus.upside.count).toBe(1);
    expect(s.byStatus.at_risk.count).toBe(1);
    expect(s.closingMonthCount).toBe(1);
    expect(s.closingMonthUsd).toBe(100000);
    expect(s.closingQuarterCount).toBe(2);
    expect(s.closingQuarterUsd).toBe(600000);
  });
});

describe("buildPipelineWorkbook", () => {
  it("produces Summary + All opportunities + one sheet per tracker", () => {
    const buf = buildPipelineWorkbook([trackerA, trackerB], {
      tenantName: "Noventiq KL", fxMyrPerUsd: 4.7, asOf: today,
    });
    const wb = XLSX.read(buf, { type: "buffer" });
    expect(wb.SheetNames).toEqual(expect.arrayContaining(["Summary", "All opportunities", "Microsoft biweekly", "ENT PS"]));
  });

  it("summary sheet contains status pivot and tenant header", () => {
    const buf = buildPipelineWorkbook([trackerA, trackerB], {
      tenantName: "Noventiq KL", fxMyrPerUsd: 4.7, asOf: today,
    });
    const wb = XLSX.read(buf, { type: "buffer" });
    const data = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Summary"], { header: 1, defval: null });
    const csv = JSON.stringify(data);
    expect(csv).toContain("Consolidated Pipeline Summary");
    expect(csv).toContain("Noventiq KL");
    expect(csv).toContain("Committed");
    expect(csv).toContain("Closing this month");
    expect(csv).toContain("Closing this quarter");
  });

  it("per-tracker sheet preserves original source columns from raw", () => {
    const buf = buildPipelineWorkbook([trackerA], {
      tenantName: "X", fxMyrPerUsd: null, asOf: today,
    });
    const wb = XLSX.read(buf, { type: "buffer" });
    const csv = JSON.stringify(XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Microsoft biweekly"], { header: 1, defval: null }));
    expect(csv).toContain("Account");
    expect(csv).toContain("Stage");
    expect(csv).toContain("TCV USD");
  });

  it("sanitizes sheet names that contain forbidden chars", () => {
    const tricky: PipelineTrackerExport = {
      id: "tc", name: "Sales/Rep [A]", source: "sales_rep",
      opportunities: [row({ id: "5", trackerName: "Sales/Rep [A]", trackerSource: "sales_rep" })],
    };
    const buf = buildPipelineWorkbook([tricky], { tenantName: "X", fxMyrPerUsd: null, asOf: today });
    const wb = XLSX.read(buf, { type: "buffer" });
    expect(wb.SheetNames.some((n) => n.includes("/"))).toBe(false);
    expect(wb.SheetNames.some((n) => n.includes("["))).toBe(false);
  });
});
