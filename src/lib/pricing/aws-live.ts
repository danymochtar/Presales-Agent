// Live AWS EC2 pricing via the public Price List Bulk API (no auth needed
// for public list prices). AWS publishes a per-region offer file at
//   https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/{region}/index.json
// — a single JSON document with every EC2 SKU + every term. ~30 MB
// uncompressed, ~6 MB gzipped per region.
//
// Strategy:
//   1. Fetch the per-region offer file once + cache in-memory for 24h.
//   2. On lookup, walk `products` to find the SKU whose attributes match
//      (instanceType + tenancy=Shared + operatingSystem + preInstalledSw +
//      capacityStatus=Used + location matches the region label) — yields the
//      product's SKU id.
//   3. Walk `terms.OnDemand[skuId]` / `terms.Reserved[skuId]` to pull the
//      priceDimension's pricePerUnit.USD.
//
// Falls back to the hardcoded reference table in `aws.ts` when:
//   - tenant hasn't opted into live pricing
//   - the bulk fetch fails or times out
//   - the SKU + filters don't resolve a match in the offer file
//
// Public list prices only — AWS Enterprise / Private Pricing discounts
// aren't visible here. The architect needs to apply the customer's CSP /
// EDP discount on top.

import type { ComputeQuoteResult, OsType, Term } from "./types";

type OfferProduct = {
  sku: string;
  productFamily: string;
  attributes: Record<string, string>;
};

type OfferPriceDimension = {
  rateCode: string;
  description: string;
  unit: string;
  pricePerUnit: { USD: string };
  beginRange?: string;
  endRange?: string;
};

type OfferTerm = {
  offerTermCode: string;
  sku: string;
  effectiveDate: string;
  priceDimensions: Record<string, OfferPriceDimension>;
  termAttributes: { LeaseContractLength?: string; PurchaseOption?: string; OfferingClass?: string };
};

type OfferFile = {
  formatVersion: string;
  publicationDate: string;
  products: Record<string, OfferProduct>;
  terms: {
    OnDemand: Record<string, Record<string, OfferTerm>>;
    Reserved: Record<string, Record<string, OfferTerm>>;
  };
};

// Region code → AWS location string used by the offer file's `location`
// product attribute. Source: every offer file's product attributes table.
const REGION_TO_LOCATION: Record<string, string> = {
  "us-east-1":      "US East (N. Virginia)",
  "us-east-2":      "US East (Ohio)",
  "us-west-1":      "US West (N. California)",
  "us-west-2":      "US West (Oregon)",
  "ap-southeast-1": "Asia Pacific (Singapore)",
  "ap-southeast-2": "Asia Pacific (Sydney)",
  "ap-southeast-3": "Asia Pacific (Jakarta)",
  "ap-southeast-5": "Asia Pacific (Malaysia)",
  "ap-northeast-1": "Asia Pacific (Tokyo)",
  "ap-south-1":     "Asia Pacific (Mumbai)",
  "eu-west-1":      "EU (Ireland)",
  "eu-central-1":   "EU (Frankfurt)",
};

const OS_TO_ATTR: Record<OsType, string> = { linux: "Linux", windows: "Windows" };

// In-memory cache. Process-scoped — invalidates on cold start. For
// production scale move to Redis / Vercel KV.
type CacheEntry = { ts: number; offer: OfferFile };
const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 24 * 60 * 60 * 1000;

const OFFER_BASE = "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current";

