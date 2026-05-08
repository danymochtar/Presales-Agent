import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CloudChip } from "@/components/cloud-chip";

export default async function ProjectsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const { tenant } = await requireSessionAndTenant(session!.user.id);
  const projects = await prisma.project.findMany({
    where: { tenantId: tenant.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { deliverables: true, inputs: true } } },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl md:text-2xl font-semibold">Projects</h1>
        <Button asChild size="sm"><Link href="/projects/new">+ New project</Link></Button>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">All projects</CardTitle></CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No projects yet. <Link href="/projects/new" className="underline">Create one</Link>.
            </p>
          ) : (
            <ul className="divide-y">
              {projects.map((p) => {
                const targetClouds = ((p.targetClouds as string[] | null) ?? ["azure"]).filter((c) => c !== "gcp");
                return (
                  <li key={p.id} className="py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <Link href={`/projects/${p.id}`} className="font-medium hover:underline truncate inline-block max-w-full">{p.name}</Link>
                      <p className="text-xs text-muted-foreground truncate">{p.customer} · {p.stage} · {p.mode}</p>
                      <div className="flex gap-1 mt-1.5">
                        {targetClouds.map((c) => <CloudChip key={c} cloud={c} size="xs" />)}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0 sm:text-right">
                      {p._count.inputs} input · {p._count.deliverables} doc
                    </div>
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
