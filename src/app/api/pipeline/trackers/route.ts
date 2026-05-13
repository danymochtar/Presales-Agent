import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { readWorkbookPreview, readWorkbookRows, suggestMapping, applyMapping, type FieldMapping, CANONICAL_FIELDS } from "@/lib/pipeline/field-mapping";
import type { PipelineStatus } from "@/lib/pipeline/status";
import { OPPORTUNITY_ORIGINS, detectOrigin, type OpportunityOrigin } from "@/lib/pipeline/origin";

export const runtime = "nodejs";
export const maxDuration = 60;

const SourceEnum = z.enum(["microsoft", "smb", "smc", "ent_ps", "sales_rep", "funding", "other"]);
const OriginEnum = z.enum(OPPORTUNITY_ORIGINS as [OpportunityOrigin, ...OpportunityOrigin[]]);

const FieldMappingSchema = z.record(z.enum(CANONICAL_FIELDS as [string, ...string[]]), z.string().nullable());
const StatusMappingSchema = z.record(z.string(), z.string());

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tenant } = await requireSessionAndTenant(session.user.id);
  const trackers = await prisma.tracker.findMany({
    where: { tenantId: tenant.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { opportunities: true } } },
  });
  return NextResponse.json({ trackers });
}

// Accepts multipart form upload: file=<xlsx>, name=<string>, source=<enum>
// Returns the new tracker + initial import summary.
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { user, tenant } = await requireSessionAndTenant(session.user.id);

  const form = await req.formData();
  const file = form.get("file");
  const name = String(form.get("name") ?? "").trim();
  const source = String(form.get("source") ?? "other");
  const defaultOriginRaw = String(form.get("defaultOriginKind") ?? "unknown");
  const mappingRaw = form.get("mapping");
  const statusMappingRaw = form.get("statusMapping");

  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!SourceEnum.safeParse(source).success) {
    return NextResponse.json({ error: "invalid source" }, { status: 400 });
  }
  // Origin: explicit form value wins; otherwise infer from the tracker name
  // (e.g. "FY26 carry-over", "FY27 target list"); default unknown.
  const explicitOrigin = OriginEnum.safeParse(defaultOriginRaw);
  const defaultOriginKind: OpportunityOrigin =
    explicitOrigin.success ? explicitOrigin.data : (detectOrigin(name) ?? "unknown");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const buf = Buffer.from(await (file as File).arrayBuffer());

  let mapping: FieldMapping;
  if (mappingRaw && typeof mappingRaw === "string") {
    const parsed = FieldMappingSchema.safeParse(JSON.parse(mappingRaw));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    mapping = parsed.data as FieldMapping;
  } else {
    const preview = readWorkbookPreview(buf);
    mapping = suggestMapping(preview[0]?.headers ?? []);
  }

  let statusMapping: Record<string, PipelineStatus> | null = null;
  if (statusMappingRaw && typeof statusMappingRaw === "string") {
    const parsed = StatusMappingSchema.safeParse(JSON.parse(statusMappingRaw));
    if (parsed.success) statusMapping = parsed.data as Record<string, PipelineStatus>;
  }

  const { rows } = readWorkbookRows(buf);
  const normalized = applyMapping(rows, mapping, {
    statusMapping,
    fxMyrPerUsd: tenant.fxMyrPerUsd ?? null,
  });

  const tracker = await prisma.$transaction(async (tx) => {
    const t = await tx.tracker.create({
      data: {
        tenantId: tenant.id,
        ownerId: user.id,
        name,
        source,
        fieldMapping: mapping as object,
        statusMapping: (statusMapping as object | null) ?? undefined,
        defaultOriginKind,
        lastSyncAt: new Date(),
      },
    });
    if (normalized.length > 0) {
      await tx.opportunity.createMany({
        data: normalized.map((o) => ({
          trackerId: t.id,
          externalId: o.externalId,
          customer: o.customer,
          name: o.name,
          status: o.status,
          rawStatus: o.rawStatus,
          originKind: defaultOriginKind,
          valueUsd: o.valueUsd ?? null,
          valueMyr: o.valueMyr ?? null,
          closeDate: o.closeDate,
          ownerName: o.ownerName,
          vendor: o.vendor,
          fundingProgram: o.fundingProgram,
          fundingExpiresAt: o.fundingExpiresAt,
          notes: o.notes,
          raw: o.raw as object,
        })),
      });
    }
    return t;
  });

  return NextResponse.json({ tracker, importedCount: normalized.length });
}
