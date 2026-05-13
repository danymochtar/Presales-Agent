"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  ORIGIN_COLORS,
  ORIGIN_LABELS,
  OPPORTUNITY_ORIGINS,
  type OpportunityOrigin,
} from "@/lib/pipeline/origin";

export function OriginPill({
  opportunityId,
  origin,
  className,
}: {
  opportunityId?: string;
  origin: OpportunityOrigin;
  className?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState<OpportunityOrigin>(origin);
  const [saving, setSaving] = useState(false);

  const base = cn(
    "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium",
    ORIGIN_COLORS[value],
    className,
  );

  // Read-only when no id supplied (e.g. dashboard chip).
  if (!opportunityId) return <span className={base}>{ORIGIN_LABELS[value]}</span>;

  async function change(next: OpportunityOrigin) {
    const before = value;
    setValue(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/pipeline/opportunities/${opportunityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originKind: next }),
      });
      if (!res.ok) throw new Error("save failed");
      router.refresh();
    } catch {
      setValue(before);
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      value={value}
      disabled={saving}
      onChange={(e) => void change(e.target.value as OpportunityOrigin)}
      className={cn(base, "cursor-pointer appearance-none pr-1")}
    >
      {OPPORTUNITY_ORIGINS.map((o) => (
        <option key={o} value={o}>{ORIGIN_LABELS[o]}</option>
      ))}
    </select>
  );
}
