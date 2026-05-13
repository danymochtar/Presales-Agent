"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldMappingForm } from "./field-mapping-form";
import type { FieldMapping, SheetPreview } from "@/lib/pipeline/field-mapping";
import { OPPORTUNITY_ORIGINS, ORIGIN_LABELS, ORIGIN_DESCRIPTIONS, type OpportunityOrigin } from "@/lib/pipeline/origin";
import { TRACKER_PURPOSES, PURPOSE_LABELS, PURPOSE_DESCRIPTIONS, type TrackerPurpose } from "@/lib/pipeline/purpose";

const SOURCES: { value: string; label: string }[] = [
  { value: "microsoft", label: "Microsoft biweekly pipe" },
  { value: "smb", label: "SMB segment" },
  { value: "smc", label: "SMC segment" },
  { value: "ent_ps", label: "ENT / Public Sector" },
  { value: "sales_rep", label: "Sales rep pipe" },
  { value: "funding", label: "Funding / program manager" },
  { value: "other", label: "Other" },
];

type FileEntry = {
  id: string;
  file: File;
  step: "pending" | "analyzing" | "ready" | "saving" | "done" | "error";
  preview: SheetPreview[] | null;
  mapping: FieldMapping;
  name: string;
  source: string;
  purpose: TrackerPurpose;
  defaultOrigin: OpportunityOrigin;
  aiRationale: string | null;
  aiConfidence: "high" | "medium" | "low" | null;
  importedCount: number;
  err: string | null;
};

function newEntry(file: File): FileEntry {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    file,
    step: "pending",
    preview: null,
    mapping: {},
    name: file.name.replace(/\.[^.]+$/, ""),
    source: "microsoft",
    purpose: "current_pipe",
    defaultOrigin: "unknown",
    aiRationale: null,
    aiConfidence: null,
    importedCount: 0,
    err: null,
  };
}

