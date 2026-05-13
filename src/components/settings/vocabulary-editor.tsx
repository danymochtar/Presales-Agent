"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type VocabularyEntry = { key: string; label: string; defaultLabel: string };
export type VocabularySection = { title: string; description?: string; entries: VocabularyEntry[] };

export function VocabularyEditor({ sections: initialSections }: { sections: VocabularySection[] }) {
  const router = useRouter();
  // Flatten initial overrides into a single map keyed by `key`. Empty
  // overrides aren't represented — empty string means "use default".
  const initial: Record<string, string> = {};
  for (const s of initialSections) for (const e of s.entries) if (e.label !== e.defaultLabel) initial[e.key] = e.label;
  const [overrides, setOverrides] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function setOverride(key: string, value: string) {
    setOverrides((cur) => {
      const next = { ...cur };
      if (value.trim()) next[key] = value;
      else delete next[key];
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/tenant/vocabulary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === "string" ? j.error : "save failed");
      }
      const overrideCount = Object.keys(overrides).length;
      setMsg({ kind: "ok", text: `Saved ${overrideCount} override${overrideCount === 1 ? "" : "s"}. Reload to apply across the UI.` });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "save failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Override the default label for any term across the platform. Leave a row blank to use the default. Keyword matching
        (e.g. status detection from the &ldquo;Commit&rdquo; column on a tracker import) keeps using the canonical key —
        only the display label flips.
      </p>

      {initialSections.map((section) => (
        <div key={section.title} className="rounded-md border">
          <div className="px-3 py-2 border-b bg-muted/30">
            <p className="text-sm font-medium">{section.title}</p>
            {section.description && <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>}
          </div>
          <ul className="divide-y">
            {section.entries.map((e) => {
              const cur = overrides[e.key] ?? "";
              return (
                <li key={e.key} className="px-3 py-2 grid grid-cols-1 sm:grid-cols-[1fr,1fr] gap-2 items-center">
                  <div className="text-sm">
                    <div className="font-medium">{e.defaultLabel}</div>
                    <code className="text-[10px] text-muted-foreground">{e.key}</code>
                  </div>
                  <Input
                    value={cur}
                    onChange={(ev) => setOverride(e.key, ev.target.value)}
                    placeholder={`Override (default: ${e.defaultLabel})`}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {msg && <p className={`text-sm ${msg.kind === "ok" ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"}`}>{msg.text}</p>}

      <div className="flex justify-end">
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save vocabulary"}</Button>
      </div>
    </div>
  );
}
