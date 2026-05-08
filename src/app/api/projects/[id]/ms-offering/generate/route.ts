import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { streamText } from "ai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gateway, DEFAULT_MODEL } from "@/lib/ai";
import { GENERATE_MS_OFFERING_SYSTEM } from "@/lib/prompts/generate-ms-offering";
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
  const cloudParam = url.searchParams.get("cloud") ?? "azure";
  const requestedMode = url.searchParams.get("mode"); // single | multi

  const { id } = await ctx.params;
  const project = await prisma.project.findFirst({
    where: { id, tenant: { users: { some: { id: session.user.id } } } },
    include: {
      tenant: { include: { rateCardItems: true, patterns: { where: { active: true, deliverableType: "ms_offering" } } } },
      deliverables: { orderBy: { version: "desc" } },
    },
  });
  if (!project) return new Response("not found", { status: 404 });
  if (!project.tenant) return new Response("tenant missing", { status: 400 });

  const targetClouds = ((project.targetClouds as string[]) ?? ["azure"]).filter((c) => c !== "gcp") as CloudType[];

  let cloudsInScope: CloudType[];
  let mode: "single" | "multi";
  if (cloudParam === "compare" || cloudParam === "multi") {
    cloudsInScope = targetClouds;
    mode = "multi";
    if (cloudsInScope.length < 2) {
      return new Response("multi mode needs at least 2 non-GCP target clouds", { status: 400 });
    }
  } else {
    if (!targetClouds.includes(cloudParam as CloudType)) {
      return new Response(`cloud "${cloudParam}" is not in this project's targetClouds`, { status: 400 });
    }
    cloudsInScope = [cloudParam as CloudType];
    mode = requestedMode === "multi" ? "multi" : "single";
  }

  // Need a BOM to know workload count for per-workload pricing
  const boms = project.deliverables.filter((d) => d.type === "bom");
  const archs = project.deliverables.filter((d) => d.type === "architecture");
  const plans = project.deliverables.filter((d) => d.type === "project_plan");

  const upstreamByCloud: Record<string, { bom: typeof project.deliverables[number] | null; arch: typeof project.deliverables[number] | null; plan: typeof project.deliverables[number] | null }> = {};
  for (const c of cloudsInScope) {
    upstreamByCloud[c] = {
      bom: pickLatest(boms, c) ?? null,
      arch: pickLatest(archs, c) ?? null,
      plan: pickLatest(plans, c) ?? null,
    };
  }

  if (!cloudsInScope.some((c) => upstreamByCloud[c].bom)) {
    return new Response(
      "no BOM yet — managed services pricing references the BOM's workload count for per-workload models. Generate a BOM first.",
      { status: 400 },
    );
  }

  const fxRate = fxRateOrFallback("MYR", project.tenant.fxMyrPerUsd);

  const cloudProviderForTemplates = mode === "multi" ? "multi" : cloudParam;
  const templates = await findMatchingTemplates({
    tenantId: project.tenantId,
    deliverableType: "ms_offering",
    cloud: cloudProviderForTemplates,
    projectType: project.projectType,
    maxCount: 2,
  });
  const templateSection = formatTemplatesAsPromptSection(templates);

  const tenantContext = {
    tenant: {
      name: project.tenant.name,
      country: project.tenant.country,
      currency: project.tenant.currency,
      fxMyrPerUsd: project.tenant.fxMyrPerUsd ?? null,
      identity: project.tenant.identity,
      commercial: project.tenant.commercial,
      compliance: project.tenant.compliance,
      guardrails: project.tenant.guardrails,
    },
    rateCard: project.tenant.rateCardItems.map((r) => ({
      role: r.role, level: r.level, dailyRate: r.dailyRate, currency: r.currency, location: r.location,
    })),
    learnedPatterns: project.tenant.patterns.map((p) => ({
      pattern: p.pattern, scope: p.scope, conditions: p.conditions, confidence: p.confidence,
    })),
  };

  const upstreamBlocks: string[] = [];
  for (const c of cloudsInScope) {
    const u = upstreamByCloud[c];
    const parts: string[] = [`### ${c.toUpperCase()} upstream`];
    if (u.bom) parts.push(`#### BOM v${u.bom.version}\n\`\`\`markdown\n${u.bom.contentMd.slice(0, 12_000)}\n\`\`\``);
    if (u.arch) parts.push(`#### Architecture v${u.arch.version}\n\`\`\`markdown\n${u.arch.contentMd.slice(0, 6_000)}\n\`\`\``);
    if (u.plan) parts.push(`#### Project Plan v${u.plan.version}\n\`\`\`markdown\n${u.plan.contentMd.slice(0, 4_000)}\n\`\`\``);
    upstreamBlocks.push(parts.join("\n\n"));
  }

  const userMessage = `# Generate Managed Services Offering for project: ${project.name}

mode: ${mode}
clouds: [${cloudsInScope.join(", ")}]
${templateSection ? `\n${templateSection}` : ""}
## Project
- Customer: ${project.customer}
- Industry: ${project.industry ?? "(not specified)"}
- Customer segment: ${project.customerSegment ?? "(not specified)"}
- Project type: ${project.projectType ?? "unknown"}
- Scope summary: ${project.scopeSummary ?? "(not specified)"}

## Tenant context (apply rate card for per-workload pricing derivation, partner tier, identity for "service provider")
\`\`\`json
${JSON.stringify(tenantContext, null, 2)}
\`\`\`

## FX rate
USD → MYR: ${fxRate}

## Source deliverables (workload counts, target architecture, handover schedule)
${upstreamBlocks.join("\n\n---\n\n")}

Generate the Managed Services Offering now in Markdown following the **${mode}** mode structure. Pull workload counts from BOM, derive per-workload pricing from rate card if no template specifies, recommend ONE tier with rationale, present alternative pricing model where it adds value. Apply learned patterns where applicable.
`;

  const result = streamText({
    model: gateway(DEFAULT_MODEL),
    messages: [
      {
        role: "system",
        content: GENERATE_MS_OFFERING_SYSTEM,
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

        const cloudProvider = mode === "multi" ? "multi" : cloudParam;
        const last = await prisma.deliverable.findFirst({
          where: { projectId: project.id, type: "ms_offering", cloudProvider },
          orderBy: { version: "desc" },
        });
        const version = (last?.version ?? 0) + 1;
        const saved = await prisma.deliverable.create({
          data: {
            projectId: project.id,
            type: "ms_offering",
            cloudProvider,
            version,
            status: "draft",
            contentMd: fullText,
            metadata: {
              mode,
              clouds: cloudsInScope,
              fxMyrPerUsd: fxRate,
              sourceBomIds: cloudsInScope.map((c) => upstreamByCloud[c].bom?.id).filter(Boolean),
              sourceArchIds: cloudsInScope.map((c) => upstreamByCloud[c].arch?.id).filter(Boolean),
              sourcePlanIds: cloudsInScope.map((c) => upstreamByCloud[c].plan?.id).filter(Boolean),
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
          purpose: "generate-ms-offering",
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
          purpose: "generate-ms-offering",
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
