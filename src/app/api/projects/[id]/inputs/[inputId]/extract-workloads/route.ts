import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractWorkloadsFromText } from "@/lib/inventory/workload-extract";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string; inputId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, inputId } = await ctx.params;
  const input = await prisma.projectInput.findFirst({
    where: { id: inputId, projectId: id, project: { tenant: { users: { some: { id: session.user.id } } } } },
  });
  if (!input) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!input.textContent || !input.textContent.trim()) {
    return NextResponse.json({ error: "input has no text content to extract from" }, { status: 400 });
  }

  try {
    const { workloadSet, warnings } = await extractWorkloadsFromText(
      input.textContent,
      input.filename ?? undefined,
    );
    if (workloadSet.workloads.length === 0) {
      return NextResponse.json(
        { error: "no workloads found in the document — the LLM couldn't identify any server/VM rows", warnings },
        { status: 422 },
      );
    }
    const t = workloadSet.totals;
    const summary = `${t.count} workloads (AI-extracted), ${t.cpu} vCPU, ${t.ramGb} GB RAM, ${t.storageGb} GB storage. OS mix: ${JSON.stringify(t.osMix)}`;
    const updated = await prisma.projectInput.update({
      where: { id: input.id },
      data: {
        workloadsJson: workloadSet as object,
        rawSummary: summary,
      },
    });
    return NextResponse.json({
      inputId: updated.id,
      summary,
      totals: t,
      warnings,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "extraction failed" },
      { status: 502 },
    );
  }
}
