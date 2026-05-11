// License-cost optimizer: Azure Hybrid Benefit + AWS BYOL.
//
// The discount percentages here are advisory averages. Microsoft's published
// AHB calculator varies by SKU family + region; AWS License Mobility outcomes
// depend on specific contract terms. The BOM Assumptions section flags the
// numbers as advisory and points the team to vendor calculators for sign-off.
//
// Last refreshed: 2026-05. Refresh quarterly when vendor terms change.

import type { Workload, WorkloadSet } from "@/lib/inventory/workload";
import type { CloudType } from "./types";

// Average savings vs. License-Included VM cost when AHB is applied.
// Sources: Microsoft AHB calculator pages (Windows Server, SQL Server, RHEL/SLES).
const AZURE_AHB_SAVINGS = {
  windows: 0.40,         // skip Windows Server licence ≈ 40% off VM all-in
  sqlStandard: 0.55,     // SQL Server Standard BYOL on PaaS/IaaS
  sqlEnterprise: 0.30,   // SQL Server Enterprise — smaller % because base SKU costs more
  rhel: 0.25,            // RHEL/SLES BYOS savings vs Pay-As-You-Go
};

// AWS License Mobility / BYOL is more situational (Dedicated Hosts often
// required for Windows BYOL). These are conservative cap-and-floor estimates.
const AWS_BYOL_SAVINGS = {
  sqlServer: 0.45,       // SQL Server with Software Assurance via License Mobility
  rhel: 0.20,            // RHEL with cloud-access subscriptions
};

export type LicensableCounts = {
  total: number;
  windowsVms: number;
  sqlVms: number;
  rhelVms: number;
  oracleVms: number;
};

export function detectLicensableWorkloads(set: WorkloadSet): LicensableCounts {
  const counts: LicensableCounts = { total: 0, windowsVms: 0, sqlVms: 0, rhelVms: 0, oracleVms: 0 };
  for (const w of set.workloads) {
    counts.total += w.count;
    const tags = workloadTags(w);
    if (tags.windows) counts.windowsVms += w.count;
    if (tags.sql) counts.sqlVms += w.count;
    if (tags.rhel) counts.rhelVms += w.count;
    if (tags.oracle) counts.oracleVms += w.count;
  }
  return counts;
}

function workloadTags(w: Workload): { windows: boolean; sql: boolean; rhel: boolean; oracle: boolean } {
  const hint = `${w.os} ${w.name} ${w.notes ?? ""}`.toLowerCase();
  return {
    windows: w.os === "windows",
    sql: /sql\s*server|mssql/.test(hint),
    rhel: /rhel|red\s*hat|sles|suse/.test(hint),
    oracle: /oracle\s*(db|database|rac|exadata)/.test(hint),
  };
}

export type LicensingScenario = {
  cloud: CloudType;
  workloadCounts: LicensableCounts;
  // Estimated monthly USD savings from applying the optimization to the
  // priced compute baseline. Caller supplies basePAYGComputeMonthlyUsd.
  azureAhb: { applicable: boolean; estimatedMonthlySavingsUsd: number; explanation: string };
  awsByol: { applicable: boolean; estimatedMonthlySavingsUsd: number; explanation: string };
};

export function licensingScenario(
  cloud: CloudType,
  set: WorkloadSet,
  basePAYGComputeMonthlyUsd: number,
): LicensingScenario {
  const counts = detectLicensableWorkloads(set);
  const winShare = counts.total > 0 ? counts.windowsVms / counts.total : 0;
  const sqlShare = counts.total > 0 ? counts.sqlVms / counts.total : 0;
  const rhelShare = counts.total > 0 ? counts.rhelVms / counts.total : 0;

  // Azure: AHB only meaningful on Azure cloud target.
  const azureAhbSavings = cloud === "azure"
    ? basePAYGComputeMonthlyUsd * (
        winShare * AZURE_AHB_SAVINGS.windows
        + sqlShare * AZURE_AHB_SAVINGS.sqlStandard
        + rhelShare * AZURE_AHB_SAVINGS.rhel
      )
    : 0;

  // AWS: License Mobility / BYOL only meaningful on AWS cloud target.
  const awsByolSavings = cloud === "aws"
    ? basePAYGComputeMonthlyUsd * (
        sqlShare * AWS_BYOL_SAVINGS.sqlServer
        + rhelShare * AWS_BYOL_SAVINGS.rhel
      )
    : 0;

  return {
    cloud,
    workloadCounts: counts,
    azureAhb: {
      applicable: cloud === "azure" && (counts.windowsVms > 0 || counts.sqlVms > 0 || counts.rhelVms > 0),
      estimatedMonthlySavingsUsd: round(azureAhbSavings, 2),
      explanation: cloud === "azure"
        ? `Azure Hybrid Benefit on ${counts.windowsVms} Windows + ${counts.sqlVms} SQL + ${counts.rhelVms} RHEL/SLES workloads. Requires active Software Assurance / RHEL CCSP. 180-day dual-use migration window. Numbers are advisory ± 15% — confirm in Azure pricing calculator.`
        : "Azure Hybrid Benefit only applies when the target cloud is Azure.",
    },
    awsByol: {
      applicable: cloud === "aws" && (counts.sqlVms > 0 || counts.rhelVms > 0),
      estimatedMonthlySavingsUsd: round(awsByolSavings, 2),
      explanation: cloud === "aws"
        ? `AWS License Mobility on ${counts.sqlVms} SQL + ${counts.rhelVms} RHEL workloads. Windows Server BYOL typically requires Dedicated Hosts (separate cost model — flag for review). Numbers are advisory ± 20%.`
        : "AWS BYOL only applies when the target cloud is AWS.",
    },
  };
}

function round(n: number, decimals: number): number {
  const m = Math.pow(10, decimals);
  return Math.round(n * m) / m;
}
