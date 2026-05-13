"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DELIVERABLE_PREREQS,
  engagementTypeLabel,
  type DeliverableKind,
} from "@/lib/deliverable-prereqs";
import { streamGenerate } from "@/lib/sse-stream";

type StageId = DeliverableKind;

function stagePath(stage: StageId, engagementId: string, cloud: string): string {
  // SOW falls back to azure in compare mode (legal scope is single-cloud).
  if (stage === "sow" && cloud === "compare") return `/api/engagements/${engagementId}/sow/generate?cloud=azure`;
  return `/api/engagements/${engagementId}/${stage}/generate?cloud=${cloud}`;
}

const stageLabel = (s: StageId) => DELIVERABLE_PREREQS[s].label;

// Fallback flow when AI didn't suggest one. Assessment leads — its executive
// summary now does the customer-background research that the old Customer
// Study deliverable used to produce as a separate artifact.
const DEFAULT_FLOWS: Record<string, StageId[]> = {
  migration:     ["assessment", "architecture", "bom", "professional-services", "tco", "project-plan", "proposal"],
  greenfield:    ["architecture", "bom", "professional-services", "tco", "project-plan", "proposal"],
  modernization: ["assessment", "architecture", "bom", "professional-services", "project-plan", "proposal"],
  dr:            ["architecture", "bom", "professional-services", "project-plan", "proposal"],
  poc:           ["architecture", "bom", "professional-services", "proposal"],
  optimization:  ["assessment", "bom", "professional-services", "proposal"],
  unknown:       ["assessment", "architecture", "bom", "professional-services", "tco", "project-plan", "proposal"],
};

