// Picker state — what we persist on Engagement.landingZone.

import type { CloudType } from "@/lib/pricing/types";
import type { LzArchetype, LzComponent } from "./catalog";
import { lzAllArchetypesForCloud } from "./catalog";
import type { ComponentKind } from "@/lib/inventory/component-detector";

export type EngagementLandingZoneJson = {
  archetypes: LzArchetype[];
  // component names, keyed by cloud
  selectionsByCloud: Partial<Record<CloudType, string[]>>;
  updatedAt: string;
};

/**
 * Build the default selection for an engagement: every `requiredByDefault`
 * component for the picked archetypes, plus optional components whose
 * `pairsWith` matches the detected component kinds.
 */
export function defaultSelectionsForCloud(
  cloud: CloudType,
  archetypes: LzArchetype[],
  detected: ComponentKind[],
): string[] {
  const detectedSet = new Set(detected);
  const archSet = new Set(archetypes);
  return lzAllArchetypesForCloud(cloud)
    .filter((c) => archSet.has(c.archetype))
    .filter((c) => {
      if (c.requiredByDefault) return true;
      if (!c.pairsWith) return false;
      return c.pairsWith.some((k) => detectedSet.has(k));
    })
    .map((c) => c.name);
}

/**
 * For rendering: group a cloud's full catalog by archetype + category so the
 * picker UI can render section headers. Components stay in catalog order.
 */
export type GroupedComponents = Record<LzArchetype, Record<string, LzComponent[]>>;

export function groupForCloud(cloud: CloudType): GroupedComponents {
  const out: GroupedComponents = { infra: {}, platform: {}, data_ai: {} };
  for (const c of lzAllArchetypesForCloud(cloud)) {
    if (!out[c.archetype][c.category]) out[c.archetype][c.category] = [];
    out[c.archetype][c.category].push(c);
  }
  return out;
}
