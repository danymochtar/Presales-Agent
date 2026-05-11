import { describe, it, expect } from "vitest";
import {
  assessCompleteness,
  applyDefaults,
  patchWorkload,
  mergeWorkloadSets,
  SUGGESTED_DEFAULTS,
} from "@/lib/inventory/completeness";
import { summarize, type Workload, type WorkloadSet } from "@/lib/inventory/workload";

function setOf(workloads: Workload[]): WorkloadSet {
  return { source: "manual", workloads, totals: summarize(workloads) };
}

const mixed: WorkloadSet = setOf([
  { name: "web-01",     os: "linux",   cpu: 4, ramGb: 16, storageGb: 100, count: 1 },
  { name: "sql-01",     os: "windows", cpu: 8, ramGb: 32, storageGb: 0,   count: 1 }, // missing storage
  { name: "app-01",     os: "linux",   cpu: 4, ramGb: 0,  storageGb: 100, count: 1 }, // blocking — no RAM
  { name: "unknown-vm", os: "other",   cpu: 0, ramGb: 0,  storageGb: 0,   count: 1 }, // blocking
]);

describe("assessCompleteness", () => {
  it("classifies workloads into complete / partial / blocking", () => {
    const r = assessCompleteness(mixed);
    expect(r.totalWorkloads).toBe(4);
    expect(r.completeCount).toBe(1);
    expect(r.partialCount).toBe(1);
    expect(r.blockingCount).toBe(2);
    expect(r.canGenerate).toBe(false);
  });

  it("reports per-workload missing fields with blocking flag", () => {
    const r = assessCompleteness(mixed);
    expect(r.gaps.find((g) => g.name === "sql-01")?.missing).toEqual(["storageGb"]);
    expect(r.gaps.find((g) => g.name === "sql-01")?.blocking).toBe(false);
    expect(r.gaps.find((g) => g.name === "unknown-vm")?.missing).toEqual(["cpu", "ramGb", "storageGb", "os"]);
    expect(r.gaps.find((g) => g.name === "unknown-vm")?.blocking).toBe(true);
  });

  it("computes completeness percentage from filled fields", () => {
    // 4 workloads × 4 fields = 16 slots. Filled: 4 + 3 + 3 + 0 = 10 → 62.5% → 63
    const r = assessCompleteness(mixed);
    expect(r.completenessPct).toBe(63);
  });

  it("returns canGenerate=true when no blocking workloads", () => {
    const all = setOf([
      { name: "web-01", os: "linux",   cpu: 4, ramGb: 16, storageGb: 100, count: 1 },
      { name: "sql-01", os: "windows", cpu: 8, ramGb: 32, storageGb: 500, count: 1 },
    ]);
    expect(assessCompleteness(all).canGenerate).toBe(true);
  });
});

describe("applyDefaults", () => {
  it("fills only the missing fields, leaves filled values untouched", () => {
    const out = applyDefaults(mixed, SUGGESTED_DEFAULTS);
    const sql = out.workloads.find((w) => w.name === "sql-01")!;
    expect(sql.cpu).toBe(8);          // present, kept
    expect(sql.ramGb).toBe(32);       // present, kept
    expect(sql.storageGb).toBe(50);   // was 0 → defaulted
    const unknown = out.workloads.find((w) => w.name === "unknown-vm")!;
    expect(unknown.cpu).toBe(2);
    expect(unknown.ramGb).toBe(4);
    expect(unknown.storageGb).toBe(50);
    expect(unknown.os).toBe("linux");
  });

  it("resulting set can generate", () => {
    expect(assessCompleteness(applyDefaults(mixed, SUGGESTED_DEFAULTS)).canGenerate).toBe(true);
  });
});

describe("patchWorkload", () => {
  it("updates only the addressed row and recomputes totals", () => {
    const out = patchWorkload(mixed, 2, { ramGb: 16 });
    expect(out.workloads[2].ramGb).toBe(16);
    expect(out.workloads[0].ramGb).toBe(16); // unchanged
    expect(out.totals.ramGb).toBe(16 + 32 + 16 + 0);
  });
});

describe("mergeWorkloadSets", () => {
  it("dedups on name+os, recomputes totals", () => {
    const a = setOf([{ name: "web-01", os: "linux", cpu: 4, ramGb: 16, storageGb: 100, count: 1 }]);
    const b = setOf([
      { name: "web-01", os: "linux", cpu: 4, ramGb: 16, storageGb: 100, count: 1 },  // dup
      { name: "web-02", os: "linux", cpu: 2, ramGb: 8,  storageGb: 50,  count: 1 },
    ]);
    const m = mergeWorkloadSets(a, b);
    expect(m.workloads).toHaveLength(2);
    expect(m.totals.count).toBe(2);
  });
});
