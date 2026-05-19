import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { getAwsLiveVmPrice, batchAwsLiveVmPrices, _resetAwsLiveCache } from "@/lib/pricing/aws-live";
import type { ComputeQuoteFound, ComputeQuoteResult } from "@/lib/pricing/types";

function mustFound(r: ComputeQuoteResult | null): ComputeQuoteFound {
  expect(r).not.toBeNull();
  expect(r!.found).toBe(true);
  return r as ComputeQuoteFound;
}

// Minimal offer-file fixture matching the real Bulk API schema.
function fakeOffer() {
  return {
    formatVersion: "v1.0",
    publicationDate: "2026-01-01T00:00:00Z",
    products: {
      "SKU-M5L-SG-LINUX": {
        sku: "SKU-M5L-SG-LINUX",
        productFamily: "Compute Instance",
        attributes: {
          instanceType: "m5.large",
          location: "Asia Pacific (Singapore)",
          tenancy: "Shared",
          operatingSystem: "Linux",
          preInstalledSw: "NA",
          capacityStatus: "Used",
          licenseModel: "No License required",
        },
      },
      "SKU-M5L-SG-WINDOWS": {
        sku: "SKU-M5L-SG-WINDOWS",
        productFamily: "Compute Instance",
        attributes: {
          instanceType: "m5.large",
          location: "Asia Pacific (Singapore)",
          tenancy: "Shared",
          operatingSystem: "Windows",
          preInstalledSw: "NA",
          capacityStatus: "Used",
          licenseModel: "No License required",
        },
      },
    },
    terms: {
      OnDemand: {
        "SKU-M5L-SG-LINUX": {
          "SKU-M5L-SG-LINUX.JRTCKXETXF": {
            offerTermCode: "JRTCKXETXF",
            sku: "SKU-M5L-SG-LINUX",
            effectiveDate: "2026-01-01T00:00:00Z",
            priceDimensions: {
              dim1: {
                rateCode: "SKU-M5L-SG-LINUX.JRTCKXETXF.6YS6EN2CT7",
                description: "$0.123 per On Demand Linux m5.large Instance Hour",
                unit: "Hrs",
                pricePerUnit: { USD: "0.123" },
              },
            },
            termAttributes: {},
          },
        },
        "SKU-M5L-SG-WINDOWS": {
          "SKU-M5L-SG-WINDOWS.JRTCKXETXF": {
            offerTermCode: "JRTCKXETXF",
            sku: "SKU-M5L-SG-WINDOWS",
            effectiveDate: "2026-01-01T00:00:00Z",
            priceDimensions: {
              dim1: {
                rateCode: "SKU-M5L-SG-WINDOWS.JRTCKXETXF.6YS6EN2CT7",
                description: "$0.234 per On Demand Windows m5.large Instance Hour",
                unit: "Hrs",
                pricePerUnit: { USD: "0.234" },
              },
            },
            termAttributes: {},
          },
        },
      },
      Reserved: {
        "SKU-M5L-SG-LINUX": {
          // No-upfront 1yr standard term: hourly only, no upfront.
          "SKU-M5L-SG-LINUX.RI1Y.NU": {
            offerTermCode: "RI1Y-NU",
            sku: "SKU-M5L-SG-LINUX",
            effectiveDate: "2026-01-01T00:00:00Z",
            priceDimensions: {
              hourly: {
                rateCode: "x",
                description: "USD per hour",
                unit: "Hrs",
                pricePerUnit: { USD: "0.080" },
              },
            },
            termAttributes: { LeaseContractLength: "1yr", PurchaseOption: "No Upfront", OfferingClass: "standard" },
          },
          // 3yr all-upfront, hourly=0, upfront=2102.40 → eff hourly ≈ 0.080
          "SKU-M5L-SG-LINUX.RI3Y.AU": {
            offerTermCode: "RI3Y-AU",
            sku: "SKU-M5L-SG-LINUX",
            effectiveDate: "2026-01-01T00:00:00Z",
            priceDimensions: {
              upfront: {
                rateCode: "y",
                description: "Upfront Fee",
                unit: "Quantity",
                pricePerUnit: { USD: "2102.40" },
              },
              hourly: {
                rateCode: "z",
                description: "USD per hour",
                unit: "Hrs",
                pricePerUnit: { USD: "0" },
              },
            },
            termAttributes: { LeaseContractLength: "3yr", PurchaseOption: "All Upfront", OfferingClass: "standard" },
          },
        },
      },
    },
  };
}

describe("aws-live pricing", () => {
  beforeEach(() => {
    _resetAwsLiveCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => fakeOffer(),
      })),
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    _resetAwsLiveCache();
  });

  it("resolves on-demand Linux m5.large in Singapore", async () => {
    const r = mustFound(await getAwsLiveVmPrice({ instanceType: "m5.large", region: "ap-southeast-1", os: "linux" }));
    expect(r.cloud).toBe("aws");
    expect(r.hourlyUsd).toBeCloseTo(0.123, 4);
    expect(r.monthlyUsd).toBeCloseTo(0.123 * 730, 1);
    expect((r.notes ?? []).join(" ")).toMatch(/Live price/);
  });

  it("filters by OS — Windows resolves a distinct SKU", async () => {
    const r = mustFound(await getAwsLiveVmPrice({ instanceType: "m5.large", region: "ap-southeast-1", os: "windows" }));
    expect(r.hourlyUsd).toBeCloseTo(0.234, 4);
  });

  it("returns null for unknown region (not in REGION_TO_LOCATION map)", async () => {
    const r = await getAwsLiveVmPrice({ instanceType: "m5.large", region: "moon-base-1", os: "linux" });
    expect(r).toBeNull();
  });

  it("returns null when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    const r = await getAwsLiveVmPrice({ instanceType: "m5.large", region: "ap-southeast-1" });
    expect(r).toBeNull();
  });

  it("returns null when instance type doesn't exist in offer", async () => {
    const r = await getAwsLiveVmPrice({ instanceType: "m999.huge", region: "ap-southeast-1" });
    expect(r).toBeNull();
  });

  it("prefers No-Upfront term for reserved-1y", async () => {
    const r = mustFound(await getAwsLiveVmPrice({ instanceType: "m5.large", region: "ap-southeast-1", term: "reserved-1y" }));
    expect(r.hourlyUsd).toBeCloseTo(0.080, 4);
  });

  it("computes effective hourly for All-Upfront reserved-3y", async () => {
    const r = mustFound(await getAwsLiveVmPrice({ instanceType: "m5.large", region: "ap-southeast-1", term: "reserved-3y" }));
    // upfront 2102.40 / (8760*3) ≈ 0.080
    expect(r.hourlyUsd).toBeCloseTo(0.080, 3);
  });

  it("approximates savings-plan from RI + 4% uplift", async () => {
    const r = mustFound(await getAwsLiveVmPrice({ instanceType: "m5.large", region: "ap-southeast-1", term: "savings-1y" }));
    expect(r.hourlyUsd).toBeCloseTo(0.080 * 1.04, 3);
    expect((r.notes ?? []).join(" ")).toMatch(/Savings Plan/);
  });

  it("batches multiple lookups against a single offer fetch", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => fakeOffer(),
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const map = await batchAwsLiveVmPrices(["m5.large", "m5.large", "m999.huge"], "ap-southeast-1");
    expect(map["m5.large"]).not.toBeNull();
    expect(map["m999.huge"]).toBeNull();
    // Should fetch exactly once thanks to cache pre-warm + dedupe.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
