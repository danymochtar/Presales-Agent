import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperadmin, isContextResponse } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Flat map of override keys → label strings. Empty / whitespace values are
// stripped server-side so callers never see "use the empty-string label".
const Body = z.object({
  overrides: z.record(z.string().min(1).max(120), z.string().max(120)),
});

export async function PATCH(req: NextRequest) {
  const ctx = await requireSuperadmin();
  if (isContextResponse(ctx)) return ctx;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.data.overrides)) {
    const trimmed = String(v).trim();
    if (trimmed) clean[k] = trimmed;
  }
  await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { vocabulary: clean as object } });
  return NextResponse.json({ ok: true, overrides: clean });
}
