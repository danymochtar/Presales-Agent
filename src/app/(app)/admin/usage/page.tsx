import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSuperadminContextForPage } from "@/lib/admin";
import { estimateCostUsd } from "@/lib/ai-logging";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const PURPOSE_LABELS: Record<string, string> = {
  "extract-project": "Project metadata extraction",
  "generate-bom": "BOM generation",
  "generate-architecture": "Architecture generation",
  "generate-proposal": "Proposal generation",
  "generate-assessment": "Assessment generation",
  "generate-tco": "TCO generation",
  "generate-project-plan": "Project plan generation",
  "extract-workloads": "Workload extraction",
  "extract-pattern": "Training pattern extraction",
};

export default async function UsagePage() {
  const ctx = (await getSuperadminContextForPage())!;
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [recent, totals30d, totals7d, byPurpose, byUser] = await Promise.all([
    prisma.llmCall.findMany({
      where: { tenantId: ctx.tenant.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.llmCall.aggregate({
      where: { tenantId: ctx.tenant.id, createdAt: { gte: since30 } },
      _sum: { totalTokens: true, inputTokens: true, outputTokens: true, durationMs: true },
      _count: { _all: true },
    }),
    prisma.llmCall.aggregate({
      where: { tenantId: ctx.tenant.id, createdAt: { gte: since7 } },
      _sum: { totalTokens: true, inputTokens: true, outputTokens: true },
      _count: { _all: true },
    }),
    prisma.llmCall.groupBy({
      by: ["purpose", "model"],
      where: { tenantId: ctx.tenant.id, createdAt: { gte: since30 } },
      _sum: { inputTokens: true, outputTokens: true, totalTokens: true },
      _count: { _all: true },
    }),
    prisma.llmCall.groupBy({
      by: ["userId"],
      where: { tenantId: ctx.tenant.id, createdAt: { gte: since30 } },
      _sum: { totalTokens: true },
      _count: { _all: true },
    }),
  ]);

  // Resolve userIds → emails for the byUser breakdown
  const userIds = byUser.map((b) => b.userId).filter((x): x is string => !!x);
  const users = userIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true, role: true } })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const totalCost30d = byPurpose.reduce(
    (s, b) => s + estimateCostUsd(b.model, b._sum.inputTokens ?? 0, b._sum.outputTokens ?? 0),
    0,
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Calls (30d)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{totals30d._count._all}</div>
            <p className="text-xs text-muted-foreground">{totals7d._count._all} in last 7d</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Tokens (30d)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{(totals30d._sum.totalTokens ?? 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">in: {(totals30d._sum.inputTokens ?? 0).toLocaleString()} · out: {(totals30d._sum.outputTokens ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Estimated cost (30d)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">USD {totalCost30d.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">advisory — reconcile against Vercel AI Gateway</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Avg duration</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {totals30d._count._all > 0
                ? Math.round((totals30d._sum.durationMs ?? 0) / totals30d._count._all / 1000) + "s"
                : "—"}
            </div>
            <p className="text-xs text-muted-foreground">per call (30d)</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Breakdown by purpose × model (30d)</CardTitle>
          <CardDescription>Where token spend is concentrated.</CardDescription>
        </CardHeader>
        <CardContent>
          {byPurpose.length === 0 ? (
            <p className="text-sm text-muted-foreground">No instrumented calls yet. Currently the project-extraction step + BOM generation are logged; other deliverables come in a follow-up MVP.</p>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="text-left py-2">Purpose</th>
                    <th className="text-left">Model</th>
                    <th className="text-right">Calls</th>
                    <th className="text-right">In tokens</th>
                    <th className="text-right">Out tokens</th>
                    <th className="text-right">Total tokens</th>
                    <th className="text-right whitespace-nowrap">Est cost (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {byPurpose
                    .sort((a, b) => (b._sum.totalTokens ?? 0) - (a._sum.totalTokens ?? 0))
                    .map((b) => {
                      const inT = b._sum.inputTokens ?? 0;
                      const outT = b._sum.outputTokens ?? 0;
                      const cost = estimateCostUsd(b.model, inT, outT);
                      return (
                        <tr key={`${b.purpose}-${b.model}`} className="border-b last:border-0">
                          <td className="py-1.5 whitespace-nowrap">{PURPOSE_LABELS[b.purpose] ?? b.purpose}</td>
                          <td className="text-muted-foreground whitespace-nowrap">{b.model}</td>
                          <td className="text-right">{b._count._all}</td>
                          <td className="text-right">{inT.toLocaleString()}</td>
                          <td className="text-right">{outT.toLocaleString()}</td>
                          <td className="text-right">{(b._sum.totalTokens ?? 0).toLocaleString()}</td>
                          <td className="text-right">{cost.toFixed(4)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {byUser.length > 0 && (
        <Card>
          <CardHeader><CardTitle>By user (30d)</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
              <table className="w-full text-sm min-w-[480px]">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="text-left py-2">User</th>
                    <th className="text-left">Role</th>
                    <th className="text-right">Calls</th>
                    <th className="text-right whitespace-nowrap">Total tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {byUser.map((b) => {
                    const u = b.userId ? userMap.get(b.userId) : null;
                    return (
                      <tr key={b.userId ?? "anon"} className="border-b last:border-0">
                        <td className="py-1.5 truncate max-w-[200px]">{u?.email ?? "(unknown)"}</td>
                        <td className="text-muted-foreground">{u?.role ?? "—"}</td>
                        <td className="text-right">{b._count._all}</td>
                        <td className="text-right">{(b._sum.totalTokens ?? 0).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Recent calls (last 50)</CardTitle></CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No calls logged yet. Try generating a project from <Link className="underline" href="/engagements/new">/projects/new</Link>.
            </p>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
              <table className="w-full text-xs min-w-[640px]">
                <thead className="text-muted-foreground">
                  <tr className="border-b">
                    <th className="text-left py-2">When</th>
                    <th className="text-left">Purpose</th>
                    <th className="text-left">Model</th>
                    <th className="text-right">In</th>
                    <th className="text-right">Out</th>
                    <th className="text-right">ms</th>
                    <th className="text-right">OK</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-1.5 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                      <td className="whitespace-nowrap">{PURPOSE_LABELS[r.purpose] ?? r.purpose}</td>
                      <td className="text-muted-foreground whitespace-nowrap">{r.model}</td>
                      <td className="text-right">{r.inputTokens.toLocaleString()}</td>
                      <td className="text-right">{r.outputTokens.toLocaleString()}</td>
                      <td className="text-right">{r.durationMs.toLocaleString()}</td>
                      <td className="text-right">{r.succeeded ? "✓" : "✗"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
