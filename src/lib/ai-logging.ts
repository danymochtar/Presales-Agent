// LLM usage logger. Called from generation routes after the AI SDK call
// completes (success or failure). Best-effort: failures here never bubble up
// because that would break the user's deliverable generation flow.

import { prisma } from "./prisma";

export type LogLlmCallArgs = {
  tenantId: string;
  userId?: string | null;
  engagementId?: string | null;
  deliverableId?: string | null;
  purpose: string;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  durationMs: number;
  succeeded: boolean;
  errorMessage?: string | null;
};

export async function logLlmCall(args: LogLlmCallArgs): Promise<void> {
  const inputTokens = args.inputTokens ?? 0;
  const outputTokens = args.outputTokens ?? 0;
  try {
    await prisma.llmCall.create({
      data: {
        tenantId: args.tenantId,
        userId: args.userId ?? null,
        engagementId: args.engagementId ?? null,
        deliverableId: args.deliverableId ?? null,
        purpose: args.purpose,
        model: args.model,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        durationMs: args.durationMs,
        succeeded: args.succeeded,
        errorMessage: args.errorMessage ?? null,
      },
    });
  } catch (e) {
    console.error("[ai-logging] failed to record LLM call:", e);
  }
}

// Rough cost estimate per million tokens (USD), refresh as model prices change.
// Mirrors Anthropic public pricing through Vercel AI Gateway as of 2025-Q1.
// These numbers are advisory — for billing truth, reconcile against the
// Vercel AI Gateway billing dashboard.
const COST_PER_M_TOKENS: Record<string, { input: number; output: number }> = {
  "anthropic/claude-sonnet-4.5": { input: 3.0, output: 15.0 },
  "anthropic/claude-sonnet-4-5": { input: 3.0, output: 15.0 },
  "anthropic/claude-opus-4.5":   { input: 15.0, output: 75.0 },
  "anthropic/claude-haiku-4.5":  { input: 0.8, output: 4.0 },
  "anthropic/claude-haiku-4-5":  { input: 0.8, output: 4.0 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const rates = COST_PER_M_TOKENS[model] ?? { input: 3.0, output: 15.0 };
  const cost = (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output;
  return Math.round(cost * 10000) / 10000;
}

export type DeliverableCostBreakdown = {
  deliverableId: string;
  totalCalls: number;
  succeededCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalUsd: number;
  durationMs: number;
  modelMix: Record<string, { calls: number; inputTokens: number; outputTokens: number; usd: number }>;
};

/**
 * Aggregates every LlmCall row linked to a deliverable into a single
 * cost breakdown — used by the BOM / Assessment workspace header to
 * surface "this generation cost $X.YZ" to the user inline. Best-effort
 * (returns zeros when no calls exist).
 */
export async function costForDeliverable(deliverableId: string): Promise<DeliverableCostBreakdown> {
  const calls = await prisma.llmCall.findMany({
    where: { deliverableId },
    select: { model: true, inputTokens: true, outputTokens: true, durationMs: true, succeeded: true },
  });
  const breakdown: DeliverableCostBreakdown = {
    deliverableId,
    totalCalls: calls.length,
    succeededCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalUsd: 0,
    durationMs: 0,
    modelMix: {},
  };
  for (const c of calls) {
    const usd = estimateCostUsd(c.model, c.inputTokens, c.outputTokens);
    breakdown.inputTokens += c.inputTokens;
    breakdown.outputTokens += c.outputTokens;
    breakdown.totalUsd += usd;
    breakdown.durationMs += c.durationMs;
    if (c.succeeded) breakdown.succeededCalls += 1;
    const slot = breakdown.modelMix[c.model] ?? { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 };
    slot.calls += 1;
    slot.inputTokens += c.inputTokens;
    slot.outputTokens += c.outputTokens;
    slot.usd += usd;
    breakdown.modelMix[c.model] = slot;
  }
  breakdown.totalUsd = Math.round(breakdown.totalUsd * 10000) / 10000;
  return breakdown;
}
