"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TYPES = [
  { value: "assessment",     label: "Assessment" },
  { value: "architecture",   label: "Architecture" },
  { value: "bom",            label: "BOM" },
  { value: "tco",            label: "TCO" },
  { value: "project_plan",   label: "Project plan" },
  { value: "proposal",       label: "Proposal" },
  { value: "sow",            label: "SOW" },
  { value: "ms_offering",    label: "Managed services offering" },
  { value: "letterhead",     label: "Letterhead / brand" },
  { value: "other",          label: "Other" },
];

const CLOUDS = [
  { value: "", label: "Any cloud" },
  { value: "azure", label: "Azure" },
  { value: "aws", label: "AWS" },
  { value: "gcp", label: "GCP" },
];

const PROJECT_TYPES = [
  { value: "", label: "Any project type" },
  { value: "migration", label: "Migration" },
  { value: "greenfield", label: "Greenfield" },
  { value: "modernization", label: "Modernization" },
  { value: "dr", label: "DR / Resilience" },
  { value: "poc", label: "POC / Pilot" },
  { value: "optimization", label: "Optimization" },
];

export function TemplateUploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  const [meta, setMeta] = useState({ type: "bom", name: "", description: "", cloudProvider: "", projectType: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (!file && pasted.trim().length < 20) {
      setErr("upload a file or paste at least 20 chars of reference text");
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      if (file) fd.append("file", file);
      if (pasted.trim().length >= 20) fd.append("textContent", pasted);
      fd.append("type", meta.type);
      fd.append("name", meta.name);
      if (meta.description) fd.append("description", meta.description);
      if (meta.cloudProvider) fd.append("cloudProvider", meta.cloudProvider);
      if (meta.projectType) fd.append("projectType", meta.projectType);
      const res = await fetch("/api/admin/templates", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "upload failed");
      setMsg(`Saved "${data.template.name}" (${data.template.type}).`);
      setFile(null);
      setPasted("");
      setMeta({ type: "bom", name: "", description: "", cloudProvider: "", projectType: "" });
      const input = document.getElementById("tpl-file") as HTMLInputElement | null;
      if (input) input.value = "";
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="tpl-name">Template name</Label>
          <Input id="tpl-name" required value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} placeholder="Standard BFSI Migration BOM" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tpl-type">Deliverable type</Label>
          <select
            id="tpl-type"
            value={meta.type}
            onChange={(e) => setMeta({ ...meta, type: e.target.value })}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tpl-cloud">Applies to cloud (optional filter)</Label>
          <select
            id="tpl-cloud"
            value={meta.cloudProvider}
            onChange={(e) => setMeta({ ...meta, cloudProvider: e.target.value })}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {CLOUDS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tpl-ptype">Applies to project type (optional)</Label>
          <select
            id="tpl-ptype"
            value={meta.projectType}
            onChange={(e) => setMeta({ ...meta, projectType: e.target.value })}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {PROJECT_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tpl-desc">Description (optional)</Label>
        <Input id="tpl-desc" value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} placeholder="House-style BOM used on BFSI deals — strict on RI / AHB language" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tpl-file">Upload reference document (optional — xlsx, docx, pdf, txt, md)</Label>
        <input
          id="tpl-file"
          type="file"
          accept=".xlsx,.xls,.docx,.pdf,.txt,.md"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-secondary/80"
        />
        <p className="text-xs text-muted-foreground">The agent extracts text content and uses it as a few-shot reference when generating matching deliverables.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tpl-pasted">…or paste reference content directly (markdown / plain text)</Label>
        <textarea
          id="tpl-pasted"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder="Paste an example BOM markdown, structure outline, or style guide…"
          className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}
      {msg && <p className="text-sm text-green-700 dark:text-green-400">{msg}</p>}

      <Button type="submit" disabled={loading || !meta.name}>
        {loading ? "Uploading…" : "Save template"}
      </Button>
    </form>
  );
}
