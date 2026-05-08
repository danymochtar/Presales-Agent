import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperadmin, isContextResponse } from "@/lib/admin";
import { parseDocument } from "@/lib/parsers";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 10 * 1024 * 1024;

const TYPE_VALUES = ["bom", "assessment", "proposal", "architecture", "tco", "project_plan", "sow", "ms_offering", "letterhead", "other"] as const;

export async function GET() {
  const ctx = await requireSuperadmin();
  if (isContextResponse(ctx)) return ctx;
  const items = await prisma.template.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: [{ status: "asc" }, { type: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ templates: items });
}

const Meta = z.object({
  type: z.enum(TYPE_VALUES),
  name: z.string().min(2),
  description: z.string().optional(),
  cloudProvider: z.enum(["azure", "aws", "gcp"]).optional().nullable(),
  projectType: z.enum(["migration", "greenfield", "modernization", "dr", "poc", "optimization"]).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const ctx = await requireSuperadmin();
  if (isContextResponse(ctx)) return ctx;

  const form = await req.formData();
  const file = form.get("file");
  const meta = {
    type: form.get("type"),
    name: form.get("name"),
    description: form.get("description") || undefined,
    cloudProvider: (form.get("cloudProvider") as string) || null,
    projectType: (form.get("projectType") as string) || null,
  };
  const parsed = Meta.safeParse(meta);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let textContent: string | undefined;
  let originalName: string | undefined;
  let mimeType: string | undefined;

  if (file instanceof File) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `file too large (${Math.round(file.size / 1024 / 1024)}MB > 10MB)` }, { status: 413 });
    }
    originalName = file.name;
    mimeType = file.type || "application/octet-stream";
    try {
      const buf = await file.arrayBuffer();
      const result = await parseDocument(buf, file.name, mimeType);
      textContent = result.textContent;
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "parse failed" }, { status: 422 });
    }
  }

  // No file is OK — superadmin may seed a "structure-only" template via paste.
  const pastedText = (form.get("textContent") as string | null) || undefined;
  if (!textContent && pastedText) textContent = pastedText;

  if (!textContent) {
    return NextResponse.json({ error: "either upload a file or paste textContent" }, { status: 400 });
  }

  const created = await prisma.template.create({
    data: {
      tenantId: ctx.tenantId,
      uploadedById: ctx.userId,
      type: parsed.data.type,
      name: parsed.data.name,
      description: parsed.data.description || null,
      cloudProvider: parsed.data.cloudProvider || null,
      projectType: parsed.data.projectType || null,
      originalName: originalName || null,
      mimeType: mimeType || null,
      textContent,
      status: "active",
    },
  });
  return NextResponse.json({ template: created });
}
