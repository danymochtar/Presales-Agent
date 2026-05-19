// GCP Compute Engine live pricing via Cloud Billing Catalog API.
// Endpoint:  https://cloudbilling.googleapis.com/v1/services/{serviceId}/skus
// Service IDs:
//   Compute Engine:   "6F81-5844-456A"
//   Cloud Storage:    "95FF-2EF5-5EA1"
//   Cloud SQL:        "9662-B51E-5089"
//
// Auth: requires an API key (any Google Cloud project can mint one for free).
// Read this key from tenant.integrations.gcp.apiKey — falls back to the
// process env `GCP_BILLING_API_KEY` for ops convenience.
//
// Each SKU response includes a `pricingInfo[]` array; for VM SKUs the
// relevant fields are:
//   - description: "N2 Predefined Instance Core running in Singapore"
//   - serviceRegions: ["asia-southeast1"]
//   - pricingInfo[0].pricingExpression.tieredRates[0].unitPrice
//     ({ currencyCode: "USD", units: "0", nanos: 31611000 })
// We do the per-hour math by multiplying the per-vCPU and per-RAM-GB
// tiered rates by the instance's vCPU + RAM (the catalog doesn't price
// preconfigured instance types directly — N1 / N2 / E2 are billed by
// component vCPU + RAM).

import type { ComputeQuoteResult, OsType, Term } from "./types";

const CATALOG_BASE = "https://cloudbilling.googleapis.com/v1/services";
const COMPUTE_ENGINE_SERVICE_ID = "6F81-5844-456A";

// Map our internal instance-family slug → catalog component descriptors.
type FamilySpec = {
  vcpuMatch: RegExp;
  ramMatch: RegExp;
};

// SKUs are described by free-text strings. These regexes pick the right
// vCPU-hour and RAM-GB-hour line for the chosen family.
const FAMILIES: Record<string, FamilySpec> = {
  "n2-standard": {
    vcpuMatch: /\bN2 Instance Core running\b/i,
    ramMatch:  /\bN2 Instance Ram running\b/i,
  },
  "n2-highmem": {
    vcpuMatch: /\bN2 Instance Core running\b/i,
    ramMatch:  /\bN2 Instance Ram running\b/i,
  },
  "n2-highcpu": {
    vcpuMatch: /\bN2 Instance Core running\b/i,
    ramMatch:  /\bN2 Instance Ram running\b/i,
  },
  "e2-standard": {
    vcpuMatch: /\bE2 Instance Core running\b/i,
    ramMatch:  /\bE2 Instance Ram running\b/i,
  },
};

// vCPU + RAM map per instance type. Reflects the GCP machine type catalog.
const INSTANCE_SHAPES: Record<string, { vcpu: number; ramGb: number; family: string }> = {
  "n2-standard-2":  { vcpu: 2,  ramGb: 8,   family: "n2-standard" },
  "n2-standard-4":  { vcpu: 4,  ramGb: 16,  family: "n2-standard" },
  "n2-standard-8":  { vcpu: 8,  ramGb: 32,  family: "n2-standard" },
  "n2-standard-16": { vcpu: 16, ramGb: 64,  family: "n2-standard" },
  "n2-standard-32": { vcpu: 32, ramGb: 128, family: "n2-standard" },
  "n2-standard-48": { vcpu: 48, ramGb: 192, family: "n2-standard" },
  "n2-standard-64": { vcpu: 64, ramGb: 256, family: "n2-standard" },
  "n2-highmem-2":   { vcpu: 2,  ramGb: 16,  family: "n2-highmem" },
  "n2-highmem-4":   { vcpu: 4,  ramGb: 32,  family: "n2-highmem" },
  "n2-highmem-8":   { vcpu: 8,  ramGb: 64,  family: "n2-highmem" },
  "n2-highmem-16":  { vcpu: 16, ramGb: 128, family: "n2-highmem" },
  "n2-highmem-32":  { vcpu: 32, ramGb: 256, family: "n2-highmem" },
  "n2-highmem-48":  { vcpu: 48, ramGb: 384, family: "n2-highmem" },
  "e2-standard-2":  { vcpu: 2,  ramGb: 8,   family: "e2-standard" },
  "e2-standard-4":  { vcpu: 4,  ramGb: 16,  family: "e2-standard" },
  "e2-standard-8":  { vcpu: 8,  ramGb: 32,  family: "e2-standard" },
  "e2-standard-16": { vcpu: 16, ramGb: 64,  family: "e2-standard" },
};

type CatalogSku = {
  name: string;
  skuId: string;
  description: string;
  category: { resourceFamily: string; resourceGroup: string; usageType: string };
  serviceRegions: string[];
  pricingInfo: Array<{
    pricingExpression: {
      tieredRates: Array<{
        startUsageAmount: number;
        unitPrice: { currencyCode: string; units: string; nanos: number };
      }>;
      usageUnit: string;
    };
  }>;
};

type CatalogResponse = { skus: CatalogSku[]; nextPageToken?: string };

// 24h in-memory cache keyed by region. Same caveat as aws-live: rebuilds
// on cold start; move to Vercel KV / Redis for production.
const CACHE = new Map<string, { ts: number; skus: CatalogSku[] }>();
const TTL_MS = 24 * 60 * 60 * 1000;

