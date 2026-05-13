// Personnel roles + assignment roles. Two separate enums because
// `business_lead` and `csm` can appear in Personnel but not on every
// OpportunityAssignment slot.

export type PersonnelRole =
  | "solution_architect"
  | "solution_sales"
  | "account_manager"
  | "business_lead"
  | "partner_seller"
  | "csm"
  | "other";

export const PERSONNEL_ROLES: PersonnelRole[] = [
  "solution_architect",
  "solution_sales",
  "account_manager",
  "business_lead",
  "partner_seller",
  "csm",
  "other",
];

export const ROLE_LABELS: Record<PersonnelRole, string> = {
  solution_architect: "Solution Architect",
  solution_sales:     "Solution Sales",
  account_manager:    "Account Manager",
  business_lead:      "Business Lead",
  partner_seller:     "Partner Seller",
  csm:                "Customer Success Manager",
  other:              "Other",
};

// Short form for chips.
export const ROLE_SHORT: Record<PersonnelRole, string> = {
  solution_architect: "SA",
  solution_sales:     "SS",
  account_manager:    "AM",
  business_lead:      "BL",
  partner_seller:     "PS",
  csm:                "CSM",
  other:              "—",
};

// Color per role for the assignment chip on the pipeline row.
export const ROLE_COLORS: Record<PersonnelRole, string> = {
  solution_architect: "bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-200 dark:border-indigo-900/50",
  solution_sales:     "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-900/50",
  account_manager:    "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-900/50",
  business_lead:      "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-900/50",
  partner_seller:     "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-900/30 dark:text-sky-200 dark:border-sky-900/50",
  csm:                "bg-violet-100 text-violet-900 border-violet-300 dark:bg-violet-900/30 dark:text-violet-200 dark:border-violet-900/50",
  other:              "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-900/30 dark:text-gray-300 dark:border-gray-700",
};

// Only these roles can be set per-opportunity. business_lead is excluded —
// it's a team-wide position, not an account-level assignment.
export const ASSIGNMENT_ROLES = [
  "solution_architect",
  "solution_sales",
  "account_manager",
  "partner_seller",
  "csm",
] as const satisfies readonly PersonnelRole[];

export type AssignmentRole = (typeof ASSIGNMENT_ROLES)[number];

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "—";
  return ROLE_LABELS[role as PersonnelRole] ?? role;
}

export const SEGMENTS = ["SMB", "SMC", "ENT", "PS", "all"] as const;
export type Segment = (typeof SEGMENTS)[number];
