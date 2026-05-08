import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { streamText } from "ai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gateway, DEFAULT_MODEL } from "@/lib/ai";
import { GENERATE_PROJECT_PLAN_SYSTEM } from "@/lib/prompts/generate-project-plan";
import type { CloudType } from "@/lib/pricing";

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
  const requestedMode = url.searchParams.get("mode");

  const { id } = await ctx.params;
  const project = await prisma.project.findFirst({
    where: { id, tenant: { users: { some: { id: session.user.id } } } },
    include: {
      tenant: { include: { patterns: { where: { active: true, deliverableType: "project_plan" } } } },
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

  let mode: "single" | "compare" | "hybrid";
  if (requestedMode === "single" || requestedMode === "compare" || requestedMode === "hybrid") {
    mode = requestedMode;
  } else {
    mode = cloudsInScope.length === 1 ? "single" : "compare";
  }

  // Compose from upstream deliverables — Assessment for waves, Architecture
  // for target state, BOM for service mandays.
  const boms = project.deliverables.filter((d) => d.type === "bom");
  const archs = project.deliverables.filter((d) => d.type === "architecture");
  const assessments = project.deliverables.filter((d) => d.type === "assessment");

  const upstreamByCloud: Record<string, { bom: typeof project.deliverables[number] | null; arch: typeof project.deliverables[number] | null; assess: typeof project.deliverables[number] | null }> = {};
  for (const c of cloudsInScope) {
    upstreamByCloud[c] = {
      bom: pickLatest(boms, c) ?? null,
      arch: pickLatest(archs, c) ?? null,
      assess: pickLatest(assessments, c) ?? null,
    };
  }

  const contextDocs = project.inputs
    .filter((i) => i.textContent && i.textContent.trim().length > 0)
    .map((i) => ({ kind: i.kind, filename: i.filename ?? "(unnamed)", text: i.textContent!.slice(0, 6000) }));

  const tenantContext = {
    tenant: {
      name: project.tenant.name,
      country: project.tenant.country,
      currency: project.tenant.currency,
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

  const upstreamBlocks: string[] = [];
  for (const c of cloudsInScope) {
    const u = upstreamByCloud[c];
    const parts: string[] = [`### ${c.toUpperCase()} upstream deliverables`];
    if (u.assess) {
      parts.push(`#### Assessment v${u.assess.version}\n\`\`\`markdown\n${u.assess.contentMd.slice(0, 10_000)}\n\`\`\``);
    } else {
      parts.push(`_No assessment for ${c} yet — wave plan will be drafted from inventory + scope; tag as "pending assessment finalization"._`);
    }
    if (u.arch) {
      parts.push(`#### Architecture v${u.arch.version}\n\`\`\`markdown\n${u.arch.contentMd.slice(0, 8_000)}\n\`\`\``);
    } else {
      parts.push(`_No architecture for ${c} yet — phases will reference target state at conceptual level only._`);
    }
    if (u.bom) {
      parts.push(`#### BOM v${u.bom.version}\n\`\`\`markdown\n${u.bom.contentMd.slice(0, 10_000)}\n\`\`\``);
    } else {
      parts.push(`_No BOM for ${c} yet — mandays per role will be estimated from service catalog defaults; reconcile with BOM once generated._`);
    }
    upstreamBlocks.push(parts.join("\n\n"));
  }

  const userMessage = `# Generate Project Deployment Plan for project: ${project.name}

mode: ${mode}
clouds: [${cloudsInScope.join(", ")}]
primaryCloud: ${project.primaryCloud ?? "(not yet decided)"}

## Project
- Customer: ${project.customer}
- Industry: ${project.industry ?? "(not specified)"}
- Customer segment: ${project.customerSegment ?? "(not specified)"}
- Scope summary: ${project.scopeSummary ?? "(not specified)"}

## Tenant context
\`\`\`json
${JSON.stringify(tenantContext, null, 2)}
\`\`\`

## Upstream deliverables (compose from these)
${upstreamBlocks.join("\n\n---\n\n")}

${contextDocs.length > 0 ? `## Customer context (look for: timeline constraints, freeze windows, team availability, regulatory notification cadence)
${contextDocs.map((d) => `### ${d.filename} (${d.kind})\n${d.text}`).join("\n\n---\n\n")}
` : ""}
Generate the deployment plan now in Markdown following the **${mode}** mode structure. Include the Mermaid Gantt diagram in Section 5. Apply learned patterns where applicable. Where upstream deliverables are missing, produce a sensible template and tag the gaps explicitly.
`;

  const result = streamText({
    model: gateway(DEFAULT_MODEL),
    messages: [
      {
        role: "system",
        content: GENERATE_PROJECT_PLAN_SYSTEM,
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      },
      { role: "user", content: userMessage },
    ],
    maxOutputTokens: 8000,
  });

  let fullText = "";
  const encoder = new TextEncoder();
  const sse = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of result.textStream) {
          fullText += chunk;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: chunk })}\n\n`));
        }

        const cloudProvider = cloudParam === "compare" ? "compare" : cloudParam;
        const last = await prisma.deliverable.findFirst({
          where: { projectId: project.id, type: "project_plan", cloudProvider },
          orderBy: { version: "desc" },
        });
        const version = (last?.version ?? 0) + 1;
        const saved = await prisma.deliverable.create({
          data: {
            projectId: project.id,
            type: "project_plan",
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
              generatedAt: new Date().toISOString(),
              model: DEFAULT_MODEL,
            } as object,
          },
        });

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, deliverableId: saved.id, version, cloudProvider })}\n\n`));
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
