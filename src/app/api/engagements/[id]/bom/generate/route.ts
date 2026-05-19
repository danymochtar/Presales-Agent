import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { streamText } from "ai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gateway, DEFAULT_MODEL } from "@/lib/ai";
import { GENERATE_BOM_SYSTEM } from "@/lib/prompts/generate-bom";
import { batchPriceCompute, batchPriceComputeAllTerms, azureLabelToArm, ALL_TERMS, type CloudType } from "@/lib/pricing";
import { PURCHASE_MODEL_LABELS, type Term, type ComputeQuoteResult } from "@/lib/pricing/types";
import { licensingScenario } from "@/lib/pricing/licensing";
import { fxRateOrFallback, usdTo } from "@/lib/pricing/fx";
import { recommendSkuForCloud } from "@/lib/inventory/sizing";
import type { Workload, WorkloadSet } from "@/lib/inventory/workload";
import { logLlmCall } from "@/lib/ai-logging";
import { findMatchingTemplates, formatTemplatesAsPromptSection } from "@/lib/templates";
import { classifyWorkload, WORKLOAD_TYPE_LABELS } from "@/lib/inventory/workload-classifier";
import { detectComponents, COMPONENT_KIND_LABELS } from "@/lib/inventory/component-detector";
import { recommendPaas, MIGRATION_STRATEGY_LABELS, type MigrationStrategy } from "@/lib/inventory/paas-recommender";
import { lzForCloud } from "@/lib/landing-zone/catalog";
import { lzMonthlyUsd, lzBaselineMonthlyUsd } from "@/lib/landing-zone/pricing";
import { parseLineItemsFromBomMarkdown } from "@/lib/exporters/bom-xlsx";
import { diffBom } from "@/lib/exporters/bom-diff";

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
  const project = await prisma.engagement.findFirst({
    where: { id, tenant: { users: { some: { id: session.user.id } } } },
    include: {
      tenant: { include: { patterns: { where: { active: true, deliverableType: "bom" } } } },
      inputs: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!project) return new Response("not found", { status: 404 });
  if (!project.tenant) return new Response("tenant missing", { status: 400 });

  const latestWithWorkloads = project.inputs.find((i) => i.workloadsJson);
  const workloadSet = (latestWithWorkloads?.workloadsJson as unknown as WorkloadSet | null) ?? null;

  // Classify-then-price: cheap Haiku pass on the supplied artifacts decides
  // which output structure the BOM prompt produces (vm / siem / ai / data /
  // app_mod / mixed). Only vm_inventory + app_modernization + mixed REQUIRE
  // a sized workload set; the other types price from document text alone.
  const profile = await classifyWorkload({
    filenames: project.inputs.map((i) => i.filename ?? "(unnamed)"),
    summaries: project.inputs.map((i) => i.rawSummary ?? ""),
    textSnippets: project.inputs.map((i) => i.textContent ?? ""),
    workloadRowCount: workloadSet?.workloads.length ?? 0,
  });

  if (profile.needsVmSizing && (!workloadSet || workloadSet.workloads.length === 0)) {
    return new Response(
      `Workload type "${WORKLOAD_TYPE_LABELS[profile.primaryType]}" needs a sized inventory. Upload an RVTools / Azure Migrate / CSV file or fill the workload table in the mapping review step.`,
      { status: 400 },
    );
  }

  const targetClouds = (project.targetClouds ?? ["azure"]) as CloudType[];
  const cloudRegions = (project.cloudRegions as CloudRegions | null) ?? {};
  const purchaseModel = (project.purchaseModel ?? "consumption") as Term;
  const migrationStrategy = (project.migrationStrategy ?? "lift_and_shift") as MigrationStrategy;

  // Detect workload components (DB / web / cache / file / AD / containers).
  // Empty when workloadSet is null (non-VM artifact types like SIEM / AI).
  const { components: detectedComponents, counts: componentCounts } = workloadSet
    ? detectComponents(workloadSet)
    : { components: [], counts: {} as Partial<Record<string, number>> };
  const detectedKinds = detectedComponents.map((c) => c.kind);

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
    cloudsToPrice = [cloudParam as CloudType];
  }
  // GCP requires a Cloud Billing API key — surface a clear error early
  // instead of producing a BOM full of "GCP pricing not found" rows.
  if (cloudsToPrice.includes("gcp")) {
    const integrations = (project.tenant.integrations ?? {}) as { gcp?: { apiKey?: string } };
    if (!integrations.gcp?.apiKey && !process.env.GCP_BILLING_API_KEY) {
      return new Response(
        "GCP pricing needs a Cloud Billing API key. Configure it on /admin → CRM connector & integrations → GCP, or set GCP_BILLING_API_KEY in your environment.",
        { status: 412 },
      );
    }
  }

  const fxRate = fxRateOrFallback("MYR", project.tenant.fxMyrPerUsd);

  const cloudEntries = await Promise.all(cloudsToPrice.map(async (cloud) => {
    const labelPrimary = cloudRegions[cloud]?.primary;
    const region = pricingRegion(cloud, labelPrimary);

    // Non-VM workload profiles (siem / ai / data) skip the IaaS sizing and
    // batched VM pricing — those would be empty anyway. The LLM prices the
    // workload-type-specific services (Log Analytics / Sentinel / Azure
    // OpenAI tokens / Fabric capacity) from its training data + the
    // workload profile block in the user message. VM-specific pricing
    // helpers light up only when sized workloads are present.
    const sizedWorkloads: Workload[] = workloadSet
      ? workloadSet.workloads.map((w) => ({
          ...w,
          recommendedSku: recommendSkuForCloud(cloud, w.cpu, w.ramGb),
        }))
      : [];

    const linuxSkus = [...new Set(sizedWorkloads.filter((w) => w.os === "linux" || w.os === "other").map((w) => w.recommendedSku!))];
    const winSkus = [...new Set(sizedWorkloads.filter((w) => w.os === "windows").map((w) => w.recommendedSku!))];

    // Fetch all 5 commitment terms (PAYG / RI-1y / RI-3y / SP-1y / SP-3y)
    // in parallel so the BOM can render a side-by-side commitment table.
    // The chosen `purchaseModel` is what we treat as the "headline" price.
    const emptyAllTerms = (): Record<string, Awaited<ReturnType<typeof batchPriceComputeAllTerms>>[string]> => ({});
    const priceOpts = {
      tenantIntegrations: (project.tenant.integrations ?? {}) as { gcp?: { apiKey?: string } },
    };
    const [linuxAllTerms, winAllTerms] = await Promise.all([
      linuxSkus.length ? batchPriceComputeAllTerms(cloud, linuxSkus, region, "linux", priceOpts) : Promise.resolve(emptyAllTerms()),
      winSkus.length ? batchPriceComputeAllTerms(cloud, winSkus, region, "windows", priceOpts) : Promise.resolve(emptyAllTerms()),
    ]);
    const linuxPrices: Record<string, ComputeQuoteResult> = Object.fromEntries(
      Object.entries(linuxAllTerms).map(([sku, r]) => [sku, r.byTerm[purchaseModel]]),
    );
    const winPrices: Record<string, ComputeQuoteResult> = Object.fromEntries(
      Object.entries(winAllTerms).map(([sku, r]) => [sku, r.byTerm[purchaseModel]]),
    );

    // Headline monthly = sum at selected purchase model.
    const baseMonthly = sizedWorkloads.reduce((sum, w) => {
      const sku = w.recommendedSku;
      if (!sku) return sum;
      const tbl: Record<string, ComputeQuoteResult> = w.os === "windows" ? winPrices : linuxPrices;
      const r = tbl[sku];
      if (r && r.found) return sum + (r.monthlyUsd ?? 0) * w.count;
      return sum;
    }, 0);

    // Per-term totals — used by the BOM prompt to surface a multi-commitment
    // comparison + by metadata.commitmentSummary so the dashboard tile can
    // show break-even math without re-running the BOM.
    const commitmentTotals: Partial<Record<Term, number>> = {};
    for (const term of ALL_TERMS) {
      const total = sizedWorkloads.reduce((sum, w) => {
        const sku = w.recommendedSku;
        if (!sku) return sum;
        const r = (w.os === "windows" ? winAllTerms : linuxAllTerms)[sku];
        const q = r?.byTerm[term];
        if (q && q.found) return sum + (q.monthlyUsd ?? 0) * w.count;
        return sum;
      }, 0);
      commitmentTotals[term] = Math.round(total * 100) / 100;
    }

    const licensing = workloadSet
      ? licensingScenario(cloud, { ...workloadSet, workloads: sizedWorkloads }, baseMonthly)
      : null;

    // Landing-zone components for this cloud — now with reference monthly
    // prices so the LZ section of the BOM rolls into the grand total.
    const landingZoneComponents = lzForCloud(cloud, detectedKinds);
    const landingZonePriced = landingZoneComponents.map((c) => {
      const p = lzMonthlyUsd(cloud, c.name);
      return { ...c, monthlyUsd: p.monthlyUsd, pricingNote: p.note };
    });
    const lzTotals = lzBaselineMonthlyUsd(cloud, landingZoneComponents.map((c) => c.name));

    return [cloud, {
      regionLabel: labelPrimary ?? PRICING_REGION_DEFAULTS[cloud].primary,
      regionPricingId: region,
      drRegion: cloudRegions[cloud]?.dr ?? PRICING_REGION_DEFAULTS[cloud].dr,
      purchaseModel,
      purchaseModelLabel: PURCHASE_MODEL_LABELS[purchaseModel],
      sizedWorkloads,
      prices: { linux: linuxPrices, windows: winPrices },
      pricesByTerm: { linux: linuxAllTerms, windows: winAllTerms },
      commitmentTotals,
      licensing,
      landingZone: landingZonePriced,
      landingZoneBaselineMonthlyUsd: lzTotals.totalUsd,
      landingZonePricedCount: lzTotals.pricedCount,
      landingZoneUnpricedCount: lzTotals.unpricedCount,
      paasRecommendations: workloadSet
        ? recommendPaas(workloadSet, detectedComponents, cloud, migrationStrategy)
        : [],
    }] as const;
  }));
  const pricingByCloud: Record<string, unknown> = Object.fromEntries(cloudEntries);

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
    engagementType: project.engagementType,
    maxCount: 2,
  });
  const templateSection = formatTemplatesAsPromptSection(templates);

  const userMessage = `# Generate ${mode === "compare" ? "comparison" : "single-cloud"} BOM for project: ${project.name}

mode: ${mode}
clouds: [${cloudsToPrice.join(", ")}]
purchase model: ${PURCHASE_MODEL_LABELS[purchaseModel]} (${purchaseModel})
${templateSection ? `\n${templateSection}` : ""}

## Workload profile (classify-then-price — drives output structure)
\`\`\`json
${JSON.stringify({
  primaryType: profile.primaryType,
  primaryLabel: WORKLOAD_TYPE_LABELS[profile.primaryType],
  secondaryTypes: profile.secondaryTypes,
  rationale: profile.rationale,
  confidence: profile.confidence,
  needsVmSizing: profile.needsVmSizing,
  sources: profile.sources,
}, null, 2)}
\`\`\`
Match the output structure to \`primaryType\` per the system prompt. State the detected type + rationale in Section 1 (Executive summary).

${project.solutionArea ? `## Solution area (user-confirmed engagement classification)
\`\`\`json
${JSON.stringify({ solutionArea: project.solutionArea })}
\`\`\`
State the solution area in Section 1 alongside the workload profile. The classification is the user's final call — do not override it.
` : ""}

