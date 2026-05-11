// Workload-completeness assessment for BOM/Assessment/TCO sizing.
//
// Inventory files in the wild are messy: an RVTools export may have CPU +
// RAM but no disk; an Azure Migrate report may have everything; a hand-
// rolled CSV may have only hostnames. Instead of blocking at upload, this
// module surfaces per-workload gaps so the wizard can walk the user
// through filling them — manually, by re-uploading another doc, or by
// applying reasonable defaults.

import { summarize, type Workload, type WorkloadSet } from "./workload";

export type FieldKey = "cpu" | "ramGb" | "storageGb" | "os";

export type WorkloadGap = {
  index: number;            // position in WorkloadSet.workloads
  name: string;
  missing: FieldKey[];
  blocking: boolean;        // can't size at all — missing CPU or RAM
};

export type CompletenessReport = {
  totalWorkloads: number;
  completeCount: number;
  partialCount: number;
  blockingCount: number;
  completenessPct: number;  // 0..100 — avg per-workload completeness, 4 fields
  gaps: WorkloadGap[];
  canGenerate: boolean;     // false while any workload is blocking
};

// CPU + RAM are required to size a SKU; storage + OS are softer (we have
// reasonable defaults). Tweak here without touching call sites.
const BLOCKING_FIELDS: FieldKey[] = ["cpu", "ramGb"];
const ALL_FIELDS: FieldKey[] = ["cpu", "ramGb", "storageGb", "os"];

export function workloadGap(w: Workload, index: number): WorkloadGap {
  const missing: FieldKey[] = [];
  if (!w.cpu || w.cpu <= 0) missing.push("cpu");
  if (!w.ramGb || w.ramGb <= 0) missing.push("ramGb");
  if (!w.storageGb || w.storageGb <= 0) missing.push("storageGb");
  if (w.os === "other") missing.push("os");
  return {
    index,
    name: w.name || `workload ${index + 1}`,
    missing,
    blocking: missing.some((m) => BLOCKING_FIELDS.includes(m)),
  };
}

export function assessCompleteness(set: WorkloadSet): CompletenessReport {
  const gaps = set.workloads.map(workloadGap);
  const total = set.workloads.length;
  const completeCount = gaps.filter((g) => g.missing.length === 0).length;
  const blockingCount = gaps.filter((g) => g.blocking).length;
  const partialCount = total - completeCount - blockingCount;
  const filledFieldsSum = gaps.reduce((s, g) => s + (ALL_FIELDS.length - g.missing.length), 0);
  const completenessPct = total > 0
    ? Math.round((filledFieldsSum / (total * ALL_FIELDS.length)) * 100)
    : 0;
  return {
    totalWorkloads: total,
    completeCount,
    partialCount,
    blockingCount,
    completenessPct,
    gaps: gaps.filter((g) => g.missing.length > 0),
    canGenerate: total > 0 && blockingCount === 0,
  };
}

export type Defaults = {
  cpu?: number;
  ramGb?: number;
  storageGb?: number;
  os?: "linux" | "windows" | "other";
};

export const SUGGESTED_DEFAULTS: Required<Defaults> = {
  cpu: 2,
  ramGb: 4,
  storageGb: 50,
  os: "linux",
};

// Fill ONLY the missing fields on each workload, leaving present values
// untouched. Returns a new WorkloadSet (immutable).
export function applyDefaults(set: WorkloadSet, defaults: Defaults): WorkloadSet {
  const next = set.workloads.map((w) => {
    const patch: Partial<Workload> = {};
    if ((!w.cpu || w.cpu <= 0) && defaults.cpu) patch.cpu = defaults.cpu;
    if ((!w.ramGb || w.ramGb <= 0) && defaults.ramGb) patch.ramGb = defaults.ramGb;
    if ((!w.storageGb || w.storageGb <= 0) && defaults.storageGb) patch.storageGb = defaults.storageGb;
    if (w.os === "other" && defaults.os) patch.os = defaults.os;
    return { ...w, ...patch };
  });
  return { ...set, workloads: next, totals: summarize(next) };
}

// Replace a single workload (by index) with a patched version.
export function patchWorkload(set: WorkloadSet, index: number, patch: Partial<Workload>): WorkloadSet {
  const next = set.workloads.map((w, i) => (i === index ? { ...w, ...patch } : w));
  return { ...set, workloads: next, totals: summarize(next) };
}

// Merge an additional WorkloadSet into an existing one. De-duplicates on
// (name + os) so re-uploading the same RVTools twice doesn't double-count.
export function mergeWorkloadSets(base: WorkloadSet, addition: WorkloadSet): WorkloadSet {
  const key = (w: Workload) => `${w.name.trim().toLowerCase()}|${w.os}`;
  const existing = new Set(base.workloads.map(key));
  const additions = addition.workloads.filter((w) => !existing.has(key(w)));
  const next = [...base.workloads, ...additions];
  return {
    ...base,
    source: base.source === addition.source ? base.source : "manual",
    workloads: next,
    totals: summarize(next),
  };
}
