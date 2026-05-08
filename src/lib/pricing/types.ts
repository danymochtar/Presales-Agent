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
