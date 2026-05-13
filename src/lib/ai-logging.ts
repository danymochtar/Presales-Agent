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
