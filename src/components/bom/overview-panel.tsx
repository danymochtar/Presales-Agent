// Structured BOM overview rendered above the markdown preview on the BOM
// workspace. Pulls from `deliverable.metadata`:
//   - lineItems (parsed from the LLM's trailing JSON block)
//   - commitmentSummaryByCloud (per-term monthly totals)
//   - landingZoneBaselineMonthlyUsdByCloud (LZ subtotal)
//
// Gives the architect a numeric at-a-glance read without scanning the prose.

import type { BomLineItem } from "@/lib/exporters/bom-xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { CloudChip } from "@/components/cloud-chip";

type CommitmentSummary = Partial<Record<
  "consumption" | "reserved-1y" | "reserved-3y" | "savings-1y" | "savings-3y",
  number
>>;

export type BomOverviewProps = {
  cloud: string;
  lineItems: BomLineItem[];
  commitmentSummary?: CommitmentSummary;
  landingZoneBaselineMonthlyUsd?: number;
  fxMyrPerUsd?: number | null;
  selectedPurchaseModel: string;
};

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtUsdMyr(n: number, fx?: number | null): string {
  if (!fx) return fmt(n);
  return `${fmt(n)} (MYR ${Math.round(n * fx).toLocaleString()})`;
}

const COMMITMENT_LABELS: Record<string, string> = {
  "consumption": "PAYG",
  "reserved-1y": "RI 1y",
  "reserved-3y": "RI 3y",
  "savings-1y":  "SP 1y",
  "savings-3y":  "SP 3y",
};

export function BomOverviewPanel(props: BomOverviewProps) {
  const items = props.lineItems ?? [];
  if (items.length === 0) return null;

  // Group by category (workload section): Compute / Storage / Network / Databases / etc.
  const workloadByCategory: Record<string, number> = {};
  let workloadTotal = 0;
  let lzTotal = 0;
  for (const it of items) {
    if (it.section === "workload") {
      workloadByCategory[it.category] = (workloadByCategory[it.category] ?? 0) + it.monthlyUsd;
      workloadTotal += it.monthlyUsd;
    } else if (it.section === "landing_zone") {
      lzTotal += it.monthlyUsd;
    }
  }
  const grandMonthly = workloadTotal + (props.landingZoneBaselineMonthlyUsd ?? lzTotal);

  // Workload-tier breakdown — best-effort from the description (looks for
  // "Production" / "UAT" / "Dev" / "DR" keywords).
  const tierBuckets = { prod: 0, nonprod: 0, dr: 0, other: 0 };
  for (const it of items) {
    if (it.section !== "workload") continue;
    const blob = `${it.customName} ${it.description}`.toLowerCase();
    if (blob.includes(" dr ") || blob.includes("disaster") || /\bdr-?\d/.test(blob)) tierBuckets.dr += it.monthlyUsd;
    else if (blob.includes("prod") || blob.includes("production")) tierBuckets.prod += it.monthlyUsd;
    else if (blob.includes("uat") || blob.includes("dev") || blob.includes("test") || blob.includes("staging")) tierBuckets.nonprod += it.monthlyUsd;
    else tierBuckets.other += it.monthlyUsd;
  }

  const commitments = props.commitmentSummary ?? {};
  const payg = commitments.consumption ?? null;
  const selected = (commitments[props.selectedPurchaseModel as keyof CommitmentSummary] ?? null);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <CloudChip cloud={props.cloud} size="xs" />
          BOM overview
          <HelpTooltip text="At-a-glance numbers parsed from the BOM's structured line-items block. Use as a scan layer before reading the markdown prose. Commitment comparison comes from the per-cloud all-terms pricing fetched at generation time." />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Headline tile row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-md border p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Monthly total</div>
            <div className="text-xl font-semibold tabular-nums mt-1">{fmtUsdMyr(grandMonthly, props.fxMyrPerUsd)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Workloads {fmt(workloadTotal)} + LZ {fmt(props.landingZoneBaselineMonthlyUsd ?? lzTotal)}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Year-1 total</div>
            <div className="text-xl font-semibold tabular-nums mt-1">{fmtUsdMyr(grandMonthly * 12, props.fxMyrPerUsd)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">At {COMMITMENT_LABELS[props.selectedPurchaseModel] ?? props.selectedPurchaseModel}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">3-year total</div>
            <div className="text-xl font-semibold tabular-nums mt-1">{fmtUsdMyr(grandMonthly * 36, props.fxMyrPerUsd)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Linear projection</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Line items</div>
            <div className="text-xl font-semibold tabular-nums mt-1">{items.length}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {items.filter((i) => i.section === "workload").length} workload · {items.filter((i) => i.section === "landing_zone").length} LZ
            </div>
          </div>
        </div>

        {/* Commitment comparison */}
        {Object.keys(commitments).length > 0 && payg && payg > 0 && (
          <div className="rounded-md border">
            <div className="px-3 py-2 border-b bg-muted/30 text-xs font-medium flex items-center gap-1.5">
              Commitment-model comparison
              <HelpTooltip text="Compute-only totals per commitment term, fetched from live cloud pricing at BOM generation. Storage / network / LZ baseline stay constant across rows." />
            </div>
            <ul className="divide-y text-xs">
              {(["consumption", "reserved-1y", "reserved-3y", "savings-1y", "savings-3y"] as const).map((term) => {
                const v = commitments[term];
                if (v == null) return null;
                const savings = payg > 0 ? Math.round(((payg - v) / payg) * 100) : 0;
                const isSelected = term === props.selectedPurchaseModel;
                return (
                  <li key={term} className={`px-3 py-2 flex items-center justify-between gap-2 ${isSelected ? "bg-primary/5" : ""}`}>
                    <span className="font-medium">
                      {COMMITMENT_LABELS[term]} {isSelected && <span className="text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 bg-primary text-primary-foreground ml-1">selected</span>}
                    </span>
                    <span className="flex items-center gap-3 tabular-nums">
                      <span className="text-muted-foreground">{fmt(v)}/mo</span>
                      <span className="text-muted-foreground">{fmt(v * 12)}/yr</span>
                      <span className={savings > 0 ? "text-emerald-700 dark:text-emerald-300 w-12 text-right" : "text-muted-foreground w-12 text-right"}>
                        {term === "consumption" ? "—" : `-${savings}%`}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Category breakdown bars */}
        {Object.keys(workloadByCategory).length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium flex items-center gap-1.5">
              Workload spend by category
              <HelpTooltip text="Sum of monthly USD per Vendor service category (Compute / Storage / Network / Databases / etc.) from the workload section of the BOM." />
            </div>
            {Object.entries(workloadByCategory)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, usd]) => {
                const pct = workloadTotal > 0 ? Math.round((usd / workloadTotal) * 100) : 0;
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-[11px] mb-0.5">
                      <span>{cat}</span>
                      <span className="text-muted-foreground tabular-nums">{fmt(usd)} · {pct}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {/* Tier breakdown */}
        {Object.values(tierBuckets).some((v) => v > 0) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {([
              ["prod",    "Production"],
              ["nonprod", "Non-prod"],
              ["dr",      "DR"],
              ["other",   "Unclassified"],
            ] as const).map(([k, label]) => (
              tierBuckets[k] > 0 ? (
                <div key={k} className="rounded-md border p-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
                  <div className="font-semibold tabular-nums">{fmt(tierBuckets[k])}/mo</div>
                </div>
              ) : null
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
