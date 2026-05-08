import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Button asChild><Link href="/projects/new">New project</Link></Button>
      </div>
      <Card>
        <CardHeader><CardTitle>All projects</CardTitle></CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects yet.</p>
          ) : (
            <ul className="divide-y">
              {projects.map((p) => (
                <li key={p.id} className="py-3 flex justify-between items-center">
                  <div>
                    <Link href={`/projects/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                    <p className="text-xs text-muted-foreground">{p.customer} · {p.stage} · {p.mode}</p>
                  </div>
                  <div className="text-xs text-muted-foreground">{p._count.inputs} input · {p._count.deliverables} doc</div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
