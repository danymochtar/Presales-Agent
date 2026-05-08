"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Item = {
  id: string;
  service: string;
  defaultEffortDays: number;
  prerequisite: string | null;
  deliverable: string | null;
  notes: string | null;
};

export function CatalogEditor({ initial }: { initial: Item[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ service: "", defaultEffortDays: 1, prerequisite: "", deliverable: "", notes: "" });
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    setErr(null);
    const res = await fetch("/api/tenant/service-catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (!res.ok) {
      setErr("create failed");
      return;
    }
    const { item } = await res.json();
    setItems([...items, item]);
    setAdding(false);
    setDraft({ service: "", defaultEffortDays: 1, prerequisite: "", deliverable: "", notes: "" });
    startTransition(() => router.refresh());
  }

  async function update(id: string, patch: Partial<Item>) {
    const res = await fetch(`/api/tenant/service-catalog/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return setErr("update failed");
    const { item } = await res.json();
    setItems(items.map((i) => (i.id === id ? item : i)));
  }

  async function remove(id: string) {
    if (!confirm("Delete this service?")) return;
    const res = await fetch(`/api/tenant/service-catalog/${id}`, { method: "DELETE" });
    if (!res.ok) return setErr("delete failed");
    setItems(items.filter((i) => i.id !== id));
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="text-left py-2">Service</th>
              <th className="text-right">Mandays</th>
              <th className="text-left pl-3">Prerequisite</th>
              <th className="text-left pl-3">Deliverable</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-t">
                <td className="py-1.5">
                  <Input defaultValue={it.service} className="h-8" onBlur={(e) => e.target.value !== it.service && update(it.id, { service: e.target.value })} />
                </td>
                <td className="text-right">
                  <Input
                    type="number"
                    step="0.5"
                    defaultValue={it.defaultEffortDays}
                    className="h-8 text-right w-24"
                    onBlur={(e) => Number(e.target.value) !== it.defaultEffortDays && update(it.id, { defaultEffortDays: Number(e.target.value) })}
                  />
                </td>
                <td className="pl-3">
                  <Input
                    defaultValue={it.prerequisite ?? ""}
                    className="h-8"
                    onBlur={(e) => (e.target.value || null) !== it.prerequisite && update(it.id, { prerequisite: e.target.value || null })}
                  />
                </td>
                <td className="pl-3">
                  <Input
                    defaultValue={it.deliverable ?? ""}
                    className="h-8"
                    onBlur={(e) => (e.target.value || null) !== it.deliverable && update(it.id, { deliverable: e.target.value || null })}
                  />
                </td>
                <td>
                  <Button variant="ghost" size="sm" onClick={() => remove(it.id)}>×</Button>
                </td>
              </tr>
            ))}
            {adding && (
              <tr className="border-t bg-accent/40">
                <td className="py-1.5">
                  <Input value={draft.service} onChange={(e) => setDraft({ ...draft, service: e.target.value })} className="h-8" placeholder="Azure VM Migration (per VM)" autoFocus />
                </td>
                <td className="text-right">
                  <Input
                    type="number"
                    step="0.5"
                    value={draft.defaultEffortDays}
                    onChange={(e) => setDraft({ ...draft, defaultEffortDays: Number(e.target.value) })}
                    className="h-8 text-right w-24"
                  />
                </td>
                <td className="pl-3">
                  <Input value={draft.prerequisite} onChange={(e) => setDraft({ ...draft, prerequisite: e.target.value })} className="h-8" />
                </td>
                <td className="pl-3">
                  <Input value={draft.deliverable} onChange={(e) => setDraft({ ...draft, deliverable: e.target.value })} className="h-8" />
                </td>
                <td className="space-x-1 whitespace-nowrap">
                  <Button size="sm" onClick={add} disabled={!draft.service || draft.defaultEffortDays <= 0}>Add</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>×</Button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!adding && (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)} disabled={pending}>
          + Add service
        </Button>
      )}
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
