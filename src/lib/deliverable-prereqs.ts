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

export type Prereqs = {
  kind: DeliverableKind;
  label: string;
  shortDesc: string;
  /** Lifecycle bucket — same grouping used on project detail. */
  group: "discover" | "design" | "commercial" | "delivery";
  needs: {
    customer: boolean;       // customer name + industry
    scope: boolean;          // scope summary textarea
    inventory: boolean;      // RVTools / Azure Migrate / CSV upload
    clouds: boolean;         // target cloud(s) checkboxes
    regions: boolean;        // primary + DR per cloud
    purchaseModel: boolean;  // PAYG / RI / Savings Plan
    onPremBaseline: boolean; // for TCO comparisons
  };
  /** Upstream deliverables that materially improve output (informational). */
  recommendedUpstream: DeliverableKind[];
  /** Hard prereqs enforced by the generate route — block the Quick flow. */
  hardUpstream: DeliverableKind[];
};

export const DELIVERABLE_PREREQS: Record<DeliverableKind, Prereqs> = {
  "customer-study": {
    kind: "customer-study",
    label: "Customer study",
    shortDesc: "Pre-meeting briefing on customer profile, IT landscape, regulatory context.",
    group: "discover",
    needs: { customer: true, scope: false, inventory: false, clouds: false, regions: false, purchaseModel: false, onPremBaseline: false },
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
