import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { CANONICAL_FIELDS, type FieldMapping } from "@/lib/pipeline/field-mapping";

export const runtime = "nodejs";

const PatchSchema = z.object({
  name: z.string().min(1).optional(),
  fieldMapping: z.record(z.enum(CANONICAL_FIELDS as [string, ...string[]]), z.string().nullable()).optional(),
  statusMapping: z.record(z.string(), z.string()).nullable().optional(),
});

async function loadTracker(id: string, tenantId: string) {
  return prisma.tracker.findFirst({ where: { id, tenantId } });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tenant } = await requireSessionAndTenant(session.user.id);
  const { id } = await ctx.params;
  const tracker = await prisma.tracker.findFirst({
    where: { id, tenantId: tenant.id },
    include: { opportunities: { orderBy: { lastTouchedAt: "desc" } } },
  });
  if (!tracker) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ tracker });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tenant } = await requireSessionAndTenant(session.user.id);
  const { id } = await ctx.params;
  const tracker = await loadTracker(id, tenant.id);
  if (!tracker) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await prisma.tracker.update({
    where: { id },
    data: {
      name: parsed.data.name ?? undefined,
      fieldMapping: (parsed.data.fieldMapping as FieldMapping | undefined) as object | undefined,
      statusMapping: parsed.data.statusMapping === null
        ? Prisma.JsonNull
        : (parsed.data.statusMapping as object | undefined),
    },
  });
  return NextResponse.json({ tracker: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tenant } = await requireSessionAndTenant(session.user.id);
  const { id } = await ctx.params;
  const tracker = await loadTracker(id, tenant.id);
  if (!tracker) return NextResponse.json({ error: "not found" }, { status: 404 });
  await prisma.tracker.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
