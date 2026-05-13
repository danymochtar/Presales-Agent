"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FY_PRESETS, suggestFyLabel, type FiscalYearConfig } from "@/lib/fiscal-year";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatRange(startMonth: number, startDay: number): { start: string; end: string } {
  const today = new Date();
  const cur = new Date(today.getFullYear(), startMonth - 1, startDay);
  const start = cur > today ? new Date(today.getFullYear() - 1, startMonth - 1, startDay) : cur;
  const end = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate() - 1);
  const fmt = (d: Date) => `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
  return { start: fmt(start), end: fmt(end) };
}

export function FiscalYearSetupForm({ initial }: { initial: FiscalYearConfig | null }) {
  const router = useRouter();
  const [startMonth, setStartMonth] = useState(initial?.startMonth ?? 7);
  const [startDay, setStartDay] = useState(initial?.startDay ?? 1);
  const [label, setLabel] = useState(initial?.currentLabel ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Auto-suggest the FY label whenever start month/day change AND the user
  // hasn't overridden manually. Treat empty / "FYxx" as auto-mode.
  const suggested = useMemo(() => suggestFyLabel(startMonth, startDay), [startMonth, startDay]);
  const useSuggested = !label || /^FY\d{0,2}$/.test(label);
  const effectiveLabel = useSuggested ? suggested : label;

  const range = formatRange(startMonth, startDay);

  function applyPreset(value: string) {
    const p = FY_PRESETS.find((x) => x.value === value);
    if (!p) return;
    setStartMonth(p.startMonth);
    setStartDay(p.startDay);
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/tenant/fiscal-year", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startMonth, startDay, currentLabel: effectiveLabel }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === "string" ? j.error : "save failed");
      }
      setSavedAt(new Date().toLocaleTimeString());
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="fy-preset">Preset (optional)</Label>
        <select
          id="fy-preset"
          onChange={(e) => applyPreset(e.target.value)}
          defaultValue=""
          className="block w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="" disabled>Pick a common preset…</option>
          {FY_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="fy-start-month">Start month</Label>
          <select
            id="fy-start-month"
            value={startMonth}
            onChange={(e) => setStartMonth(Number(e.target.value))}
            className="block w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fy-start-day">Start day</Label>
          <Input
            id="fy-start-day"
            type="number"
            min={1}
            max={31}
            value={startDay}
            onChange={(e) => setStartDay(Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fy-label">Current FY label</Label>
          <Input
            id="fy-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={suggested}
          />
          <p className="text-[11px] text-muted-foreground">
            Auto-suggested: <strong>{suggested}</strong>. Override if your team uses a different convention (e.g. &quot;FY2027&quot;).
          </p>
        </div>
      </div>

      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        <strong>{effectiveLabel}</strong> runs <strong>{range.start}</strong> → <strong>{range.end}</strong>.
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {savedAt ? `Saved at ${savedAt}.` : "Saved on the tenant — every user sees the same fiscal calendar."}
        </p>
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : initial ? "Update" : "Save fiscal year"}</Button>
      </div>
    </div>
  );
}
