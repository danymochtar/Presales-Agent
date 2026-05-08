import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { anthropic, DEFAULT_MODEL } from "@/lib/anthropic";
import { GENERATE_BOM_SYSTEM } from "@/lib/prompts/generate-bom";
import { batchVmPrices } from "@/lib/pricing/azure";
import { fxRateOrFallback, usdTo } from "@/lib/pricing/fx";
import { recommendSku } from "@/lib/inventory/sizing";
import type { Workload, WorkloadSet } from "@/lib/inventory/workload";

export const runtime = "nodejs";
export const maxDuration = 60;

const REGION_TO_ARM: Record<string, string> = {
  "Malaysia Central": "malaysiacentral",
  "Southeast Asia": "southeastasia",
  "East Asia": "eastasia",
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("unauthorized", { status: 401 });

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

  // 1. Ensure every workload has an ARM SKU recommendation
  const workloads: Workload[] = workloadSet.workloads.map((w) => ({
    ...w,
    recommendedSku: w.recommendedSku ?? recommendSku(w.cpu, w.ramGb),
  }));

  // 2. Fetch live prices server-side (deterministic, fast, parallel)
  const armRegion = REGION_TO_ARM[project.primaryRegion] ?? "malaysiacentral";
  const linuxSkus = [...new Set(workloads.filter((w) => w.os === "linux" || w.os === "other").map((w) => w.recommendedSku!))];
  const windowsSkus = [...new Set(workloads.filter((w) => w.os === "windows").map((w) => w.recommendedSku!))];

  const [linuxPrices, windowsPrices] = await Promise.all([
    linuxSkus.length ? batchVmPrices(linuxSkus, armRegion, "linux", "consumption") : Promise.resolve({}),
    windowsSkus.length ? batchVmPrices(windowsSkus, armRegion, "windows", "consumption") : Promise.resolve({}),
  ]);

  // 3. Build the user message: workloads + prices + tenant context + patterns
  const fxRate = fxRateOrFallback("MYR", project.tenant.fxMyrPerUsd);
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

  const userMessage = `# Generate BOM for project: ${project.name}

## Project
- Customer: ${project.customer}
- Industry: ${project.industry ?? "(not specified)"}
- Primary region: ${project.primaryRegion} (ARM: ${armRegion})
- DR region: ${project.drRegion}
- Scope summary: ${project.scopeSummary ?? "(not specified)"}

## Tenant context (apply rate card, catalog, patterns, guardrails)
\`\`\`json
${JSON.stringify(tenantContext, null, 2)}
\`\`\`

## Workload inventory
Total: ${workloadSet.totals.count} workloads, ${workloadSet.totals.cpu} vCPU, ${workloadSet.totals.ramGb} GB RAM, ${workloadSet.totals.storageGb} GB storage. OS mix: ${JSON.stringify(workloadSet.totals.osMix)}.

\`\`\`json
${JSON.stringify(workloads, null, 2)}
\`\`\`

## Live Azure Retail prices (USD, region: ${armRegion})
PAYG hourly + computed monthly (730h). Use ONLY these prices; do not invent.
\`\`\`json
${JSON.stringify({ linux: linuxPrices, windows: windowsPrices }, null, 2)}
\`\`\`

## FX
- USD → MYR rate: ${fxRate} (source: tenant config or fallback)
- Show MYR equivalent in parentheses next to USD totals.
- Example: USD 1,234.56 (MYR ${usdTo(1234.56, "MYR", project.tenant.fxMyrPerUsd).toLocaleString()})

Generate the BOM now in Markdown following the standard structure. Apply learned patterns where applicable.
`;

  const stream = await anthropic.messages.stream({
    model: DEFAULT_MODEL,
    max_tokens: 8000,
    system: [
      {
        type: "text",
        text: GENERATE_BOM_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  let fullText = "";
  const encoder = new TextEncoder();
  const sse = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            fullText += event.delta.text;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: event.delta.text })}\n\n`));
          }
        }

        // Persist final version
        const last = await prisma.deliverable.findFirst({
          where: { projectId: project.id, type: "bom" },
          orderBy: { version: "desc" },
        });
        const version = (last?.version ?? 0) + 1;
        const saved = await prisma.deliverable.create({
          data: {
            projectId: project.id,
            type: "bom",
            version,
            status: "draft",
            contentMd: fullText,
            metadata: {
              region: armRegion,
              fxMyrPerUsd: fxRate,
              priceSnapshot: { linux: linuxPrices, windows: windowsPrices },
              workloadCount: workloadSet.totals.count,
              generatedAt: new Date().toISOString(),
            },
          },
        });

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, deliverableId: saved.id, version })}\n\n`));
        controller.close();
      } catch (err) {
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
