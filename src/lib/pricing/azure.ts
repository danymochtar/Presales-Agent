// Azure Retail Prices API client (TS port of mcp-servers/pricing/server.py).
// Native USD. Cache hits via Map keyed by OData filter (in-memory; fine for
// serverless cold-warm window). For longer-lived cache, swap to Vercel KV.

const API_BASE = "https://prices.azure.com/api/retail/prices";

type PriceItem = {
  currencyCode: string;
  retailPrice: number;
  unitPrice: number;
  armRegionName: string;
  armSkuName: string;
  skuName: string;
  productName: string;
  serviceName: string;
  serviceFamily: string;
  unitOfMeasure: string;
  type: string; // "Consumption" | "Reservation" | "DevTestConsumption"
  reservationTerm?: string; // "1 Year" | "3 Years"
  effectiveStartDate?: string;
  meterName?: string;
};

const CACHE = new Map<string, { ts: number; items: PriceItem[] }>();
const TTL_MS = 24 * 60 * 60 * 1000;

async function fetchAll(odataFilter: string, currency = "USD", maxPages = 5): Promise<PriceItem[]> {
  const cacheKey = `${odataFilter}|${currency}`;
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.items;

  const items: PriceItem[] = [];
  const params = new URLSearchParams({
    "$filter": odataFilter,
    "currencyCode": currency,
    "api-version": "2023-01-01-preview",
  });
  let url: string | null = `${API_BASE}?${params.toString()}`;
  let page = 0;

  while (url && page < maxPages) {
    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) throw new Error(`Azure pricing API ${resp.status}: ${await resp.text()}`);
    const body = (await resp.json()) as { Items: PriceItem[]; NextPageLink?: string | null };
    items.push(...(body.Items ?? []));
    url = body.NextPageLink ?? null;
    page++;
  }

  CACHE.set(cacheKey, { ts: Date.now(), items });
  return items;
}

import type { Term } from "./types";

export type VmPriceResult = {
  sku: string;
  region: string;
  osType: "linux" | "windows";
  term: Term;
  found: boolean;
  hourlyUsd?: number;
  monthlyUsd?: number;
  productName?: string;
  unitOfMeasure?: string;
  effectiveFrom?: string;
  fallbackRegionUsed?: string;
  message?: string;
  notes?: string[];
};

export async function getVmPrice(
  armSkuName: string,
  region: string,
  osType: "linux" | "windows" = "linux",
  term: Term = "consumption",
): Promise<VmPriceResult> {
  // Azure Savings Plan rates aren't returned by the Retail Prices API; we
  // price them as a small uplift over the equivalent RI (Compute SP gives
  // most of RI's discount with VM-family flexibility — typical effective
  // uplift ~3-5%).
  const isSavings = term === "savings-1y" || term === "savings-3y";
  const apiTerm: "consumption" | "reserved-1y" | "reserved-3y" =
    term === "consumption" ? "consumption"
    : term === "reserved-1y" || term === "savings-1y" ? "reserved-1y"
    : "reserved-3y";

  const baseFilter = [
    "serviceName eq 'Virtual Machines'",
    `armSkuName eq '${armSkuName}'`,
    `armRegionName eq '${region}'`,
    apiTerm === "consumption" ? "priceType eq 'Consumption'" : "priceType eq 'Reservation'",
  ].join(" and ");

  let items = await fetchAll(baseFilter);
  let usedRegion = region;

  if (items.length === 0 && (region === "malaysiawest" || region === "malaysiacentral")) {
    // Fallback to Southeast Asia for SKUs not yet in Malaysia.
    usedRegion = "southeastasia";
    const fallbackFilter = baseFilter.replace(
      `armRegionName eq '${region}'`,
      `armRegionName eq '${usedRegion}'`,
    );
    items = await fetchAll(fallbackFilter);
  }

  const filtered = items.filter((it) => {
    const product = (it.productName ?? "").toLowerCase();
    const sku = (it.skuName ?? "").toLowerCase();
    const isWindows = product.includes("windows") || sku.includes("windows");
    if (osType === "linux" && isWindows) return false;
    if (osType === "windows" && !isWindows) return false;
    if (sku.includes("low priority") || sku.includes("spot")) return false;
    if (apiTerm === "reserved-1y" && it.reservationTerm !== "1 Year") return false;
    if (apiTerm === "reserved-3y" && it.reservationTerm !== "3 Years") return false;
    return true;
  });

  if (filtered.length === 0) {
    return {
      sku: armSkuName,
      region,
      osType,
      term,
      found: false,
      message: "no matching price found in Malaysia or SEA fallback",
    };
  }

  const best = filtered.reduce((a, b) => (a.retailPrice < b.retailPrice ? a : b));
  // Reservations report total upfront; convert to effective hourly when needed.
  const isReservation = apiTerm !== "consumption";
  const totalHours = apiTerm === "reserved-1y" ? 365 * 24 : apiTerm === "reserved-3y" ? 3 * 365 * 24 : 0;
  const baseHourly = isReservation && totalHours > 0
    ? best.retailPrice / totalHours
    : best.retailPrice;
  const finalHourly = isSavings ? baseHourly * 1.04 : baseHourly;
  const notes: string[] = [];
  if (isSavings) notes.push("Azure Compute Savings Plan estimate — verify in Azure Cost Management / pricing calculator");

  return {
    sku: armSkuName,
    region,
    osType,
    term,
    found: true,
    hourlyUsd: finalHourly,
    monthlyUsd: Math.round(finalHourly * 730 * 100) / 100,
    productName: best.productName,
    unitOfMeasure: best.unitOfMeasure,
    effectiveFrom: best.effectiveStartDate,
    fallbackRegionUsed: usedRegion !== region ? usedRegion : undefined,
    notes: notes.length ? notes : undefined,
  };
}

export async function batchVmPrices(
  skus: string[],
  region: string,
  osType: "linux" | "windows" = "linux",
  term: Term = "consumption",
): Promise<Record<string, VmPriceResult>> {
  const unique = [...new Set(skus)];
  const results = await Promise.all(unique.map((s) => getVmPrice(s, region, osType, term)));
  return Object.fromEntries(unique.map((s, i) => [s, results[i]]));
}

export type DiskPriceResult = {
  sku: string;
  region: string;
  found: boolean;
  monthlyUsd?: number;
  productName?: string;
  unitOfMeasure?: string;
};

export async function getManagedDiskPrice(sku: string, region: string): Promise<DiskPriceResult> {
  const filter = [
    "serviceName eq 'Storage'",
    `armRegionName eq '${region}'`,
    `contains(skuName, '${sku}')`,
    "priceType eq 'Consumption'",
  ].join(" and ");
  const items = await fetchAll(filter);
  const disks = items.filter(
    (it) =>
      (it.productName ?? "").toLowerCase().includes("disk") ||
      (it.meterName ?? "").toLowerCase().includes("disk"),
  );
  if (disks.length === 0) return { sku, region, found: false };
  const best = disks.reduce((a, b) => (a.retailPrice < b.retailPrice ? a : b));
  return {
    sku,
    region,
    found: true,
    monthlyUsd: best.retailPrice,
    productName: best.productName,
    unitOfMeasure: best.unitOfMeasure,
  };
}
