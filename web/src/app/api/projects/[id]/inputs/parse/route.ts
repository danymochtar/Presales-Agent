import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseRvtools } from "@/lib/inventory/rvtools";

export const runtime = "nodejs";
export const maxDuration = 30;

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
  const kind = (form.get("kind") as string | null) ?? "rvtools";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing file" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "file too large (10MB max in MVP)" }, { status: 413 });
  }

  const buf = await file.arrayBuffer();

  let workloadSet;
  try {
    if (kind === "rvtools") {
      workloadSet = parseRvtools(buf);
    } else {
      return NextResponse.json({ error: `parser for kind=${kind} not implemented yet` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "parse failed" },
      { status: 422 },
    );
  }

  const summary = `${workloadSet.totals.count} workloads, ${workloadSet.totals.cpu} vCPU, ${workloadSet.totals.ramGb} GB RAM, ${workloadSet.totals.storageGb} GB storage. OS mix: ${JSON.stringify(workloadSet.totals.osMix)}.`;

  const saved = await prisma.projectInput.create({
    data: {
      projectId: project.id,
      kind,
      workloadsJson: workloadSet as object,
      rawSummary: summary,
    },
  });

  return NextResponse.json({ inputId: saved.id, summary, totals: workloadSet.totals });
}
