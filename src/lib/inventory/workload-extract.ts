// LLM-based workload extractor — last-mile fallback when an Excel/CSV doesn't
// match the canonical RVTools or Azure Migrate column schemas. Reads the text
// content (CSV-style or free-form table) and returns a normalized WorkloadSet.

import { generateObject } from "ai";
import { z } from "zod";
import { gateway, DEFAULT_MODEL } from "@/lib/ai";
import { summarize, type Workload, type WorkloadSet } from "./workload";

const SYSTEM = `You extract VM/server workload inventory rows from a spreadsheet, table dump, or text description.

Output strictly conforming JSON. For each workload row, emit:
- name: hostname or workload name (string, non-empty)
- os: "linux" | "windows" | "other"
- cpu: vCPU count (integer ≥ 0)
- ramGb: RAM in GB (number; convert from MB if input is in MB by dividing by 1024)
- storageGb: storage in GB (number; convert from MB if needed)
- count: 1 (unless rows clearly represent groups; default 1)
- notes: optional short note

Rules:
- ONLY extract rows that clearly represent a server/VM. Skip header rows, totals, blank rows, and non-server entries.
- If OS is missing or unrecognized, mark as "other".
- If CPU/RAM/storage missing, set to 0 — do NOT invent values.
- Cap at 200 workloads — if more, take the first 200 and note in your handling.
- Be conservative: if a row's data is mostly missing/garbage, skip it.

Do not guess sizing; just extract what's stated.`;

const WorkloadSchema = z.object({
  name: z.string().min(1),
  os: z.preprocess((v) => {
    if (typeof v !== "string") return "other";
    const s = v.toLowerCase().trim();
    if (s === "linux" || s === "windows" || s === "other") return s;
    if (s.includes("windows")) return "windows";
    if (/(linux|ubuntu|centos|rhel|debian|suse|oracle|fedora)/.test(s)) return "linux";
    return "other";
  }, z.enum(["linux", "windows", "other"])),
  cpu: z.number().nonnegative().default(0),
  ramGb: z.number().nonnegative().default(0),
  storageGb: z.number().nonnegative().default(0),
  count: z.number().int().positive().default(1),
  notes: z.string().nullable().optional().transform((v) => v ?? undefined),
});

const ExtractResult = z.object({
  workloads: z.array(WorkloadSchema).default([]),
  warnings: z.array(z.string()).nullable().optional().transform((v) => v ?? []),
});

export async function extractWorkloadsFromText(text: string, filename?: string): Promise<{
  workloadSet: WorkloadSet;
  warnings: string[];
}> {
  const trimmed = text.slice(0, 80_000); // cap input size
  const result = await generateObject({
    model: gateway(DEFAULT_MODEL),
    schema: ExtractResult,
    messages: [
      {
        role: "system",
        content: SYSTEM,
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      },
      {
        role: "user",
        content: `Source: ${filename ?? "(unnamed)"}\n\nContent:\n\n${trimmed}`,
      },
    ],
    maxOutputTokens: 4000,
  });

  const workloads: Workload[] = result.object.workloads.map((w) => ({
    name: w.name,
    os: w.os,
    cpu: w.cpu,
    ramGb: w.ramGb,
    storageGb: w.storageGb,
    count: w.count,
    notes: w.notes,
  }));

  return {
    workloadSet: {
      source: "generic",
      workloads,
      totals: summarize(workloads),
    },
    warnings: result.object.warnings,
  };
}
