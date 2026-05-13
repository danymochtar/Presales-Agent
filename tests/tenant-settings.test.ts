import { describe, it, expect } from "vitest";
import {
  tenantBranding,
  tenantLabel,
  tenantThresholds,
  tenantMcemBand,
  DEFAULT_BRANDING,
  DEFAULT_THRESHOLDS,
} from "@/lib/tenant-settings";

describe("tenantBranding", () => {
  it("returns defaults when the JSON column is null", () => {
    expect(tenantBranding(null)).toEqual(DEFAULT_BRANDING);
    expect(tenantBranding({})).toEqual(DEFAULT_BRANDING);
    expect(tenantBranding({ branding: null })).toEqual(DEFAULT_BRANDING);
  });

  it("uppercases the logo letter and clamps it to 2 chars", () => {
    expect(tenantBranding({ branding: { logoLetter: "abc" } }).logoLetter).toBe("AB");
    expect(tenantBranding({ branding: { logoLetter: "x" } }).logoLetter).toBe("X");
  });

  it("falls back per-key when individual fields are missing or empty", () => {
    const b = tenantBranding({ branding: { displayName: "Acme Presales", perCloudHue: { azure: "indigo" } } });
    expect(b.displayName).toBe("Acme Presales");
    expect(b.logoLetter).toBe(DEFAULT_BRANDING.logoLetter);
    expect(b.perCloudHue.azure).toBe("indigo");
    expect(b.perCloudHue.aws).toBe(DEFAULT_BRANDING.perCloudHue.aws);
  });

  it("ignores empty / whitespace overrides", () => {
    expect(tenantBranding({ branding: { displayName: "   " } }).displayName).toBe(DEFAULT_BRANDING.displayName);
  });
});

describe("tenantLabel", () => {
  it("falls back when no override exists", () => {
    expect(tenantLabel(null, "status.committed", "Committed")).toBe("Committed");
    expect(tenantLabel({}, "status.committed", "Committed")).toBe("Committed");
    expect(tenantLabel({ vocabulary: {} }, "status.committed", "Committed")).toBe("Committed");
  });

  it("returns the override when present", () => {
    expect(tenantLabel({ vocabulary: { "status.committed": "Sure Win" } }, "status.committed", "Committed")).toBe("Sure Win");
  });

  it("trims whitespace and falls back when override is blank", () => {
    expect(tenantLabel({ vocabulary: { "status.committed": "   " } }, "status.committed", "Committed")).toBe("Committed");
    expect(tenantLabel({ vocabulary: { "status.committed": "  Yes  " } }, "status.committed", "Committed")).toBe("Yes");
  });
});

describe("tenantThresholds", () => {
  it("returns defaults when null / empty", () => {
    expect(tenantThresholds(null)).toEqual(DEFAULT_THRESHOLDS);
    expect(tenantThresholds({ thresholds: {} })).toEqual(DEFAULT_THRESHOLDS);
  });

  it("clamps out-of-range values to defaults", () => {
    expect(tenantThresholds({ thresholds: { mcemGreenPct: 150 } }).mcemGreenPct).toBe(DEFAULT_THRESHOLDS.mcemGreenPct);
    expect(tenantThresholds({ thresholds: { mcemGreenPct: -10 } }).mcemGreenPct).toBe(DEFAULT_THRESHOLDS.mcemGreenPct);
    expect(tenantThresholds({ thresholds: { fileSizeMb: 500 } }).fileSizeMb).toBe(DEFAULT_THRESHOLDS.fileSizeMb);
  });

  it("accepts valid overrides", () => {
    const t = tenantThresholds({ thresholds: { mcemGreenPct: 80, mcemAmberPct: 50, fileSizeMb: 25 } });
    expect(t.mcemGreenPct).toBe(80);
    expect(t.mcemAmberPct).toBe(50);
    expect(t.fileSizeMb).toBe(25);
  });
});

describe("tenantMcemBand", () => {
  it("uses the default 70 / 40 cutoffs out of the box", () => {
    expect(tenantMcemBand(null, 80)).toBe("green");
    expect(tenantMcemBand(null, 70)).toBe("green");
    expect(tenantMcemBand(null, 55)).toBe("amber");
    expect(tenantMcemBand(null, 40)).toBe("amber");
    expect(tenantMcemBand(null, 20)).toBe("red");
  });

  it("honors per-tenant overrides", () => {
    const t = { thresholds: { mcemGreenPct: 80, mcemAmberPct: 50 } };
    expect(tenantMcemBand(t, 75)).toBe("amber");  // below new green cutoff
    expect(tenantMcemBand(t, 85)).toBe("green");
    expect(tenantMcemBand(t, 45)).toBe("red");    // below new amber cutoff
  });
});
