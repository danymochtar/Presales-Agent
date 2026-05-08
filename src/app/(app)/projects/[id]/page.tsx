import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadInputForm } from "@/components/upload-input-form";
import { ProjectModeToggle } from "@/components/project-mode-toggle";

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

  const boms = project.deliverables.filter((d) => d.type === "bom");
  const proposals = project.deliverables.filter((d) => d.type === "proposal");
  const architectures = project.deliverables.filter((d) => d.type === "architecture");
  const latestInput = project.inputs[0];
  const latestBom = boms[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p className="text-sm text-muted-foreground">
            {project.customer} · {project.industry ?? "—"} · {project.primaryRegion} → {project.drRegion} · stage: {project.stage}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <ProjectModeToggle projectId={project.id} initialMode={project.mode as "production" | "training"} />
          <Button asChild variant="outline" size="sm"><Link href={`/projects/${project.id}/bom`}>BOM</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href={`/projects/${project.id}/architecture`}>Architecture</Link></Button>
          <Button asChild variant={latestBom ? "outline" : "ghost"} size="sm"><Link href={`/projects/${project.id}/proposal`}>Proposal</Link></Button>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <DeliverableCard title="BOMs" items={boms} basePath={`/projects/${project.id}/bom`} emptyMsg={latestInput ? "Open BOM page to generate." : "Upload an inventory first."} />
        <DeliverableCard title="Architectures" items={architectures} basePath={`/projects/${project.id}/architecture`} emptyMsg="Open Architecture page to generate." />
        <DeliverableCard title="Proposals" items={proposals} basePath={`/projects/${project.id}/proposal`} emptyMsg={latestBom ? "Open Proposal page to generate." : "Generate a BOM first."} />
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
}: {
  title: string;
  items: { id: string; version: number; status: string; createdAt: Date }[];
  basePath: string;
  emptyMsg: string;
}) {
  return (
    <Card>
      <CardHeader><CardTitle>{title} ({items.length})</CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMsg}</p>
        ) : (
          <ul className="divide-y text-sm">
            {items.map((d) => (
              <li key={d.id} className="py-2 flex justify-between items-center">
                <Link href={`${basePath}?v=${d.version}`} className="hover:underline">
                  v{d.version} <span className="text-muted-foreground">· {d.status}</span>
                </Link>
                <span className="text-xs text-muted-foreground">{new Date(d.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
