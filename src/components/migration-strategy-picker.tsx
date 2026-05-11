"use client";
import { MIGRATION_STRATEGY_LABELS, type MigrationStrategy } from "@/lib/inventory/paas-recommender";

const STRATEGIES: MigrationStrategy[] = ["lift_and_shift", "hybrid", "modernization"];

const HINTS: Record<MigrationStrategy, string> = {
  lift_and_shift: "Every workload stays IaaS. Lowest project risk; highest run cost.",
  hybrid:         "Modernize the obvious wins (databases, caches, file shares) to PaaS. Keep custom apps + AD + legacy on IaaS.",
  modernization:  "Move everything to PaaS where a clean target exists. Workloads with no PaaS target (AD, container hosts, custom legacy) stay IaaS.",
};

export function MigrationStrategyPicker({
  value,
  onChange,
}: {
  value: MigrationStrategy;
  onChange: (v: MigrationStrategy) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {STRATEGIES.map((s) => {
        const active = value === s;
        return (
          <button
            type="button"
            key={s}
            onClick={() => onChange(s)}
            className={`text-left rounded-md border p-3 text-sm transition ${
              active ? "bg-primary/10 border-primary" : "hover:bg-accent"
            }`}
          >
            <div className="font-medium flex items-center gap-2">
              <span>{active ? "●" : "○"}</span> {MIGRATION_STRATEGY_LABELS[s]}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{HINTS[s]}</div>
          </button>
        );
      })}
    </div>
  );
}
