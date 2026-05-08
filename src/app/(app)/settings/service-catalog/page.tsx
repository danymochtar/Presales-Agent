import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CatalogEditor } from "@/components/catalog-editor";

export default async function ServiceCatalogPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const { tenant } = await requireSessionAndTenant(session!.user.id);
  const items = await prisma.serviceCatalogItem.findMany({
    where: { tenantId: tenant.id },
    orderBy: { service: "asc" },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Service catalog</h1>
        <Link href="/settings" className="text-sm underline">← Back to settings</Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Standard services & default effort</CardTitle>
          <CardDescription>Used by BOM/proposal to estimate professional services mandays. Override per project at generation time.</CardDescription>
        </CardHeader>
        <CardContent>
          <CatalogEditor
            initial={items.map((i) => ({
              id: i.id,
              service: i.service,
              defaultEffortDays: i.defaultEffortDays,
              prerequisite: i.prerequisite,
              deliverable: i.deliverable,
              notes: i.notes,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
