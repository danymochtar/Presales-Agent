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

type Step = "pick" | "fill" | "running";

export function QuickGenerateWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("pick");
  const [kind, setKind] = useState<DeliverableKind | null>(null);

  const [customer, setCustomer] = useState("");
  const [industry, setIndustry] = useState("");
  const [scope, setScope] = useState("");
  const { parsedFiles, uploading, err: parseErr, uploadFiles, setErr: setParseErr } = useFileParser();
  const [targetClouds, setTargetClouds] = useState<CloudType[]>(["azure"]);
  const [cloudRegions, setCloudRegions] = useState<Record<string, { primary: string; dr: string }>>({
    azure: { ...MARKET_DEFAULT_REGIONS.azure },
  });
  const [purchaseModel, setPurchaseModel] = useState<Term>("consumption");
  const [onPremBaseline, setOnPremBaseline] = useState("");

  const [runText, setRunText] = useState("");
  const [runErr, setRunErr] = useState<string | null>(null);
  const err = runErr ?? parseErr;
  const setErr = (v: string | null) => { setParseErr(v); setRunErr(v); };

  const prereqs = kind ? DELIVERABLE_PREREQS[kind] : null;

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

  function validate(): string | null {
    if (!kind || !prereqs) return "pick a deliverable first";
    if (prereqs.needs.customer && !customer.trim()) return "customer is required";
    if (prereqs.needs.scope && !scope.trim()) return "scope summary is required";
    if (prereqs.needs.inventory) {
      const hasWorkloads = parsedFiles.some((f) => f.workloads && f.workloads.workloads.length > 0);
      if (!hasWorkloads) return "upload an inventory (RVTools / Azure Migrate / CSV) — needed to size workloads";
    }
    if (prereqs.needs.clouds && targetClouds.length === 0) return "pick at least one target cloud";
    return null;
  }

  async function run() {
    const v = validate();
    if (v) { setErr(v); return; }
    if (!kind || !prereqs) return;
    setErr(null);
    setStep("running");
    setRunText("");

    try {
      const inputs = parsedFiles.map((f) => ({
        kind: f.kind,
        filename: f.filename,
        rawSummary: f.rawSummary,
        textContent: f.textContent,
        workloadsJson: f.workloads,
      }));
      const cloudsForProject: CloudType[] = prereqs.needs.clouds ? targetClouds : ["azure"];
      const regionsForProject = prereqs.needs.regions
        ? cloudRegions
        : { azure: { ...MARKET_DEFAULT_REGIONS.azure } };

      const createRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Quick: ${prereqs.label} · ${new Date().toLocaleDateString()}`,
          customer: customer || "(quick)",
          industry: industry || undefined,
          scopeSummary: scope || onPremBaseline || undefined,
          targetClouds: cloudsForProject,
          cloudRegions: regionsForProject,
          purchaseModel,
          inputs: inputs.length > 0 ? inputs : undefined,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(typeof createData.error === "string" ? createData.error : "could not create project");
      const projectId = createData.project.id as string;

      const cloudQS: CloudType = cloudsForProject[0];
      await streamGenerate(`/api/projects/${projectId}/${kind}/generate?cloud=${cloudQS}`, {
        onDelta: (d) => setRunText((t) => t + d),
        onDone: () => router.push(`/projects/${projectId}/${kind}`),
      });
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

  // step === "fill" or "running"
  if (!prereqs || !kind) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">{prereqs.label}</CardTitle>
            <CardDescription>{prereqs.shortDesc}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setKind(null); setStep("pick"); setErr(null); }}>
            ← Pick a different deliverable
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {prereqs.needs.customer && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="customer">Customer <span className="text-destructive">*</span></Label>
              <Input id="customer" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="e.g. Acme Bank Berhad" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="industry">Industry</Label>
              <Input id="industry" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Banking, Retail, Gov, etc." />
            </div>
          </div>
        )}

        {prereqs.needs.scope && (
          <div className="space-y-1.5">
            <Label htmlFor="scope">Scope summary <span className="text-destructive">*</span></Label>
            <textarea
              id="scope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="1-2 sentences on what this engagement is about."
            />
          </div>
        )}

        {prereqs.needs.inventory && (
          <div className="space-y-2">
            <Label htmlFor="file">Inventory <span className="text-destructive">*</span></Label>
            <p className="text-xs text-muted-foreground">RVTools / Azure Migrate Excel, generic CSV, or a workload list.</p>
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
                    <span className="text-muted-foreground">{f.rawSummary}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {prereqs.needs.clouds && (
          <div className="space-y-2">
            <Label>Target cloud(s)</Label>
            <CloudTogglePicker selected={targetClouds} onToggle={toggleCloud} />
          </div>
        )}

        {prereqs.needs.regions && (
          <RegionPickerPerCloud
            targetClouds={targetClouds}
            cloudRegions={cloudRegions}
            onChange={setRegion}
          />
        )}

        {prereqs.needs.purchaseModel && (
          <div className="space-y-2">
            <Label>Purchase model</Label>
            <PurchaseModelPicker value={purchaseModel} onChange={setPurchaseModel} />
          </div>
        )}

        {prereqs.needs.onPremBaseline && (
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
          <Button onClick={run} disabled={step === "running"}>
            {step === "running" ? "Generating…" : `Generate ${prereqs.label.toLowerCase()}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
