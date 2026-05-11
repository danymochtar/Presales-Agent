// Standalone workload-extract endpoint used by the Quick wizard's mapping
// review BEFORE a project exists. Takes the parsed textContent from one or
// more uploaded files, runs each through extractWorkloadsFromText, merges
// the results, returns a single WorkloadSet + warnings.
//
// Auth-guarded; no data persisted server-side. The wizard receives the
// extracted workloads, the user reviews + edits, then the project is
// created with the final workload set as a normal ProjectInput row.

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { extractWorkloadsFromText } from "@/lib/inventory/workload-extract";
import { mergeWorkloadSets } from "@/lib/inventory/completeness";
import { summarize, type WorkloadSet } from "@/lib/inventory/workload";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  texts: z.array(z.object({
    filename: z.string().optional(),
    content: z.string().min(1).max(200_000),
  })).min(1).max(10),
});

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const warnings: string[] = [];
  let merged: WorkloadSet = { source: "generic", workloads: [], totals: summarize([]) };
  for (const t of parsed.data.texts) {
    try {
      const r = await extractWorkloadsFromText(t.content, t.filename);
      merged = mergeWorkloadSets(merged, r.workloadSet);
      if (r.warnings.length > 0) warnings.push(...r.warnings.map((w) => `${t.filename ?? "(unnamed)"}: ${w}`));
    } catch (e) {
      warnings.push(`${t.filename ?? "(unnamed)"}: extraction failed — ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  return NextResponse.json({ workloads: merged, warnings });
}
