import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadInputForm } from "@/components/upload-input-form";
import { ProjectModeToggle } from "@/components/project-mode-toggle";
import { ExtractWorkloadsButton } from "@/components/extract-workloads-button";
import { SmartWorkflow } from "@/components/smart-workflow";
import { CloudChip } from "@/components/cloud-chip";

const PROJECT_TYPE_LABELS: Record<string, string> = {
  migration: "Migration",
  greenfield: "Greenfield",
  modernization: "Modernization",
  dr: "DR / Resilience",
  poc: "POC / Pilot",
  optimization: "Optimization",
  unknown: "—",
};

type Deliverable = {
  id: string;
  type: string;
  cloudProvider: string | null;
  version: number;
  status: string;
  createdAt: Date;
};

const DELIVERABLE_DEFS: Array<{
  type: string;
  title: string;
  desc: string;
  basePath: (id: string) => string;
  showCloud: boolean;
  group: "discover" | "design" | "commercial" | "delivery";
  groupLabel: string;
}> = [
  { type: "customer_study", title: "Customer study",  desc: "Pre-engagement briefing — customer profile + IT landscape",  basePath: (id) => `/projects/${id}/customer-study`, showCloud: false, group: "discover", groupLabel: "Discover" },
  { type: "assessment",     title: "Assessment",      desc: "Full-stack readiness — infra / platform / app / DB",         basePath: (id) => `/projects/${id}/assessment`,     showCloud: true,  group: "discover", groupLabel: "Discover" },
  { type: "architecture",   title: "Architecture",    desc: "Target landing zone + Mermaid diagrams",                     basePath: (id) => `/projects/${id}/architecture`,   showCloud: true,  group: "design",   groupLabel: "Design" },
  { type: "bom",            title: "BOM",             desc: "Year-1 cost — live cloud prices + services",                 basePath: (id) => `/projects/${id}/bom`,            showCloud: true,  group: "commercial", groupLabel: "Commercial" },
  { type: "tco",            title: "TCO",             desc: "3-5 year scenarios + sensitivity analysis",                  basePath: (id) => `/projects/${id}/tco`,            showCloud: true,  group: "commercial", groupLabel: "Commercial" },
  { type: "project_plan",   title: "Project plan",    desc: "Phased rollout + Mermaid Gantt + RACI",                      basePath: (id) => `/projects/${id}/project-plan`,   showCloud: true,  group: "delivery", groupLabel: "Delivery" },
  { type: "proposal",       title: "Proposal",        desc: "Customer-facing pitch composing the above",                  basePath: (id) => `/projects/${id}/proposal`,       showCloud: true,  group: "commercial", groupLabel: "Commercial" },
  { type: "sow",            title: "SOW",             desc: "Legal-grade scope (post-decision)",                          basePath: (id) => `/projects/${id}/sow`,            showCloud: true,  group: "delivery", groupLabel: "Delivery" },
  { type: "ms_offering",    title: "Managed services", desc: "Run/operate offering for post-handover",                    basePath: (id) => `/projects/${id}/ms-offering`,    showCloud: true,  group: "delivery", groupLabel: "Delivery" },
];

