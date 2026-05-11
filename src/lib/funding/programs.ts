// Hyperscaler funding program catalog. Used by funding/eligibility.ts to
// match a project's BOM totals + cloud targets against funded engagements
// (Microsoft Azure Accelerate FY26, AWS MAP, GCP RaMP).
//
// Last refreshed: 2026-05. Refresh quarterly — these terms drift.
// Numbers reflect partner-program guides + Microsoft Commerce Incentives
// summaries available at refresh time. Confirm exact MY-applicable terms
// in Partner Center / Partner Central / Partner Advantage under NDA.

export type FundingProgram = "azure-accelerate" | "azure-frontier" | "aws-map" | "aws-map-lite" | "gcp-ramp";

// ---------- Microsoft Azure Accelerate FY26 ----------
// Replaced AMM/AMMP + Azure Innovate + Cloud Accelerate Factory in July 2025.
// Tier mapped from planned year-1 ACR. Mkt B amounts apply to Singapore /
// likely Malaysia (NDA-confirmable).

export type AzureAccelerateTier = {
  tier: "XXS" | "XS" | "S" | "M" | "L";
  acrMin: number;
  acrMax: number;
  payoutMktAUsd: number;
  payoutMktBUsd: number;
};

export const AZURE_ACCELERATE_TIERS: AzureAccelerateTier[] = [
  { tier: "XXS", acrMin: 5_000,   acrMax: 15_000,  payoutMktAUsd: 2_000,  payoutMktBUsd: 2_000  },
  { tier: "XS",  acrMin: 15_000,  acrMax: 50_000,  payoutMktAUsd: 6_500,  payoutMktBUsd: 5_200  },
  { tier: "S",   acrMin: 50_000,  acrMax: 100_000, payoutMktAUsd: 15_000, payoutMktBUsd: 12_000 },
  { tier: "M",   acrMin: 100_000, acrMax: 250_000, payoutMktAUsd: 35_000, payoutMktBUsd: 28_000 },
  { tier: "L",   acrMin: 250_000, acrMax: Infinity, payoutMktAUsd: 75_000, payoutMktBUsd: 60_000 },
];

export const AZURE_ACCELERATE_RULES = {
  preToPostSalesRatio: "3:1",
  acrCommitMonth4to6Pct: 75,
  acrCommitMonth7to12Pct: 100,
  globalCapPerPartnerOneIdUsd: 3_000_000,
  cloudAccelerateFactoryIncluded: true,
  requiredSpecializations: [
    "Infrastructure & Database Migration to Azure",
    "Azure VMware Solution",
    "SAP on Microsoft Azure",
    "Analytics on Microsoft Azure",
    "Build AI Apps on Microsoft Azure",
    "Azure Expert MSP",
  ],
};

// ---------- Azure Frontier Offer (limited-time extension) ----------
// Adds up to $1M ECIF + ACO for new database, Microsoft Fabric or
// Azure AI Foundry deployments. 2:1 ROI requirement on ACO portion.

export const AZURE_FRONTIER = {
  totalCapUsd: 1_000_000,
  ecifMaxUsd: 500_000,
  acoMaxUsd: 500_000,
  acoRoiRatio: "2:1",
  eligibleWorkloads: ["new database (Azure SQL / Cosmos DB / PostgreSQL)", "Microsoft Fabric", "Azure AI Foundry"],
};

// ---------- AWS Migration Acceleration Program (MAP) ----------
// July 2024 redesign: simplified Partner Central template, MAP scaling
// to $10M ARR, MAP Lite from $100K (was $250K), partner funding to $2M.

export type MapPhase = "Assess" | "Mobilize" | "Migrate";

export const AWS_MAP = {
  minProjectArrUsd: 100_000,            // MAP Lite floor (was $250K pre-redesign)
  maxProjectArrUsd: 10_000_000,         // current MAP cap
  maxPartnerFundingUsd: 2_000_000,      // up from $460K
  assessCashPctOfArr: 0.05,             // ~5% of projected ARR
  mobilizeCashPctOfArr: 0.20,           // ~20% of projected ARR
  modernizationBonusPctOfArr: 0.10,     // post-migration $500K+ ARR → 10% capped at $100K
  modernizationBonusCapUsd: 100_000,
  specializedVariants: ["Mainframe", "Windows", "Storage", "VMware", "SAP", "Databases", "Connect"],
  phases: ["Assess", "Mobilize", "Migrate"] as MapPhase[],
};

// ---------- Google Cloud RaMP (Rapid Migration & Modernization) ----------
// Relaunched 21 Jan 2026. 20% of projected ARR baseline, $2M cap per workload.
// Advanced workloads (SAP, Oracle, VMware, Data Analytics) earn extra.

export const GCP_RAMP = {
  baselinePctOfArr: 0.20,
  perWorkloadCapUsd: 2_000_000,
  advancedWorkloads: ["SAP", "Oracle", "VMware", "Data Analytics"],
  advancedWorkloadUpliftPct: 0.10,      // typical extra above baseline; refine when Google publishes exact terms
  fundingStreams: ["Service funds (partner/PSO labor)", "Google Cloud service credits (consumption offset)"],
};

export function azureAccelerateTier(year1AcrUsd: number): AzureAccelerateTier | null {
  if (year1AcrUsd < AZURE_ACCELERATE_TIERS[0].acrMin) return null;
  return AZURE_ACCELERATE_TIERS.find((t) => year1AcrUsd >= t.acrMin && year1AcrUsd < t.acrMax) ?? null;
}
