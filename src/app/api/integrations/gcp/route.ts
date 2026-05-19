// Tenant-scoped GCP Cloud Billing API key configuration. Superadmin-only.
// Stored unencrypted on Tenant.integrations.gcp — same pilot caveat as
// the Creatio integration card (KMS envelope is the obvious follow-up).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperadmin, isContextResponse } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const Body = z.object({
  apiKey: z.string().trim().min(1).optional(),
  useLivePricing: z.boolean().optional(),
});

export async function GET() {
  const ctx = await requireSuperadmin();
  if (isContextResponse(ctx)) return ctx;
  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId } });
  const integrations = (tenant?.integrations ?? {}) as { gcp?: { apiKey?: string; useLivePricing?: boolean } };
  return NextResponse.json({
    gcp: integrations.gcp
      ? {
          apiKeySet: !!integrations.gcp.apiKey,
          useLivePricing: integrations.gcp.useLivePricing ?? true,
        }
      : null,
  });
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireSuperadmin();
  if (isContextResponse(ctx)) return ctx;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId } });
  const prev = (tenant?.integrations ?? {}) as { gcp?: { apiKey?: string; useLivePricing?: boolean } };
  const next = {
    apiKey: parsed.data.apiKey || prev.gcp?.apiKey || "",
    useLivePricing: parsed.data.useLivePricing ?? prev.gcp?.useLivePricing ?? true,
  };
  if (!next.apiKey) {
    return NextResponse.json({ error: "apiKey required on first save" }, { status: 400 });
  }
  await prisma.tenant.update({
    where: { id: ctx.tenantId },
    data: { integrations: { ...prev, gcp: next } as object },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const ctx = await requireSuperadmin();
  if (isContextResponse(ctx)) return ctx;
  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId } });
  const prev = (tenant?.integrations ?? {}) as Record<string, unknown>;
  delete prev.gcp;
  await prisma.tenant.update({
    where: { id: ctx.tenantId },
    data: { integrations: prev as object },
  });
  return NextResponse.json({ ok: true });
}
