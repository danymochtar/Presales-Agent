// Curated region catalog for the markets this presales team sells into
// (Malaysia + APAC primary, US/EU as secondary). Each entry carries the
// label shown in the UI/BOM, the cloud-specific code used for pricing,
// and a `recommended` flag so the wizard can surface Malaysia-resident
// regions first.
//
// Note: Azure region in Malaysia is "Malaysia West" (armName malaysiawest).
// "Malaysia Central" was the announced name pre-launch but is NOT how the
// region is referred to today — keep this file as the single source of
// truth and don't reintroduce the old label.

import type { CloudType } from "./types";

export type Region = {
  /** Cloud-specific region code or canonical label used by pricing modules. */
  code: string;
  /** Display label in UI and in BOM/Assumptions. */
  label: string;
  /** Country / city the region physically sits in. */
  location: string;
  /** Three-letter ISO country code (used for data-residency hints). */
  country: string;
  /** Surface as a default candidate in the Malaysia market. */
  recommended?: boolean;
};

// Azure Public Cloud regions relevant to MY/APAC selling motions plus a
// few US/EU options for global customers. `code` is the canonical label
// used in Project.cloudRegions JSON; pricing/index.ts maps these to the
// ARM region name (e.g. "Malaysia West" -> "malaysiawest").
const AZURE: Region[] = [
  { code: "Malaysia West",       label: "Malaysia West",            location: "Kuala Lumpur",  country: "MYS", recommended: true },
  { code: "Southeast Asia",      label: "Southeast Asia",           location: "Singapore",     country: "SGP", recommended: true },
  { code: "East Asia",           label: "East Asia",                location: "Hong Kong",     country: "HKG" },
  { code: "Indonesia Central",   label: "Indonesia Central",        location: "Jakarta",       country: "IDN" },
  { code: "Australia East",      label: "Australia East",           location: "Sydney",        country: "AUS" },
  { code: "Australia Southeast", label: "Australia Southeast",      location: "Melbourne",     country: "AUS" },
  { code: "Japan East",          label: "Japan East",               location: "Tokyo",         country: "JPN" },
  { code: "Japan West",          label: "Japan West",               location: "Osaka",         country: "JPN" },
  { code: "Korea Central",       label: "Korea Central",            location: "Seoul",         country: "KOR" },
  { code: "Korea South",         label: "Korea South",              location: "Busan",         country: "KOR" },
  { code: "Central India",       label: "Central India",            location: "Pune",          country: "IND" },
  { code: "South India",         label: "South India",              location: "Chennai",       country: "IND" },
  { code: "UAE North",           label: "UAE North",                location: "Dubai",         country: "ARE" },
  { code: "West Europe",         label: "West Europe",              location: "Amsterdam",     country: "NLD" },
  { code: "North Europe",        label: "North Europe",             location: "Dublin",        country: "IRL" },
  { code: "East US",             label: "East US",                  location: "Virginia",      country: "USA" },
  { code: "East US 2",           label: "East US 2",                location: "Virginia",      country: "USA" },
  { code: "West US 2",           label: "West US 2",                location: "Washington",    country: "USA" },
  { code: "West US 3",           label: "West US 3",                location: "Arizona",       country: "USA" },
];

// AWS Regions relevant to APAC + global. `code` is the AWS region code
// (passed through verbatim to the pricing module).
const AWS: Region[] = [
  { code: "ap-southeast-5", label: "ap-southeast-5",  location: "Malaysia",       country: "MYS", recommended: true },
  { code: "ap-southeast-1", label: "ap-southeast-1",  location: "Singapore",      country: "SGP", recommended: true },
  { code: "ap-southeast-3", label: "ap-southeast-3",  location: "Jakarta",        country: "IDN" },
  { code: "ap-southeast-7", label: "ap-southeast-7",  location: "Thailand",       country: "THA" },
  { code: "ap-southeast-2", label: "ap-southeast-2",  location: "Sydney",         country: "AUS" },
  { code: "ap-southeast-4", label: "ap-southeast-4",  location: "Melbourne",      country: "AUS" },
  { code: "ap-northeast-1", label: "ap-northeast-1",  location: "Tokyo",          country: "JPN" },
  { code: "ap-northeast-2", label: "ap-northeast-2",  location: "Seoul",          country: "KOR" },
  { code: "ap-northeast-3", label: "ap-northeast-3",  location: "Osaka",          country: "JPN" },
  { code: "ap-east-1",      label: "ap-east-1",       location: "Hong Kong",      country: "HKG" },
  { code: "ap-south-1",     label: "ap-south-1",      location: "Mumbai",         country: "IND" },
  { code: "ap-south-2",     label: "ap-south-2",      location: "Hyderabad",      country: "IND" },
  { code: "me-central-1",   label: "me-central-1",    location: "UAE",            country: "ARE" },
  { code: "eu-west-1",      label: "eu-west-1",       location: "Ireland",        country: "IRL" },
  { code: "eu-central-1",   label: "eu-central-1",    location: "Frankfurt",      country: "DEU" },
  { code: "us-east-1",      label: "us-east-1",       location: "N. Virginia",    country: "USA" },
  { code: "us-east-2",      label: "us-east-2",       location: "Ohio",           country: "USA" },
  { code: "us-west-2",      label: "us-west-2",       location: "Oregon",         country: "USA" },
];

// GCP region list shown in UI for project-level documentation only;
// pricing client is deferred.
const GCP: Region[] = [
  { code: "asia-southeast1", label: "asia-southeast1", location: "Singapore",     country: "SGP", recommended: true },
  { code: "asia-southeast2", label: "asia-southeast2", location: "Jakarta",       country: "IDN" },
  { code: "asia-east1",      label: "asia-east1",      location: "Taiwan",        country: "TWN" },
  { code: "asia-east2",      label: "asia-east2",      location: "Hong Kong",     country: "HKG" },
  { code: "asia-northeast1", label: "asia-northeast1", location: "Tokyo",         country: "JPN" },
  { code: "asia-northeast3", label: "asia-northeast3", location: "Seoul",         country: "KOR" },
  { code: "asia-south1",     label: "asia-south1",     location: "Mumbai",        country: "IND" },
  { code: "australia-southeast1", label: "australia-southeast1", location: "Sydney", country: "AUS" },
  { code: "us-central1",     label: "us-central1",     location: "Iowa",          country: "USA" },
  { code: "europe-west1",    label: "europe-west1",    location: "Belgium",       country: "BEL" },
];

const REGIONS: Record<CloudType, Region[]> = {
  azure: AZURE,
  aws: AWS,
  gcp: GCP,
};

export function listRegionsForCloud(cloud: CloudType): Region[] {
  return REGIONS[cloud] ?? [];
}

export function findRegion(cloud: CloudType, code: string): Region | undefined {
  return REGIONS[cloud]?.find((r) => r.code === code || r.label === code);
}

// "Malaysia Central" was the pre-launch name; some saved projects + older
// LLM extractions still emit it. Always coerce to the actual region label.
const LEGACY_LABELS: Record<string, string> = {
  "Malaysia Central": "Malaysia West",
};

export function normalizeRegionLabel(label: string): string {
  return LEGACY_LABELS[label] ?? label;
}

// Default region pair for a brand-new project in the Malaysia market.
export const MARKET_DEFAULT_REGIONS: Record<CloudType, { primary: string; dr: string }> = {
  azure: { primary: "Malaysia West",     dr: "Southeast Asia"  },
  aws:   { primary: "ap-southeast-5",    dr: "ap-southeast-1"  },
  gcp:   { primary: "asia-southeast2",   dr: "asia-southeast1" },
};
