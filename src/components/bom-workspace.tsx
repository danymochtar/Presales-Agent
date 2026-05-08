"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Version = { id: string; version: number; status: string; createdAt: string };

export function BomWorkspace({
  projectId,
  projectName,
  hasInput,
  versions,
  selectedContent,
  selectedVersion,
}: {
  projectId: string;
  projectName: string;
  hasInput: boolean;
  versions: Version[];
  selectedContent: string | null;
  selectedVersion: number | null;
}) {
  const router = useRouter();
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  async function generate() {
    if (!hasInput) {
      setErr("upload an inventory first");
      return;
    }
    setStreaming(true);
    setStreamText("");
    setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/bom/generate`, { method: "POST" });
      if (!res.ok || !res.body) {
        throw new Error(await res.text());
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const ev of events) {
          const line = ev.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.delta) setStreamText((t) => t + payload.delta);
            if (payload.done) router.refresh();
            if (payload.error) setErr(payload.error);
          } catch {}
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "stream failed");
    } finally {
      setStreaming(false);
    }
  }

  const display = streamText || selectedContent || "";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">BOM — {projectName}</h1>
          <p className="text-sm text-muted-foreground">
            {versions.length === 0 ? "No versions yet" : `Latest v${versions[0].version} · ${versions.length} version(s)`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={generate} disabled={streaming || !hasInput}>{streaming ? "Generating..." : "Generate new version"}</Button>
        </div>
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}

      <div className="grid grid-cols-4 gap-4">
        <Card className="col-span-1">
          <CardHeader><CardTitle className="text-sm">Versions</CardTitle></CardHeader>
          <CardContent>
            {versions.length === 0 ? (
              <p className="text-xs text-muted-foreground">none</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {versions.map((v) => (
                  <li key={v.id}>
                    <a
                      href={`?v=${v.version}`}
                      className={`block rounded px-2 py-1 hover:bg-accent ${v.version === selectedVersion ? "bg-accent" : ""}`}
                    >
                      v{v.version} <span className="text-xs text-muted-foreground">· {v.status}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader><CardTitle className="text-sm">{streaming ? "Streaming…" : selectedVersion ? `Version ${selectedVersion}` : "Preview"}</CardTitle></CardHeader>
          <CardContent>
            {display ? (
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{display}</pre>
            ) : (
              <p className="text-sm text-muted-foreground">Click "Generate new version" to draft a BOM.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
