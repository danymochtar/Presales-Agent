"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MCEM_PHASES,
  PHASE_LABELS,
  PHASE_DESCRIPTIONS,
  itemsForPhase,
  phaseForStage,
  score,
  healthBand,
  type Mcem,
  type McemItemKey,
  type McemPhase,
} from "@/lib/mcem";

const BAND_COLORS: Record<"red" | "amber" | "green", string> = {
  red:   "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200 border-rose-300 dark:border-rose-900/50",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 border-amber-300 dark:border-amber-900/50",
  green: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200 border-emerald-300 dark:border-emerald-900/50",
};

export function McemForm({
  engagementId,
  stage,
  initial,
}: {
  engagementId: string;
  stage: string;
  initial: Mcem;
}) {
  const router = useRouter();
  const [data, setData] = useState<Mcem>(initial ?? {});
  const [busy, setBusy] = useState<McemItemKey | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const currentPhase = phaseForStage(stage);
  const [expanded, setExpanded] = useState<Set<McemPhase>>(new Set([currentPhase]));

  const health = useMemo(() => score(data, stage), [data, stage]);
  const band = healthBand(health.totalPct);

  function togglePhase(p: McemPhase) {
    const next = new Set(expanded);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setExpanded(next);
  }

  async function toggleItem(key: McemItemKey, done: boolean) {
    setBusy(key);
    setErr(null);
    const optimistic: Mcem = {
      ...data,
      [key]: {
        ...(data[key] ?? {}),
        done,
        completedAt: done ? new Date().toISOString() : null,
      },
    };
    setData(optimistic);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/mcem`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, done }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === "string" ? j.error : "save failed");
      }
      router.refresh();
    } catch (e) {
      setData(data); // rollback
      setErr(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(null);
    }
  }

  async function saveNote(key: McemItemKey, note: string) {
    setBusy(key);
    setErr(null);
    setData((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { done: false }), note } }));
    try {
      const res = await fetch(`/api/engagements/${engagementId}/mcem`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, note }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === "string" ? j.error : "save failed");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className={`rounded-md border p-3 ${BAND_COLORS[band]} flex items-start justify-between gap-3 flex-wrap`}>
        <div className="min-w-0">
          <p className="text-sm font-medium">
            MCEM — {health.phaseLabel} · {health.done} / {health.total} complete ({health.totalPct}%)
          </p>
          <p className="text-xs mt-0.5">
            {health.blockers[0]
              ? `Next: ${health.blockers[0].reason.replace(" not yet complete", "")}.`
              : "All exit criteria done — ready to move to the next phase."}
          </p>
        </div>
        <div className="text-xs uppercase tracking-wider shrink-0">Stage: {stage.replace(/_/g, " ")}</div>
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}

      <div className="space-y-3">
        {MCEM_PHASES.map((phase, idx) => {
          const items = itemsForPhase(phase);
          if (items.length === 0) return null;
          const isCurrent = phase === currentPhase;
          const isExpanded = expanded.has(phase);
          const doneCount = items.filter((it) => data[it.key]?.done).length;
          const allDone = doneCount === items.length;
          return (
            <Card key={phase} className={isCurrent ? "border-primary/60" : ""}>
              <CardHeader className="pb-2 cursor-pointer" onClick={() => togglePhase(phase)}>
                <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
                  <span className="flex items-center gap-2">
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${allDone ? "bg-emerald-600 text-white" : isCurrent ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {idx + 1}
                    </span>
                    <span>Phase {idx + 1} · {PHASE_LABELS[phase]}</span>
                    {isCurrent && (
                      <span className="text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 bg-primary/10 text-primary">
                        current
                      </span>
                    )}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {doneCount} / {items.length} {isExpanded ? "▾" : "▸"}
                  </span>
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">{PHASE_DESCRIPTIONS[phase]}</p>
              </CardHeader>
              {isExpanded && (
                <CardContent className="space-y-2 pt-1">
                  {items.map((it) => {
                    const entry = data[it.key];
                    const done = !!entry?.done;
                    const note = entry?.note ?? "";
                    return (
                      <div key={it.key} className={`rounded-md border p-3 ${done ? "bg-emerald-50/40 dark:bg-emerald-900/10" : ""}`}>
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={done}
                            disabled={busy === it.key}
                            onChange={(e) => toggleItem(it.key, e.target.checked)}
                            className="mt-1 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : ""}`}>{it.label}</span>
                              {it.actionPath && !done && (
                                <Link
                                  href={it.actionPath.replace("{id}", engagementId)}
                                  className="text-[11px] text-primary hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Open →
                                </Link>
                              )}
                              {entry?.completedAt && done && (
                                <span className="text-[11px] text-muted-foreground">
                                  ✓ {new Date(entry.completedAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{it.help}</p>
                          </div>
                        </label>
                        <textarea
                          value={note}
                          onChange={(e) => setData((prev) => ({ ...prev, [it.key]: { ...(prev[it.key] ?? { done: false }), note: e.target.value } }))}
                          onBlur={(e) => {
                            if ((entry?.note ?? "") !== e.target.value) void saveNote(it.key, e.target.value);
                          }}
                          placeholder="Notes (optional) — names, dates, links."
                          className="mt-2 w-full min-h-[40px] rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                        />
                      </div>
                    );
                  })}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      <div className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-3">
        <strong className="text-foreground">MCEM</strong> = Microsoft Customer Engagement Methodology. Five phases from
        listening to managing — each phase has exit criteria the team needs to clear before progressing. The current
        phase is auto-derived from the engagement&apos;s funnel stage.{" "}
        <Link href="/help" className="underline">Read more in the guide.</Link>
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" onClick={() => router.push(`/engagements/${engagementId}`)}>
          ← Back to engagement
        </Button>
      </div>
    </div>
  );
}
