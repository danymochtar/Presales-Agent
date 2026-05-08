import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { generateObject } from "ai";
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

// Confidence enum (loose — accept any string and coerce to lowercase, fallback to "low").
const Conf = z.preprocess(
  (v) => {
    if (typeof v !== "string") return "low";
    const lower = v.toLowerCase().trim();
    if (lower === "high" || lower === "medium" || lower === "low") return lower;
    return "low";
  },
  z.enum(["high", "medium", "low"]),
);

// Customer segment: coerce common variants, fallback to null.
const Segment = z.preprocess(
  (v) => {
    if (v === null || v === undefined) return null;
    if (typeof v !== "string") return null;
    const t = v.trim();
    const upper = t.toUpperCase();
    if (upper === "BFSI") return "BFSI";
    if (upper === "MNC") return "MNC";
    if (upper === "SMB") return "SMB";
    if (upper === "GOV" || upper === "GOVERNMENT" || upper === "PUBLIC SECTOR") return "Gov";
    return null;
  },
  z.enum(["BFSI", "Gov", "MNC", "SMB"]).nullable(),
);

// Cloud enum: lowercase + filter out unsupported.
const Cloud = z.preprocess(
  (v) => {
    if (typeof v !== "string") return undefined;
    const lower = v.toLowerCase().trim();
    if (lower === "azure" || lower === "aws" || lower === "gcp") return lower;
    return undefined;
  },
  z.enum(["azure", "aws", "gcp"]),
);

// Schema enforced via generateObject — the AI SDK uses tool-calling under the
// hood to make the model produce conforming JSON. Far more robust than parsing
// generateText output by hand.
const ExtractedShape = z.object({
  projectName: z.string().nullable().optional().transform((v) => v ?? ""),
  customer: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  customerSegment: Segment.optional(),
  scopeSummary: z.string().nullable().optional(),
  targetClouds: z.array(Cloud).default(["azure"]),
  cloudRegions: z
    .record(z.string(), z.object({ primary: z.string(), dr: z.string() }))
    .nullable()
    .optional()
    .transform((v) => v ?? {}),
  keyRequirements: z.array(z.string()).nullable().optional().transform((v) => v ?? []),
  constraints: z.array(z.string()).nullable().optional().transform((v) => v ?? []),
  confidence: z
    .object({
      customer: Conf.default("low"),
      industry: Conf.default("low"),
      customerSegment: Conf.default("low"),
      scopeSummary: Conf.default("low"),
      targetClouds: Conf.default("low"),
      cloudRegions: Conf.default("low"),
    })
    .partial()
    .nullable()
    .optional()
    .transform((v) => ({
      customer: v?.customer ?? "low",
      industry: v?.industry ?? "low",
      customerSegment: v?.customerSegment ?? "low",
      scopeSummary: v?.scopeSummary ?? "low",
      targetClouds: v?.targetClouds ?? "low",
      cloudRegions: v?.cloudRegions ?? "low",
    })),
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

${docBlocks.join("\n\n---\n\n")}`;

  try {
    const result = await generateObject({
      model: gateway(DEFAULT_MODEL),
      schema: ExtractedShape,
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
    return NextResponse.json({ extracted: result.object });
  } catch (err) {
    return NextResponse.json(
      {
        error: "extraction failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
