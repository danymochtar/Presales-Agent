import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadInputForm } from "@/components/upload-input-form";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const project = await prisma.project.findFirst({
    where: { id, tenant: { users: { some: { id: session!.user.id } } } },
    include: {
      inputs: { orderBy: { createdAt: "desc" } },
      deliverables: { orderBy: [{ type: "asc" }, { version: "desc" }] },
    },
  });
  if (!project) notFound();

  const boms = project.deliverables.filter((d) => d.type === "bom");
  const latestInput = project.inputs[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p className="text-sm text-muted-foreground">{project.customer} · {project.industry ?? "—"} · {project.primaryRegion} → {project.drRegion}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" disabled={!latestInput}>
            <Link href={latestInput ? `/projects/${project.id}/bom` : "#"}>Generate BOM</Link>
          </Button>
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

      <Card>
        <CardHeader><CardTitle>BOMs</CardTitle></CardHeader>
        <CardContent>
          {boms.length === 0 ? (
            <p className="text-sm text-muted-foreground">No BOM generated yet. {latestInput ? "Click Generate BOM above." : "Upload an inventory first."}</p>
          ) : (
            <ul className="divide-y text-sm">
              {boms.map((b) => (
                <li key={b.id} className="py-2 flex justify-between items-center">
                  <Link href={`/projects/${project.id}/bom?v=${b.version}`} className="hover:underline">
                    BOM v{b.version} <span className="text-muted-foreground">· {b.status}</span>
                  </Link>
                  <span className="text-xs text-muted-foreground">{new Date(b.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
