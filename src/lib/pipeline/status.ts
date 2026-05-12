// Pipeline status normalization. Pure functions — no I/O, no LLM.
// The keyword regex map is deterministic and unit-tested; ordering matters
// (uncommit must be matched before commit so "uncommitted" doesn't collide).

export type PipelineStatus =
  | "committed"
  | "upside"
  | "uncommitted"
  | "at_risk"
  | "won"
  | "lost"
  | "funding_pending_consent"
  | "funding_expiring"
  | "funding_closed_out"
  | "needs_follow_up"
  | "unknown";

export const PIPELINE_STATUSES: PipelineStatus[] = [
  "committed",
  "upside",
  "uncommitted",
  "at_risk",
  "won",
  "lost",
  "funding_pending_consent",
  "funding_expiring",
  "funding_closed_out",
  "needs_follow_up",
  "unknown",
];

export const STATUS_LABELS: Record<PipelineStatus, string> = {
  committed: "Committed",
  upside: "Upside",
  uncommitted: "Uncommitted",
  at_risk: "At Risk",
  won: "Won",
  lost: "Lost",
  funding_pending_consent: "Funding · Pending consent",
  funding_expiring: "Funding · Expiring",
  funding_closed_out: "Funding · Closed out",
  needs_follow_up: "Needs follow-up",
  unknown: "Unknown",
};

// Tailwind utility classes for the status pill. Kept in one place so the
// pill component, the KPI strip, and the table all stay consistent.
export const STATUS_COLORS: Record<PipelineStatus, string> = {
  committed: "bg-emerald-100 text-emerald-900 border-emerald-300",
  upside: "bg-sky-100 text-sky-900 border-sky-300",
  uncommitted: "bg-slate-100 text-slate-700 border-slate-300",
  at_risk: "bg-amber-100 text-amber-900 border-amber-300",
  won: "bg-green-200 text-green-900 border-green-400",
  lost: "bg-zinc-200 text-zinc-700 border-zinc-300",
  funding_pending_consent: "bg-violet-100 text-violet-900 border-violet-300",
  funding_expiring: "bg-rose-100 text-rose-900 border-rose-300",
  funding_closed_out: "bg-purple-100 text-purple-900 border-purple-300",
  needs_follow_up: "bg-orange-100 text-orange-900 border-orange-300",
  unknown: "bg-gray-100 text-gray-700 border-gray-300",
};

// Order matters: more-specific patterns first. "uncommit" is checked before
// "commit" so "uncommitted" doesn't match the commit rule.
const STATUS_KEYWORDS: Array<{ re: RegExp; status: PipelineStatus }> = [
  { re: /\bclosed?[\s\-_]*won\b/i, status: "won" },
  { re: /\bclosed?[\s\-_]*lost\b/i, status: "lost" },
  { re: /\buncommit(ted|s)?\b/i, status: "uncommitted" },
  { re: /\bcommit(ted|s|ment)?\b/i, status: "committed" },
  { re: /\bat[\s\-_]*risk\b/i, status: "at_risk" },
  { re: /\bup[\s\-_]*sides?\b/i, status: "upside" },
  { re: /\bpending[\s\-_]*consent\b/i, status: "funding_pending_consent" },
  { re: /\bexpir(ing|es|ed|y|ation)\b/i, status: "funding_expiring" },
  { re: /\bclos(e|ed|ing)[\s\-_]*out\b/i, status: "funding_closed_out" },
  { re: /\bfollow[\s\-_]*ups?\b/i, status: "needs_follow_up" },
  { re: /\bwon\b/i, status: "won" },
  { re: /\blost\b/i, status: "lost" },
];

export function normalizeStatus(
  raw: string | null | undefined,
  trackerStatusMap?: Record<string, PipelineStatus> | null,
): PipelineStatus {
  if (!raw) return "unknown";
  const trimmed = String(raw).trim();
  if (!trimmed) return "unknown";

  if (trackerStatusMap) {
    const direct = trackerStatusMap[trimmed] ?? trackerStatusMap[trimmed.toLowerCase()];
    if (direct && PIPELINE_STATUSES.includes(direct)) return direct;
  }

  for (const { re, status } of STATUS_KEYWORDS) {
    if (re.test(trimmed)) return status;
  }
  return "unknown";
}

// Used by the quick-note input: when the user types "moving to at risk,
// procurement delay", we surface the inferred status so the row's pill
// flips without an extra click.
export function statusFromNote(note: string | null | undefined): PipelineStatus | null {
  if (!note) return null;
  for (const { re, status } of STATUS_KEYWORDS) {
    if (re.test(note)) return status;
  }
  return null;
}
