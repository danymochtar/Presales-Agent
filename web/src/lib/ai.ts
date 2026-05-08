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
