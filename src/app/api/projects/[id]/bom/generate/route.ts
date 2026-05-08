import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { streamText } from "ai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gateway, DEFAULT_MODEL } from "@/lib/ai";
import { GENERATE_BOM_SYSTEM } from "@/lib/prompts/generate-bom";
import { batchPriceCompute, azureLabelToArm, type CloudType } from "@/lib/pricing";
import { PURCHASE_MODEL_LABELS, type Term } from "@/lib/pricing/types";
import { fxRateOrFallback, usdTo } from "@/lib/pricing/fx";
import { recommendSkuForCloud } from "@/lib/inventory/sizing";
import type { Workload, WorkloadSet } from "@/lib/inventory/workload";
import { logLlmCall } from "@/lib/ai-logging";
import { findMatchingTemplates, formatTemplatesAsPromptSection } from "@/lib/templates";

export const runtime = "nodejs";
export const maxDuration = 60;

type CloudRegions = Record<string, { primary: string; dr: string } | undefined>;

const PRICING_REGION_DEFAULTS: Record<CloudType, { primary: string; dr: string }> = {
  azure: { primary: "malaysiawest",    dr: "southeastasia" },
  aws:   { primary: "ap-southeast-5",  dr: "ap-southeast-1" },
  gcp:   { primary: "asia-southeast2", dr: "asia-southeast1" },
};

