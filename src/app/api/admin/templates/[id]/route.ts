import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperadmin, isContextResponse } from "@/lib/admin";

export const runtime = "nodejs";

const Patch = z.object({
  name: z.string().min(2).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["active", "archived"]).optional(),
  cloudProvider: z.enum(["azure", "aws", "gcp"]).nullable().optional(),
  projectType: z.enum(["migration", "greenfield", "modernization", "dr", "poc", "optimization"]).nullable().optional(),
});

async function ensureOwn(tenantId: string, id: string) {
  return prisma.template.findFirst({ where: { id, tenantId } });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperadmin();
  if (isContextResponse(auth)) return auth;
  const { id } = await ctx.params;
  if (!(await ensureOwn(auth.tenantId, id))) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.json();
  const parsed = Patch.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const item = await prisma.template.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ item });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperadmin();
  if (isContextResponse(auth)) return auth;
  const { id } = await ctx.params;
  if (!(await ensureOwn(auth.tenantId, id))) return NextResponse.json({ error: "not found" }, { status: 404 });
  await prisma.template.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
