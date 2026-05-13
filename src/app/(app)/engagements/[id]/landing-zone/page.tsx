import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CloudChip } from "@/components/cloud-chip";
import { LandingZonePicker } from "@/components/landing-zone-picker";
import { suggestedArchetypes, lzAllArchetypesForCloud, type LzArchetype } from "@/lib/landing-zone/catalog";
import { defaultSelectionsForCloud, type EngagementLandingZoneJson } from "@/lib/landing-zone/picker";
import { detectComponents } from "@/lib/inventory/component-detector";
import type { WorkloadSet } from "@/lib/inventory/workload";
import type { CloudType } from "@/lib/pricing/types";

export default async function LandingZonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const engagement = await prisma.engagement.findFirst({
    where: { id, tenant: { users: { some: { id: session!.user.id } } } },
    include: { inputs: { where: { workloadsJson: { not: undefined } }, take: 1, orderBy: { createdAt: "desc" } } },
  });
  if (!engagement) notFound();

  const targetClouds = ((engagement.targetClouds as string[]) ?? ["azure"]).filter(
    (c): c is CloudType => c === "azure" || c === "aws" || c === "gcp",
  );

  // Detect components from the latest workload set so the picker can
  // pre-check optional pairings (App Gateway WAF only when web tier present).
  const workloadSet = (engagement.inputs[0]?.workloadsJson as WorkloadSet | null) ?? null;
  const detected = workloadSet ? detectComponents(workloadSet).components.map((c) => c.kind) : [];

  const existing = (engagement.landingZone as EngagementLandingZoneJson | null) ?? null;
  const suggestedArch = suggestedArchetypes({
    solutionArea: engagement.solutionArea,
    migrationStrategy: engagement.migrationStrategy,
  });

  // If the engagement already has a saved selection, use that. Otherwise
  // pre-populate with required-by-default + inventory-paired defaults for
  // the suggested archetypes.
  const initialArchetypes: LzArchetype[] = existing?.archetypes ?? suggestedArch;
  const initialSelections: Partial<Record<CloudType, string[]>> = {};
  for (const c of targetClouds) {
    initialSelections[c] = existing?.selectionsByCloud?.[c]
      ?? defaultSelectionsForCloud(c, initialArchetypes, detected);
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground mb-1">
          <Link href={`/engagements/${engagement.id}`} className="hover:text-foreground">← {engagement.name}</Link>
          <span>·</span>
          <span>{engagement.customer}</span>
          {targetClouds.map((c) => <CloudChip key={c} cloud={c} size="xs" />)}
        </div>
        <h1 className="text-xl md:text-2xl font-semibold">Landing zone — pick components</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Choose the landing-zone components to deploy. Recommendations are grounded in the published vendor
          frameworks — <strong>Azure CAF</strong> (Enterprise-Scale Landing Zone), <strong>AWS Landing Zone
          Accelerator</strong>, and <strong>GCP Cloud Foundation Fabric</strong>. Pick one or more archetypes:
          infrastructure (lift-and-shift), application platform (modernization), data + AI. The picker pre-checks
          the canonical components per archetype + extra optional services that match the inventory you uploaded
          (e.g. App Gateway WAF surfaces only when a web tier is detected).
        </p>
      </div>

      <LandingZonePicker
        engagementId={engagement.id}
        targetClouds={targetClouds}
        suggestedArchetypes={suggestedArch}
        initialArchetypes={initialArchetypes}
        initialSelections={initialSelections}
        detected={detected}
        catalogByCloud={Object.fromEntries(
          targetClouds.map((c) => [c, lzAllArchetypesForCloud(c)]),
        ) as Record<CloudType, ReturnType<typeof lzAllArchetypesForCloud>>}
      />
    </div>
  );
}
