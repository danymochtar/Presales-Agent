import { NextResponse } from "next/server";
import { requireSuperadmin, isContextResponse } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { testConnection, type CreatioCredentials } from "@/lib/integrations/creatio";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST() {
  const ctx = await requireSuperadmin();
  if (isContextResponse(ctx)) return ctx;
  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId } });
  const integrations = (tenant?.integrations ?? {}) as { creatio?: CreatioCredentials };
  if (!integrations.creatio) {
    return NextResponse.json({ error: "Creatio not configured" }, { status: 400 });
  }
  const result = await testConnection(integrations.creatio);
  return NextResponse.json(result);
}
