// MCEM = Microsoft Customer Engagement Methodology. 5-phase qualification
// model the agent uses to score deal health and surface "next action" hints
// on the dashboard. Replaces the SaaS-sales MEDDPICC rubric — MCEM fits the
// Microsoft co-sell partner motion (Azure Lead at Noventiq KL) and maps to
// Partner Center sales stages out of the box.
//
// Grounded in:
//   https://learn.microsoft.com/partner-center/referrals/mcem-for-partners
//   https://learn.microsoft.com/partner-center/referrals/manage-co-sell-opportunities
//
// Phase model:
//   1. Listen & Consult     →  Qualified Opportunity
//   2. Inspire & Design     →  Customer aligned to solution + business case
//   3. Empower & Achieve    →  Customer Agreement in place
//   4. Realize Value        →  Deployment executed + KPIs in place
//   5. Manage & Optimize    →  Cyclical — feeds back into Phase 1
//
// Each phase has an exit-criteria checklist. Score = % done in the current
// phase mapped from the engagement's funnel stage.

// ---------- Engagement funnel (Partner Center-aligned) ----------
// Stage stays the same as before — Partner Center sales stages already
// map to MCEM phases.
export type EngagementStage =
  | "prospecting"
  | "qualifying"
  | "discovery"
  | "proposed"
  | "negotiating"
  | "closed_won"
  | "closed_lost";

export const ENGAGEMENT_STAGES: EngagementStage[] = [
  "prospecting", "qualifying", "discovery", "proposed",
  "negotiating", "closed_won", "closed_lost",
];

export const STAGE_LABELS: Record<EngagementStage, string> = {
  prospecting:  "Prospecting",
  qualifying:   "Qualifying",
  discovery:    "Discovery",
  proposed:     "Proposed",
  negotiating:  "Negotiating",
  closed_won:   "Closed Won",
  closed_lost:  "Closed Lost",
};

export function stageLabel(stage: string | null | undefined): string {
  if (!stage) return "—";
  return STAGE_LABELS[stage as EngagementStage] ?? stage;
}

export function isOpenStage(stage: string | null | undefined): boolean {
  return stage !== "closed_won" && stage !== "closed_lost";
}

// ---------- MCEM phases ----------
export type McemPhase = "listen" | "design" | "empower" | "realize" | "manage";

export const MCEM_PHASES: McemPhase[] = ["listen", "design", "empower", "realize", "manage"];

export const PHASE_LABELS: Record<McemPhase, string> = {
  listen:  "Listen & Consult",
  design:  "Inspire & Design",
  empower: "Empower & Achieve",
  realize: "Realize Value",
  manage:  "Manage & Optimize",
};

export const PHASE_SHORT: Record<McemPhase, string> = {
  listen:  "Listen",
  design:  "Design",
  empower: "Empower",
  realize: "Realize",
  manage:  "Manage",
};

export const PHASE_DESCRIPTIONS: Record<McemPhase, string> = {
  listen:  "Research the customer, identify pain, map stakeholders. Exits when the opportunity is qualified.",
  design:  "Confirm the Solution Play, sketch the architecture, share a commercial range. Exits when the customer is aligned to a solution + business case.",
  empower: "Prove the solution (POC / pilot), share references, deliver the proposal + SOW, negotiate terms. Exits when the customer agreement is signed.",
  realize: "Hand off to delivery, engage Solution Architect + Customer Success Manager, run kickoff, agree KPI plan. Exits when the customer is live and metrics are in place.",
  manage:  "Monitor health, capture CSAT/NPS, find expansion + rightsizing. Cyclical — feeds back into Phase 1.",
};

// Map the 7-stage funnel onto the 5 MCEM phases.
export function phaseForStage(stage: string | null | undefined): McemPhase {
  switch (stage) {
    case "prospecting":
    case "qualifying":
      return "listen";
    case "discovery":
      return "design";
    case "proposed":
    case "negotiating":
      return "empower";
    case "closed_won":
      return "realize";
    case "closed_lost":
      return "listen"; // historical / re-engage motion
    default:
      return "listen";
  }
}

// ---------- Exit-criteria checklist per phase ----------
export type McemItemKey =
  // Listen
  | "customer_research"
  | "pain_identified"
  | "stakeholder_map"
  | "business_outcome"
  | "compliance_flagged"
  | "opportunity_registered"
  // Design
  | "solution_play"
  | "architecture_sketched"
  | "landing_zone_picked"
  | "commercial_range_shared"
  | "industry_alignment"
  | "account_plan"
  // Empower
  | "poc_pilot"
  | "technical_proof"
  | "reference_customer"
  | "proposal_delivered"
  | "bom_signed_off"
  | "sow_drafted"
  | "terms_negotiated"
  | "agreement_signed"
  // Realize
  | "project_plan_accepted"
  | "solution_architect_engaged"
  | "csm_engaged"
  | "kickoff_held"
  | "kpi_plan_agreed"
  | "risks_logged"
  // Manage
  | "health_monitored"
  | "csat_captured"
  | "rightsizing_review"
  | "expansion_identified"
  | "legacy_transition_assessed";

