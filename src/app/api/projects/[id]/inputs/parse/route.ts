import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseDocument } from "@/lib/parsers";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const project = await prisma.project.findFirst({
    where: { id, tenant: { users: { some: { id: session.user.id } } } },
  });
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `file too large (${Math.round(file.size / 1024 / 1024)}MB > 10MB)` }, { status: 413 });
  }

  let result;
  try {
    const buf = await file.arrayBuffer();
    result = await parseDocument(buf, file.name, file.type || "application/octet-stream");
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "parse failed" },
      { status: 422 },
    );
  }

  const saved = await prisma.projectInput.create({
    data: {
      projectId: project.id,
      kind: result.kind,
      filename: result.filename,
      rawSummary: result.rawSummary,
      textContent: result.textContent ?? null,
      workloadsJson: (result.workloads as object | undefined) ?? undefined,
    },
  });

  return NextResponse.json({
    inputId: saved.id,
    kind: result.kind,
    filename: result.filename,
    summary: result.rawSummary,
    workloads: result.workloads ?? null,
    warnings: result.warnings,
    hasTextContent: !!result.textContent,
  });
}
