// Multi-purpose: takes one Excel file, runs the workbook preview, then asks
// the LLM (Haiku) to suggest a full mapping + tracker classification.
// Wizard calls this once per file. Falls back to a regex-only mapping if
// the AI call fails so the wizard still works under outage.

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { requireSessionAndTenant } from "@/lib/tenant";
import { readWorkbookPreview, suggestMapping } from "@/lib/pipeline/field-mapping";
import { aiSuggestMapping } from "@/lib/pipeline/ai-mapping";
import { detectPurpose } from "@/lib/pipeline/purpose";
import { detectOrigin } from "@/lib/pipeline/origin";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { user, tenant } = await requireSessionAndTenant(session.user.id);

  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  const f = file as File;
  const buf = Buffer.from(await f.arrayBuffer());
  const preview = readWorkbookPreview(buf, 8);
  const first = preview[0];
  if (!first) return NextResponse.json({ error: "workbook has no readable sheet" }, { status: 422 });

  // Regex baseline — always returned. The wizard merges AI suggestions on
  // top so the form never lands empty even if the AI call fails.
  const regexMapping = suggestMapping(first.headers);
  const fileName = f.name.replace(/\.[^.]+$/, "");
  const fallbackPurpose = detectPurpose(fileName);
  const fallbackOrigin = detectOrigin(fileName);

  let ai: Awaited<ReturnType<typeof aiSuggestMapping>> | null = null;
  let aiError: string | null = null;
  try {
    ai = await aiSuggestMapping({
      fileName: f.name,
      sheet: first.sheet,
      headers: first.headers,
      sampleRows: first.sampleRows,
      tenantId: tenant.id,
      userId: user.id,
    });
  } catch (err) {
    aiError = err instanceof Error ? err.message : "AI mapping unavailable";
  }

  return NextResponse.json({
    preview,
    regexMapping,
    ai,
    fallback: {
      suggestedName: fileName,
      suggestedPurpose: fallbackPurpose,
      suggestedDefaultOrigin: fallbackOrigin ?? "unknown",
    },
    aiError,
  });
}
