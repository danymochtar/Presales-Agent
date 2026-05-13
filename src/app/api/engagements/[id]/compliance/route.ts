import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isApplicable, requiresBnmConsultation, type ProjectComplianceJson } from "@/lib/compliance/bnm-rmit";

const Body = z.object({
  rmit: z.object({
    criticalSystemAnswers: z.object({
      processesCustomerTransactions: z.boolean().optional(),
      supportsCoreBanking: z.boolean().optional(),
      storesPiiAtScale: z.boolean().optional(),
      realTimePaymentRails: z.boolean().optional(),
      regulatorReportingPipeline: z.boolean().optional(),
    }).default({}),
    checklist: z.object({
      byokKeyManagement: z.boolean().optional(),
      exitStrategyDocumented: z.boolean().optional(),
      zeroTrustMicroSegmentation: z.boolean().optional(),
      mfaCompliantNoSmsOtp: z.boolean().optional(),
      cryptographyPostQuantumReady: z.boolean().optional(),
      logRetention3YearsMin: z.boolean().optional(),
      criticalSystemMaxDowntime4Hours: z.boolean().optional(),
      sharedResponsibilityDocumented: z.boolean().optional(),
      standInProcessingArrangements: z.boolean().optional(),
    }).default({}),
    consultationStatus: z.enum(["not-started", "initiated", "approved", "n/a"]),
    consultationNotes: z.string().optional(),
  }),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const project = await prisma.engagement.findFirst({
    where: { id, tenant: { users: { some: { id: session.user.id } } } },
    include: { tenant: true },
  });
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!isApplicable(project)) return NextResponse.json({ error: "BNM RMiT not applicable to this project" }, { status: 400 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const isCritical = requiresBnmConsultation(parsed.data.rmit.criticalSystemAnswers);
  const next: ProjectComplianceJson = {
    ...((project.compliance as ProjectComplianceJson | null) ?? {}),
    rmit: {
      applicable: true,
      criticalSystemAnswers: parsed.data.rmit.criticalSystemAnswers,
      isCriticalSystem: isCritical,
      checklist: parsed.data.rmit.checklist,
      consultationStatus: parsed.data.rmit.consultationStatus,
      consultationNotes: parsed.data.rmit.consultationNotes,
      acknowledgedAt: new Date().toISOString(),
      acknowledgedBy: session.user.id,
    },
  };

  await prisma.engagement.update({
    where: { id },
    data: { compliance: next as object },
  });
  return NextResponse.json({ compliance: next });
}
