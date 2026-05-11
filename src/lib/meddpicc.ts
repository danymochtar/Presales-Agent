// MEDDPICC deal-health scoring (M-E-D-D-P-I-C-C).
// 8 fields, each with a free-text value + confidence + lastUpdated.
// Score = weighted completeness × confidence × freshness penalty.
// Used by the dashboard "Deal health" column + project detail widget.

export type MeddpiccField =
  | "metrics" | "economicBuyer" | "decisionCriteria" | "decisionProcess"
  | "paperProcess" | "identifyPain" | "champion" | "competition";

export const MEDDPICC_FIELDS: { key: MeddpiccField; label: string; help: string }[] = [
  { key: "metrics",          label: "Metrics",            help: "Quantified business outcome the customer cares about (e.g. cut datacentre OpEx by 30%, reduce mean time-to-recover from 4h to 30m)." },
  { key: "economicBuyer",    label: "Economic Buyer",     help: "The single person with budget authority to sign. Name + title." },
  { key: "decisionCriteria", label: "Decision Criteria",  help: "What the buyer team will use to choose (technical fit, TCO, references, compliance, …)." },
  { key: "decisionProcess",  label: "Decision Process",   help: "Steps from now to PO: who reviews, in what order, with what gating." },
  { key: "paperProcess",     label: "Paper Process",      help: "Legal/procurement track + lead time (master agreement, BNM concurrence, panel, vendor onboarding)." },
  { key: "identifyPain",     label: "Identify Pain",      help: "The cost/risk of doing nothing — quantified where possible." },
  { key: "champion",         label: "Champion",           help: "The internal advocate selling for you when you're not in the room." },
  { key: "competition",      label: "Competition",        help: "Named competitors / in-house build / status-quo — and your reframe per competitor." },
];

export type Confidence = "high" | "medium" | "low";

export type MeddpiccEntry = {
  value: string | null;
  lastUpdated: string | null;   // ISO timestamp
  confidence: Confidence;
};

export type Meddpicc = Record<MeddpiccField, MeddpiccEntry>;

export function emptyMeddpicc(): Meddpicc {
  return Object.fromEntries(
    MEDDPICC_FIELDS.map((f) => [f.key, { value: null, lastUpdated: null, confidence: "low" }]),
  ) as Meddpicc;
}

const CONFIDENCE_WEIGHT: Record<Confidence, number> = { high: 1.0, medium: 0.6, low: 0.3 };

// Stage-aware weights. As a deal progresses, certain fields become essential.
// "stage" is the Project.stage enum value.
const STAGE_WEIGHTS: Record<string, Partial<Record<MeddpiccField, number>>> = {
  draft:     { identifyPain: 1.5, metrics: 1.2 },
  pending:   { economicBuyer: 1.5, decisionProcess: 1.3, paperProcess: 1.2, champion: 1.2 },
  won:       { metrics: 1.3, paperProcess: 1.3 },
  lost:      {},
  graduated: {},
};

export type FieldScore = {
  key: MeddpiccField;
  weight: number;
  value: string | null;
  confidence: Confidence;
  freshnessPenalty: number;     // 0..1, 1 = fully fresh
  score: number;                // 0..1
};

export type DealHealth = {
  totalPct: number;             // 0..100
  fieldScores: FieldScore[];
  blockers: { field: MeddpiccField; reason: string }[];
};

export function score(meddpicc: Meddpicc | null | undefined, stage: string | null | undefined): DealHealth {
  const m = meddpicc ?? emptyMeddpicc();
  const stageWeights = STAGE_WEIGHTS[stage ?? "draft"] ?? {};
  const now = Date.now();
  const fieldScores: FieldScore[] = MEDDPICC_FIELDS.map(({ key }) => {
    const e = m[key];
    const weight = stageWeights[key] ?? 1.0;
    const filled = !!(e?.value && e.value.trim().length > 0);
    const confidence = e?.confidence ?? "low";
    let freshness = 1;
    if (filled && e?.lastUpdated) {
      const ageDays = (now - new Date(e.lastUpdated).getTime()) / 86_400_000;
      if (ageDays > 30) freshness = 0.5;
      if (ageDays > 90) freshness = 0.25;
    } else if (filled) {
      freshness = 0.75;
    }
    const raw = filled ? CONFIDENCE_WEIGHT[confidence] * freshness : 0;
    return { key, weight, value: e?.value ?? null, confidence, freshnessPenalty: freshness, score: raw };
  });

  const totalWeight = fieldScores.reduce((s, f) => s + f.weight, 0);
  const weighted = fieldScores.reduce((s, f) => s + f.score * f.weight, 0);
  const totalPct = totalWeight > 0 ? Math.round((weighted / totalWeight) * 100) : 0;

  const blockers: DealHealth["blockers"] = [];
  for (const f of fieldScores) {
    if (!f.value) {
      blockers.push({ field: f.key, reason: `${labelOf(f.key)} not identified` });
    } else if (f.freshnessPenalty < 1) {
      blockers.push({ field: f.key, reason: `${labelOf(f.key)} stale (last updated > 30 days)` });
    }
  }
  // Order blockers by stage weight desc so the top one is the most material.
  blockers.sort((a, b) => (stageWeights[b.field] ?? 1) - (stageWeights[a.field] ?? 1));

  return { totalPct, fieldScores, blockers };
}

export function labelOf(field: MeddpiccField): string {
  return MEDDPICC_FIELDS.find((f) => f.key === field)?.label ?? field;
}

export function healthBand(pct: number): "red" | "amber" | "green" {
  if (pct >= 70) return "green";
  if (pct >= 40) return "amber";
  return "red";
}
