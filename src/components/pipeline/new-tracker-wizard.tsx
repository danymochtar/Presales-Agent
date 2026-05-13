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

export function NewTrackerWizard() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [source, setSource] = useState<string>("microsoft");
  const [defaultOrigin, setDefaultOrigin] = useState<OpportunityOrigin>("unknown");
  const [purpose, setPurpose] = useState<TrackerPurpose>("current_pipe");
  const [preview, setPreview] = useState<SheetPreview[] | null>(null);
  const [mapping, setMapping] = useState<FieldMapping>({});
  const [step, setStep] = useState<"upload" | "map" | "saving" | "done">("upload");
  const [err, setErr] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number>(0);

  async function previewFile() {
    if (!file) { setErr("choose a file first"); return; }
    setErr(null);
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch("/api/pipeline/preview", { method: "POST", body: fd });
    if (!res.ok) { setErr(await res.text()); return; }
    const { preview, suggestedMapping } = await res.json();
    setPreview(preview);
    setMapping(suggestedMapping);
    if (!name && file.name) setName(file.name.replace(/\.[^.]+$/, ""));
    setStep("map");
  }

  async function save() {
    if (!file || !name) { setErr("file and name required"); return; }
    setErr(null);
    setStep("saving");
    const fd = new FormData();
    fd.set("file", file);
    fd.set("name", name);
    fd.set("source", source);
    fd.set("defaultOriginKind", defaultOrigin);
    fd.set("purpose", purpose);
    fd.set("mapping", JSON.stringify(mapping));
    const res = await fetch("/api/pipeline/trackers", { method: "POST", body: fd });
    if (!res.ok) {
      setErr(await res.text());
      setStep("map");
      return;
    }
    const { importedCount } = await res.json();
    setImportedCount(importedCount);
    setStep("done");
  }

  const sheet0 = preview?.[0];

  return (
    <div className="space-y-4">
      {err && <p className="text-sm text-destructive">{err}</p>}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">1 · Upload source Excel</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="tracker-name">Tracker name</Label>
              <Input id="tracker-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Microsoft biweekly 2026-W19" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tracker-source">Source</Label>
              <select id="tracker-source" value={source} onChange={(e) => setSource(e.target.value)} className="block w-full rounded border bg-background px-2 py-2 text-sm">
                {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tracker-purpose">What is this pipeline?</Label>
            <select id="tracker-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value as TrackerPurpose)} className="block w-full rounded border bg-background px-2 py-2 text-sm">
              {TRACKER_PURPOSES.filter((p) => p !== "crm_sync").map((p) => <option key={p} value={p}>{PURPOSE_LABELS[p]}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">{PURPOSE_DESCRIPTIONS[purpose]}</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tracker-origin">Default origin for rows in this tracker</Label>
            <select id="tracker-origin" value={defaultOrigin} onChange={(e) => setDefaultOrigin(e.target.value as OpportunityOrigin)} className="block w-full rounded border bg-background px-2 py-2 text-sm">
              {OPPORTUNITY_ORIGINS.map((o) => <option key={o} value={o}>{ORIGIN_LABELS[o]}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">{ORIGIN_DESCRIPTIONS[defaultOrigin]} You can re-tag individual rows after import.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tracker-file">Excel file (.xlsx / .xls)</Label>
            <Input id="tracker-file" type="file" accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <Button type="button" size="sm" onClick={previewFile} disabled={!file}>Preview headers</Button>
        </CardContent>
      </Card>

      {step !== "upload" && sheet0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">2 · Map columns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Detected sheet <span className="font-medium">{sheet0.sheet}</span> with {sheet0.headers.length} column(s). Auto-mapping shown below — adjust any mismatches.
            </p>
            <FieldMappingForm headers={sheet0.headers} mapping={mapping} onChange={setMapping} />
            <div className="text-xs text-muted-foreground">
              <details>
                <summary className="cursor-pointer">Preview first {sheet0.sampleRows.length} rows</summary>
                <div className="overflow-x-auto mt-2">
                  <table className="text-xs border">
                    <thead><tr>{sheet0.headers.map((h) => <th key={h} className="border px-2 py-1 text-left">{h}</th>)}</tr></thead>
                    <tbody>
                      {sheet0.sampleRows.map((r, i) => (
                        <tr key={i}>{sheet0.headers.map((h) => <td key={h} className="border px-2 py-1">{String((r as Record<string, unknown>)[h] ?? "")}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={save} disabled={step === "saving"}>
                {step === "saving" ? "Importing…" : "Save tracker + import"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "done" && (
        <Card>
          <CardContent className="p-4 text-sm">
            Imported {importedCount} opportunity(ies).{" "}
            <button type="button" onClick={() => router.push("/pipeline")} className="underline">Open pipeline</button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
