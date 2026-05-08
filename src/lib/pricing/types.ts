// Common pricing types shared across cloud-specific clients.

export type CloudType = "azure" | "aws" | "gcp";
export type OsType = "linux" | "windows";
// Pricing commitment / purchase model. "consumption" = PAYG (Azure) or
// On-demand (AWS). "reserved-Ny" = N-year Reserved Instance. "savings-Ny"
// = N-year Savings Plan (Azure compute SP / AWS Compute SP).
export type Term =
  | "consumption"
  | "reserved-1y"
  | "reserved-3y"
  | "savings-1y"
  | "savings-3y";

export const PURCHASE_MODEL_LABELS: Record<Term, string> = {
  "consumption": "Pay-as-you-go",
  "reserved-1y": "Reserved Instance (1-year)",
  "reserved-3y": "Reserved Instance (3-year)",
  "savings-1y":  "Savings Plan (1-year)",
  "savings-3y":  "Savings Plan (3-year)",
};

export const PURCHASE_MODEL_HINTS: Record<Term, string> = {
  "consumption": "Pay per hour. Maximum flexibility, no commitment.",
  "reserved-1y": "1-year commitment. ~30-40% off PAYG. SKU-locked.",
  "reserved-3y": "3-year commitment. ~50-60% off PAYG. SKU-locked.",
  "savings-1y":  "1-year $/hour commitment. ~25-35% off PAYG. Cross-family flexibility.",
  "savings-3y":  "3-year $/hour commitment. ~45-55% off PAYG. Cross-family flexibility.",
};

export const PURCHASE_MODELS = Object.keys(PURCHASE_MODEL_LABELS) as Term[];

export const PRICING_AVAILABLE_CLOUDS: CloudType[] = ["azure", "aws"];

export function pricingCloudsOnly(clouds: readonly string[]): CloudType[] {
  return clouds.filter((c): c is CloudType => c === "azure" || c === "aws");
}

export type ComputeQuoteFound = {
  found: true;
  cloud: CloudType;
  region: string;
  sku: string;
  hourlyUsd: number;
  monthlyUsd: number;
  notes?: string[];
  fallbackRegionUsed?: string;
  productName?: string;
};

export type ComputeQuoteMissing = {
  found: false;
  cloud: CloudType;
  region: string;
  sku: string;
  message: string;
};

export type ComputeQuoteResult = ComputeQuoteFound | ComputeQuoteMissing;

export type StorageQuote =
  | { found: true; cloud: CloudType; sku: string; gbMonthlyUsd: number; totalMonthlyUsd: number }
  | { found: false; cloud: CloudType; sku: string; message: string };
