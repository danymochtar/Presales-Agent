import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CloudChip } from "@/components/cloud-chip";

import { projectTypeLabel, DELIVERABLE_PREREQS, kindOfDbType } from "@/lib/deliverable-prereqs";
import { relTime } from "@/lib/format-time";
import { score as meddpiccScore, healthBand, type Meddpicc } from "@/lib/meddpicc";

const STAGE_TYPES = ["assessment", "architecture", "bom", "tco", "project_plan", "proposal"];

const deliverableLabel = (dbType: string): string => {
  const k = kindOfDbType(dbType);
  return k ? DELIVERABLE_PREREQS[k].label : dbType;
};

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const { user, tenant } = await requireSessionAndTenant(session!.user.id);

  const [projects, recentDeliverables, rateCount, catalogCount, patternCount] = await Promise.all([
    prisma.project.findMany({
      where: { tenantId: tenant.id },
      orderBy: { updatedAt: "desc" },
      include: {
        deliverables: { select: { type: true, cloudProvider: true } },
        _count: { select: { inputs: true } },
      },
    }),
    prisma.deliverable.findMany({
      where: { project: { tenantId: tenant.id } },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { project: { select: { id: true, name: true } } },
    }),
    prisma.rateCardItem.count({ where: { tenantId: tenant.id } }),
    prisma.serviceCatalogItem.count({ where: { tenantId: tenant.id } }),
    prisma.learnedPattern.count({ where: { tenantId: tenant.id, active: true } }),
  ]);

  const activeProjects = projects.filter((p) => p.stage === "draft" || p.stage === "pending");
  const wonProjects = projects.filter((p) => p.stage === "won");
  const totalDeliverables = projects.reduce((s, p) => s + p.deliverables.length, 0);
  const totalBoms = projects.reduce(
    (s, p) => s + p.deliverables.filter((d) => d.type === "bom").length,
    0,
  );
  const totalInputs = projects.reduce((s, p) => s + p._count.inputs, 0);

  const cloudCounts: Record<string, number> = { azure: 0, aws: 0, gcp: 0, compare: 0, multi: 0 };
  for (const p of projects) {
    for (const d of p.deliverables) {
      const c = d.cloudProvider ?? "azure";
      cloudCounts[c] = (cloudCounts[c] ?? 0) + 1;
    }
  }

  const progressByProject = projects.map((p) => {
    const stagesPresent = new Set(p.deliverables.map((d) => d.type));
    const completed = STAGE_TYPES.filter((s) => stagesPresent.has(s)).length;
    return { project: p, completed, total: STAGE_TYPES.length };
  });

  const firstName = user.name ? user.name.split(" ")[0] : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">
            Welcome back{firstName ? `, ${firstName}` : ""}.
          </h1>
          <p className="text-sm text-muted-foreground">
            {tenant.country} · {tenant.currency}
            {tenant.fxMyrPerUsd ? ` · FX MYR/USD ${tenant.fxMyrPerUsd}` : ""}
            {" · "}
            <Link href="/help" className="underline hover:text-foreground">First time? Open the guide</Link>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Link
          href="/projects/new"
          className="rounded-lg border bg-card p-4 hover:border-primary hover:shadow-sm transition group"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Full project</div>
              <div className="text-base font-semibold mt-0.5 group-hover:text-primary">Start a new engagement →</div>
            </div>
            <span className="text-2xl leading-none text-muted-foreground group-hover:text-primary">⇉</span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Drop any customer docs (RVTools, Azure Migrate, RFP, meeting notes). The agent classifies the
            engagement and walks you through the recommended deliverable flow.
          </p>
          <p className="text-xs text-muted-foreground mt-2">Use when: end-to-end study → BOM → proposal → SOW.</p>
        </Link>

        <Link
          href="/quick"
          className="rounded-lg border bg-card p-4 hover:border-primary hover:shadow-sm transition group"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Quick generate</div>
              <div className="text-base font-semibold mt-0.5 group-hover:text-primary">One document, just the prereqs →</div>
            </div>
            <span className="text-2xl leading-none text-muted-foreground group-hover:text-primary">⚡</span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Pick a single deliverable (BOM, Architecture, SOW…) and supply only what it actually needs.
            No full project scaffolding.
          </p>
          <p className="text-xs text-muted-foreground mt-2">Use when: standalone BOM from inventory, SOW from existing scope, etc.</p>
        </Link>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Active projects" value={activeProjects.length} sublabel={`${wonProjects.length} won`} />
        <KpiCard label="Total deliverables" value={totalDeliverables} sublabel="across all projects" />
        <KpiCard label="BOMs generated" value={totalBoms} sublabel="across all clouds" />
        <KpiCard label="Documents uploaded" value={totalInputs} sublabel="across projects" />
      </div>

      {/* Active projects */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Active projects</span>
            {activeProjects.length > 0 && (
              <Link href="/projects" className="text-xs font-normal text-muted-foreground hover:text-foreground">
                View all →
              </Link>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active projects yet. <Link href="/projects/new" className="underline">Create one</Link> by uploading customer documents — the agent will classify the engagement and recommend a deliverable flow.
            </p>
          ) : (
            <ul className="divide-y">
              {progressByProject
                .filter(({ project }) => project.stage === "draft" || project.stage === "pending")
                .slice(0, 5)
                .map(({ project, completed, total }) => {
                  const targetClouds = ((project.targetClouds as string[] | null) ?? ["azure"]).filter((c) => c !== "gcp");
                  return (
                    <li key={project.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <Link href={`/projects/${project.id}`} className="font-medium hover:underline truncate inline-block max-w-full">
                            {project.name}
                          </Link>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {project.customer}
                            {project.industry && ` · ${project.industry}`}
                            {project.customerSegment && ` · ${project.customerSegment}`}
                            {project.projectType && project.projectType !== "unknown" && (
                              <span className="ml-1 text-foreground">· {projectTypeLabel(project.projectType)}</span>
                            )}
                          </p>
                          <div className="flex items-center gap-3 mt-2 flex-wrap">
                            <div className="flex gap-1">
                              {targetClouds.map((c) => <CloudChip key={c} cloud={c} size="xs" />)}
                            </div>
                            <ProgressDots completed={completed} total={total} />
                            <span className="text-xs text-muted-foreground">
                              {completed}/{total} stages
                            </span>
                            {(() => {
                              const h = meddpiccScore(project.meddpicc as Meddpicc | null, project.stage);
                              const band = healthBand(h.totalPct);
                              const cls = band === "green"
                                ? "text-emerald-700 dark:text-emerald-300"
                                : band === "amber" ? "text-amber-700 dark:text-amber-300"
                                : "text-rose-700 dark:text-rose-300";
                              return (
                                <span className={`text-xs ${cls}`} title={h.blockers[0]?.reason ?? "Well qualified"}>
                                  · MEDDPICC {h.totalPct}%
                                </span>
                              );
                            })()}
                            <span className="text-xs text-muted-foreground">· {relTime(project.updatedAt)}</span>
                          </div>
                        </div>
                        <Button asChild variant="outline" size="sm" className="shrink-0">
                          <Link href={`/projects/${project.id}`}>Continue →</Link>
                        </Button>
                      </div>
                    </li>
                  );
                })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 2-col: Recent activity + Cloud distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
          <CardContent>
            {recentDeliverables.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No deliverables generated yet. Upload customer docs and run the smart workflow on your first project.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {recentDeliverables.map((d, i) => (
                  <li key={`${d.project.id}-${d.type}-${i}`} className="flex justify-between gap-3">
                    <span className="min-w-0">
                      <span className="text-muted-foreground">Generated </span>
                      <span className="font-medium">{deliverableLabel(d.type)}</span>
                      {d.cloudProvider && (
                        <span className="ml-1.5 inline-block align-middle">
                          <CloudChip cloud={d.cloudProvider} size="xs" />
                        </span>
                      )}
                      <span className="text-muted-foreground"> for </span>
                      <Link href={`/projects/${d.project.id}`} className="hover:underline">
                        {d.project.name}
                      </Link>
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">{relTime(d.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Cloud distribution</CardTitle></CardHeader>
          <CardContent>
            {totalDeliverables === 0 ? (
              <p className="text-sm text-muted-foreground">No deliverables yet.</p>
            ) : (
              <ul className="space-y-2.5 text-sm">
                {(["azure", "aws", "gcp", "compare", "multi"] as const).map((cloud) => {
                  const count = cloudCounts[cloud] ?? 0;
                  if (count === 0 && cloud !== "azure" && cloud !== "aws") return null;
                  const pct = totalDeliverables > 0 ? Math.round((count / totalDeliverables) * 100) : 0;
                  const barColor =
                    cloud === "azure" ? "bg-[hsl(214_80%_55%)]" :
                    cloud === "aws" ? "bg-[hsl(25_90%_55%)]" :
                    cloud === "gcp" ? "bg-[hsl(142_70%_45%)]" :
                    "bg-[hsl(270_60%_55%)]";
                  return (
                    <li key={cloud}>
                      <div className="flex justify-between items-baseline mb-1">
                        <CloudChip cloud={cloud} size="xs" />
                        <span className="text-xs text-muted-foreground">{count} · {pct}%</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="text-xs text-muted-foreground border-t pt-3 flex items-center gap-3 flex-wrap">
        <span>Rate card: <Link href="/settings/rate-card" className="underline">{rateCount} roles</Link></span>
        <span>·</span>
        <span>Service catalog: <Link href="/settings/service-catalog" className="underline">{catalogCount} services</Link></span>
        <span>·</span>
        <span>Learned patterns: <Link href="/settings/patterns" className="underline">{patternCount} active</Link></span>
        <span>·</span>
        <Link href="/services" className="underline">Services mapping</Link>
        <span>·</span>
        <Link href="/settings" className="underline">All settings</Link>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sublabel }: { label: string; value: number; sublabel?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-3xl font-semibold mt-1 tabular-nums">{value}</div>
        {sublabel && <div className="text-xs text-muted-foreground mt-0.5">{sublabel}</div>}
      </CardContent>
    </Card>
  );
}

function ProgressDots({ completed, total }: { completed: number; total: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 w-4 rounded-sm ${i < completed ? "bg-primary" : "bg-muted"}`}
        />
      ))}
    </div>
  );
}