export type McemItem = {
  key: McemItemKey;
  phase: McemPhase;
  label: string;
  help: string;
  // Optional deep-link from the dashboard "Next actions" rail to the most
  // useful page for closing this criterion off. Templated with {id}.
  actionPath?: string;
};

export const MCEM_ITEMS: McemItem[] = [
  // ---------- Phase 1: Listen & Consult ----------
  { key: "customer_research",     phase: "listen",  label: "Customer research",               help: "Market, goals, historical performance, recent news / regulator findings.", actionPath: "/engagements/{id}/assessment" },
  { key: "pain_identified",       phase: "listen",  label: "Primary pain identified",         help: "The cost / risk of doing nothing — quantified where possible." },
  { key: "stakeholder_map",       phase: "listen",  label: "Stakeholder map",                 help: "Executive sponsor, technical decision maker, procurement contact. Names + titles." },
  { key: "business_outcome",      phase: "listen",  label: "Business outcome agreed",         help: "Quantified outcome the customer cares about (e.g. cut datacentre OpEx 30%)." },
  { key: "compliance_flagged",    phase: "listen",  label: "Compliance posture flagged",      help: "BNM RMiT / PDPA / sector regulator considerations identified.", actionPath: "/engagements/{id}/compliance" },
  { key: "opportunity_registered",phase: "listen",  label: "Opportunity registered",          help: "Row exists in the consolidated pipeline tracker, auto-linked to this engagement.", actionPath: "/pipeline" },

  // ---------- Phase 2: Inspire & Design ----------
  { key: "solution_play",         phase: "design",  label: "Solution Play confirmed",         help: "Migration / Modernization / Data Platform / AI / SIEM / DR / Greenfield — picked + agreed with the customer." },
  { key: "architecture_sketched", phase: "design",  label: "Target architecture sketched",    help: "Architecture deliverable generated with target-state design + Mermaid diagrams.", actionPath: "/engagements/{id}/architecture" },
  { key: "landing_zone_picked",   phase: "design",  label: "Landing-zone archetype picked",   help: "Infrastructure / Application platform / Data+AI components selected per cloud (CAF / LZA / Cloud Foundation).", actionPath: "/engagements/{id}/landing-zone" },
  { key: "commercial_range_shared", phase: "design", label: "Commercial range shared",        help: "High-level cost range from a draft BOM presented to the customer.", actionPath: "/engagements/{id}/bom" },
  { key: "industry_alignment",    phase: "design",  label: "Industry-specific alignment",     help: "Solution mapped to the customer's industry constraints (BFSI BNM-compliant, Gov MAMPU, etc.)." },
  { key: "account_plan",          phase: "design",  label: "Account plan briefed",            help: "Multi-stakeholder briefing held; short- and long-term plan agreed with sponsor + technical DM." },

  // ---------- Phase 3: Empower & Achieve ----------
  { key: "poc_pilot",             phase: "empower", label: "POC / pilot delivered or scoped", help: "Hands-on validation booked or completed. Captures real workload, not synthetic." },
  { key: "technical_proof",       phase: "empower", label: "Technical proof validated",       help: "Architecture review signed off by customer technical DM + (where applicable) Microsoft / AWS / GCP SA." },
  { key: "reference_customer",    phase: "empower", label: "Reference customer shared",       help: "Anonymized or named won-deal reference relevant to the customer's industry / scale." },
  { key: "proposal_delivered",    phase: "empower", label: "Formal proposal delivered",       help: "Customer-facing proposal generated, reviewed, and sent.", actionPath: "/engagements/{id}/proposal" },
  { key: "bom_signed_off",        phase: "empower", label: "BOM signed off",                  help: "Final BOM accepted by the customer (per cloud, with purchase model + landing-zone breakdown).", actionPath: "/engagements/{id}/bom" },
  { key: "sow_drafted",           phase: "empower", label: "SOW drafted",                     help: "Legal-grade scope with acceptance criteria + change control.", actionPath: "/engagements/{id}/sow" },
  { key: "terms_negotiated",      phase: "empower", label: "Terms negotiated",                help: "Payment terms, validity period, FX risk allocation, T&Cs aligned." },
  { key: "agreement_signed",      phase: "empower", label: "Customer agreement signed",       help: "Counter-signed agreement on file. Phase 3 exit." },

  // ---------- Phase 4: Realize Value ----------
  { key: "project_plan_accepted", phase: "realize", label: "Project plan accepted",           help: "Phased plan with mandays + RACI + dependencies signed off by the customer.", actionPath: "/engagements/{id}/project-plan" },
  { key: "solution_architect_engaged", phase: "realize", label: "Solution Architect engaged", help: "Delivery SA named + briefed on architecture + assumptions." },
  { key: "csm_engaged",           phase: "realize", label: "Customer Success Manager engaged",help: "CSM named + introduced to the customer business sponsor." },
  { key: "kickoff_held",          phase: "realize", label: "Kickoff held",                    help: "Joint customer + delivery team kickoff complete; comms plan agreed." },
  { key: "kpi_plan_agreed",       phase: "realize", label: "KPI measurement plan agreed",     help: "How success is measured — quantified, owned, on a cadence." },
  { key: "risks_logged",          phase: "realize", label: "Risks logged with owners",        help: "Top risks identified, owner + mitigation assigned per risk." },

  // ---------- Phase 5: Manage & Optimize ----------
  { key: "health_monitored",      phase: "manage",  label: "Solution health monitored",       help: "Ops baseline in place (Defender / GuardDuty / SCC + monitoring + backup)." },
  { key: "csat_captured",         phase: "manage",  label: "CSAT / NPS captured",             help: "Customer satisfaction survey run at the agreed cadence (typically quarterly)." },
  { key: "rightsizing_review",    phase: "manage",  label: "Rightsizing review",              help: "FinOps review run; reserved / savings commitments tuned." },
  { key: "expansion_identified",  phase: "manage",  label: "Expansion opportunity identified",help: "Net-new use case sourced from the customer's evolving needs — feeds Phase 1 of the next cycle." },
  { key: "legacy_transition_assessed", phase: "manage", label: "Legacy transition assessed", help: "EOL / migration candidates on the customer estate identified for the next wave." },
];

