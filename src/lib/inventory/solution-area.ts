// Solution area — the high-level engagement classification the agent uses
// when assessing uploaded artifacts. Broader than the previous "migration
// strategy" (lift_and_shift / hybrid / modernization), which only described
// HOW to handle existing workloads. Solution area captures WHAT the
// engagement is about — migration, modernization, new build, data
// platform, AI app, security buildout, etc. — and the migration strategy
// derives from it.
//
// Used by:
// - solution-area-assessor.ts (cheap LLM pass that classifies uploaded
//   docs into one of these areas with rationale + confidence)
// - solution-area-suggester.tsx (UI that runs the assessment, surfaces
//   the suggestion, allows refinement, and lets the user override)
// - BOM route (passes the chosen area to the prompt as extra context)

import type { MigrationStrategy } from "./paas-recommender";

export type SolutionArea =
  | "migration_lift_shift"
  | "migration_hybrid"
  | "modernization"
  | "on_prem_modernization"
  | "data_platform"
  | "greenfield_app"
  | "ai_app"
  | "siem_soc"
  | "disaster_recovery"
  | "cost_optimization"
  | "poc"
  | "unknown";

export const SOLUTION_AREA_LABELS: Record<SolutionArea, string> = {
  migration_lift_shift:   "Migration — lift and shift",
  migration_hybrid:       "Migration — hybrid",
  modernization:          "Modernization (PaaS refactor)",
  on_prem_modernization:  "On-prem modernization",
  data_platform:          "Data platform build",
  greenfield_app:         "Greenfield app deployment",
  ai_app:                 "AI / GenAI app development",
  siem_soc:               "SIEM / SOC buildout",
  disaster_recovery:      "Disaster recovery",
  cost_optimization:      "Cloud cost optimization (FinOps)",
  poc:                    "POC / time-boxed pilot",
  unknown:                "Unclear — needs human input",
};

export const SOLUTION_AREA_HINTS: Record<SolutionArea, string> = {
  migration_lift_shift:   "Datacenter-exit project. Move existing VMs to cloud as-is, minimal change. RVTools / Azure Migrate dump is typical input.",
  migration_hybrid:       "Datacenter exit with selective modernization. Move VMs to cloud + swap obvious DB / cache / file workloads to PaaS.",
  modernization:          "Full re-platform of an existing estate to PaaS. Refactor / replatform legacy apps; minimise IaaS.",
  on_prem_modernization:  "Stay on-prem, refresh hardware / hypervisor / SCCM. Cloud component is optional or hybrid edge only.",
  data_platform:          "Build a lakehouse / data warehouse / Microsoft Fabric / BI stack. Ingestion, storage, compute, semantic layer.",
  greenfield_app:         "New app from scratch — PaaS / serverless / containers first. No existing inventory to migrate.",
  ai_app:                 "Build a GenAI / RAG / agent application. Azure OpenAI / Bedrock / Vertex AI Model Garden, vector store, orchestration.",
  siem_soc:               "Security monitoring buildout — Sentinel / Security Hub / SCC plus ingest pipelines + analytics rules.",
  disaster_recovery:      "DR-only project — replicate existing workloads to a secondary region with RPO / RTO targets.",
  cost_optimization:      "Existing cloud cost optimization — RI / SP / right-size / decommission / FinOps practice.",
  poc:                    "Proof of concept. Time-boxed (4-12 weeks), scoped, with explicit success criteria + exit gate.",
  unknown:                "Couldn't classify confidently. Confirm with the customer or refine the assessment with more context.",
};

// Default migration strategy derived from solution area. The BOM picker
// stays as an override — these are starting points only.
const STRATEGY_BY_AREA: Record<SolutionArea, MigrationStrategy> = {
  migration_lift_shift:   "lift_and_shift",
  migration_hybrid:       "hybrid",
  modernization:          "modernization",
  on_prem_modernization:  "lift_and_shift",
  data_platform:          "modernization",
  greenfield_app:         "modernization",
  ai_app:                 "modernization",
  siem_soc:               "modernization",
  disaster_recovery:      "lift_and_shift",
  cost_optimization:      "lift_and_shift",
  poc:                    "modernization",
  unknown:                "lift_and_shift",
};

export function migrationStrategyFor(area: SolutionArea): MigrationStrategy {
  return STRATEGY_BY_AREA[area];
}

export const SOLUTION_AREAS_IN_ORDER: SolutionArea[] = [
  "migration_lift_shift",
  "migration_hybrid",
  "modernization",
  "on_prem_modernization",
  "data_platform",
  "greenfield_app",
  "ai_app",
  "siem_soc",
  "disaster_recovery",
  "cost_optimization",
  "poc",
  "unknown",
];
