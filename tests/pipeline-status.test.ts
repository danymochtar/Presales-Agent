import { describe, it, expect } from "vitest";
import { normalizeStatus, statusFromNote } from "@/lib/pipeline/status";

describe("normalizeStatus", () => {
  it("matches plain status words case-insensitively", () => {
    expect(normalizeStatus("Commit")).toBe("committed");
    expect(normalizeStatus("COMMITTED")).toBe("committed");
    expect(normalizeStatus("at risk")).toBe("at_risk");
    expect(normalizeStatus("At-Risk")).toBe("at_risk");
    expect(normalizeStatus("AT_RISK")).toBe("at_risk");
    expect(normalizeStatus("Upside")).toBe("upside");
    expect(normalizeStatus("Won")).toBe("won");
    expect(normalizeStatus("Closed Won")).toBe("won");
    expect(normalizeStatus("Closed-Lost")).toBe("lost");
  });

  it("distinguishes uncommit from commit", () => {
    expect(normalizeStatus("Uncommitted")).toBe("uncommitted");
    expect(normalizeStatus("uncommit")).toBe("uncommitted");
    expect(normalizeStatus("Commit")).toBe("committed");
  });

  it("matches funding-specific statuses", () => {
    expect(normalizeStatus("Pending Consent")).toBe("funding_pending_consent");
    expect(normalizeStatus("Expiring soon")).toBe("funding_expiring");
    expect(normalizeStatus("Closing out")).toBe("funding_closed_out");
    expect(normalizeStatus("Closed out")).toBe("funding_closed_out");
  });

  it("falls back to unknown on empty / null / unmatched", () => {
    expect(normalizeStatus(null)).toBe("unknown");
    expect(normalizeStatus(undefined)).toBe("unknown");
    expect(normalizeStatus("")).toBe("unknown");
    expect(normalizeStatus("   ")).toBe("unknown");
    expect(normalizeStatus("Stage 3")).toBe("unknown");
  });

  it("honors tracker-level statusMapping override", () => {
    const map = { "Forecast": "committed" as const, "Slipping": "at_risk" as const };
    expect(normalizeStatus("Forecast", map)).toBe("committed");
    expect(normalizeStatus("Slipping", map)).toBe("at_risk");
    // override falls back to keyword regex when key not present
    expect(normalizeStatus("Won", map)).toBe("won");
  });
});

describe("statusFromNote", () => {
  it("returns inferred status from a freeform note", () => {
    expect(statusFromNote("Following up next week, moved to at-risk")).toBe("at_risk");
    expect(statusFromNote("customer confirmed PO — closed won")).toBe("won");
    expect(statusFromNote("upside for Q3")).toBe("upside");
    expect(statusFromNote("waiting on procurement, follow up")).toBe("needs_follow_up");
  });

  it("returns null when no keyword matches", () => {
    expect(statusFromNote("just a normal note")).toBeNull();
    expect(statusFromNote("")).toBeNull();
    expect(statusFromNote(null)).toBeNull();
  });
});
