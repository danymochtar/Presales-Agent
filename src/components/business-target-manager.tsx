"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TARGET_PERIODS,
  PERIOD_LABELS,
  TARGET_METRICS,
  METRIC_LABELS,
  metricIsCurrency,
  type TargetPeriod,
  type TargetMetric,
} from "@/lib/business/targets";
import { TARGET_CLOUDS, CLOUD_LABELS, CLOUD_COLORS, type TargetCloud } from "@/lib/business/cloud-of-vendor";
import { SEGMENTS } from "@/lib/team/roles";

export type BusinessTargetRow = {
  id: string;
  fiscalYear: string;
  period: string;
  metric: string;
  cloud: string;
  productKey: string | null;
  segment: string | null;
  ownerId: string | null;
  owner: { id: string; name: string; role: string } | null;
  valueUsd: number | null;
  notes: string | null;
};

export type PersonnelOption = { id: string; name: string; role: string };

type FormState = {
  fiscalYear: string;
  period: TargetPeriod;
  metric: TargetMetric;
  cloud: TargetCloud;
  productKey: string;
  segment: string;
  ownerId: string;
  valueUsd: string;
  notes: string;
};

function emptyForm(currentFy: string): FormState {
  return {
    fiscalYear: currentFy,
    period: "year",
    metric: "revenue",
    cloud: "azure",
    productKey: "",
    segment: "",
    ownerId: "",
    valueUsd: "",
    notes: "",
  };
}

