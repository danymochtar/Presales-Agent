import { describe, it, expect } from "vitest";
import {
  migrationStrategyFor,
  SOLUTION_AREA_LABELS,
  SOLUTION_AREAS_IN_ORDER,
  type SolutionArea,
} from "@/lib/inventory/solution-area";

describe("migrationStrategyFor", () => {
  it("maps each area to a defined migration strategy", () => {
    for (const a of SOLUTION_AREAS_IN_ORDER) {
      const s = migrationStrategyFor(a);
      expect(["lift_and_shift", "hybrid", "modernization"]).toContain(s);
    }
  });

  it("greenfield + AI + data platform default to modernization", () => {
    expect(migrationStrategyFor("greenfield_app")).toBe("modernization");
    expect(migrationStrategyFor("ai_app")).toBe("modernization");
    expect(migrationStrategyFor("data_platform")).toBe("modernization");
  });

  it("lift-shift migration + DR default to lift_and_shift", () => {
    expect(migrationStrategyFor("migration_lift_shift")).toBe("lift_and_shift");
    expect(migrationStrategyFor("disaster_recovery")).toBe("lift_and_shift");
  });

  it("hybrid migration defaults to hybrid", () => {
    expect(migrationStrategyFor("migration_hybrid")).toBe("hybrid");
  });
});

describe("SOLUTION_AREA_LABELS", () => {
  it("covers every enum member", () => {
    for (const a of SOLUTION_AREAS_IN_ORDER) {
      expect(SOLUTION_AREA_LABELS[a as SolutionArea]).toBeTruthy();
    }
  });
});
