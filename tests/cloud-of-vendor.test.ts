import { describe, it, expect } from "vitest";
import { cloudOfVendor } from "@/lib/business/cloud-of-vendor";

describe("cloudOfVendor", () => {
  it("matches Microsoft / Azure variants", () => {
    expect(cloudOfVendor("Microsoft")).toBe("azure");
    expect(cloudOfVendor("Azure")).toBe("azure");
    expect(cloudOfVendor("MSFT")).toBe("azure");
  });

  it("matches AWS variants", () => {
    expect(cloudOfVendor("AWS")).toBe("aws");
    expect(cloudOfVendor("Amazon Web Services")).toBe("aws");
    expect(cloudOfVendor("Amazon-Web-Services")).toBe("aws");
  });

  it("matches GCP variants", () => {
    expect(cloudOfVendor("Google Cloud")).toBe("gcp");
    expect(cloudOfVendor("GCP")).toBe("gcp");
    expect(cloudOfVendor("G-Cloud")).toBe("gcp");
  });

  it("matches services / MSP variants", () => {
    expect(cloudOfVendor("Noventiq Managed Services")).toBe("services");
    expect(cloudOfVendor("Professional Services")).toBe("services");
    expect(cloudOfVendor("Managed services")).toBe("services");
  });

  it("matches cross-cloud / multi-cloud", () => {
    expect(cloudOfVendor("Multi-cloud")).toBe("cross_cloud");
    expect(cloudOfVendor("Cross-cloud")).toBe("cross_cloud");
    expect(cloudOfVendor("Hybrid")).toBe("cross_cloud");
  });

  it("returns unknown for nulls and unmatched", () => {
    expect(cloudOfVendor(null)).toBe("unknown");
    expect(cloudOfVendor(undefined)).toBe("unknown");
    expect(cloudOfVendor("")).toBe("unknown");
    expect(cloudOfVendor("VMware Cloud Foundation")).toBe("unknown");
  });
});
