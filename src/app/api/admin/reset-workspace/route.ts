// Destructive: wipes every tenant-scoped data row except the Tenant config,
// User, Account, Session — i.e., a clean slate for the workspace without
// losing identity or auth. Superadmin-only, requires explicit confirmation
// string so this can't fire from a stray PATCH.
//
// Wiped:
//   - Engagement (cascades EngagementInput, Deliverable, TrainingFeedback,
//                 nullifies Opportunity.engagementId)
//   - Tracker    (cascades Opportunity)
//   - Template
//   - LearnedPattern
//   - LlmCall
//   - KnowledgeSample
//   - RateCardItem
//   - ServiceCatalogItem
// Kept:
//   - User, Tenant, Session, Account, Verification

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperadmin, isContextResponse } from "@/lib/admin";

export const runtime = "nodejs";

const Body = z.object({
  // Caller must echo this exact string to fire — defence against accidental
  // CSRF / double-click / curl typo.
  confirm: z.literal("RESET WORKSPACE"),
});

export async function POST(req: NextRequest) {
  const ctx = await requireSuperadmin();
  if (isContextResponse(ctx)) return ctx;

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "confirm string mismatch — POST { confirm: \"RESET WORKSPACE\" }" },
      { status: 400 },
    );
  }

  const tenantId = ctx.tenantId;

  // Run inside a transaction so a partial wipe never leaves dangling state.
  // Order matters where relations don't cascade themselves (Opportunity has
  // optional Engagement FK — we delete trackers first which cascades opps).
  const counts = await prisma.$transaction(async (tx) => {
    const llm = await tx.llmCall.deleteMany({ where: { tenantId } });
    const patterns = await tx.learnedPattern.deleteMany({ where: { tenantId } });
    const templates = await tx.template.deleteMany({ where: { tenantId } });
    const knowledge = await tx.knowledgeSample.deleteMany({ where: { tenantId } });
    const trackers = await tx.tracker.deleteMany({ where: { tenantId } });
    // Engagement deletes cascade: EngagementInput, Deliverable, TrainingFeedback.
    // They also set Opportunity.engagementId NULL (which is moot — trackers
    // already cascaded the opps).
    const engagements = await tx.engagement.deleteMany({ where: { tenantId } });
    const rates = await tx.rateCardItem.deleteMany({ where: { tenantId } });
    const catalog = await tx.serviceCatalogItem.deleteMany({ where: { tenantId } });
    return {
      llmCalls: llm.count,
      learnedPatterns: patterns.count,
      templates: templates.count,
      knowledgeSamples: knowledge.count,
      trackers: trackers.count,
      engagements: engagements.count,
      rateCardItems: rates.count,
      serviceCatalogItems: catalog.count,
    };
  });

  return NextResponse.json({ ok: true, deleted: counts });
}
