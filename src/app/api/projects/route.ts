import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { MARKET_DEFAULT_REGIONS } from "@/lib/pricing/regions";
import type { CloudType } from "@/lib/pricing/types";

const CloudEnum = z.enum(["azure", "aws", "gcp"]);

const InputSeed = z.object({
  kind: z.string(),
  filename: z.string().optional(),
  rawSummary: z.string().optional(),
  textContent: z.string().optional(),
  workloadsJson: z.unknown().optional(),
});

const ProjectTypeEnum = z.enum(["migration", "greenfield", "modernization", "dr", "poc", "optimization", "unknown"]);
const StageEnum = z.enum(["assessment", "architecture", "bom", "professional-services", "tco", "project-plan", "proposal", "sow", "ms-offering"]);
const PurchaseModelEnum = z.enum(["consumption", "reserved-1y", "reserved-3y", "savings-1y", "savings-3y"]);
const MigrationStrategyEnum = z.enum(["lift_and_shift", "hybrid", "modernization"]);
const SolutionAreaEnum = z.enum([
  "migration_lift_shift", "migration_hybrid", "modernization", "on_prem_modernization",
  "data_platform", "greenfield_app", "ai_app", "siem_soc", "disaster_recovery",
  "cost_optimization", "poc", "unknown",
]);

const CreateProject = z.object({
  name: z.string().min(2),
  customer: z.string().min(2),
  industry: z.string().optional(),
  customerSegment: z.enum(["BFSI", "Gov", "MNC", "SMB"]).optional(),
  scopeSummary: z.string().optional(),
  targetClouds: z.array(CloudEnum).min(1).default(["azure"]),
  cloudRegions: z.record(z.string(), z.object({ primary: z.string(), dr: z.string() })).optional(),
  primaryCloud: CloudEnum.optional(),
  purchaseModel: PurchaseModelEnum.default("consumption"),
  migrationStrategy: MigrationStrategyEnum.default("lift_and_shift"),
  solutionArea: SolutionAreaEnum.optional(),
  projectType: ProjectTypeEnum.optional(),
  projectTypeConfidence: z.enum(["high", "medium", "low"]).optional(),
  projectTypeRationale: z.string().optional(),
  suggestedDeliverables: z.array(StageEnum).optional(),
  mode: z.enum(["production", "training"]).default("production"),
  // Seeded inputs from upload-first wizard. Created in the same transaction.
  inputs: z.array(InputSeed).optional(),
});

function defaultRegionsFor(clouds: string[]): Record<string, { primary: string; dr: string }> {
  return Object.fromEntries(
    clouds.map((c) => [c, MARKET_DEFAULT_REGIONS[c as CloudType] ?? { primary: "", dr: "" }]),
  );
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tenant } = await requireSessionAndTenant(session.user.id);
  const projects = await prisma.project.findMany({
    where: { tenantId: tenant.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { deliverables: true, inputs: true } } },
  });
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tenant } = await requireSessionAndTenant(session.user.id);
  const body = await req.json();
  const parsed = CreateProject.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { targetClouds, cloudRegions, inputs, suggestedDeliverables, purchaseModel, migrationStrategy, solutionArea, ...rest } = parsed.data;
  const regions = cloudRegions ?? defaultRegionsFor(targetClouds);

  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        ...rest,
        targetClouds,
        cloudRegions: regions as object,
        purchaseModel,
        migrationStrategy,
        solutionArea,
        suggestedDeliverables: suggestedDeliverables ?? [],
        tenantId: tenant.id,
      },
    });
    if (inputs && inputs.length > 0) {
      await tx.projectInput.createMany({
        data: inputs.map((i) => ({
          projectId: created.id,
          kind: i.kind,
          filename: i.filename ?? null,
          rawSummary: i.rawSummary ?? null,
          textContent: i.textContent ?? null,
          workloadsJson: (i.workloadsJson as object | undefined) ?? undefined,
        })),
      });
    }
    return created;
  });

  return NextResponse.json({ project });
}