async function loadOffer(region: string, fetchTimeoutMs: number): Promise<OfferFile> {
  const cached = CACHE.get(region);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.offer;
  const url = `${OFFER_BASE}/${region}/index.json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`offer fetch ${res.status}`);
    const offer = (await res.json()) as OfferFile;
    CACHE.set(region, { ts: Date.now(), offer });
    return offer;
  } finally {
    clearTimeout(timer);
  }
}

function findProductSku(offer: OfferFile, args: {
  instanceType: string;
  location: string;
  os: OsType;
}): string | null {
  for (const [skuId, p] of Object.entries(offer.products)) {
    const a = p.attributes;
    if (p.productFamily !== "Compute Instance") continue;
    if (a.instanceType !== args.instanceType) continue;
    if (a.location !== args.location) continue;
    if (a.tenancy !== "Shared") continue;
    if (a.operatingSystem !== OS_TO_ATTR[args.os]) continue;
    if (a.preInstalledSw !== "NA") continue;
    if (a.capacityStatus !== "Used") continue;
    if (a.licenseModel === "Bring your own license") continue;
    return skuId;
  }
  return null;
}

function findOnDemandUsd(offer: OfferFile, skuId: string): number | null {
  const terms = offer.terms.OnDemand?.[skuId];
  if (!terms) return null;
  for (const term of Object.values(terms)) {
    for (const dim of Object.values(term.priceDimensions)) {
      const usd = Number(dim.pricePerUnit.USD);
      if (Number.isFinite(usd) && usd > 0) return usd;
    }
  }
  return null;
}

function findReservedHourlyUsd(
  offer: OfferFile,
  skuId: string,
  leaseYears: 1 | 3,
): number | null {
  const terms = offer.terms.Reserved?.[skuId];
  if (!terms) return null;
  const leaseStr = leaseYears === 1 ? "1yr" : "3yr";
  // Prefer No Upfront / Standard for an apples-to-apples hourly. Fall back
  // to All Upfront when No Upfront isn't available for the SKU.
  let candidate: OfferTerm | undefined;
  for (const term of Object.values(terms)) {
    const a = term.termAttributes;
    if (a.LeaseContractLength !== leaseStr) continue;
    if (a.OfferingClass && a.OfferingClass !== "standard") continue;
    if (a.PurchaseOption === "No Upfront") return termToEffectiveHourly(term, leaseYears);
    if (!candidate) candidate = term;
  }
  if (candidate) return termToEffectiveHourly(candidate, leaseYears);
  return null;
}

function termToEffectiveHourly(term: OfferTerm, leaseYears: 1 | 3): number | null {
  // Reserved terms can have multiple price dimensions: a one-time "Upfront
  // Fee" (Quantity unit) + a recurring per-hour rate. Effective hourly =
  // (upfront / (8760 × leaseYears)) + hourlyRate.
  let upfront = 0;
  let hourly = 0;
  for (const dim of Object.values(term.priceDimensions)) {
    const usd = Number(dim.pricePerUnit.USD);
    if (!Number.isFinite(usd)) continue;
    if (/quantity/i.test(dim.unit)) {
      upfront += usd;
    } else if (/hrs|hours/i.test(dim.unit)) {
      hourly += usd;
    }
  }
  const totalHours = 8760 * leaseYears;
  const eff = (upfront / totalHours) + hourly;
  return eff > 0 ? eff : null;
}

export type AwsLivePriceArgs = {
  instanceType: string;
  region: string;
  os?: OsType;
  term?: Term;
  fetchTimeoutMs?: number;
};

/**
 * Single-SKU live AWS price. Returns null when the SKU + filters didn't
 * resolve — caller should fall back to the hardcoded reference table.
 */
export async function getAwsLiveVmPrice(args: AwsLivePriceArgs): Promise<ComputeQuoteResult | null> {
  const region = args.region;
  const os = args.os ?? "linux";
  const term = args.term ?? "consumption";
  const location = REGION_TO_LOCATION[region];
  if (!location) return null; // Region not yet in our region-name map.

  let offer: OfferFile;
  try {
    offer = await loadOffer(region, args.fetchTimeoutMs ?? 25_000);
  } catch (err) {
    console.warn("[aws-live] offer fetch failed:", err);
    return null;
  }

  const skuId = findProductSku(offer, { instanceType: args.instanceType, location, os });
  if (!skuId) return null;

  let hourly: number | null = null;
  const notes: string[] = ["Live price from AWS Price List Bulk API (public list price)"];
  if (term === "consumption") {
    hourly = findOnDemandUsd(offer, skuId);
  } else if (term === "reserved-1y") {
    hourly = findReservedHourlyUsd(offer, skuId, 1);
  } else if (term === "reserved-3y") {
    hourly = findReservedHourlyUsd(offer, skuId, 3);
  } else if (term === "savings-1y") {
    const ri = findReservedHourlyUsd(offer, skuId, 1);
    hourly = ri ? ri * 1.04 : null;
    notes.push("Savings Plan estimated from RI 1y + 4% uplift — verify in AWS Cost Explorer SP simulator");
  } else if (term === "savings-3y") {
    const ri = findReservedHourlyUsd(offer, skuId, 3);
    hourly = ri ? ri * 1.04 : null;
    notes.push("Savings Plan estimated from RI 3y + 4% uplift — verify in AWS Cost Explorer SP simulator");
  }

  if (hourly == null) return null;

  return {
    found: true,
    cloud: "aws",
    region,
    sku: args.instanceType,
    hourlyUsd: Math.round(hourly * 10000) / 10000,
    monthlyUsd: Math.round(hourly * 730 * 100) / 100,
    productName: `EC2 ${args.instanceType} (${OS_TO_ATTR[os]})`,
    notes,
  };
}

/**
 * Batch-fetch live AWS prices. Loads the region offer file once + does
 * N in-memory lookups so per-SKU cost is constant time after the first.
 */
export async function batchAwsLiveVmPrices(
  instanceTypes: string[],
  region: string,
  os: OsType = "linux",
  term: Term = "consumption",
): Promise<Record<string, ComputeQuoteResult | null>> {
  const unique = [...new Set(instanceTypes)];
  // Pre-warm the cache with a single fetch.
  try {
    await loadOffer(region, 30_000);
  } catch {
    // Cache miss + fetch failure → return all nulls so callers fall back.
    return Object.fromEntries(unique.map((s) => [s, null]));
  }
  // After the offer's cached, getAwsLiveVmPrice is synchronous-fast.
  const results = await Promise.all(
    unique.map((sku) => getAwsLiveVmPrice({ instanceType: sku, region, os, term })),
  );
  return Object.fromEntries(unique.map((s, i) => [s, results[i]]));
}

// Test-only helper: drop the in-memory cache between tests.
export function _resetAwsLiveCache(): void {
  CACHE.clear();
}
