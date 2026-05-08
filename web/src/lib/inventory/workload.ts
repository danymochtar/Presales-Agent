// Normalized workload schema, shared across parsers and BOM generator.

export type Workload = {
  name: string;             // hostname or workload name (may be redacted depending on guardrails)
  os: "linux" | "windows" | "other";
  cpu: number;              // vCPU count
  ramGb: number;
  storageGb: number;
  recommendedSku?: string;  // ARM SKU name, e.g. "Standard_D4s_v5" — populated by sizing logic or Azure Migrate
  count: number;            // usually 1; group rows can have >1
  notes?: string;
};

export type WorkloadSet = {
  source: "rvtools" | "azure_migrate" | "generic" | "manual";
  totals: {
    count: number;
    cpu: number;
    ramGb: number;
    storageGb: number;
    osMix: Record<string, number>;
  };
  workloads: Workload[];
};

export function summarize(workloads: Workload[]): WorkloadSet["totals"] {
  const totals = { count: 0, cpu: 0, ramGb: 0, storageGb: 0, osMix: {} as Record<string, number> };
  for (const w of workloads) {
    totals.count += w.count;
    totals.cpu += w.cpu * w.count;
    totals.ramGb += w.ramGb * w.count;
    totals.storageGb += w.storageGb * w.count;
    totals.osMix[w.os] = (totals.osMix[w.os] ?? 0) + w.count;
  }
  return totals;
}
