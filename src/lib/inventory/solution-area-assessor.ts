// AI-driven solution-area assessor. Runs a cheap Haiku pass over the user's
// uploaded artifacts (filenames + parsed summaries + text snippets) and an
// optional refinement note, returns a SolutionArea suggestion with rationale,
// confidence, and 1-3 alternative areas the team should consider.
//
// Used by /api/inventory/assess-solution (standalone, no project required)
// → SolutionAreaSuggester UI in the project create + Quick wizards.

import { generateObject } from "ai";
import { z } from "zod";
import { gateway, CHEAP_MODEL } from "@/lib/ai";
import { SOLUTION_AREAS_IN_ORDER, type SolutionArea } from "./solution-area";

const SYSTEM = `You triage cloud presales artifacts to recommend the most-likely solution area for the engagement.

You receive:
- One or more uploaded artifact filenames + parse summaries + short text snippets
- Counts of components the parser already detected (DBs, web tiers, AD DCs, container hosts, cache, file shares)
- An optional refinement note from the user adding context the files alone don't reveal (e.g. "customer also wants a new AI assistant on top of this estate", "this is on-prem refresh, no cloud").

Pick the BEST primary solution area from this list:
- migration_lift_shift  — datacenter-exit, move VMs as-is, minimal change.
- migration_hybrid      — datacenter-exit + selective PaaS swap (DBs / caches / file shares).
- modernization         — full PaaS re-platform of existing estate.
- on_prem_modernization — stay on-prem, refresh hardware / hypervisor. Cloud is incidental.
- data_platform         — build lakehouse / Fabric / DW / BI stack.
- greenfield_app        — new app from scratch, PaaS-first.
- ai_app                — GenAI / RAG / agent application.
- siem_soc              — Sentinel / SOC monitoring buildout.
- disaster_recovery     — DR-only, replicate existing to secondary region.
- cost_optimization     — FinOps / right-size / RI / SP existing estate.
- poc                   — time-boxed pilot with explicit success criteria.
- unknown               — genuinely cannot tell.

Rules:
- An RVTools / Azure Migrate dump + no other context → almost always migration_lift_shift or migration_hybrid; if any database VMs detected and the refinement doesn't say "keep IaaS", lean migration_hybrid.
- A SIEM design doc → siem_soc, even if it lists a handful of SOC team VMs.
- An AI / RAG / token-volume doc → ai_app.
- Fabric / Cosmos / Synapse / Databricks capacity → data_platform.
- A doc saying "new app", "greenfield", "build from scratch" with no inventory → greenfield_app.
- A doc citing RPO / RTO + replication + no new build → disaster_recovery.
- A doc citing "cost", "right-size", "RI coverage", "FinOps" + existing cloud usage → cost_optimization.
- Refinement note overrides file-based guesses when it materially changes the engagement (e.g. "actually customer wants a new AI app on TOP of the migration" → return ai_app primary + migration_hybrid as an alternative).

Confidence:
- "high" when the artifact + refinement clearly point at one area.
- "medium" when the area is suggested but a competing alternative is plausible.
- "low" only when classification is genuinely ambiguous.

alternatives: 1-3 other solution areas that could fit, ordered by likelihood. Empty for "unknown".
useCaseExamples: 2-3 short customer-scenario sentences typical for the recommended area. Used by the UI to help the user confirm.
suggestedNextStep: 1-line action the team should take to firm up the classification (e.g. "Ask customer if AI assistant is in-scope" / "Confirm DR target region").
rationale: 1-2 sentences citing concrete signals (filenames, row counts, keyword phrases, refinement note).`;

const AreaEnum = z.enum(SOLUTION_AREAS_IN_ORDER as [SolutionArea, ...SolutionArea[]]);

const Result = z.object({
  primaryArea: AreaEnum,
  confidence: z.enum(["high", "medium", "low"]),
  rationale: z.string(),
  alternatives: z.array(AreaEnum).default([]),
  useCaseExamples: z.array(z.string()).default([]),
  suggestedNextStep: z.string().nullable().optional().transform((v) => v ?? ""),
});

export type SolutionAreaAssessment = z.infer<typeof Result>;

export type AssessorInput = {
  filenames: string[];
  summaries: string[];
  textSnippets: string[];
  detectedComponentCounts: Record<string, number>;
  refinementNote?: string;
};

export async function assessSolutionArea(input: AssessorInput): Promise<SolutionAreaAssessment> {
  const userMsg = [
    `Filenames: ${JSON.stringify(input.filenames)}`,
    `Detected component counts (DB / web / cache / file / AD / container):`,
    JSON.stringify(input.detectedComponentCounts),
    `\nFile summaries:`,
    ...input.summaries.map((s, i) => `- [${input.filenames[i] ?? `f${i}`}] ${s}`),
    `\nText snippets (first 3K each):`,
    ...input.textSnippets.map((t, i) => `\n--- ${input.filenames[i] ?? `f${i}`} ---\n${t.slice(0, 3_000)}`),
    input.refinementNote ? `\nUser refinement note (overrides file-based guesses when material):\n"""\n${input.refinementNote.slice(0, 2_000)}\n"""` : "",
  ].join("\n");

  try {
    const res = await generateObject({
      model: gateway(CHEAP_MODEL),
      schema: Result,
      messages: [
        { role: "system", content: SYSTEM, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } },
        { role: "user", content: userMsg },
      ],
      maxOutputTokens: 800,
    });
    return res.object;
  } catch {
    // Fail open: with any uploaded files, default to lift_shift migration with low confidence.
    return {
      primaryArea: input.filenames.length > 0 ? "migration_lift_shift" : "unknown",
      confidence: "low",
      rationale: "Assessor unavailable — defaulted from upload heuristic.",
      alternatives: [],
      useCaseExamples: [],
      suggestedNextStep: "Retry the assessment or pick a solution area manually.",
    };
  }
}
