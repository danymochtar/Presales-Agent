// Cloud-agnostic sizing dispatcher.
// Existing callers `import { recommendSku } from "@/lib/inventory/sizing"` resolve here.

import type { CloudType } from "@/lib/pricing/types";
import { recommendSku as recommendAzureSku } from "./azure";
import { recommendAwsInstance } from "./aws";

// Re-export for backward compat
export { recommendSku } from "./azure";
export { recommendAwsInstance } from "./aws";

export function recommendSkuForCloud(cloud: CloudType, cpu: number, ramGb: number): string {
  switch (cloud) {
    case "azure": return recommendAzureSku(cpu, ramGb);
    case "aws":   return recommendAwsInstance(cpu, ramGb);
    case "gcp":   throw new Error("GCP sizing not yet implemented (deferred)");
  }
}

export function recommendSkusForClouds(
  clouds: CloudType[],
  cpu: number,
  ramGb: number,
): Record<CloudType, string | null> {
  const result: Partial<Record<CloudType, string | null>> = {};
  for (const c of clouds) {
    try {
      result[c] = recommendSkuForCloud(c, cpu, ramGb);
    } catch {
      result[c] = null;
    }
  }
  return result as Record<CloudType, string | null>;
}
