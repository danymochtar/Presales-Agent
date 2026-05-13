import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperadmin, isContextResponse } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const Body = z.object({
  displayName: z.string().trim().min(1).max(64),
  logoLetter:  z.string().trim().min(1).max(2),
  accentHue:   z.string().trim().min(1).max(24),
  perCloudHue: z.object({
    azure:    z.string().trim().min(1).max(24),
    aws:      z.string().trim().min(1).max(24),
    gcp:      z.string().trim().min(1).max(24),
    services: z.string().trim().min(1).max(24),
  }),
});

export async function PATCH(req: NextRequest) {
  const ctx = await requireSuperadmin();
  if (isContextResponse(ctx)) return ctx;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { branding: parsed.data as object } });
  return NextResponse.json({ ok: true });
}
