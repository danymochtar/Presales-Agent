// AWS pricing — hardcoded reference table approach (Option C from the
// multi-cloud design).
//
// Refresh quarterly against AWS public pricing pages.
// Source: https://aws.amazon.com/ec2/pricing/on-demand/
// Last refreshed: 2025-01
//
// Base prices in USD/hour for ap-southeast-1 (Singapore). Other SEA regions
// derived via multipliers that match AWS's typical regional spread.
//
// Accuracy expectation: ±5% vs AWS Calculator for SGP, ±10% for new regions.
// Always verify against AWS Pricing Calculator before sending a customer-facing BOM.

import type { ComputeQuoteResult, OsType, StorageQuote, Term } from "./types";

type RegionInfo = { multiplier: number; available: boolean; label: string; note?: string };

const REGIONS: Record<string, RegionInfo> = {
  "ap-southeast-1": { multiplier: 1.0, available: true, label: "Singapore" },
  "ap-southeast-3": { multiplier: 1.07, available: true, label: "Jakarta", note: "~7% premium over SGP (Jakarta region)" },
  "ap-southeast-5": { multiplier: 1.12, available: true, label: "Malaysia", note: "~12% premium (new region; prices stabilizing — verify before sending)" },
  "ap-southeast-2": { multiplier: 1.05, available: true, label: "Sydney" },
  "us-east-1":      { multiplier: 0.85, available: true, label: "N. Virginia" },
};

type EC2Row = {
  sku: string;
  vcpu: number;
  ramGb: number;
  family: "general" | "compute" | "memory" | "burstable";
  linuxHourly: number;
  windowsHourly: number;
  ri1yLinuxHourly: number;
  ri3yLinuxHourly: number;
};

