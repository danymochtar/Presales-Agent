import { describe, it, expect } from "vitest";
import { detectLicensableWorkloads, licensingScenario } from "@/lib/pricing/licensing";
import type { WorkloadSet } from "@/lib/inventory/workload";

const fxWindowsHeavy: WorkloadSet = {
  source: "manual",
  totals: { count: 10, cpu: 40, ramGb: 160, storageGb: 2000, osMix: { windows: 7, linux: 3 } },
  workloads: [
    { name: "appsrv-prod-01", os: "windows", cpu: 4, ramGb: 16, storageGb: 200, count: 1 },
    { name: "appsrv-prod-02", os: "windows", cpu: 4, ramGb: 16, storageGb: 200, count: 1 },
    { name: "appsrv-prod-03", os: "windows", cpu: 4, ramGb: 16, storageGb: 200, count: 1 },
    { name: "appsrv-prod-04", os: "windows", cpu: 4, ramGb: 16, storageGb: 200, count: 1 },
    { name: "sql-prod-01 (SQL Server)", os: "windows", cpu: 8, ramGb: 32, storageGb: 500, count: 1 },
    { name: "sql-prod-02 (SQL Server)", os: "windows", cpu: 8, ramGb: 32, storageGb: 500, count: 1 },
    { name: "sql-prod-03 (mssql)", os: "windows", cpu: 8, ramGb: 32, storageGb: 500, count: 1 },
    { name: "rhel-app-01", os: "linux", cpu: 2, ramGb: 8, storageGb: 100, count: 1, notes: "RHEL 8" },
    { name: "ubuntu-web-01", os: "linux", cpu: 2, ramGb: 8, storageGb: 100, count: 1 },
    { name: "ubuntu-web-02", os: "linux", cpu: 2, ramGb: 8, storageGb: 100, count: 1 },
  ],
};

describe("detectLicensableWorkloads", () => {
  it("counts windows / sql / rhel correctly", () => {
    const c = detectLicensableWorkloads(fxWindowsHeavy);
    expect(c.total).toBe(10);
    expect(c.windowsVms).toBe(7);
    expect(c.sqlVms).toBe(3);
    expect(c.rhelVms).toBe(1);
    expect(c.oracleVms).toBe(0);
  });
});

describe("licensingScenario — Azure AHB", () => {
  it("produces non-zero AHB savings for Windows/SQL footprint", () => {
    const r = licensingScenario("azure", fxWindowsHeavy, 10_000);
    expect(r.azureAhb.applicable).toBe(true);
    // Windows 70% × 40% + SQL 30% × 55% + RHEL 10% × 25% = 28 + 16.5 + 2.5 = 47% × 10000
    expect(r.azureAhb.estimatedMonthlySavingsUsd).toBeCloseTo(4700, 0);
    expect(r.awsByol.applicable).toBe(false);
  });

  it("returns 0 when target cloud is not Azure", () => {
    const r = licensingScenario("aws", fxWindowsHeavy, 10_000);
    expect(r.azureAhb.applicable).toBe(false);
    expect(r.azureAhb.estimatedMonthlySavingsUsd).toBe(0);
  });
});

describe("licensingScenario — AWS BYOL", () => {
  it("produces non-zero BYOL savings for SQL/RHEL footprint on AWS", () => {
    const r = licensingScenario("aws", fxWindowsHeavy, 10_000);
    expect(r.awsByol.applicable).toBe(true);
    // SQL 30% × 45% + RHEL 10% × 20% = 13.5 + 2 = 15.5% × 10000
    expect(r.awsByol.estimatedMonthlySavingsUsd).toBeCloseTo(1550, 0);
  });
});
