import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { requireSessionAndTenant } from "@/lib/tenant";
import { readWorkbookPreview, suggestMapping } from "@/lib/pipeline/field-mapping";

export const runtime = "nodejs";
export const maxDuration = 30;

// Multipart upload preview endpoint. Returns sheet headers, sample rows, and
// the suggested canonical-field mapping so the wizard can pre-fill the form.
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await requireSessionAndTenant(session.user.id);

  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  const buf = Buffer.from(await (file as File).arrayBuffer());
  const preview = readWorkbookPreview(buf, 5);
  const first = preview[0];
  const mapping = first ? suggestMapping(first.headers) : {};
  return NextResponse.json({ preview, suggestedMapping: mapping });
}
