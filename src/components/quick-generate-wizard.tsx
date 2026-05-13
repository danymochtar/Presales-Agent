"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  DELIVERABLE_PREREQS,
  DELIVERABLES_IN_LIFECYCLE_ORDER,
  GROUP_LABELS,
  NEED_LABELS,
  type DeliverableKind,
  type Group,
} from "@/lib/deliverable-prereqs";
import { MARKET_DEFAULT_REGIONS } from "@/lib/pricing/regions";
import { type Term, type CloudType } from "@/lib/pricing/types";
import { useFileParser } from "@/lib/use-file-parser";
import { streamGenerate } from "@/lib/sse-stream";
import { CloudTogglePicker, RegionPickerPerCloud, PurchaseModelPicker } from "@/components/cloud-region-pickers";
import { SolutionAreaSuggester } from "@/components/solution-area-suggester";
import { MIGRATION_STRATEGY_LABELS, type MigrationStrategy } from "@/lib/inventory/paas-recommender";
import { SOLUTION_AREA_LABELS, type SolutionArea } from "@/lib/inventory/solution-area";
import { WorkloadReview } from "@/components/workload-review";
import { assessCompleteness, mergeWorkloadSets } from "@/lib/inventory/completeness";
import { summarize, type WorkloadSet } from "@/lib/inventory/workload";

type Step = "pick" | "fill" | "review" | "summary" | "running";

