import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSuperadminContextForPage } from "@/lib/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminOverviewPage() {
  const ctx = (await getSuperadminContextForPage())!;
  const [templateCount, activeTemplates, llmCallCount, llmCallLast30dCount, userCount, projectCount] = await Promise.all([
    prisma.template.count({ where: { tenantId: ctx.tenant.id } }),
    prisma.template.count({ where: { tenantId: ctx.tenant.id, status: "active" } }),
    prisma.llmCall.count({ where: { tenantId: ctx.tenant.id } }),
    prisma.llmCall.count({
      where: {
        tenantId: ctx.tenant.id,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.user.count({ where: { tenantId: ctx.tenant.id } }),
    prisma.engagement.count({ where: { tenantId: ctx.tenant.id } }),
  ]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Templates</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{activeTemplates}</div>
            <p className="text-xs text-muted-foreground">{templateCount} total · {templateCount - activeTemplates} archived</p>
            <Link href="/admin/templates" className="text-xs underline">Manage →</Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">LLM calls (30d)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{llmCallLast30dCount}</div>
            <p className="text-xs text-muted-foreground">{llmCallCount} all-time</p>
            <Link href="/admin/usage" className="text-xs underline">View usage →</Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Users</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{userCount}</div>
            <p className="text-xs text-muted-foreground">in this tenant</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Projects</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{projectCount}</div>
            <p className="text-xs text-muted-foreground">tenant-wide</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>What this view is for</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            As superadmin (presales manager) you set the standards the team's deliverables follow:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Templates</strong> — upload sample BOMs / Assessments / Proposals etc. that match your firm's house style. The agent uses them as gold-standard references when generating new deliverables. Filterable per cloud + project type so the right template applies in the right context.</li>
            <li><strong>Usage</strong> — every LLM call (extraction, generation, training feedback) is logged with input + output tokens, model, duration, and outcome. Use this to track AI spend, spot stuck flows, and benchmark per-deliverable cost.</li>
            <li><strong>Users</strong> — multi-user pilot in a future phase. For now, the first user to sign up auto-becomes superadmin.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
