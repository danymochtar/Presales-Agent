import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";

export const runtime = "nodejs";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; assignmentId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tenant } = await requireSessionAndTenant(session.user.id);
  const { id, assignmentId } = await ctx.params;
  const assignment = await prisma.opportunityAssignment.findFirst({
    where: { id: assignmentId, opportunityId: id, opportunity: { tracker: { tenantId: tenant.id } } },
  });
  if (!assignment) return NextResponse.json({ error: "not found" }, { status: 404 });
  await prisma.opportunityAssignment.delete({ where: { id: assignmentId } });
  return NextResponse.json({ ok: true });
}
