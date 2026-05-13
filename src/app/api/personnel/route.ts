import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { PERSONNEL_ROLES, SEGMENTS } from "@/lib/team/roles";

export const runtime = "nodejs";

const RoleEnum = z.enum(PERSONNEL_ROLES as [string, ...string[]]);
const SegmentEnum = z.enum(SEGMENTS as unknown as [string, ...string[]]);

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email().optional().nullable(),
  role: RoleEnum,
  segment: SegmentEnum.optional().nullable(),
  active: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tenant } = await requireSessionAndTenant(session.user.id);
  const personnel = await prisma.personnel.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ personnel });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tenant } = await requireSessionAndTenant(session.user.id);
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const created = await prisma.personnel.create({
    data: { ...parsed.data, tenantId: tenant.id },
  });
  return NextResponse.json({ personnel: created });
}
