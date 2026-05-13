import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { isFiscalYearConfig, fyQuarterLabel, type FiscalYearConfig } from "@/lib/fiscal-year";
import {
  periodRange,
  computeActual,
  attainmentPct,
  metricIsCurrency,
  PERIOD_LABELS,
  METRIC_LABELS,
  type TargetPeriod,
  type TargetMetric,
} from "@/lib/business/targets";
import { cloudOfVendor, CLOUD_LABELS, CLOUD_COLORS, type TargetCloud } from "@/lib/business/cloud-of-vendor";
import { tenantThresholds } from "@/lib/tenant-settings";
import { HelpTooltip } from "@/components/ui/help-tooltip";

function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

// Attainment bands are anchored on 100 = on-target. The green/amber/red
// cutoffs for partial attainment use the tenant's configured MCEM bands
// (Settings → Thresholds) so a team that sets the green cutoff to 80
// gets a different colour at 75% attainment than the default.
function bandClass(pct: number | null, greenPct: number, amberPct: number): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 100)       return "text-emerald-700 dark:text-emerald-300";
  if (pct >= greenPct)  return "text-emerald-700 dark:text-emerald-300";
  if (pct >= amberPct)  return "text-amber-700 dark:text-amber-300";
  return "text-rose-700 dark:text-rose-300";
}

