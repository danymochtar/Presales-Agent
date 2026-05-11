import { describe, it, expect } from "vitest";
import { eligiblePrograms, topMatchSummary } from "@/lib/funding/eligibility";

describe("eligiblePrograms — Azure Accelerate tier matching", () => {
  it("returns Tier M with $28K Mkt B payout for $200K Azure ACR", () => {
    const m = eligiblePrograms({ acrByCloud: { azure: 200_000 }, market: "B" });
    const accel = m.find((x) => x.program === "azure-accelerate");
    expect(accel).toBeDefined();
    expect(accel!.estimatedPayoutUsd).toBe(28_000);
    expect(accel!.headline).toContain("Tier M");
  });

  it("uses Mkt A payout when market = A", () => {
    const m = eligiblePrograms({ acrByCloud: { azure: 200_000 }, market: "A" });
    const accel = m.find((x) => x.program === "azure-accelerate");
    expect(accel!.estimatedPayoutUsd).toBe(35_000);
  });

  it("returns no Azure Accelerate match below the $5K floor", () => {
    const m = eligiblePrograms({ acrByCloud: { azure: 4_000 } });
    expect(m.find((x) => x.program === "azure-accelerate")).toBeUndefined();
  });

  it("attaches Azure Frontier Offer when AI Foundry workload present", () => {
    const m = eligiblePrograms({
      acrByCloud: { azure: 100_000 },
      hasModernWorkloads: { aiFoundry: true },
    });
    const frontier = m.find((x) => x.program === "azure-frontier");
    expect(frontier).toBeDefined();
    expect(frontier!.headline).toContain("Azure AI Foundry");
  });
});

describe("eligiblePrograms — AWS MAP", () => {
  it("returns MAP Lite headline below $250K ARR", () => {
    const m = eligiblePrograms({ acrByCloud: { aws: 150_000 } });
    const map = m.find((x) => x.program === "aws-map-lite");
    expect(map).toBeDefined();
    // 5% Assess + 20% Mobilize = 25% of $150K = $37,500
    expect(map!.estimatedPayoutUsd).toBe(37_500);
  });

  it("returns full MAP at $400K ARR", () => {
    const m = eligiblePrograms({ acrByCloud: { aws: 400_000 } });
    const map = m.find((x) => x.program === "aws-map");
    expect(map).toBeDefined();
    expect(map!.headline).toMatch(/AWS MAP/);
  });

  it("excludes MAP below the $100K floor", () => {
    const m = eligiblePrograms({ acrByCloud: { aws: 80_000 } });
    expect(m.find((x) => x.program?.startsWith("aws-map"))).toBeUndefined();
  });
});

describe("eligiblePrograms — GCP RaMP", () => {
  it("applies advanced-workload uplift when SAP present", () => {
    const baseOnly = eligiblePrograms({ acrByCloud: { gcp: 500_000 } }).find((x) => x.program === "gcp-ramp")!;
    const withSap = eligiblePrograms({ acrByCloud: { gcp: 500_000 }, hasModernWorkloads: { sap: true } }).find((x) => x.program === "gcp-ramp")!;
    expect(withSap.estimatedPayoutUsd).toBeGreaterThan(baseOnly.estimatedPayoutUsd);
  });
});

describe("eligiblePrograms — multi-cloud sort + summary", () => {
  it("sorts by estimated payout desc", () => {
    const m = eligiblePrograms({ acrByCloud: { azure: 200_000, aws: 400_000 } });
    expect(m[0].estimatedPayoutUsd).toBeGreaterThanOrEqual(m[1].estimatedPayoutUsd);
  });

  it("topMatchSummary returns a one-line digest", () => {
    const m = eligiblePrograms({ acrByCloud: { azure: 300_000 } });
    expect(topMatchSummary(m)).toContain("Azure Accelerate");
  });
});
