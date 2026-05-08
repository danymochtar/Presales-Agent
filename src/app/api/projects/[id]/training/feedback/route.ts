import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";

const ApprovedPattern = z.object({
  pattern: z.string().min(5),
  scope: z.enum(["universal", "conditional"]),
  conditions: z.array(z.string()).default([]),
  confidence: z.enum(["high", "medium", "low"]),
  rationale: z.string().optional(),
});

const Body = z.object({
  deliverableType: z.string(),
  feedback: z.string(),
  approvedPatterns: z.array(ApprovedPattern).default([]),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const { tenant } = await requireSessionAndTenant(session.user.id);
  const project = await prisma.project.findFirst({
    where: { id, tenantId: tenant.id },
  });
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const result = await prisma.$transaction(async (tx) => {
    const fb = await tx.trainingFeedback.create({
      data: {
        projectId: project.id,
        deliverableType: parsed.data.deliverableType,
        feedback: parsed.data.feedback,
        extractedPatterns: parsed.data.approvedPatterns as object,
      },
    });
    const created = await Promise.all(
      parsed.data.approvedPatterns.map((p) =>
        tx.learnedPattern.create({
          data: {
            tenantId: tenant.id,
            deliverableType: parsed.data.deliverableType,
            pattern: p.pattern,
            scope: p.scope,
            conditions: p.conditions as object,
            confidence: p.confidence,
            rationale: p.rationale ?? null,
            sourceProjectId: project.id,
            active: true,
          },
        }),
      ),
    );
    return { feedback: fb, patterns: created };
  });

  return NextResponse.json({
    feedbackId: result.feedback.id,
    patternIds: result.patterns.map((p) => p.id),
    persistedCount: result.patterns.length,
  });
}
