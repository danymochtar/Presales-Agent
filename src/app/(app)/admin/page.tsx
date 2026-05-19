import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSuperadminContextForPage } from "@/lib/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetWorkspaceButton } from "@/components/reset-workspace-button";
import { CreatioIntegrationCard } from "@/components/creatio-integration-card";
import { GcpIntegrationCard } from "@/components/gcp-integration-card";
import type { CreatioCredentials } from "@/lib/integrations/creatio";

export default async function AdminOverviewPage() {
  const ctx = (await getSuperadminContextForPage())!;
  const integrations = (ctx.tenant.integrations ?? {}) as {
    creatio?: CreatioCredentials;
    gcp?: { apiKey?: string; useLivePricing?: boolean };
  };
  const creatioInitial = integrations.creatio
    ? {
        baseUrl: integrations.creatio.baseUrl,
        username: integrations.creatio.username,
        passwordSet: !!integrations.creatio.password,
        lastSyncAt: integrations.creatio.lastSyncAt ?? null,
      }
    : null;
  const gcpInitial = integrations.gcp
    ? {
        apiKeySet: !!integrations.gcp.apiKey,
        useLivePricing: integrations.gcp.useLivePricing ?? true,
      }
    : null;
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
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">Admin</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Superadmin tools — Reference library templates, LLM usage + cost, users, the Creatio CRM connector, and a
          Danger-zone reset for wiping pilot data. Most day-to-day configuration (branding, vocabulary, thresholds,
          rate card, service catalog) lives on <code>/settings</code> for any tenant user.
        </p>
      </div>
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

      <Card>
        <CardHeader>
          <CardTitle>CRM connector — Creatio</CardTitle>
          <CardDescription>
            Pull opportunities from your Creatio CRM straight into the pipeline tracker. The connector runs
            cookie-based forms auth against <code>/ServiceModel/AuthService.svc/Login</code> then OData v4 against
            <code>/0/odata/Opportunity</code>. Each sync upserts by Creatio Id so re-running is safe. Created
            opportunities land in a tracker named &quot;Creatio CRM&quot; tagged as a CRM sync — they can be re-tagged
            by origin (carry-over / target / etc.) like any imported row.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreatioIntegrationCard initial={creatioInitial} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cloud pricing — GCP (Cloud Billing Catalog API)</CardTitle>
          <CardDescription>
            Connect a Google Cloud project to pull live Compute Engine list prices for GCP BOMs. Without a key,
            GCP BOM generation returns a 412 with a setup hint. The integration uses the public Cloud Billing
            Catalog API — vCPU and RAM are priced as separate SKUs, so the agent fetches both per region and
            multiplies by the recommended machine type&apos;s shape. Cached in-process for 24h to avoid hammering
            the catalog. Setup: <code>console.cloud.google.com</code> → APIs &amp; Services → Library → enable
            <em> Cloud Billing API</em> → Credentials → Create API key → Restrict key → API restrictions →
            select <em>Cloud Billing API</em> only. Paste the key below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GcpIntegrationCard initial={gcpInitial} />
        </CardContent>
      </Card>

      <Card className="border-rose-300/60 dark:border-rose-900/40">
        <CardHeader>
          <CardTitle className="text-rose-900 dark:text-rose-200">Danger zone</CardTitle>
          <CardDescription>
            One-click full reset of this tenant&apos;s workspace data. Use when you want to wipe a pilot or
            demo and start fresh — engagements, deliverables, pipeline opportunities, trackers, templates,
            custom rules, LLM call logs, rate-card and service-catalog rows all go. Tenant config, your
            user, and sign-in sessions stay intact.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResetWorkspaceButton />
        </CardContent>
      </Card>
    </div>
  );
}
