import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { PIPELINE_STATUSES, statusFromNote } from "@/lib/pipeline/status";

export const runtime = "nodejs";

const PatchSchema = z.object({
  notes: z.string().nullable().optional(),
  status: z.enum(PIPELINE_STATUSES as [string, ...string[]]).optional(),
  closeDate: z.string().nullable().optional(),
  valueUsd: z.number().nullable().optional(),
  valueMyr: z.number().nullable().optional(),
  ownerName: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tenant } = await requireSessionAndTenant(session.user.id);
  const { id } = await ctx.params;

  const existing = await prisma.opportunity.findFirst({
    where: { id, tracker: { tenantId: tenant.id } },
  });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const data = parsed.data;
  // Quick-edit ergonomics: when a freeform note contains a status keyword
  // ("moved to at-risk"), flip status automatically unless the client
  // explicitly set a different status in the same PATCH.
  let inferredStatus = data.status;
  if (!inferredStatus && typeof data.notes === "string") {
    const inferred = statusFromNote(data.notes);
    if (inferred) inferredStatus = inferred;
  }

  const updated = await prisma.opportunity.update({
    where: { id },
    data: {
      notes: data.notes === undefined ? undefined : data.notes,
      status: inferredStatus,
      closeDate: data.closeDate === undefined ? undefined : data.closeDate === null ? null : new Date(data.closeDate),
      valueUsd: data.valueUsd === undefined ? undefined : data.valueUsd,
      valueMyr: data.valueMyr === undefined ? undefined : data.valueMyr,
      ownerName: data.ownerName === undefined ? undefined : data.ownerName,
      lastTouchedAt: new Date(),
    },
  });
  return NextResponse.json({ opportunity: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tenant } = await requireSessionAndTenant(session.user.id);
  const { id } = await ctx.params;
  const existing = await prisma.opportunity.findFirst({
    where: { id, tracker: { tenantId: tenant.id } },
  });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  await prisma.opportunity.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
