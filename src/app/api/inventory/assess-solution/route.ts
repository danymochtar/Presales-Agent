// Standalone solution-area assessment endpoint. Used by the Quick + project
// create wizards BEFORE a project exists. Body lists every uploaded file's
// summary + text snippet + the detected component counts (computed client-
// side from the parser output) and an optional refinement note from the
// user. Returns a SolutionAreaAssessment.

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { assessSolutionArea } from "@/lib/inventory/solution-area-assessor";

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = z.object({
  files: z.array(z.object({
    filename: z.string().optional(),
    summary: z.string().optional(),
    textSnippet: z.string().optional(),
  })).default([]),
  detectedComponentCounts: z.record(z.string(), z.number()).default({}),
  refinementNote: z.string().max(4000).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const filenames = parsed.data.files.map((f) => f.filename ?? "(unnamed)");
  const summaries = parsed.data.files.map((f) => f.summary ?? "");
  const textSnippets = parsed.data.files.map((f) => f.textSnippet ?? "");

  const assessment = await assessSolutionArea({
    filenames,
    summaries,
    textSnippets,
    detectedComponentCounts: parsed.data.detectedComponentCounts,
    refinementNote: parsed.data.refinementNote,
  });

  return NextResponse.json({ assessment });
}
