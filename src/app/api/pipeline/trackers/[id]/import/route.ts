import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { applyMapping, readWorkbookRows, type FieldMapping } from "@/lib/pipeline/field-mapping";
import type { PipelineStatus } from "@/lib/pipeline/status";

export const runtime = "nodejs";
export const maxDuration = 60;

// Re-import using the tracker's saved fieldMapping. Multipart upload with
// file=<xlsx>, mode=append|replace (default append).
// Upserts by externalId when present; otherwise inserts as new rows.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tenant } = await requireSessionAndTenant(session.user.id);
  const { id } = await ctx.params;
  const tracker = await prisma.tracker.findFirst({ where: { id, tenantId: tenant.id } });
  if (!tracker) return NextResponse.json({ error: "not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  const mode = String(form.get("mode") ?? "append");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const buf = Buffer.from(await (file as File).arrayBuffer());
  const { rows } = readWorkbookRows(buf);
  const normalized = applyMapping(rows, tracker.fieldMapping as FieldMapping, {
    statusMapping: (tracker.statusMapping as Record<string, PipelineStatus> | null) ?? null,
    fxMyrPerUsd: tenant.fxMyrPerUsd ?? null,
  });

  let upserted = 0;
  let inserted = 0;

  await prisma.$transaction(async (tx) => {
    if (mode === "replace") {
      await tx.opportunity.deleteMany({ where: { trackerId: tracker.id } });
    }
    for (const o of normalized) {
      const existing = o.externalId
        ? await tx.opportunity.findFirst({ where: { trackerId: tracker.id, externalId: o.externalId } })
        : null;
      if (existing) {
        await tx.opportunity.update({
          where: { id: existing.id },
          data: {
            customer: o.customer,
            name: o.name,
            status: o.status,
            rawStatus: o.rawStatus,
            valueUsd: o.valueUsd ?? null,
            valueMyr: o.valueMyr ?? null,
            closeDate: o.closeDate,
            ownerName: o.ownerName,
            vendor: o.vendor,
            fundingProgram: o.fundingProgram,
            fundingExpiresAt: o.fundingExpiresAt,
            notes: o.notes,
            raw: o.raw as object,
            lastTouchedAt: new Date(),
          },
        });
        upserted += 1;
      } else {
        await tx.opportunity.create({
          data: {
            trackerId: tracker.id,
            externalId: o.externalId,
            customer: o.customer,
            name: o.name,
            status: o.status,
            rawStatus: o.rawStatus,
            valueUsd: o.valueUsd ?? null,
            valueMyr: o.valueMyr ?? null,
            closeDate: o.closeDate,
            ownerName: o.ownerName,
            vendor: o.vendor,
            fundingProgram: o.fundingProgram,
            fundingExpiresAt: o.fundingExpiresAt,
            notes: o.notes,
            raw: o.raw as object,
          },
        });
        inserted += 1;
      }
    }
    await tx.tracker.update({ where: { id: tracker.id }, data: { lastSyncAt: new Date() } });
  });

  return NextResponse.json({ ok: true, inserted, upserted, total: normalized.length });
}
