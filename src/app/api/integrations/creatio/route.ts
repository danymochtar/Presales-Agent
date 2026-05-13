// Stores / clears the Creatio credentials on the tenant. Superadmin-only
// (passwords are stored unencrypted on the JSON column — the pilot ships
// with this caveat documented; a KMS envelope is the obvious follow-up).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperadmin, isContextResponse } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import type { CreatioCredentials } from "@/lib/integrations/creatio";

export const runtime = "nodejs";

const Body = z.object({
  baseUrl: z.string().url(),
  username: z.string().min(1),
  // Password optional on PATCH so the user can update other fields without
  // re-typing — but a fresh install requires it.
  password: z.string().optional(),
});

export async function GET() {
  const ctx = await requireSuperadmin();
  if (isContextResponse(ctx)) return ctx;
  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId } });
  const integrations = (tenant?.integrations ?? {}) as { creatio?: CreatioCredentials };
  const creatio = integrations.creatio
    ? {
        baseUrl: integrations.creatio.baseUrl,
        username: integrations.creatio.username,
        // Never return the password in plain — show a masked indicator only.
        passwordSet: !!integrations.creatio.password,
        lastSyncAt: integrations.creatio.lastSyncAt ?? null,
      }
    : null;
  return NextResponse.json({ creatio });
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireSuperadmin();
  if (isContextResponse(ctx)) return ctx;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId } });
  const prev = (tenant?.integrations ?? {}) as { creatio?: CreatioCredentials };
  const password = parsed.data.password || prev.creatio?.password || "";
  if (!password) {
    return NextResponse.json({ error: "password required on first save" }, { status: 400 });
  }

  const next: CreatioCredentials = {
    baseUrl: parsed.data.baseUrl.replace(/\/$/, ""),
    username: parsed.data.username,
    password,
    lastSyncAt: prev.creatio?.lastSyncAt ?? null,
  };
  await prisma.tenant.update({
    where: { id: ctx.tenantId },
    data: { integrations: { ...prev, creatio: next } as object },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const ctx = await requireSuperadmin();
  if (isContextResponse(ctx)) return ctx;
  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId } });
  const prev = (tenant?.integrations ?? {}) as Record<string, unknown>;
  delete prev.creatio;
  await prisma.tenant.update({
    where: { id: ctx.tenantId },
    data: { integrations: prev as object },
  });
  return NextResponse.json({ ok: true });
}