// USD/hour base prices @ ap-southeast-1 (Singapore), on-demand.
// RI prices are 1y/3y all-upfront effective hourly.
const EC2: EC2Row[] = [
  // m5 — general purpose
  { sku: "m5.large",     vcpu: 2,  ramGb: 8,   family: "general",   linuxHourly: 0.111, windowsHourly: 0.214, ri1yLinuxHourly: 0.069, ri3yLinuxHourly: 0.046 },
  { sku: "m5.xlarge",    vcpu: 4,  ramGb: 16,  family: "general",   linuxHourly: 0.222, windowsHourly: 0.428, ri1yLinuxHourly: 0.139, ri3yLinuxHourly: 0.092 },
  { sku: "m5.2xlarge",   vcpu: 8,  ramGb: 32,  family: "general",   linuxHourly: 0.444, windowsHourly: 0.856, ri1yLinuxHourly: 0.278, ri3yLinuxHourly: 0.184 },
  { sku: "m5.4xlarge",   vcpu: 16, ramGb: 64,  family: "general",   linuxHourly: 0.888, windowsHourly: 1.712, ri1yLinuxHourly: 0.555, ri3yLinuxHourly: 0.367 },
  { sku: "m5.8xlarge",   vcpu: 32, ramGb: 128, family: "general",   linuxHourly: 1.776, windowsHourly: 3.424, ri1yLinuxHourly: 1.110, ri3yLinuxHourly: 0.734 },
  { sku: "m5.12xlarge",  vcpu: 48, ramGb: 192, family: "general",   linuxHourly: 2.664, windowsHourly: 5.136, ri1yLinuxHourly: 1.665, ri3yLinuxHourly: 1.101 },
  { sku: "m5.16xlarge",  vcpu: 64, ramGb: 256, family: "general",   linuxHourly: 3.552, windowsHourly: 6.848, ri1yLinuxHourly: 2.220, ri3yLinuxHourly: 1.468 },
  { sku: "m5.24xlarge",  vcpu: 96, ramGb: 384, family: "general",   linuxHourly: 5.328, windowsHourly: 10.272, ri1yLinuxHourly: 3.330, ri3yLinuxHourly: 2.202 },
  // c5 — compute optimized
  { sku: "c5.large",     vcpu: 2,  ramGb: 4,   family: "compute",   linuxHourly: 0.097, windowsHourly: 0.200, ri1yLinuxHourly: 0.061, ri3yLinuxHourly: 0.040 },
  { sku: "c5.xlarge",    vcpu: 4,  ramGb: 8,   family: "compute",   linuxHourly: 0.194, windowsHourly: 0.400, ri1yLinuxHourly: 0.122, ri3yLinuxHourly: 0.080 },
  { sku: "c5.2xlarge",   vcpu: 8,  ramGb: 16,  family: "compute",   linuxHourly: 0.388, windowsHourly: 0.800, ri1yLinuxHourly: 0.244, ri3yLinuxHourly: 0.160 },
  { sku: "c5.4xlarge",   vcpu: 16, ramGb: 32,  family: "compute",   linuxHourly: 0.776, windowsHourly: 1.600, ri1yLinuxHourly: 0.488, ri3yLinuxHourly: 0.320 },
  { sku: "c5.9xlarge",   vcpu: 36, ramGb: 72,  family: "compute",   linuxHourly: 1.746, windowsHourly: 3.600, ri1yLinuxHourly: 1.098, ri3yLinuxHourly: 0.720 },
  { sku: "c5.18xlarge",  vcpu: 72, ramGb: 144, family: "compute",   linuxHourly: 3.492, windowsHourly: 7.200, ri1yLinuxHourly: 2.196, ri3yLinuxHourly: 1.440 },
  // r5 — memory optimized
  { sku: "r5.large",     vcpu: 2,  ramGb: 16,  family: "memory",    linuxHourly: 0.146, windowsHourly: 0.249, ri1yLinuxHourly: 0.092, ri3yLinuxHourly: 0.060 },
  { sku: "r5.xlarge",    vcpu: 4,  ramGb: 32,  family: "memory",    linuxHourly: 0.292, windowsHourly: 0.498, ri1yLinuxHourly: 0.183, ri3yLinuxHourly: 0.121 },
  { sku: "r5.2xlarge",   vcpu: 8,  ramGb: 64,  family: "memory",    linuxHourly: 0.584, windowsHourly: 0.996, ri1yLinuxHourly: 0.367, ri3yLinuxHourly: 0.241 },
  { sku: "r5.4xlarge",   vcpu: 16, ramGb: 128, family: "memory",    linuxHourly: 1.168, windowsHourly: 1.992, ri1yLinuxHourly: 0.733, ri3yLinuxHourly: 0.483 },
  { sku: "r5.8xlarge",   vcpu: 32, ramGb: 256, family: "memory",    linuxHourly: 2.336, windowsHourly: 3.984, ri1yLinuxHourly: 1.466, ri3yLinuxHourly: 0.965 },
  { sku: "r5.12xlarge",  vcpu: 48, ramGb: 384, family: "memory",    linuxHourly: 3.504, windowsHourly: 5.976, ri1yLinuxHourly: 2.198, ri3yLinuxHourly: 1.448 },
  { sku: "r5.16xlarge",  vcpu: 64, ramGb: 512, family: "memory",    linuxHourly: 4.672, windowsHourly: 7.968, ri1yLinuxHourly: 2.932, ri3yLinuxHourly: 1.930 },
  // t3 — burstable
  { sku: "t3.small",     vcpu: 2,  ramGb: 2,   family: "burstable", linuxHourly: 0.024, windowsHourly: 0.052, ri1yLinuxHourly: 0.015, ri3yLinuxHourly: 0.010 },
  { sku: "t3.medium",    vcpu: 2,  ramGb: 4,   family: "burstable", linuxHourly: 0.048, windowsHourly: 0.104, ri1yLinuxHourly: 0.030, ri3yLinuxHourly: 0.020 },
  { sku: "t3.large",     vcpu: 2,  ramGb: 8,   family: "burstable", linuxHourly: 0.096, windowsHourly: 0.208, ri1yLinuxHourly: 0.060, ri3yLinuxHourly: 0.040 },
  { sku: "t3.xlarge",    vcpu: 4,  ramGb: 16,  family: "burstable", linuxHourly: 0.192, windowsHourly: 0.416, ri1yLinuxHourly: 0.120, ri3yLinuxHourly: 0.079 },
  { sku: "t3.2xlarge",   vcpu: 8,  ramGb: 32,  family: "burstable", linuxHourly: 0.384, windowsHourly: 0.832, ri1yLinuxHourly: 0.240, ri3yLinuxHourly: 0.158 },
];

// EBS pricing per GB-month at SGP base. Apply regional multiplier.
const EBS: Record<string, number> = {
  gp3: 0.0928,
  gp2: 0.12,
  io1: 0.146,
  st1: 0.054,
  sc1: 0.0309,
};

