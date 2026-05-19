// Download a pricing-calculator import file for the BOM. The architect
// uploads this into the Azure Pricing Calculator (JSON) or AWS Pricing
// Calculator (CSV) to verify the BOM's numbers against the canonical source.

import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { exportAzureCalculatorJson, exportAwsCalculatorCsv } from "@/lib/pricing/calculator-export";
import type { BomLineItem } from "@/lib/exporters/bom-xlsx";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const deliverable = await prisma.deliverable.findFirst({
    where: { id, engagement: { tenant: { users: { some: { id: session.user.id } } } } },
    include: { engagement: { select: { name: true, customer: true } } },
  });
  if (!deliverable) return new Response("not found", { status: 404 });
  if (deliverable.type !== "bom") {
    return new Response("calculator export is only available for BOM deliverables", { status: 400 });
  }

  const meta = (deliverable.metadata ?? {}) as { lineItems?: BomLineItem[] };
  const lineItems: BomLineItem[] = Array.isArray(meta.lineItems) ? meta.lineItems : [];
  if (lineItems.length === 0) {
    return new Response("no structured line items on this BOM — regenerate to produce the calculator-format JSON block", { status: 422 });
  }

  const cloud = deliverable.cloudProvider ?? "azure";
  const estimateName = `${deliverable.engagement.customer.replace(/[^a-zA-Z0-9]+/g, "-")}-${cloud}-bom-v${deliverable.version}`;

  const out = cloud === "aws"
    ? exportAwsCalculatorCsv(lineItems, { estimateName })
    : exportAzureCalculatorJson(lineItems, { estimateName });

  return new Response(out.body, {
    headers: {
      "Content-Type": out.contentType,
      "Content-Disposition": `attachment; filename="${out.filename}"`,
    },
  });
}
