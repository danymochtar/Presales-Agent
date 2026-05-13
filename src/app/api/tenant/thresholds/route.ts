import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperadmin, isContextResponse } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const Body = z.object({
  mcemGreenPct:            z.number().int().min(0).max(100),
  mcemAmberPct:            z.number().int().min(0).max(100),
  fileSizeMb:              z.number().int().min(1).max(200),
  dashboardLookbackDays:   z.number().int().min(1).max(365),
  dashboardActiveMax:      z.number().int().min(1).max(50),
  dashboardNextActionsMax: z.number().int().min(1).max(50),
}).refine((v) => v.mcemGreenPct > v.mcemAmberPct, {
  message: "MCEM green cutoff must be higher than amber cutoff",
  path: ["mcemGreenPct"],
});

export async function PATCH(req: NextRequest) {
  const ctx = await requireSuperadmin();
  if (isContextResponse(ctx)) return ctx;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { thresholds: parsed.data as object } });
  return NextResponse.json({ ok: true });
}
