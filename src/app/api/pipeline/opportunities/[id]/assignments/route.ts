import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { ASSIGNMENT_ROLES } from "@/lib/team/roles";

export const runtime = "nodejs";

const Body = z.object({
  personnelId: z.string().cuid(),
  role: z.enum(ASSIGNMENT_ROLES as unknown as [string, ...string[]]),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tenant } = await requireSessionAndTenant(session.user.id);
  const { id } = await ctx.params;
  const opp = await prisma.opportunity.findFirst({
    where: { id, tracker: { tenantId: tenant.id } },
  });
  if (!opp) return NextResponse.json({ error: "not found" }, { status: 404 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  // Validate the personnel belongs to this tenant before linking.
  const person = await prisma.personnel.findFirst({
    where: { id: parsed.data.personnelId, tenantId: tenant.id },
  });
  if (!person) return NextResponse.json({ error: "personnel not in tenant" }, { status: 400 });
  try {
    const assignment = await prisma.opportunityAssignment.create({
      data: {
        opportunityId: id,
        personnelId: parsed.data.personnelId,
        role: parsed.data.role,
      },
    });
    return NextResponse.json({ assignment });
  } catch {
    // unique constraint hit — already assigned.
    return NextResponse.json({ error: "already assigned in this role" }, { status: 409 });
  }
}
