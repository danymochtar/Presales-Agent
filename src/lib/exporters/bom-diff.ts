// Diff two BOM versions — compares the `lineItems` arrays saved on each
// deliverable's metadata. Surfaces:
//   - rows added in vN that didn't exist in vN-1 (by customName + section)
//   - rows removed
//   - rows where the monthlyUsd changed
//   - rows where the SKU / description changed
//   - overall delta in monthly + annual total USD
//
// Used by the BOM workspace to show a "What changed from v{N-1}" card when
// the user is viewing v ≥ 2.

import type { BomLineItem } from "@/lib/exporters/bom-xlsx";

export type LineItemChange =
  | { kind: "added"; current: BomLineItem }
  | { kind: "removed"; previous: BomLineItem }
  | { kind: "price-changed"; previous: BomLineItem; current: BomLineItem; deltaUsd: number }
  | { kind: "sku-changed"; previous: BomLineItem; current: BomLineItem };

export type BomDiff = {
  added: BomLineItem[];
  removed: BomLineItem[];
  priceChanged: { previous: BomLineItem; current: BomLineItem; deltaUsd: number }[];
  skuChanged: { previous: BomLineItem; current: BomLineItem }[];
  unchangedCount: number;
  previousMonthlyTotalUsd: number;
  currentMonthlyTotalUsd: number;
  monthlyDeltaUsd: number;
  annualDeltaUsd: number;
  changes: LineItemChange[];
};

function keyOf(item: BomLineItem): string {
  // customName is "PKTSRVAD-02 (INFOR-DC3)" or "Hub VNet" — already unique
  // within a BOM. Pair with section so workload + LZ rows of the same name
  // don't collide.
  return `${item.section}::${item.customName}`;
}

export function diffBom(previous: BomLineItem[] | null | undefined, current: BomLineItem[]): BomDiff {
  const prev = previous ?? [];
  const prevByKey = new Map<string, BomLineItem>(prev.map((p) => [keyOf(p), p]));
  const currByKey = new Map<string, BomLineItem>(current.map((c) => [keyOf(c), c]));

  const added: BomLineItem[] = [];
  const removed: BomLineItem[] = [];
  const priceChanged: { previous: BomLineItem; current: BomLineItem; deltaUsd: number }[] = [];
  const skuChanged: { previous: BomLineItem; current: BomLineItem }[] = [];
  let unchangedCount = 0;
  const changes: LineItemChange[] = [];

  for (const [key, c] of currByKey) {
    const p = prevByKey.get(key);
    if (!p) {
      added.push(c);
      changes.push({ kind: "added", current: c });
      continue;
    }
    const priceDelta = Math.round((c.monthlyUsd - p.monthlyUsd) * 100) / 100;
    const descChanged = (p.description || "") !== (c.description || "");
    if (Math.abs(priceDelta) >= 0.01) {
      priceChanged.push({ previous: p, current: c, deltaUsd: priceDelta });
      changes.push({ kind: "price-changed", previous: p, current: c, deltaUsd: priceDelta });
    } else if (descChanged) {
      skuChanged.push({ previous: p, current: c });
      changes.push({ kind: "sku-changed", previous: p, current: c });
    } else {
      unchangedCount += 1;
    }
  }
  for (const [key, p] of prevByKey) {
    if (!currByKey.has(key)) {
      removed.push(p);
      changes.push({ kind: "removed", previous: p });
    }
  }

  const previousMonthlyTotalUsd = prev.reduce((s, r) => s + r.monthlyUsd, 0);
  const currentMonthlyTotalUsd = current.reduce((s, r) => s + r.monthlyUsd, 0);
  const monthlyDeltaUsd = Math.round((currentMonthlyTotalUsd - previousMonthlyTotalUsd) * 100) / 100;

  return {
    added,
    removed,
    priceChanged,
    skuChanged,
    unchangedCount,
    previousMonthlyTotalUsd: round2(previousMonthlyTotalUsd),
    currentMonthlyTotalUsd: round2(currentMonthlyTotalUsd),
    monthlyDeltaUsd,
    annualDeltaUsd: round2(monthlyDeltaUsd * 12),
    changes,
  };
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

export function hasMaterialChanges(diff: BomDiff): boolean {
  return diff.added.length > 0 || diff.removed.length > 0 || diff.priceChanged.length > 0 || diff.skuChanged.length > 0;
}
