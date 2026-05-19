import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CloudChip } from "@/components/cloud-chip";

import { engagementTypeLabel, DELIVERABLE_PREREQS, kindOfDbType } from "@/lib/deliverable-prereqs";
import { relTime } from "@/lib/format-time";
import {
  MCEM_PHASES,
  PHASE_LABELS,
  PHASE_SHORT,
  phaseForStage,
  nextAction,
  score as mcemScore,
  stageLabel,
  isOpenStage,
  type Mcem,
  type McemPhase,
} from "@/lib/mcem";
import { customerNamesMatch } from "@/lib/pipeline/customer-match";
import { isFiscalYearConfig, fyQuarterLabel, type FiscalYearConfig } from "@/lib/fiscal-year";
import { tenantBranding, tenantThresholds, tenantMcemBand } from "@/lib/tenant-settings";
import { HelpTooltip } from "@/components/ui/help-tooltip";

const deliverableLabel = (dbType: string): string => {
  const k = kindOfDbType(dbType);
  return k ? DELIVERABLE_PREREQS[k].label : dbType;
};

const PHASE_BAR_COLOR: Record<McemPhase, string> = {
  listen:  "bg-sky-500",
  design:  "bg-indigo-500",
  empower: "bg-violet-500",
  realize: "bg-emerald-500",
  manage:  "bg-amber-500",
};

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const { user, tenant } = await requireSessionAndTenant(session!.user.id);

  // First-login gate: the dashboard pivots every KPI off a fiscal calendar +
  // a master customer list. Until both are defined, ship the user to /setup.
  const fy: FiscalYearConfig | null = isFiscalYearConfig(tenant.fiscalYear) ? tenant.fiscalYear : null;
  const trackerCount = await prisma.tracker.count({ where: { tenantId: tenant.id } });
  if (!fy || trackerCount === 0) redirect("/setup");

  const thresholds = tenantThresholds(tenant);
  const SEVEN_DAYS_AGO = new Date(Date.now() - thresholds.dashboardLookbackDays * 24 * 60 * 60 * 1000);

  const [engagements, recentDeliverables, opportunities, recentBoms, rateCount, catalogCount, patternCount, templateCount] = await Promise.all([
    prisma.engagement.findMany({
      where: { tenantId: tenant.id },
      orderBy: { updatedAt: "desc" },
      include: {
        deliverables: { select: { type: true, cloudProvider: true } },
        _count: { select: { inputs: true } },
      },
    }),
    prisma.deliverable.findMany({
      where: { engagement: { tenantId: tenant.id }, createdAt: { gte: SEVEN_DAYS_AGO } },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { engagement: { select: { id: true, name: true } } },
    }),
    prisma.opportunity.findMany({
      where: { tracker: { tenantId: tenant.id } },
      select: { customer: true, valueUsd: true, status: true },
    }),
    // BOM-tile feed — top 6 recent BOMs across all engagements + clouds.
    prisma.deliverable.findMany({
      where: { engagement: { tenantId: tenant.id }, type: "bom" },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { engagement: { select: { id: true, name: true, customer: true } } },
    }),
    prisma.rateCardItem.count({ where: { tenantId: tenant.id } }),
    prisma.serviceCatalogItem.count({ where: { tenantId: tenant.id } }),
    prisma.learnedPattern.count({ where: { tenantId: tenant.id, active: true } }),
    prisma.template.count({ where: { tenantId: tenant.id, status: "active" } }),
  ]);

  // ---------- BOM tile rollups ----------
  type BomTileRow = {
    id: string;
    engagementId: string;
    engagementName: string;
    customer: string;
    cloud: string;
    version: number;
    createdAt: Date;
    monthlyUsd: number;
    annualUsd: number;
  };
  const bomTileRows: BomTileRow[] = recentBoms.map((d) => {
    const m = (d.metadata ?? {}) as { monthlyComputeBaselineUsdByCloud?: Record<string, number>; landingZoneBaselineMonthlyUsdByCloud?: Record<string, number> };
    const cloud = d.cloudProvider ?? "azure";
    const wkl = m.monthlyComputeBaselineUsdByCloud?.[cloud] ?? 0;
    const lz = m.landingZoneBaselineMonthlyUsdByCloud?.[cloud] ?? 0;
    const monthlyUsd = Math.round((wkl + lz) * 100) / 100;
    return {
      id: d.id,
      engagementId: d.engagement.id,
      engagementName: d.engagement.name,
      customer: d.engagement.customer,
      cloud,
      version: d.version,
      createdAt: d.createdAt,
      monthlyUsd,
      annualUsd: Math.round(monthlyUsd * 12),
    };
  });
  const bomTotalsPerCloud: Record<string, number> = {};
  for (const r of bomTileRows) {
    bomTotalsPerCloud[r.cloud] = (bomTotalsPerCloud[r.cloud] ?? 0) + r.annualUsd;
  }

  const activeEngagements = engagements.filter((e) => isOpenStage(e.stage));
  const wonEngagements = engagements.filter((e) => e.stage === "closed_won");
  const totalDeliverables = engagements.reduce((s, e) => s + e.deliverables.length, 0);

  // ---------- MCEM pipeline funnel: counts + USD per phase ----------
  type PhaseRow = { phase: McemPhase; count: number; usd: number };
  const phaseRows: PhaseRow[] = MCEM_PHASES.map((p) => ({ phase: p, count: 0, usd: 0 }));
  for (const e of activeEngagements) {
    const p = phaseForStage(e.stage);
    const row = phaseRows.find((r) => r.phase === p);
    if (!row) continue;
    row.count += 1;
    // Sum opportunity USD that auto-links to this engagement.
    for (const o of opportunities) {
      if (customerNamesMatch(o.customer, e.customer)) {
        row.usd += Number(o.valueUsd ?? 0);
      }
    }
  }

  // ---------- Next actions across all open engagements ----------
  type NextActionRow = {
    engagementId: string;
    engagementName: string;
    customer: string;
    phase: McemPhase;
    label: string;
    actionPath: string;
  };
  const nextActions: NextActionRow[] = [];
  for (const e of activeEngagements) {
    const na = nextAction(e.mcem as Mcem | null, e.stage);
    if (!na) continue;
    const path = (na.actionPath ?? "/engagements/{id}/mcem").replace("{id}", e.id);
    nextActions.push({
      engagementId: e.id,
      engagementName: e.name,
      customer: e.customer,
      phase: na.phase,
      label: na.label,
      actionPath: path,
    });
  }
  nextActions.splice(thresholds.dashboardNextActionsMax); // cap

  const firstName = user.name ? user.name.split(" ")[0] : null;
  const hasEngagements = engagements.length > 0;
  const totalActiveUsd = phaseRows.reduce((s, r) => s + r.usd, 0);

  // First-time user checklist
  const checklist = [
    { done: rateCount > 0,     label: "Upload your rate card",                   href: "/settings/rate-card" },
    { done: catalogCount > 0,  label: "Add service catalog entries",             href: "/settings/service-catalog" },
    { done: templateCount > 0, label: "Drop a sample doc into the Reference library", href: "/library" },
    { done: trackerCount > 0,  label: "Connect a pipeline source",               href: "/pipeline/trackers/new" },
    { done: hasEngagements,    label: "Create your first engagement",            href: "/engagements/new" },
  ];
  const checklistDone = checklist.filter((c) => c.done).length;

  return (
    <div className="space-y-6">
      {/* ───────── Hero ───────── */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/[0.07] via-primary/[0.03] to-transparent">
        <CardContent className="p-5 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-primary font-semibold flex items-center gap-2 flex-wrap">
                <span>Welcome back{firstName ? `, ${firstName}` : ""}</span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] tracking-normal font-medium">
                  {fyQuarterLabel(fy, new Date())}
                </span>
              </p>
              <h1 className="text-2xl md:text-3xl font-semibold mt-1 leading-tight">
                Your unified multicloud presales workspace.
              </h1>
              <p className="text-sm md:text-base text-muted-foreground mt-2 max-w-2xl">
                Listen, design, propose, win — all in one place. Drop customer documents, the agent classifies the
                engagement, recommends Azure / AWS / GCP solutions, and tracks every MCEM phase from first meeting to
                closed-won.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button asChild size="lg">
                <Link href="/engagements/new">Start a new engagement →</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/help">See how it works</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ───────── BOM headline tile ───────── */}
      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <span>🧾 BOM pipeline</span>
            <HelpTooltip text="Per-cloud annual cost rolled up across every BOM generated this tenant. Each row shows the latest BOM per engagement with monthly + annual USD pulled from the stored line-items + landing-zone baseline. Click to open the BOM workspace." />
            <span className="text-xs font-normal text-muted-foreground">
              {bomTileRows.length} recent BOM{bomTileRows.length === 1 ? "" : "s"}
            </span>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            The headline deliverable — Azure / AWS cost models grounded in live retail prices + Reference list pricing for landing-zone components. Drives the proposal conversation.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {bomTileRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No BOMs generated yet. <Link href="/engagements/new" className="underline">Create an engagement</Link>, upload an inventory, then run the BOM generator on the engagement page.
            </p>
          ) : (
            <>
              {Object.keys(bomTotalsPerCloud).length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {(["azure", "aws", "gcp", "compare"] as const).map((c) => {
                    const total = bomTotalsPerCloud[c];
                    if (!total) return null;
                    return (
                      <div key={c} className="rounded-md border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <CloudChip cloud={c} size="xs" />
                          <span className="text-[10px] text-muted-foreground uppercase">Annual</span>
                        </div>
                        <div className="text-lg font-semibold tabular-nums mt-1">${Math.round(total).toLocaleString()}</div>
                      </div>
                    );
                  })}
                </div>
              )}
              <ul className="divide-y border rounded-md">
                {bomTileRows.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/engagements/${r.engagementId}/bom?cloud=${r.cloud}&v=${r.version}`}
                      className="block px-3 py-2 hover:bg-accent transition"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap text-sm">
                        <span className="flex items-center gap-2 flex-wrap min-w-0">
                          <CloudChip cloud={r.cloud} size="xs" />
                          <span className="font-medium truncate">{r.customer}</span>
                          <span className="text-muted-foreground truncate">{r.engagementName}</span>
                          <span className="text-[10px] uppercase rounded px-1.5 py-0.5 bg-accent">v{r.version}</span>
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          <span className="font-medium text-foreground">${Math.round(r.monthlyUsd).toLocaleString()}/mo</span>
                          <span> · ${Math.round(r.annualUsd).toLocaleString()}/yr · {relTime(r.createdAt)}</span>
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {/* ───────── 2-tile action row ───────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ActionTile
          href="/engagements/new"
          tag="New engagement"
          title="Capture customer data →"
          icon="⇉"
          body="Drop customer documents → the agent extracts customer + scope + cloud and creates the engagement. Generate any deliverable (BOM / Architecture / SOW / Proposal / TCO) from the engagement page whenever you need it — one at a time or the full guided pipeline."
          useWhen="Every new customer opportunity starts here."
        />
        <ActionTile
          href="/pipeline"
          tag="Pipeline tracker"
          title="Consolidate every source →"
          icon="📊"
          body="Upload your Microsoft biweekly / SMB / SMC / ENT-PS / sales-rep / funding trackers once; see closing-this-month + at-risk consolidated."
          useWhen="Use to plan your week and report to finance."
        />
      </div>

      {/* ───────── First-time quick-start (hides once any engagement exists) ───────── */}
      {!hasEngagements && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
              <span>Get set up — quick-start checklist</span>
              <span className="text-xs text-muted-foreground font-normal">{checklistDone}/{checklist.length} done</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Five short steps the platform needs once. Each unlocks better output downstream. Skip what you don&apos;t need today.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {checklist.map((c) => (
                <li key={c.href}>
                  <Link
                    href={c.href}
                    className={`flex items-start gap-2 rounded-md border p-3 hover:border-primary transition ${
                      c.done ? "bg-emerald-50/40 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-900/40" : ""
                    }`}
                  >
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold shrink-0 ${
                      c.done ? "bg-emerald-600 text-white" : "border border-muted-foreground/30 text-muted-foreground"
                    }`}>
                      {c.done ? "✓" : ""}
                    </span>
                    <span className={`text-sm ${c.done ? "line-through text-muted-foreground" : ""}`}>{c.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ───────── Today rail: MCEM funnel | Next actions | This week ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* MCEM pipeline by phase */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">MCEM pipeline <HelpTooltip text="Open engagements grouped by their current MCEM phase (Listen / Design / Empower / Realize / Manage). USD totals come from matched pipeline opportunities (committed + won) for each phase." /></span>
              <span className="text-xs text-muted-foreground font-normal">
                {activeEngagements.length} open · ${Math.round(totalActiveUsd).toLocaleString()}
              </span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">Open engagements by methodology phase. USD totals from linked pipeline opportunities.</p>
          </CardHeader>
          <CardContent>
            {activeEngagements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open engagements yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {phaseRows.map((row) => {
                  const pct = activeEngagements.length > 0 ? Math.round((row.count / activeEngagements.length) * 100) : 0;
                  return (
                    <li key={row.phase}>
                      <div className="flex justify-between items-baseline mb-1 gap-2">
                        <span className="font-medium">{PHASE_LABELS[row.phase]}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {row.count} · ${Math.round(row.usd).toLocaleString()}
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full ${PHASE_BAR_COLOR[row.phase]}`} style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Next actions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-1.5">
              Next actions
              <HelpTooltip text="The first unchecked MCEM exit-criterion for every open engagement. Each row deep-links to the right deliverable page (Assessment / Architecture / BOM / Proposal …)." />
            </CardTitle>
            <p className="text-xs text-muted-foreground">First open MCEM exit-criterion per engagement. Click to jump to the right page.</p>
          </CardHeader>
          <CardContent>
            {nextActions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {hasEngagements ? "Nothing overdue — every open engagement is on track." : "No open engagements yet. Start one to see your next steps here."}
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {nextActions.map((a, i) => (
                  <li key={`${a.engagementId}-${i}`}>
                    <Link href={a.actionPath} className="block rounded-md border p-2 hover:border-primary transition">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-medium truncate">{a.label}</span>
                        <span className="text-[10px] uppercase rounded px-1.5 py-0.5 bg-accent shrink-0">{PHASE_SHORT[a.phase]}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {a.engagementName} · {a.customer}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* This week */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-1.5">
              This week
              <HelpTooltip text={`Deliverables generated in the last ${thresholds.dashboardLookbackDays} days. Adjust the window on /settings → Thresholds.`} />
            </CardTitle>
            <p className="text-xs text-muted-foreground">Deliverables generated in the last 7 days.</p>
          </CardHeader>
          <CardContent>
            {recentDeliverables.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing generated this week. Open an engagement and generate a deliverable to see it here.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {recentDeliverables.map((d, i) => (
                  <li key={`${d.engagement.id}-${d.type}-${i}`} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{deliverableLabel(d.type)}</span>
                      {d.cloudProvider && (
                        <span className="ml-1.5 inline-block align-middle">
                          <CloudChip cloud={d.cloudProvider} size="xs" />
                        </span>
                      )}
                      <span className="text-muted-foreground"> · </span>
                      <Link href={`/engagements/${d.engagement.id}`} className="hover:underline">
                        {d.engagement.name}
                      </Link>
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">{relTime(d.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ───────── Active engagements list ───────── */}
      {hasEngagements && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Active engagements</span>
              <Link href="/engagements" className="text-xs font-normal text-muted-foreground hover:text-foreground">
                View all ({engagements.length}) →
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeEngagements.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                All engagements are closed. <Link href="/engagements/new" className="underline">Start a new one</Link>.
              </p>
            ) : (
              <ul className="divide-y">
                {activeEngagements.slice(0, thresholds.dashboardActiveMax).map((project) => {
                  const targetClouds = ((project.targetClouds as string[] | null) ?? ["azure"]).filter((c) => c !== "gcp");
                  const h = mcemScore(project.mcem as Mcem | null, project.stage);
                  const band = tenantMcemBand(tenant, h.totalPct);
                  const cls = band === "green"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : band === "amber" ? "text-amber-700 dark:text-amber-300"
                    : "text-rose-700 dark:text-rose-300";
                  return (
                    <li key={project.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <Link href={`/engagements/${project.id}`} className="font-medium hover:underline truncate inline-block max-w-full">
                            {project.name}
                          </Link>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {project.customer}
                            {project.industry && ` · ${project.industry}`}
                            {project.customerSegment && ` · ${project.customerSegment}`}
                            {project.engagementType && project.engagementType !== "unknown" && (
                              <span className="ml-1 text-foreground">· {engagementTypeLabel(project.engagementType)}</span>
                            )}
                          </p>
                          <div className="flex items-center gap-3 mt-2 flex-wrap">
                            <div className="flex gap-1">
                              {targetClouds.map((c) => <CloudChip key={c} cloud={c} size="xs" />)}
                            </div>
                            <span className="text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 bg-muted">
                              {stageLabel(project.stage)}
                            </span>
                            <span className={`text-xs ${cls}`} title={h.blockers[0]?.reason ?? "Phase complete"}>
                              MCEM · {h.phaseLabel} · {h.done}/{h.total} ✓
                            </span>
                            <span className="text-xs text-muted-foreground">· {relTime(project.updatedAt)}</span>
                          </div>
                        </div>
                        <Button asChild variant="outline" size="sm" className="shrink-0">
                          <Link href={`/engagements/${project.id}`}>Continue →</Link>
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* ───────── Footer ───────── */}
      <div className="text-xs text-muted-foreground border-t pt-3 flex items-center gap-3 flex-wrap">
        <span>Rate card: <Link href="/settings/rate-card" className="underline">{rateCount} roles</Link></span>
        <span>·</span>
        <span>Service catalog: <Link href="/settings/service-catalog" className="underline">{catalogCount} services</Link></span>
        <span>·</span>
        <span>Custom rules: <Link href="/settings/patterns" className="underline">{patternCount} active</Link></span>
        <span>·</span>
        <Link href="/services" className="underline">Services mapping</Link>
        <span>·</span>
        <Link href="/library" className="underline">Reference library</Link>
        <span>·</span>
        <Link href="/settings" className="underline">All settings</Link>
      </div>
    </div>
  );
}

function ActionTile({
  href, tag, title, icon, body, useWhen,
}: {
  href: string; tag: string; title: string; icon: string; body: string; useWhen: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border bg-card p-4 hover:border-primary hover:shadow-md hover:-translate-y-0.5 transition-all group flex flex-col"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{tag}</div>
          <div className="text-base font-semibold mt-0.5 group-hover:text-primary">{title}</div>
        </div>
        <span className="text-2xl leading-none text-muted-foreground group-hover:text-primary shrink-0">{icon}</span>
      </div>
      <p className="text-sm text-muted-foreground mt-2 flex-1">{body}</p>
      <p className="text-xs text-muted-foreground mt-3 italic">{useWhen}</p>
    </Link>
  );
}
