// Match a project's BOM totals + cloud targets against the funding catalog
// (programs.ts). Pure function — no side effects, easy to test.

import {
  AZURE_ACCELERATE_RULES, AZURE_FRONTIER, AWS_MAP, GCP_RAMP,
  azureAccelerateTier, type FundingProgram,
} from "./programs";
import type { CloudType } from "@/lib/pricing/types";

export type ProgramMatch = {
  program: FundingProgram;
  cloud: CloudType;
  estimatedPayoutUsd: number;
  headline: string;       // 1-line pitch suitable for the proposal section
  details: string[];      // bullets the LLM can paste verbatim
  caveats: string[];
};

export type EligibilityInput = {
  // Year-1 cloud consumption forecast in USD per cloud target.
  acrByCloud: Partial<Record<CloudType, number>>;
  market?: "A" | "B";     // payout band; default B for Malaysia/SEA
  hasModernWorkloads?: { newDatabase?: boolean; fabric?: boolean; aiFoundry?: boolean; sap?: boolean; oracle?: boolean; vmware?: boolean; dataAnalytics?: boolean };
};

export function eligiblePrograms(input: EligibilityInput): ProgramMatch[] {
  const matches: ProgramMatch[] = [];
  const market = input.market ?? "B";

  const azureAcr = input.acrByCloud.azure ?? 0;
  if (azureAcr >= 5_000) {
    const tier = azureAccelerateTier(azureAcr);
    if (tier) {
      const payout = market === "A" ? tier.payoutMktAUsd : tier.payoutMktBUsd;
      matches.push({
        program: "azure-accelerate",
        cloud: "azure",
        estimatedPayoutUsd: payout,
        headline: `Azure Accelerate FY26 Tier ${tier.tier} — partner payout USD ${payout.toLocaleString()} (Market ${market}) on ${formatAcr(azureAcr)} planned year-1 ACR`,
        details: [
          `Cloud Accelerate Factory included (zero-cost deployment assistance for 30+ Azure services)`,
          `Payout requires ${AZURE_ACCELERATE_RULES.preToPostSalesRatio} pre/post-sales engagement ratio`,
          `Hit ${AZURE_ACCELERATE_RULES.acrCommitMonth4to6Pct}% of committed ACR by month 4-6, ${AZURE_ACCELERATE_RULES.acrCommitMonth7to12Pct}% by month 7-12`,
          `Required Specialization (one of): ${AZURE_ACCELERATE_RULES.requiredSpecializations.join(" / ")}`,
        ],
        caveats: [
          `Global cap USD ${AZURE_ACCELERATE_RULES.globalCapPerPartnerOneIdUsd.toLocaleString()} per PartnerOne ID per FY`,
          "Numbers reflect public partner-program summaries — confirm exact Mkt B amounts in Partner Center > Incentives under NDA",
        ],
      });
    }

    if (input.hasModernWorkloads?.newDatabase || input.hasModernWorkloads?.fabric || input.hasModernWorkloads?.aiFoundry) {
      const eligibleList = [
        input.hasModernWorkloads.newDatabase && "new database (Azure SQL / Cosmos DB / PostgreSQL)",
        input.hasModernWorkloads.fabric && "Microsoft Fabric",
        input.hasModernWorkloads.aiFoundry && "Azure AI Foundry",
      ].filter(Boolean) as string[];
      matches.push({
        program: "azure-frontier",
        cloud: "azure",
        estimatedPayoutUsd: AZURE_FRONTIER.totalCapUsd,
        headline: `Azure Frontier Offer — up to USD ${AZURE_FRONTIER.totalCapUsd.toLocaleString()} (ECIF + ACO) for ${eligibleList.join(" / ")} deployments`,
        details: [
          `Up to USD ${AZURE_FRONTIER.ecifMaxUsd.toLocaleString()} ECIF + USD ${AZURE_FRONTIER.acoMaxUsd.toLocaleString()} ACO (${AZURE_FRONTIER.acoRoiRatio} ROI on ACO portion)`,
          `Limited-time extension on top of Azure Accelerate base payout`,
        ],
        caveats: ["Frontier Offer eligibility windows change — verify current availability with Microsoft account team"],
      });
    }
  }

  const awsArr = input.acrByCloud.aws ?? 0;
  if (awsArr >= AWS_MAP.minProjectArrUsd && awsArr <= AWS_MAP.maxProjectArrUsd) {
    const isLite = awsArr < 250_000;
    const assess = Math.round(awsArr * AWS_MAP.assessCashPctOfArr);
    const mobilize = Math.round(awsArr * AWS_MAP.mobilizeCashPctOfArr);
    matches.push({
      program: isLite ? "aws-map-lite" : "aws-map",
      cloud: "aws",
      estimatedPayoutUsd: assess + mobilize,
      headline: `AWS MAP${isLite ? " Lite" : ""} — Assess ~USD ${assess.toLocaleString()} cash + Mobilize ~USD ${mobilize.toLocaleString()} on ${formatAcr(awsArr)} projected ARR`,
      details: [
        `Three phases: ${AWS_MAP.phases.join(" → ")}`,
        `Assess: ~${(AWS_MAP.assessCashPctOfArr * 100).toFixed(0)}% of projected ARR (cash) — funded discovery + business case`,
        `Mobilize: ~${(AWS_MAP.mobilizeCashPctOfArr * 100).toFixed(0)}% of projected ARR — funded landing zone + skills + pilot migrations`,
        `Specialized variants available: ${AWS_MAP.specializedVariants.join(", ")}`,
        `Modernization bonus: ${(AWS_MAP.modernizationBonusPctOfArr * 100).toFixed(0)}% of post-migration ARR (cap USD ${AWS_MAP.modernizationBonusCapUsd.toLocaleString()}) when post-migration ARR ≥ USD 500,000`,
      ],
      caveats: [
        `Maximum partner funding USD ${AWS_MAP.maxPartnerFundingUsd.toLocaleString()} (post-July 2024 redesign)`,
        "Submit via Partner Central; APN MAP eligibility checks apply",
      ],
    });
  }

  const gcpArr = input.acrByCloud.gcp ?? 0;
  if (gcpArr >= 50_000) {
    const baseline = Math.min(gcpArr * GCP_RAMP.baselinePctOfArr, GCP_RAMP.perWorkloadCapUsd);
    const advancedHit = !!(input.hasModernWorkloads?.sap || input.hasModernWorkloads?.oracle || input.hasModernWorkloads?.vmware || input.hasModernWorkloads?.dataAnalytics);
    const uplift = advancedHit ? baseline * GCP_RAMP.advancedWorkloadUpliftPct : 0;
    matches.push({
      program: "gcp-ramp",
      cloud: "gcp",
      estimatedPayoutUsd: Math.round(baseline + uplift),
      headline: `Google Cloud RaMP — service funds ~USD ${Math.round(baseline + uplift).toLocaleString()} on ${formatAcr(gcpArr)} projected ARR${advancedHit ? " (advanced-workload uplift applied)" : ""}`,
      details: [
        `Baseline: ${(GCP_RAMP.baselinePctOfArr * 100).toFixed(0)}% of projected ARR, capped at USD ${GCP_RAMP.perWorkloadCapUsd.toLocaleString()} per workload`,
        `Funding streams: ${GCP_RAMP.fundingStreams.join(" + ")}`,
        advancedHit
          ? `Advanced workloads detected (${GCP_RAMP.advancedWorkloads.filter((w) => isAdvancedHit(w, input)).join(", ")}) — ${(GCP_RAMP.advancedWorkloadUpliftPct * 100).toFixed(0)}% uplift on baseline`
          : `Advanced-workload uplifts available for: ${GCP_RAMP.advancedWorkloads.join(", ")}`,
      ],
      caveats: [
        "Outcome-based via workload tagging in GCP Partner Sales Console",
        "Numbers reflect Jan 2026 relaunch terms — refresh quarterly",
      ],
    });
  }

  return matches.sort((a, b) => b.estimatedPayoutUsd - a.estimatedPayoutUsd);
}

function isAdvancedHit(workload: string, input: EligibilityInput): boolean {
  const m = input.hasModernWorkloads ?? {};
  switch (workload) {
    case "SAP":            return !!m.sap;
    case "Oracle":         return !!m.oracle;
    case "VMware":         return !!m.vmware;
    case "Data Analytics": return !!m.dataAnalytics;
    default:               return false;
  }
}

function formatAcr(usd: number): string {
  return usd >= 1_000_000 ? `USD ${(usd / 1_000_000).toFixed(1)}M` : `USD ${(usd / 1_000).toFixed(0)}K`;
}

export function topMatchSummary(matches: ProgramMatch[]): string {
  if (matches.length === 0) return "No funded program matches at current ACR estimates";
  const top = matches[0];
  return `${top.headline.split(" — ")[0]} ~USD ${top.estimatedPayoutUsd.toLocaleString()}`;
}
