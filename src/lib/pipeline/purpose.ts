// Tracker purpose — what kind of data lives in a given upload. Drives the
// "upload your previous FY pipeline (to learn from) + your future-target
// pipe" framing on the setup page and groups the pipeline view so the user
// can see history vs. plan vs. live deals at a glance.

export type TrackerPurpose =
  | "historical_pipeline"
  | "target_pipeline"
  | "current_pipe"
  | "funding"
  | "crm_sync"
  | "other";

export const TRACKER_PURPOSES: TrackerPurpose[] = [
  "historical_pipeline",
  "target_pipeline",
  "current_pipe",
  "funding",
  "crm_sync",
  "other",
];

export const PURPOSE_LABELS: Record<TrackerPurpose, string> = {
  historical_pipeline: "Previous FY pipeline (learn from)",
  target_pipeline:     "FY target pipeline (plan against)",
  current_pipe:        "Current pipeline (live deals)",
  funding:             "Funding / program tracker",
  crm_sync:            "CRM sync (e.g. Creatio)",
  other:               "Other",
};

export const PURPOSE_DESCRIPTIONS: Record<TrackerPurpose, string> = {
  historical_pipeline: "Closed deals from prior fiscal years. The agent learns sales-cycle length, average deal size by segment + industry, win-rate patterns, and which Solution Plays close fastest.",
  target_pipeline:     "Named accounts the team is chasing this fiscal year. Drives the FY-target slice on the Business dashboard.",
  current_pipe:        "Live opportunities being worked right now — Microsoft biweekly, segment trackers, sales-rep pipes.",
  funding:             "Hyperscaler funding programs (Azure Accelerate, MAP, RaMP) — expiring, pending consent, closed out.",
  crm_sync:            "Auto-synced from a CRM via the integrations connector (not a manual Excel upload).",
  other:               "Anything that doesn't fit the categories above.",
};

export const PURPOSE_COLORS: Record<TrackerPurpose, string> = {
  historical_pipeline: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-900/50",
  target_pipeline:     "bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-200 dark:border-indigo-900/50",
  current_pipe:        "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-900/50",
  funding:             "bg-violet-100 text-violet-900 border-violet-300 dark:bg-violet-900/30 dark:text-violet-200 dark:border-violet-900/50",
  crm_sync:            "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-900/30 dark:text-sky-200 dark:border-sky-900/50",
  other:               "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-900/30 dark:text-gray-300 dark:border-gray-700",
};

// Detect a sensible default purpose from the tracker name when the user
// doesn't pick one. Defensive — falls back to "current_pipe".
const PATTERNS: Array<{ re: RegExp; purpose: TrackerPurpose }> = [
  { re: /\bcarry[\s\-_]*over|prior[\s\-_]*fy|fy\s*\d{2}[\s\-_]*pipeline|fy\s*\d{2}[\s\-_]*results|historical|previous[\s\-_]*year|last[\s\-_]*year|holdover\b/i, purpose: "historical_pipeline" },
  { re: /\btarget|fy[\s\-_]*\d{2}[\s\-_]*target|named[\s\-_]*accounts|plan[\s\-_]*list\b/i, purpose: "target_pipeline" },
  { re: /\bfunding|accelerate|map[\s\-_]*program|ramp|ecif\b/i, purpose: "funding" },
  { re: /\bcreatio|crm[\s\-_]*sync|salesforce|hubspot|dynamics\b/i, purpose: "crm_sync" },
];

export function detectPurpose(name: string | null | undefined): TrackerPurpose {
  if (!name) return "current_pipe";
  for (const { re, purpose } of PATTERNS) {
    if (re.test(name)) return purpose;
  }
  return "current_pipe";
}
