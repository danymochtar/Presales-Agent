import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { streamText } from "ai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gateway, DEFAULT_MODEL } from "@/lib/ai";
import { GENERATE_ASSESSMENT_SYSTEM } from "@/lib/prompts/generate-assessment";
import { recommendSkuForCloud } from "@/lib/inventory/sizing";
import type { CloudType } from "@/lib/pricing";
import type { Workload, WorkloadSet } from "@/lib/inventory/workload";

export const runtime = "nodejs";
export const maxDuration = 60;

type CloudRegions = Record<string, { primary: string; dr: string } | undefined>;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("unauthorized", { status: 401 });

  const url = new URL(req.url);
  const cloudParam = url.searchParams.get("cloud") ?? "azure"; // azure | aws | compare
  const requestedMode = url.searchParams.get("mode"); // optional override

  const { id } = await ctx.params;
  const project = await prisma.project.findFirst({
    where: { id, tenant: { users: { some: { id: session.user.id } } } },
    include: {
      tenant: { include: { patterns: { where: { active: true, deliverableType: "assessment" } } } },
      inputs: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!project) return new Response("not found", { status: 404 });
  if (!project.tenant) return new Response("tenant missing", { status: 400 });

  // Pick the latest input that has parsed workloads
  const inventoryInput = project.inputs.find((i) => i.workloadsJson);
  const workloadSet = (inventoryInput?.workloadsJson as unknown as WorkloadSet | null) ?? null;
  if (!workloadSet || workloadSet.workloads.length === 0) {
    return new Response("no workloads — upload an inventory first (RVTools / Azure Migrate / generic CSV)", { status: 400 });
  }

  // Collect any text-content inputs (RFP, notes, requirements, assessment reports) for richer context.
  const contextDocs = project.inputs
    .filter((i) => i.textContent && i.textContent.trim().length > 0)
    .map((i) => ({ kind: i.kind, filename: i.filename ?? "(unnamed)", text: i.textContent!.slice(0, 8000) }));

  const targetClouds = ((project.targetClouds as string[]) ?? ["azure"]).filter((c) => c !== "gcp") as CloudType[];
  const cloudRegions = (project.cloudRegions as CloudRegions | null) ?? {};

  let cloudsToAssess: CloudType[];
  if (cloudParam === "compare") {
    cloudsToAssess = targetClouds;
    if (cloudsToAssess.length < 2) {
      return new Response("compare mode needs at least 2 non-GCP target clouds", { status: 400 });
    }
  } else {
    if (!targetClouds.includes(cloudParam as CloudType)) {
      return new Response(`cloud "${cloudParam}" is not in this project's targetClouds`, { status: 400 });
    }
    cloudsToAssess = [cloudParam as CloudType];
  }

  let mode: "single" | "compare" | "hybrid";
  if (requestedMode === "single" || requestedMode === "compare" || requestedMode === "hybrid") {
    mode = requestedMode;
  } else {
    mode = cloudsToAssess.length === 1 ? "single" : "compare";
  }

  // Pre-compute SKU recommendation per cloud for each workload — gives the LLM
  // a structured base to score readiness against without re-implementing sizing.
  const sizedByCloud: Record<string, Workload[]> = {};
  for (const cloud of cloudsToAssess) {
    sizedByCloud[cloud] = workloadSet.workloads.map((w) => ({
      ...w,
      recommendedSku: recommendSkuForCloud(cloud, w.cpu, w.ramGb),
    }));
  }

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

  const userMessage = `# Generate Migration Assessment for project: ${project.name}

mode: ${mode}
clouds: [${cloudsToAssess.join(", ")}]
primaryCloud: ${project.primaryCloud ?? "(not yet decided)"}

## Project
- Customer: ${project.customer}
- Industry: ${project.industry ?? "(not specified)"}
- Customer segment: ${project.customerSegment ?? "(not specified)"}
- Per-cloud regions: ${JSON.stringify(cloudRegions)}
- Scope summary: ${project.scopeSummary ?? "(not specified)"}

## Tenant context
\`\`\`json
${JSON.stringify(tenantContext, null, 2)}
\`\`\`

## Inventory source
${inventoryInput?.kind ?? "unknown"} · ${inventoryInput?.filename ?? "(unnamed)"}

## Inventory totals
${workloadSet.totals.count} workloads, ${workloadSet.totals.cpu} vCPU, ${workloadSet.totals.ramGb} GB RAM, ${workloadSet.totals.storageGb} GB storage. OS mix: ${JSON.stringify(workloadSet.totals.osMix)}.

## Per-cloud sized workloads (use these as the base for readiness scoring)
\`\`\`json
${JSON.stringify(sizedByCloud, null, 2)}
\`\`\`

${contextDocs.length > 0 ? `## Additional context from uploaded documents
${contextDocs.map((d) => `### ${d.filename} (${d.kind})\n${d.text}`).join("\n\n---\n\n")}
` : ""}
Generate the assessment now in Markdown following the **${mode}** mode structure. Apply learned patterns. Be explicit about MISSING DATA where inventory or context is incomplete.
`;

  const result = streamText({
    model: gateway(DEFAULT_MODEL),
    messages: [
      {
        role: "system",
        content: GENERATE_ASSESSMENT_SYSTEM,
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
          where: { projectId: project.id, type: "assessment", cloudProvider },
          orderBy: { version: "desc" },
        });
        const version = (last?.version ?? 0) + 1;
        const saved = await prisma.deliverable.create({
          data: {
            projectId: project.id,
            type: "assessment",
            cloudProvider,
            version,
            status: "draft",
            contentMd: fullText,
            metadata: {
              mode,
              clouds: cloudsToAssess,
              workloadCount: workloadSet.totals.count,
              contextDocCount: contextDocs.length,
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
