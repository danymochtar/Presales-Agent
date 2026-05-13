"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MARKET_DEFAULT_REGIONS, normalizeRegionLabel } from "@/lib/pricing/regions";
import { PURCHASE_MODEL_LABELS, type Term, type CloudType } from "@/lib/pricing/types";
import { engagementTypeLabel, type EngagementType, type DeliverableKind, DELIVERABLE_PREREQS } from "@/lib/deliverable-prereqs";
import { useFileParser } from "@/lib/use-file-parser";
import { CloudTogglePicker, RegionPickerPerCloud, PurchaseModelPicker } from "@/components/cloud-region-pickers";
import { SolutionAreaSuggester } from "@/components/solution-area-suggester";
import type { MigrationStrategy } from "@/lib/inventory/paas-recommender";
import type { SolutionArea } from "@/lib/inventory/solution-area";

type Confidence = "high" | "medium" | "low";

type Extracted = {
  projectName: string;
  customer: string | null;
  industry: string | null;
  customerSegment: "BFSI" | "Gov" | "MNC" | "SMB" | null;
  scopeSummary: string | null;
  targetClouds: ("azure" | "aws" | "gcp")[];
  cloudRegions: Record<string, { primary: string; dr: string }>;
  keyRequirements: string[];
  constraints: string[];
  engagementType: EngagementType;
  engagementTypeRationale: string;
  suggestedDeliverables: DeliverableKind[];
  confidence: {
    customer: Confidence;
    industry: Confidence;
    customerSegment: Confidence;
    scopeSummary: Confidence;
    targetClouds: Confidence;
    cloudRegions: Confidence;
    engagementType: Confidence;
  };
};

type Step = "upload" | "review" | "submitting";