function pricingRegion(cloud: CloudType, label: string | undefined): string {
  if (!label) return PRICING_REGION_DEFAULTS[cloud].primary;
  if (cloud === "azure") return azureLabelToArm(label);
  return label; // AWS/GCP region codes are passed through verbatim
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("unauthorized", { status: 401 });

  const url = new URL(req.url);
  const cloudParam = url.searchParams.get("cloud") ?? "azure"; // azure | aws | gcp | compare

  const { id } = await ctx.params;
  const project = await prisma.project.findFirst({
    where: { id, tenant: { users: { some: { id: session.user.id } } } },
    include: {
      tenant: { include: { rateCardItems: true, catalogItems: true, patterns: { where: { active: true, deliverableType: "bom" } } } },
      inputs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!project) return new Response("not found", { status: 404 });
  if (!project.tenant) return new Response("tenant missing", { status: 400 });

  const latest = project.inputs[0];
  const workloadSet = (latest?.workloadsJson as unknown as WorkloadSet | null) ?? null;
  if (!workloadSet || workloadSet.workloads.length === 0) {
    return new Response("no workloads — upload an inventory first", { status: 400 });
  }

  const targetClouds = (project.targetClouds ?? ["azure"]) as CloudType[];
  const cloudRegions = (project.cloudRegions as CloudRegions | null) ?? {};
  const purchaseModel = (project.purchaseModel ?? "consumption") as Term;

  let cloudsToPrice: CloudType[];
  if (cloudParam === "compare") {
    cloudsToPrice = targetClouds.filter((c) => c !== "gcp");
    if (cloudsToPrice.length < 2) {
      return new Response("compare mode needs at least 2 target clouds (and GCP is deferred)", { status: 400 });
    }
  } else {
    if (!targetClouds.includes(cloudParam as CloudType)) {
      return new Response(`cloud "${cloudParam}" is not in this project's targetClouds`, { status: 400 });
    }
    if (cloudParam === "gcp") return new Response("GCP pricing deferred — defer to MVP 14+", { status: 501 });
    cloudsToPrice = [cloudParam as CloudType];
  }

  const fxRate = fxRateOrFallback("MYR", project.tenant.fxMyrPerUsd);
  const pricingByCloud: Record<string, unknown> = {};

  for (const cloud of cloudsToPrice) {
    const labelPrimary = cloudRegions[cloud]?.primary;
    const region = pricingRegion(cloud, labelPrimary);
    const sizedWorkloads: Workload[] = workloadSet.workloads.map((w) => ({
      ...w,
      recommendedSku: recommendSkuForCloud(cloud, w.cpu, w.ramGb),
    }));

    const linuxSkus = [...new Set(sizedWorkloads.filter((w) => w.os === "linux" || w.os === "other").map((w) => w.recommendedSku!))];
    const winSkus = [...new Set(sizedWorkloads.filter((w) => w.os === "windows").map((w) => w.recommendedSku!))];

    const [linuxPrices, winPrices] = await Promise.all([
      linuxSkus.length ? batchPriceCompute(cloud, linuxSkus, region, "linux", purchaseModel) : Promise.resolve({}),
      winSkus.length ? batchPriceCompute(cloud, winSkus, region, "windows", purchaseModel) : Promise.resolve({}),
    ]);

    pricingByCloud[cloud] = {
      regionLabel: labelPrimary ?? PRICING_REGION_DEFAULTS[cloud].primary,
      regionPricingId: region,
      drRegion: cloudRegions[cloud]?.dr ?? PRICING_REGION_DEFAULTS[cloud].dr,
      purchaseModel,
      purchaseModelLabel: PURCHASE_MODEL_LABELS[purchaseModel],
      sizedWorkloads,
      prices: { linux: linuxPrices, windows: winPrices },
    };
  }

  const tenantContext = {
    tenant: {
      name: project.tenant.name,
      country: project.tenant.country,
      currency: project.tenant.currency,
      fxMyrPerUsd: project.tenant.fxMyrPerUsd ?? null,
      commercial: project.tenant.commercial,
      standards: project.tenant.standards,
      guardrails: project.tenant.guardrails,
    },
    rateCard: project.tenant.rateCardItems.map((r) => ({
      role: r.role, level: r.level, dailyRate: r.dailyRate, currency: r.currency, location: r.location,
    })),
    serviceCatalog: project.tenant.catalogItems.map((s) => ({
      service: s.service, defaultEffortDays: s.defaultEffortDays, prerequisite: s.prerequisite, deliverable: s.deliverable, notes: s.notes,
    })),
    learnedPatterns: project.tenant.patterns.map((p) => ({
      pattern: p.pattern, scope: p.scope, conditions: p.conditions, confidence: p.confidence,
    })),
  };

  const mode = cloudParam === "compare" ? "compare" : "single";
  const cloudProviderForTemplates = cloudParam === "compare" ? "compare" : (cloudParam as string);
  const templates = await findMatchingTemplates({
    tenantId: project.tenantId,
    deliverableType: "bom",
    cloud: cloudProviderForTemplates,
    projectType: project.projectType,
    maxCount: 2,
  });
  const templateSection = formatTemplatesAsPromptSection(templates);

  const userMessage = `# Generate ${mode === "compare" ? "comparison" : "single-cloud"} BOM for project: ${project.name}

mode: ${mode}
clouds: [${cloudsToPrice.join(", ")}]
purchase model: ${PURCHASE_MODEL_LABELS[purchaseModel]} (${purchaseModel})
${templateSection ? `\n${templateSection}` : ""}
## Project
- Customer: ${project.customer}
- Industry: ${project.industry ?? "(not specified)"}
- Customer segment: ${project.customerSegment ?? "(not specified)"}
- Scope summary: ${project.scopeSummary ?? "(not specified)"}

## Tenant context (apply rate card, catalog, patterns, guardrails)
\`\`\`json
${JSON.stringify(tenantContext, null, 2)}
\`\`\`

## Workload inventory
Total: ${workloadSet.totals.count} workloads, ${workloadSet.totals.cpu} vCPU, ${workloadSet.totals.ramGb} GB RAM, ${workloadSet.totals.storageGb} GB storage. OS mix: ${JSON.stringify(workloadSet.totals.osMix)}.

## Per-cloud sized workloads + live prices
\`\`\`json
${JSON.stringify(pricingByCloud, null, 2)}
\`\`\`

## FX
- USD → MYR rate: ${fxRate} (source: tenant config or fallback)
- Show MYR equivalent in parentheses next to USD totals.
- Example: USD 1,234.56 (MYR ${usdTo(1234.56, "MYR", project.tenant.fxMyrPerUsd).toLocaleString()})

Generate the BOM now in Markdown following the **${mode}-mode** structure. Apply learned patterns where applicable.
`;

  const result = streamText({
    model: gateway(DEFAULT_MODEL),
    messages: [
      {
        role: "system",
        content: GENERATE_BOM_SYSTEM,
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      },
      { role: "user", content: userMessage },
    ],
    maxOutputTokens: 8000,
  });

  let fullText = "";
  const encoder = new TextEncoder();
  const startTs = Date.now();
  const sse = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of result.textStream) {
          fullText += chunk;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: chunk })}\n\n`));
        }

        const cloudProvider = cloudParam === "compare" ? "compare" : (cloudParam as string);
        const last = await prisma.deliverable.findFirst({
          where: { projectId: project.id, type: "bom", cloudProvider },
          orderBy: { version: "desc" },
        });
        const version = (last?.version ?? 0) + 1;
        const saved = await prisma.deliverable.create({
          data: {
            projectId: project.id,
            type: "bom",
            cloudProvider,
            version,
            status: "draft",
            contentMd: fullText,
            metadata: {
              clouds: cloudsToPrice,
              fxMyrPerUsd: fxRate,
              priceSnapshot: pricingByCloud as object,
              workloadCount: workloadSet.totals.count,
              templateIds: templates.map((t) => t.id),
              generatedAt: new Date().toISOString(),
              model: DEFAULT_MODEL,
            } as object,
          },
        });

        const usage = await result.usage.catch(() => null);
        await logLlmCall({
          tenantId: project.tenantId,
          userId: session.user.id,
          projectId: project.id,
          deliverableId: saved.id,
          purpose: "generate-bom",
          model: DEFAULT_MODEL,
          inputTokens: usage?.inputTokens ?? 0,
          outputTokens: usage?.outputTokens ?? 0,
          durationMs: Date.now() - startTs,
          succeeded: true,
        });

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, deliverableId: saved.id, version, cloudProvider })}\n\n`));
        controller.close();
      } catch (err) {
        await logLlmCall({
          tenantId: project.tenantId,
          userId: session.user.id,
          projectId: project.id,
          purpose: "generate-bom",
          model: DEFAULT_MODEL,
          durationMs: Date.now() - startTs,
          succeeded: false,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: err instanceof Error ? err.message : "unknown error" })}\n\n`),
        );
        controller.close();
      }
    },
  });

  return new Response(sse, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