export function listAwsRegions() {
  const primary: Record<string, string> = {};
  const dr: Record<string, string> = {};
  for (const [code, info] of Object.entries(REGIONS)) {
    if (code.startsWith("ap-southeast")) primary[code] = `${info.label}${info.note ? ` — ${info.note}` : ""}`;
    else dr[code] = info.label;
  }
  return {
    primary,
    dr_options: dr,
    notes: [
      "ap-southeast-5 (Malaysia) is new — service availability limited vs SGP",
      "ap-southeast-1 (Singapore) is the cost-optimized fallback for non-data-residency workloads",
      "Pricing based on hardcoded reference table (last refresh: 2025-01) — verify against AWS Calculator before sending",
    ],
  };
}

export function getAwsVmPrice(
  instanceType: string,
  region: string,
  os: OsType = "linux",
  term: Term = "consumption",
): ComputeQuoteResult {
  const base = EC2.find((r) => r.sku === instanceType);
  if (!base) {
    return {
      found: false,
      cloud: "aws",
      region,
      sku: instanceType,
      message: `SKU ${instanceType} not in AWS reference table (refresh src/lib/pricing/aws.ts or use closest match)`,
    };
  }
  const regionInfo = REGIONS[region];
  let usedRegion = region;
  let mult = regionInfo?.multiplier;
  const notes: string[] = [];

  if (!regionInfo) {
    usedRegion = "ap-southeast-1";
    mult = REGIONS["ap-southeast-1"].multiplier;
    notes.push(`Region ${region} not in reference table; priced from ap-southeast-1 (Singapore) as proxy`);
  } else if (regionInfo.note) {
    notes.push(regionInfo.note);
  }

  // Savings Plan rates approximated as a 4% uplift over the matching RI
  // rate (Compute SP keeps most of RI's discount with cross-family flex).
  const TERM_TABLE: Record<Exclude<Term, "consumption">, { row: "ri1yLinuxHourly" | "ri3yLinuxHourly"; uplift: number; label: string }> = {
    "reserved-1y": { row: "ri1yLinuxHourly", uplift: 1,    label: "RI 1y" },
    "reserved-3y": { row: "ri3yLinuxHourly", uplift: 1,    label: "RI 3y" },
    "savings-1y":  { row: "ri1yLinuxHourly", uplift: 1.04, label: "Compute Savings Plan 1y (approx.)" },
    "savings-3y":  { row: "ri3yLinuxHourly", uplift: 1.04, label: "Compute Savings Plan 3y (approx.)" },
  };

  const m = mult ?? 1.0;
  let hourly: number;
  if (term === "consumption") {
    hourly = (os === "linux" ? base.linuxHourly : base.windowsHourly) * m;
  } else {
    const t = TERM_TABLE[term];
    const baseRi = base[t.row] * t.uplift;
    if (os === "windows") {
      const winPremium = (base.windowsHourly - base.linuxHourly) * m;
      hourly = baseRi * m + winPremium;
      notes.push(`${t.label} shown as Linux base + Windows license premium at on-demand rate (approximation)`);
    } else {
      hourly = baseRi * m;
      if (term.startsWith("savings-")) notes.push(`${t.label} estimate — verify against AWS Cost Explorer SP estimator`);
    }
  }

  return {
    found: true,
    cloud: "aws",
    region: usedRegion,
    sku: instanceType,
    hourlyUsd: round(hourly, 4),
    monthlyUsd: round(hourly * 730, 2),
    productName: `EC2 ${instanceType} (${base.family}, ${os})`,
    notes,
    fallbackRegionUsed: usedRegion !== region ? usedRegion : undefined,
  };
}

export function batchAwsVmPrices(
  instanceTypes: string[],
  region: string,
  os: OsType = "linux",
  term: Term = "consumption",
): Record<string, ComputeQuoteResult> {
  const unique = [...new Set(instanceTypes)];
  return Object.fromEntries(unique.map((t) => [t, getAwsVmPrice(t, region, os, term)]));
}

export function getAwsEbsPrice(volumeType: string, region: string, gb: number): StorageQuote {
  const base = EBS[volumeType.toLowerCase()];
  if (base === undefined) {
    return { found: false, cloud: "aws", sku: volumeType, message: `Unknown EBS volume type ${volumeType}` };
  }
  const mult = REGIONS[region]?.multiplier ?? 1.0;
  const gbRate = base * mult;
  return {
    found: true,
    cloud: "aws",
    sku: volumeType,
    gbMonthlyUsd: round(gbRate, 4),
    totalMonthlyUsd: round(gbRate * gb, 2),
  };
}

function round(n: number, decimals: number): number {
  const m = Math.pow(10, decimals);
  return Math.round(n * m) / m;
}
