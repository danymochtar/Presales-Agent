import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { PersonnelManager, type Person } from "@/components/personnel-manager";

export default async function TeamPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const { tenant } = await requireSessionAndTenant(session!.user.id);
  const rows = await prisma.personnel.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
  });
  const initial: Person[] = rows.map((p) => ({
    id: p.id, name: p.name, email: p.email, role: p.role,
    segment: p.segment, active: p.active, notes: p.notes,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">Team</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Define the people that work the pipeline — Solution Architects, Solution Sales, Account Managers, partner
          sellers, CSMs, and business leads. Once added, each opportunity in the pipeline tracker can be assigned to
          multiple SAs, multiple sales reps, and multiple Account Managers. The Business dashboard rolls up actuals
          per owner so you can see who&apos;s carrying which accounts and how they&apos;re tracking against target.
        </p>
      </div>
      <PersonnelManager initial={initial} />
    </div>
  );
}
