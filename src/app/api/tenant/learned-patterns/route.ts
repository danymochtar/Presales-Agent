import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tenant } = await requireSessionAndTenant(session.user.id);
  const patterns = await prisma.learnedPattern.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ deliverableType: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ patterns });
}
