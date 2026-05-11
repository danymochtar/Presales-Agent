"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MigrationStrategyPicker } from "@/components/migration-strategy-picker";
import {
  SOLUTION_AREA_LABELS,
  SOLUTION_AREA_HINTS,
  SOLUTION_AREAS_IN_ORDER,
  migrationStrategyFor,
  type SolutionArea,
} from "@/lib/inventory/solution-area";
import type { MigrationStrategy } from "@/lib/inventory/paas-recommender";
import type { ParsedFile } from "@/lib/use-file-parser";
import { detectComponents } from "@/lib/inventory/component-detector";
import type { WorkloadSet } from "@/lib/inventory/workload";

type Assessment = {
  primaryArea: SolutionArea;
  confidence: "high" | "medium" | "low";
  rationale: string;
  alternatives: SolutionArea[];
  useCaseExamples: string[];
  suggestedNextStep: string;
};

const CONFIDENCE_CLS: Record<Assessment["confidence"], string> = {
  high:   "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  medium: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  low:    "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200",
};

export function SolutionAreaSuggester({
  parsedFiles,
  area,
  setArea,
  strategy,
  setStrategy,
}: {
  parsedFiles: ParsedFile[];
  area: SolutionArea | null;
  setArea: (a: SolutionArea | null) => void;
  strategy: MigrationStrategy;
  setStrategy: (s: MigrationStrategy) => void;
}) {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [refinement, setRefinement] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showOverride, setShowOverride] = useState(false);

  const hasUploads = parsedFiles.length > 0;

  async function runAssessment() {
    setBusy(true);
    setErr(null);
    try {
      // Compute detected component counts client-side from any parsed
      // workload sets so the assessor sees them in context.
      const componentCounts: Record<string, number> = {};
      for (const f of parsedFiles) {
        const ws = f.workloads as WorkloadSet | undefined;
        if (!ws || ws.workloads.length === 0) continue;
        const { counts } = detectComponents(ws);
        for (const [k, v] of Object.entries(counts)) {
          componentCounts[k] = (componentCounts[k] ?? 0) + (v ?? 0);
        }
      }
      const res = await fetch("/api/inventory/assess-solution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: parsedFiles.map((f) => ({
            filename: f.filename,
            summary: f.rawSummary,
            textSnippet: f.textContent ?? "",
          })),
          detectedComponentCounts: componentCounts,
          refinementNote: refinement || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "assessment failed");
      const a = j.assessment as Assessment;
      setAssessment(a);
      // Accept the assessment as the working area + derived strategy by default.
      setArea(a.primaryArea);
      setStrategy(migrationStrategyFor(a.primaryArea));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "assessment failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {!assessment && (
        <div className="rounded-md border border-dashed p-3 space-y-2">
          <p className="text-sm">
            Let the agent assess your uploads and suggest the best-fit solution area
            (migration / modernization / data platform / AI app / SIEM / DR / FinOps / POC / …).
          </p>
          <p className="text-xs text-muted-foreground">
            You verify the suggestion, refine it with extra context if needed, and pick the
            final migration strategy. Skip if you already know the answer — just override below.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={runAssessment} disabled={busy || !hasUploads}>
              {busy ? "Assessing…" : hasUploads ? "Assess uploaded files" : "Upload a file first to enable assessment"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowOverride(!showOverride)}>
              {showOverride ? "Hide override" : "Skip + pick manually"}
            </Button>
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
      )}

      {assessment && (
        <div className="rounded-md border bg-primary/5 p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Suggested solution area</span>
            <span className="text-sm font-medium">{SOLUTION_AREA_LABELS[assessment.primaryArea]}</span>
            <span className={`text-[10px] uppercase rounded px-1.5 py-0.5 ${CONFIDENCE_CLS[assessment.confidence]}`}>
              {assessment.confidence}
            </span>
          </div>
          <p className="text-xs text-muted-foreground italic">&ldquo;{assessment.rationale}&rdquo;</p>
          {assessment.useCaseExamples.length > 0 && (
            <ul className="text-xs space-y-0.5 list-disc pl-5 text-muted-foreground">
              {assessment.useCaseExamples.slice(0, 3).map((u, i) => <li key={i}>{u}</li>)}
            </ul>
          )}
          {assessment.alternatives.length > 0 && (
            <div className="text-xs">
              <span className="text-muted-foreground">Alternative areas to consider: </span>
              {assessment.alternatives.map((a, i) => (
                <button
                  type="button"
                  key={a}
                  onClick={() => { setArea(a); setStrategy(migrationStrategyFor(a)); }}
                  className="underline hover:text-foreground"
                >
                  {SOLUTION_AREA_LABELS[a]}{i < assessment.alternatives.length - 1 ? ", " : ""}
                </button>
              ))}
            </div>
          )}
          {assessment.suggestedNextStep && (
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">Next step:</strong> {assessment.suggestedNextStep}
            </p>
          )}
          <div className="text-xs">
            <strong>Derived migration strategy:</strong> {strategy.replace(/_/g, " ")} (adjust below if needed)
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="refinement">Refine with more context (optional)</Label>
        <p className="text-xs text-muted-foreground">
          Anything the uploads don&apos;t reveal — e.g. &ldquo;customer also wants a new AI assistant on top of this estate&rdquo; or &ldquo;DR target is Singapore, RPO 15 min&rdquo;.
        </p>
        <textarea
          id="refinement"
          value={refinement}
          onChange={(e) => setRefinement(e.target.value)}
          className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="Customer context that wasn't in the uploaded files…"
        />
        <Button size="sm" onClick={runAssessment} disabled={busy || !hasUploads}>
          {busy ? "Reassessing…" : assessment ? "Reassess with these details" : "Assess with these details"}
        </Button>
      </div>

      {(assessment || showOverride) && (
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Label>Solution area override</Label>
            <p className="text-xs text-muted-foreground">Final say. Updates the derived migration strategy.</p>
          </div>
          <select
            value={area ?? ""}
            onChange={(e) => {
              const a = e.target.value as SolutionArea;
              setArea(a);
              setStrategy(migrationStrategyFor(a));
            }}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— pick a solution area —</option>
            {SOLUTION_AREAS_IN_ORDER.map((a) => (
              <option key={a} value={a} title={SOLUTION_AREA_HINTS[a]}>
                {SOLUTION_AREA_LABELS[a]}
              </option>
            ))}
          </select>
          {area && (
            <p className="text-xs text-muted-foreground">{SOLUTION_AREA_HINTS[area]}</p>
          )}

          <div className="pt-1.5">
            <Label>Migration strategy (override)</Label>
            <p className="text-xs text-muted-foreground mb-1.5">
              Drives PaaS routing in the BOM. Non-modernizable workloads (AD, container hosts) stay IaaS regardless.
            </p>
            <MigrationStrategyPicker value={strategy} onChange={setStrategy} />
          </div>
        </div>
      )}
    </div>
  );
}
