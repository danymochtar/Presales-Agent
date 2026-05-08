import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { streamText } from "ai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gateway, DEFAULT_MODEL } from "@/lib/ai";
import { GENERATE_ARCHITECTURE_SYSTEM } from "@/lib/prompts/generate-architecture";
import type { WorkloadSet } from "@/lib/inventory/workload";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const project = await prisma.project.findFirst({
    where: { id, tenant: { users: { some: { id: session.user.id } } } },
    include: {
      tenant: { include: { patterns: { where: { active: true, deliverableType: "architecture" } } } },
      inputs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!project) return new Response("not found", { status: 404 });
  if (!project.tenant) return new Response("tenant missing", { status: 400 });

  const latestInput = project.inputs[0];
  const workloadSet = (latestInput?.workloadsJson as unknown as WorkloadSet | null) ?? null;

  const tenantContext = {
    tenant: {
      name: project.tenant.name,
      country: project.tenant.country,
      identity: project.tenant.identity,
      standards: project.tenant.standards,
      compliance: project.tenant.compliance,
      guardrails: project.tenant.guardrails,
    },
    learnedPatterns: project.tenant.patterns.map((p) => ({
      pattern: p.pattern, scope: p.scope, conditions: p.conditions, confidence: p.confidence,
    })),
  };

  const userMessage = `# Generate Architecture document for project: ${project.name}

## Project
- Customer: ${project.customer}
- Industry: ${project.industry ?? "(not specified)"}
- Primary region: ${project.primaryRegion}
- DR region: ${project.drRegion}
- Scope summary: ${project.scopeSummary ?? "(not specified)"}

## Tenant context (apply standards, compliance posture, learned patterns)
\`\`\`json
${JSON.stringify(tenantContext, null, 2)}
\`\`\`

${workloadSet ? `## Workload inventory
Total: ${workloadSet.totals.count} workloads, ${workloadSet.totals.cpu} vCPU, ${workloadSet.totals.ramGb} GB RAM, ${workloadSet.totals.storageGb} GB storage. OS mix: ${JSON.stringify(workloadSet.totals.osMix)}.

\`\`\`json
${JSON.stringify(workloadSet.workloads.slice(0, 50), null, 2)}
\`\`\`
` : "## Workload inventory\n_No inventory uploaded — produce a target-state architecture based on scope summary alone, and flag the gap in Assumptions._\n"}

Generate the architecture document now in Markdown following the standard structure. Include Mermaid diagrams as specified. Apply learned patterns where applicable.
`;

  const result = streamText({
    model: gateway(DEFAULT_MODEL),
    messages: [
      {
        role: "system",
        content: GENERATE_ARCHITECTURE_SYSTEM,
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
          where: { projectId: project.id, type: "architecture" },
          orderBy: { version: "desc" },
        });
        const version = (last?.version ?? 0) + 1;
        const saved = await prisma.deliverable.create({
          data: {
            projectId: project.id,
            type: "architecture",
            version,
            status: "draft",
            contentMd: fullText,
            metadata: {
              workloadCount: workloadSet?.totals.count ?? 0,
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
