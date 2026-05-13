import { describe, it, expect } from "vitest";
import { LANDING_ZONE_CATALOG, lzForCloud, lzForArchetype, suggestedArchetypes } from "@/lib/landing-zone/catalog";

describe("LANDING_ZONE_CATALOG", () => {
  it("includes Azure, AWS, GCP — each non-empty", () => {
    expect(LANDING_ZONE_CATALOG.azure.length).toBeGreaterThan(5);
    expect(LANDING_ZONE_CATALOG.aws.length).toBeGreaterThan(5);
    expect(LANDING_ZONE_CATALOG.gcp.length).toBeGreaterThan(5);
  });

  it("every entry has a framework label matching cloud", () => {
    for (const c of LANDING_ZONE_CATALOG.azure) expect(c.framework).toBe("CAF");
    for (const c of LANDING_ZONE_CATALOG.aws)   expect(c.framework).toBe("LZA");
    for (const c of LANDING_ZONE_CATALOG.gcp)   expect(c.framework).toBe("Cloud Foundation");
  });

  it("every entry has an archetype label", () => {
    const validArchetypes = new Set(["infra", "platform", "data_ai"]);
    for (const cloud of ["azure", "aws", "gcp"] as const) {
      for (const c of LANDING_ZONE_CATALOG[cloud]) {
        expect(validArchetypes.has(c.archetype)).toBe(true);
      }
    }
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

  it("infra archetype includes Hub VNet on Azure", () => {
    const r = lzForArchetype("azure", "infra", []);
    expect(r.some((c) => c.name === "Hub VNet")).toBe(true);
    expect(r.every((c) => c.archetype === "infra")).toBe(true);
  });

  it("platform archetype includes AKS on Azure, EKS on AWS, GKE on GCP", () => {
    expect(lzForArchetype("azure", "platform", []).some((c) => c.name === "Azure Kubernetes Service")).toBe(true);
    expect(lzForArchetype("aws",   "platform", []).some((c) => c.name === "Amazon EKS")).toBe(true);
    expect(lzForArchetype("gcp",   "platform", []).some((c) => c.name === "Google Kubernetes Engine")).toBe(true);
  });

  it("data_ai archetype includes Fabric on Azure, SageMaker on AWS, Vertex AI on GCP", () => {
    expect(lzForArchetype("azure", "data_ai", []).some((c) => c.name === "Microsoft Fabric + OneLake")).toBe(true);
    expect(lzForArchetype("aws",   "data_ai", []).some((c) => c.name === "Amazon SageMaker")).toBe(true);
    expect(lzForArchetype("gcp",   "data_ai", []).some((c) => c.name === "Vertex AI")).toBe(true);
  });
});

describe("suggestedArchetypes", () => {
  it("always returns infra", () => {
    expect(suggestedArchetypes({ solutionArea: null, migrationStrategy: null })).toContain("infra");
  });

  it("adds platform for modernization solution area", () => {
    expect(suggestedArchetypes({ solutionArea: "modernization", migrationStrategy: null })).toContain("platform");
  });

  it("adds platform for hybrid / modernization migration strategy", () => {
    expect(suggestedArchetypes({ solutionArea: null, migrationStrategy: "hybrid" })).toContain("platform");
    expect(suggestedArchetypes({ solutionArea: null, migrationStrategy: "modernization" })).toContain("platform");
  });

  it("adds data_ai (and platform) for data_platform and ai_app", () => {
    const dp = suggestedArchetypes({ solutionArea: "data_platform", migrationStrategy: null });
    expect(dp).toContain("data_ai");
    expect(dp).toContain("platform");
    const ai = suggestedArchetypes({ solutionArea: "ai_app", migrationStrategy: null });
    expect(ai).toContain("data_ai");
    expect(ai).toContain("platform");
  });
});
