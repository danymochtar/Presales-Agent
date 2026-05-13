import { describe, it, expect } from "vitest";
import {
  phaseForStage,
  score,
  nextAction,
  itemsForPhase,
  healthBand,
  MCEM_PHASES,
  type Mcem,
} from "@/lib/mcem";

describe("phaseForStage", () => {
  it("maps prospecting + qualifying → listen", () => {
    expect(phaseForStage("prospecting")).toBe("listen");
    expect(phaseForStage("qualifying")).toBe("listen");
  });
  it("maps discovery → design", () => {
    expect(phaseForStage("discovery")).toBe("design");
  });
  it("maps proposed + negotiating → empower", () => {
    expect(phaseForStage("proposed")).toBe("empower");
    expect(phaseForStage("negotiating")).toBe("empower");
  });
  it("maps closed_won → realize", () => {
    expect(phaseForStage("closed_won")).toBe("realize");
  });
  it("defaults to listen for null/unknown", () => {
    expect(phaseForStage(null)).toBe("listen");
    expect(phaseForStage("garbage")).toBe("listen");
  });
});

describe("itemsForPhase", () => {
  it("every phase has at least one exit-criterion item", () => {
    for (const p of MCEM_PHASES) {
      expect(itemsForPhase(p).length).toBeGreaterThan(0);
    }
  });
});

describe("score", () => {
  it("returns 0% with empty mcem on an open stage", () => {
    const h = score(null, "prospecting");
    expect(h.totalPct).toBe(0);
    expect(h.currentPhase).toBe("listen");
    expect(h.done).toBe(0);
    expect(h.total).toBeGreaterThan(0);
    expect(h.blockers.length).toBe(h.total);
  });

  it("counts done items in the current phase only", () => {
    const m: Mcem = {
      customer_research: { done: true },
      pain_identified: { done: true },
      // also tick a Design item — should NOT count for listen phase score
      solution_play: { done: true },
    };
    const h = score(m, "prospecting");
    expect(h.done).toBe(2);
    expect(h.currentPhase).toBe("listen");
  });

  it("100% when every exit-criterion in the current phase is done", () => {
    const listen = itemsForPhase("listen");
    const m: Mcem = {};
    for (const it of listen) m[it.key] = { done: true };
    const h = score(m, "qualifying");
    expect(h.totalPct).toBe(100);
    expect(h.blockers.length).toBe(0);
  });
});

describe("nextAction", () => {
  it("returns the first undone item in the current phase", () => {
    const m: Mcem = { customer_research: { done: true } };
    const na = nextAction(m, "prospecting");
    expect(na).not.toBeNull();
    expect(na!.key).toBe("pain_identified");
  });

  it("returns null when engagement is closed", () => {
    expect(nextAction(null, "closed_won")).toBeNull();
    expect(nextAction(null, "closed_lost")).toBeNull();
  });

  it("returns null when phase is fully complete", () => {
    const items = itemsForPhase("listen");
    const m: Mcem = {};
    for (const it of items) m[it.key] = { done: true };
    expect(nextAction(m, "prospecting")).toBeNull();
  });
});

describe("healthBand", () => {
  it("≥ 70 green, 40-69 amber, < 40 red", () => {
    expect(healthBand(85)).toBe("green");
    expect(healthBand(70)).toBe("green");
    expect(healthBand(55)).toBe("amber");
    expect(healthBand(40)).toBe("amber");
    expect(healthBand(20)).toBe("red");
    expect(healthBand(0)).toBe("red");
  });
});
