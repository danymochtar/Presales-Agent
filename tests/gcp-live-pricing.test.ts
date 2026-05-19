import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { getGcpLiveVmPrice, batchGcpLiveVmPrices, _resetGcpCache } from "@/lib/pricing/gcp";
import type { ComputeQuoteFound, ComputeQuoteResult } from "@/lib/pricing/types";

function mustFound(r: ComputeQuoteResult | null): ComputeQuoteFound {
  expect(r).not.toBeNull();
  expect(r!.found).toBe(true);
  return r as ComputeQuoteFound;
}

// nanos: 1 USD = 1e9 nanos. 0.031611 USD = 31_611_000 nanos.
function fakeSkus() {
  return {
    skus: [
      {
        name: "services/6F81-5844-456A/skus/N2-CORE-SG",
        skuId: "N2-CORE-SG",
        description: "N2 Instance Core running in Singapore",
        category: { resourceFamily: "Compute", resourceGroup: "N2Standard", usageType: "OnDemand" },
        serviceRegions: ["asia-southeast1"],
        pricingInfo: [
          {
            pricingExpression: {
              usageUnit: "h",
              tieredRates: [
                { startUsageAmount: 0, unitPrice: { currencyCode: "USD", units: "0", nanos: 31_611_000 } },
              ],
            },
          },
        ],
      },
      {
        name: "services/6F81-5844-456A/skus/N2-RAM-SG",
        skuId: "N2-RAM-SG",
        description: "N2 Instance Ram running in Singapore",
        category: { resourceFamily: "Compute", resourceGroup: "N2Standard", usageType: "OnDemand" },
        serviceRegions: ["asia-southeast1"],
        pricingInfo: [
          {
            pricingExpression: {
              usageUnit: "h",
              tieredRates: [
                { startUsageAmount: 0, unitPrice: { currencyCode: "USD", units: "0", nanos: 4_237_000 } },
              ],
            },
          },
        ],
      },
      // 1-year commit rates (Commit1Yr) for the same components.
      {
        name: "services/6F81-5844-456A/skus/N2-CORE-SG-1Y",
        skuId: "N2-CORE-SG-1Y",
        description: "Commitment v1: N2 Instance Core running in Singapore",
        category: { resourceFamily: "Compute", resourceGroup: "N2Standard", usageType: "Commit1Yr" },
        serviceRegions: ["asia-southeast1"],
        pricingInfo: [
          {
            pricingExpression: {
              usageUnit: "h",
              tieredRates: [
                { startUsageAmount: 0, unitPrice: { currencyCode: "USD", units: "0", nanos: 19_907_000 } },
              ],
            },
          },
        ],
      },
      {
        name: "services/6F81-5844-456A/skus/N2-RAM-SG-1Y",
        skuId: "N2-RAM-SG-1Y",
        description: "Commitment v1: N2 Instance Ram running in Singapore",
        category: { resourceFamily: "Compute", resourceGroup: "N2Standard", usageType: "Commit1Yr" },
        serviceRegions: ["asia-southeast1"],
        pricingInfo: [
          {
            pricingExpression: {
              usageUnit: "h",
              tieredRates: [
                { startUsageAmount: 0, unitPrice: { currencyCode: "USD", units: "0", nanos: 2_669_000 } },
              ],
            },
          },
        ],
      },
      // A different region — should be filtered out.
      {
        name: "services/6F81-5844-456A/skus/N2-CORE-US",
        skuId: "N2-CORE-US",
        description: "N2 Instance Core running in Americas",
        category: { resourceFamily: "Compute", resourceGroup: "N2Standard", usageType: "OnDemand" },
        serviceRegions: ["us-central1"],
        pricingInfo: [
          {
            pricingExpression: {
              usageUnit: "h",
              tieredRates: [
                { startUsageAmount: 0, unitPrice: { currencyCode: "USD", units: "0", nanos: 24_000_000 } },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe("gcp-live pricing", () => {
  beforeEach(() => {
    _resetGcpCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => fakeSkus(),
        text: async () => "",
      })),
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    _resetGcpCache();
  });

  it("prices n2-standard-2 in asia-southeast1 from vCPU+RAM components", async () => {
    const r = mustFound(await getGcpLiveVmPrice({
      instanceType: "n2-standard-2",
      region: "asia-southeast1",
      apiKey: "fake",
    }));
    expect(r.cloud).toBe("gcp");
    // 2 vCPU * 0.031611 + 8 GB * 0.004237 = 0.063222 + 0.033896 = 0.097118 ≈ 0.0971
    expect(r.hourlyUsd).toBeCloseTo(0.0971, 3);
  });

  it("scales with shape — n2-standard-8 ≈ 4× the n2-standard-2 price", async () => {
    const small = mustFound(await getGcpLiveVmPrice({ instanceType: "n2-standard-2", region: "asia-southeast1", apiKey: "k" }));
    const large = mustFound(await getGcpLiveVmPrice({ instanceType: "n2-standard-8", region: "asia-southeast1", apiKey: "k" }));
    expect(large.hourlyUsd / small.hourlyUsd).toBeCloseTo(4, 1);
  });

  it("returns null for an unknown instance type", async () => {
    const r = await getGcpLiveVmPrice({ instanceType: "n2-imaginary-99", region: "asia-southeast1", apiKey: "k" });
    expect(r).toBeNull();
  });

  it("returns null for a region with no matching SKU", async () => {
    const r = await getGcpLiveVmPrice({ instanceType: "n2-standard-2", region: "asia-east1", apiKey: "k" });
    expect(r).toBeNull();
  });

  it("returns null when catalog fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, text: async () => "boom", json: async () => ({}) })));
    const r = await getGcpLiveVmPrice({ instanceType: "n2-standard-2", region: "asia-southeast1", apiKey: "k" });
    expect(r).toBeNull();
  });

  it("uses Commit1Yr SKUs for reserved-1y term", async () => {
    const r = mustFound(await getGcpLiveVmPrice({
      instanceType: "n2-standard-2",
      region: "asia-southeast1",
      apiKey: "k",
      term: "reserved-1y",
    }));
    // 2 * 0.019907 + 8 * 0.002669 = 0.039814 + 0.021352 = 0.061166 ≈ 0.0612
    expect(r.hourlyUsd).toBeCloseTo(0.0612, 3);
    expect((r.notes ?? []).join(" ")).toMatch(/Commit/);
  });

  it("batches against a single catalog fetch", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => fakeSkus(),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const map = await batchGcpLiveVmPrices(
      ["n2-standard-2", "n2-standard-4", "n2-standard-2", "n2-imaginary-99"],
      "asia-southeast1",
      "k",
    );
    expect(map["n2-standard-2"]).not.toBeNull();
    expect(map["n2-standard-4"]).not.toBeNull();
    expect(map["n2-imaginary-99"]).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
