// Surface the LLM token cost for a deliverable inline on its workspace
// header. Reads from `costForDeliverable()` on the server, renders an
// at-a-glance strip with USD + token counts + duration.

import type { DeliverableCostBreakdown } from "@/lib/ai-logging";
import { HelpTooltip } from "@/components/ui/help-tooltip";

export function LlmCostStrip({ cost }: { cost: DeliverableCostBreakdown }) {
  if (cost.totalCalls === 0) return null;
  const models = Object.keys(cost.modelMix);
  const seconds = Math.round(cost.durationMs / 100) / 10;
  return (
    <div className="inline-flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">
        LLM cost ${cost.totalUsd.toFixed(2)}
      </span>
      <HelpTooltip text="Estimated USD cost of every LLM call linked to this deliverable. Rates from src/lib/ai-logging.ts COST_PER_M_TOKENS — advisory; reconcile against the AI Gateway invoice for the canonical number." />
      <span>·</span>
      <span>
        {(cost.inputTokens / 1000).toFixed(1)}k in
        {" / "}
        {(cost.outputTokens / 1000).toFixed(1)}k out
      </span>
      <span>·</span>
      <span>{seconds}s</span>
      {models.length > 0 && (
        <>
          <span>·</span>
          <span className="truncate max-w-[280px]" title={models.join(", ")}>
            {models.length === 1 ? models[0].replace(/^anthropic\//, "") : `${models.length} models`}
          </span>
        </>
      )}
    </div>
  );
}