## Migration strategy
\`\`\`json
${JSON.stringify({
  strategy: migrationStrategy,
  label: MIGRATION_STRATEGY_LABELS[migrationStrategy],
  rules:
    migrationStrategy === "lift_and_shift"
      ? "Every workload stays IaaS. Ignore the PaaS recommendations block. Do NOT add a Modernization-target column."
      : migrationStrategy === "hybrid"
        ? "Modernize the obvious wins (databases, caches, file shares) to PaaS. Keep custom apps + AD + container hosts on IaaS. Use the PaaS recommendations block VERBATIM — do not invent targets."
        : "Modernize every component that has a clean PaaS target. Non-modernizable rows (modernizable: false) stay IaaS with an explicit 'Keep as IaaS — {reason}' note. Use the PaaS recommendations block VERBATIM.",
}, null, 2)}
\`\`\`

## Detected workload components
\`\`\`json
${JSON.stringify({
  totalDetected: detectedComponents.length,
  countsByKind: Object.fromEntries(
    Object.entries(componentCounts).map(([k, v]) => [`${k} (${COMPONENT_KIND_LABELS[k as keyof typeof COMPONENT_KIND_LABELS] ?? k})`, v]),
  ),
  components: detectedComponents,
}, null, 2)}
\`\`\`
Surface low-confidence detections under Assumptions so the reviewer can override.

## Project
- Customer: ${project.customer}
- Industry: ${project.industry ?? "(not specified)"}
- Customer segment: ${project.customerSegment ?? "(not specified)"}
- Scope summary: ${project.scopeSummary ?? "(not specified)"}

## Tenant context (apply rate card, catalog, patterns, guardrails)
\`\`\`json
${JSON.stringify(tenantContext, null, 2)}
\`\`\`

${workloadSet ? `## Workload inventory
Total: ${workloadSet.totals.count} workloads, ${workloadSet.totals.cpu} vCPU, ${workloadSet.totals.ramGb} GB RAM, ${workloadSet.totals.storageGb} GB storage. OS mix: ${JSON.stringify(workloadSet.totals.osMix)}.` : `## Workload inventory
_No structured workload set parsed — this is expected for ${WORKLOAD_TYPE_LABELS[profile.primaryType]} profiles. Build Section 2 (Ingestion / Model usage / Capacity profile) from the text content in the project inputs below._`}

${project.inputs.length > 0 ? `## Uploaded artifacts (text content for non-VM extraction)
${project.inputs.map((i) => `### ${i.filename ?? "(unnamed)"} — ${i.kind}\n${i.rawSummary ?? ""}\n${i.textContent ? "\`\`\`\n" + i.textContent.slice(0, 12_000) + "\n\`\`\`" : "(no text content)"}`).join("\n\n---\n\n")}` : ""}

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
        const lineItems = parseLineItemsFromBomMarkdown(fullText);
        const lineItemCounts = {
          total: lineItems.length,
          landingZone: lineItems.filter((i) => i.section === "landing_zone").length,
          workload: lineItems.filter((i) => i.section === "workload").length,
        };
        const last = await prisma.deliverable.findFirst({
          where: { engagementId: project.id, type: "bom", cloudProvider },
          orderBy: { version: "desc" },
        });
        // Compute the version diff vs. the previous BOM so we can surface
        // "what changed" on the workspace without re-parsing later. Stored
        // as JSON on metadata.
        const prevLineItems = (last?.metadata as { lineItems?: unknown } | null)?.lineItems;
        const diffVsPrev = last && Array.isArray(prevLineItems)
          ? diffBom(prevLineItems as Parameters<typeof diffBom>[0], lineItems)
          : null;
        const version = (last?.version ?? 0) + 1;
        const saved = await prisma.deliverable.create({
          data: {
            engagementId: project.id,
            type: "bom",
            cloudProvider,
            version,
            status: "draft",
            contentMd: fullText,
            metadata: {
              clouds: cloudsToPrice,
              fxMyrPerUsd: fxRate,
              priceSnapshot: pricingByCloud as object,
              workloadCount: workloadSet?.totals.count ?? 0,
              workloadProfile: profile,
              migrationStrategy,
              detectedComponents: detectedComponents as unknown as object,
              componentCounts: componentCounts as object,
              // Calculator-format structured line items extracted from the
              // LLM's trailing JSON block. Consumed by GET /api/deliverables/
              // [id]/xlsx to render the workbook on download.
              lineItems: lineItems as unknown as object,
              lineItemCounts,
              monthlyComputeBaselineUsdByCloud: Object.fromEntries(
                Object.entries(pricingByCloud).map(([c, v]) => {
                  const lic = (v as { licensing?: { workloadCounts?: unknown } }).licensing;
                  // baseMonthly was passed into licensingScenario; recompute from sized workloads.
                  const sized = (v as { sizedWorkloads: Workload[] }).sizedWorkloads;
                  const linuxTbl = (v as { prices: { linux: Record<string, ComputeQuoteResult> } }).prices.linux;
                  const winTbl = (v as { prices: { windows: Record<string, ComputeQuoteResult> } }).prices.windows;
                  const monthly = sized.reduce((s, w) => {
                    const sku = w.recommendedSku;
                    if (!sku) return s;
                    const r = (w.os === "windows" ? winTbl : linuxTbl)[sku];
                    return r && r.found ? s + (r.monthlyUsd ?? 0) * w.count : s;
                  }, 0);
                  return [c, Math.round(monthly * 100) / 100];
                  void lic;
                }),
              ),
              // Per-cloud per-commitment monthly USD across all 5 terms.
              // The dashboard tile + overview panel use this to render a
              // savings comparison without re-running the BOM.
              commitmentSummaryByCloud: Object.fromEntries(
                Object.entries(pricingByCloud).map(([c, v]) => {
                  const t = (v as { commitmentTotals?: Partial<Record<Term, number>> }).commitmentTotals ?? {};
                  return [c, t];
                }),
              ),
              landingZoneBaselineMonthlyUsdByCloud: Object.fromEntries(
                Object.entries(pricingByCloud).map(([c, v]) => {
                  const total = (v as { landingZoneBaselineMonthlyUsd?: number }).landingZoneBaselineMonthlyUsd ?? 0;
                  return [c, total];
                }),
              ),
              diffVsPrevious: diffVsPrev as unknown as object | null,
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
          engagementId: project.id,
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
          engagementId: project.id,
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