export function QuickGenerateWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("pick");
  const [kind, setKind] = useState<DeliverableKind | null>(null);

  const [customer, setCustomer] = useState("");
  const [industry, setIndustry] = useState("");
  const [scope, setScope] = useState("");
  const { parsedFiles, uploading, err: parseErr, uploadFiles, removeFile, setErr: setParseErr } = useFileParser();
  const [targetClouds, setTargetClouds] = useState<CloudType[]>(["azure"]);
  const [cloudRegions, setCloudRegions] = useState<Record<string, { primary: string; dr: string }>>({
    azure: { ...MARKET_DEFAULT_REGIONS.azure },
  });
  const [purchaseModel, setPurchaseModel] = useState<Term>("consumption");
  const [migrationStrategy, setMigrationStrategy] = useState<MigrationStrategy>("lift_and_shift");
  const [solutionArea, setSolutionArea] = useState<SolutionArea | null>(null);
  const [onPremBaseline, setOnPremBaseline] = useState("");

  // Edited workload set from the review step. When null, fall back to whatever
  // parsedFiles produced. Set on transition from "fill" → "review".
  const [reviewedWorkloads, setReviewedWorkloads] = useState<WorkloadSet | null>(null);

  const [runText, setRunText] = useState("");
  const [runErr, setRunErr] = useState<string | null>(null);
  const err = runErr ?? parseErr;
  const setErr = (v: string | null) => { setParseErr(v); setRunErr(v); };

  const prereqs = kind ? DELIVERABLE_PREREQS[kind] : null;

  // Hard upstream chain: SOW needs BOM, etc. Quick generates them first
  // sequentially in the same project. The form merges every step's needs
  // so the user supplies prereqs in one go.
  const stagesToRun: DeliverableKind[] = useMemo(() => (
    kind ? [...DELIVERABLE_PREREQS[kind].hardUpstream, kind] : []
  ), [kind]);

  const combinedNeeds = useMemo(() => {
    const merged = { customer: false, scope: false, inventory: false, clouds: false, regions: false, purchaseModel: false, onPremBaseline: false };
    for (const s of stagesToRun) {
      const n = DELIVERABLE_PREREQS[s].needs;
      (Object.keys(merged) as (keyof typeof merged)[]).forEach((k) => { if (n[k]) merged[k] = true; });
    }
    return merged;
  }, [stagesToRun]);

  // A field is required only if every stage that needs it lists it as
  // required (not in optionalFields). Single-stage Quick flows are the
  // common case — a field is optional iff that stage marks it optional.
  const isOptional = (k: keyof typeof combinedNeeds): boolean => stagesToRun.every((s) => {
    const p = DELIVERABLE_PREREQS[s];
    return !p.needs[k] || (p.optionalFields ?? []).includes(k);
  });

  const grouped = useMemo(() => {
    const out: Record<Group, DeliverableKind[]> = { discover: [], design: [], commercial: [], delivery: [] };
    for (const k of DELIVERABLES_IN_LIFECYCLE_ORDER) out[DELIVERABLE_PREREQS[k].group].push(k);
    return out;
  }, []);

  function pick(k: DeliverableKind) {
    setKind(k);
    setErr(null);
    setStep("fill");
  }

  function toggleCloud(id: CloudType) {
    setTargetClouds((cs) => {
      if (cs.includes(id)) return cs.length === 1 ? cs : cs.filter((c) => c !== id);
      return [...cs, id];
    });
    setCloudRegions((r) => {
      if (r[id]) {
        if (Object.keys(r).length === 1) return r;
        const next = { ...r };
        delete next[id];
        return next;
      }
      return { ...r, [id]: { ...MARKET_DEFAULT_REGIONS[id] } };
    });
  }

  function setRegion(c: CloudType, k: "primary" | "dr", v: string) {
    setCloudRegions((r) => ({ ...r, [c]: { ...r[c], [k]: v } }));
  }

  // Merge every parsed file's workloads into a single set so the review step
  // has the full picture (and the project create call gets one canonical input).
  const parsedWorkloadSet: WorkloadSet | null = useMemo(() => {
    const sets = parsedFiles.map((f) => f.workloads).filter((w): w is WorkloadSet => !!w && w.workloads.length > 0);
    if (sets.length === 0) return null;
    return sets.reduce((acc, s) => (acc ? mergeWorkloadSets(acc, s) : s), null as WorkloadSet | null);
  }, [parsedFiles]);

  const effectiveWorkloads = reviewedWorkloads ?? parsedWorkloadSet;

  function validate(): string | null {
    if (!kind || !prereqs) return "pick a deliverable first";
    if (combinedNeeds.customer && !isOptional("customer") && !customer.trim()) return "customer is required";
    if (combinedNeeds.scope && !isOptional("scope") && !scope.trim()) return "scope summary is required";
    // Inventory deliverables no longer hard-block when workloads are empty —
    // the mapping review step is the canonical place to fix that (AI extract,
    // add manually, or upload more). Any file format is accepted.
    if (combinedNeeds.clouds && !isOptional("clouds") && targetClouds.length === 0) return "pick at least one target cloud";
    return null;
  }

  function handleGenerateClick() {
    const v = validate();
    if (v) { setErr(v); return; }
    setErr(null);
    // Inventory-needing deliverables always route through mapping review.
    // It handles every case: AI extraction from text, manual entry, fixing
    // gaps, merging another upload. The summary step renders after Continue.
    if (combinedNeeds.inventory) {
      const seed: WorkloadSet = effectiveWorkloads ?? { source: "manual", workloads: [], totals: summarize([]) };
      if (!reviewedWorkloads) setReviewedWorkloads(seed);
      setStep("review");
      return;
    }
    setStep("summary");
  }

  async function runGenerate(workloadsToUse: WorkloadSet | null) {
    if (!kind || !prereqs) return;
    setStep("running");
    setRunText("");
    setErr(null);

    try {
      const inputs = parsedFiles.map((f, idx) => ({
        kind: f.kind,
        filename: f.filename,
        rawSummary: f.rawSummary,
        textContent: f.textContent,
        // Replace the first file's workloadsJson with the reviewed set so the
        // generate route sees the user's edits. Other files keep their text.
        workloadsJson: idx === 0 && workloadsToUse ? workloadsToUse : f.workloads,
      }));
      // If the wizard had no files at all but the user manually added rows
      // in the review step, synthesize a single inventory input.
      if (inputs.length === 0 && workloadsToUse && workloadsToUse.workloads.length > 0) {
        inputs.push({
          kind: "rvtools",
          filename: "manual-inventory.json",
          rawSummary: `${workloadsToUse.totals.count} workloads · ${workloadsToUse.totals.cpu} vCPU · ${workloadsToUse.totals.ramGb} GB RAM · manually entered`,
          textContent: undefined,
          workloadsJson: workloadsToUse,
        });
      }
      const cloudsForProject: CloudType[] = combinedNeeds.clouds ? targetClouds : ["azure"];
      const regionsForProject = combinedNeeds.regions
        ? cloudRegions
        : { azure: { ...MARKET_DEFAULT_REGIONS.azure } };

      const customerForApi = customer.trim() || "(quick)";

      const createRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Quick: ${prereqs.label} · ${new Date().toLocaleDateString()}`,
          customer: customerForApi,
          industry: industry || undefined,
          scopeSummary: scope || onPremBaseline || undefined,
          targetClouds: cloudsForProject,
          cloudRegions: regionsForProject,
          purchaseModel,
          migrationStrategy,
          solutionArea: solutionArea ?? undefined,
          inputs: inputs.length > 0 ? inputs : undefined,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(typeof createData.error === "string" ? createData.error : "could not create project");
      const projectId = createData.project.id as string;

      const cloudQS: CloudType = cloudsForProject[0];
      for (let i = 0; i < stagesToRun.length; i++) {
        const stage = stagesToRun[i];
        const isLast = i === stagesToRun.length - 1;
        if (stagesToRun.length > 1) {
          setRunText((t) => t + (t ? "\n\n" : "") + `## Generating ${DELIVERABLE_PREREQS[stage].label}…\n\n`);
        }
        await streamGenerate(`/api/projects/${projectId}/${stage}/generate?cloud=${cloudQS}`, {
          onDelta: (d) => setRunText((t) => t + d),
          onDone: () => { if (isLast) router.push(`/projects/${projectId}/${kind}`); },
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "generate failed");
      setStep("fill");
    }
  }

  if (step === "pick") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pick a deliverable</CardTitle>
          <CardDescription>
            Each card lists what you need to supply. Pick the one closest to your ask — you can always start a full project later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(["discover", "design", "commercial", "delivery"] as const).map((g) => (
            <div key={g} className="space-y-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{GROUP_LABELS[g]}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {grouped[g].map((k) => {
                  const p = DELIVERABLE_PREREQS[k];
                  const needs = (Object.keys(NEED_LABELS) as (keyof typeof p.needs)[])
                    .filter((n) => p.needs[n])
                    .map((n) => NEED_LABELS[n]);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => pick(k)}
                      className="text-left rounded-md border p-3 hover:border-primary hover:bg-primary/5 transition"
                    >
                      <div className="font-medium text-sm">{p.label}</div>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.shortDesc}</p>
                      <div className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                        Needs: {needs.length > 0 ? needs.join(" · ") : "no inputs"}
                      </div>
                      {p.recommendedUpstream.length > 0 && (
                        <div className="mt-0.5 text-[10px] text-muted-foreground italic">
                          Best with: {p.recommendedUpstream.map((u) => DELIVERABLE_PREREQS[u].label).join(", ")}
                        </div>
                      )}
                      {p.hardUpstream.length > 0 && (
                        <div className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-400">
                          Generates a {p.hardUpstream.map((u) => DELIVERABLE_PREREQS[u].label).join(" + ")} first (required).
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!prereqs || !kind) return null;

  if (step === "review") {
    const seed: WorkloadSet = effectiveWorkloads ?? { source: "manual", workloads: [], totals: summarize([]) };
    const hasText = parsedFiles.some((f) => f.textContent && f.textContent.trim().length > 0);
    async function aiExtract(): Promise<{ set: WorkloadSet; warnings: string[] } | null> {
      const texts = parsedFiles
        .filter((f) => f.textContent && f.textContent.trim().length > 0)
        .map((f) => ({ filename: f.filename, content: f.textContent! }));
      if (texts.length === 0) return null;
      const res = await fetch("/api/inventory/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "extraction failed");
      return { set: j.workloads as WorkloadSet, warnings: (j.warnings as string[]) ?? [] };
    }
    return (
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base">Inventory mapping — {prereqs.label}</CardTitle>
              <CardDescription>
                Review parsed workloads, fill any gaps, or have the agent extract workloads from your uploaded
                text. Generation unlocks once every workload has at least CPU + RAM.
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setReviewedWorkloads(null); setStep("fill"); }}>
              ← Edit form
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <WorkloadReview
            initial={seed}
            deliverableLabel={prereqs.label}
            onBack={() => setStep("fill")}
            onContinue={(set) => { setReviewedWorkloads(set); setStep("summary"); }}
            onAiExtract={hasText ? aiExtract : undefined}
          />
        </CardContent>
      </Card>
    );
  }

  if (step === "summary") {
    const workloadCount = effectiveWorkloads?.totals.count ?? 0;
    const cloudList = combinedNeeds.clouds ? targetClouds : [];
    return (
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base">Ready to generate — review the inputs</CardTitle>
              <CardDescription>
                The agent will use exactly what&apos;s listed below. Go back to fix anything;
                otherwise click Generate to start streaming.
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setStep(combinedNeeds.inventory ? "review" : "fill")}>
              ← Back
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border p-3 space-y-1.5 text-sm">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Deliverable</div>
            <div className="font-medium">
              {stagesToRun.length > 1
                ? `${stagesToRun.map((s) => DELIVERABLE_PREREQS[s].label).join(" → ")} (pipeline)`
                : prereqs.label}
            </div>
            <div className="text-xs text-muted-foreground">{prereqs.shortDesc}</div>
          </div>

          <div className="rounded-md border p-3 space-y-2 text-sm">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Customer + scope</div>
            <div><strong>Customer:</strong> {customer.trim() || "—"}</div>
            {industry && <div><strong>Industry:</strong> {industry}</div>}
            {scope && <div className="whitespace-pre-wrap"><strong>Scope notes:</strong> {scope}</div>}
            {!industry && !scope && <div className="text-xs text-muted-foreground">No additional context supplied.</div>}
          </div>

          {combinedNeeds.clouds && (
            <div className="rounded-md border p-3 space-y-2 text-sm">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Cloud + commercial</div>
              <div><strong>Target clouds:</strong> {cloudList.length > 0 ? cloudList.join(" + ").toUpperCase() : "—"}</div>
              {combinedNeeds.regions && (
                <div className="text-xs">
                  {cloudList.map((c) => (
                    <div key={c}>
                      <strong>{c.toUpperCase()}:</strong> primary {cloudRegions[c]?.primary ?? "?"} · DR {cloudRegions[c]?.dr ?? "?"}
                    </div>
                  ))}
                </div>
              )}
              {combinedNeeds.purchaseModel && (
                <div><strong>Purchase model:</strong> {purchaseModel}</div>
              )}
              {combinedNeeds.inventory && solutionArea && (
                <div><strong>Solution area:</strong> {SOLUTION_AREA_LABELS[solutionArea]}</div>
              )}
              {combinedNeeds.inventory && (
                <div><strong>Migration strategy:</strong> {MIGRATION_STRATEGY_LABELS[migrationStrategy]}</div>
              )}
            </div>
          )}

          {(parsedFiles.length > 0 || workloadCount > 0) && (
            <div className="rounded-md border p-3 space-y-2 text-sm">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Documents + workloads</div>
              {parsedFiles.length > 0 && (
                <ul className="text-xs space-y-1">
                  {parsedFiles.map((f, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="bg-accent rounded px-1.5 py-0.5">{f.kind}</span>
                      <span className="truncate flex-1">{f.filename}</span>
                      <span className="text-muted-foreground">{f.rawSummary}</span>
                    </li>
                  ))}
                </ul>
              )}
              {workloadCount > 0 && effectiveWorkloads && (
                <div className="text-xs text-muted-foreground">
                  Workloads: {workloadCount} · {effectiveWorkloads.totals.cpu} vCPU · {effectiveWorkloads.totals.ramGb} GB RAM · {effectiveWorkloads.totals.storageGb} GB storage
                  {reviewedWorkloads && " (edited in mapping review)"}
                </div>
              )}
            </div>
          )}

          {prereqs.recommendedUpstream.length > 0 && (
            <p className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-3">
              <strong className="text-foreground">Quality reminder:</strong> {prereqs.label} is best with{" "}
              {prereqs.recommendedUpstream.map((u) => DELIVERABLE_PREREQS[u].label).join(" + ")}{" "}
              already produced. This Quick run draws only on what you supplied here.
            </p>
          )}

          {err && <p className="text-sm text-destructive">{err}</p>}

          <div className="flex justify-between items-center pt-2 border-t">
            <Button variant="ghost" onClick={() => setStep(combinedNeeds.inventory ? "review" : "fill")}>← Back</Button>
            <Button onClick={() => void runGenerate(effectiveWorkloads)}>
              {stagesToRun.length > 1
                ? `Generate ${stagesToRun.map((s) => DELIVERABLE_PREREQS[s].label).join(" + ")}`
                : `Generate ${prereqs.label.toLowerCase()}`}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">{prereqs.label}</CardTitle>
            <CardDescription>{prereqs.shortDesc}</CardDescription>
            {prereqs.hardUpstream.length > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1.5">
                Pipeline: {stagesToRun.map((s) => DELIVERABLE_PREREQS[s].label).join(" → ")}.
                The form below asks for the combined prerequisites of every stage.
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setKind(null); setStep("pick"); setErr(null); }}>
            ← Pick a different deliverable
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {combinedNeeds.customer && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="customer">
                Customer{!isOptional("customer") && <span className="text-destructive ml-0.5">*</span>}
              </Label>
              <Input id="customer" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="e.g. Acme Bank Berhad" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="industry">Industry</Label>
              <Input id="industry" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Banking, Retail, Gov, etc." />
            </div>
          </div>
        )}

        {combinedNeeds.scope && (
          <div className="space-y-1.5">
            <Label htmlFor="scope">
              Scope summary
              {!isOptional("scope") && <span className="text-destructive ml-0.5">*</span>}
            </Label>
            <textarea
              id="scope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="1-2 sentences on what this engagement is about."
            />
          </div>
        )}

        {!combinedNeeds.inventory && (
          <div className="space-y-2">
            <Label htmlFor="study-files">Attach supporting documents (optional)</Label>
            <p className="text-xs text-muted-foreground">
              {kind === "architecture"
                ? "Existing architecture diagrams, RFP, customer IT landscape descriptions, network topology notes — fed to the agent as context for the target-state design."
                : "RFP, scope notes, customer-provided requirements, prior deliverables to compose from — anything that can sharpen the output. The agent will research customer background + industry context from these when building the executive summary."}
              {" "}.xlsx, .docx, .pdf, .txt, .md, .csv. 10MB per file.
            </p>
            <input
              id="study-files"
              type="file"
              multiple
              accept=".xlsx,.xls,.docx,.pdf,.txt,.md,.csv"
              onChange={(e) => uploadFiles(e.target.files)}
              disabled={uploading}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-secondary/80"
            />
            {uploading && <p className="text-xs text-muted-foreground">Parsing…</p>}
            {parsedFiles.length > 0 && (
              <ul className="space-y-1 mt-1">
                {parsedFiles.map((f, i) => (
                  <li key={i} className="text-xs flex items-center gap-2 border rounded p-2">
                    <span className="bg-accent rounded px-1.5 py-0.5">{f.kind}</span>
                    <span className="font-medium truncate flex-1">{f.filename}</span>
                    <span className="text-muted-foreground truncate">{f.rawSummary}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${f.filename}`}
                      onClick={() => removeFile(i)}
                      className="text-muted-foreground hover:text-destructive text-base leading-none px-1 shrink-0"
                    >×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {combinedNeeds.inventory && (
          <div className="space-y-2">
            <Label htmlFor="file">
              Inventory{!isOptional("inventory") && <span className="text-destructive ml-0.5">*</span>}
            </Label>
            <p className="text-xs text-muted-foreground">
              Any file works — RVTools / Azure Migrate / CSV is parsed directly into a workload table.
              Anything else (architecture doc, RFP, free-form notes) is accepted and the agent will try to
              extract workloads on the next step. You can also add rows manually.
            </p>
            <p className="text-[11px] text-muted-foreground">For RVTools: use only the official Dell-hosted build (robware.net / rvtools.com) per the May 2025 supply-chain advisory.</p>
            <input
              id="file"
              type="file"
              multiple
              accept=".xlsx,.xls,.docx,.pdf,.txt,.md,.csv"
              onChange={(e) => uploadFiles(e.target.files)}
              disabled={uploading}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-secondary/80"
            />
            {uploading && <p className="text-xs text-muted-foreground">Parsing…</p>}
            {parsedFiles.length > 0 && (
              <ul className="space-y-1 mt-1">
                {parsedFiles.map((f, i) => (
                  <li key={i} className="text-xs flex items-center gap-2 border rounded p-2">
                    <span className="bg-accent rounded px-1.5 py-0.5">{f.kind}</span>
                    <span className="font-medium truncate flex-1">{f.filename}</span>
                    <span className="text-muted-foreground truncate">{f.rawSummary}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${f.filename}`}
                      onClick={() => removeFile(i)}
                      className="text-muted-foreground hover:text-destructive text-base leading-none px-1 shrink-0"
                    >×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {combinedNeeds.clouds && (
          <div className="space-y-2">
            <Label>Target cloud(s)</Label>
            <CloudTogglePicker selected={targetClouds} onToggle={toggleCloud} />
          </div>
        )}

        {combinedNeeds.regions && (
          <RegionPickerPerCloud
            targetClouds={targetClouds}
            cloudRegions={cloudRegions}
            onChange={setRegion}
          />
        )}

        {combinedNeeds.purchaseModel && (
          <div className="space-y-2">
            <Label>Purchase model</Label>
            <PurchaseModelPicker value={purchaseModel} onChange={setPurchaseModel} />
          </div>
        )}

        {/* Solution area + migration strategy applies to inventory-driven deliverables
            (BOM / Assessment / TCO). Non-inventory deliverables don't need it. */}
        {combinedNeeds.inventory && (
          <div className="space-y-2">
            <Label>Solution area + migration strategy</Label>
            <p className="text-xs text-muted-foreground">
              The agent assesses your uploads and suggests the best-fit area (migration /
              modernization / data platform / AI app / SIEM / DR / FinOps / POC / …). Verify
              or refine. Migration strategy is derived from the area — override below if
              needed.
            </p>
            <SolutionAreaSuggester
              parsedFiles={parsedFiles}
              area={solutionArea}
              setArea={setSolutionArea}
              strategy={migrationStrategy}
              setStrategy={setMigrationStrategy}
            />
          </div>
        )}

        {combinedNeeds.onPremBaseline && (
          <div className="space-y-1.5">
            <Label htmlFor="onprem">On-prem baseline (optional)</Label>
            <textarea
              id="onprem"
              value={onPremBaseline}
              onChange={(e) => setOnPremBaseline(e.target.value)}
              className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Approx current annual on-prem spend in USD/MYR + key categories (HW refresh cycle, datacentre, licences, ops)."
            />
          </div>
        )}

        {prereqs.recommendedUpstream.length > 0 && (
          <div className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-3">
            <strong className="text-foreground">Quality tip:</strong> this deliverable is best when {prereqs.recommendedUpstream.map((u) => DELIVERABLE_PREREQS[u].label).join(" + ")} are already produced. Quick generate runs without them but the output draws purely on what you supply here.
          </div>
        )}

        {err && <p className="text-sm text-destructive">{err}</p>}

        {step === "running" && (
          <div className="border rounded-md p-3 bg-accent/30">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Streaming…</p>
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed max-h-[400px] overflow-y-auto">{runText || "starting…"}</pre>
          </div>
        )}

        <div className="flex justify-between items-center pt-2 border-t">
          <Button variant="ghost" onClick={() => { setKind(null); setStep("pick"); }}>← Back</Button>
          <Button onClick={handleGenerateClick} disabled={step === "running"}>
            {step === "running"
              ? "Generating…"
              : stagesToRun.length > 1
                ? `Generate ${stagesToRun.map((s) => DELIVERABLE_PREREQS[s].label).join(" + ")}`
                : `Generate ${prereqs.label.toLowerCase()}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
