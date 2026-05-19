// GCP Compute Engine instance recommender. n2-standard for ratio ≤4.5,
// n2-highmem for >4.5. Matches the shapes priced in
// `src/lib/pricing/gcp.ts` INSTANCE_SHAPES.

const N2_STANDARD = [
  { sku: "n2-standard-2",  cpu: 2,  ramGb: 8 },
  { sku: "n2-standard-4",  cpu: 4,  ramGb: 16 },
  { sku: "n2-standard-8",  cpu: 8,  ramGb: 32 },
  { sku: "n2-standard-16", cpu: 16, ramGb: 64 },
  { sku: "n2-standard-32", cpu: 32, ramGb: 128 },
  { sku: "n2-standard-48", cpu: 48, ramGb: 192 },
  { sku: "n2-standard-64", cpu: 64, ramGb: 256 },
] as const;

const N2_HIGHMEM = [
  { sku: "n2-highmem-2",  cpu: 2,  ramGb: 16 },
  { sku: "n2-highmem-4",  cpu: 4,  ramGb: 32 },
  { sku: "n2-highmem-8",  cpu: 8,  ramGb: 64 },
  { sku: "n2-highmem-16", cpu: 16, ramGb: 128 },
  { sku: "n2-highmem-32", cpu: 32, ramGb: 256 },
  { sku: "n2-highmem-48", cpu: 48, ramGb: 384 },
] as const;

export function recommendGcpInstance(cpu: number, ramGb: number): string {
  const ratio = ramGb / Math.max(cpu, 1);
  const tiers = ratio > 4.5 ? N2_HIGHMEM : N2_STANDARD;
  const fit = tiers.find((t) => t.cpu >= cpu && t.ramGb >= ramGb);
  return fit?.sku ?? tiers[tiers.length - 1].sku;
}