function relTime(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(date).toLocaleDateString();
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const project = await prisma.project.findFirst({
    where: { id, tenant: { users: { some: { id: session!.user.id } } } },
    include: {
      inputs: { orderBy: { createdAt: "desc" } },
      deliverables: { orderBy: [{ type: "asc" }, { version: "desc" }] },
      feedback: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  if (!project) notFound();

  const targetClouds = (project.targetClouds as string[]) ?? ["azure"];
  const cloudRegions = (project.cloudRegions as Record<string, { primary: string; dr: string }> | null) ?? {};

  const byType = (t: string) => project.deliverables.filter((d) => d.type === t) as Deliverable[];
  const groupedDeliverables = DELIVERABLE_DEFS.map((def) => ({ def, items: byType(def.type) }));

  const latestInput = project.inputs[0];
  const hasInput = !!latestInput;
  const hasInventory = project.inputs.some((i) => i.workloadsJson);

  // existingByStage map for SmartWorkflow
  const STAGE_FROM_TYPE: Record<string, string> = {
    customer_study: "customer-study",
    assessment: "assessment",
    architecture: "architecture",
    bom: "bom",
    tco: "tco",
    project_plan: "project-plan",
    proposal: "proposal",
    sow: "sow",
    ms_offering: "ms-offering",
  };
  const existingByStage: Record<string, string[]> = {};
  const CLOUD_AGNOSTIC_STAGES = new Set(["customer-study"]);
  function ensureCloud(c: string) {
    if (!existingByStage[c]) existingByStage[c] = [];
  }
  for (const d of project.deliverables) {
    const stage = STAGE_FROM_TYPE[d.type];
    if (!stage) continue;
    if (CLOUD_AGNOSTIC_STAGES.has(stage)) {
      for (const c of [...targetClouds, "compare"]) {
        ensureCloud(c);
        if (!existingByStage[c].includes(stage)) existingByStage[c].push(stage);
      }
      continue;
    }
    const cloud = d.cloudProvider ?? "azure";
    ensureCloud(cloud);
    if (!existingByStage[cloud].includes(stage)) existingByStage[cloud].push(stage);
  }

  return (
    <div className="space-y-6">
      {/* Header — project info only, no deliverable buttons (cards do navigation) */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl md:text-2xl font-semibold truncate">{project.name}</h1>
            <span className="text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 bg-muted text-muted-foreground">
              {project.stage}
            </span>
            {project.projectType && project.projectType !== "unknown" && (
              <span className="text-xs rounded-full px-2 py-0.5 bg-primary/10 text-primary">
                {PROJECT_TYPE_LABELS[project.projectType]}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {project.customer}
            {project.industry && <> · {project.industry}</>}
            {project.customerSegment && <> · {project.customerSegment}</>}
          </p>
          {project.scopeSummary && (
            <p className="text-sm text-foreground/80 mt-2 max-w-3xl">{project.scopeSummary}</p>
          )}
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {targetClouds.map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs chip-azure" style={c === "aws" ? undefined : undefined}>
                <CloudChip cloud={c} size="xs" />
                {cloudRegions[c] && (
                  <span className="text-muted-foreground text-[11px]">{cloudRegions[c].primary}</span>
                )}
                {project.primaryCloud === c && <span title="Primary cloud">★</span>}
              </span>
            ))}
          </div>
        </div>
        <div className="shrink-0">
          <ProjectModeToggle projectId={project.id} initialMode={project.mode as "production" | "training"} />
        </div>
      </div>

      {/* Inputs */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Inputs</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <UploadInputForm projectId={project.id} />
          {project.inputs.length > 0 && (
            <ul className="divide-y text-sm">
              {project.inputs.map((i) => {
                const hasWorkloads = !!i.workloadsJson;
                const hasText = !!i.textContent;
                const canTryExtract = !hasWorkloads && hasText;
                return (
                  <li key={i.id} className="py-2.5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 bg-accent">{i.kind}</span>
                        {i.filename && <span className="font-medium truncate">{i.filename}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{i.rawSummary}</p>
                    </div>
                    {canTryExtract && (
                      <div className="shrink-0">
                        <ExtractWorkloadsButton projectId={project.id} inputId={i.id} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Smart workflow */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Smart workflow</CardTitle>
          <p className="text-xs text-muted-foreground">
            The agent classifies the engagement type from your inputs and recommends a deliverable
            sequence. One click runs them in dependency order.
          </p>
        </CardHeader>
        <CardContent>
          <SmartWorkflow
            projectId={project.id}
            projectType={project.projectType}
            projectTypeConfidence={project.projectTypeConfidence}
            projectTypeRationale={project.projectTypeRationale}
            suggestedDeliverables={project.suggestedDeliverables ?? []}
            targetClouds={targetClouds}
            hasInventory={hasInventory}
            existingByStage={existingByStage}
          />
        </CardContent>
      </Card>

      {/* Deliverable cards grouped by lifecycle phase */}
      {(["discover", "design", "commercial", "delivery"] as const).map((group) => {
        const groupDefs = groupedDeliverables.filter(({ def }) => def.group === group);
        if (groupDefs.length === 0) return null;
        const groupLabel = groupDefs[0].def.groupLabel;
        return (
          <section key={group} className="space-y-2">
            <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold px-1">{groupLabel}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {groupDefs.map(({ def, items }) => (
                <DeliverableCard
                  key={def.type}
                  title={def.title}
                  description={def.desc}
                  items={items}
                  basePath={def.basePath(project.id)}
                  showCloud={def.showCloud}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* Recent training feedback */}
      {project.feedback.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Recent training feedback</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {project.feedback.map((f) => {
                const patterns = Array.isArray(f.extractedPatterns) ? f.extractedPatterns : [];
                return (
                  <li key={f.id} className="border-l-2 border-primary/40 pl-3">
                    <p>
                      <span className="font-medium capitalize">{f.deliverableType}</span>{" "}
                      <span className="text-muted-foreground text-xs">· {relTime(f.createdAt)} · {patterns.length} pattern(s)</span>
                    </p>
                    <p className="text-muted-foreground italic line-clamp-2">"{f.feedback.slice(0, 200)}"</p>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DeliverableCard({
  title,
  description,
  items,
  basePath,
  showCloud,
}: {
  title: string;
  description: string;
  items: Deliverable[];
  basePath: string;
  showCloud: boolean;
}) {
  const isEmpty = items.length === 0;
  // Per-cloud version count
  const byCloud = new Map<string, number>();
  for (const d of items) {
    const c = d.cloudProvider ?? "azure";
    byCloud.set(c, (byCloud.get(c) ?? 0) + 1);
  }
  const latest = items[0];

  return (
    <Link
      href={basePath}
      className="group block rounded-lg border bg-card hover:border-primary/40 hover:shadow-sm transition p-4 space-y-2 min-h-[140px]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold truncate">{title}</p>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{description}</p>
        </div>
        <span className={`shrink-0 inline-flex items-center justify-center rounded-full text-[10px] font-bold w-6 h-6 ${
          isEmpty
            ? "bg-muted text-muted-foreground"
            : "bg-primary text-primary-foreground"
        }`}>
          {items.length}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {showCloud && byCloud.size > 0 ? (
            [...byCloud.entries()].map(([cloud, count]) => (
              <span key={cloud} className="inline-flex items-center gap-1">
                <CloudChip cloud={cloud} size="xs" />
                <span className="text-[10px] text-muted-foreground">×{count}</span>
              </span>
            ))
          ) : isEmpty ? (
            <span className="text-xs text-muted-foreground italic">not generated yet</span>
          ) : null}
        </div>
        <span className="text-[11px] text-muted-foreground group-hover:text-primary shrink-0 whitespace-nowrap">
          {latest ? `Latest ${relTime(latest.createdAt)}` : ""} →
        </span>
      </div>
    </Link>
  );
}
