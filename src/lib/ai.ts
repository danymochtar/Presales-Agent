import { createGateway } from "@ai-sdk/gateway";

// Vercel AI Gateway client. Uses AI_GATEWAY_API_KEY automatically when set in
// Vercel; on Vercel preview/prod deployments, the OIDC token also works without
// an explicit key. Locally, set AI_GATEWAY_API_KEY in .env.
export const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY,
});

// Default model. Override per-call or via env.
// Format: "<provider>/<model>" — Vercel AI Gateway routing.
export const DEFAULT_MODEL = process.env.AI_MODEL ?? "anthropic/claude-sonnet-4.5";

// Cheap, fast model used for triage / classification calls (e.g. workload-
// type classification before BOM extraction). Saves ~5-10× vs sonnet on
// pre-flight passes that just need a single typed JSON answer.
export const CHEAP_MODEL = process.env.AI_MODEL_CHEAP ?? "anthropic/claude-haiku-4.5";
