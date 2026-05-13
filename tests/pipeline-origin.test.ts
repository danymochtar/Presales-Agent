import { describe, it, expect } from "vitest";
import { detectOrigin, ORIGIN_LABELS, originLabel, OPPORTUNITY_ORIGINS } from "@/lib/pipeline/origin";

describe("detectOrigin", () => {
  it("matches carry-over phrasings", () => {
    expect(detectOrigin("FY26 carry-over")).toBe("carry_over");
    expect(detectOrigin("rollover from last year")).toBe("carry_over");
    expect(detectOrigin("Holdover deal")).toBe("carry_over");
  });

  it("matches fiscal-year target phrasings", () => {
    expect(detectOrigin("FY27 target list")).toBe("new_target");
    expect(detectOrigin("new target account")).toBe("new_target");
    expect(detectOrigin("FY28 target customers")).toBe("new_target");
  });

  it("matches existing-customer phrasings", () => {
    expect(detectOrigin("existing customer expansion")).toBe("existing_customer");
    expect(detectOrigin("installed base renewal")).toBe("existing_customer");
    expect(detectOrigin("cross-sell motion")).toBe("existing_customer");
    expect(detectOrigin("Upsell")).toBe("existing_customer");
  });

  it("matches net-new phrasings", () => {
    expect(detectOrigin("Net-new prospect")).toBe("net_new");
    expect(detectOrigin("greenfield account")).toBe("net_new");
  });

  it("returns null when nothing matches", () => {
    expect(detectOrigin("ordinary tracker")).toBeNull();
    expect(detectOrigin("")).toBeNull();
    expect(detectOrigin(null)).toBeNull();
  });
});

describe("originLabel", () => {
  it("returns friendly labels", () => {
    expect(originLabel("carry_over")).toBe("Carry-over");
    expect(originLabel("new_target")).toBe("FY target");
    expect(originLabel(null)).toBe(ORIGIN_LABELS.unknown);
  });
});

describe("OPPORTUNITY_ORIGINS", () => {
  it("contains exactly five entries", () => {
    expect(OPPORTUNITY_ORIGINS).toHaveLength(5);
  });
});
