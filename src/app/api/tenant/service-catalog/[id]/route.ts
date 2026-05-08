import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";

const Patch = z.object({
  service: z.string().min(1).optional(),
  defaultEffortDays: z.number().nonnegative().optional(),
  prerequisite: z.string().optional().nullable(),
  deliverable: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

async function ensureOwn(userId: string, itemId: string) {
  const { tenant } = await requireSessionAndTenant(userId);
  const item = await prisma.serviceCatalogItem.findFirst({ where: { id: itemId, tenantId: tenant.id } });
  return item;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await ensureOwn(session.user.id, id))) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.json();
  const parsed = Patch.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const item = await prisma.serviceCatalogItem.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ item });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await ensureOwn(session.user.id, id))) return NextResponse.json({ error: "not found" }, { status: 404 });
  await prisma.serviceCatalogItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
