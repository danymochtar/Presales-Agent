import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { buildPipelineWorkbook, type PipelineOpportunityRow, type PipelineTrackerExport } from "@/lib/exporters/pipeline-xlsx";
import type { PipelineStatus } from "@/lib/pipeline/status";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("unauthorized", { status: 401 });
  const { tenant } = await requireSessionAndTenant(session.user.id);

  const trackers = await prisma.tracker.findMany({
    where: { tenantId: tenant.id },
    orderBy: { name: "asc" },
    include: { opportunities: { orderBy: { lastTouchedAt: "desc" } } },
  });

  const trackerExports: PipelineTrackerExport[] = trackers.map((t) => ({
    id: t.id,
    name: t.name,
    source: t.source,
    opportunities: t.opportunities.map((o): PipelineOpportunityRow => ({
      id: o.id,
      trackerName: t.name,
      trackerSource: t.source,
      externalId: o.externalId,
      customer: o.customer,
      name: o.name,
      status: o.status as PipelineStatus,
      rawStatus: o.rawStatus,
      originKind: o.originKind,
      valueUsd: o.valueUsd ? Number(o.valueUsd) : null,
      valueMyr: o.valueMyr ? Number(o.valueMyr) : null,
      closeDate: o.closeDate,
      ownerName: o.ownerName,
      vendor: o.vendor,
      fundingProgram: o.fundingProgram,
      fundingExpiresAt: o.fundingExpiresAt,
      notes: o.notes,
      raw: (o.raw as Record<string, unknown>) ?? {},
    })),
  }));

  const buf = buildPipelineWorkbook(trackerExports, {
    tenantName: tenant.name,
    fxMyrPerUsd: tenant.fxMyrPerUsd ?? null,
    asOf: new Date(),
  });

  const filename = `${tenant.slug || "tenant"}-pipeline-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buf.length),
    },
  });
}
