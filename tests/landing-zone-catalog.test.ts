import { describe, it, expect } from "vitest";
import { LANDING_ZONE_CATALOG, lzForCloud } from "@/lib/landing-zone/catalog";

describe("LANDING_ZONE_CATALOG", () => {
  it("includes Azure, AWS, GCP — each non-empty", () => {
    expect(LANDING_ZONE_CATALOG.azure.length).toBeGreaterThan(5);
    expect(LANDING_ZONE_CATALOG.aws.length).toBeGreaterThan(5);
    expect(LANDING_ZONE_CATALOG.gcp.length).toBeGreaterThan(5);
  });

  it("every entry has a framework label matching cloud", () => {
    for (const c of LANDING_ZONE_CATALOG.azure) expect(c.framework).toBe("CAF");
    for (const c of LANDING_ZONE_CATALOG.aws)   expect(c.framework).toBe("WAR");
    for (const c of LANDING_ZONE_CATALOG.gcp)   expect(c.framework).toBe("Cloud Foundation");
  });
});

describe("lzForCloud", () => {
  it("returns only requiredByDefault when no components detected", () => {
    const r = lzForCloud("azure", []);
    expect(r.every((c) => c.requiredByDefault)).toBe(true);
    expect(r.some((c) => c.name === "Hub VNet")).toBe(true);
    expect(r.some((c) => c.name === "App Gateway WAF v2")).toBe(false);
  });

  it("includes web-pair components when web tier detected", () => {
    const r = lzForCloud("azure", ["web_iis"]);
    expect(r.some((c) => c.name === "App Gateway WAF v2")).toBe(true);
  });

  it("ALB+WAF surfaces on AWS when web tier present", () => {
    const r = lzForCloud("aws", ["web_nginx"]);
    expect(r.some((c) => c.name === "ALB + AWS WAF")).toBe(true);
  });

  it("Cloud Armor + Global LB surfaces on GCP when web tier present", () => {
    const r = lzForCloud("gcp", ["web_apache"]);
    expect(r.some((c) => c.name === "Cloud Armor + Global LB")).toBe(true);
  });

  it("Defender for Servers P2 surfaces when DB or web tier present", () => {
    const r = lzForCloud("azure", ["database_postgres"]);
    expect(r.some((c) => c.name === "Defender for Servers P2")).toBe(true);
  });
});