export function BusinessTargetManager({
  initial,
  personnel,
  currentFy,
}: {
  initial: BusinessTargetRow[];
  personnel: PersonnelOption[];
  currentFy: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState<BusinessTargetRow[]>(initial);
  const [form, setForm] = useState<FormState>(emptyForm(currentFy));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fyList = useMemo(() => {
    const set = new Set<string>([currentFy]);
    for (const t of items) set.add(t.fiscalYear);
    return Array.from(set).sort().reverse();
  }, [items, currentFy]);

  function startEdit(t: BusinessTargetRow) {
    setEditingId(t.id);
    setForm({
      fiscalYear: t.fiscalYear,
      period: t.period as TargetPeriod,
      metric: t.metric as TargetMetric,
      cloud: t.cloud as TargetCloud,
      productKey: t.productKey ?? "",
      segment: t.segment ?? "",
      ownerId: t.ownerId ?? "",
      valueUsd: t.valueUsd != null ? String(t.valueUsd) : "",
      notes: t.notes ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm(currentFy));
    setErr(null);
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        fiscalYear: form.fiscalYear.trim(),
        period: form.period,
        metric: form.metric,
        cloud: form.cloud,
        productKey: form.productKey.trim() || null,
        segment: form.segment || null,
        ownerId: form.ownerId || null,
        valueUsd: form.valueUsd.trim() === "" ? null : Number(form.valueUsd),
        notes: form.notes.trim() || null,
      };
      const url = editingId ? `/api/business/targets/${editingId}` : "/api/business/targets";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === "string" ? j.error : "save failed");
      }
      const { target } = await res.json();
      const owner = personnel.find((p) => p.id === target.ownerId) ?? null;
      const row: BusinessTargetRow = { ...target, owner };
      if (editingId) {
        setItems((cur) => cur.map((t) => (t.id === editingId ? row : t)));
      } else {
        setItems((cur) => [...cur, row]);
      }
      cancelEdit();
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this target?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/business/targets/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === "string" ? j.error : "delete failed");
      }
      setItems((cur) => cur.filter((t) => t.id !== id));
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{editingId ? "Edit target" : "Add a target"}</CardTitle>
          <CardDescription>
            Slice the target however you need — by fiscal period (Y / Q / M), cloud (Azure / AWS / GCP / Services /
            Cross-cloud), product line (free text — &ldquo;Azure IaaS&rdquo;, &ldquo;Data + AI&rdquo;, &ldquo;Managed
            Services&rdquo; …), segment, and owner. Each row is a separate target. Delete a row to drop the slice.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-fy">Fiscal year</Label>
              <Input id="t-fy" value={form.fiscalYear} onChange={(e) => setForm({ ...form, fiscalYear: e.target.value })} placeholder={currentFy} list="t-fy-list" />
              <datalist id="t-fy-list">
                {fyList.map((y) => <option key={y} value={y} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-period">Period</Label>
              <select id="t-period" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value as TargetPeriod })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {TARGET_PERIODS.map((p) => <option key={p} value={p}>{PERIOD_LABELS[p]}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-metric">Metric</Label>
              <select id="t-metric" value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value as TargetMetric })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {TARGET_METRICS.map((m) => <option key={m} value={m}>{METRIC_LABELS[m]}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-cloud">Cloud</Label>
              <select id="t-cloud" value={form.cloud} onChange={(e) => setForm({ ...form, cloud: e.target.value as TargetCloud })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {TARGET_CLOUDS.map((c) => <option key={c} value={c}>{CLOUD_LABELS[c]}</option>)}
              </select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="t-product">Product / line (optional)</Label>
              <Input id="t-product" value={form.productKey} onChange={(e) => setForm({ ...form, productKey: e.target.value })} placeholder="e.g. Azure IaaS, Data + AI, Managed Services" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-segment">Segment</Label>
              <select id="t-segment" value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">— Any —</option>
                {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-owner">Owner</Label>
              <select id="t-owner" value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">— Team-wide —</option>
                {personnel.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-value">
                Value {metricIsCurrency(form.metric) ? "(USD)" : form.metric === "deal_count" ? "(count)" : ""}
              </Label>
              <Input id="t-value" type="number" value={form.valueUsd} onChange={(e) => setForm({ ...form, valueUsd: e.target.value })} placeholder="e.g. 1500000" />
            </div>
            <div className="space-y-1.5 md:col-span-3">
              <Label htmlFor="t-notes">Notes (optional)</Label>
              <Input id="t-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Stretch vs commit, source approval, etc." />
            </div>
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex justify-end gap-2">
            {editingId && <Button variant="ghost" onClick={cancelEdit} disabled={busy}>Cancel</Button>}
            <Button onClick={save} disabled={busy}>{busy ? "Saving…" : editingId ? "Update" : "Add target"}</Button>
          </div>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No targets yet. Add one above — start with a full-year revenue target per cloud (Azure / AWS / GCP), then
            layer in quarterly + owner-level slices as needed.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Targets ({items.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">FY · Period</th>
                    <th className="px-3 py-2 font-medium">Metric</th>
                    <th className="px-3 py-2 font-medium">Cloud</th>
                    <th className="px-3 py-2 font-medium">Product</th>
                    <th className="px-3 py-2 font-medium">Segment</th>
                    <th className="px-3 py-2 font-medium">Owner</th>
                    <th className="px-3 py-2 font-medium text-right">Value</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((t) => (
                    <tr key={t.id} className="border-b">
                      <td className="px-3 py-2 whitespace-nowrap">{t.fiscalYear} · {PERIOD_LABELS[t.period as TargetPeriod] ?? t.period}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{METRIC_LABELS[t.metric as TargetMetric] ?? t.metric}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${CLOUD_COLORS[t.cloud as TargetCloud] ?? CLOUD_COLORS.all}`}>
                          {CLOUD_LABELS[t.cloud as TargetCloud] ?? t.cloud}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{t.productKey ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{t.segment ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{t.owner?.name ?? "Team"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {t.valueUsd != null ? (metricIsCurrency(t.metric) ? `$${Number(t.valueUsd).toLocaleString()}` : Number(t.valueUsd).toLocaleString()) : "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-right">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(t)} disabled={busy}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(t.id)} disabled={busy}>Delete</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
