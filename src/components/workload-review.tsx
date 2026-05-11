"use client";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  assessCompleteness,
  applyDefaults,
  patchWorkload,
  mergeWorkloadSets,
  SUGGESTED_DEFAULTS,
  type FieldKey,
} from "@/lib/inventory/completeness";
import { summarize, type Workload, type WorkloadSet } from "@/lib/inventory/workload";
import { useFileParser } from "@/lib/use-file-parser";

const FIELD_LABELS: Record<FieldKey, string> = {
  cpu: "vCPU",
  ramGb: "RAM (GB)",
  storageGb: "Storage (GB)",
  os: "OS",
};

export function WorkloadReview({
  initial,
  onContinue,
  onBack,
  deliverableLabel,
  onAiExtract,
}: {
  initial: WorkloadSet;
  onContinue: (set: WorkloadSet) => void;
  onBack: () => void;
  deliverableLabel: string;
  onAiExtract?: () => Promise<{ set: WorkloadSet; warnings: string[] } | null>;
}) {
  const [set, setSet] = useState<WorkloadSet>(initial);
  const { parsedFiles, uploading, uploadFiles, err } = useFileParser();
  const report = useMemo(() => assessCompleteness(set), [set]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);

  async function runAiExtract() {
    if (!onAiExtract) return;
    setAiBusy(true);
    setAiErr(null);
    try {
      const r = await onAiExtract();
      if (!r) { setAiErr("nothing to extract — upload a file first"); return; }
      setAiWarnings(r.warnings);
      if (r.set.workloads.length === 0) {
        setAiErr("AI didn't find any workload rows in the uploaded text. Try a different file or add workloads manually.");
        return;
      }
      setSet((s) => mergeWorkloadSets(s, r.set));
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : "extraction failed");
    } finally {
      setAiBusy(false);
    }
  }

  function mergeNewUploads() {
    let merged = set;
    for (const f of parsedFiles) {
      const ws = f.workloads as WorkloadSet | undefined;
      if (ws && ws.workloads.length > 0) {
        merged = mergeWorkloadSets(merged, ws);
      }
    }
    if (merged !== set) setSet(merged);
  }

  function updateRow(index: number, patch: Partial<Workload>) {
    setSet((s) => patchWorkload(s, index, patch));
  }

  function deleteRow(index: number) {
    setSet((s) => {
      const next = s.workloads.filter((_, i) => i !== index);
      return { ...s, workloads: next, totals: summarize(next) };
    });
  }

  function addRow() {
    setSet((s) => {
      const next: Workload[] = [...s.workloads, { name: `manual-${s.workloads.length + 1}`, os: "linux", cpu: 2, ramGb: 4, storageGb: 50, count: 1 }];
      return { ...s, workloads: next, totals: summarize(next) };
    });
  }

  const newFilesReady = parsedFiles.some((f) => f.workloads && f.workloads.workloads.length > 0);

  const isEmpty = set.workloads.length === 0;

  return (
    <div className="space-y-4">
      {isEmpty && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/10 p-3 space-y-2">
          <p className="text-sm font-medium">No workloads parsed yet</p>
          <p className="text-xs text-muted-foreground">
            The uploaded file didn&apos;t match the canonical RVTools / Azure Migrate columns
            {onAiExtract ? "" : ", and no text content was extracted"}.
            Pick one of these to continue:
          </p>
          <ul className="text-xs space-y-1 list-disc pl-5">
            {onAiExtract && (
              <li>
                <strong>AI extract from uploaded text</strong> — the agent scans your file for
                workload mentions (hostnames, vCPU, RAM, OS).
              </li>
            )}
            <li><strong>Add workloads manually</strong> below — minimum is CPU + RAM per row.</li>
            <li><strong>Upload another file</strong> using the box at the bottom.</li>
            <li>
              <strong>Not a VM inventory?</strong> If your upload is a SIEM design / AI use case /
              data platform spec / app modernization plan, skip the workload table — the BOM
              generator will classify the artifact and price the relevant services from the
              document text instead.
            </li>
          </ul>
          <div className="flex flex-wrap gap-2">
            {onAiExtract && (
              <Button size="sm" onClick={runAiExtract} disabled={aiBusy}>
                {aiBusy ? "Extracting…" : "Try AI extraction from uploaded text"}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => onContinue(set)}>
              Skip table — not a VM inventory →
            </Button>
          </div>
          {aiErr && <p className="text-xs text-destructive">{aiErr}</p>}
        </div>
      )}

      {!isEmpty && aiWarnings.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/10 p-3 space-y-1">
          <p className="text-xs font-medium">AI extraction notes</p>
          <ul className="text-xs space-y-0.5 list-disc pl-5">
            {aiWarnings.slice(0, 6).map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <div className="rounded-md border p-3 space-y-1">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-medium">
            Inventory mapping — {report.completenessPct}% complete
          </p>
          <span className={`text-xs uppercase tracking-wider rounded px-1.5 py-0.5 ${
            report.canGenerate ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200"
            : "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
          }`}>
            {report.canGenerate ? "ready" : isEmpty ? "no workloads" : `${report.blockingCount} blocking`}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {report.totalWorkloads} workloads · {report.completeCount} complete · {report.partialCount} partial · {report.blockingCount} blocking
          {report.blockingCount > 0 && " — blocking rows have no CPU or RAM and cannot be sized."}
        </p>
        <div className="text-xs text-muted-foreground">
          Totals: {set.totals.cpu} vCPU · {set.totals.ramGb} GB RAM · {set.totals.storageGb} GB storage · OS mix {JSON.stringify(set.totals.osMix)}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setSet((s) => applyDefaults(s, SUGGESTED_DEFAULTS))}>
          Apply defaults to missing fields
        </Button>
        <Button size="sm" variant="outline" onClick={addRow}>+ Add workload manually</Button>
      </div>

      <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
        <table className="w-full text-xs min-w-[720px]">
          <thead className="text-muted-foreground">
            <tr className="border-b">
              <th className="text-left py-2 pr-2">Name</th>
              <th className="text-left pr-2">OS</th>
              <th className="text-right pr-2">vCPU</th>
              <th className="text-right pr-2">RAM (GB)</th>
              <th className="text-right pr-2">Storage (GB)</th>
              <th className="text-right pr-2">Count</th>
              <th className="text-left pr-2">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {set.workloads.map((w, i) => {
              const gap = report.gaps.find((g) => g.index === i);
              const cls = (k: FieldKey) => (gap?.missing.includes(k)
                ? "bg-rose-50 dark:bg-rose-900/20 border-rose-300"
                : "");
              return (
                <tr key={i} className="border-b last:border-0 align-top">
                  <td className="py-1.5 pr-2 max-w-[180px]">
                    <input
                      value={w.name}
                      onChange={(e) => updateRow(i, { name: e.target.value })}
                      className="w-full bg-transparent border-b border-transparent focus:border-input outline-none truncate"
                    />
                  </td>
                  <td className="pr-2">
                    <select
                      value={w.os}
                      onChange={(e) => updateRow(i, { os: e.target.value as Workload["os"] })}
                      className={`w-full bg-background border rounded px-1 py-0.5 ${cls("os")}`}
                    >
                      <option value="linux">linux</option>
                      <option value="windows">windows</option>
                      <option value="other">other</option>
                    </select>
                  </td>
                  {(["cpu", "ramGb", "storageGb", "count"] as const).map((k) => (
                    <td key={k} className="pr-2 text-right">
                      <input
                        type="number"
                        min={0}
                        value={w[k] ?? 0}
                        onChange={(e) => updateRow(i, { [k]: Number(e.target.value) || 0 })}
                        className={`w-20 bg-background border rounded px-1 py-0.5 text-right ${k !== "count" ? cls(k as FieldKey) : ""}`}
                      />
                    </td>
                  ))}
                  <td className="pr-2 text-xs">
                    {gap
                      ? <span className={gap.blocking ? "text-rose-700 dark:text-rose-300" : "text-amber-700 dark:text-amber-300"}>
                          {gap.blocking ? "blocking · " : "needs · "}
                          {gap.missing.map((m) => FIELD_LABELS[m]).join(", ")}
                        </span>
                      : <span className="text-emerald-700 dark:text-emerald-300">✓</span>}
                  </td>
                  <td>
                    <button
                      type="button"
                      aria-label="Remove workload"
                      onClick={() => deleteRow(i)}
                      className="text-muted-foreground hover:text-destructive text-base leading-none px-1"
                    >×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-md border bg-accent/30 p-3 space-y-2">
        <Label htmlFor="extra-files" className="text-sm">Still missing data? Add another file</Label>
        <p className="text-xs text-muted-foreground">
          Add a follow-up RVTools / Azure Migrate / CSV with the missing rows. Existing workloads are kept;
          new ones merge in (dedup on name + OS).
        </p>
        <input
          id="extra-files"
          type="file"
          multiple
          accept=".xlsx,.xls,.docx,.pdf,.txt,.md,.csv"
          onChange={(e) => uploadFiles(e.target.files)}
          disabled={uploading}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-secondary/80"
        />
        {uploading && <p className="text-xs text-muted-foreground">Parsing…</p>}
        {err && <p className="text-xs text-destructive">{err}</p>}
        {newFilesReady && (
          <Button size="sm" onClick={mergeNewUploads}>Merge newly uploaded workloads</Button>
        )}
      </div>

      <div className="flex justify-between items-center pt-2 border-t">
        <Button variant="ghost" onClick={onBack}>← Back</Button>
        <Button onClick={() => onContinue(set)} disabled={!report.canGenerate}>
          {report.canGenerate
            ? `Continue → generate ${deliverableLabel.toLowerCase()}`
            : isEmpty
              ? "Add at least one workload first"
              : `Fix ${report.blockingCount} blocking row${report.blockingCount === 1 ? "" : "s"} first`}
        </Button>
      </div>
    </div>
  );
}
