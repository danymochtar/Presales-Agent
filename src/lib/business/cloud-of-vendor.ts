// Map an Opportunity.vendor string to the business-target cloud bucket.
// Opportunities are imported from heterogeneous trackers so vendor labels
// vary widely ("Microsoft", "Azure", "MSFT", "AWS", "Amazon Web Services",
// "Google Cloud", "GCP", "Noventiq Managed Services", null, etc.).
//
// Buckets:
//   azure        — Microsoft / Azure
//   aws          — Amazon
//   gcp          — Google Cloud
//   services     — Noventiq managed services / professional services / partner
//   cross_cloud  — explicitly multi-cloud
//   unknown      — vendor not labelled

export type TargetCloud = "azure" | "aws" | "gcp" | "services" | "cross_cloud" | "all" | "unknown";

const PATTERNS: Array<{ re: RegExp; cloud: TargetCloud }> = [
  { re: /\bmicrosoft|azure|msft\b/i,                   cloud: "azure" },
  { re: /\baws|amazon[\s\-]*web[\s\-]*services\b/i,   cloud: "aws" },
  { re: /\bgoogle|gcp|g[\s\-]*cloud\b/i,              cloud: "gcp" },
  { re: /\bmanaged[\s\-]*services|services|noventiq|professional[\s\-]*services\b/i, cloud: "services" },
  { re: /\bmulti[\s\-]*cloud|cross[\s\-]*cloud|hybrid\b/i, cloud: "cross_cloud" },
];

export function cloudOfVendor(vendor: string | null | undefined): TargetCloud {
  if (!vendor) return "unknown";
  for (const { re, cloud } of PATTERNS) {
    if (re.test(vendor)) return cloud;
  }
  return "unknown";
}

export const CLOUD_LABELS: Record<TargetCloud, string> = {
  azure:       "Azure",
  aws:         "AWS",
  gcp:         "GCP",
  services:    "Services / MSP",
  cross_cloud: "Cross-cloud",
  all:         "All clouds",
  unknown:     "Unclassified",
};

export const CLOUD_COLORS: Record<TargetCloud, string> = {
  azure:       "bg-[hsl(214_80%_55%/.12)] text-[hsl(214_80%_30%)] border-[hsl(214_80%_55%/.3)] dark:text-[hsl(214_80%_75%)]",
  aws:         "bg-[hsl(25_90%_55%/.12)] text-[hsl(25_90%_30%)] border-[hsl(25_90%_55%/.3)] dark:text-[hsl(25_90%_75%)]",
  gcp:         "bg-[hsl(142_70%_45%/.12)] text-[hsl(142_70%_25%)] border-[hsl(142_70%_45%/.3)] dark:text-[hsl(142_70%_70%)]",
  services:    "bg-[hsl(270_60%_55%/.12)] text-[hsl(270_60%_35%)] border-[hsl(270_60%_55%/.3)] dark:text-[hsl(270_60%_75%)]",
  cross_cloud: "bg-slate-100 text-slate-900 border-slate-300 dark:bg-slate-900/30 dark:text-slate-200",
  all:         "bg-primary/10 text-primary border-primary/30",
  unknown:     "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-900/30 dark:text-gray-300",
};

export const TARGET_CLOUDS: TargetCloud[] = ["azure", "aws", "gcp", "services", "cross_cloud", "all"];
