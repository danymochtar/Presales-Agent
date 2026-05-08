import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";

const Item = z.object({
  role: z.string().min(1),
  level: z.string().min(1),
  dailyRate: z.number().nonnegative(),
  currency: z.string().default("USD"),
  location: z.string().default("MY"),
});

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tenant } = await requireSessionAndTenant(session.user.id);
  const items = await prisma.rateCardItem.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ role: "asc" }, { level: "asc" }],
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tenant } = await requireSessionAndTenant(session.user.id);
  const body = await req.json();
  const parsed = Item.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const item = await prisma.rateCardItem.create({ data: { ...parsed.data, tenantId: tenant.id } });
  return NextResponse.json({ item });
}
