// Unified pricing facade. BOM/assessment/etc routes call these — they
// dispatch to the right cloud-specific module and normalize results.

import * as azure from "./azure";
import * as aws from "./aws";
import type { CloudType, ComputeQuoteResult, OsType, StorageQuote, Term } from "./types";

export type { CloudType, ComputeQuoteResult, OsType, StorageQuote, Term } from "./types";

function azureToUnified(r: azure.VmPriceResult): ComputeQuoteResult {
  if (!r.found) {
    return {
      found: false,
      cloud: "azure",
      region: r.region,
      sku: r.sku,
      message: r.message ?? "not found",
    };
  }
  const notes: string[] = [];
  if (r.fallbackRegionUsed) {
    notes.push(`Region fallback: SKU not available in requested region; priced from ${r.fallbackRegionUsed}`);
  }
  return {
    found: true,
    cloud: "azure",
    region: r.fallbackRegionUsed ?? r.region,
    sku: r.sku,
    hourlyUsd: r.hourlyUsd!,
    monthlyUsd: r.monthlyUsd!,
    productName: r.productName,
    fallbackRegionUsed: r.fallbackRegionUsed,
    notes: notes.length > 0 ? notes : undefined,
  };
}

export async function priceCompute(
  cloud: CloudType,
  sku: string,
  region: string,
  os: OsType,
  term: Term = "consumption",
): Promise<ComputeQuoteResult> {
  if (cloud === "azure") return azureToUnified(await azure.getVmPrice(sku, region, os, term));
  if (cloud === "aws") return aws.getAwsVmPrice(sku, region, os, term);
  throw new Error(`Cloud ${cloud} not supported (GCP deferred)`);
}

export async function batchPriceCompute(
  cloud: CloudType,
  skus: string[],
  region: string,
  os: OsType,
  term: Term = "consumption",
): Promise<Record<string, ComputeQuoteResult>> {
  if (cloud === "azure") {
    const r = await azure.batchVmPrices(skus, region, os, term);
    return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, azureToUnified(v)]));
  }
  if (cloud === "aws") return aws.batchAwsVmPrices(skus, region, os, term);
  throw new Error(`Cloud ${cloud} not supported (GCP deferred)`);
}

// Region defaults per cloud, optimized for Malaysia market
export const DEFAULT_REGIONS: Record<CloudType, { primary: string; dr: string; primaryLabel: string; drLabel: string }> = {
  azure: { primary: "Malaysia Central", dr: "Southeast Asia", primaryLabel: "Malaysia Central", drLabel: "Southeast Asia" },
  aws:   { primary: "ap-southeast-5",   dr: "ap-southeast-1", primaryLabel: "Malaysia",         drLabel: "Singapore" },
  gcp:   { primary: "asia-southeast2",  dr: "asia-southeast1", primaryLabel: "Jakarta",          drLabel: "Singapore" },
};

// Map Azure region "label" used in Project.cloudRegions JSON to ARM region
// names that the Azure pricing API expects.
const AZURE_REGION_TO_ARM: Record<string, string> = {
  "Malaysia Central": "malaysiacentral",
  "Southeast Asia": "southeastasia",
  "East Asia": "eastasia",
  "Australia East": "australiaeast",
};

export function azureLabelToArm(label: string): string {
  return AZURE_REGION_TO_ARM[label] ?? label.toLowerCase().replace(/\s+/g, "");
}
