"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MEDDPICC_FIELDS,
  emptyMeddpicc,
  score,
  healthBand,
  type Meddpicc,
  type MeddpiccField,
  type Confidence,
} from "@/lib/meddpicc";

const BAND_COLORS: Record<"red" | "amber" | "green", string> = {
  red:   "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  green: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
};

const CONF_OPTIONS: { value: Confidence; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export function MeddpiccForm({
  projectId,
  stage,
  initial,
}: {
  projectId: string;
  stage: string;
  initial: Meddpicc;
}) {
  const router = useRouter();
  const [data, setData] = useState<Meddpicc>(initial ?? emptyMeddpicc());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const health = useMemo(() => score(data, stage), [data, stage]);
  const band = healthBand(health.totalPct);

  function setField(key: MeddpiccField, patch: Partial<{ value: string | null; confidence: Confidence }>) {
    setData((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const body = Object.fromEntries(
        MEDDPICC_FIELDS.map(({ key }) => [key, { value: data[key].value, confidence: data[key].confidence }]),
      );
      const res = await fetch(`/api/projects/${projectId}/meddpicc`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === "string" ? j.error : "save failed");
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className={`rounded-md p-3 ${BAND_COLORS[band]} flex items-start justify-between gap-3`}>
        <div>
          <p className="text-sm font-medium">Deal health: {health.totalPct}%</p>
          <p className="text-xs">
            {health.blockers[0]
              ? `Top blocker: ${health.blockers[0].reason}`
              : "All fields populated and fresh — well qualified."}
          </p>
        </div>
        <div className="text-xs uppercase tracking-wider">{stage}</div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">MEDDPICC</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {MEDDPICC_FIELDS.map(({ key, label, help }) => (
            <div key={key} className="space-y-1.5 border rounded-md p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label htmlFor={key}>{label}</Label>
                <select
                  value={data[key].confidence}
                  onChange={(e) => setField(key, { confidence: e.target.value as Confidence })}
                  className="h-7 text-xs rounded-md border border-input bg-background px-2"
                  aria-label={`${label} confidence`}
                >
                  {CONF_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">{help}</p>
              <textarea
                id={key}
                value={data[key].value ?? ""}
                onChange={(e) => setField(key, { value: e.target.value || null })}
                className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder={`Notes on ${label.toLowerCase()}`}
              />
              {data[key].lastUpdated && (
                <p className="text-[11px] text-muted-foreground">
                  Last updated {new Date(data[key].lastUpdated!).toLocaleDateString()}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {err && <p className="text-sm text-destructive">{err}</p>}

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}
