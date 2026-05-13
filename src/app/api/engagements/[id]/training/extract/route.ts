import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { generateObject } from "ai";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gateway, DEFAULT_MODEL } from "@/lib/ai";
import { PATTERN_EXTRACTOR_SYSTEM } from "@/lib/prompts/pattern-extractor";
import { logLlmCall } from "@/lib/ai-logging";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  deliverableType: z.enum(["bom", "proposal", "architecture", "assessment", "project_plan"]),
  feedback: z.string().min(5),
  draftContent: z.string().optional(),
});

// Loose enums coerced from common variants.
const Scope = z.preprocess((v) => {
  if (typeof v !== "string") return "conditional";
  const lower = v.toLowerCase().trim();
  return lower === "universal" || lower === "conditional" ? lower : "conditional";
}, z.enum(["universal", "conditional"]));

const Conf = z.preprocess((v) => {
  if (typeof v !== "string") return "low";
  const lower = v.toLowerCase().trim();
  return lower === "high" || lower === "medium" || lower === "low" ? lower : "low";
}, z.enum(["high", "medium", "low"]));

const Candidate = z.object({
  pattern: z.string().min(3),
  scope: Scope,
  conditions: z.array(z.string()).nullable().optional().transform((v) => v ?? []),
  confidence: Conf,
  rationale: z.string().nullable().optional().transform((v) => v ?? ""),
  example_from_draft: z.string().nullable().optional().transform((v) => v ?? ""),
});

const ExtractResult = z.object({
  candidates: z.array(Candidate).default([]),
  skipped_feedback: z.array(z.string()).nullable().optional().transform((v) => v ?? []),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const project = await prisma.engagement.findFirst({
    where: { id, tenant: { users: { some: { id: session.user.id } } } },
  });
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const userMessage = `# Deliverable type
${parsed.data.deliverableType}

# User feedback (verbatim)
${parsed.data.feedback}

${parsed.data.draftContent ? `# Draft being reviewed (for context)\n\`\`\`markdown\n${parsed.data.draftContent.slice(0, 6000)}\n\`\`\`` : ""}`;

  const startTs = Date.now();
  try {
    const result = await generateObject({
      model: gateway(DEFAULT_MODEL),
      schema: ExtractResult,
      messages: [
        {
          role: "system",
          content: PATTERN_EXTRACTOR_SYSTEM,
          providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
        },
        { role: "user", content: userMessage },
      ],
      maxOutputTokens: 2000,
    });
    await logLlmCall({
      tenantId: project.tenantId,
      userId: session.user.id,
      engagementId: project.id,
      purpose: "extract-pattern",
      model: DEFAULT_MODEL,
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      durationMs: Date.now() - startTs,
      succeeded: true,
    });
    return NextResponse.json(result.object);
  } catch (err) {
    await logLlmCall({
      tenantId: project.tenantId,
      userId: session.user.id,
      engagementId: project.id,
      purpose: "extract-pattern",
      model: DEFAULT_MODEL,
      durationMs: Date.now() - startTs,
      succeeded: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "extraction failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