const CONFIDENCE_CHIP: Record<string, string> = {
  high: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  low: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

export function SmartWorkflow({
  engagementId,
  engagementType,
  engagementTypeConfidence,
  engagementTypeRationale,
  suggestedDeliverables,
  targetClouds,
  hasInventory,
  existingByStage,
}: {
  engagementId: string;
  engagementType: string | null;
  engagementTypeConfidence: string | null;
  engagementTypeRationale: string | null;
  suggestedDeliverables: string[];
  targetClouds: string[];
  hasInventory: boolean;
  // Map of cloud -> stages already generated, e.g. { azure: ["assessment", "bom"] }
  existingByStage: Record<string, string[]>;
}) {
  const router = useRouter();
  const cloudOptions = targetClouds.filter((c) => c !== "gcp");
  const [cloud, setCloud] = useState(cloudOptions[0] ?? "azure");

  const flow = useMemo<StageId[]>(() => {
    const valid = (s: string): s is StageId => s in DELIVERABLE_PREREQS;
    if (suggestedDeliverables && suggestedDeliverables.length > 0) {
      return suggestedDeliverables.filter(valid);
    }
    return DEFAULT_FLOWS[engagementType ?? "unknown"] ?? DEFAULT_FLOWS.unknown;
  }, [suggestedDeliverables, engagementType]);

  const allStages = Object.keys(DELIVERABLE_PREREQS) as StageId[];
  const optionalStages = allStages.filter((s) => !flow.includes(s));

  const [selected, setSelected] = useState<Set<StageId>>(new Set(flow));
  const [customizing, setCustomizing] = useState(false);
  const [skipExisting, setSkipExisting] = useState(true);

  const [running, setRunning] = useState(false);
  const [stepStage, setStepStage] = useState<StageId | null>(null);
  const [stepChars, setStepChars] = useState(0);
  const [doneStages, setDoneStages] = useState<Set<StageId>>(new Set());
  const [err, setErr] = useState<{ stage: string; message: string } | null>(null);
  const [done, setDone] = useState(false);

  function toggle(s: StageId) {
    const next = new Set(selected);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    setSelected(next);
  }

  async function run() {
    setRunning(true);
    setErr(null);
    setDone(false);
    setDoneStages(new Set());
    setStepChars(0);

    // Determine which stages to actually run, respecting flow order
    const toRun = flow
      .concat(optionalStages.filter((s) => selected.has(s))) // include optionals user opted in
      .filter((s) => selected.has(s));

    const existing = new Set<string>(existingByStage[cloud] ?? []);

    for (const stage of toRun) {
      if (skipExisting && existing.has(stage)) {
        setDoneStages((prev) => new Set(prev).add(stage));
        continue;
      }
      setStepStage(stage);
      setStepChars(0);
      try {
        let chars = 0;
        await streamGenerate(stagePath(stage, engagementId, cloud), {
          onDelta: (d) => { chars += d.length; setStepChars(chars); },
        });
        setDoneStages((prev) => new Set(prev).add(stage));
      } catch (e) {
        setErr({
          stage: stageLabel(stage),
          message: e instanceof Error ? e.message : "unknown",
        });
        setRunning(false);
        setStepStage(null);
        router.refresh();
        return;
      }
    }
    setDone(true);
    setRunning(false);
    setStepStage(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Engagement type panel */}
      <div className="rounded-md border bg-primary/5 p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Engagement type</span>
          <span className="text-sm font-medium">{engagementTypeLabel(engagementType)}</span>
          {engagementTypeConfidence && (
            <span className={`text-[10px] uppercase rounded px-1.5 py-0.5 ${CONFIDENCE_CHIP[engagementTypeConfidence]}`}>
              {engagementTypeConfidence}
            </span>
          )}
        </div>
        {engagementTypeRationale && (
          <p className="text-xs text-muted-foreground italic">"{engagementTypeRationale}"</p>
        )}
        <p className="text-xs">
          <span className="text-muted-foreground">Suggested flow: </span>
          <span>{flow.map((s) => stageLabel(s)).join(" → ")}</span>
        </p>
      </div>

      {/* Run controls */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:flex-wrap">
        <div className="space-y-1 w-full sm:w-auto">
          <label className="text-xs text-muted-foreground">Run for cloud</label>
          <select
            value={cloud}
            onChange={(e) => setCloud(e.target.value)}
            disabled={running}
            className="flex h-10 w-full sm:w-auto rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {cloudOptions.map((c) => (
              <option key={c} value={c}>{c.toUpperCase()}</option>
            ))}
            {cloudOptions.length >= 2 && <option value="compare">Compare</option>}
          </select>
        </div>
        <Button onClick={run} disabled={running || !hasInventory || selected.size === 0} className="h-10 w-full sm:w-auto">
          {running ? `Running ${stepStage ? stageLabel(stepStage) : "…"}` : done ? "Pipeline complete ✓" : `Generate ${selected.size} deliverable${selected.size === 1 ? "" : "s"}`}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setCustomizing(!customizing)} disabled={running} className="w-full sm:w-auto">
          {customizing ? "Hide customize" : "Customize selection"}
        </Button>
        {!hasInventory && (
          <p className="text-xs text-muted-foreground self-center">Upload an inventory first.</p>
        )}
      </div>

      {/* Customize panel */}
      {customizing && (
        <div className="border rounded-md p-3 space-y-3">
          <div className="text-xs font-medium">Pick deliverables to generate (in flow order):</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {[...flow, ...optionalStages].map((s) => {
              const isSuggested = flow.includes(s);
              const isExisting = (existingByStage[cloud] ?? []).includes(s);
              return (
                <label key={s} className={`flex items-center gap-2 text-sm border rounded-md p-2 cursor-pointer ${selected.has(s) ? "border-primary bg-primary/5" : ""}`}>
                  <input
                    type="checkbox"
                    checked={selected.has(s)}
                    onChange={() => toggle(s)}
                    disabled={running}
                  />
                  <span>{stageLabel(s)}</span>
                  {isSuggested && <span className="text-[10px] uppercase text-muted-foreground">suggested</span>}
                  {isExisting && <span className="text-[10px] uppercase text-green-700">exists</span>}
                </label>
              );
            })}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={skipExisting} onChange={(e) => setSkipExisting(e.target.checked)} disabled={running} />
            Skip stages that already have a version for this cloud
          </label>
        </div>
      )}

      {/* Progress */}
      {(running || done || doneStages.size > 0) && (
        <ol className="text-xs space-y-1.5">
          {flow.concat(optionalStages.filter((s) => selected.has(s))).filter((s) => selected.has(s)).map((s) => {
            const isDone = doneStages.has(s);
            const isActive = stepStage === s && running;
            const isPending = !isDone && !isActive;
            return (
              <li key={s} className="flex items-center gap-2">
                <span className={`inline-block w-5 text-center ${isDone ? "text-green-600" : isActive ? "text-primary" : "text-muted-foreground"}`}>
                  {isDone ? "✓" : isActive ? "⋯" : "·"}
                </span>
                <span className={isPending ? "text-muted-foreground" : ""}>{stageLabel(s)}</span>
                {isActive && stepChars > 0 && (
                  <span className="text-muted-foreground">· {stepChars.toLocaleString()} chars streamed</span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {err && (
        <div className="text-xs space-y-1 border border-destructive/40 rounded-md p-2">
          <p className="text-destructive">
            <strong>Stage {err.stage} failed.</strong> {err.message}
          </p>
          <p className="text-muted-foreground">
            Earlier stages were saved. Re-run to retry from the failed stage (it will start fresh on that one).
          </p>
        </div>
      )}
    </div>
  );
}
