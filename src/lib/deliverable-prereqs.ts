// Per-deliverable prerequisite catalog. Drives the "Quick generate" flow:
// when the user picks a single deliverable, the form shows only the inputs
// needed to produce it. Also drives the prerequisite messages on the
// project detail cards so the team knows what's missing.
//
// Each deliverable lists:
//   - kind & route fragment
//   - human description
//   - prereq input dimensions: customer/scope/inventory/clouds/regions/purchaseModel
//   - upstream deliverables that materially improve quality if present
//
// The standalone /quick flow does NOT require upstream deliverables — they
// raise the floor but the prompt can run without them. Routes that DO
// require upstream (currently SOW → BOM) keep their server-side guard.

export type DeliverableKind =
  | "customer-study"
  | "assessment"
  | "architecture"
  | "bom"
  | "tco"
  | "project-plan"
  | "proposal"
  | "sow"
  | "ms-offering";

export type ProjectType =
  | "migration"
  | "greenfield"
  | "modernization"
  | "dr"
  | "poc"
  | "optimization"
  | "unknown";

export type Group = "discover" | "design" | "commercial" | "delivery";

export type Prereqs = {
  kind: DeliverableKind;
  label: string;
  shortDesc: string;
  group: Group;
  needs: {
    customer: boolean;
    scope: boolean;
    inventory: boolean;
    clouds: boolean;
    regions: boolean;
    purchaseModel: boolean;
    onPremBaseline: boolean;
  };
  // Subset of fields shown in the form but NOT required to submit. Empty
  // (or omitted) = every shown field is required.
  optionalFields?: (keyof Prereqs["needs"])[];
  recommendedUpstream: DeliverableKind[];
  hardUpstream: DeliverableKind[];
};

export const GROUP_LABELS: Record<Group, string> = {
  discover: "Discover",
  design: "Design",
  commercial: "Commercial",
  delivery: "Delivery",
};

const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  migration: "Migration",
  greenfield: "Greenfield (new build)",
  modernization: "Modernization",
  dr: "DR / Resilience",
  poc: "POC / Pilot",
  optimization: "Optimization / FinOps",
  unknown: "Unclear (review needed)",
};

export function projectTypeLabel(t: string | null | undefined): string {
  if (!t) return PROJECT_TYPE_LABELS.unknown;
  return PROJECT_TYPE_LABELS[t as ProjectType] ?? t;
}

export const NEED_LABELS: Record<keyof Prereqs["needs"], string> = {
  customer: "customer",
  scope: "scope",
  inventory: "inventory",
  clouds: "cloud",
  regions: "region",
  purchaseModel: "purchase model",
  onPremBaseline: "on-prem baseline",
};

// DB-side enum (what Deliverable.type stores) ↔ wizard kind. The DB uses
// snake_case for historical reasons; the rest of the app uses kebab.
const DB_TYPE_BY_KIND: Record<DeliverableKind, string> = {
  "customer-study": "customer_study",
  "assessment": "assessment",
  "architecture": "architecture",
  "bom": "bom",
  "tco": "tco",
  "project-plan": "project_plan",
  "proposal": "proposal",
  "sow": "sow",
  "ms-offering": "ms_offering",
};

const KIND_BY_DB_TYPE: Record<string, DeliverableKind> = Object.fromEntries(
  Object.entries(DB_TYPE_BY_KIND).map(([k, v]) => [v, k as DeliverableKind]),
);

export function dbTypeOf(kind: DeliverableKind): string {
  return DB_TYPE_BY_KIND[kind];
}

export function kindOfDbType(dbType: string): DeliverableKind | undefined {
  return KIND_BY_DB_TYPE[dbType];
}

