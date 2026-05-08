import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { generateText } from "ai";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gateway, DEFAULT_MODEL } from "@/lib/ai";
import { PATTERN_EXTRACTOR_SYSTEM } from "@/lib/prompts/pattern-extractor";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  deliverableType: z.enum(["bom", "proposal", "architecture", "assessment", "project_plan"]),
  feedback: z.string().min(5),
  draftContent: z.string().optional(),
});

const Candidate = z.object({
  pattern: z.string().min(5),
  scope: z.enum(["universal", "conditional"]),
  conditions: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
  rationale: z.string(),
  example_from_draft: z.string().optional().default(""),
});
const ExtractResult = z.object({
  candidates: z.array(Candidate),
  skipped_feedback: z.array(z.string()).default([]),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const project = await prisma.project.findFirst({
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

${parsed.data.draftContent ? `# Draft being reviewed (for context)\n\`\`\`markdown\n${parsed.data.draftContent.slice(0, 6000)}\n\`\`\`` : ""}

Extract candidate patterns. Return JSON only.`;

  const result = await generateText({
    model: gateway(DEFAULT_MODEL),
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

  // Strip code fences if model added them despite instructions
  let raw = result.text.trim();
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }

  let extracted: z.infer<typeof ExtractResult>;
  try {
    extracted = ExtractResult.parse(JSON.parse(raw));
  } catch (e) {
    return NextResponse.json(
      { error: "model returned malformed JSON", raw, detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  return NextResponse.json(extracted);
}
