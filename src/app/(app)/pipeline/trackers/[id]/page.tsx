import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/pipeline/status-pill";
import { QuickNoteCell } from "@/components/pipeline/quick-note-cell";
import { TrackerReimportPanel } from "@/components/pipeline/tracker-reimport-panel";
import type { PipelineStatus } from "@/lib/pipeline/status";

function fmtDate(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : "—";
}
function fmtNum(n: number | null | { toString: () => string }) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export default async function TrackerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  const { tenant } = await requireSessionAndTenant(session!.user.id);
  const { id } = await params;
  const tracker = await prisma.tracker.findFirst({
    where: { id, tenantId: tenant.id },
    include: { opportunities: { orderBy: { lastTouchedAt: "desc" } } },
  });
  if (!tracker) notFound();

  const mapping = (tracker.fieldMapping ?? {}) as Record<string, string | null>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">{tracker.name}</h1>
          <p className="text-sm text-muted-foreground">
            Source: {tracker.source} · {tracker.opportunities.length} opportunit{tracker.opportunities.length === 1 ? "y" : "ies"} ·
            {tracker.lastSyncAt ? ` last synced ${tracker.lastSyncAt.toLocaleString()}` : " never synced"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/pipeline">Back</Link>
          </Button>
        </div>
      </div>

      <TrackerReimportPanel trackerId={tracker.id} />

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Field mapping</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs">
            {Object.entries(mapping).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 border-b py-1">
                <span className="text-muted-foreground">{k}</span>
                <span className="truncate">{v ?? "—"}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Opportunities</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Customer / Opp</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium text-right">USD</th>
                  <th className="px-3 py-2 font-medium text-right">MYR</th>
                  <th className="px-3 py-2 font-medium">Close</th>
                  <th className="px-3 py-2 font-medium">Owner</th>
                  <th className="px-3 py-2 font-medium min-w-[220px]">Quick note</th>
                </tr>
              </thead>
              <tbody>
                {tracker.opportunities.map((o) => (
                  <tr key={o.id} className="border-b align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium">{o.customer}</div>
                      <div className="text-muted-foreground">{o.name}</div>
                    </td>
                    <td className="px-3 py-2"><StatusPill status={o.status as PipelineStatus} /></td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(o.valueUsd as unknown as number | null)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(o.valueMyr as unknown as number | null)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(o.closeDate)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{o.ownerName ?? "—"}</td>
                    <td className="px-3 py-2"><QuickNoteCell opportunityId={o.id} initialNote={o.notes} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
