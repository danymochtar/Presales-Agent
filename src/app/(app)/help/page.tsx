import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  DELIVERABLE_PREREQS,
  DELIVERABLES_IN_LIFECYCLE_ORDER,
  GROUP_LABELS,
  NEED_LABELS,
  type Group,
  type DeliverableKind,
} from "@/lib/deliverable-prereqs";

export const metadata = { title: "Guide · Noventiq Multicloud Agent" };

const NEED_ORDER: (keyof typeof NEED_LABELS)[] = [
  "customer", "scope", "inventory", "clouds", "regions", "purchaseModel", "onPremBaseline",
];

export default function HelpPage() {
  const grouped: Record<Group, DeliverableKind[]> = { discover: [], design: [], commercial: [], delivery: [] };
  for (const k of DELIVERABLES_IN_LIFECYCLE_ORDER) grouped[DELIVERABLE_PREREQS[k].group].push(k);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">How to use</h1>
        <p className="text-sm text-muted-foreground">
          Quick reference so you don&apos;t get stuck. Skim once, come back when you need a refresher.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Where to start</CardTitle>
          <CardDescription>Two entry points on the dashboard. Pick whichever matches your ask.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="rounded-md border p-3 space-y-2">
            <div className="font-medium">Create a new engagement</div>
            <p className="text-muted-foreground">
              Two steps. <strong className="text-foreground">Step 1</strong> — drop the customer documents you have
              (RFP, RVTools, Azure Migrate, meeting notes). The agent extracts customer + scope + cloud + segment
              + compliance posture and creates the engagement. <strong className="text-foreground">Step 2</strong>
              — open the engagement at any time to generate a single deliverable (BOM only, SOW only, etc.) or the
              full guided pipeline. Generate one now, more later.
            </p>
            <p className="text-xs"><strong>Use when:</strong> any new customer opportunity — single document or end-to-end.</p>
            <Link href="/engagements/new" className="inline-block text-xs underline">→ /engagements/new</Link>
          </div>
          <p className="text-xs text-muted-foreground">
            The engagement auto-links to a row in the <Link href="/pipeline" className="underline">Pipeline tracker</Link> by
            customer name and reuses reference docs uploaded to the <Link href="/library" className="underline">Reference library</Link>,
            so you don&apos;t re-upload material the agent already has.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Step-by-step: Full engagement</CardTitle></CardHeader>
        <CardContent>
          <ol className="text-sm space-y-2 list-decimal pl-5">
            <li>From the dashboard click <strong>Start a new engagement</strong>.</li>
            <li>Upload your files (xlsx, docx, pdf, csv, txt — multiple files OK, 10MB per file).</li>
            <li>Click <strong>Extract engagement details</strong>. The agent reads each file and proposes: customer, industry, target cloud, region, engagement type, and a recommended deliverable flow.</li>
            <li>Review the form. Yellow / red chips next to a field mean the agent isn&apos;t confident — verify those manually. Pick target clouds + regions + purchase model.</li>
            <li>Click <strong>Create engagement</strong>. You land on the engagement detail page.</li>
            <li>From there, click <strong>Generate all recommended deliverables</strong> to run the guided pipeline end-to-end, or click an individual card to generate one at a time.</li>
            <li>The dashboard <strong>Next actions</strong> rail surfaces the first unchecked MCEM exit-criterion across every open engagement — click any row to jump to the right page.</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What does each deliverable need?</CardTitle>
          <CardDescription>
            Used by the engagement wizard + per-deliverable cards to know what to ask for.
            This table is rendered straight from the catalog so it stays in sync with the code.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
            <table className="w-full text-xs min-w-[720px]">
              <thead className="text-muted-foreground">
                <tr className="border-b text-left">
                  <th className="py-2 pr-3">Deliverable</th>
                  <th className="pr-3">Group</th>
                  {NEED_ORDER.map((n) => (
                    <th key={n} className="pr-3 whitespace-nowrap">{NEED_LABELS[n]}</th>
                  ))}
                  <th>Best with</th>
                </tr>
              </thead>
              <tbody>
                {DELIVERABLES_IN_LIFECYCLE_ORDER.map((k) => {
                  const p = DELIVERABLE_PREREQS[k];
                  return (
                    <tr key={k} className="border-b last:border-0 align-top">
                      <td className="py-2 pr-3 font-medium whitespace-nowrap">{p.label}</td>
                      <td className="pr-3 text-muted-foreground">{GROUP_LABELS[p.group]}</td>
                      {NEED_ORDER.map((n) => (
                        <td key={n} className="pr-3 text-center">{p.needs[n] ? "✓" : ""}</td>
                      ))}
                      <td className="text-muted-foreground">
                        {p.recommendedUpstream.length > 0
                          ? p.recommendedUpstream.map((u) => DELIVERABLE_PREREQS[u].label).join(", ")
                          : "—"}
                        {p.hardUpstream.length > 0 && (
                          <span className="block text-amber-700 dark:text-amber-400 mt-0.5">
                            Hard prereq: {p.hardUpstream.map((u) => DELIVERABLE_PREREQS[u].label).join(" + ")}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Before you start (superadmin)</CardTitle>
          <CardDescription>The agent produces better output when these are configured.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="text-sm space-y-1.5 list-disc pl-5">
            <li><Link href="/settings/rate-card" className="underline">Rate card</Link> — daily rates per role / level / location. Used for mandays in BOM, project plan, SOW.</li>
            <li><Link href="/settings/service-catalog" className="underline">Service catalog</Link> — default mandays per service. Keeps estimates consistent across projects.</li>
            <li><Link href="/admin/templates" className="underline">Templates</Link> (admin) — upload sample BOM / Proposal / Architecture / SOW. The agent mirrors the structure and voice.</li>
            <li><Link href="/admin/users" className="underline">Users</Link> (admin) — promote the presales head to superadmin so they can manage templates and monitor cost.</li>
            <li><Link href="/admin/usage" className="underline">Usage</Link> (admin) — monitor token usage and estimated AI cost per purpose / per user.</li>
            <li><Link href="/settings/patterns" className="underline">Custom rules</Link> — house-style rules the agent picked up during training mode (originally called &quot;Learned patterns&quot;).</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">MCEM at a glance</CardTitle>
          <CardDescription>
            Every open engagement is tracked against the Microsoft Customer Engagement Methodology — five phases from
            first meeting to long-term value. The agent surfaces the current phase&apos;s exit criteria on each
            engagement and the dashboard&apos;s <strong>Next actions</strong> rail.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="text-sm space-y-1.5 list-decimal pl-5">
            <li><strong>Listen &amp; Consult</strong> — research the customer, identify pain, map stakeholders, flag compliance, register the opportunity. Exits when the opportunity is qualified.</li>
            <li><strong>Inspire &amp; Design</strong> — confirm Solution Play, sketch architecture, pick landing-zone archetype, share commercial range. Exits when the customer is aligned to a solution + business case.</li>
            <li><strong>Empower &amp; Achieve</strong> — POC / pilot, references, formal proposal, BOM sign-off, SOW, terms. Exits when the customer agreement is signed.</li>
            <li><strong>Realize Value</strong> — project plan, SA + CSM engaged, kickoff, KPI plan, risk log. Exits when the customer is live with metrics in place.</li>
            <li><strong>Manage &amp; Optimize</strong> — solution health, CSAT/NPS, rightsizing, expansion. Cyclical — feeds back into Phase 1.</li>
          </ol>
          <p className="text-xs text-muted-foreground mt-3">
            Funnel stages (prospecting → qualifying → discovery → proposed → negotiating → closed-won / closed-lost)
            map onto the five MCEM phases automatically. Open the <strong>MCEM stage check</strong> card on any
            engagement to tick exit criteria as you complete them.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Grounded in <a href="https://learn.microsoft.com/partner-center/referrals/mcem-for-partners" className="underline" target="_blank" rel="noreferrer">learn.microsoft.com/partner-center/referrals/mcem-for-partners</a>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Tips</CardTitle></CardHeader>
        <CardContent>
          <ul className="text-sm space-y-1.5 list-disc pl-5">
            <li><strong>Compare mode:</strong> tick 2+ clouds when creating a project. BOM / Architecture / Proposal are produced side-by-side and the proposal ends with a recommended cloud.</li>
            <li><strong>Purchase model:</strong> applied to every cloud in a project (PAYG / Reserved 1y / Reserved 3y / Savings Plan 1y / Savings Plan 3y) so compare-mode totals are fair.</li>
            <li><strong>Migration strategy:</strong> lift-and-shift keeps every workload IaaS; hybrid swaps databases / caches / file shares to PaaS; modernization moves everything possible to PaaS. Non-modernizable workloads (AD DCs, container hosts, Oracle on Azure without contracted licensing) stay IaaS regardless. The BOM auto-detects DB / web / cache / file / AD components from VM names + OS hints and surfaces the PaaS target per cloud.</li>
            <li><strong>Landing zone picker</strong> (after assessment): open the &quot;Landing zone&quot; card on the engagement to pick components. Three archetypes stack on top of each other: <em>Infrastructure</em> (hub-spoke / identity / security / ops — required for every cloud project), <em>Application platform</em> (AKS / App Service / EKS / Cloud Run for modernization), <em>Data + AI</em> (Fabric + Foundry on Azure, Lake Formation + SageMaker + Bedrock on AWS, BigQuery + Vertex AI on GCP). Recommendations are grounded in Azure CAF, AWS Landing Zone Accelerator, and GCP Cloud Foundation. Required components are pre-checked; optional ones are pre-checked when they pair with detected inventory (e.g. App Gateway WAF only when a web tier is uploaded).</li>
            <li><strong>Training mode:</strong> on the engagement detail page, switch to <em>training</em>. After generating and giving feedback, the agent extracts rules into <Link href="/settings/patterns" className="underline">Custom rules</Link>, which then auto-apply to production engagements.</li>
            <li><strong>Default region:</strong> Malaysia West (Azure) + ap-southeast-5 (AWS). The dropdown lists the full SEA + APAC + US/EU catalog.</li>
            <li><strong>Assessment opens with customer background:</strong> the Executive Summary now does the industry + IT-landscape research that the old standalone Customer Study used to produce. Upload an RFP / notes / public profile and the agent stitches that into Section 1 before scoring readiness. The Proposal reuses the same background when an Assessment is present, or does its own research when running standalone.</li>
            <li><strong>Start small, grow later:</strong> an engagement doesn&apos;t need every deliverable on day one. Create it with whatever data you have, generate one document now, add more uploads + deliverables later. The engagement detail page lets you generate any single card on demand.</li>
            <li><strong>Stuck on naming?</strong> <Link href="/services" className="underline">Services mapping</Link> lists Azure / AWS / GCP equivalents side-by-side across compute, storage, network, database, security, AI, analytics, and more — with explicit gaps where a cloud has no first-party offering.</li>
            <li><strong>Funding programs (Azure Accelerate / AWS MAP / GCP RaMP)</strong> are encoded in <code>src/lib/funding/programs.ts</code>. Once an engagement has a BOM, the engagement detail page shows the top eligible payout as a green chip and the proposal includes a Funding capture section. Refresh the catalog quarterly when MCI / MAP / RaMP terms change.</li>
            <li><strong><Link href="/business" className="underline">Business dashboard:</Link></strong> the lead view. Set targets at <Link href="/business/targets" className="underline">/business/targets</Link> per fiscal year, per period (full year / Q1-Q4 / monthly), per cloud (Azure / AWS / GCP / Services / Cross-cloud), per product line (free text), per segment (SMB / SMC / ENT / PS), and per owner. The dashboard rolls up actuals from pipeline opportunities (committed + won, filtered by cloud via vendor name, scoped by period via close date, narrowed to owner via opportunity assignments) and shows attainment % with green / amber / red bands. Add or delete a target row to add or delete a slice — no rigid schema.</li>
            <li><strong><Link href="/team" className="underline">Team page:</Link></strong> define the people working the pipeline — Solution Architects, Solution Sales, Account Managers, partner sellers, CSMs, business leads. Each opportunity in the pipeline table has a Team column with chips per assigned person + role (SA / SS / AM / PS / CSM). Multiple SAs + multiple Sales + multiple AMs per deal supported; one person can act in different roles across deals. The Business dashboard&apos;s &quot;Per-owner&quot; rollup shows the total committed + won USD each team member is on, so you can see who&apos;s carrying which accounts.</li>
            <li><strong><Link href="/pipeline" className="underline">Pipeline tracker — mark, track, plan:</Link></strong> consolidates every source tracker (Microsoft biweekly, SMB / SMC / ENT-PS, sales-rep pipes, funding programs) into one view. <strong className="text-foreground">Mark:</strong> tag each opportunity by origin — <em>Carry-over</em> (last FY rollovers), <em>FY target</em> (new fiscal-year targets), <em>Existing customer</em> (renewals / expansion / cross-sell), <em>Net-new</em> (fresh prospects). Set a default origin per tracker so a "FY26 carry-over" Excel tags all its rows automatically. <strong className="text-foreground">Track:</strong> the consolidated KPI strip rolls up Committed / Upside / At Risk + closing-this-month / quarter; the by-origin plan view shows USD totals per bucket so you can see where the FY target gap is. Use the quick-note column to record follow-up notes — typing &quot;at risk&quot;, &quot;won&quot;, &quot;lost&quot;, &quot;upside&quot;, &quot;follow up&quot; or &quot;pending consent&quot; in the note auto-flips the row&apos;s status. <strong className="text-foreground">Plan:</strong> export back to Excel any time to hand to finance or your boss; engagement activity (creation + MCEM ticks) flows back into the matched opportunity&apos;s notes automatically.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Troubleshooting</CardTitle></CardHeader>
        <CardContent>
          <ul className="text-sm space-y-1.5 list-disc pl-5">
            <li><strong>&ldquo;no workloads&rdquo;</strong> when generating BOM / Assessment / TCO: upload an inventory first (RVTools .xlsx, or a CSV with CPU + RAM + disk + OS columns). If parsing misses anything, click <em>extract workloads</em> in the Inputs section — the agent will try to extract them from the document text.</li>
            <li><strong>&ldquo;Stream interrupted&rdquo;</strong> mid-generation: the Vercel function timed out at 60s. Click Generate again — the prompt cache hits on retry so the rerun is fast.</li>
            <li><strong>SOW needs a BOM first:</strong> server-enforced. Generate the BOM for the target cloud on the engagement page before kicking off the SOW.</li>
            <li><strong>&ldquo;Load failed&rdquo; (iOS Safari):</strong> a network blip during streaming. Retry. If it keeps happening, generate from the Workflow pipeline button — it&apos;s more tolerant of reconnects.</li>
            <li><strong>Output truncated:</strong> reduce scope (one cloud at a time, or split deliverables instead of compare mode).</li>
            <li><strong>RVTools warning on upload:</strong> the file chip shows &quot;Unknown collector&quot; if the <code>vMetaData</code> sheet is missing or the version predates the May 2025 supply-chain advisory. Re-export with the official Dell-hosted RVTools (robware.net / rvtools.com) and try again.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