const CONFIDENCE_CHIP: Record<Confidence, string> = {
  high: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  low: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

export function ProjectCreateWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const { parsedFiles, uploading, err: parseErr, uploadFiles, removeFile, setErr: setParseErr } = useFileParser();
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const err = parseErr ?? submitErr;
  const setErr = (v: string | null) => { setParseErr(v); setSubmitErr(v); };

  const [form, setForm] = useState({
    name: "",
    customer: "",
    industry: "",
    customerSegment: "" as "" | "BFSI" | "Gov" | "MNC" | "SMB",
    scopeSummary: "",
  });
  const [targetClouds, setTargetClouds] = useState<CloudType[]>(["azure", "aws"]);
  const [cloudRegions, setCloudRegions] = useState<Record<string, { primary: string; dr: string }>>({
    azure: { ...MARKET_DEFAULT_REGIONS.azure },
    aws:   { ...MARKET_DEFAULT_REGIONS.aws },
  });
  const [purchaseModel, setPurchaseModel] = useState<Term>("consumption");
  const [migrationStrategy, setMigrationStrategy] = useState<MigrationStrategy>("lift_and_shift");
  const [solutionArea, setSolutionArea] = useState<SolutionArea | null>(null);

  async function runExtraction() {
    if (parsedFiles.length === 0) {
      setErr("upload at least one document first");
      return;
    }
    setErr(null);
    setExtracting(true);
    try {
      const res = await fetch("/api/engagements/extract/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: parsedFiles.map((f) => ({
            filename: f.filename,
            kind: f.kind,
            rawSummary: f.rawSummary,
            textContent: f.textContent,
            workloadsSummary: f.workloads?.totals,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "extraction failed");
      const ext = data.extracted as Extracted;
      setExtracted(ext);
      setForm({
        name: ext.projectName || "",
        customer: ext.customer ?? "",
        industry: ext.industry ?? "",
        customerSegment: ext.customerSegment ?? "",
        scopeSummary: ext.scopeSummary ?? "",
      });
      const filtered = ext.targetClouds.filter((c): c is CloudType => c !== "gcp");
      const clouds: CloudType[] = filtered.length > 0 ? filtered : ["azure", "aws"];
      setTargetClouds(clouds);
      const mergedRegions: Record<string, { primary: string; dr: string }> = {};
      for (const c of clouds) {
        const fromExt = ext.cloudRegions[c];
        mergedRegions[c] = fromExt
          ? { primary: normalizeRegionLabel(fromExt.primary), dr: normalizeRegionLabel(fromExt.dr) }
          : { ...MARKET_DEFAULT_REGIONS[c] };
      }
      setCloudRegions(mergedRegions);
      setStep("review");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "extraction failed");
    } finally {
      setExtracting(false);
    }
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

  function setRegion(cloud: CloudType, key: "primary" | "dr", value: string) {
    setCloudRegions((r) => ({ ...r, [cloud]: { ...r[cloud], [key]: value } }));
  }

  async function submit() {
    setErr(null);
    setStep("submitting");
    try {
      const inputs = parsedFiles.map((f) => ({
        kind: f.kind,
        filename: f.filename,
        rawSummary: f.rawSummary,
        textContent: f.textContent,
        workloadsJson: f.workloads,
      }));
      const res = await fetch("/api/engagements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          customerSegment: form.customerSegment || undefined,
          industry: form.industry || undefined,
          scopeSummary: form.scopeSummary || undefined,
          targetClouds,
          cloudRegions,
          purchaseModel,
          migrationStrategy,
          solutionArea: solutionArea ?? undefined,
          inputs,
          engagementType: extracted?.engagementType,
          engagementTypeConfidence: extracted?.confidence?.engagementType,
          engagementTypeRationale: extracted?.engagementTypeRationale,
          suggestedDeliverables: extracted?.suggestedDeliverables,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "create failed");
      router.push(`/engagements/${data.engagement.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "create failed");
      setStep("review");
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2 text-sm">
        <StepBadge n={1} label="Upload" active={step === "upload"} done={step !== "upload"} />
        <span className="text-muted-foreground">→</span>
        <StepBadge n={2} label="Review" active={step === "review"} done={false} />
        <span className="text-muted-foreground">→</span>
        <StepBadge n={3} label="Create" active={step === "submitting"} done={false} />
      </div>

      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle>Upload customer documents</CardTitle>
            <CardDescription>
              Drop any docs related to this opportunity — RVTools / Azure Migrate / inventory list, RFP / RFQ,
              meeting notes, requirements, assessment reports. The agent will extract project metadata and
              parse workloads where present. Supported: .xlsx, .docx, .pdf, .txt, .md, .csv. 10MB per file.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="file-input" className="block mb-1.5">Add document(s)</Label>
              <input
                id="file-input"
                type="file"
                multiple
                accept=".xlsx,.xls,.docx,.pdf,.txt,.md,.csv"
                onChange={(e) => uploadFiles(e.target.files)}
                disabled={uploading || extracting}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-secondary/80"
              />
              {uploading && <p className="text-xs text-muted-foreground mt-1">Parsing…</p>}
              <p className="text-[11px] text-muted-foreground mt-1.5">
                For RVTools exports: use only the official Dell-hosted RVTools (robware.net / rvtools.com) per the May 2025 supply-chain advisory.
              </p>
            </div>

            {parsedFiles.length > 0 && (
              <ul className="space-y-2">
                {parsedFiles.map((f, i) => (
                  <li key={i} className="flex justify-between items-start gap-2 border rounded-md p-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-accent rounded px-1.5 py-0.5">{f.kind}</span>
                        <span className="font-medium truncate">{f.filename}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{f.rawSummary}</p>
                      {f.warnings.length > 0 && (
                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">⚠ {f.warnings.join(" · ")}</p>
                      )}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => removeFile(i)}>×</Button>
                  </li>
                ))}
              </ul>
            )}

            {err && <p className="text-sm text-destructive">{err}</p>}

            <div className="flex justify-between items-center pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                {parsedFiles.length === 0 ? "No files yet" : `${parsedFiles.length} document(s) ready`}
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => { setExtracted(null); setStep("review"); }}>
                  Skip — fill manually
                </Button>
                <Button onClick={runExtraction} disabled={parsedFiles.length === 0 || uploading || extracting}>
                  {extracting ? "Extracting…" : "Extract project details"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {(step === "review" || step === "submitting") && (
        <Card>
          <CardHeader>
            <CardTitle>Review extracted details</CardTitle>
            <CardDescription>
              {extracted
                ? "Auto-filled from uploaded documents. Edit anything wrong, then create the project."
                : "Fill in manually. You can also add documents later."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {extracted && parsedFiles.length > 0 && (
              <div className="text-xs text-muted-foreground border rounded-md p-2">
                Sources: {parsedFiles.map((f) => f.filename).join(" · ")}
              </div>
            )}

            {extracted && (
              <div className="rounded-md border bg-primary/5 p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">Detected project type</span>
                  <span className="text-sm font-medium">{engagementTypeLabel(extracted.engagementType)}</span>
                  {extracted.confidence?.engagementType && (
                    <span className={`text-[10px] uppercase rounded px-1.5 py-0.5 ${CONFIDENCE_CHIP[extracted.confidence.engagementType]}`}>
                      {extracted.confidence.engagementType}
                    </span>
                  )}
                </div>
                {extracted.engagementTypeRationale && (
                  <p className="text-xs text-muted-foreground italic">"{extracted.engagementTypeRationale}"</p>
                )}
                {extracted.suggestedDeliverables.length > 0 && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">Suggested flow: </span>
                    <span>{extracted.suggestedDeliverables.map((s) => DELIVERABLE_PREREQS[s]?.label ?? s).join(" → ")}</span>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <FieldWithChip
                id="name" label="Project name"
                value={form.name}
                onChange={(v) => setForm({ ...form, name: v })}
                required
              />
              <FieldWithChip
                id="customer" label="Customer"
                value={form.customer}
                onChange={(v) => setForm({ ...form, customer: v })}
                confidence={extracted?.confidence.customer}
                required
              />
              <FieldWithChip
                id="industry" label="Industry"
                value={form.industry}
                onChange={(v) => setForm({ ...form, industry: v })}
                placeholder="Banking, Retail, Gov, etc."
                confidence={extracted?.confidence.industry}
              />
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="segment">Customer segment</Label>
                  {extracted?.confidence.customerSegment && (
                    <span className={`text-[10px] uppercase rounded px-1.5 py-0.5 ${CONFIDENCE_CHIP[extracted.confidence.customerSegment]}`}>
                      {extracted.confidence.customerSegment}
                    </span>
                  )}
                </div>
                <select
                  id="segment"
                  value={form.customerSegment}
                  onChange={(e) => setForm({ ...form, customerSegment: e.target.value as typeof form.customerSegment })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">— select —</option>
                  <option value="BFSI">BFSI</option>
                  <option value="Gov">Gov / Public sector</option>
                  <option value="MNC">MNC</option>
                  <option value="SMB">SMB</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="scope">Scope summary (1-2 sentences)</Label>
                {extracted?.confidence.scopeSummary && (
                  <span className={`text-[10px] uppercase rounded px-1.5 py-0.5 ${CONFIDENCE_CHIP[extracted.confidence.scopeSummary]}`}>
                    {extracted.confidence.scopeSummary}
                  </span>
                )}
              </div>
              <textarea
                id="scope"
                value={form.scopeSummary}
                onChange={(e) => setForm({ ...form, scopeSummary: e.target.value })}
                className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label>Target clouds</Label>
                {extracted?.confidence.targetClouds && (
                  <span className={`text-[10px] uppercase rounded px-1.5 py-0.5 ${CONFIDENCE_CHIP[extracted.confidence.targetClouds]}`}>
                    {extracted.confidence.targetClouds}
                  </span>
                )}
              </div>
              <CloudTogglePicker selected={targetClouds} onToggle={toggleCloud} />
              <p className="text-xs text-muted-foreground">Pick 1 cloud for single BOM, or 2+ for side-by-side compare.</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label>Regions (primary + DR)</Label>
                {extracted?.confidence.cloudRegions && (
                  <span className={`text-[10px] uppercase rounded px-1.5 py-0.5 ${CONFIDENCE_CHIP[extracted.confidence.cloudRegions]}`}>
                    {extracted.confidence.cloudRegions}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Drives data residency, BOM pricing, and architecture diagrams. Defaults are Malaysia-resident.
              </p>
              <RegionPickerPerCloud
                targetClouds={targetClouds}
                cloudRegions={cloudRegions}
                onChange={setRegion}
              />
            </div>

            <div className="space-y-2 pt-2 border-t">
              <Label>Purchase model</Label>
              <p className="text-xs text-muted-foreground">
                How the customer plans to consume cloud — drives pricing in the BOM. Same model is applied to both clouds for fair comparison.
              </p>
              <PurchaseModelPicker value={purchaseModel} onChange={setPurchaseModel} showHints />
            </div>

            <div className="space-y-2 pt-2 border-t">
              <Label>Solution area + migration strategy</Label>
              <p className="text-xs text-muted-foreground">
                The agent assesses your uploaded files and suggests the best-fit solution area
                (migration / modernization / data platform / AI app / SIEM / DR / FinOps / POC / …).
                Verify or refine before continuing.
              </p>
              <SolutionAreaSuggester
                parsedFiles={parsedFiles}
                area={solutionArea}
                setArea={setSolutionArea}
                strategy={migrationStrategy}
                setStrategy={setMigrationStrategy}
              />
            </div>

            {extracted && (extracted.keyRequirements.length > 0 || extracted.constraints.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
                {extracted.keyRequirements.length > 0 && (
                  <div>
                    <Label className="text-xs">Key requirements (extracted)</Label>
                    <ul className="text-xs space-y-1 mt-1 list-disc pl-4">
                      {extracted.keyRequirements.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                )}
                {extracted.constraints.length > 0 && (
                  <div>
                    <Label className="text-xs">Constraints (extracted)</Label>
                    <ul className="text-xs space-y-1 mt-1 list-disc pl-4">
                      {extracted.constraints.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {err && <p className="text-sm text-destructive">{err}</p>}

            <div className="flex justify-between items-center pt-2 border-t">
              <Button variant="ghost" onClick={() => setStep("upload")} disabled={step === "submitting"}>
                ← Back to upload
              </Button>
              <Button onClick={submit} disabled={step === "submitting" || !form.name || !form.customer}>
                {step === "submitting" ? "Creating…" : "Create project"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StepBadge({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
        active ? "bg-primary text-primary-foreground" : done ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"
      }`}
    >
      <span className="font-mono">{done ? "✓" : n}</span>
      {label}
    </span>
  );
}

function FieldWithChip({
  id, label, value, onChange, confidence, placeholder, required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  confidence?: Confidence;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}{required && <span className="text-destructive ml-0.5">*</span>}</Label>
        {confidence && (
          <span className={`text-[10px] uppercase rounded px-1.5 py-0.5 ${CONFIDENCE_CHIP[confidence]}`}>{confidence}</span>
        )}
      </div>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required} />
    </div>
  );
}
