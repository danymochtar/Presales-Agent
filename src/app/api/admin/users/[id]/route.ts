import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperadmin, isContextResponse } from "@/lib/admin";

export const runtime = "nodejs";

const Patch = z.object({
  role: z.enum(["user", "superadmin"]),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperadmin();
  if (isContextResponse(auth)) return auth;
  const { id } = await ctx.params;

  const target = await prisma.user.findFirst({ where: { id, tenantId: auth.tenantId } });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const parsed = Patch.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Guard: don't allow demoting the last remaining superadmin
  if (target.role === "superadmin" && parsed.data.role !== "superadmin") {
    const superadminCount = await prisma.user.count({ where: { tenantId: auth.tenantId, role: "superadmin" } });
    if (superadminCount <= 1) {
      return NextResponse.json(
        { error: "cannot demote the only superadmin — promote another user first" },
        { status: 400 },
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { role: parsed.data.role },
    select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json({ user: updated });
}
