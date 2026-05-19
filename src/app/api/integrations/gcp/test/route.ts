// Verifies the GCP API key + permissions by hitting the Cloud Billing
// Catalog services endpoint (no scope on cost — just confirms the key
// has access to the catalog).

import { NextResponse } from "next/server";
import { requireSuperadmin, isContextResponse } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST() {
  const ctx = await requireSuperadmin();
  if (isContextResponse(ctx)) return ctx;
  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId } });
  const integrations = (tenant?.integrations ?? {}) as { gcp?: { apiKey?: string } };
  const apiKey = integrations.gcp?.apiKey;
  if (!apiKey) return NextResponse.json({ ok: false, error: "GCP API key not configured" });

  try {
    // Lowest-cost validation call — list services, take the first 1.
    const url = `https://cloudbilling.googleapis.com/v1/services?key=${encodeURIComponent(apiKey)}&pageSize=1`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json({ ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "unknown" });
  }
}
