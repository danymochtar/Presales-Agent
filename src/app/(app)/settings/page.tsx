import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TenantEditor } from "@/components/tenant-editor";

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const { tenant } = await requireSessionAndTenant(session!.user.id);
  const [rateCount, catalogCount, patternCount] = await Promise.all([
    prisma.rateCardItem.count({ where: { tenantId: tenant.id } }),
    prisma.serviceCatalogItem.count({ where: { tenantId: tenant.id } }),
    prisma.learnedPattern.count({ where: { tenantId: tenant.id, active: true } }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Tenant</CardTitle>
          <CardDescription>Identity, currency, FX rate. Changes apply to new generations only — existing deliverables keep their snapshot.</CardDescription>
        </CardHeader>
        <CardContent>
          <TenantEditor
            tenant={{
              id: tenant.id,
              name: tenant.name,
              country: tenant.country,
              locale: tenant.locale,
              currency: tenant.currency,
              fxMyrPerUsd: tenant.fxMyrPerUsd,
            }}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardDescription>Rate card</CardDescription>
            <CardTitle className="text-3xl">{rateCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/settings/rate-card" className="text-sm underline">Edit rate card</Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Service catalog</CardDescription>
            <CardTitle className="text-3xl">{catalogCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/settings/service-catalog" className="text-sm underline">Edit catalog</Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Custom rules</CardDescription>
            <CardTitle className="text-3xl">{patternCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/settings/patterns" className="text-sm underline">Manage rules</Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
