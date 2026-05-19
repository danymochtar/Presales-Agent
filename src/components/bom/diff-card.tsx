// "What changed from v{N-1}" card on the BOM workspace. Reads the
// diffVsPrevious JSON saved on the BOM's metadata at generation time.

import type { BomDiff } from "@/lib/exporters/bom-diff";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "@/components/ui/help-tooltip";

function fmt(n: number, signed = false): string {
  const v = Math.round(n).toLocaleString();
  if (!signed) return `$${v}`;
  if (n > 0) return `+$${v}`;
  if (n < 0) return `-$${v.replace("-", "")}`;
  return "$0";
}

function deltaClass(n: number): string {
  if (n > 0) return "text-rose-700 dark:text-rose-300";
  if (n < 0) return "text-emerald-700 dark:text-emerald-300";
  return "text-muted-foreground";
}

export function BomDiffCard({ diff, previousVersion }: { diff: BomDiff; previousVersion: number }) {
  const total = diff.added.length + diff.removed.length + diff.priceChanged.length + diff.skuChanged.length;
  if (total === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">No changes vs v{previousVersion}</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          Re-generated BOM matches the previous version row-for-row — no SKU flips, no price changes, no added or removed lines. Useful as a fresh regenerate without drift.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-300/60 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-900/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          What changed from v{previousVersion}
          <HelpTooltip text="Auto-computed at generation time. Rows matched by section + customName. Price changes are line-by-line; SKU changes flag a different description for the same row." />
          <span className={`text-sm font-medium ${deltaClass(diff.monthlyDeltaUsd)}`}>
            {fmt(diff.monthlyDeltaUsd, true)} / mo · {fmt(diff.annualDeltaUsd, true)} / yr
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="Added"    value={diff.added.length}        kind="positive" />
          <Stat label="Removed"  value={diff.removed.length}      kind="negative" />
          <Stat label="Price changes" value={diff.priceChanged.length} kind="neutral" />
          <Stat label="SKU changes"   value={diff.skuChanged.length}   kind="neutral" />
        </div>

        {diff.added.length > 0 && (
          <Group title="Added rows" items={diff.added.map((i) => `${i.customName} (${i.serviceType}) — ${fmt(i.monthlyUsd)}/mo`)} />
        )}
        {diff.removed.length > 0 && (
          <Group title="Removed rows" items={diff.removed.map((i) => `${i.customName} (${i.serviceType}) — was ${fmt(i.monthlyUsd)}/mo`)} />
        )}
        {diff.priceChanged.length > 0 && (
          <Group
            title="Price changes"
            items={diff.priceChanged.slice(0, 12).map((c) => `${c.current.customName}: ${fmt(c.previous.monthlyUsd)} → ${fmt(c.current.monthlyUsd)} (${fmt(c.deltaUsd, true)})`)}
            footnote={diff.priceChanged.length > 12 ? `+ ${diff.priceChanged.length - 12} more` : undefined}
          />
        )}
        {diff.skuChanged.length > 0 && (
          <Group
            title="SKU / description changes"
            items={diff.skuChanged.slice(0, 12).map((c) => `${c.current.customName}: ${c.previous.description} → ${c.current.description}`)}
            footnote={diff.skuChanged.length > 12 ? `+ ${diff.skuChanged.length - 12} more` : undefined}
          />
        )}

        <div className="text-[11px] text-muted-foreground pt-2 border-t">
          Previous total {fmt(diff.previousMonthlyTotalUsd)}/mo → current {fmt(diff.currentMonthlyTotalUsd)}/mo. {diff.unchangedCount} row{diff.unchangedCount === 1 ? "" : "s"} unchanged.
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, kind }: { label: string; value: number; kind: "positive" | "negative" | "neutral" }) {
  const cls = kind === "positive" ? "text-emerald-700 dark:text-emerald-300"
    : kind === "negative" ? "text-rose-700 dark:text-rose-300"
    : "text-foreground";
  return (
    <div className="rounded-md border bg-background p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}

function Group({ title, items, footnote }: { title: string; items: string[]; footnote?: string }) {
  return (
    <div className="rounded-md border bg-background p-2.5">
      <div className="text-[11px] font-medium mb-1.5">{title}</div>
      <ul className="space-y-0.5 text-[11px] text-muted-foreground">
        {items.map((line, i) => <li key={i}>· {line}</li>)}
        {footnote && <li className="italic">{footnote}</li>}
      </ul>
    </div>
  );
}
