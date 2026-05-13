import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { TARGET_PERIODS, TARGET_METRICS } from "@/lib/business/targets";
import { TARGET_CLOUDS } from "@/lib/business/cloud-of-vendor";
import { SEGMENTS } from "@/lib/team/roles";

export const runtime = "nodejs";

const Patch = z.object({
  fiscalYear: z.string().trim().min(2).max(16).optional(),
  period: z.enum(TARGET_PERIODS as [string, ...string[]]).optional(),
  metric: z.enum(TARGET_METRICS as [string, ...string[]]).optional(),
  cloud: z.enum(TARGET_CLOUDS as [string, ...string[]]).optional(),
  productKey: z.string().trim().max(80).nullable().optional(),
  segment: z.enum(SEGMENTS as unknown as [string, ...string[]]).nullable().optional(),
  ownerId: z.string().cuid().nullable().optional(),
  valueUsd: z.number().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tenant } = await requireSessionAndTenant(session.user.id);
  const { id } = await ctx.params;
  const existing = await prisma.businessTarget.findFirst({ where: { id, tenantId: tenant.id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const parsed = Patch.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const updated = await prisma.businessTarget.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ target: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tenant } = await requireSessionAndTenant(session.user.id);
  const { id } = await ctx.params;
  const existing = await prisma.businessTarget.findFirst({ where: { id, tenantId: tenant.id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  await prisma.businessTarget.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
