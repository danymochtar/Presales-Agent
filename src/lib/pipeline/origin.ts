// Pipeline origin labels — how an opportunity arrived in the pipeline.
// Separate axis from status (committed / upside / at_risk / etc):
//   - status answers "where is this deal RIGHT NOW?"
//   - origin answers "WHERE DID this deal come from?" — drives planning views:
//     carry-over from last FY, new fiscal-year targets, existing customer
//     expansion, net-new prospects.
//
// Pure module — no I/O. Mirrors the shape of `status.ts`.

export type OpportunityOrigin =
  | "carry_over"
  | "new_target"
  | "existing_customer"
  | "net_new"
  | "unknown";

export const OPPORTUNITY_ORIGINS: OpportunityOrigin[] = [
  "carry_over",
  "new_target",
  "existing_customer",
  "net_new",
  "unknown",
];

export const ORIGIN_LABELS: Record<OpportunityOrigin, string> = {
  carry_over: "Carry-over",
  new_target: "FY target",
  existing_customer: "Existing customer",
  net_new: "Net-new",
  unknown: "Unclassified",
};

export const ORIGIN_DESCRIPTIONS: Record<OpportunityOrigin, string> = {
  carry_over: "Open opportunity rolled over from the previous fiscal year — still being worked.",
  new_target: "New fiscal-year target customer the team is pursuing this cycle.",
  existing_customer: "Expansion / cross-sell / renewal with a customer already in the book.",
  net_new: "Brand-new prospect outside the existing book — sourced this period.",
  unknown: "Not categorized yet. Use the row dropdown or set a tracker default.",
};

// Tailwind classes for the origin chip. Kept distinct from status colors so
// the two chips read as two separate dimensions in the table.
export const ORIGIN_COLORS: Record<OpportunityOrigin, string> = {
  carry_over:        "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-900/50",
  new_target:        "bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-200 dark:border-indigo-900/50",
  existing_customer: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-900/50",
  net_new:           "bg-violet-100 text-violet-900 border-violet-300 dark:bg-violet-900/30 dark:text-violet-200 dark:border-violet-900/50",
  unknown:           "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-900/30 dark:text-gray-300 dark:border-gray-700",
};

export function originLabel(origin: string | null | undefined): string {
  if (!origin) return ORIGIN_LABELS.unknown;
  return ORIGIN_LABELS[origin as OpportunityOrigin] ?? origin;
}

// Detect origin from common column-name patterns OR free-text content
// (tracker name, note, etc.). Defensive — returns null when nothing matches.
const ORIGIN_KEYWORDS: Array<{ re: RegExp; origin: OpportunityOrigin }> = [
  { re: /\bcarry[\s\-_]*over|roll[\s\-_]*over|holdover\b/i, origin: "carry_over" },
  { re: /\bfy[\s\-_]*\d{2,4}[\s\-_]*target|new[\s\-_]*target|target[\s\-_]*account/i, origin: "new_target" },
  { re: /\bexisting[\s\-_]*cust|installed[\s\-_]*base|expansion|cross[\s\-_]*sell|upsell|renewal\b/i, origin: "existing_customer" },
  { re: /\bnet[\s\-_]*new|prospect|greenfield[\s\-_]*account\b/i, origin: "net_new" },
];

export function detectOrigin(text: string | null | undefined): OpportunityOrigin | null {
  if (!text) return null;
  for (const { re, origin } of ORIGIN_KEYWORDS) {
    if (re.test(text)) return origin;
  }
  return null;
}
