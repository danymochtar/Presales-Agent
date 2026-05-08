"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Pattern = {
  id: string;
  deliverableType: string;
  pattern: string;
  scope: string;
  conditions: unknown;
  confidence: string;
  rationale: string | null;
  active: boolean;
  createdAt: string;
};

export function LearnedPatternsList({ initial }: { initial: Pattern[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [pending, setPending] = useState<string | null>(null);

  async function toggleActive(id: string, active: boolean) {
    setPending(id);
    const res = await fetch(`/api/tenant/learned-patterns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    if (res.ok) {
      const { item } = await res.json();
      setItems(items.map((i) => (i.id === id ? item : i)));
      router.refresh();
    }
    setPending(null);
  }

  async function remove(id: string) {
    if (!confirm("Delete this learned pattern? It will no longer be applied to generations.")) return;
    setPending(id);
    const res = await fetch(`/api/tenant/learned-patterns/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems(items.filter((i) => i.id !== id));
      router.refresh();
    }
    setPending(null);
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No patterns yet. Switch a project to Training mode, give feedback after generating a deliverable,
        and approve the extracted patterns to populate this list.
      </p>
    );
  }

  // Group by deliverable type
  const groups = items.reduce<Record<string, Pattern[]>>((acc, p) => {
    (acc[p.deliverableType] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {Object.entries(groups).map(([type, group]) => (
        <div key={type} className="space-y-2">
          <h3 className="text-sm font-semibold capitalize">{type.replace("_", " ")} ({group.length})</h3>
          <ul className="space-y-2">
            {group.map((p) => {
              const conditions = Array.isArray(p.conditions) ? (p.conditions as string[]) : [];
              return (
                <li key={p.id} className={`border-l-2 pl-3 py-1 ${p.active ? "border-primary" : "border-muted opacity-50"}`}>
                  <div className="flex justify-between gap-2 items-start">
                    <div className="flex-1">
                      <p className="text-sm">{p.pattern}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.scope} {conditions.length > 0 && `(${conditions.join(", ")})`} · {p.confidence}
                        {p.rationale && ` · "${p.rationale}"`}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleActive(p.id, !p.active)}
                        disabled={pending === p.id}
                      >
                        {p.active ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => remove(p.id)}
                        disabled={pending === p.id}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
