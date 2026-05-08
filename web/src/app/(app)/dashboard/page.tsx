import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const { tenant } = await requireSessionAndTenant(session!.user.id);
  const [projects, rateCount, catalogCount] = await Promise.all([
    prisma.project.findMany({
      where: { tenantId: tenant.id },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { _count: { select: { deliverables: true, inputs: true } } },
    }),
    prisma.rateCardItem.count({ where: { tenantId: tenant.id } }),
    prisma.serviceCatalogItem.count({ where: { tenantId: tenant.id } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{tenant.country} · {tenant.currency} (FX MYR/USD: {tenant.fxMyrPerUsd ?? "—"})</p>
        </div>
        <Button asChild><Link href="/projects/new">New project</Link></Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardDescription>Rate card rows</CardDescription><CardTitle>{rateCount}</CardTitle></CardHeader>
          <CardContent><Link href="/settings" className="text-sm underline">Manage</Link></CardContent>
        </Card>
        <Card>
          <CardHeader><CardDescription>Service catalog</CardDescription><CardTitle>{catalogCount}</CardTitle></CardHeader>
          <CardContent><Link href="/settings" className="text-sm underline">Manage</Link></CardContent>
        </Card>
        <Card>
          <CardHeader><CardDescription>Projects</CardDescription><CardTitle>{projects.length}</CardTitle></CardHeader>
          <CardContent><Link href="/projects" className="text-sm underline">View all</Link></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent projects</CardTitle></CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects yet. Create your first one.</p>
          ) : (
            <ul className="space-y-2">
              {projects.map((p) => (
                <li key={p.id} className="flex justify-between border-b py-2 last:border-0">
                  <div>
                    <Link href={`/projects/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                    <p className="text-xs text-muted-foreground">{p.customer} · {p.industry ?? "—"} · {p.stage}</p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p._count.inputs} input · {p._count.deliverables} deliverable
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
