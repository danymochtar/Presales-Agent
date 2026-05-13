import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const CloudEnum = z.enum(["azure", "aws", "gcp"]);
const Patch = z.object({
  name: z.string().min(2).optional(),
  customer: z.string().min(2).optional(),
  industry: z.string().optional().nullable(),
  customerSegment: z.enum(["BFSI", "Gov", "MNC", "SMB"]).optional().nullable(),
  scopeSummary: z.string().optional().nullable(),
  targetClouds: z.array(CloudEnum).min(1).optional(),
  primaryCloud: CloudEnum.optional().nullable(),
  cloudRegions: z.record(z.string(), z.object({ primary: z.string(), dr: z.string() })).optional(),
  stage: z.enum(["prospecting", "qualifying", "discovery", "proposed", "negotiating", "closed_won", "closed_lost"]).optional(),
  mode: z.enum(["production", "training"]).optional(),
});

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const project = await prisma.engagement.findFirst({
    where: { id, tenant: { users: { some: { id: session.user.id } } } },
    include: {
      inputs: { orderBy: { createdAt: "desc" } },
      deliverables: { orderBy: [{ type: "asc" }, { version: "desc" }] },
    },
  });
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ project });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const own = await prisma.engagement.findFirst({
    where: { id, tenant: { users: { some: { id: session.user.id } } } },
  });
  if (!own) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.json();
  const parsed = Patch.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.cloudRegions !== undefined) data.cloudRegions = parsed.data.cloudRegions as object;
  const project = await prisma.engagement.update({ where: { id }, data });
  return NextResponse.json({ project });
}
