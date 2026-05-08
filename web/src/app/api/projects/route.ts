import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";

const CreateProject = z.object({
  name: z.string().min(2),
  customer: z.string().min(2),
  industry: z.string().optional(),
  scopeSummary: z.string().optional(),
  primaryRegion: z.string().default("Malaysia Central"),
  drRegion: z.string().default("Southeast Asia"),
  mode: z.enum(["production", "training"]).default("production"),
});

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
  const project = await prisma.project.create({
    data: { ...parsed.data, tenantId: tenant.id },
  });
  return NextResponse.json({ project });
}
