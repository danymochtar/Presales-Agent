// Pulls opportunities from Creatio and upserts them into a single Tracker
// row tagged source=creatio + purpose=crm_sync. Idempotent: re-running the
// sync updates existing opportunities by externalId without duplicating.

import { NextResponse } from "next/server";
import { requireSuperadmin, isContextResponse } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { fetchOpportunities, type CreatioCredentials } from "@/lib/integrations/creatio";
import { normalizeStatus } from "@/lib/pipeline/status";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const ctx = await requireSuperadmin();
  if (isContextResponse(ctx)) return ctx;
  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId } });
  const integrations = (tenant?.integrations ?? {}) as { creatio?: CreatioCredentials };
  if (!integrations.creatio) {
    return NextResponse.json({ error: "Creatio not configured" }, { status: 400 });
  }

  let rows;
  try {
    rows = await fetchOpportunities(integrations.creatio);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Creatio fetch failed" },
      { status: 502 },
    );
  }

  // Find or create the CRM-sync tracker row. One per tenant — re-sync just
  // updates the row's opportunities, doesn't spawn copies.
  let tracker = await prisma.tracker.findFirst({
    where: { tenantId: ctx.tenantId, source: "creatio" },
  });
  if (!tracker) {
    tracker = await prisma.tracker.create({
      data: {
        tenantId: ctx.tenantId,
        ownerId: ctx.userId,
        name: "Creatio CRM",
        source: "creatio",
        purpose: "crm_sync",
        fieldMapping: {} as object,
        lastSyncAt: new Date(),
      },
    });
  } else {
    await prisma.tracker.update({
      where: { id: tracker.id },
      data: { lastSyncAt: new Date() },
    });
  }

  // Upsert by externalId. fxMyrPerUsd from tenant for the MYR mirror column.
  const fx = tenant?.fxMyrPerUsd ?? null;
  let created = 0;
  let updated = 0;
  for (const r of rows) {
    const status = normalizeStatus(r.rawStatus);
    const valueMyr = fx && r.valueUsd != null ? r.valueUsd * fx : null;
    const existing = await prisma.opportunity.findFirst({
      where: { trackerId: tracker.id, externalId: r.externalId },
    });
    if (existing) {
      await prisma.opportunity.update({
        where: { id: existing.id },
        data: {
          customer: r.customer,
          name: r.name,
          status,
          rawStatus: r.rawStatus,
          valueUsd: r.valueUsd,
          valueMyr,
          closeDate: r.closeDate,
          ownerName: r.ownerName,
          notes: existing.notes, // preserve user-added notes
          raw: r.raw as object,
          lastTouchedAt: new Date(),
        },
      });
      updated += 1;
    } else {
      await prisma.opportunity.create({
        data: {
          trackerId: tracker.id,
          externalId: r.externalId,
          customer: r.customer,
          name: r.name,
          status,
          rawStatus: r.rawStatus,
          originKind: "existing_customer", // CRM-sourced opps are typically existing
          valueUsd: r.valueUsd,
          valueMyr,
          closeDate: r.closeDate,
          ownerName: r.ownerName,
          raw: r.raw as object,
        },
      });
      created += 1;
    }
  }

  // Stamp lastSyncAt on the creds JSON too so the settings page reflects it.
  const prev = (tenant?.integrations ?? {}) as { creatio?: CreatioCredentials };
  if (prev.creatio) {
    await prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: {
        integrations: {
          ...prev,
          creatio: { ...prev.creatio, lastSyncAt: new Date().toISOString() },
        } as object,
      },
    });
  }

  return NextResponse.json({ ok: true, trackerId: tracker.id, created, updated, total: rows.length });
}
