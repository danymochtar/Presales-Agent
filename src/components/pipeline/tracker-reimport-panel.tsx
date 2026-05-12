"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TrackerReimportPanel({ trackerId }: { trackerId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function reimport() {
    if (!file) { setErr("choose a file"); return; }
    setBusy(true); setErr(null); setStatus(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("mode", mode);
      const res = await fetch(`/api/pipeline/trackers/${trackerId}/import`, { method: "POST", body: fd });
      if (!res.ok) { setErr(await res.text()); return; }
      const r = await res.json();
      setStatus(`Imported · inserted ${r.inserted}, updated ${r.upserted}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    if (!confirm("Delete this tracker and all its opportunities? This cannot be undone.")) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/pipeline/trackers/${trackerId}`, { method: "DELETE" });
      if (!res.ok) { setErr(await res.text()); return; }
      router.push("/pipeline/trackers");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Re-import / delete</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="reimport-file">Updated source file</Label>
            <Input id="reimport-file" type="file" accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mode">Mode</Label>
            <select id="mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="block w-full rounded border bg-background px-2 py-2 text-sm">
              <option value="append">Append + upsert by External ID</option>
              <option value="replace">Replace (delete + re-import)</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={reimport} disabled={busy || !file}>
            {busy ? "Working…" : "Re-import"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={destroy} disabled={busy}>
            Delete tracker
          </Button>
        </div>
        {status && <p className="text-xs text-muted-foreground">{status}</p>}
        {err && <p className="text-xs text-destructive">{err}</p>}
      </CardContent>
    </Card>
  );
}
