"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/tenant-settings";

const FIELDS: { key: keyof Thresholds; label: string; help: string; min: number; max: number }[] = [
  { key: "mcemGreenPct",            label: "MCEM green cutoff (%)",         help: "Engagements with ≥ this MCEM score render the green band on the dashboard chip. Default 70.", min: 0, max: 100 },
  { key: "mcemAmberPct",            label: "MCEM amber cutoff (%)",         help: "Engagements with ≥ this score render amber; below it renders red. Must be lower than green. Default 40.", min: 0, max: 100 },
  { key: "fileSizeMb",              label: "Upload file size cap (MB)",     help: "Applies to every upload form — pipeline trackers, reference library, engagement documents. Default 10.", min: 1, max: 200 },
  { key: "dashboardLookbackDays",   label: "Dashboard \"this week\" window (days)", help: "How far back the dashboard's recent-activity card looks. Default 7.", min: 1, max: 365 },
  { key: "dashboardActiveMax",      label: "Active engagements list max",    help: "How many open engagements show on the dashboard before \"View all\". Default 5.", min: 1, max: 50 },
  { key: "dashboardNextActionsMax", label: "Next actions list max",          help: "How many \"first undone MCEM item\" rows render on the dashboard. Default 6.", min: 1, max: 50 },
];

export function ThresholdsForm({ initial }: { initial: Thresholds }) {
  const router = useRouter();
  const [v, setV] = useState<Thresholds>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function save() {
    if (v.mcemGreenPct <= v.mcemAmberPct) {
      setMsg({ kind: "err", text: "MCEM green cutoff must be higher than amber cutoff." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/tenant/thresholds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === "string" ? j.error : "save failed");
      }
      setMsg({ kind: "ok", text: "Saved." });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "save failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={`th-${f.key}`} className="flex items-center gap-1.5">
              {f.label}
              <HelpTooltip text={f.help} />
            </Label>
            <Input
              id={`th-${f.key}`}
              type="number"
              min={f.min}
              max={f.max}
              value={v[f.key]}
              onChange={(e) => setV({ ...v, [f.key]: Number(e.target.value) || 0 })}
            />
            <p className="text-[10px] text-muted-foreground">Default {DEFAULT_THRESHOLDS[f.key]}.</p>
          </div>
        ))}
      </div>

      {msg && <p className={`text-sm ${msg.kind === "ok" ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"}`}>{msg.text}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setV(DEFAULT_THRESHOLDS)} disabled={busy}>Reset to defaults</Button>
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save thresholds"}</Button>
      </div>
    </div>
  );
}
