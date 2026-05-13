import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { streamText } from "ai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isApplicable, isAcknowledged, compliancePostureMarkdown } from "@/lib/compliance/bnm-rmit";
import { gateway, DEFAULT_MODEL } from "@/lib/ai";
import { GENERATE_SOW_SYSTEM } from "@/lib/prompts/generate-sow";
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
  const cloudParam = url.searchParams.get("cloud") ?? "azure"; // azure | aws — never "compare" for SOW
  const requestedMode = url.searchParams.get("mode"); // single | hybrid

  const { id } = await ctx.params;
  const project = await prisma.engagement.findFirst({
    where: { id, tenant: { users: { some: { id: session.user.id } } } },
    include: {
      tenant: { include: { patterns: { where: { active: true, deliverableType: "sow" } } } },
      deliverables: { orderBy: { version: "desc" } },
      inputs: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!project) return new Response("not found", { status: 404 });
  if (!project.tenant) return new Response("tenant missing", { status: 400 });

  if (isApplicable(project) && !isAcknowledged(project)) {
    return new Response(
      `BNM RMiT applies to this BFSI / Malaysia project but the compliance check hasn't been acknowledged. Open /projects/${id}/compliance to complete it.`,
      { status: 412 },
    );
  }

  if (cloudParam === "compare") {
    return new Response(
      "compare mode is pre-decision. The customer must commit to a target cloud before a SOW is drafted — generate the SOW for the chosen cloud (e.g. ?cloud=azure or ?cloud=aws).",
      { status: 400 },
    );
  }

  const targetClouds = ((project.targetClouds as string[]) ?? ["azure"]).filter((c) => c !== "gcp") as CloudType[];
  if (!targetClouds.includes(cloudParam as CloudType)) {
    return new Response(`cloud "${cloudParam}" is not in this project's targetClouds`, { status: 400 });
  }

  const mode: "single" | "hybrid" = requestedMode === "hybrid" ? "hybrid" : "single";
  const cloudsInScope: CloudType[] = mode === "hybrid" ? targetClouds : [cloudParam as CloudType];

  // SOW requires at LEAST a BOM (commercials) — refuse otherwise.
  const boms = project.deliverables.filter((d) => d.type === "bom");
  const archs = project.deliverables.filter((d) => d.type === "architecture");
  const proposals = project.deliverables.filter((d) => d.type === "proposal");
  const plans = project.deliverables.filter((d) => d.type === "project_plan");
  const assess = project.deliverables.filter((d) => d.type === "assessment");

  const upstreamByCloud: Record<string, {
    bom: typeof project.deliverables[number] | null;
    arch: typeof project.deliverables[number] | null;
    proposal: typeof project.deliverables[number] | null;
    plan: typeof project.deliverables[number] | null;
    assess: typeof project.deliverables[number] | null;
  }> = {};
  for (const c of cloudsInScope) {
    upstreamByCloud[c] = {
      bom: pickLatest(boms, c) ?? null,
      arch: pickLatest(archs, c) ?? null,
      proposal: pickLatest(proposals, c) ?? pickLatest(proposals, "multi") ?? null,
      plan: pickLatest(plans, c) ?? null,
      assess: pickLatest(assess, c) ?? null,
    };
  }

  const haveBom = cloudsInScope.some((c) => upstreamByCloud[c].bom);
  if (!haveBom) {
    return new Response(
      "no BOM yet — SOW commits to specific commercial terms which must come from the BOM",
      { status: 400 },
    );
  }

  const fxRate = fxRateOrFallback("MYR", project.tenant.fxMyrPerUsd);

  const cloudProviderForTemplates = cloudParam;
  const templates = await findMatchingTemplates({
    tenantId: project.tenantId,
    deliverableType: "sow",
    cloud: cloudProviderForTemplates,
    engagementType: project.engagementType,
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
    learnedPatterns: project.tenant.patterns.map((p) => ({
      pattern: p.pattern, scope: p.scope, conditions: p.conditions, confidence: p.confidence,
    })),
  };

  const upstreamBlocks: string[] = [];
  for (const c of cloudsInScope) {
    const u = upstreamByCloud[c];
    const parts: string[] = [`### ${c.toUpperCase()} upstream deliverables`];
    if (u.proposal) parts.push(`#### Proposal v${u.proposal.version}\n\`\`\`markdown\n${u.proposal.contentMd.slice(0, 8_000)}\n\`\`\``);
    if (u.bom) parts.push(`#### BOM v${u.bom.version}\n\`\`\`markdown\n${u.bom.contentMd.slice(0, 12_000)}\n\`\`\``);
    if (u.arch) parts.push(`#### Architecture v${u.arch.version}\n\`\`\`markdown\n${u.arch.contentMd.slice(0, 6_000)}\n\`\`\``);
    if (u.plan) parts.push(`#### Project Plan v${u.plan.version}\n\`\`\`markdown\n${u.plan.contentMd.slice(0, 8_000)}\n\`\`\``);
    if (u.assess) parts.push(`#### Assessment v${u.assess.version}\n\`\`\`markdown\n${u.assess.contentMd.slice(0, 4_000)}\n\`\`\``);
    upstreamBlocks.push(parts.join("\n\n"));
  }

  const userMessage = `# Generate Statement of Work for project: ${project.name}

mode: ${mode}
clouds: [${cloudsInScope.join(", ")}]
${templateSection ? `\n${templateSection}` : ""}
## Project
- Customer: ${project.customer}
- Industry: ${project.industry ?? "(not specified)"}
- Customer segment: ${project.customerSegment ?? "(not specified)"}
- Project type: ${project.engagementType ?? "unknown"}
- Scope summary: ${project.scopeSummary ?? "(not specified)"}

## Tenant context (apply identity for "service provider" parties block, governing law, payment terms, partner tier)
\`\`\`json
${JSON.stringify(tenantContext, null, 2)}
\`\`\`

## FX rate
USD → MYR: ${fxRate} (source: tenant config or fallback)

## Source deliverables (single source of truth for scope, schedule, commercials)
${upstreamBlocks.join("\n\n---\n\n")}

Generate the SOW now in Markdown following the **${mode}** mode structure. Pull TCV, mandays, and milestones from the BOM/Project Plan exactly. Mark TBDs explicitly where signature-time inputs are needed. Apply learned patterns where applicable.
`;

  const result = streamText({
    model: gateway(DEFAULT_MODEL),
    messages: [
      {
        role: "system",
        content: GENERATE_SOW_SYSTEM,
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

        const cloudProvider = cloudParam;
        const last = await prisma.deliverable.findFirst({
          where: { engagementId: project.id, type: "sow", cloudProvider },
          orderBy: { version: "desc" },
        });
        const version = (last?.version ?? 0) + 1;
        const saved = await prisma.deliverable.create({
          data: {
            engagementId: project.id,
            type: "sow",
            cloudProvider,
            version,
            status: "draft",
            contentMd: fullText + (compliancePostureMarkdown(project) ? `\n\n---\n\n${compliancePostureMarkdown(project)}` : ""),
            metadata: {
              mode,
              clouds: cloudsInScope,
              fxMyrPerUsd: fxRate,
              sourceProposalIds: cloudsInScope.map((c) => upstreamByCloud[c].proposal?.id).filter(Boolean),
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
          engagementId: project.id,
          deliverableId: saved.id,
          purpose: "generate-sow",
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
          purpose: "generate-sow",
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
