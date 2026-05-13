"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CloudChip } from "@/components/cloud-chip";
import { LZ_ARCHETYPE_LABELS, LZ_ARCHETYPE_DESCRIPTIONS, type LzArchetype, type LzComponent, type LzCategory } from "@/lib/landing-zone/catalog";
import type { CloudType } from "@/lib/pricing/types";
import type { ComponentKind } from "@/lib/inventory/component-detector";

const CATEGORY_LABELS: Record<LzCategory, string> = {
  network: "Network",
  identity: "Identity",
  security: "Security",
  ops: "Ops + Platform",
  "data-protection": "Data protection",
};

const ARCHETYPES: LzArchetype[] = ["infra", "platform", "data_ai"];

export function LandingZonePicker({
  engagementId,
  targetClouds,
  suggestedArchetypes,
  initialArchetypes,
  initialSelections,
  detected,
  catalogByCloud,
}: {
  engagementId: string;
  targetClouds: CloudType[];
  suggestedArchetypes: LzArchetype[];
  initialArchetypes: LzArchetype[];
  initialSelections: Partial<Record<CloudType, string[]>>;
  detected: ComponentKind[];
  catalogByCloud: Record<CloudType, LzComponent[]>;
}) {
  const router = useRouter();
  const [archetypes, setArchetypes] = useState<Set<LzArchetype>>(new Set(initialArchetypes));
  const [selections, setSelections] = useState<Record<string, Set<string>>>(() => {
    const out: Record<string, Set<string>> = {};
    for (const c of targetClouds) out[c] = new Set(initialSelections[c] ?? []);
    return out;
  });
  const [activeCloud, setActiveCloud] = useState<CloudType>(targetClouds[0]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const detectedSet = useMemo(() => new Set(detected), [detected]);

  function toggleArchetype(a: LzArchetype) {
    const next = new Set(archetypes);
    if (next.has(a)) next.delete(a);
    else next.add(a);
    if (next.size === 0) return; // require at least infra
    setArchetypes(next);
  }

  function toggleComponent(cloud: CloudType, name: string) {
    setSelections((prev) => {
      const set = new Set(prev[cloud] ?? []);
      if (set.has(name)) set.delete(name);
      else set.add(name);
      return { ...prev, [cloud]: set };
    });
  }

  function selectAllInArchetype(cloud: CloudType, archetype: LzArchetype) {
    const names = catalogByCloud[cloud]
      .filter((c) => c.archetype === archetype)
      .map((c) => c.name);
    setSelections((prev) => ({ ...prev, [cloud]: new Set([...(prev[cloud] ?? []), ...names]) }));
  }

  function clearArchetype(cloud: CloudType, archetype: LzArchetype) {
    const names = new Set(
      catalogByCloud[cloud].filter((c) => c.archetype === archetype).map((c) => c.name),
    );
    setSelections((prev) => {
      const next = new Set(prev[cloud] ?? []);
      for (const n of names) next.delete(n);
      return { ...prev, [cloud]: next };
    });
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        archetypes: [...archetypes],
        selectionsByCloud: Object.fromEntries(
          targetClouds.map((c) => [c, [...(selections[c] ?? [])]]),
        ),
      };
      const res = await fetch(`/api/engagements/${engagementId}/landing-zone`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  const activeCatalog = catalogByCloud[activeCloud] ?? [];
  const activeArchetypes = ARCHETYPES.filter((a) => archetypes.has(a));

  return (
    <div className="space-y-6">
      {/* Archetype picker */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Archetypes to deploy</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {ARCHETYPES.map((a) => {
              const checked = archetypes.has(a);
              const suggested = suggestedArchetypes.includes(a);
              return (
                <label
                  key={a}
                  className={`border rounded-md p-3 cursor-pointer transition ${
                    checked ? "border-primary bg-primary/5" : "hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleArchetype(a)}
                      className="mt-1 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{LZ_ARCHETYPE_LABELS[a]}</span>
                        {suggested && (
                          <span className="text-[10px] uppercase rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200">
                            suggested
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{LZ_ARCHETYPE_DESCRIPTIONS[a]}</p>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Cloud tabs */}
      {targetClouds.length > 1 && (
        <div className="flex gap-1 border-b -mx-1 px-1 overflow-x-auto">
          {targetClouds.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setActiveCloud(c)}
              className={`px-3 py-2 text-sm border-b-2 -mb-[1px] transition whitespace-nowrap flex items-center gap-2 ${
                activeCloud === c
                  ? "border-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <CloudChip cloud={c} size="xs" />
              {c.toUpperCase()}
              <span className="text-xs text-muted-foreground">({(selections[c]?.size ?? 0)})</span>
            </button>
          ))}
        </div>
      )}

      {/* Per-cloud components, grouped by archetype + category */}
      {activeArchetypes.map((archetype) => {
        const items = activeCatalog.filter((c) => c.archetype === archetype);
        if (items.length === 0) return null;
        const grouped: Record<string, LzComponent[]> = {};
        for (const it of items) (grouped[it.category] ??= []).push(it);
        const selectedCount = items.filter((it) => selections[activeCloud]?.has(it.name)).length;
        return (
          <Card key={archetype}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
                <span>{LZ_ARCHETYPE_LABELS[archetype]} <span className="text-muted-foreground text-xs font-normal">· {selectedCount} / {items.length} selected</span></span>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => selectAllInArchetype(activeCloud, archetype)}>
                    Select all
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => clearArchetype(activeCloud, archetype)}>
                    Clear
                  </Button>
                </div>
              </CardTitle>
              <p className="text-xs text-muted-foreground">{LZ_ARCHETYPE_DESCRIPTIONS[archetype]}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {(["network", "identity", "security", "ops", "data-protection"] as LzCategory[]).map((cat) => {
                const list = grouped[cat];
                if (!list || list.length === 0) return null;
                return (
                  <div key={cat} className="space-y-2">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">{CATEGORY_LABELS[cat]}</div>
                    <ul className="space-y-1.5">
                      {list.map((comp) => {
                        const isSelected = selections[activeCloud]?.has(comp.name) ?? false;
                        const pairsMatched = comp.pairsWith?.some((k) => detectedSet.has(k));
                        return (
                          <li key={comp.name}>
                            <label className={`flex items-start gap-2 rounded-md border p-2.5 cursor-pointer transition ${
                              isSelected ? "border-primary bg-primary/5" : "hover:border-primary/40"
                            }`}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleComponent(activeCloud, comp.name)}
                                className="mt-0.5 shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium">{comp.name}</span>
                                  <span className="text-[10px] uppercase rounded px-1.5 py-0.5 bg-accent">{comp.framework}</span>
                                  {comp.requiredByDefault && (
                                    <span className="text-[10px] uppercase text-emerald-700 dark:text-emerald-400">required</span>
                                  )}
                                  {!comp.requiredByDefault && pairsMatched && (
                                    <span className="text-[10px] uppercase rounded px-1.5 py-0.5 bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
                                      matches inventory
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">{comp.description}</p>
                              </div>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      {err && <p className="text-sm text-destructive">{err}</p>}

      <div className="sticky bottom-3 flex justify-between items-center gap-3 flex-wrap border rounded-md bg-card p-3 shadow-sm">
        <div className="text-xs text-muted-foreground">
          {savedAt ? `Saved at ${savedAt}.` : "Selections are saved on the engagement and feed downstream BOM / Architecture."}
        </div>
        <Button onClick={save} disabled={saving || archetypes.size === 0}>
          {saving ? "Saving…" : "Save landing zone selection"}
        </Button>
      </div>
    </div>
  );
}
