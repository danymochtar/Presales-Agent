import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { streamText } from "ai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gateway, DEFAULT_MODEL } from "@/lib/ai";
import { GENERATE_TCO_SYSTEM } from "@/lib/prompts/generate-tco";
import { fxRateOrFallback } from "@/lib/pricing/fx";
import type { CloudType } from "@/lib/pricing";
import { logLlmCall } from "@/lib/ai-logging";
import { findMatchingTemplates, formatTemplatesAsPromptSection } from "@/lib/templates";

export const runtime = "nodejs";
export const maxDuration = 60;

function pickLatest<T extends { cloudProvider: string | null; version: number }>(
  list: T[],
  cloud: string,
): T | undefined {
  return list
    .filter((d) => (cloud === "azure" ? d.cloudProvider === "azure" || d.cloudProvider === null : d.cloudProvider === cloud))
    .sort((a, b) => b.version - a.version)[0];
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("unauthorized", { status: 401 });

  const url = new URL(req.url);
  const cloudParam = url.searchParams.get("cloud") ?? "azure"; // azure | aws | compare
  const requestedMode = url.searchParams.get("mode"); // single | compare
  const horizonYears = Math.max(3, Math.min(5, Number(url.searchParams.get("years") ?? "5")));
  const growthPct = Math.max(0, Math.min(50, Number(url.searchParams.get("growth") ?? "5")));

  const { id } = await ctx.params;
  const project = await prisma.project.findFirst({
    where: { id, tenant: { users: { some: { id: session.user.id } } } },
    include: {
      tenant: { include: { patterns: { where: { active: true, deliverableType: "tco" } } } },
      deliverables: { orderBy: { version: "desc" } },
      inputs: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!project) return new Response("not found", { status: 404 });
  if (!project.tenant) return new Response("tenant missing", { status: 400 });

  const targetClouds = ((project.targetClouds as string[]) ?? ["azure"]).filter((c) => c !== "gcp") as CloudType[];

  let cloudsInScope: CloudType[];
  if (cloudParam === "compare") {
    cloudsInScope = targetClouds;
    if (cloudsInScope.length < 2) {
      return new Response("compare mode needs at least 2 non-GCP target clouds", { status: 400 });
    }
  } else {
    if (!targetClouds.includes(cloudParam as CloudType)) {
      return new Response(`cloud "${cloudParam}" is not in this project's targetClouds`, { status: 400 });
    }
    cloudsInScope = [cloudParam as CloudType];
  }

  let mode: "single" | "compare";
  if (requestedMode === "single" || requestedMode === "compare") {
    mode = requestedMode;
  } else {
    mode = cloudsInScope.length === 1 ? "single" : "compare";
  }

  // Gather BOMs per cloud — TCO sits on top of BOM.
  const boms = project.deliverables.filter((d) => d.type === "bom");
  const bomByCloud: Record<string, typeof project.deliverables[number] | null> = {};
  for (const c of cloudsInScope) {
    bomByCloud[c] = pickLatest(boms, c) ?? null;
  }
  const compareBom = pickLatest(boms, "compare") ?? null;

  const haveAnyBom = cloudsInScope.some((c) => bomByCloud[c]) || !!compareBom;
  if (!haveAnyBom) {
    return new Response(
      "no BOM yet — generate a BOM first; the TCO projects multi-year cost from the BOM's year-1 totals",
      { status: 400 },
    );
  }

  // Customer context (RFP/notes/requirements may reveal current on-prem spend, growth plans, RI appetite)
  const contextDocs = project.inputs
    .filter((i) => i.textContent && i.textContent.trim().length > 0)
    .map((i) => ({ kind: i.kind, filename: i.filename ?? "(unnamed)", text: i.textContent!.slice(0, 6000) }));

  const fxRate = fxRateOrFallback("MYR", project.tenant.fxMyrPerUsd);

  const tenantContext = {
    tenant: {
      name: project.tenant.name,
      country: project.tenant.country,
      currency: project.tenant.currency,
      fxMyrPerUsd: project.tenant.fxMyrPerUsd ?? null,
      commercial: project.tenant.commercial,
      standards: project.tenant.standards,
      compliance: project.tenant.compliance,
      guardrails: project.tenant.guardrails,
    },
    learnedPatterns: project.tenant.patterns.map((p) => ({
      pattern: p.pattern, scope: p.scope, conditions: p.conditions, confidence: p.confidence,
    })),
  };

  const bomBlocks: string[] = [];
  for (const c of cloudsInScope) {
    const b = bomByCloud[c];
    if (b) {
      bomBlocks.push(`### ${c.toUpperCase()} BOM v${b.version}\n\`\`\`markdown\n${b.contentMd.slice(0, 18_000)}\n\`\`\``);
    } else {
      bomBlocks.push(`### ${c.toUpperCase()}\n_No BOM for ${c} yet — TCO will note this gap and project from any other available BOM._`);
    }
  }
  if (compareBom && mode === "compare") {
    bomBlocks.push(`### Compare BOM v${compareBom.version} (side-by-side)\n\`\`\`markdown\n${compareBom.contentMd.slice(0, 18_000)}\n\`\`\``);
  }

  const cloudProviderForTemplates = cloudParam === "compare" ? "compare" : cloudParam;
  const templates = await findMatchingTemplates({
    tenantId: project.tenantId,
    deliverableType: "tco",
    cloud: cloudProviderForTemplates,
    projectType: project.projectType,
    maxCount: 2,
  });
  const templateSection = formatTemplatesAsPromptSection(templates);

  const userMessage = `# Generate TCO for project: ${project.name}

mode: ${mode}
clouds: [${cloudsInScope.join(", ")}]
horizon: ${horizonYears} years
default growth assumption: ${growthPct}% YoY (override if context docs state otherwise)
${templateSection ? `\n${templateSection}` : ""}
## Project
- Customer: ${project.customer}
- Industry: ${project.industry ?? "(not specified)"}
- Customer segment: ${project.customerSegment ?? "(not specified)"}
- Scope summary: ${project.scopeSummary ?? "(not specified)"}

## Tenant context
\`\`\`json
${JSON.stringify(tenantContext, null, 2)}
\`\`\`

## FX rate
USD → MYR: ${fxRate} (source: tenant config or fallback)

## Source BOMs (single source of year-1 pricing)
${bomBlocks.join("\n\n---\n\n")}

${contextDocs.length > 0 ? `## Customer context (look for: current on-prem spend, growth plans, RI appetite, FX hedging policy)
${contextDocs.map((d) => `### ${d.filename} (${d.kind})\n${d.text}`).join("\n\n---\n\n")}
` : ""}
Generate the TCO document now in Markdown following the **${mode}** mode structure. Project ${horizonYears} years out. Use ${growthPct}% YoY workload growth as the baseline assumption (state this and run sensitivity at 0% / 5% / 10% / 20%). Apply learned patterns where applicable.
`;

  const result = streamText({
    model: gateway(DEFAULT_MODEL),
    messages: [
      {
        role: "system",
        content: GENERATE_TCO_SYSTEM,
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

        const cloudProvider = cloudParam === "compare" ? "compare" : cloudParam;
        const last = await prisma.deliverable.findFirst({
          where: { projectId: project.id, type: "tco", cloudProvider },
          orderBy: { version: "desc" },
        });
        const version = (last?.version ?? 0) + 1;
        const saved = await prisma.deliverable.create({
          data: {
            projectId: project.id,
            type: "tco",
            cloudProvider,
            version,
            status: "draft",
            contentMd: fullText,
            metadata: {
              mode,
              clouds: cloudsInScope,
              horizonYears,
              growthPct,
              fxMyrPerUsd: fxRate,
              sourceBomIds: cloudsInScope.map((c) => bomByCloud[c]?.id).filter(Boolean),
              compareBomId: compareBom?.id ?? null,
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
          purpose: "generate-tco",
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
          purpose: "generate-tco",
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
