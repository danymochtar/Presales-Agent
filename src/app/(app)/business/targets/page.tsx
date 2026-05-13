import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import {
  BusinessTargetManager,
  type BusinessTargetRow,
  type PersonnelOption,
} from "@/components/business-target-manager";
import { isFiscalYearConfig, type FiscalYearConfig } from "@/lib/fiscal-year";

export default async function TargetsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const { tenant } = await requireSessionAndTenant(session!.user.id);
  const fy: FiscalYearConfig | null = isFiscalYearConfig(tenant.fiscalYear) ? tenant.fiscalYear : null;
  if (!fy) redirect("/setup");

  const [rows, personnel] = await Promise.all([
    prisma.businessTarget.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ fiscalYear: "desc" }, { period: "asc" }, { cloud: "asc" }, { productKey: "asc" }],
      include: { owner: { select: { id: true, name: true, role: true } } },
    }),
    prisma.personnel.findMany({
      where: { tenantId: tenant.id, active: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, role: true },
    }),
  ]);

  const initial: BusinessTargetRow[] = rows.map((t) => ({
    id: t.id,
    fiscalYear: t.fiscalYear,
    period: t.period,
    metric: t.metric,
    cloud: t.cloud,
    productKey: t.productKey,
    segment: t.segment,
    ownerId: t.ownerId,
    owner: t.owner ? { id: t.owner.id, name: t.owner.name, role: t.owner.role } : null,
    valueUsd: t.valueUsd ? Number(t.valueUsd) : null,
    notes: t.notes,
  }));
  const peopleOpts: PersonnelOption[] = personnel.map((p) => ({ id: p.id, name: p.name, role: p.role }));

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs text-muted-foreground mb-1">
            <Link href="/business" className="hover:text-foreground">← Business dashboard</Link>
          </div>
          <h1 className="text-xl md:text-2xl font-semibold">Targets</h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Define every target the team is measured against — full year + quarterly + monthly, per cloud (Azure /
            AWS / GCP / Services), per product line, per segment, per owner. The Business dashboard rolls actuals
            from the pipeline against these targets so you can see attainment at a glance.
          </p>
        </div>
      </div>
      <BusinessTargetManager initial={initial} personnel={peopleOpts} currentFy={fy.currentLabel} />
    </div>
  );
}
