import { describe, it, expect } from "vitest";
import { detectPurpose, PURPOSE_LABELS, TRACKER_PURPOSES } from "@/lib/pipeline/purpose";

describe("detectPurpose", () => {
  it("matches historical phrasings", () => {
    expect(detectPurpose("FY26 carry-over")).toBe("historical_pipeline");
    expect(detectPurpose("Previous year pipeline")).toBe("historical_pipeline");
    expect(detectPurpose("FY26 results")).toBe("historical_pipeline");
    expect(detectPurpose("Holdover deals")).toBe("historical_pipeline");
  });

  it("matches target phrasings", () => {
    expect(detectPurpose("FY27 target list")).toBe("target_pipeline");
    expect(detectPurpose("Named accounts FY27")).toBe("target_pipeline");
    expect(detectPurpose("FY28 target customers")).toBe("target_pipeline");
  });

  it("matches funding phrasings", () => {
    expect(detectPurpose("Azure Accelerate program")).toBe("funding");
    expect(detectPurpose("AWS MAP program tracker")).toBe("funding");
    expect(detectPurpose("RaMP funding pipeline")).toBe("funding");
  });

  it("matches CRM-sync phrasings", () => {
    expect(detectPurpose("Creatio CRM")).toBe("crm_sync");
    expect(detectPurpose("Salesforce sync")).toBe("crm_sync");
  });

  it("falls back to current_pipe", () => {
    expect(detectPurpose("Microsoft biweekly")).toBe("current_pipe");
    expect(detectPurpose("SMB segment")).toBe("current_pipe");
    expect(detectPurpose(null)).toBe("current_pipe");
    expect(detectPurpose("")).toBe("current_pipe");
  });
});

describe("PURPOSE catalog", () => {
  it("has labels for every purpose", () => {
    for (const p of TRACKER_PURPOSES) {
      expect(PURPOSE_LABELS[p]).toBeTruthy();
    }
  });
});
