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
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border p-3 space-y-2">
            <div className="font-medium">A. Full project</div>
            <p className="text-muted-foreground">
              Upload every customer document you have (RFP, RVTools, Azure Migrate, meeting notes).
              The agent classifies the engagement type, recommends a deliverable flow, then runs the
              pipeline end-to-end.
            </p>
            <p className="text-xs"><strong>Use when:</strong> working a real deal from Discover through SOW.</p>
            <Link href="/projects/new" className="inline-block text-xs underline">→ /projects/new</Link>
          </div>
          <div className="rounded-md border p-3 space-y-2">
            <div className="font-medium">B. Quick generate</div>
            <p className="text-muted-foreground">
              Pick ONE deliverable (BOM only, SOW only, etc.). Supply just its prerequisites and get the
              document. Creates a &ldquo;Quick: …&rdquo; project in your list for the audit trail.
            </p>
            <p className="text-xs"><strong>Use when:</strong> you only need one document, want to test an output format, or are turning an existing scope into a quick proposal.</p>
            <Link href="/quick" className="inline-block text-xs underline">→ /quick</Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Step-by-step: Full project</CardTitle></CardHeader>
        <CardContent>
          <ol className="text-sm space-y-2 list-decimal pl-5">
            <li>From the dashboard click <strong>Start a new engagement</strong>.</li>
            <li>Upload your files (xlsx, docx, pdf, csv, txt — multiple files OK, 10MB per file).</li>
            <li>Click <strong>Extract project details</strong>. The agent reads each file and proposes: customer, industry, target cloud, region, project type, and a recommended deliverable flow.</li>
            <li>Review the form. Yellow / red chips next to a field mean the agent isn&apos;t confident — verify those manually. Pick target clouds + regions + purchase model.</li>
            <li>Click <strong>Create project</strong>. You land on the project detail page.</li>
            <li>From there, click <strong>Run pipeline</strong> to generate every recommended deliverable, or click an individual card to generate one at a time.</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Step-by-step: Quick generate</CardTitle></CardHeader>
        <CardContent>
          <ol className="text-sm space-y-2 list-decimal pl-5">
            <li>From the dashboard click <strong>Quick generate one document</strong>.</li>
            <li>Pick a deliverable from the grid — each card shows &ldquo;Needs: …&rdquo;.</li>
            <li>The form renders only the fields that deliverable actually needs (customer, scope, inventory upload, cloud, region, purchase model, on-prem baseline — depending on selection).</li>
            <li>Click <strong>Generate</strong>. Output streams in real time and you&apos;re redirected to the deliverable page when it finishes.</li>
            <li>A &ldquo;Quick: …&rdquo; project appears in the Projects list. You can promote it into a full project later by uploading more documents and generating additional deliverables.</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What does each deliverable need?</CardTitle>
          <CardDescription>
            Used by both the Quick wizard and the Full pipeline to know what to ask for.
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
            <li><Link href="/settings/patterns" className="underline">Learned patterns</Link> — rules the agent picked up during training mode.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Tips</CardTitle></CardHeader>
        <CardContent>
          <ul className="text-sm space-y-1.5 list-disc pl-5">
            <li><strong>Compare mode:</strong> tick 2+ clouds when creating a project. BOM / Architecture / Proposal are produced side-by-side and the proposal ends with a recommended cloud.</li>
            <li><strong>Purchase model:</strong> applied to every cloud in a project (PAYG / Reserved 1y / Reserved 3y / Savings Plan 1y / Savings Plan 3y) so compare-mode totals are fair.</li>
            <li><strong>Training mode:</strong> on the project detail page, switch to <em>training</em>. After generating and giving feedback, the agent extracts patterns into Learned patterns, which then auto-apply to production projects.</li>
            <li><strong>Default region:</strong> Malaysia West (Azure) + ap-southeast-5 (AWS). The dropdown lists the full SEA + APAC + US/EU catalog.</li>
            <li><strong>Run Customer Study first:</strong> downstream deliverables are more contextual when there&apos;s a fresh customer profile + IT landscape to reference.</li>
            <li><strong>Quick projects can be promoted:</strong> add more uploads or generate more deliverables on the same project to turn it into a full engagement — no need to start over.</li>
            <li><strong>Stuck on naming?</strong> The <Link href="/services" className="underline">Services</Link> page lists Azure / AWS / GCP equivalents side-by-side across compute, storage, network, database, security, AI, analytics, and more.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Troubleshooting</CardTitle></CardHeader>
        <CardContent>
          <ul className="text-sm space-y-1.5 list-disc pl-5">
            <li><strong>&ldquo;no workloads&rdquo;</strong> when generating BOM / Assessment / TCO: upload an inventory first (RVTools .xlsx, or a CSV with CPU + RAM + disk + OS columns). If parsing misses anything, click <em>extract workloads</em> in the Inputs section — the agent will try to extract them from the document text.</li>
            <li><strong>&ldquo;Stream interrupted&rdquo;</strong> mid-generation: the Vercel function timed out at 60s. Click Generate again — the prompt cache hits on retry so the rerun is fast.</li>
            <li><strong>SOW needs a BOM first:</strong> server-enforced. Quick generate handles this for you (it pipelines BOM → SOW). If you&apos;re using the Full pipeline, generate the BOM for the same cloud first.</li>
            <li><strong>&ldquo;Load failed&rdquo; (iOS Safari):</strong> a network blip during streaming. Retry. If it keeps happening, generate from the Workflow pipeline button — it&apos;s more tolerant of reconnects.</li>
            <li><strong>Output truncated:</strong> reduce scope (one cloud at a time, or split deliverables instead of compare mode).</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
