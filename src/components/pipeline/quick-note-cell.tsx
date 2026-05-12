"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PipelineStatus } from "@/lib/pipeline/status";

// Inline textarea that auto-saves on blur or after typing pauses. The server
// flips the row's status when the note contains a keyword like "at risk".
export function QuickNoteCell({
  opportunityId,
  initialNote,
}: {
  opportunityId: string;
  initialNote: string | null;
}) {
  const router = useRouter();
  const [note, setNote] = useState<string>(initialNote ?? "");
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<PipelineStatus | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function save(value: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/pipeline/opportunities/${opportunityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: value || null }),
      });
      if (res.ok) {
        const { opportunity } = await res.json();
        setFlash(opportunity.status as PipelineStatus);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          if (debounce.current) clearTimeout(debounce.current);
          debounce.current = setTimeout(() => save(e.target.value), 800);
        }}
        onBlur={() => save(note)}
        placeholder="Quick note · type 'at risk', 'won', 'follow up' to flip status"
        className="block w-full rounded border bg-background px-2 py-1 text-xs min-h-[40px]"
        rows={1}
      />
      <div className="text-[10px] text-muted-foreground">
        {saving ? "Saving…" : flash ? `Status → ${flash}` : ""}
      </div>
    </div>
  );
}
