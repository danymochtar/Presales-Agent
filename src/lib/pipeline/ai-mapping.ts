// AI-assisted pipeline-tracker field mapping. Uses the cheap model (Haiku)
// to look at column headers + sample rows and propose:
//   - canonical-field mapping (customer / opportunity name / value / etc.)
//   - tracker source classification (microsoft / smb / smc / ent_ps / sales_rep / funding / other)
//   - tracker purpose (historical / target / current / funding)
//   - default origin (carry_over / new_target / existing_customer / net_new / unknown)
//
// More accurate than the regex header heuristics because the model sees the
// *content* of sample rows, not just the column names — so a column labelled
// "Acct" but full of "Maybank", "Petronas" gets recognized as Customer.

import { z } from "zod";
import { generateObject } from "ai";
import { gateway, CHEAP_MODEL } from "@/lib/ai";
import { logLlmCall } from "@/lib/ai-logging";
import { CANONICAL_FIELDS } from "@/lib/pipeline/field-mapping";
import { TRACKER_PURPOSES } from "@/lib/pipeline/purpose";
import { OPPORTUNITY_ORIGINS } from "@/lib/pipeline/origin";

const SOURCE_VALUES = ["microsoft", "smb", "smc", "ent_ps", "sales_rep", "funding", "other"] as const;

const OutputSchema = z.object({
  // Mapping must be present for every canonical field — null = "no column
  // in this sheet maps to that field". Values are exact header strings.
  mapping: z.object(
    CANONICAL_FIELDS.reduce((acc, f) => {
      acc[f] = z.string().nullable();
      return acc;
    }, {} as Record<string, z.ZodTypeAny>),
  ).passthrough(),
  suggestedName: z.string().min(1).max(120),
  suggestedSource: z.enum(SOURCE_VALUES),
  suggestedPurpose: z.enum(TRACKER_PURPOSES as [string, ...string[]]),
  suggestedDefaultOrigin: z.enum(OPPORTUNITY_ORIGINS as [string, ...string[]]),
  confidence: z.enum(["high", "medium", "low"]),
  rationale: z.string().max(400),
});

export type AiMappingResult = z.infer<typeof OutputSchema>;

const SYSTEM = `You are a pipeline-tracker field mapper. Given an Excel sheet's column headers and a handful of sample rows, propose:

1. CANONICAL FIELD MAPPING — map each of the canonical fields to the SOURCE column name (exact string from headers) that best fits, or null when nothing fits. Canonical fields:
   - externalId: a unique row identifier (Opp ID / CRM ID / Record ID). Null if the sheet has no stable key.
   - customer: customer / account / company / client name.
   - name: opportunity / deal / project / engagement / workload name.
   - status: stage / status / forecast / commit category.
   - valueUsd: deal value or TCV in USD.
   - valueMyr: deal value in MYR (Malaysian Ringgit) if a separate column exists.
   - closeDate: forecasted close / due date.
   - ownerName: account owner / rep / seller / SA / AM.
   - vendor: cloud or product line (Microsoft / Azure / AWS / GCP / VMware / Noventiq / etc.).
   - fundingProgram: hyperscaler funding program (Azure Accelerate / MAP / RaMP / ECIF / …).
   - fundingExpiresAt: funding consent expiry / valid-until date.
   - notes: free-text remarks / comments / next steps.

Use the SAMPLE ROWS to disambiguate. A column literally named "Acct" with values like "Maybank", "Petronas" is the customer column even though the header is cryptic.

2. TRACKER NAME — propose a short name (max 60 chars) reflecting what's in the sheet. Use the file name as a starting hint.

3. SOURCE — pick one of: microsoft | smb | smc | ent_ps | sales_rep | funding | other.
   - microsoft: Microsoft biweekly / partner pipe.
   - smb / smc: segment-level trackers.
   - ent_ps: Enterprise + Public Sector segment.
   - sales_rep: a single rep's personal pipe.
   - funding: hyperscaler funding programs (Azure Accelerate / MAP / RaMP).
   - other: doesn't match the above.

4. PURPOSE — one of: historical_pipeline | target_pipeline | current_pipe | funding | crm_sync | other.
   - historical_pipeline: closed deals from prior fiscal years (carry-over data, learning).
   - target_pipeline: named accounts the team is chasing this FY.
   - current_pipe: live deals being worked.
   - funding: hyperscaler funding programs.
   - crm_sync: never picked here — only for actual CRM syncs.

5. DEFAULT ORIGIN — one of: carry_over | new_target | existing_customer | net_new | unknown.
   - carry_over: pipeline rolled over from the previous FY.
   - new_target: new fiscal-year target customers.
   - existing_customer: expansion / renewal / cross-sell on existing book.
   - net_new: brand-new prospects.

Plus a confidence rating (high / medium / low) and a short 1-2 sentence rationale.

Hard rules:
- Mapping values MUST be exact strings from the provided headers list, or null.
- Be conservative — null is better than a wrong guess. Mapping a wrong column poisons every downstream KPI.
- For the canonical 'name' field, fall back to the 'customer' header when the sheet has no separate opportunity name column; the import will copy.`;

export async function aiSuggestMapping(args: {
  fileName: string;
  sheet: string;
  headers: string[];
  sampleRows: Record<string, unknown>[];
  tenantId: string;
  userId?: string | null;
}): Promise<AiMappingResult> {
  const userMessage = `# Pipeline tracker mapping request

File: ${args.fileName}
Sheet: ${args.sheet}
Headers (exact strings to choose from):
${args.headers.map((h) => `- ${JSON.stringify(h)}`).join("\n")}

Sample rows (JSON, first ${args.sampleRows.length}):
\`\`\`json
${JSON.stringify(args.sampleRows, null, 2)}
\`\`\`

Propose the mapping + tracker classification.`;

  const startTs = Date.now();
  try {
    const result = await generateObject({
      model: gateway(CHEAP_MODEL),
      schema: OutputSchema,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userMessage },
      ],
    });
    await logLlmCall({
      tenantId: args.tenantId,
      userId: args.userId ?? null,
      purpose: "pipeline-ai-mapping",
      model: CHEAP_MODEL,
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      durationMs: Date.now() - startTs,
      succeeded: true,
    });
    // Normalize: only keep mapping values that actually match a known header.
    const headerSet = new Set(args.headers);
    const cleanMapping: Record<string, string | null> = {};
    for (const f of CANONICAL_FIELDS) {
      const v = (result.object.mapping as Record<string, unknown>)[f];
      cleanMapping[f] = typeof v === "string" && headerSet.has(v) ? v : null;
    }
    return { ...result.object, mapping: cleanMapping } as AiMappingResult;
  } catch (err) {
    await logLlmCall({
      tenantId: args.tenantId,
      userId: args.userId ?? null,
      purpose: "pipeline-ai-mapping",
      model: CHEAP_MODEL,
      durationMs: Date.now() - startTs,
      succeeded: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
