import { describe, it, expect } from "vitest";
import { diffBom, hasMaterialChanges } from "@/lib/exporters/bom-diff";
import type { BomLineItem } from "@/lib/exporters/bom-xlsx";

function row(over: Partial<BomLineItem> = {}): BomLineItem {
  return {
    section: "workload",
    category: "Compute",
    serviceType: "Virtual Machines",
    customName: "VM-001 (PRD-APP)",
    region: "Malaysia West",
    description: "Standard_D4s_v5, PAYG, Linux",
    monthlyUsd: 145,
    ...over,
  };
}

describe("diffBom", () => {
  it("flags everything as added when previous is null", () => {
    const d = diffBom(null, [row(), row({ customName: "VM-002" })]);
    expect(d.added).toHaveLength(2);
    expect(d.removed).toHaveLength(0);
    expect(d.priceChanged).toHaveLength(0);
    expect(d.skuChanged).toHaveLength(0);
  });

  it("flags removed rows", () => {
    const a = row({ customName: "VM-001" });
    const b = row({ customName: "VM-002" });
    const d = diffBom([a, b], [a]);
    expect(d.removed).toHaveLength(1);
    expect(d.removed[0].customName).toBe("VM-002");
  });

  it("flags price changes with signed delta", () => {
    const before = row({ customName: "VM-001", monthlyUsd: 145 });
    const after = row({ customName: "VM-001", monthlyUsd: 155 });
    const d = diffBom([before], [after]);
    expect(d.priceChanged).toHaveLength(1);
    expect(d.priceChanged[0].deltaUsd).toBe(10);
    expect(d.monthlyDeltaUsd).toBe(10);
    expect(d.annualDeltaUsd).toBe(120);
  });

  it("flags SKU / description changes when price is unchanged", () => {
    const before = row({ customName: "VM-001", description: "Standard_D4s_v5, PAYG" });
    const after = row({ customName: "VM-001", description: "Standard_E4s_v5, PAYG", monthlyUsd: 145 });
    const d = diffBom([before], [after]);
    expect(d.skuChanged).toHaveLength(1);
    expect(d.priceChanged).toHaveLength(0);
  });

  it("counts unchanged rows", () => {
    const a = row({ customName: "VM-001" });
    const d = diffBom([a], [a]);
    expect(d.unchangedCount).toBe(1);
    expect(hasMaterialChanges(d)).toBe(false);
  });

  it("disambiguates workload + LZ rows with the same customName", () => {
    const wkl = row({ section: "workload", customName: "Hub" });
    const lz = row({ section: "landing_zone", customName: "Hub" });
    const d = diffBom([wkl], [wkl, lz]);
    expect(d.added).toHaveLength(1);
    expect(d.added[0].section).toBe("landing_zone");
  });
});
