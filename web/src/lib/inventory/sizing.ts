// Lightweight Azure VM SKU recommender for workloads that don't already have one
// (e.g. RVTools doesn't carry a recommendation; Azure Migrate does — use that
// when present). Tiers picked from Dsv5 series as default general-purpose; map
// to Esv5 for memory-heavy. Output is a starting point; presales head adjusts.

const DSV5_TIERS = [
  { sku: "Standard_D2s_v5", cpu: 2, ramGb: 8 },
  { sku: "Standard_D4s_v5", cpu: 4, ramGb: 16 },
  { sku: "Standard_D8s_v5", cpu: 8, ramGb: 32 },
  { sku: "Standard_D16s_v5", cpu: 16, ramGb: 64 },
  { sku: "Standard_D32s_v5", cpu: 32, ramGb: 128 },
  { sku: "Standard_D48s_v5", cpu: 48, ramGb: 192 },
  { sku: "Standard_D64s_v5", cpu: 64, ramGb: 256 },
] as const;

const ESV5_TIERS = [
  { sku: "Standard_E2s_v5", cpu: 2, ramGb: 16 },
  { sku: "Standard_E4s_v5", cpu: 4, ramGb: 32 },
  { sku: "Standard_E8s_v5", cpu: 8, ramGb: 64 },
  { sku: "Standard_E16s_v5", cpu: 16, ramGb: 128 },
  { sku: "Standard_E32s_v5", cpu: 32, ramGb: 256 },
  { sku: "Standard_E48s_v5", cpu: 48, ramGb: 384 },
  { sku: "Standard_E64s_v5", cpu: 64, ramGb: 512 },
] as const;

export function recommendSku(cpu: number, ramGb: number): string {
  const ratio = ramGb / Math.max(cpu, 1);
  const tiers = ratio > 4.5 ? ESV5_TIERS : DSV5_TIERS;
  const fit = tiers.find((t) => t.cpu >= cpu && t.ramGb >= ramGb);
  return fit?.sku ?? tiers[tiers.length - 1].sku;
}
