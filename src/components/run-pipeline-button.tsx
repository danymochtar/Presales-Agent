"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type StageId = "assessment" | "architecture" | "bom" | "tco" | "project-plan" | "proposal";

const STAGES: Array<{ id: StageId; label: string; pathFor: (pid: string, cloud: string) => string }> = [
  { id: "assessment",   label: "Assessment",   pathFor: (p, c) => `/api/projects/${p}/assessment/generate?cloud=${c}` },
  { id: "architecture", label: "Architecture", pathFor: (p, c) => `/api/projects/${p}/architecture/generate?cloud=${c}` },
  { id: "bom",          label: "BOM",          pathFor: (p, c) => `/api/projects/${p}/bom/generate?cloud=${c}` },
  { id: "tco",          label: "TCO",          pathFor: (p, c) => `/api/projects/${p}/tco/generate?cloud=${c}` },
  { id: "project-plan", label: "Project plan", pathFor: (p, c) => `/api/projects/${p}/project-plan/generate?cloud=${c}` },
  { id: "proposal",     label: "Proposal",     pathFor: (p, c) => `/api/projects/${p}/proposal/generate?cloud=${c}` },
];

async function streamGenerate(path: string, onProgress?: (chars: number) => void): Promise<void> {
  const res = await fetch(path, { method: "POST" });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let chars = 0;
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
        if (typeof payload.delta === "string") {
          chars += payload.delta.length;
          onProgress?.(chars);
        }
        if (payload.error) throw new Error(payload.error);
        if (payload.done) return;
      } catch (e) {
        if (e instanceof Error && e.message && !e.message.startsWith("Unexpected token")) throw e;
      }
    }
  }
}

export function RunPipelineButton({
  projectId,
  targetClouds,
  hasInventory,
}: {
  projectId: string;
  targetClouds: string[];
  hasInventory: boolean;
}) {
  const router = useRouter();
  const cloudOptions = targetClouds.filter((c) => c !== "gcp");
  const [cloud, setCloud] = useState(cloudOptions[0] ?? "azure");
  const [running, setRunning] = useState(false);
  const [stepIdx, setStepIdx] = useState(-1);
  const [stepChars, setStepChars] = useState(0);
  const [err, setErr] = useState<{ stage: string; message: string } | null>(null);
  const [done, setDone] = useState(false);

  async function run() {
    setRunning(true);
    setErr(null);
    setDone(false);
    setStepChars(0);
    for (let i = 0; i < STAGES.length; i++) {
      setStepIdx(i);
      setStepChars(0);
      try {
        await streamGenerate(STAGES[i].pathFor(projectId, cloud), (c) => setStepChars(c));
      } catch (e) {
        setErr({
          stage: STAGES[i].label,
          message: e instanceof Error ? e.message : "unknown",
        });
        setRunning(false);
        router.refresh();
        return;
      }
    }
    setDone(true);
    setRunning(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Run for cloud</label>
          <select
            value={cloud}
            onChange={(e) => setCloud(e.target.value)}
            disabled={running}
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {cloudOptions.map((c) => (
              <option key={c} value={c}>{c.toUpperCase()}</option>
            ))}
            {cloudOptions.length >= 2 && <option value="compare">Compare</option>}
          </select>
        </div>
        <Button onClick={run} disabled={running || !hasInventory} className="h-10">
          {running ? `Running ${STAGES[stepIdx]?.label ?? ""}…` : done ? "Pipeline complete ✓" : "Run full analysis pipeline"}
        </Button>
        {!hasInventory && (
          <p className="text-xs text-muted-foreground self-center">Upload an inventory first.</p>
        )}
      </div>

      {(running || done) && (
        <ol className="text-xs space-y-1.5">
          {STAGES.map((s, i) => {
            const state = i < stepIdx ? "done" : i === stepIdx ? (running ? "active" : done ? "done" : "active") : "pending";
            return (
              <li key={s.id} className="flex items-center gap-2">
                <span className={`inline-block w-5 text-center ${
                  state === "done" ? "text-green-600" : state === "active" ? "text-primary" : "text-muted-foreground"
                }`}>
                  {state === "done" ? "✓" : state === "active" ? (running ? "⋯" : "▸") : "·"}
                </span>
                <span className={state === "pending" ? "text-muted-foreground" : ""}>{s.label}</span>
                {state === "active" && running && stepChars > 0 && (
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
            Earlier stages were saved as new versions. You can re-run the pipeline (it will create newer versions on top), or open the failed stage's tab and retry that one alone.
          </p>
        </div>
      )}
    </div>
  );
}
