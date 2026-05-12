"use client";
import { Card, CardContent } from "@/components/ui/card";

function fmtUsd(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
function fmtMyr(n: number) {
  return `RM ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export type KpiStripProps = {
  totalCount: number;
  totalUsd: number;
  totalMyr: number;
  committedUsd: number;
  upsideUsd: number;
  atRiskUsd: number;
  closingMonthUsd: number;
  closingMonthCount: number;
  closingQuarterUsd: number;
  closingQuarterCount: number;
  fxAsOf?: string | null;
};

export function KpiStrip(p: KpiStripProps) {
  const cards: { label: string; value: string; hint?: string }[] = [
    { label: "Opportunities", value: String(p.totalCount), hint: `${fmtUsd(p.totalUsd)} · ${fmtMyr(p.totalMyr)}` },
    { label: "Committed", value: fmtUsd(p.committedUsd) },
    { label: "Upside", value: fmtUsd(p.upsideUsd) },
    { label: "At risk", value: fmtUsd(p.atRiskUsd) },
    { label: "Closing this month", value: fmtUsd(p.closingMonthUsd), hint: `${p.closingMonthCount} deal(s)` },
    { label: "Closing this quarter", value: fmtUsd(p.closingQuarterUsd), hint: `${p.closingQuarterCount} deal(s)` },
  ];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {cards.map((c) => (
          <Card key={c.label} className="bg-card">
            <CardContent className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</div>
              <div className="text-base md:text-lg font-semibold mt-0.5 truncate">{c.value}</div>
              {c.hint && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{c.hint}</div>}
            </CardContent>
          </Card>
        ))}
      </div>
      {p.fxAsOf && <p className="text-[11px] text-muted-foreground">As of {p.fxAsOf}</p>}
    </div>
  );
}
