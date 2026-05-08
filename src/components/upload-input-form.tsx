"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function UploadInputForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setMsg(null);
    setErr(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/api/projects/${projectId}/inputs/parse`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "parse failed");
      setMsg(data.summary ?? "uploaded");
      setFile(null);
      const input = document.getElementById("file-input") as HTMLInputElement | null;
      if (input) input.value = "";
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex items-end gap-3">
      <div className="space-y-1.5 flex-1">
        <Label htmlFor="file-input">Add document (xlsx, docx, pdf, txt, md, csv — ≤10MB)</Label>
        <input
          id="file-input"
          type="file"
          accept=".xlsx,.xls,.docx,.pdf,.txt,.md,.csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-secondary/80"
        />
      </div>
      <Button type="submit" disabled={!file || loading}>{loading ? "Parsing..." : "Upload & parse"}</Button>
      {msg && <p className="text-xs text-muted-foreground max-w-sm truncate" title={msg}>{msg}</p>}
      {err && <p className="text-xs text-destructive">{err}</p>}
    </form>
  );
}
