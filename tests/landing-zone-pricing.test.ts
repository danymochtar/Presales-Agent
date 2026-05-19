import { describe, it, expect } from "vitest";
import { lzMonthlyUsd, lzBaselineMonthlyUsd } from "@/lib/landing-zone/pricing";

describe("lzMonthlyUsd", () => {
  it("returns priced values for canonical Azure components", () => {
    expect(lzMonthlyUsd("azure", "Azure Firewall").monthlyUsd).toBeGreaterThan(500);
    expect(lzMonthlyUsd("azure", "Azure Bastion").monthlyUsd).toBeGreaterThan(100);
    expect(lzMonthlyUsd("azure", "App Gateway WAF v2").monthlyUsd).toBeGreaterThan(200);
  });

  it("returns priced values for AWS landing zone", () => {
    expect(lzMonthlyUsd("aws", "Transit Gateway").monthlyUsd).toBeGreaterThan(50);
    expect(lzMonthlyUsd("aws", "AWS Network Firewall").monthlyUsd).toBeGreaterThan(300);
  });

  it("returns null + note for unknown components", () => {
    const r = lzMonthlyUsd("azure", "Service That Does Not Exist");
    expect(r.monthlyUsd).toBeNull();
    expect(r.note).toMatch(/verify in the cloud's pricing calculator/i);
  });

  it("acknowledges free Azure services via 0 + note", () => {
    const r = lzMonthlyUsd("azure", "Hub VNet");
    expect(r.monthlyUsd).toBe(0);
    expect(r.note).toBeTruthy();
  });
});

describe("lzBaselineMonthlyUsd", () => {
  it("sums priced components, counts unpriced separately", () => {
    const r = lzBaselineMonthlyUsd("azure", [
      "Azure Firewall",  // priced
      "Azure Bastion",   // priced
      "Made Up Component", // unpriced
    ]);
    expect(r.pricedCount).toBe(2);
    expect(r.unpricedCount).toBe(1);
    expect(r.totalUsd).toBeGreaterThan(900);
  });

  it("returns zero totals for an empty list", () => {
    const r = lzBaselineMonthlyUsd("azure", []);
    expect(r.totalUsd).toBe(0);
    expect(r.pricedCount).toBe(0);
    expect(r.unpricedCount).toBe(0);
  });
});
