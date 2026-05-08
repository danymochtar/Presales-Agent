import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";

const Patch = z.object({
  active: z.boolean().optional(),
  pattern: z.string().min(5).optional(),
  scope: z.enum(["universal", "conditional"]).optional(),
  conditions: z.array(z.string()).optional(),
});

async function ensureOwn(userId: string, patternId: string) {
  const { tenant } = await requireSessionAndTenant(userId);
  return prisma.learnedPattern.findFirst({ where: { id: patternId, tenantId: tenant.id } });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await ensureOwn(session.user.id, id))) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.json();
  const parsed = Patch.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.conditions !== undefined) data.conditions = parsed.data.conditions as object;
  const item = await prisma.learnedPattern.update({ where: { id }, data });
  return NextResponse.json({ item });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await ensureOwn(session.user.id, id))) return NextResponse.json({ error: "not found" }, { status: 404 });
  await prisma.learnedPattern.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
