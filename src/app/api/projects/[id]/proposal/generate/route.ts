import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { streamText } from "ai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gateway, DEFAULT_MODEL } from "@/lib/ai";
import { GENERATE_PROPOSAL_SYSTEM } from "@/lib/prompts/generate-proposal";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const project = await prisma.project.findFirst({
    where: { id, tenant: { users: { some: { id: session.user.id } } } },
    include: {
      tenant: { include: { patterns: { where: { active: true, deliverableType: "proposal" } } } },
      deliverables: { where: { type: "bom" }, orderBy: { version: "desc" }, take: 1 },
    },
  });
  if (!project) return new Response("not found", { status: 404 });
  if (!project.tenant) return new Response("tenant missing", { status: 400 });

  const latestBom = project.deliverables[0];
  if (!latestBom) {
    return new Response("no BOM yet — generate a BOM first; the proposal references it", { status: 400 });
  }

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

  const userMessage = `# Generate proposal for project: ${project.name}

## Project
- Customer: ${project.customer}
- Industry: ${project.industry ?? "(not specified)"}
- Primary region: ${project.primaryRegion}
- DR region: ${project.drRegion}
- Scope summary: ${project.scopeSummary ?? "(not specified)"}

## Tenant context (apply identity, compliance posture, voice, learned patterns)
\`\`\`json
${JSON.stringify(tenantContext, null, 2)}
\`\`\`

## Latest BOM (v${latestBom.version}) — single source of pricing truth
The proposal MUST reference this BOM for all numbers. Do not invent prices.

\`\`\`markdown
${latestBom.contentMd}
\`\`\`

Generate the proposal now in Markdown following the standard structure. Keep tone customer-facing. Apply learned patterns where applicable.
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
  const sse = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of result.textStream) {
          fullText += chunk;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: chunk })}\n\n`));
        }

        const last = await prisma.deliverable.findFirst({
          where: { projectId: project.id, type: "proposal" },
          orderBy: { version: "desc" },
        });
        const version = (last?.version ?? 0) + 1;
        const saved = await prisma.deliverable.create({
          data: {
            projectId: project.id,
            type: "proposal",
            version,
            status: "draft",
            contentMd: fullText,
            metadata: {
              sourceBomId: latestBom.id,
              sourceBomVersion: latestBom.version,
              generatedAt: new Date().toISOString(),
              model: DEFAULT_MODEL,
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
