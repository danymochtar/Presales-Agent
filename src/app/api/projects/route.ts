import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";

const CloudEnum = z.enum(["azure", "aws", "gcp"]);
const CreateProject = z.object({
  name: z.string().min(2),
  customer: z.string().min(2),
  industry: z.string().optional(),
  customerSegment: z.enum(["BFSI", "Gov", "MNC", "SMB"]).optional(),
  scopeSummary: z.string().optional(),
  targetClouds: z.array(CloudEnum).min(1).default(["azure"]),
  cloudRegions: z.record(z.string(), z.object({ primary: z.string(), dr: z.string() })).optional(),
  primaryCloud: CloudEnum.optional(),
  mode: z.enum(["production", "training"]).default("production"),
});

// Per-cloud region defaults for Malaysia market.
const DEFAULT_REGIONS: Record<string, { primary: string; dr: string }> = {
  azure: { primary: "Malaysia Central", dr: "Southeast Asia" },
  aws: { primary: "ap-southeast-5", dr: "ap-southeast-1" },
  gcp: { primary: "asia-southeast2", dr: "asia-southeast1" },
};

function defaultRegionsFor(clouds: string[]): Record<string, { primary: string; dr: string }> {
  return Object.fromEntries(clouds.map((c) => [c, DEFAULT_REGIONS[c] ?? { primary: "", dr: "" }]));
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

  const { targetClouds, cloudRegions, ...rest } = parsed.data;
  const regions = cloudRegions ?? defaultRegionsFor(targetClouds);
  // Back-compat: legacy BOM/proposal/architecture routes still read primaryRegion/drRegion.
  // Mirror them from the first selected cloud's regions until those routes are
  // refactored in MVP 2-5.
  const firstCloud = targetClouds[0];
  const primaryRegion = regions[firstCloud]?.primary ?? DEFAULT_REGIONS.azure.primary;
  const drRegion = regions[firstCloud]?.dr ?? DEFAULT_REGIONS.azure.dr;

  const project = await prisma.project.create({
    data: {
      ...rest,
      targetClouds,
      cloudRegions: regions as object,
      primaryRegion,
      drRegion,
      tenantId: tenant.id,
    },
  });
  return NextResponse.json({ project });
}
