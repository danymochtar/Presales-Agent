// Template injection helpers. Generation routes call findMatchingTemplates()
// to surface superadmin-defined references for the deliverable being built,
// then formatTemplatesAsPromptSection() turns them into a prompt block to
// glue into the user message — making the LLM mimic the house style.

import { prisma } from "./prisma";

export type TemplateMatch = {
  id: string;
  name: string | null;
  description: string | null;
  type: string;
  cloudProvider: string | null;
  engagementType: string | null;
  textContent: string;
  specificity: number; // 0 = catch-all, +1 cloud-specific, +1 engagementType-specific
};

export async function findMatchingTemplates(args: {
  tenantId: string;
  // Template.type literal: bom | assessment | proposal | architecture |
  // tco | project_plan | sow | ms_offering | letterhead | other
  deliverableType: string;
  cloud?: string | null;        // what's being generated: azure | aws | gcp | compare | multi | null
  engagementType?: string | null; // migration | greenfield | etc | null
  maxCount?: number;
}): Promise<TemplateMatch[]> {
  const all = await prisma.template.findMany({
    where: {
      tenantId: args.tenantId,
      type: args.deliverableType,
      status: "active",
      NOT: { textContent: null },
    },
  });

  const cloud = args.cloud ?? null;
  const ptype = args.engagementType ?? null;

  // Filter: a template matches when its cloudProvider is null (any-cloud) or
  // matches the target cloud, AND its engagementType is null or matches.
  const scored = all
    .map((t): TemplateMatch | null => {
      const cloudOk = t.cloudProvider === null || t.cloudProvider === cloud;
      const typeOk = t.engagementType === null || t.engagementType === ptype;
      if (!cloudOk || !typeOk) return null;
      let specificity = 0;
      if (t.cloudProvider !== null) specificity++;
      if (t.engagementType !== null) specificity++;
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        type: t.type,
        cloudProvider: t.cloudProvider,
        engagementType: t.engagementType,
        textContent: t.textContent ?? "",
        specificity,
      };
    })
    .filter((x): x is TemplateMatch => x !== null);

  // Most-specific first; tie-break by recency would need timestamp — just by
  // length as a proxy (longer references usually richer).
  scored.sort((a, b) => b.specificity - a.specificity || b.textContent.length - a.textContent.length);
  return scored.slice(0, args.maxCount ?? 2);
}

export function formatTemplatesAsPromptSection(
  templates: TemplateMatch[],
  maxCharsPerTemplate = 12_000,
): string {
  if (templates.length === 0) return "";
  const blocks = templates.map((t) => {
    const filters: string[] = [];
    if (t.cloudProvider) filters.push(`cloud=${t.cloudProvider}`);
    if (t.engagementType) filters.push(`project=${t.engagementType}`);
    const filterTag = filters.length > 0 ? ` (${filters.join(", ")})` : "";
    const content =
      t.textContent.length > maxCharsPerTemplate
        ? t.textContent.slice(0, maxCharsPerTemplate) + "\n... [truncated]"
        : t.textContent;
    const desc = t.description ? `${t.description}\n` : "";
    return `### House-style reference: "${t.name ?? "(untitled)"}"${filterTag}
${desc}
\`\`\`
${content}
\`\`\``;
  });
  return `## House-style reference templates

The presales manager has uploaded the following reference deliverable(s) for this engagement type. Mimic their structure, voice, level of detail, and section ordering. Adapt the *content* to this customer's facts, but keep the *form* aligned to these references unless a learned pattern explicitly overrides.

${blocks.join("\n\n---\n\n")}
`;
}
