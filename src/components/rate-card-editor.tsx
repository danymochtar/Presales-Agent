"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Item = {
  id: string;
  role: string;
  level: string;
  dailyRate: number;
  currency: string;
  location: string;
};

export function RateCardEditor({ initial }: { initial: Item[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ role: "", level: "Senior", dailyRate: 0, currency: "USD", location: "MY" });
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    setErr(null);
    const res = await fetch("/api/tenant/rate-card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(typeof d.error === "string" ? d.error : "create failed");
      return;
    }
    const { item } = await res.json();
    setItems([...items, item]);
    setAdding(false);
    setDraft({ role: "", level: "Senior", dailyRate: 0, currency: "USD", location: "MY" });
    startTransition(() => router.refresh());
  }

  async function update(id: string, patch: Partial<Item>) {
    setErr(null);
    const res = await fetch(`/api/tenant/rate-card/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setErr("update failed");
      return;
    }
    const { item } = await res.json();
    setItems(items.map((i) => (i.id === id ? item : i)));
  }

  async function remove(id: string) {
    if (!confirm("Delete this row?")) return;
    setErr(null);
    const res = await fetch(`/api/tenant/rate-card/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setErr("delete failed");
      return;
    }
    setItems(items.filter((i) => i.id !== id));
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="text-left py-2">Role</th>
              <th className="text-left">Level</th>
              <th className="text-right">Daily rate</th>
              <th className="text-left pl-3">Currency</th>
              <th className="text-left pl-3">Location</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-t">
                <td className="py-1.5">
                  <Input defaultValue={it.role} className="h-8" onBlur={(e) => e.target.value !== it.role && update(it.id, { role: e.target.value })} />
                </td>
                <td>
                  <Input defaultValue={it.level} className="h-8" onBlur={(e) => e.target.value !== it.level && update(it.id, { level: e.target.value })} />
                </td>
                <td className="text-right">
                  <Input
                    type="number"
                    step="50"
                    defaultValue={it.dailyRate}
                    className="h-8 text-right"
                    onBlur={(e) => Number(e.target.value) !== it.dailyRate && update(it.id, { dailyRate: Number(e.target.value) })}
                  />
                </td>
                <td className="pl-3">
                  <Input defaultValue={it.currency} className="h-8 w-20" onBlur={(e) => e.target.value !== it.currency && update(it.id, { currency: e.target.value })} />
                </td>
                <td className="pl-3">
                  <Input defaultValue={it.location} className="h-8 w-20" onBlur={(e) => e.target.value !== it.location && update(it.id, { location: e.target.value })} />
                </td>
                <td>
                  <Button variant="ghost" size="sm" onClick={() => remove(it.id)}>×</Button>
                </td>
              </tr>
            ))}
            {adding && (
              <tr className="border-t bg-accent/40">
                <td className="py-1.5">
                  <Input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} className="h-8" placeholder="Cloud Engineer" autoFocus />
                </td>
                <td>
                  <Input value={draft.level} onChange={(e) => setDraft({ ...draft, level: e.target.value })} className="h-8" />
                </td>
                <td className="text-right">
                  <Input type="number" value={draft.dailyRate || ""} onChange={(e) => setDraft({ ...draft, dailyRate: Number(e.target.value) })} className="h-8 text-right" />
                </td>
                <td className="pl-3">
                  <Input value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })} className="h-8 w-20" />
                </td>
                <td className="pl-3">
                  <Input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} className="h-8 w-20" />
                </td>
                <td className="space-x-1 whitespace-nowrap">
                  <Button size="sm" onClick={add} disabled={!draft.role || !draft.level || draft.dailyRate <= 0}>Add</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>×</Button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!adding && (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)} disabled={pending}>
          + Add row
        </Button>
      )}
      {err && <p className="text-xs text-destructive">{err}</p>}
      <p className="text-xs text-muted-foreground">Edits save on blur. Daily rate in the listed currency. Used in BOM/proposal effort costing.</p>
    </div>
  );
}
