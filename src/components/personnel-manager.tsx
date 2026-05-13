"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PERSONNEL_ROLES,
  ROLE_LABELS,
  ROLE_COLORS,
  ROLE_SHORT,
  SEGMENTS,
  type PersonnelRole,
} from "@/lib/team/roles";

export type Person = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  segment: string | null;
  active: boolean;
  notes: string | null;
};

type Form = {
  name: string;
  email: string;
  role: PersonnelRole;
  segment: string;
  notes: string;
  active: boolean;
};

const EMPTY: Form = { name: "", email: "", role: "solution_architect", segment: "", notes: "", active: true };

export function PersonnelManager({ initial }: { initial: Person[] }) {
  const router = useRouter();
  const [items, setItems] = useState<Person[]>(initial);
  const [form, setForm] = useState<Form>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function startEdit(p: Person) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      email: p.email ?? "",
      role: (p.role as PersonnelRole) ?? "other",
      segment: p.segment ?? "",
      notes: p.notes ?? "",
      active: p.active,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY);
    setErr(null);
  }

  async function save() {
    if (!form.name.trim()) { setErr("name is required"); return; }
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim() || null,
        role: form.role,
        segment: form.segment || null,
        notes: form.notes.trim() || null,
        active: form.active,
      };
      const url = editingId ? `/api/personnel/${editingId}` : "/api/personnel";
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
      const { personnel } = await res.json();
      if (editingId) {
        setItems((cur) => cur.map((p) => (p.id === editingId ? personnel : p)));
      } else {
        setItems((cur) => [...cur, personnel]);
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
    if (!confirm("Remove this person? Their existing assignments stay linked to the opportunity.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/personnel/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === "string" ? j.error : "delete failed");
      }
      setItems((cur) => cur.filter((p) => p.id !== id));
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "delete failed");
    } finally {
      setBusy(false);
    }
  }

  // Group by role for rendering.
  const byRole: Record<string, Person[]> = {};
  for (const p of items) (byRole[p.role] ??= []).push(p);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{editingId ? "Edit person" : "Add a person"}</CardTitle>
          <CardDescription>
            Name + role at minimum. Email + segment + notes are optional. Personnel can be assigned to multiple
            opportunities, multiple personnel can carry one opportunity, and one person can act in multiple roles
            (e.g. Solution Sales lead on one deal, Account Manager on another).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-name">Name *</Label>
              <Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Dany Mochtar" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-email">Email</Label>
              <Input id="p-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="dany@noventiq.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-role">Role *</Label>
              <select id="p-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as PersonnelRole })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {PERSONNEL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-segment">Segment ownership</Label>
              <select id="p-segment" value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">— Not segment-specific —</option>
                {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-notes">Notes</Label>
            <textarea id="p-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Specializations, accounts in flight, on-leave dates, etc." />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Active (uncheck to hide from assignment dropdowns without deleting the record)
          </label>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex justify-end gap-2">
            {editingId && (
              <Button variant="ghost" onClick={cancelEdit} disabled={busy}>Cancel</Button>
            )}
            <Button onClick={save} disabled={busy || !form.name.trim()}>
              {busy ? "Saving…" : editingId ? "Update" : "Add"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No team members yet. Add your Solution Architects, Sales reps, and Account Managers above. Once added you can
            assign them to opportunities on the pipeline page.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {PERSONNEL_ROLES.map((role) => {
            const list = byRole[role];
            if (!list || list.length === 0) return null;
            return (
              <Card key={role}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[role]}`}>
                      {ROLE_SHORT[role]}
                    </span>
                    {ROLE_LABELS[role]}
                    <span className="text-xs text-muted-foreground font-normal">({list.length})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ul className="divide-y">
                    {list.map((p) => (
                      <li key={p.id} className={`p-3 flex items-start justify-between gap-3 ${p.active ? "" : "opacity-50"}`}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{p.name}</span>
                            {p.segment && <span className="text-[10px] uppercase rounded px-1.5 py-0.5 bg-accent">{p.segment}</span>}
                            {!p.active && <span className="text-[10px] uppercase text-muted-foreground">inactive</span>}
                          </div>
                          {p.email && <p className="text-xs text-muted-foreground">{p.email}</p>}
                          {p.notes && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{p.notes}</p>}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="sm" variant="ghost" onClick={() => startEdit(p)} disabled={busy}>Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(p.id)} disabled={busy}>Delete</Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
