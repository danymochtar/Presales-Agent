// Classify what KIND of workload an uploaded artifact represents BEFORE
// running expensive extraction. Cheap LLM pass (Haiku) returns one of:
//   vm_inventory        — RVTools / Azure Migrate / server list / VM spec
//   siem_soc            — SIEM design, Sentinel ingestion profile, log volume
//   ai_ml               — AI/ML use case, token volume, model selection
//   data_platform       — Fabric capacity, Cosmos RU/s, Synapse DWU, data warehouse
//   app_modernization   — refactor / replatform doc, PaaS migration plan
//   mixed               — multi-workload architecture doc
//   unknown             — couldn't classify confidently; default to vm_inventory
//
// Used by the BOM generate route to pick the right output structure +
// optionally relax the workload-sizing requirement for non-VM types.

import { generateObject } from "ai";
import { z } from "zod";
import { gateway, CHEAP_MODEL } from "@/lib/ai";

export type WorkloadType =
  | "vm_inventory"
  | "siem_soc"
  | "ai_ml"
  | "data_platform"
  | "app_modernization"
  | "mixed"
  | "unknown";

export type WorkloadProfile = {
  primaryType: WorkloadType;
  secondaryTypes: WorkloadType[];
  rationale: string;
  confidence: "high" | "medium" | "low";
  needsVmSizing: boolean;       // true → caller should run VM extraction + sizing
  sources: string[];            // filenames considered
};

const Result = z.object({
  primaryType: z.enum([
    "vm_inventory", "siem_soc", "ai_ml", "data_platform", "app_modernization", "mixed", "unknown",
  ]),
  secondaryTypes: z.array(z.enum([
    "vm_inventory", "siem_soc", "ai_ml", "data_platform", "app_modernization", "mixed", "unknown",
  ])).default([]),
  rationale: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
});

const SYSTEM = `You triage cloud-cost artifacts to decide which pricing pipeline runs next.

You receive:
- One or more filenames + parsed summaries
- The number of structured workload rows already extracted (RVTools / Azure Migrate)
- Short text snippets from the document(s)

Return ONE primary type:
- "vm_inventory"      — IaaS list of servers/VMs with CPU/RAM/disk/OS (RVTools, Azure Migrate dump, raw VM spec table, server inventory CSV).
- "siem_soc"          — SIEM / Sentinel / SOC design doc. Mentions log sources, GB/day ingestion, retention windows, MDR scope.
- "ai_ml"             — AI / ML use case. Mentions model selection (GPT-4o, Claude, embeddings), token volume, RAG corpus size, vector store.
- "data_platform"     — Modern data stack. Microsoft Fabric capacity, Cosmos DB RU/s, Synapse DWU, lakehouse, Databricks DBU.
- "app_modernization" — Refactor / replatform plan. Maps existing apps to PaaS targets (App Service, AKS, Container Apps, Azure SQL DB).
- "mixed"             — Architecture covers ≥ 2 of the above and they should ALL be priced together.
- "unknown"           — Truly cannot tell. Avoid this unless the input is empty / OCR garbage.

Rules:
- If the workload-row count is ≥ 1 and the artifact is otherwise generic, lean "vm_inventory".
- A SIEM design that lists 3 SOC-team VMs is still "siem_soc" — the SIEM context is the headline.
- Be decisive: pick "high" confidence when 1+ explicit keyword matches; "medium" when content is suggestive but partial; "low" only when classification is genuinely ambiguous.
- secondaryTypes are for "mixed" — list every type that contributes (e.g. ["vm_inventory", "siem_soc"]).
- rationale: 1-2 sentences citing specific phrases / file names / row counts that drove the call.`;

export type ClassifierInput = {
  filenames: string[];
  summaries: string[];          // ParsedFile.rawSummary per file
  textSnippets: string[];       // first ~4K chars per file
  workloadRowCount: number;     // count after RVTools / Azure Migrate parse
};

export async function classifyWorkload(input: ClassifierInput): Promise<WorkloadProfile> {
  const userMsg = [
    `Filenames: ${JSON.stringify(input.filenames)}`,
    `Parsed workload rows: ${input.workloadRowCount}`,
    `File summaries:`,
    ...input.summaries.map((s, i) => `- [${input.filenames[i] ?? `f${i}`}] ${s}`),
    `\nText snippets (first 4K each):`,
    ...input.textSnippets.map((t, i) => `\n--- ${input.filenames[i] ?? `f${i}`} ---\n${t.slice(0, 4_000)}`),
  ].join("\n");

  let parsed: z.infer<typeof Result>;
  try {
    const res = await generateObject({
      model: gateway(CHEAP_MODEL),
      schema: Result,
      messages: [
        { role: "system", content: SYSTEM, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } },
        { role: "user", content: userMsg },
      ],
      maxOutputTokens: 600,
    });
    parsed = res.object;
  } catch {
    // Network / model failure: fall through to a safe default that doesn't
    // break BOM generation. VM inventory is the only mode that strictly
    // needs sizing, so default conservatively.
    return {
      primaryType: input.workloadRowCount > 0 ? "vm_inventory" : "unknown",
      secondaryTypes: [],
      rationale: "Classifier unavailable — defaulted to row-count heuristic.",
      confidence: "low",
      needsVmSizing: input.workloadRowCount > 0,
      sources: input.filenames,
    };
  }

  const needsVm = parsed.primaryType === "vm_inventory"
    || parsed.primaryType === "app_modernization"
    || parsed.primaryType === "mixed"
    || parsed.secondaryTypes.includes("vm_inventory")
    || parsed.secondaryTypes.includes("app_modernization");

  return {
    primaryType: parsed.primaryType,
    secondaryTypes: parsed.secondaryTypes,
    rationale: parsed.rationale,
    confidence: parsed.confidence,
    needsVmSizing: needsVm,
    sources: input.filenames,
  };
}

export const WORKLOAD_TYPE_LABELS: Record<WorkloadType, string> = {
  vm_inventory:      "VM inventory",
  siem_soc:          "SIEM / SOC",
  ai_ml:             "AI / ML",
  data_platform:     "Data platform",
  app_modernization: "App modernization",
  mixed:             "Mixed",
  unknown:           "Unknown",
};
