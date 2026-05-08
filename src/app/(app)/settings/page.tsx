import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const { tenant } = await requireSessionAndTenant(session!.user.id);
  const [rateCard, catalog, patterns] = await Promise.all([
    prisma.rateCardItem.findMany({ where: { tenantId: tenant.id } }),
    prisma.serviceCatalogItem.findMany({ where: { tenantId: tenant.id } }),
    prisma.learnedPattern.findMany({ where: { tenantId: tenant.id, active: true } }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="text-sm text-muted-foreground">
        Read-only view in MVP. Editing UI comes in Phase 2 — for now, edit via Prisma Studio or seed updates.
      </p>

      <Card>
        <CardHeader><CardTitle>Tenant</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div><span className="text-muted-foreground">Name:</span> {tenant.name}</div>
          <div><span className="text-muted-foreground">Country:</span> {tenant.country}</div>
          <div><span className="text-muted-foreground">Currency:</span> {tenant.currency}</div>
          <div><span className="text-muted-foreground">FX MYR/USD:</span> {tenant.fxMyrPerUsd ?? "—"}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Rate card ({rateCard.length})</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th className="text-left">Role</th><th className="text-left">Level</th><th className="text-right">Daily</th><th className="text-left pl-2">Currency</th></tr></thead>
            <tbody>
              {rateCard.map((r) => (
                <tr key={r.id} className="border-t"><td>{r.role}</td><td>{r.level}</td><td className="text-right">{r.dailyRate.toLocaleString()}</td><td className="pl-2">{r.currency}</td></tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Service catalog ({catalog.length})</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th className="text-left">Service</th><th className="text-right">Mandays</th><th className="text-left pl-2">Deliverable</th></tr></thead>
            <tbody>
              {catalog.map((s) => (
                <tr key={s.id} className="border-t"><td>{s.service}</td><td className="text-right">{s.defaultEffortDays}</td><td className="pl-2 text-muted-foreground">{s.deliverable ?? "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Learned patterns ({patterns.length})</CardTitle></CardHeader>
        <CardContent>
          {patterns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No patterns yet. Run a training project to extract them.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {patterns.map((p) => (
                <li key={p.id} className="border-l-2 border-primary pl-3">
                  <span className="font-medium">[{p.deliverableType}]</span> {p.pattern}
                  <span className="text-xs text-muted-foreground"> · {p.scope} · {p.confidence}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
