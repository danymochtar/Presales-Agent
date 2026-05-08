"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Template = {
  id: string;
  type: string;
  cloudProvider: string | null;
  projectType: string | null;
  name: string | null;
  description: string | null;
  originalName: string | null;
  textContent: string | null;
  status: string;
  createdAt: string;
};

const TYPE_LABELS: Record<string, string> = {
  customer_study: "Customer study",
  bom: "BOM",
  assessment: "Assessment",
  proposal: "Proposal",
  architecture: "Architecture",
  tco: "TCO",
  project_plan: "Project plan",
  sow: "SOW",
  ms_offering: "MS offering",
  letterhead: "Letterhead",
  other: "Other",
};

export function TemplateList({ initial }: { initial: Template[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggleStatus(t: Template) {
    setBusy(t.id);
    const next = t.status === "active" ? "archived" : "active";
    const res = await fetch(`/api/admin/templates/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) {
      const { item } = await res.json();
      setItems(items.map((i) => (i.id === t.id ? item : i)));
      router.refresh();
    }
    setBusy(null);
  }

  async function remove(id: string) {
    if (!confirm("Delete this template? It won't be used as a reference anymore.")) return;
    setBusy(id);
    const res = await fetch(`/api/admin/templates/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems(items.filter((i) => i.id !== id));
      router.refresh();
    }
    setBusy(null);
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No templates uploaded yet. Add a sample BOM, Assessment, or Proposal — the agent will use it as a reference for matching deliverables.
      </p>
    );
  }

  // Group by type
  const groups = items.reduce<Record<string, Template[]>>((acc, t) => {
    (acc[t.type] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {Object.entries(groups).map(([type, group]) => (
        <div key={type} className="space-y-2">
          <h3 className="text-sm font-semibold">{TYPE_LABELS[type] ?? type} ({group.length})</h3>
          <ul className="divide-y border rounded-md">
            {group.map((t) => {
              const filters: string[] = [];
              if (t.cloudProvider) filters.push(t.cloudProvider.toUpperCase());
              if (t.projectType) filters.push(t.projectType);
              return (
                <li key={t.id} className={`p-3 flex items-start justify-between gap-2 ${t.status === "archived" ? "opacity-50" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{t.name ?? t.originalName ?? "Untitled template"}</span>
                      {filters.map((f) => (
                        <span key={f} className="text-[10px] uppercase rounded px-1.5 py-0.5 bg-accent">{f}</span>
                      ))}
                      {t.status === "archived" && <span className="text-[10px] uppercase text-muted-foreground">archived</span>}
                    </div>
                    {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                    {t.originalName && <p className="text-xs text-muted-foreground">{t.originalName}</p>}
                    <p className="text-xs text-muted-foreground">
                      {(t.textContent?.length ?? 0).toLocaleString()} chars · added {new Date(t.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => toggleStatus(t)} disabled={busy === t.id}>
                      {t.status === "active" ? "Archive" : "Activate"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(t.id)} disabled={busy === t.id}>Delete</Button>
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
