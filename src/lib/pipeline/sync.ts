// Engagement → Pipeline tracker sync. When an engagement gets activity
// (created, MCEM exit-criterion ticked, deliverable generated, stage moved),
// stamp the lastTouchedAt + append a short activity line to every linked
// Opportunity. The linked-by-name match comes from
// `src/lib/pipeline/customer-match.ts` — same fuzz used on the engagement
// detail page.
//
// Best-effort: failures here never bubble up. The presales agent's job is
// to keep the tracker in sync; if it can't, the user can still re-import.

import { prisma } from "@/lib/prisma";
import { customerNamesMatch } from "@/lib/pipeline/customer-match";

export async function syncEngagementToPipeline(engagementId: string, activity: string): Promise<number> {
  try {
    const engagement = await prisma.engagement.findUnique({
      where: { id: engagementId },
      select: { id: true, customer: true, tenantId: true, name: true, stage: true },
    });
    if (!engagement) return 0;

    // Pull all this tenant's opportunities once; fuzzy-match in memory. The
    // pilot is well under 10k rows so this is cheap.
    const tenantOpps = await prisma.opportunity.findMany({
      where: { tracker: { tenantId: engagement.tenantId } },
      select: { id: true, customer: true, notes: true },
    });
    const matched = tenantOpps.filter((o) => customerNamesMatch(o.customer, engagement.customer));
    if (matched.length === 0) return 0;

    const stamp = new Date();
    const line = `${stamp.toISOString().slice(0, 10)} · ${engagement.name}: ${activity}`;
    await Promise.all(
      matched.map((o) =>
        prisma.opportunity.update({
          where: { id: o.id },
          data: {
            lastTouchedAt: stamp,
            // Append the activity line to existing notes (preserving prior content).
            // Capped at 4000 chars to avoid runaway growth on long-running deals.
            notes: capNote(`${o.notes ? `${o.notes}\n` : ""}${line}`),
          },
        }),
      ),
    );
    return matched.length;
  } catch (err) {
    // Logging only — never throw.
    console.error("[pipeline-sync] failed:", err);
    return 0;
  }
}

function capNote(s: string, max = 4000): string {
  if (s.length <= max) return s;
  return s.slice(s.length - max);
}