export const DELIVERABLE_PREREQS: Record<DeliverableKind, Prereqs> = {
  "customer-study": {
    kind: "customer-study",
    label: "Customer study",
    shortDesc: "Pre-meeting briefing on customer profile, IT landscape, regulatory context, plus suggested Noventiq use cases.",
    group: "discover",
    needs: { customer: true, scope: true, inventory: false, clouds: false, regions: false, purchaseModel: false, onPremBaseline: false },
    // All inputs optional — the agent will research from training data and
    // propose generic industry use cases when nothing is supplied.
    optionalFields: ["customer", "scope"],
    recommendedUpstream: [],
    hardUpstream: [],
  },
  "assessment": {
    kind: "assessment",
    label: "Assessment",
    shortDesc: "Per-workload migration readiness across infra/platform/app/data layers.",
    group: "discover",
    needs: { customer: true, scope: true, inventory: true, clouds: true, regions: true, purchaseModel: false, onPremBaseline: false },
    recommendedUpstream: ["customer-study"],
    hardUpstream: [],
  },
  "architecture": {
    kind: "architecture",
    label: "Architecture",
    shortDesc: "Target landing zone, network, identity, security, ops blueprint.",
    group: "design",
    needs: { customer: true, scope: true, inventory: false, clouds: true, regions: true, purchaseModel: false, onPremBaseline: false },
    recommendedUpstream: ["assessment"],
    hardUpstream: [],
  },
  "bom": {
    kind: "bom",
    label: "BOM",
    shortDesc: "Bill of Materials — cloud consumption + professional services costing.",
    group: "commercial",
    needs: { customer: true, scope: false, inventory: true, clouds: true, regions: true, purchaseModel: true, onPremBaseline: false },
    recommendedUpstream: ["assessment", "architecture"],
    hardUpstream: [],
  },
  "tco": {
    kind: "tco",
    label: "TCO",
    shortDesc: "Multi-year TCO scenarios vs on-prem baseline + sensitivity analysis.",
    group: "commercial",
    needs: { customer: true, scope: false, inventory: true, clouds: true, regions: true, purchaseModel: true, onPremBaseline: true },
    recommendedUpstream: ["bom"],
    hardUpstream: [],
  },
  "project-plan": {
    kind: "project-plan",
    label: "Project plan",
    shortDesc: "Phased plan, mandays, dependencies, RACI, Gantt.",
    group: "delivery",
    needs: { customer: true, scope: true, inventory: false, clouds: true, regions: false, purchaseModel: false, onPremBaseline: false },
    recommendedUpstream: ["assessment", "architecture"],
    hardUpstream: [],
  },
  "proposal": {
    kind: "proposal",
    label: "Proposal",
    shortDesc: "Customer-facing pitch composing scope + commercials + recommendation.",
    group: "commercial",
    needs: { customer: true, scope: true, inventory: false, clouds: true, regions: true, purchaseModel: false, onPremBaseline: false },
    recommendedUpstream: ["bom", "architecture", "assessment"],
    hardUpstream: [],
  },
  "sow": {
    kind: "sow",
    label: "SOW",
    shortDesc: "Statement of Work — legal-grade scope, AC, change control.",
    group: "delivery",
    needs: { customer: true, scope: true, inventory: false, clouds: true, regions: false, purchaseModel: false, onPremBaseline: false },
    recommendedUpstream: ["proposal", "bom"],
    hardUpstream: ["bom"], // server enforces — Quick flow must produce a BOM first
  },
  "ms-offering": {
    kind: "ms-offering",
    label: "Managed services",
    shortDesc: "Foundation/Run/Optimize tiers + SLA grid for this engagement.",
    group: "delivery",
    needs: { customer: true, scope: true, inventory: false, clouds: true, regions: false, purchaseModel: false, onPremBaseline: false },
    recommendedUpstream: ["architecture"],
    hardUpstream: [],
  },
};

export const DELIVERABLES_IN_LIFECYCLE_ORDER: DeliverableKind[] = [
  "customer-study",
  "assessment",
  "architecture",
  "bom",
  "tco",
  "project-plan",
  "proposal",
  "sow",
  "ms-offering",
];
