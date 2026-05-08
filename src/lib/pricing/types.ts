// Common pricing types shared across cloud-specific clients.

export type CloudType = "azure" | "aws" | "gcp";
export type OsType = "linux" | "windows";
export type Term = "consumption" | "reservation-1y" | "reservation-3y";

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
