import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperadmin, isContextResponse } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await requireSuperadmin();
  if (isContextResponse(ctx)) return ctx;
  const users = await prisma.user.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true,
    },
  });
  return NextResponse.json({ users });
}
