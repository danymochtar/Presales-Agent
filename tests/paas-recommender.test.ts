import { describe, it, expect } from "vitest";
import { detectComponents } from "@/lib/inventory/component-detector";
import { recommendPaas } from "@/lib/inventory/paas-recommender";
import { summarize, type Workload, type WorkloadSet } from "@/lib/inventory/workload";

function setOf(workloads: Workload[]): WorkloadSet {
  return { source: "manual", workloads, totals: summarize(workloads) };
}

const mixedSet: WorkloadSet = setOf([
  { name: "sql-prod-01",    os: "windows", cpu: 8, ramGb: 32, storageGb: 500, count: 1 },
  { name: "redis-cache-01", os: "linux",   cpu: 2, ramGb: 8,  storageGb: 50,  count: 1 },
  { name: "dc-01",          os: "windows", cpu: 2, ramGb: 4,  storageGb: 100, count: 1 },
  { name: "app-server-01",  os: "linux",   cpu: 4, ramGb: 16, storageGb: 100, count: 1 },
]);

describe("recommendPaas — lift_and_shift", () => {
  it("returns empty list regardless of detected components", () => {
    const { components } = detectComponents(mixedSet);
    const r = recommendPaas(mixedSet, components, "azure", "lift_and_shift");
    expect(r).toEqual([]);
  });
});

describe("recommendPaas — hybrid", () => {
  it("recommends PaaS for DB + cache only; leaves AD + custom app on IaaS", () => {
    const { components } = detectComponents(mixedSet);
    const r = recommendPaas(mixedSet, components, "azure", "hybrid");
    const names = r.map((x) => x.workloadName);
    expect(names).toEqual(expect.arrayContaining(["sql-prod-01", "redis-cache-01"]));
    expect(names).not.toContain("dc-01");
    expect(names).not.toContain("app-server-01");
  });

  it("recommends Azure SQL DB for SQL Server VM", () => {
    const { components } = detectComponents(mixedSet);
    const r = recommendPaas(mixedSet, components, "azure", "hybrid");
    const sql = r.find((x) => x.workloadName === "sql-prod-01");
    expect(sql?.target).toContain("Azure SQL");
    expect(sql?.modernizable).toBe(true);
  });
});

describe("recommendPaas — modernization", () => {
  it("recommends EVERYTHING detected but flags AD + Oracle as non-modernizable", () => {
    const set = setOf([
      ...mixedSet.workloads,
      { name: "ora-prod-01", os: "linux", cpu: 16, ramGb: 64, storageGb: 1000, count: 1, notes: "Oracle Database 19c" },
    ]);
    const { components } = detectComponents(set);
    const r = recommendPaas(set, components, "azure", "modernization");
    const ora = r.find((x) => x.workloadName === "ora-prod-01");
    expect(ora?.modernizable).toBe(false);
    expect(ora?.reason.toLowerCase()).toContain("oracle");
    const ad = r.find((x) => x.workloadName === "dc-01");
    expect(ad?.modernizable).toBe(false);
  });
});

describe("recommendPaas — cross-cloud mapping", () => {
  it("maps SQL Server to RDS on AWS and Cloud SQL on GCP", () => {
    const { components } = detectComponents(setOf([
      { name: "mssql-prod", os: "windows", cpu: 8, ramGb: 32, storageGb: 500, count: 1 },
    ]));
    const aws = recommendPaas(mixedSet, components, "aws", "hybrid")[0];
    const gcp = recommendPaas(mixedSet, components, "gcp", "hybrid")[0];
    expect(aws?.target).toContain("RDS for SQL Server");
    expect(gcp?.target).toContain("Cloud SQL for SQL Server");
  });
});
