import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RateCardEditor } from "@/components/rate-card-editor";

export default async function RateCardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const { tenant } = await requireSessionAndTenant(session!.user.id);
  const items = await prisma.rateCardItem.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ role: "asc" }, { level: "asc" }],
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Rate card</h1>
        <Link href="/settings" className="text-sm underline">← Back to settings</Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Roles & daily rates</CardTitle>
          <CardDescription>Daily rate per role × level. BOM uses these to cost professional services. Edit inline; changes save on blur.</CardDescription>
        </CardHeader>
        <CardContent>
          <RateCardEditor initial={items.map((i) => ({ id: i.id, role: i.role, level: i.level, dailyRate: i.dailyRate, currency: i.currency, location: i.location }))} />
        </CardContent>
      </Card>
    </div>
  );
}
