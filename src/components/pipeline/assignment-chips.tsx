"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ASSIGNMENT_ROLES,
  ROLE_COLORS,
  ROLE_LABELS,
  ROLE_SHORT,
  type AssignmentRole,
  type PersonnelRole,
} from "@/lib/team/roles";

export type AssignmentRow = {
  id: string;
  role: string;
  personnelId: string;
  personnelName: string;
};

export type AssignablePerson = {
  id: string;
  name: string;
  role: string;
};

export function AssignmentChips({
  opportunityId,
  assignments,
  people,
}: {
  opportunityId: string;
  assignments: AssignmentRow[];
  people: AssignablePerson[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<{ personnelId: string; role: AssignmentRole }>(() => ({
    personnelId: people[0]?.id ?? "",
    role: "solution_architect",
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    if (!picked.personnelId) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/pipeline/opportunities/${opportunityId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(picked),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === "string" ? j.error : "assign failed");
      }
      router.refresh();
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "assign failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(assignmentId: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/pipeline/opportunities/${opportunityId}/assignments/${assignmentId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === "string" ? j.error : "remove failed");
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "remove failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1">
        {assignments.length === 0 && <span className="text-[11px] text-muted-foreground">—</span>}
        {assignments.map((a) => (
          <span
            key={a.id}
            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${ROLE_COLORS[a.role as PersonnelRole] ?? ROLE_COLORS.other}`}
            title={`${a.personnelName} · ${ROLE_LABELS[a.role as PersonnelRole] ?? a.role}`}
          >
            <span className="font-semibold">{ROLE_SHORT[a.role as PersonnelRole] ?? "?"}</span>
            <span className="truncate max-w-[80px]">{a.personnelName}</span>
            <button
              type="button"
              onClick={() => remove(a.id)}
              disabled={busy}
              className="opacity-50 hover:opacity-100"
              aria-label={`Remove ${a.personnelName} as ${a.role}`}
            >×</button>
          </span>
        ))}
        {people.length > 0 && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-[10px] underline text-muted-foreground hover:text-foreground"
          >
            + assign
          </button>
        )}
      </div>
      {open && (
        <div className="flex items-center gap-1 rounded border p-1 bg-card">
          <select
            value={picked.personnelId}
            onChange={(e) => setPicked({ ...picked, personnelId: e.target.value })}
            className="h-6 text-[10px] rounded border bg-background px-1"
            disabled={busy}
          >
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select
            value={picked.role}
            onChange={(e) => setPicked({ ...picked, role: e.target.value as AssignmentRole })}
            className="h-6 text-[10px] rounded border bg-background px-1"
            disabled={busy}
          >
            {ASSIGNMENT_ROLES.map((r) => <option key={r} value={r}>{ROLE_SHORT[r]}</option>)}
          </select>
          <button
            type="button"
            onClick={add}
            disabled={busy || !picked.personnelId}
            className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); setErr(null); }}
            className="text-[10px] px-1 text-muted-foreground"
          >
            ×
          </button>
        </div>
      )}
      {err && <p className="text-[10px] text-destructive">{err}</p>}
    </div>
  );
}
