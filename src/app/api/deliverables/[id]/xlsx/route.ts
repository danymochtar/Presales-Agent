import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildBomWorkbook, parseLineItemsFromBomMarkdown, type BomLineItem } from "@/lib/exporters/bom-xlsx";
import type { CloudType } from "@/lib/pricing/types";
import { PURCHASE_MODEL_LABELS, type Term } from "@/lib/pricing/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const deliverable = await prisma.deliverable.findFirst({
    where: { id, engagement: { tenant: { users: { some: { id: session.user.id } } } } },
    include: { engagement: { include: { tenant: { select: { fxMyrPerUsd: true } } } } },
  });
  if (!deliverable) return new Response("not found", { status: 404 });
  if (deliverable.type !== "bom") {
    return new Response(
      "xlsx export is only available for BOM deliverables — the calculator-export shape doesn't fit other types",
      { status: 400 },
    );
  }

  // Prefer the LLM-emitted structured block (parsed at generation time +
  // saved into metadata). Fall back to re-parsing the markdown for older
  // BOMs that pre-date the prompt update.
  const metadata = (deliverable.metadata ?? {}) as { lineItems?: BomLineItem[] };
  const lineItems: BomLineItem[] = Array.isArray(metadata.lineItems) && metadata.lineItems.length > 0
    ? metadata.lineItems
    : parseLineItemsFromBomMarkdown(deliverable.contentMd);

  if (lineItems.length === 0) {
    return new Response(
      "no structured line items found in this BOM — regenerate the BOM so the calculator-format JSON block is produced, then re-download.",
      { status: 422 },
    );
  }

  // Resolve cloud + region label from the deliverable + project.
  const cloud: CloudType = (deliverable.cloudProvider === "aws" ? "aws"
    : deliverable.cloudProvider === "gcp" ? "gcp"
    : "azure");
  const cloudRegions = (deliverable.engagement.cloudRegions as Record<string, { primary: string; dr: string }> | null) ?? {};
  const region = cloudRegions[cloud]?.primary ?? "";
  const purchaseModel = (deliverable.engagement.purchaseModel ?? "consumption") as Term;

  const buf = buildBomWorkbook(lineItems, {
    cloud,
    projectName: deliverable.engagement.name,
    customer: deliverable.engagement.customer,
    region,
    purchaseModelLabel: PURCHASE_MODEL_LABELS[purchaseModel],
    fxMyrPerUsd: deliverable.engagement.tenant?.fxMyrPerUsd ?? null,
  });

  const filename = `${deliverable.engagement.customer.replace(/[^a-zA-Z0-9]+/g, "-")}-${cloud}-bom-v${deliverable.version}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buf.length),
    },
  });
}
