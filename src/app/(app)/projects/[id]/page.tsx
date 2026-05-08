import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadInputForm } from "@/components/upload-input-form";
import { ProjectModeToggle } from "@/components/project-mode-toggle";

const CLOUD_LABEL: Record<string, string> = {
  azure: "Azure",
  aws: "AWS",
  gcp: "GCP",
  compare: "Compare",
  multi: "Multi",
};

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

  const byType = (t: string) => project.deliverables.filter((d) => d.type === t);
  const boms = byType("bom");
  const proposals = byType("proposal");
  const architectures = byType("architecture");
  const assessments = byType("assessment");
  const latestInput = project.inputs[0];
  const hasBom = boms.length > 0;
  const hasInput = !!latestInput;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p className="text-sm text-muted-foreground">
            {project.customer} · {project.industry ?? "—"}{project.customerSegment ? ` · ${project.customerSegment}` : ""} · stage: {project.stage}
          </p>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {targetClouds.map((c) => (
              <span
                key={c}
                className={`text-xs rounded px-2 py-0.5 border ${
                  project.primaryCloud === c ? "bg-primary text-primary-foreground border-primary" : "bg-accent text-foreground"
                }`}
                title={cloudRegions[c] ? `${cloudRegions[c].primary} → ${cloudRegions[c].dr}` : ""}
              >
                {CLOUD_LABEL[c] ?? c}
                {cloudRegions[c] && <span className="opacity-70 ml-1">{cloudRegions[c].primary}</span>}
                {project.primaryCloud === c && " ★"}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center justify-end">
          <ProjectModeToggle projectId={project.id} initialMode={project.mode as "production" | "training"} />
          <Button asChild variant="outline" size="sm"><Link href={`/projects/${project.id}/assessment`}>Assessment</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href={`/projects/${project.id}/bom`}>BOM</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href={`/projects/${project.id}/architecture`}>Architecture</Link></Button>
          <Button asChild variant={hasBom ? "outline" : "ghost"} size="sm"><Link href={`/projects/${project.id}/proposal`}>Proposal</Link></Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Inputs</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <UploadInputForm projectId={project.id} />
          {project.inputs.length > 0 && (
            <ul className="divide-y text-sm">
              {project.inputs.map((i) => (
                <li key={i.id} className="py-2 flex justify-between">
                  <span>{i.kind}</span>
                  <span className="text-muted-foreground">{i.rawSummary}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <DeliverableCard
          title="Assessment"
          items={assessments}
          basePath={`/projects/${project.id}/assessment`}
          showCloud
          emptyMsg={hasInput ? "Score per-workload readiness" : "Upload inventory first"}
        />
        <DeliverableCard
          title="BOM"
          items={boms}
          basePath={`/projects/${project.id}/bom`}
          showCloud
          emptyMsg={hasInput ? "Generate BOM" : "Upload inventory first"}
        />
        <DeliverableCard
          title="Architecture"
          items={architectures}
          basePath={`/projects/${project.id}/architecture`}
          showCloud
          emptyMsg="Target-state architecture"
        />
        <DeliverableCard
          title="Proposal"
          items={proposals}
          basePath={`/projects/${project.id}/proposal`}
          showCloud
          emptyMsg={hasBom ? "Compose proposal from BOM" : "BOM first"}
        />
      </div>

      {project.feedback.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Recent training feedback</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {project.feedback.map((f) => {
                const patterns = Array.isArray(f.extractedPatterns) ? f.extractedPatterns : [];
                return (
                  <li key={f.id} className="border-l-2 border-primary pl-3">
                    <p>
                      <span className="font-medium capitalize">{f.deliverableType}</span> ·{" "}
                      <span className="text-muted-foreground text-xs">{new Date(f.createdAt).toLocaleString()}</span> ·{" "}
                      <span className="text-muted-foreground text-xs">{patterns.length} pattern(s) saved</span>
                    </p>
                    <p className="text-muted-foreground italic">"{f.feedback.slice(0, 160)}{f.feedback.length > 160 ? "…" : ""}"</p>
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
  items,
  basePath,
  emptyMsg,
  showCloud,
}: {
  title: string;
  items: { id: string; version: number; status: string; cloudProvider: string | null; createdAt: Date }[];
  basePath: string;
  emptyMsg: string;
  showCloud?: boolean;
}) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title} ({items.length})</CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMsg}</p>
        ) : (
          <ul className="divide-y text-sm">
            {items.slice(0, 5).map((d) => {
              const cloud = d.cloudProvider ?? "default";
              const cloudParam = showCloud && cloud !== "default" && cloud !== "multi" ? `?v=${d.version}&cloud=${cloud}` : `?v=${d.version}`;
              return (
                <li key={d.id} className="py-2 flex justify-between items-center gap-2">
                  <Link href={`${basePath}${cloudParam}`} className="hover:underline truncate">
                    {showCloud && cloud !== "default" && (
                      <span className="text-xs bg-accent rounded px-1.5 py-0.5 mr-1.5">{CLOUD_LABEL[cloud] ?? cloud}</span>
                    )}
                    v{d.version} <span className="text-muted-foreground text-xs">· {d.status}</span>
                  </Link>
                  <span className="text-xs text-muted-foreground shrink-0">{new Date(d.createdAt).toLocaleDateString()}</span>
                </li>
              );
            })}
            {items.length > 5 && (
              <li className="py-2 text-xs text-muted-foreground">
                <Link href={basePath} className="underline">+{items.length - 5} more</Link>
              </li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
