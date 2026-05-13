"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type DeletedCounts = {
  llmCalls: number;
  learnedPatterns: number;
  templates: number;
  knowledgeSamples: number;
  trackers: number;
  engagements: number;
  rateCardItems: number;
  serviceCatalogItems: number;
};

const CONFIRM_PHRASE = "RESET WORKSPACE";

export function ResetWorkspaceButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<DeletedCounts | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (typed !== CONFIRM_PHRASE) return;
    setRunning(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/reset-workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: CONFIRM_PHRASE }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "reset failed");
      setDone(j.deleted as DeletedCounts);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "reset failed");
    } finally {
      setRunning(false);
    }
  }

  if (done) {
    const total = Object.values(done).reduce((s, n) => s + n, 0);
    return (
      <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-900/10 p-3 text-sm">
        <p className="font-medium text-emerald-900 dark:text-emerald-200">
          Workspace reset. {total} rows removed.
        </p>
        <ul className="text-xs text-emerald-800/80 dark:text-emerald-200/70 mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
          <li>Engagements: {done.engagements}</li>
          <li>Trackers + opportunities: {done.trackers}</li>
          <li>Templates: {done.templates}</li>
          <li>Custom rules: {done.learnedPatterns}</li>
          <li>Knowledge samples: {done.knowledgeSamples}</li>
          <li>LLM call logs: {done.llmCalls}</li>
          <li>Rate card rows: {done.rateCardItems}</li>
          <li>Service catalog rows: {done.serviceCatalogItems}</li>
        </ul>
      </div>
    );
  }

  if (!open) {
    return (
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Reset workspace…
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-rose-300 bg-rose-50 dark:bg-rose-900/10 p-3">
      <p className="text-sm font-medium text-rose-900 dark:text-rose-200">
        This permanently deletes every engagement, deliverable, opportunity, tracker, template, custom
        rule, LLM call log, rate-card row and service-catalog row in this tenant.
      </p>
      <p className="text-xs text-rose-900/80 dark:text-rose-200/80">
        Your user account, tenant config (identity / commercial / standards / compliance / guardrails),
        and sign-in sessions stay intact. There is <strong>no undo</strong>.
      </p>
      <div className="space-y-1">
        <label htmlFor="reset-confirm" className="text-xs text-rose-900/80 dark:text-rose-200/80">
          Type <code className="rounded bg-rose-200/60 dark:bg-rose-900/40 px-1">{CONFIRM_PHRASE}</code> to enable the button.
        </label>
        <input
          id="reset-confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="flex h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 py-1 text-sm"
          autoFocus
        />
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <div className="flex gap-2">
        <Button
          variant="destructive"
          disabled={typed !== CONFIRM_PHRASE || running}
          onClick={run}
        >
          {running ? "Resetting…" : "Reset workspace permanently"}
        </Button>
        <Button variant="ghost" onClick={() => { setOpen(false); setTyped(""); setErr(null); }} disabled={running}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