export default async function BusinessDashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const { tenant } = await requireSessionAndTenant(session!.user.id);
  const fy: FiscalYearConfig | null = isFiscalYearConfig(tenant.fiscalYear) ? tenant.fiscalYear : null;
  if (!fy) redirect("/setup");
  const today = new Date();
  const { mcemGreenPct, mcemAmberPct } = tenantThresholds(tenant);

  const [targets, opportunities] = await Promise.all([
    prisma.businessTarget.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ fiscalYear: "desc" }, { period: "asc" }, { cloud: "asc" }],
      include: {
        owner: { select: { id: true, name: true, role: true } },
      },
    }),
    prisma.opportunity.findMany({
      where: { tracker: { tenantId: tenant.id } },
      select: {
        id: true, customer: true, status: true, valueUsd: true,
        closeDate: true, vendor: true,
        assignments: { select: { personnelId: true, role: true } },
      },
    }),
  ]);

  // Index opportunities by cloud, status, and assignee for quick filtering.
  const oppsWithCloud = opportunities.map((o) => ({
    ...o,
    valueUsdNum: o.valueUsd ? Number(o.valueUsd) : null,
    cloud: cloudOfVendor(o.vendor),
  }));

  type ResolvedTarget = (typeof targets)[number] & {
    actual: number;
    pct: number | null;
  };

  // Compute actual for every target row.
  const resolved: ResolvedTarget[] = targets.map((t) => {
    const { start, end } = periodRange(fy, t.period as TargetPeriod, today);
    const inPeriod = oppsWithCloud.filter((o) => {
      if (!o.closeDate) return false;
      if (o.closeDate < start) return false;
      if (o.closeDate >= end) return false;
      return true;
    });
    let filtered = inPeriod;
    if (t.cloud !== "all") {
      filtered = filtered.filter((o) => o.cloud === t.cloud);
    }
    if (t.ownerId) {
      filtered = filtered.filter((o) =>
        o.assignments.some((a) => a.personnelId === t.ownerId
          && (a.role === "solution_sales" || a.role === "account_manager" || a.role === "solution_architect")),
      );
    }
    // segment + productKey aren't on Opportunity rows yet, so they don't
    // narrow actuals — they remain manual-entry targets for now.
    const actuals = filtered.map((o) => ({ valueUsd: o.valueUsdNum, status: o.status }));
    const actual = computeActual(t.metric, actuals);
    const targetValue = t.valueUsd ? Number(t.valueUsd) : null;
    return { ...t, actual, pct: attainmentPct(actual, targetValue) };
  });

  // Group: full-year revenue per cloud (the headline) + everything-else table.
  const yearRevenueTargets = resolved.filter(
    (t) => t.period === "year" && t.metric === "revenue" && t.fiscalYear === fy.currentLabel,
  );
  const yearByCloud: Record<string, ResolvedTarget | null> = { azure: null, aws: null, gcp: null, services: null, all: null };
  for (const t of yearRevenueTargets) {
    if (!t.ownerId && !t.productKey && !t.segment) yearByCloud[t.cloud] = t;
  }
  const otherTargets = resolved.filter((t) => !yearRevenueTargets.includes(t) || t.ownerId || t.productKey || t.segment);

  // Owner-level summary: actual revenue committed/won per active sales person.
  const personnel = await prisma.personnel.findMany({
    where: { tenantId: tenant.id, active: true },
    select: { id: true, name: true, role: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  const ownerActuals = new Map<string, number>();
  for (const o of oppsWithCloud) {
    if (o.status !== "committed" && o.status !== "won") continue;
    for (const a of o.assignments) {
      const cur = ownerActuals.get(a.personnelId) ?? 0;
      ownerActuals.set(a.personnelId, cur + (o.valueUsdNum ?? 0));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-primary font-semibold flex items-center gap-2 flex-wrap">
            <span>Business dashboard</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] tracking-normal font-medium">
              {fyQuarterLabel(fy, today)}
            </span>
          </p>
          <h1 className="text-2xl md:text-3xl font-semibold mt-1 leading-tight">
            Targets vs actuals — {fy.currentLabel}.
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            Lead view across every target you&apos;ve set. Actuals roll up from the pipeline tracker (committed + won
            opportunities, filtered by cloud + owner). Define targets per Y / Q / M, per Azure / AWS / GCP /
            Services / Cross-cloud, per product line, per segment, per owner — add or delete a target row to add
            or delete a slice.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/team">Team</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/business/targets">Manage targets</Link>
          </Button>
        </div>
      </div>

      {/* Headline: full-year revenue per cloud */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-1.5">
            Full-year revenue · per cloud
            <HelpTooltip text="Actual = sum of opportunities with status committed/won and closeDate inside the current fiscal year, filtered by cloud (via vendor name). Attainment % = actual ÷ target × 100. Bands green/amber/red use your Settings → Thresholds cutoffs." />
          </CardTitle>
          <CardDescription>
            Each tile shows {fy.currentLabel} target, actual booked (committed + won), and % attainment. Add a per-cloud
            target on the <Link href="/business/targets" className="underline">Targets</Link> page if a tile is empty.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {Object.values(yearByCloud).every((v) => !v) ? (
            <p className="text-sm text-muted-foreground">
              No full-year targets yet. <Link href="/business/targets" className="underline">Add one</Link> for Azure / AWS / GCP / Services to see attainment here.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(["azure", "aws", "gcp", "services"] as TargetCloud[]).map((c) => {
                const t = yearByCloud[c];
                if (!t) {
                  return (
                    <Card key={c} className="border-dashed opacity-70">
                      <CardContent className="p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] uppercase rounded border px-1.5 py-0.5 ${CLOUD_COLORS[c]}`}>{CLOUD_LABELS[c]}</span>
                          <span className="text-[11px] text-muted-foreground">No target</span>
                        </div>
                        <Link href="/business/targets" className="text-xs underline text-muted-foreground">+ add target</Link>
                      </CardContent>
                    </Card>
                  );
                }
                return (
                  <Card key={c}>
                    <CardContent className="p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] uppercase rounded border px-1.5 py-0.5 ${CLOUD_COLORS[c]}`}>{CLOUD_LABELS[c]}</span>
                        <span className={`text-xs font-medium ${bandClass(t.pct, mcemGreenPct, mcemAmberPct)}`}>
                          {t.pct === null ? "—" : `${t.pct}%`}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">Target {t.valueUsd ? fmtMoney(Number(t.valueUsd)) : "—"}</p>
                      <p className="text-lg font-semibold tabular-nums">{fmtMoney(t.actual)}</p>
                      <p className="text-[11px] text-muted-foreground">actual · committed + won</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* All other targets — table */}
      {otherTargets.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-1.5">
              All targets ({resolved.length})
              <HelpTooltip text="Every target row you've defined. Cost / margin / CSAT metrics show target only — actuals require a manual cost-import path (planned). Revenue / ACR / deal-count / win-rate are auto from pipeline." />
            </CardTitle>
            <CardDescription>
              Every slice — Y / Q / M, cloud, product, segment, owner. Cost / margin / CSAT metrics show target only
              (actuals require manual entry until a cost-import path is added).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">FY · Period</th>
                    <th className="px-3 py-2 font-medium">Metric</th>
                    <th className="px-3 py-2 font-medium">Cloud</th>
                    <th className="px-3 py-2 font-medium">Product</th>
                    <th className="px-3 py-2 font-medium">Owner</th>
                    <th className="px-3 py-2 font-medium text-right">Target</th>
                    <th className="px-3 py-2 font-medium text-right">Actual</th>
                    <th className="px-3 py-2 font-medium text-right">Attainment</th>
                  </tr>
                </thead>
                <tbody>
                  {resolved.map((t) => {
                    const targetValue = t.valueUsd ? Number(t.valueUsd) : null;
                    const showActuals = t.metric === "revenue" || t.metric === "acr" || t.metric === "deal_count" || t.metric === "win_rate_pct";
                    return (
                      <tr key={t.id} className="border-b">
                        <td className="px-3 py-2 whitespace-nowrap">{t.fiscalYear} · {PERIOD_LABELS[t.period as TargetPeriod] ?? t.period}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{METRIC_LABELS[t.metric as TargetMetric] ?? t.metric}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${CLOUD_COLORS[t.cloud as TargetCloud] ?? CLOUD_COLORS.all}`}>
                            {CLOUD_LABELS[t.cloud as TargetCloud] ?? t.cloud}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{t.productKey ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{t.owner?.name ?? "Team"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {targetValue == null ? "—" : metricIsCurrency(t.metric) ? fmtMoney(targetValue) : targetValue.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {showActuals ? (metricIsCurrency(t.metric) ? fmtMoney(t.actual) : t.actual.toLocaleString()) : "—"}
                        </td>
                        <td className={`px-3 py-2 text-right font-medium tabular-nums ${bandClass(t.pct, mcemGreenPct, mcemAmberPct)}`}>
                          {t.pct === null ? "—" : `${t.pct}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Owner roll-up */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-1.5">
            Per-owner — committed + won {fy.currentLabel}
            <HelpTooltip text="Sum of opportunity USD where the person is assigned in any role (SA / Sales / AM / Partner / CSM) and the opportunity is committed or won this FY. Add team members on /team and assign them via the pipeline page." />
          </CardTitle>
          <CardDescription>
            Total USD on opportunities each team member is assigned to, summed across all roles (SA / Sales / AM /
            Partner / CSM). Sourced live from the pipeline tracker.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {personnel.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No team members yet. <Link href="/team" className="underline">Add your team</Link>.
            </p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {personnel.map((p) => {
                const actual = ownerActuals.get(p.id) ?? 0;
                return (
                  <li key={p.id} className="rounded-md border p-3">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground capitalize">{p.role.replace(/_/g, " ")}</div>
                    <div className="text-base font-semibold tabular-nums mt-1">{fmtMoney(actual)}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
