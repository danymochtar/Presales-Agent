import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { ProjectCreateWizard } from "@/components/project-create-wizard";
import type { SeedOpportunity } from "@/components/engagement-seed-picker";

export default async function NewEngagementPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const { tenant } = await requireSessionAndTenant(session!.user.id);

  // Seed list: every opportunity in this tenant's pipeline that isn't already
  // linked to an engagement. Sorted by closeDate (soonest first) so the deals
  // the user is actively chasing surface first.
  const raw = await prisma.opportunity.findMany({
    where: { tracker: { tenantId: tenant.id }, engagementId: null },
    include: { tracker: { select: { name: true } } },
    orderBy: [{ closeDate: "asc" }, { lastTouchedAt: "desc" }],
    take: 200,
  });
  const seedOpportunities: SeedOpportunity[] = raw.map((o) => ({
    id: o.id,
    customer: o.customer,
    name: o.name,
    status: o.status,
    trackerName: o.tracker.name,
    valueUsd: o.valueUsd ? Number(o.valueUsd) : null,
    closeDate: o.closeDate ? o.closeDate.toISOString() : null,
    originKind: o.originKind,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">New engagement</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          <strong className="text-foreground">Step 1 — capture the customer data.</strong> Pick a customer from your
          pipeline (below) or drop RFPs, inventory dumps, meeting notes; the agent extracts customer + scope + cloud +
          segment + compliance posture and creates the engagement.{" "}
          <strong className="text-foreground">Step 2 — generate on demand.</strong> Open the engagement at any time to
          generate one deliverable or run the full guided pipeline. Auto-links to the pipeline tracker by customer
          name so every update flows back.{" "}
          <Link href="/help" className="underline">How it works</Link>.
        </p>
        <div className="mt-3 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground max-w-3xl">
          <strong className="text-foreground">Existing context the agent will use automatically:</strong>{" "}
          uploaded reference docs from the <Link href="/library" className="underline">Reference library</Link>,
          matching opportunities from your <Link href="/pipeline" className="underline">Pipeline tracker</Link>,
          and any prior <Link href="/engagements" className="underline">engagement</Link> with the same customer.
          You don&apos;t need to re-upload material you&apos;ve already shared with the agent.
        </div>
      </div>
      <ProjectCreateWizard seedOpportunities={seedOpportunities} />
    </div>
  );
}
