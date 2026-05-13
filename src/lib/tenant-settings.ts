// Tenant-scoped settings resolvers. Each helper takes the tenant row (or a
// subset) + a fallback and returns the resolved value. Never throws — when
// the JSON column is null or a key is missing, the fallback wins. Used by
// server components to derive branding / labels / thresholds without
// hardcoding values into the UI.

export type TenantLike = {
  name?: string | null;
  branding?: unknown;
  vocabulary?: unknown;
  thresholds?: unknown;
};

// ---------- Branding ----------
export type Branding = {
  displayName: string;
  logoLetter: string;
  accentHue: string;       // CSS hue (e.g. "primary", "azure", "emerald") — read by Tailwind theme tokens
  perCloudHue: {
    azure: string;
    aws: string;
    gcp: string;
    services: string;
  };
};

export const DEFAULT_BRANDING: Branding = {
  displayName: "Noventiq Multicloud Agent",
  logoLetter: "N",
  accentHue: "primary",
  perCloudHue: {
    azure: "sky",
    aws: "orange",
    gcp: "emerald",
    services: "violet",
  },
};

export function tenantBranding(t: TenantLike | null | undefined): Branding {
  const b = (t?.branding ?? {}) as Partial<Branding>;
  const perCloud = (b.perCloudHue ?? {}) as Partial<Branding["perCloudHue"]>;
  return {
    displayName: typeof b.displayName === "string" && b.displayName.trim() ? b.displayName.trim() : DEFAULT_BRANDING.displayName,
    logoLetter:  typeof b.logoLetter  === "string" && b.logoLetter.trim()  ? b.logoLetter.trim().slice(0, 2).toUpperCase() : DEFAULT_BRANDING.logoLetter,
    accentHue:   typeof b.accentHue   === "string" && b.accentHue.trim()   ? b.accentHue.trim() : DEFAULT_BRANDING.accentHue,
    perCloudHue: {
      azure:    typeof perCloud.azure    === "string" ? perCloud.azure    : DEFAULT_BRANDING.perCloudHue.azure,
      aws:      typeof perCloud.aws      === "string" ? perCloud.aws      : DEFAULT_BRANDING.perCloudHue.aws,
      gcp:      typeof perCloud.gcp      === "string" ? perCloud.gcp      : DEFAULT_BRANDING.perCloudHue.gcp,
      services: typeof perCloud.services === "string" ? perCloud.services : DEFAULT_BRANDING.perCloudHue.services,
    },
  };
}

// Curated palette for the Branding form. Each entry is a Tailwind hue name +
// the Tailwind class strings to apply. Keeps custom colors readable in both
// light + dark mode without per-tenant CSS variable plumbing.
export const ACCENT_SWATCHES: { hue: string; label: string; sample: string }[] = [
  { hue: "primary",  label: "Default",  sample: "bg-primary" },
  { hue: "sky",      label: "Sky",      sample: "bg-sky-500" },
  { hue: "indigo",   label: "Indigo",   sample: "bg-indigo-500" },
  { hue: "violet",   label: "Violet",   sample: "bg-violet-500" },
  { hue: "emerald",  label: "Emerald",  sample: "bg-emerald-500" },
  { hue: "amber",    label: "Amber",    sample: "bg-amber-500" },
  { hue: "rose",     label: "Rose",     sample: "bg-rose-500" },
  { hue: "slate",    label: "Slate",    sample: "bg-slate-700" },
];

// ---------- Vocabulary ----------
export function tenantLabel(t: TenantLike | null | undefined, key: string, fallback: string): string {
  const v = (t?.vocabulary ?? {}) as Record<string, unknown>;
  const raw = v[key];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return fallback;
}

// ---------- Thresholds ----------
export type Thresholds = {
  mcemGreenPct: number;            // ≥ this % → green band on MCEM chip
  mcemAmberPct: number;            // ≥ this % → amber band; below → red
  fileSizeMb: number;              // Upload size cap across all forms
  dashboardLookbackDays: number;   // "This week" window
  dashboardActiveMax: number;      // Rows in "Active engagements" list
  dashboardNextActionsMax: number; // Rows in "Next actions" rail
};

export const DEFAULT_THRESHOLDS: Thresholds = {
  mcemGreenPct: 70,
  mcemAmberPct: 40,
  fileSizeMb: 10,
  dashboardLookbackDays: 7,
  dashboardActiveMax: 5,
  dashboardNextActionsMax: 6,
};

export function tenantThresholds(t: TenantLike | null | undefined): Thresholds {
  const raw = (t?.thresholds ?? {}) as Partial<Thresholds>;
  const pickNum = <K extends keyof Thresholds>(k: K, min: number, max: number): Thresholds[K] => {
    const v = raw[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max) return v as Thresholds[K];
    return DEFAULT_THRESHOLDS[k];
  };
  // Sanity-clamp every value to a defensible range.
  return {
    mcemGreenPct:            pickNum("mcemGreenPct", 0, 100),
    mcemAmberPct:            pickNum("mcemAmberPct", 0, 100),
    fileSizeMb:              pickNum("fileSizeMb", 1, 200),
    dashboardLookbackDays:   pickNum("dashboardLookbackDays", 1, 365),
    dashboardActiveMax:      pickNum("dashboardActiveMax", 1, 50),
    dashboardNextActionsMax: pickNum("dashboardNextActionsMax", 1, 50),
  };
}

// MCEM band resolver — pulled out of mcem.ts so the band logic can be
// tenant-configurable without circular imports.
export function tenantMcemBand(t: TenantLike | null | undefined, pct: number): "red" | "amber" | "green" {
  const { mcemGreenPct, mcemAmberPct } = tenantThresholds(t);
  if (pct >= mcemGreenPct) return "green";
  if (pct >= mcemAmberPct) return "amber";
  return "red";
}
