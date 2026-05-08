import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";

const Item = z.object({
  service: z.string().min(1),
  defaultEffortDays: z.number().nonnegative(),
  prerequisite: z.string().optional().nullable(),
  deliverable: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tenant } = await requireSessionAndTenant(session.user.id);
  const items = await prisma.serviceCatalogItem.findMany({ where: { tenantId: tenant.id }, orderBy: { service: "asc" } });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tenant } = await requireSessionAndTenant(session.user.id);
  const body = await req.json();
  const parsed = Item.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const item = await prisma.serviceCatalogItem.create({ data: { ...parsed.data, tenantId: tenant.id } });
  return NextResponse.json({ item });
}