const CONFIDENCE_CHIP: Record<string, string> = {
  high: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  low: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

export function NewTrackerWizard() {
  const router = useRouter();
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [batchErr, setBatchErr] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);

  function setEntry(id: string, patch: Partial<FileEntry>) {
    setEntries((cur) => cur.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBatchErr(null);
    const fresh: FileEntry[] = [];
    for (const f of Array.from(files)) {
      // Dedupe by id (name+size+mtime).
      if (entries.some((e) => e.id === `${f.name}-${f.size}-${f.lastModified}`)) continue;
      fresh.push(newEntry(f));
    }
    if (fresh.length > 0) setEntries((cur) => [...cur, ...fresh]);
  }

  function removeEntry(id: string) {
    setEntries((cur) => cur.filter((e) => e.id !== id));
  }

  async function analyze(entry: FileEntry) {
    setEntry(entry.id, { step: "analyzing", err: null });
    try {
      const fd = new FormData();
      fd.set("file", entry.file);
      const res = await fetch("/api/pipeline/ai-mapping", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "preview failed");

      const ai = j.ai as null | {
        mapping: Record<string, string | null>;
        suggestedName: string;
        suggestedSource: string;
        suggestedPurpose: string;
        suggestedDefaultOrigin: string;
        confidence: "high" | "medium" | "low";
        rationale: string;
      };
      const fb = j.fallback as { suggestedName: string; suggestedPurpose: string; suggestedDefaultOrigin: string };

      // AI wins where present; regex fills the gaps; nothing-found stays null.
      const regex = j.regexMapping as FieldMapping;
      const merged: FieldMapping = {};
      const allKeys = new Set<string>([...Object.keys(regex), ...Object.keys(ai?.mapping ?? {})]);
      for (const k of allKeys) {
        const aiPick = ai?.mapping?.[k] ?? null;
        const regexPick = regex[k as keyof FieldMapping] ?? null;
        (merged as Record<string, string | null>)[k] = aiPick || regexPick || null;
      }

      setEntry(entry.id, {
        step: "ready",
        preview: j.preview as SheetPreview[],
        mapping: merged,
        name: ai?.suggestedName || fb.suggestedName || entry.name,
        source: ai?.suggestedSource || entry.source,
        purpose: (ai?.suggestedPurpose || fb.suggestedPurpose || entry.purpose) as TrackerPurpose,
        defaultOrigin: (ai?.suggestedDefaultOrigin || fb.suggestedDefaultOrigin || entry.defaultOrigin) as OpportunityOrigin,
        aiRationale: ai?.rationale ?? null,
        aiConfidence: ai?.confidence ?? null,
        err: typeof j.aiError === "string" ? `AI fallback: ${j.aiError}` : null,
      });
    } catch (e) {
      setEntry(entry.id, { step: "error", err: e instanceof Error ? e.message : "preview failed" });
    }
  }

  async function analyzeAll() {
    const pending = entries.filter((e) => e.step === "pending" || e.step === "error");
    await Promise.all(pending.map((e) => analyze(e)));
  }

  async function saveOne(entry: FileEntry) {
    if (entry.step !== "ready") return;
    setEntry(entry.id, { step: "saving", err: null });
    try {
      const fd = new FormData();
      fd.set("file", entry.file);
      fd.set("name", entry.name);
      fd.set("source", entry.source);
      fd.set("purpose", entry.purpose);
      fd.set("defaultOriginKind", entry.defaultOrigin);
      fd.set("mapping", JSON.stringify(entry.mapping));
      const res = await fetch("/api/pipeline/trackers", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "save failed");
      setEntry(entry.id, { step: "done", importedCount: j.importedCount ?? 0 });
    } catch (e) {
      setEntry(entry.id, { step: "error", err: e instanceof Error ? e.message : "save failed" });
    }
  }

  async function saveAll() {
    setSavingAll(true);
    setBatchErr(null);
    try {
      const ready = entries.filter((e) => e.step === "ready");
      if (ready.length === 0) {
        setBatchErr("Nothing ready to import. Click Analyze first.");
        return;
      }
      await Promise.all(ready.map((e) => saveOne(e)));
      router.refresh();
    } finally {
      setSavingAll(false);
    }
  }

  const readyCount = entries.filter((e) => e.step === "ready").length;
  const doneCount = entries.filter((e) => e.step === "done").length;
  const totalImported = entries.reduce((s, e) => s + (e.step === "done" ? e.importedCount : 0), 0);

  return (
    <div className="space-y-4">
      {batchErr && <p className="text-sm text-destructive">{batchErr}</p>}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">1 · Upload source Excel files</CardTitle>
          <p className="text-xs text-muted-foreground">
            Drop one or many. The agent extracts each sheet&apos;s headers + sample rows, then asks the AI to
            propose the canonical-field mapping, tracker name, source, and purpose. Confirm or edit per file
            before importing.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="file"
            accept=".xlsx,.xls"
            multiple
            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
          />
          {entries.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center text-xs">
              <Button size="sm" onClick={analyzeAll} disabled={entries.every((e) => e.step !== "pending" && e.step !== "error")}>
                Analyze all with AI
              </Button>
              <Button size="sm" variant="outline" onClick={saveAll} disabled={readyCount === 0 || savingAll}>
                {savingAll ? "Importing…" : `Import ${readyCount} ready file${readyCount === 1 ? "" : "s"}`}
              </Button>
              {doneCount > 0 && (
                <span className="text-muted-foreground">
                  ✓ {doneCount} tracker{doneCount === 1 ? "" : "s"} created · {totalImported} opportunit{totalImported === 1 ? "y" : "ies"} imported.
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {entries.map((entry, idx) => (
        <Card key={entry.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between gap-2 flex-wrap">
              <span className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${entry.step === "done" ? "bg-emerald-600 text-white" : "bg-primary text-primary-foreground"}`}>
                  {entry.step === "done" ? "✓" : idx + 1}
                </span>
                <span>{entry.file.name}</span>
                <span className="text-xs font-normal text-muted-foreground">{(entry.file.size / 1024).toFixed(0)} KB</span>
                {entry.aiConfidence && (
                  <span className={`text-[10px] uppercase rounded px-1.5 py-0.5 ${CONFIDENCE_CHIP[entry.aiConfidence]}`}>
                    AI · {entry.aiConfidence}
                  </span>
                )}
              </span>
              <span className="flex gap-1">
                {(entry.step === "pending" || entry.step === "error") && (
                  <Button size="sm" variant="outline" onClick={() => analyze(entry)}>Analyze</Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => removeEntry(entry.id)}>Remove</Button>
              </span>
            </CardTitle>
            {entry.aiRationale && (
              <p className="text-xs text-muted-foreground mt-1 italic">&ldquo;{entry.aiRationale}&rdquo;</p>
            )}
            {entry.err && <p className="text-xs text-destructive mt-1">{entry.err}</p>}
          </CardHeader>

          {entry.step === "analyzing" && (
            <CardContent className="text-xs text-muted-foreground">Analyzing headers + sample rows…</CardContent>
          )}

          {entry.step === "done" && (
            <CardContent className="text-sm text-emerald-700 dark:text-emerald-300">
              Imported {entry.importedCount} opportunit{entry.importedCount === 1 ? "y" : "ies"}.
            </CardContent>
          )}

          {(entry.step === "ready" || entry.step === "saving") && entry.preview && entry.preview[0] && (
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor={`name-${entry.id}`}>Tracker name</Label>
                  <Input id={`name-${entry.id}`} value={entry.name} onChange={(e) => setEntry(entry.id, { name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`src-${entry.id}`}>Source</Label>
                  <select id={`src-${entry.id}`} value={entry.source} onChange={(e) => setEntry(entry.id, { source: e.target.value })} className="block w-full rounded border bg-background px-2 py-2 text-sm">
                    {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`purp-${entry.id}`}>What is this pipeline?</Label>
                <select id={`purp-${entry.id}`} value={entry.purpose} onChange={(e) => setEntry(entry.id, { purpose: e.target.value as TrackerPurpose })} className="block w-full rounded border bg-background px-2 py-2 text-sm">
                  {TRACKER_PURPOSES.filter((p) => p !== "crm_sync").map((p) => <option key={p} value={p}>{PURPOSE_LABELS[p]}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">{PURPOSE_DESCRIPTIONS[entry.purpose]}</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`org-${entry.id}`}>Default origin for rows</Label>
                <select id={`org-${entry.id}`} value={entry.defaultOrigin} onChange={(e) => setEntry(entry.id, { defaultOrigin: e.target.value as OpportunityOrigin })} className="block w-full rounded border bg-background px-2 py-2 text-sm">
                  {OPPORTUNITY_ORIGINS.map((o) => <option key={o} value={o}>{ORIGIN_LABELS[o]}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">{ORIGIN_DESCRIPTIONS[entry.defaultOrigin]}</p>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Detected sheet <span className="font-medium">{entry.preview[0].sheet}</span> with {entry.preview[0].headers.length} column(s).
                </p>
                <FieldMappingForm
                  headers={entry.preview[0].headers}
                  mapping={entry.mapping}
                  onChange={(m) => setEntry(entry.id, { mapping: m })}
                />
              </div>

              <div className="flex justify-end">
                <Button size="sm" onClick={() => saveOne(entry)} disabled={entry.step === "saving" || !entry.name}>
                  {entry.step === "saving" ? "Importing…" : "Import this tracker"}
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}
