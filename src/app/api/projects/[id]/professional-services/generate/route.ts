import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { streamText } from "ai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gateway, DEFAULT_MODEL } from "@/lib/ai";
import { GENERATE_PROFESSIONAL_SERVICES_SYSTEM } from "@/lib/prompts/generate-professional-services";
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

  const { id } = await ctx.params;
  const project = await prisma.project.findFirst({
    where: { id, tenant: { users: { some: { id: session.user.id } } } },
    include: {
      tenant: {
        include: {
          rateCardItems: true,
          catalogItems: true,
          patterns: { where: { active: true, deliverableType: "professional_services" } },
        },
      },
      deliverables: { orderBy: { version: "desc" } },
    },
  });
  if (!project) return new Response("not found", { status: 404 });
  if (!project.tenant) return new Response("tenant missing", { status: 400 });

  const targetClouds = ((project.targetClouds as string[]) ?? ["azure"]).filter((c) => c !== "gcp") as CloudType[];

  if (cloudParam !== "compare" && !targetClouds.includes(cloudParam as CloudType)) {
    return new Response(`cloud "${cloudParam}" is not in this project's targetClouds`, { status: 400 });
  }
  const cloudsInScope: CloudType[] = cloudParam === "compare" ? targetClouds : [cloudParam as CloudType];

  // Upstream context: BOM (workload count), Assessment (wave plan), Architecture (component count).
  const boms = project.deliverables.filter((d) => d.type === "bom");
  const archs = project.deliverables.filter((d) => d.type === "architecture");
  const assess = project.deliverables.filter((d) => d.type === "assessment");
  const plans = project.deliverables.filter((d) => d.type === "project_plan");

  const upstreamByCloud: Record<string, {
    bom: typeof project.deliverables[number] | null;
    arch: typeof project.deliverables[number] | null;
    assess: typeof project.deliverables[number] | null;
    plan: typeof project.deliverables[number] | null;
  }> = {};
  for (const c of cloudsInScope) {
    upstreamByCloud[c] = {
      bom: pickLatest(boms, c) ?? null,
      arch: pickLatest(archs, c) ?? null,
      assess: pickLatest(assess, c) ?? null,
      plan: pickLatest(plans, c) ?? null,
    };
  }

  const fxRate = fxRateOrFallback("MYR", project.tenant.fxMyrPerUsd);

  const cloudProviderForTemplates = cloudParam === "compare" ? "compare" : cloudParam;
  const templates = await findMatchingTemplates({
    tenantId: project.tenantId,
    deliverableType: "professional_services",
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
      standards: project.tenant.standards,
      compliance: project.tenant.compliance,
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

  const upstreamBlocks: string[] = [];
  for (const c of cloudsInScope) {
    const u = upstreamByCloud[c];
    const parts: string[] = [`### ${c.toUpperCase()} upstream`];
    if (u.assess) parts.push(`#### Assessment v${u.assess.version}\n\`\`\`markdown\n${u.assess.contentMd.slice(0, 8_000)}\n\`\`\``);
    if (u.arch) parts.push(`#### Architecture v${u.arch.version}\n\`\`\`markdown\n${u.arch.contentMd.slice(0, 8_000)}\n\`\`\``);
    if (u.bom) parts.push(`#### BOM v${u.bom.version}\n\`\`\`markdown\n${u.bom.contentMd.slice(0, 10_000)}\n\`\`\``);
    if (u.plan) parts.push(`#### Project Plan v${u.plan.version}\n\`\`\`markdown\n${u.plan.contentMd.slice(0, 6_000)}\n\`\`\``);
    upstreamBlocks.push(parts.join("\n\n"));
  }

  const userMessage = `# Generate Professional Services costing for project: ${project.name}

clouds: [${cloudsInScope.join(", ")}]
${templateSection ? `\n${templateSection}` : ""}
## Project
- Customer: ${project.customer}
- Industry: ${project.industry ?? "(not specified)"}
- Customer segment: ${project.customerSegment ?? "(not specified)"}
- Project type: ${project.projectType ?? "unknown"}
- Scope summary: ${project.scopeSummary ?? "(not specified)"}

## Tenant context (rate card + service catalog drive mandays × daily rate × margin)
\`\`\`json
${JSON.stringify(tenantContext, null, 2)}
\`\`\`

## FX rate
USD → MYR: ${fxRate}

## Upstream deliverables (size effort against these — do NOT invent workload counts)
${upstreamBlocks.length > 0 ? upstreamBlocks.join("\n\n---\n\n") : "_None yet — size from project scope + customer segment alone, and flag every assumption in Section 6._"}

Generate the Professional Services costing now in Markdown following the required structure. Pull rates from the rate card; pull default effort days from the service catalog. Apply tenant margin. Flag any defaulted lines explicitly. Apply learned patterns where applicable.
`;

  const result = streamText({
    model: gateway(DEFAULT_MODEL),
    messages: [
      {
        role: "system",
        content: GENERATE_PROFESSIONAL_SERVICES_SYSTEM,
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
          where: { projectId: project.id, type: "professional_services", cloudProvider },
          orderBy: { version: "desc" },
        });
        const version = (last?.version ?? 0) + 1;
        const saved = await prisma.deliverable.create({
          data: {
            projectId: project.id,
            type: "professional_services",
            cloudProvider,
            version,
            status: "draft",
            contentMd: fullText,
            metadata: {
              clouds: cloudsInScope,
              fxMyrPerUsd: fxRate,
              sourceBomIds: cloudsInScope.map((c) => upstreamByCloud[c].bom?.id).filter(Boolean),
              sourceArchIds: cloudsInScope.map((c) => upstreamByCloud[c].arch?.id).filter(Boolean),
              sourceAssessmentIds: cloudsInScope.map((c) => upstreamByCloud[c].assess?.id).filter(Boolean),
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
          purpose: "generate-professional-services",
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
          purpose: "generate-professional-services",
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
