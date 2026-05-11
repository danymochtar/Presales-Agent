import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { streamText } from "ai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gateway, DEFAULT_MODEL } from "@/lib/ai";
import { GENERATE_PROPOSAL_SYSTEM } from "@/lib/prompts/generate-proposal";
import type { CloudType } from "@/lib/pricing";
import { logLlmCall } from "@/lib/ai-logging";
import { findMatchingTemplates, formatTemplatesAsPromptSection } from "@/lib/templates";
import { eligiblePrograms, type ProgramMatch } from "@/lib/funding/eligibility";

export const runtime = "nodejs";
export const maxDuration = 60;

// Pick the latest deliverable matching type+cloudProvider. Treats null
// cloudProvider as "azure" for back-compat with pre-MVP-2 deliverables.
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
  const requestedMode = url.searchParams.get("mode"); // single | compare | hybrid

  const { id } = await ctx.params;
  const project = await prisma.project.findFirst({
    where: { id, tenant: { users: { some: { id: session.user.id } } } },
    include: {
      tenant: { include: { patterns: { where: { active: true, deliverableType: "proposal" } } } },
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

  // Gather upstream deliverables per cloud in scope (BOM is mandatory; arch
  // and assessment are optional — proposal degrades gracefully but warns).
  const boms = project.deliverables.filter((d) => d.type === "bom");
  const archs = project.deliverables.filter((d) => d.type === "architecture");
  const assess = project.deliverables.filter((d) => d.type === "assessment");

  const upstreamByCloud: Record<string, { bom: typeof project.deliverables[number] | null; arch: typeof project.deliverables[number] | null; assess: typeof project.deliverables[number] | null }> = {};
  for (const c of cloudsInScope) {
    upstreamByCloud[c] = {
      bom: pickLatest(boms, c) ?? null,
      arch: pickLatest(archs, c) ?? null,
      assess: pickLatest(assess, c) ?? null,
    };
  }

  // For compare mode, also accept a "compare" BOM if generated (which already
  // has side-by-side cost summary across clouds).
  const compareBom = pickLatest(boms, "compare") ?? null;

  // Validate: at least one BOM somewhere in scope, otherwise we can't talk pricing.
  const haveAnyBom = cloudsInScope.some((c) => upstreamByCloud[c].bom) || !!compareBom;
  if (!haveAnyBom) {
    return new Response(
      "no BOM yet — generate a BOM first; the proposal references it for all pricing",
      { status: 400 },
    );
  }

  let mode: "single" | "compare" | "hybrid";
  if (requestedMode === "single" || requestedMode === "compare" || requestedMode === "hybrid") {
    mode = requestedMode;
  } else {
    mode = cloudsInScope.length === 1 ? "single" : "compare";
  }

  // Build context blocks per cloud
  const upstreamBlocks: string[] = [];
  for (const c of cloudsInScope) {
    const u = upstreamByCloud[c];
    const parts: string[] = [`### ${c.toUpperCase()} upstream deliverables`];
    if (u.bom) {
      parts.push(`#### BOM v${u.bom.version} (cloud=${u.bom.cloudProvider ?? "azure"})\n\`\`\`markdown\n${u.bom.contentMd.slice(0, 16_000)}\n\`\`\``);
    } else {
      parts.push(`_No BOM for ${c} yet — pricing will reference whichever BOM exists; flag the gap in Assumptions._`);
    }
    if (u.arch) {
      parts.push(`#### Architecture v${u.arch.version} (cloud=${u.arch.cloudProvider ?? "azure"})\n\`\`\`markdown\n${u.arch.contentMd.slice(0, 8_000)}\n\`\`\``);
    } else {
      parts.push(`_No architecture for ${c} yet — keep solution overview at conceptual level._`);
    }
    if (u.assess) {
      parts.push(`#### Assessment v${u.assess.version} (cloud=${u.assess.cloudProvider ?? "azure"})\n\`\`\`markdown\n${u.assess.contentMd.slice(0, 6_000)}\n\`\`\``);
    } else {
      parts.push(`_No assessment for ${c} yet — proposal will summarize approach at high level._`);
    }
    upstreamBlocks.push(parts.join("\n\n"));
  }
  if (compareBom && mode === "compare") {
    upstreamBlocks.push(`### Compare BOM v${compareBom.version} (side-by-side across clouds)\n\`\`\`markdown\n${compareBom.contentMd.slice(0, 16_000)}\n\`\`\``);
  }

  // Customer context docs (RFP, notes, requirements)
  const contextDocs = project.inputs
    .filter((i) => i.textContent && i.textContent.trim().length > 0)
    .map((i) => ({ kind: i.kind, filename: i.filename ?? "(unnamed)", text: i.textContent!.slice(0, 6000) }));

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
    learnedPatterns: project.tenant.patterns.map((p) => ({
      pattern: p.pattern, scope: p.scope, conditions: p.conditions, confidence: p.confidence,
    })),
  };

  const cloudProviderForTemplates = cloudParam === "compare" ? "compare" : cloudParam;
  const templates = await findMatchingTemplates({
    tenantId: project.tenantId,
    deliverableType: "proposal",
    cloud: cloudProviderForTemplates,
    projectType: project.projectType,
    maxCount: 2,
  });
  const templateSection = formatTemplatesAsPromptSection(templates);

  // Estimate year-1 ACR per cloud from each cloud's latest BOM metadata.
  // Falls back to 0 when no BOM exists yet.
  const acrByCloud: Partial<Record<CloudType, number>> = {};
  for (const c of cloudsInScope) {
    const bom = upstreamByCloud[c]?.bom;
    if (!bom) continue;
    const meta = (bom.metadata ?? {}) as { monthlyComputeBaselineUsdByCloud?: Record<string, number> };
    const monthly = meta.monthlyComputeBaselineUsdByCloud?.[c] ?? 0;
    acrByCloud[c] = Math.round(monthly * 12);
  }
  const projectMeta = `${project.scopeSummary ?? ""} ${(project.suggestedDeliverables ?? []).join(" ")}`.toLowerCase();
  const fundingMatches: ProgramMatch[] = eligiblePrograms({
    acrByCloud,
    market: project.tenant.country?.toLowerCase().includes("malaysia") ? "B" : "A",
    hasModernWorkloads: {
      newDatabase: /database\s*migration|new\s*db|cosmos|postgres|sql\s*db/.test(projectMeta),
      fabric:      /microsoft\s*fabric|onelake/.test(projectMeta),
      aiFoundry:   /ai\s*foundry|gen\s*ai|llm/.test(projectMeta),
      sap:         /sap\s*(s\/4|hana|ecc)/.test(projectMeta),
      oracle:      /oracle\s*(db|exadata|rac)/.test(projectMeta),
      vmware:      /vmware|vsphere|avs/.test(projectMeta),
      dataAnalytics: /analytics|data\s*warehouse|bigquery|snowflake/.test(projectMeta),
    },
  });

  const userMessage = `# Generate proposal for project: ${project.name}

mode: ${mode}
clouds: [${cloudsInScope.join(", ")}]
primaryCloud: ${project.primaryCloud ?? "(not yet decided)"}
${templateSection ? `\n${templateSection}` : ""}

## Project
- Customer: ${project.customer}
- Industry: ${project.industry ?? "(not specified)"}
- Customer segment: ${project.customerSegment ?? "(not specified)"}
- Scope summary: ${project.scopeSummary ?? "(not specified)"}

## Tenant context (apply identity, voice, partner tier, compliance, learned patterns)
\`\`\`json
${JSON.stringify(tenantContext, null, 2)}
\`\`\`

## Upstream deliverables per cloud (single source of pricing + technical truth)

${upstreamBlocks.join("\n\n---\n\n")}

${contextDocs.length > 0 ? `## Customer context from uploaded documents
${contextDocs.map((d) => `### ${d.filename} (${d.kind})\n${d.text}`).join("\n\n---\n\n")}
` : ""}

## Funding capture — eligible programs (deterministic match)
Year-1 ACR estimate per cloud (USD): ${JSON.stringify(acrByCloud)}
${fundingMatches.length === 0
  ? "_No funded program matches at current ACR estimates. Recommend re-checking once BOM totals are firmed up._"
  : `Eligible programs (sorted by estimated payout):
\`\`\`json
${JSON.stringify(fundingMatches, null, 2)}
\`\`\`
Render the **Funding capture** proposal section directly from this JSON — do NOT invent additional programs or change payout numbers. State each program's headline, the recommended deliverables / phases the customer can co-fund, and the specific caveats.`}

Generate the proposal now in Markdown following the **${mode}** mode structure. Reference upstream deliverables explicitly (e.g. "as detailed in BOM v3"). Apply learned patterns where applicable.
`;

  const result = streamText({
    model: gateway(DEFAULT_MODEL),
    messages: [
      {
        role: "system",
        content: GENERATE_PROPOSAL_SYSTEM,
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
          where: { projectId: project.id, type: "proposal", cloudProvider },
          orderBy: { version: "desc" },
        });
        const version = (last?.version ?? 0) + 1;
        const saved = await prisma.deliverable.create({
          data: {
            projectId: project.id,
            type: "proposal",
            cloudProvider,
            version,
            status: "draft",
            contentMd: fullText,
            metadata: {
              mode,
              clouds: cloudsInScope,
              sourceBomIds: cloudsInScope.map((c) => upstreamByCloud[c].bom?.id).filter(Boolean),
              sourceArchIds: cloudsInScope.map((c) => upstreamByCloud[c].arch?.id).filter(Boolean),
              sourceAssessmentIds: cloudsInScope.map((c) => upstreamByCloud[c].assess?.id).filter(Boolean),
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
          purpose: "generate-proposal",
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
          purpose: "generate-proposal",
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
