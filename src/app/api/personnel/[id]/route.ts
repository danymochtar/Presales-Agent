import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { PERSONNEL_ROLES, SEGMENTS } from "@/lib/team/roles";

export const runtime = "nodejs";

const Patch = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().email().nullable().optional(),
  role: z.enum(PERSONNEL_ROLES as [string, ...string[]]).optional(),
  segment: z.enum(SEGMENTS as unknown as [string, ...string[]]).nullable().optional(),
  active: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tenant } = await requireSessionAndTenant(session.user.id);
  const { id } = await ctx.params;
  const existing = await prisma.personnel.findFirst({ where: { id, tenantId: tenant.id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const parsed = Patch.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const updated = await prisma.personnel.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ personnel: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tenant } = await requireSessionAndTenant(session.user.id);
  const { id } = await ctx.params;
  const existing = await prisma.personnel.findFirst({ where: { id, tenantId: tenant.id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  await prisma.personnel.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
