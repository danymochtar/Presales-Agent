// Unified pricing facade. BOM/assessment/etc routes call these — they
// dispatch to the right cloud-specific module and normalize results.

import * as azure from "./azure";
import * as aws from "./aws";
import * as gcp from "./gcp";
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

/**
 * GCP API key resolver — tenant integration first, then env var.
 * Returns null when neither is set; callers fall back to "not supported".
 */
function gcpApiKey(opts?: { tenantIntegrations?: { gcp?: { apiKey?: string } } }): string | null {
  const fromTenant = opts?.tenantIntegrations?.gcp?.apiKey;
  if (fromTenant) return fromTenant;
  const fromEnv = process.env.GCP_BILLING_API_KEY;
  return fromEnv ?? null;
}

export type PriceOpts = {
  tenantIntegrations?: { gcp?: { apiKey?: string } } | null;
};

export async function priceCompute(
  cloud: CloudType,
  sku: string,
  region: string,
  os: OsType,
  term: Term = "consumption",
  opts: PriceOpts = {},
): Promise<ComputeQuoteResult> {
  if (cloud === "azure") return azureToUnified(await azure.getVmPrice(sku, region, os, term));
  if (cloud === "aws") return aws.getAwsVmPrice(sku, region, os, term);
  if (cloud === "gcp") {
    const apiKey = gcpApiKey({ tenantIntegrations: opts.tenantIntegrations ?? undefined });
    if (!apiKey) {
      return { found: false, cloud: "gcp", region, sku, message: "GCP pricing requires a Cloud Billing API key on the tenant (Settings → Integrations → GCP)" };
    }
    const r = await gcp.getGcpLiveVmPrice({ instanceType: sku, region, apiKey, os, term });
    return r ?? { found: false, cloud: "gcp", region, sku, message: `GCP catalog lookup didn't match instance ${sku} in region ${region}` };
  }
  throw new Error(`Cloud ${cloud} not supported`);
}

export async function batchPriceCompute(
  cloud: CloudType,
  skus: string[],
  region: string,
  os: OsType,
  term: Term = "consumption",
  opts: PriceOpts = {},
): Promise<Record<string, ComputeQuoteResult>> {
  if (cloud === "azure") {
    const r = await azure.batchVmPrices(skus, region, os, term);
    return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, azureToUnified(v)]));
  }
  if (cloud === "aws") return aws.batchAwsVmPrices(skus, region, os, term);
  if (cloud === "gcp") {
    const apiKey = gcpApiKey({ tenantIntegrations: opts.tenantIntegrations ?? undefined });
    if (!apiKey) {
      return Object.fromEntries(skus.map((s) => [s, { found: false, cloud: "gcp", region, sku: s, message: "GCP pricing requires a Cloud Billing API key" } as ComputeQuoteResult]));
    }
    const live = await gcp.batchGcpLiveVmPrices(skus, region, apiKey, os, term);
    const out: Record<string, ComputeQuoteResult> = {};
    for (const sku of skus) {
      out[sku] = live[sku] ?? { found: false, cloud: "gcp", region, sku, message: `GCP catalog miss for ${sku}` };
    }
    return out;
  }
  throw new Error(`Cloud ${cloud} not supported`);
}

// All-commitments fetch — five priced variants (PAYG / RI-1y / RI-3y /
// SP-1y / SP-3y) per SKU in one call. Used by the BOM route to surface a
// side-by-side commitment comparison so the architect can recommend the
// right purchase model with the right break-even math.
export type ComputeMultiTermResult = {
  sku: string;
  cloud: CloudType;
  region: string;
  os: OsType;
  byTerm: Record<Term, ComputeQuoteResult>;
};

export const ALL_TERMS: Term[] = ["consumption", "reserved-1y", "reserved-3y", "savings-1y", "savings-3y"];

export async function batchPriceComputeAllTerms(
  cloud: CloudType,
  skus: string[],
  region: string,
  os: OsType,
  opts: PriceOpts = {},
): Promise<Record<string, ComputeMultiTermResult>> {
  if (skus.length === 0) return {};
  // Run all five terms in parallel — the underlying batchPriceCompute paths
  // cache per (filter, currency) so re-hitting Azure / AWS isn't expensive.
  const tables = await Promise.all(ALL_TERMS.map((t) => batchPriceCompute(cloud, skus, region, os, t, opts)));
  const out: Record<string, ComputeMultiTermResult> = {};
  for (const sku of skus) {
    const byTerm: Record<string, ComputeQuoteResult> = {};
    ALL_TERMS.forEach((t, idx) => { byTerm[t] = tables[idx][sku]; });
    out[sku] = { sku, cloud, region, os, byTerm: byTerm as Record<Term, ComputeQuoteResult> };
  }
  return out;
}

// Region defaults per cloud, optimized for Malaysia market.
// Azure region in Malaysia is "Malaysia West" (armName malaysiawest).
export const DEFAULT_REGIONS: Record<CloudType, { primary: string; dr: string; primaryLabel: string; drLabel: string }> = {
  azure: { primary: "Malaysia West",   dr: "Southeast Asia", primaryLabel: "Malaysia West", drLabel: "Southeast Asia" },
  aws:   { primary: "ap-southeast-5",  dr: "ap-southeast-1", primaryLabel: "Malaysia",      drLabel: "Singapore" },
  gcp:   { primary: "asia-southeast2", dr: "asia-southeast1", primaryLabel: "Jakarta",      drLabel: "Singapore" },
};

// Map Azure region label used in Project.cloudRegions JSON to ARM region
// names that the Azure pricing API expects. Falls back to a `lowercase +
// strip whitespace` heuristic for regions not listed here (which matches
// Azure's naming convention for nearly all regions).
const AZURE_REGION_TO_ARM: Record<string, string> = {
  "Malaysia West":       "malaysiawest",
  "Southeast Asia":      "southeastasia",
  "East Asia":           "eastasia",
  "Indonesia Central":   "indonesiacentral",
  "Australia East":      "australiaeast",
  "Australia Southeast": "australiasoutheast",
  "Japan East":          "japaneast",
  "Japan West":          "japanwest",
  "Korea Central":       "koreacentral",
  "Korea South":         "koreasouth",
  "Central India":       "centralindia",
  "South India":         "southindia",
  "UAE North":           "uaenorth",
  "West Europe":         "westeurope",
  "North Europe":        "northeurope",
  "East US":             "eastus",
  "East US 2":           "eastus2",
  "West US 2":           "westus2",
  "West US 3":           "westus3",
  // Back-compat: pre-launch announcement name.
  "Malaysia Central":    "malaysiawest",
};

export function azureLabelToArm(label: string): string {
  return AZURE_REGION_TO_ARM[label] ?? label.toLowerCase().replace(/\s+/g, "");
}
