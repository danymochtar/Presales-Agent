// AWS EC2 instance recommender. m5 (general) for ratio ≤4.5, r5 (memory)
// for >4.5. Matches the families priced in src/lib/pricing/aws.ts.

const M5_TIERS = [
  { sku: "m5.large",     cpu: 2,  ramGb: 8 },
  { sku: "m5.xlarge",    cpu: 4,  ramGb: 16 },
  { sku: "m5.2xlarge",   cpu: 8,  ramGb: 32 },
  { sku: "m5.4xlarge",   cpu: 16, ramGb: 64 },
  { sku: "m5.8xlarge",   cpu: 32, ramGb: 128 },
  { sku: "m5.12xlarge",  cpu: 48, ramGb: 192 },
  { sku: "m5.16xlarge",  cpu: 64, ramGb: 256 },
  { sku: "m5.24xlarge",  cpu: 96, ramGb: 384 },
] as const;

const R5_TIERS = [
  { sku: "r5.large",     cpu: 2,  ramGb: 16 },
  { sku: "r5.xlarge",    cpu: 4,  ramGb: 32 },
  { sku: "r5.2xlarge",   cpu: 8,  ramGb: 64 },
  { sku: "r5.4xlarge",   cpu: 16, ramGb: 128 },
  { sku: "r5.8xlarge",   cpu: 32, ramGb: 256 },
  { sku: "r5.12xlarge",  cpu: 48, ramGb: 384 },
  { sku: "r5.16xlarge",  cpu: 64, ramGb: 512 },
] as const;

export function recommendAwsInstance(cpu: number, ramGb: number): string {
  const ratio = ramGb / Math.max(cpu, 1);
  const tiers = ratio > 4.5 ? R5_TIERS : M5_TIERS;
  const fit = tiers.find((t) => t.cpu >= cpu && t.ramGb >= ramGb);
  return fit?.sku ?? tiers[tiers.length - 1].sku;
}
