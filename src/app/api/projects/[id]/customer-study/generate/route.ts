import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { streamText } from "ai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gateway, DEFAULT_MODEL } from "@/lib/ai";
import { GENERATE_CUSTOMER_STUDY_SYSTEM } from "@/lib/prompts/generate-customer-study";
import { logLlmCall } from "@/lib/ai-logging";
import { findMatchingTemplates, formatTemplatesAsPromptSection } from "@/lib/templates";
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
      tenant: { include: { patterns: { where: { active: true, deliverableType: "customer_study" } } } },
      inputs: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!project) return new Response("not found", { status: 404 });
  if (!project.tenant) return new Response("tenant missing", { status: 400 });

  // Inventory is OPTIONAL for customer study — uses it for richer current-state if present
  const inventoryInput = project.inputs.find((i) => i.workloadsJson);
  const workloadSet = (inventoryInput?.workloadsJson as unknown as WorkloadSet | null) ?? null;

  // Pull all text-content inputs (RFP, notes, requirements, assessment-report)
  // — these are the customer-provided artifacts that drive the study.
  const contextDocs = project.inputs
    .filter((i) => i.textContent && i.textContent.trim().length > 0)
    .map((i) => ({ kind: i.kind, filename: i.filename ?? "(unnamed)", text: i.textContent!.slice(0, 10_000) }));

  const templates = await findMatchingTemplates({
    tenantId: project.tenantId,
    deliverableType: "customer_study",
    cloud: null, // customer study is cloud-agnostic
    projectType: project.projectType,
    maxCount: 2,
  });
  const templateSection = formatTemplatesAsPromptSection(templates);

  const tenantContext = {
    tenant: {
      name: project.tenant.name,
      country: project.tenant.country,
      identity: project.tenant.identity,
      compliance: project.tenant.compliance,
      guardrails: project.tenant.guardrails,
    },
    learnedPatterns: project.tenant.patterns.map((p) => ({
      pattern: p.pattern, scope: p.scope, conditions: p.conditions, confidence: p.confidence,
    })),
  };

  const userMessage = `# Generate Customer Study for project: ${project.name}
${templateSection ? `\n${templateSection}` : ""}
## Project metadata
- Customer: ${project.customer}
- Industry: ${project.industry ?? "(not specified)"}
- Customer segment: ${project.customerSegment ?? "(not specified)"}
- Project type: ${project.projectType ?? "unknown"}
- Scope summary: ${project.scopeSummary ?? "(not specified)"}

## Tenant context (apply guardrails, compliance lens, brand voice)
\`\`\`json
${JSON.stringify(tenantContext, null, 2)}
\`\`\`

${workloadSet ? `## Inventory (current-state hint, ${workloadSet.totals.count} workloads)
${workloadSet.totals.cpu} vCPU, ${workloadSet.totals.ramGb} GB RAM, ${workloadSet.totals.storageGb} GB storage. OS mix: ${JSON.stringify(workloadSet.totals.osMix)}.

Workload sample (first 30):
\`\`\`json
${JSON.stringify(workloadSet.workloads.slice(0, 30), null, 2)}
\`\`\`
` : "## Inventory\n_No inventory uploaded yet. The current-state IT landscape section will rely on RFP / notes content + flag what to confirm._\n"}

${contextDocs.length > 0 ? `## Customer-provided documents (RFP, requirements, meeting notes)
${contextDocs.map((d) => `### ${d.filename} (${d.kind})\n${d.text}`).join("\n\n---\n\n")}
` : "## Customer-provided documents\n_None uploaded — the study will be sparse and lean heavily on Discovery questions._\n"}

Generate the Customer Study now in Markdown following the standard structure. Be CONCISE — 2-4 pages. Honest about gaps — flag "to confirm" liberally where the docs don't say. Apply learned patterns where applicable.
`;

  const result = streamText({
    model: gateway(DEFAULT_MODEL),
    messages: [
      {
        role: "system",
        content: GENERATE_CUSTOMER_STUDY_SYSTEM,
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

        // Customer Study is cloud-agnostic — store cloudProvider as null
        const last = await prisma.deliverable.findFirst({
          where: { projectId: project.id, type: "customer_study" },
          orderBy: { version: "desc" },
        });
        const version = (last?.version ?? 0) + 1;
        const saved = await prisma.deliverable.create({
          data: {
            projectId: project.id,
            type: "customer_study",
            cloudProvider: null,
            version,
            status: "draft",
            contentMd: fullText,
            metadata: {
              workloadCount: workloadSet?.totals.count ?? 0,
              contextDocCount: contextDocs.length,
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
          purpose: "generate-customer-study",
          model: DEFAULT_MODEL,
          inputTokens: usage?.inputTokens ?? 0,
          outputTokens: usage?.outputTokens ?? 0,
          durationMs: Date.now() - startTs,
          succeeded: true,
        });

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, deliverableId: saved.id, version })}\n\n`));
        controller.close();
      } catch (err) {
        await logLlmCall({
          tenantId: project.tenantId,
          userId: session.user.id,
          projectId: project.id,
          purpose: "generate-customer-study",
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
