import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FiscalYearSetupForm } from "@/components/fiscal-year-setup-form";
import { isFiscalYearConfig, type FiscalYearConfig } from "@/lib/fiscal-year";

// Two required steps:
//   1. Define the fiscal year
//   2. Connect at least one pipeline source (so the customer list isn't empty)
// Both must be done before the dashboard becomes reachable. The layout gate
// redirects every other route to /setup until both are true.

export default async function SetupPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const { user, tenant } = await requireSessionAndTenant(session.user.id);

  const fy: FiscalYearConfig | null = isFiscalYearConfig(tenant.fiscalYear) ? tenant.fiscalYear : null;
  const trackerCount = await prisma.tracker.count({ where: { tenantId: tenant.id } });
  const opportunityCount = await prisma.opportunity.count({ where: { tracker: { tenantId: tenant.id } } });

  const fyDone = !!fy;
  const pipelineDone = trackerCount > 0;
  const allDone = fyDone && pipelineDone;

  // If we landed on /setup after everything's defined (e.g. user navigated
  // here directly), drop them on the dashboard so this page isn't sticky.
  if (allDone) redirect("/dashboard");

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <p className="text-xs uppercase tracking-wider text-primary font-semibold">First-time setup</p>
        <h1 className="text-2xl md:text-3xl font-semibold mt-1">Two things before the dashboard opens.</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Welcome{user.name ? `, ${user.name.split(" ")[0]}` : ""}. The workspace needs two facts to anchor every
          KPI, forecast, and plan view. Set them once — you can always edit later from <Link href="/settings" className="underline">Settings</Link>.
        </p>
      </div>

      {/* Step 1 — Fiscal year */}
      <Card className={fyDone ? "border-emerald-300 bg-emerald-50/40 dark:bg-emerald-900/10" : "border-primary"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${fyDone ? "bg-emerald-600 text-white" : "bg-primary text-primary-foreground"}`}>
              {fyDone ? "✓" : "1"}
            </span>
            Define your fiscal year
          </CardTitle>
          <CardDescription>
            Pick when your fiscal year starts + ends and the label you call the current one. Used to scope every
            &quot;this quarter&quot;, &quot;closing this FY&quot;, and &quot;target&quot; pivot on the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FiscalYearSetupForm initial={fy} />
        </CardContent>
      </Card>

      {/* Step 2 — Pipeline */}
      <Card className={pipelineDone ? "border-emerald-300 bg-emerald-50/40 dark:bg-emerald-900/10" : !fyDone ? "opacity-60" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${pipelineDone ? "bg-emerald-600 text-white" : fyDone ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {pipelineDone ? "✓" : "2"}
            </span>
            Upload your foundation pipelines — previous FY + future targets
          </CardTitle>
          <CardDescription>
            Two foundational uploads teach the agent your book of business. You can add more pipe docs later;
            these two are the minimum.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-md border bg-amber-50/40 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/40 p-3 space-y-1">
              <p className="text-sm font-medium">📜 Previous FY pipeline (to learn from)</p>
              <p className="text-xs text-muted-foreground">
                Closed deals from prior fiscal years. The agent learns sales-cycle length, average deal size by
                segment + industry, win-rate patterns, and which Solution Plays close fastest — so it can suggest
                better lead-and-opportunity moves going forward.
              </p>
            </div>
            <div className="rounded-md border bg-indigo-50/40 dark:bg-indigo-900/10 border-indigo-200 dark:border-indigo-900/40 p-3 space-y-1">
              <p className="text-sm font-medium">🎯 Future-target pipeline (to plan against)</p>
              <p className="text-xs text-muted-foreground">
                Named accounts the team is chasing this fiscal year. Drives the FY-target slice on the Business
                dashboard and the customer picker on new engagements — so you never start from a blank field.
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Each upload is tagged with a purpose. Add as many pipe docs as you have — Microsoft biweekly, SMB / SMC
            / ENT-PS segment lists, sales-rep pipes, funding programs (Azure Accelerate / MAP / RaMP). Commitment
            status is one of: <strong>Committed</strong>, <strong>Upside</strong>, <strong>Uncommitted</strong>,
            <strong>At Risk</strong>, plus closed <strong>Won</strong> / <strong>Lost</strong>. If you run Creatio
            CRM, configure the connector on <Link href="/admin" className="underline">/admin</Link> instead of
            uploading manually.
          </p>
          {pipelineDone && (
            <p className="text-sm">
              <strong>{trackerCount}</strong> tracker{trackerCount === 1 ? "" : "s"} loaded · {opportunityCount} opportunit{opportunityCount === 1 ? "y" : "ies"}.
            </p>
          )}
          <div className="flex gap-2">
            <Button asChild disabled={!fyDone}>
              <Link href="/pipeline/trackers/new">{pipelineDone ? "Add another tracker" : "Upload a pipeline"}</Link>
            </Button>
            <Button asChild variant="outline" disabled={!fyDone}>
              <Link href="/admin">Connect Creatio instead</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Continue */}
      <div className="flex items-center justify-between pt-2 border-t">
        <p className="text-xs text-muted-foreground">
          {allDone
            ? "All set — heading to the dashboard."
            : `${fyDone ? 1 : 0} + ${pipelineDone ? 1 : 0} of 2 done.`}
        </p>
        <Button asChild disabled={!allDone}>
          <Link href="/dashboard">Continue to dashboard →</Link>
        </Button>
      </div>
    </div>
  );
}
