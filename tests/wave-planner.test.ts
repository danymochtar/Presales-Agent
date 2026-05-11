import { describe, it, expect } from "vitest";
import { parseWaveTable, checkWaveLimits, splitsRequired, WAVE_LIMITS } from "@/lib/wave-planner";

describe("parseWaveTable", () => {
  it("parses canonical IBM wave table with all columns", () => {
    const md = `
Some prelude text.

| Wave | Apps | Servers | Databases | Duration (weeks) | Dependencies | Cutover window | Rollback strategy |
|------|------|---------|-----------|------------------|--------------|----------------|-------------------|
| Wave 1 | 12 | 80 | 15 | 6 | none | weekend | snapshot |
| Wave 2 | 18 | 120 | 25 | 8 | Wave 1 | weekend | snapshot |
| Wave 3 | 22 | 200 | 35 | 10 | Wave 2 | weekend | snapshot |

Trailing prose.`;
    const waves = parseWaveTable(md);
    expect(waves).toHaveLength(3);
    expect(waves[0]).toMatchObject({ wave: "Wave 1", apps: 12, servers: 80, databases: 15, durationWeeks: 6 });
    expect(waves[2]).toMatchObject({ wave: "Wave 3", apps: 22, servers: 200, databases: 35, durationWeeks: 10 });
  });

  it("returns empty when no wave table present", () => {
    expect(parseWaveTable("Just some text without a table.")).toEqual([]);
  });
});

describe("checkWaveLimits", () => {
  it("flags every IBM violation", () => {
    const waves = parseWaveTable(`
| Wave | Apps | Servers | Databases | Duration (weeks) |
|------|------|---------|-----------|------------------|
| Wave 1 | 12 | 80 | 15 | 6 |
| Wave 2 | 18 | 120 | 25 | 8 |
| Wave 3 | 22 | 200 | 35 | 10 |`);
    const w = checkWaveLimits(waves);
    const w3 = w.filter((x) => x.wave === "Wave 3");
    expect(w3.map((x) => x.rule)).toEqual(
      expect.arrayContaining(["apps per wave", "servers per wave", "databases per wave", "duration too long (weeks)"]),
    );
    expect(w.find((x) => x.wave === "Wave 1")).toBeUndefined();
  });

  it("flags too-short waves", () => {
    const waves = parseWaveTable(`
| Wave | Apps | Servers | Databases | Duration (weeks) |
|------|------|---------|-----------|------------------|
| Wave 1 | 5 | 30 | 10 | 2 |`);
    expect(checkWaveLimits(waves)).toEqual([
      { wave: "Wave 1", rule: "duration too short (weeks)", observed: 2, limit: WAVE_LIMITS.minDurationWeeks },
    ]);
  });
});

describe("splitsRequired", () => {
  it("uses the worst-case dimension", () => {
    expect(splitsRequired({ apps: 50, servers: 100, databases: 10 })).toBe(3); // 50/20 -> ceil 3
    expect(splitsRequired({ apps: 10, servers: 600, databases: 10 })).toBe(4); // 600/150 -> 4
    expect(splitsRequired({ apps: 10, servers: 10, databases: 90 })).toBe(3);  // 90/30 -> 3
  });

  it("returns 1 when below all limits", () => {
    expect(splitsRequired({ apps: 5, servers: 50, databases: 5 })).toBe(1);
  });
});