export function itemsForPhase(phase: McemPhase): McemItem[] {
  return MCEM_ITEMS.filter((i) => i.phase === phase);
}

export function getItem(key: McemItemKey): McemItem | undefined {
  return MCEM_ITEMS.find((i) => i.key === key);
}

// ---------- Per-engagement state ----------
export type McemEntry = {
  done: boolean;
  note?: string | null;
  completedAt?: string | null; // ISO
  owner?: string | null;
};

export type Mcem = Partial<Record<McemItemKey, McemEntry>>;

export function emptyMcem(): Mcem {
  return {};
}

// ---------- Scoring ----------
export type ItemScore = {
  key: McemItemKey;
  phase: McemPhase;
  label: string;
  done: boolean;
  note: string | null;
  actionPath?: string;
};

// Same shape as the old DealHealth so dashboard / engagement-detail chips
// can keep their rendering logic. `currentPhase` + `phaseLabel` are new.
export type DealHealth = {
  totalPct: number;             // 0..100 — % of current-phase items done
  currentPhase: McemPhase;
  phaseLabel: string;
  done: number;
  total: number;
  itemScores: ItemScore[];      // every item in the current phase
  blockers: { key: McemItemKey; reason: string }[]; // undone items in the current phase
};

export function score(mcem: Mcem | null | undefined, stage: string | null | undefined): DealHealth {
  const m = mcem ?? emptyMcem();
  const phase = phaseForStage(stage);
  const items = itemsForPhase(phase);

  const itemScores: ItemScore[] = items.map((it) => ({
    key: it.key,
    phase: it.phase,
    label: it.label,
    done: !!m[it.key]?.done,
    note: m[it.key]?.note ?? null,
    actionPath: it.actionPath,
  }));

  const done = itemScores.filter((s) => s.done).length;
  const total = itemScores.length;
  const totalPct = total > 0 ? Math.round((done / total) * 100) : 0;

  const blockers = itemScores
    .filter((s) => !s.done)
    .map((s) => ({ key: s.key, reason: `${s.label} not yet complete` }));

  return {
    totalPct,
    currentPhase: phase,
    phaseLabel: PHASE_LABELS[phase],
    done,
    total,
    itemScores,
    blockers,
  };
}

export function healthBand(pct: number): "red" | "amber" | "green" {
  if (pct >= 70) return "green";
  if (pct >= 40) return "amber";
  return "red";
}

/**
 * For the homepage "Next actions" rail: the first undone item in the
 * current phase for this engagement. Returns null when the engagement
 * is fully through its current phase OR closed.
 */
export function nextAction(mcem: Mcem | null | undefined, stage: string | null | undefined): McemItem | null {
  if (!isOpenStage(stage)) return null;
  const phase = phaseForStage(stage);
  const items = itemsForPhase(phase);
  const m = mcem ?? {};
  const first = items.find((it) => !m[it.key]?.done);
  return first ?? null;
}
