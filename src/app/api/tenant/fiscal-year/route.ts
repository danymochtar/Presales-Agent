import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";

export const runtime = "nodejs";

const Body = z.object({
  startMonth: z.number().int().min(1).max(12),
  startDay: z.number().int().min(1).max(31),
  currentLabel: z.string().trim().min(2).max(16),
});

export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tenant } = await requireSessionAndTenant(session.user.id);

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await prisma.tenant.update({
    where: { id: tenant.id },
    data: { fiscalYear: parsed.data as object },
  });
  return NextResponse.json({ ok: true, fiscalYear: updated.fiscalYear });
}
