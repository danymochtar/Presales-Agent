"use client";
import { cn } from "@/lib/utils";
import { STATUS_COLORS, STATUS_LABELS, PIPELINE_STATUSES, type PipelineStatus } from "@/lib/pipeline/status";

export function StatusPill({
  status,
  onChange,
  className,
}: {
  status: PipelineStatus;
  onChange?: (next: PipelineStatus) => void;
  className?: string;
}) {
  const base = cn(
    "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium",
    STATUS_COLORS[status],
    className,
  );
  if (!onChange) return <span className={base}>{STATUS_LABELS[status]}</span>;
  return (
    <select
      value={status}
      onChange={(e) => onChange(e.target.value as PipelineStatus)}
      className={cn(base, "cursor-pointer appearance-none pr-1")}
    >
      {PIPELINE_STATUSES.map((s) => (
        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
      ))}
    </select>
  );
}