async function fetchAllComputeSkus(apiKey: string, region: string, timeoutMs: number): Promise<CatalogSku[]> {
  const cached = CACHE.get(region);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.skus;

  const skus: CatalogSku[] = [];
  let pageToken: string | undefined;
  const baseUrl = `${CATALOG_BASE}/${COMPUTE_ENGINE_SERVICE_ID}/skus`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    do {
      const params = new URLSearchParams({ key: apiKey, pageSize: "5000" });
      if (pageToken) params.set("pageToken", pageToken);
      const res = await fetch(`${baseUrl}?${params.toString()}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Cloud Billing Catalog ${res.status}: ${await res.text()}`);
      const body = (await res.json()) as CatalogResponse;
      // Filter inline to keep the in-memory footprint small — only SKUs that
      // serve the requested region + are OnDemand compute usage.
      for (const s of body.skus) {
        if (!s.serviceRegions.includes(region)) continue;
        if (s.category.resourceFamily !== "Compute") continue;
        if (s.category.usageType !== "OnDemand" && s.category.usageType !== "Commit1Yr" && s.category.usageType !== "Commit3Yr") continue;
        skus.push(s);
      }
      pageToken = body.nextPageToken;
    } while (pageToken);
  } finally {
    clearTimeout(timer);
  }

  CACHE.set(region, { ts: Date.now(), skus });
  return skus;
}

function nanosToUsd(units: string, nanos: number): number {
  // Cloud Billing expresses prices as `units` (integer USD) + `nanos`
  // (fractional, 1 USD = 1e9 nanos). e.g. units=0, nanos=31611000 → $0.031611.
  return Number(units) + nanos / 1e9;
}

function findHourlyComponent(skus: CatalogSku[], regex: RegExp, usageType: string): number | null {
  for (const s of skus) {
    if (s.category.usageType !== usageType) continue;
    if (!regex.test(s.description)) continue;
    const info = s.pricingInfo?.[0]?.pricingExpression;
    if (!info) continue;
    // Use the first tier's unit price (most SKUs are flat-rate; tier-0
    // covers usage from 0 → first breakpoint which is what BOM-time
    // estimates assume).
    const rate = info.tieredRates?.[0];
    if (!rate) continue;
    return nanosToUsd(rate.unitPrice.units, rate.unitPrice.nanos);
  }
  return null;
}

const USAGE_TYPE_FOR_TERM: Record<Term, "OnDemand" | "Commit1Yr" | "Commit3Yr"> = {
  "consumption": "OnDemand",
  "reserved-1y": "Commit1Yr",
  "reserved-3y": "Commit3Yr",
  // GCP doesn't have an equivalent of AWS Savings Plans; FlexCUDs are
  // hourly $/spend commitments. For BOM purposes treat them as
  // approximate of Commit1Yr / Commit3Yr.
  "savings-1y":  "Commit1Yr",
  "savings-3y":  "Commit3Yr",
};

export type GcpLivePriceArgs = {
  instanceType: string;
  region: string;          // GCP region code, e.g. asia-southeast1
  apiKey: string;
  os?: OsType;             // GCP charges OS as part of license SKUs, advisory only here
  term?: Term;
  fetchTimeoutMs?: number;
};

export async function getGcpLiveVmPrice(args: GcpLivePriceArgs): Promise<ComputeQuoteResult | null> {
  const shape = INSTANCE_SHAPES[args.instanceType];
  if (!shape) return null;
  const family = FAMILIES[shape.family];
  if (!family) return null;

  let skus: CatalogSku[];
  try {
    skus = await fetchAllComputeSkus(args.apiKey, args.region, args.fetchTimeoutMs ?? 25_000);
  } catch (err) {
    console.warn("[gcp-live] catalog fetch failed:", err);
    return null;
  }

  const usageType = USAGE_TYPE_FOR_TERM[args.term ?? "consumption"];
  const perVcpu = findHourlyComponent(skus, family.vcpuMatch, usageType);
  const perRam  = findHourlyComponent(skus, family.ramMatch, usageType);
  if (perVcpu == null || perRam == null) return null;

  const hourly = perVcpu * shape.vcpu + perRam * shape.ramGb;
  const notes: string[] = [
    "Live GCP price via Cloud Billing Catalog API (public list price).",
    "Compute Engine OS licensing (Windows Server / SLES / RHEL) is billed separately — add the per-vCPU OS premium on top of this base figure.",
  ];
  if (args.term && args.term !== "consumption") {
    notes.push(`Commitment usage type ${usageType} — equivalent of CUD ${args.term.endsWith("3y") ? "3 year" : "1 year"} flat-spend reservation.`);
  }

  return {
    found: true,
    cloud: "gcp",
    region: args.region,
    sku: args.instanceType,
    hourlyUsd: Math.round(hourly * 10000) / 10000,
    monthlyUsd: Math.round(hourly * 730 * 100) / 100,
    productName: `Compute Engine ${args.instanceType} (${shape.vcpu} vCPU, ${shape.ramGb} GB)`,
    notes,
  };
}

export async function batchGcpLiveVmPrices(
  instanceTypes: string[],
  region: string,
  apiKey: string,
  os: OsType = "linux",
  term: Term = "consumption",
): Promise<Record<string, ComputeQuoteResult | null>> {
  const unique = [...new Set(instanceTypes)];
  try {
    await fetchAllComputeSkus(apiKey, region, 30_000);
  } catch {
    return Object.fromEntries(unique.map((s) => [s, null]));
  }
  const results = await Promise.all(
    unique.map((sku) => getGcpLiveVmPrice({ instanceType: sku, region, apiKey, os, term })),
  );
  return Object.fromEntries(unique.map((s, i) => [s, results[i]]));
}

export function _resetGcpCache(): void {
  CACHE.clear();
}
