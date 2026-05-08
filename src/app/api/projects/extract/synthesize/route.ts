import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { generateText } from "ai";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { gateway, DEFAULT_MODEL } from "@/lib/ai";
import { EXTRACT_PROJECT_SYSTEM } from "@/lib/prompts/extract-project";

export const runtime = "nodejs";
export const maxDuration = 60;

const ParsedFile = z.object({
  filename: z.string(),
  kind: z.string(),
  rawSummary: z.string(),
  textContent: z.string().optional(),
  workloadsSummary: z
    .object({ count: z.number(), cpu: z.number(), ramGb: z.number(), storageGb: z.number(), osMix: z.record(z.string(), z.number()) })
    .optional(),
});

const Body = z.object({
  files: z.array(ParsedFile).min(1).max(20),
});

const ExtractedShape = z.object({
  projectName: z.string().optional().default(""),
  customer: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  customerSegment: z.enum(["BFSI", "Gov", "MNC", "SMB"]).nullable().optional(),
  scopeSummary: z.string().nullable().optional(),
  targetClouds: z.array(z.enum(["azure", "aws", "gcp"])).default(["azure"]),
  cloudRegions: z
    .record(z.string(), z.object({ primary: z.string(), dr: z.string() }))
    .optional()
    .default({}),
  keyRequirements: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  confidence: z
    .object({
      customer: z.enum(["high", "medium", "low"]).default("low"),
      industry: z.enum(["high", "medium", "low"]).default("low"),
      customerSegment: z.enum(["high", "medium", "low"]).default("low"),
      scopeSummary: z.enum(["high", "medium", "low"]).default("low"),
      targetClouds: z.enum(["high", "medium", "low"]).default("low"),
      cloudRegions: z.enum(["high", "medium", "low"]).default("low"),
    })
    .default({
      customer: "low",
      industry: "low",
      customerSegment: "low",
      scopeSummary: "low",
      targetClouds: "low",
      cloudRegions: "low",
    }),
});

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const docBlocks = parsed.data.files.map((f) => {
    const lines = [`## ${f.filename} (${f.kind})`, f.rawSummary];
    if (f.workloadsSummary) {
      lines.push(`Workload totals: ${JSON.stringify(f.workloadsSummary)}`);
    }
    if (f.textContent) {
      lines.push("", "```", f.textContent.slice(0, 30_000), "```");
    }
    return lines.join("\n");
  });

  const userMessage = `# Extract project metadata from the following ${parsed.data.files.length} document(s)

${docBlocks.join("\n\n---\n\n")}

Return JSON only.`;

  const result = await generateText({
    model: gateway(DEFAULT_MODEL),
    messages: [
      {
        role: "system",
        content: EXTRACT_PROJECT_SYSTEM,
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      },
      { role: "user", content: userMessage },
    ],
    maxOutputTokens: 2000,
  });

  let raw = result.text.trim();
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }

  let extracted: z.infer<typeof ExtractedShape>;
  try {
    extracted = ExtractedShape.parse(JSON.parse(raw));
  } catch (e) {
    return NextResponse.json(
      { error: "model returned malformed JSON", raw, detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  return NextResponse.json({ extracted });
}
