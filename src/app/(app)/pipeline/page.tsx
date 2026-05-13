import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KpiStrip } from "@/components/pipeline/kpi-strip";
import { TrackerCard } from "@/components/pipeline/tracker-card";
import { StatusPill } from "@/components/pipeline/status-pill";
import { OriginPill } from "@/components/pipeline/origin-pill";
import { QuickNoteCell } from "@/components/pipeline/quick-note-cell";
import { summarize, type PipelineOpportunityRow } from "@/lib/exporters/pipeline-xlsx";
import type { PipelineStatus } from "@/lib/pipeline/status";
import {
  OPPORTUNITY_ORIGINS,
  ORIGIN_LABELS,
  ORIGIN_COLORS,
  type OpportunityOrigin,
} from "@/lib/pipeline/origin";

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}
function fmtNum(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export default async function PipelinePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const { tenant } = await requireSessionAndTenant(session!.user.id);

  const trackers = await prisma.tracker.findMany({
    where: { tenantId: tenant.id },
    orderBy: { updatedAt: "desc" },
    include: { opportunities: { orderBy: { lastTouchedAt: "desc" } } },
  });

  const allRows: PipelineOpportunityRow[] = trackers.flatMap((t) =>
    t.opportunities.map((o) => ({
      id: o.id,
      trackerName: t.name,
      trackerSource: t.source,
      externalId: o.externalId,
      customer: o.customer,
      name: o.name,
      status: o.status as PipelineStatus,
      rawStatus: o.rawStatus,
      originKind: o.originKind,
      valueUsd: o.valueUsd ? Number(o.valueUsd) : null,
      valueMyr: o.valueMyr ? Number(o.valueMyr) : null,
      closeDate: o.closeDate,
      ownerName: o.ownerName,
      vendor: o.vendor,
      fundingProgram: o.fundingProgram,
      fundingExpiresAt: o.fundingExpiresAt,
      notes: o.notes,
      raw: (o.raw as Record<string, unknown>) ?? {},
    })),
  );

  const today = new Date();
  const s = summarize(allRows, today);
  const asOf = today.toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            Consolidated view across every source tracker — Microsoft biweekly, SMB / SMC / ENT-PS segments, sales-team pipes, funding programs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="/api/pipeline/export">Export to Excel</a>
          </Button>
          <Button asChild size="sm">
            <Link href="/pipeline/trackers/new">Add tracker</Link>
          </Button>
        </div>
      </div>

      <KpiStrip
        totalCount={s.totalCount}
        totalUsd={s.totalUsd}
        totalMyr={s.totalMyr}
        committedUsd={s.byStatus.committed.usd}
        upsideUsd={s.byStatus.upside.usd}
        atRiskUsd={s.byStatus.at_risk.usd}
        closingMonthUsd={s.closingMonthUsd}
        closingMonthCount={s.closingMonthCount}
        closingQuarterUsd={s.closingQuarterUsd}
        closingQuarterCount={s.closingQuarterCount}
        fxAsOf={asOf}
      />

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Trackers</h2>
          <Link href="/pipeline/trackers" className="text-xs underline">Manage</Link>
        </div>
        {trackers.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No trackers yet. <Link href="/pipeline/trackers/new" className="underline">Upload your first Excel</Link> to get started.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {trackers.map((t) => (
              <TrackerCard
                key={t.id}
                id={t.id}
                name={t.name}
                source={t.source}
                count={t.opportunities.length}
                lastSyncAt={t.lastSyncAt ? t.lastSyncAt.toISOString() : null}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">By origin — plan view</h2>
        <Card>
          <CardContent className="p-3">
            {allRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Upload a tracker to see opportunities split by origin (carry-over / FY target / existing customer / net-new).
                Each row can be re-tagged from the Origin column below.
              </p>
            ) : (
              <ul className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                {OPPORTUNITY_ORIGINS.map((origin) => {
                  const v = s.byOrigin[origin];
                  if (v.count === 0) return null;
                  return (
                    <li key={origin} className={`rounded-md border p-2.5 ${ORIGIN_COLORS[origin]}`}>
                      <div className="font-medium">{ORIGIN_LABELS[origin]}</div>
                      <div className="text-base font-semibold tabular-nums mt-0.5">${Math.round(v.usd).toLocaleString()}</div>
                      <div className="opacity-70">{v.count} deal{v.count === 1 ? "" : "s"}</div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">All opportunities</h2>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{allRows.length} row(s)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Customer / Opp</th>
                    <th className="px-3 py-2 font-medium">Tracker</th>
                    <th className="px-3 py-2 font-medium">Origin</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium text-right">USD</th>
                    <th className="px-3 py-2 font-medium text-right">MYR</th>
                    <th className="px-3 py-2 font-medium">Close</th>
                    <th className="px-3 py-2 font-medium">Owner</th>
                    <th className="px-3 py-2 font-medium min-w-[220px]">Quick note</th>
                  </tr>
                </thead>
                <tbody>
                  {allRows.map((r) => (
                    <tr key={r.id} className="border-b align-top">
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.customer}</div>
                        <div className="text-muted-foreground">{r.name}</div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.trackerName}</td>
                      <td className="px-3 py-2"><OriginPill opportunityId={r.id} origin={r.originKind as OpportunityOrigin} /></td>
                      <td className="px-3 py-2"><StatusPill status={r.status} /></td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.valueUsd)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.valueMyr)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.closeDate)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.ownerName ?? "—"}</td>
                      <td className="px-3 py-2"><QuickNoteCell opportunityId={r.id} initialNote={r.notes} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
