// Bank Negara Malaysia — Risk Management in Technology (RMiT)
// Policy Document BNM/RH/PD 028-98 (issued 28 November 2025).
// Cloud-specific: paragraphs 10.49, 10.50; Section 15 (Consultation +
// Notification); Appendix 10 (cloud governance + design controls).
//
// This module is the deterministic gate: when isApplicable(project) returns
// true, the SOW + Proposal generators refuse to produce output unless
// the project's compliance.rmit.acknowledgedAt is set. The form at
// /projects/[id]/compliance walks the user through the critical-system
// triage + Appendix 10 checklist + records consultation status.

export type ConsultationStatus = "not-started" | "initiated" | "approved" | "n/a";

export type CriticalSystemAnswers = {
  processesCustomerTransactions?: boolean;
  supportsCoreBanking?: boolean;
  storesPiiAtScale?: boolean;
  realTimePaymentRails?: boolean;
  regulatorReportingPipeline?: boolean;
};

export type RmitChecklist = {
  // Appendix 10 controls grouped by domain. true = customer commits to
  // implement; false = explicit gap to surface in SOW Risks section.
  byokKeyManagement?: boolean;
  exitStrategyDocumented?: boolean;
  zeroTrustMicroSegmentation?: boolean;
  mfaCompliantNoSmsOtp?: boolean;
  cryptographyPostQuantumReady?: boolean;
  logRetention3YearsMin?: boolean;
  criticalSystemMaxDowntime4Hours?: boolean;
  sharedResponsibilityDocumented?: boolean;
  standInProcessingArrangements?: boolean;
};

export type ProjectComplianceJson = {
  rmit?: {
    applicable: boolean;
    criticalSystemAnswers?: CriticalSystemAnswers;
    isCriticalSystem?: boolean;
    checklist?: RmitChecklist;
    consultationStatus: ConsultationStatus;
    consultationNotes?: string;
    acknowledgedAt?: string;   // ISO timestamp set when user submits the form
    acknowledgedBy?: string;   // user.id
  };
};

export type ProjectShape = {
  customerSegment?: string | null;
  tenant?: { country?: string | null } | null;
  // Prisma's JsonValue is broader than our typed shape; cast at the boundary.
  compliance?: unknown;
};

export function isApplicable(project: ProjectShape): boolean {
  return project.customerSegment === "BFSI"
    && (project.tenant?.country?.toLowerCase().includes("malaysia") ?? false);
}

function complianceJson(project: ProjectShape): ProjectComplianceJson | null {
  const c = project.compliance;
  if (!c || typeof c !== "object") return null;
  return c as ProjectComplianceJson;
}

export function rmitState(project: ProjectShape): ProjectComplianceJson["rmit"] | undefined {
  return complianceJson(project)?.rmit;
}

export function isAcknowledged(project: ProjectShape): boolean {
  return !!rmitState(project)?.acknowledgedAt;
}

export function requiresBnmConsultation(answers: CriticalSystemAnswers): boolean {
  return Object.values(answers).some(Boolean);
}

export const CRITICAL_SYSTEM_QUESTIONS: { key: keyof CriticalSystemAnswers; question: string; rationale: string }[] = [
  { key: "processesCustomerTransactions", question: "Will the workload process customer transactions (deposits, withdrawals, transfers, card)?", rationale: "Para 10.50 — transaction-processing systems are critical." },
  { key: "supportsCoreBanking", question: "Does it support a core banking system (Temenos / Finastra / Flexcube / custom)?", rationale: "Para 10.50 — core banking is Tier-1 critical." },
  { key: "storesPiiAtScale", question: "Will it store customer PII / KYC data at scale (>10K records)?", rationale: "Para 10.49 + PDPA 2010 — large-scale PII triggers consultation." },
  { key: "realTimePaymentRails", question: "Will it integrate with real-time payment rails (RPP / DuitNow / RENTAS / SWIFT)?", rationale: "Para 10.50 — payment rail integration is critical." },
  { key: "regulatorReportingPipeline", question: "Will it produce or feed regulatory reporting pipelines (BNM / LFSA / SC)?", rationale: "Section 15 — regulator-facing pipelines need notification." },
];

export const APPENDIX_10_CHECKLIST: { key: keyof RmitChecklist; control: string; appendix10Ref: string }[] = [
  { key: "byokKeyManagement",            control: "Customer retains ownership and control of encryption keys (BYOK / HYOK).", appendix10Ref: "App. 10 — Cryptography" },
  { key: "exitStrategyDocumented",       control: "Documented cloud exit strategy (data egress + workload portability) developed during planning.", appendix10Ref: "App. 10 — Exit Strategy" },
  { key: "zeroTrustMicroSegmentation",   control: "Zero-trust network with micro-segmentation between workload tiers.", appendix10Ref: "App. 10 — Network Security" },
  { key: "mfaCompliantNoSmsOtp",         control: "MFA: SMS OTP NOT used as standalone factor; codes initiated locally + bound to beneficiary + amount.", appendix10Ref: "App. 3 (Nov 2025 update)" },
  { key: "cryptographyPostQuantumReady", control: "Cryptography policy addresses post-quantum readiness.", appendix10Ref: "App. 10 — Cryptography" },
  { key: "logRetention3YearsMin",        control: "Network + user activity logs retained ≥ 3 years.", appendix10Ref: "Domain 10 — Technology Operations" },
  { key: "criticalSystemMaxDowntime4Hours", control: "Critical systems: max 4 hours cumulative unplanned downtime per rolling 12 months.", appendix10Ref: "Domain 10" },
  { key: "sharedResponsibilityDocumented", control: "Shared-responsibility model clearly defined per service model (IaaS / PaaS / SaaS).", appendix10Ref: "App. 10 — Cloud Governance" },
  { key: "standInProcessingArrangements", control: "Stand-in processing arrangements designed (Nov 2025 deadline: 30 Sep 2027).", appendix10Ref: "Section 15" },
];

export function compliancePostureMarkdown(project: ProjectShape): string {
  if (!isApplicable(project)) return "";
  const r = rmitState(project);
  if (!r) {
    return `## BNM RMiT compliance posture\n\n_Compliance check has not been completed. Open the project's compliance form before sending this deliverable to the customer._`;
  }
  const isCritical = r.isCriticalSystem ?? false;
  const consult = r.consultationStatus ?? "not-started";
  const checklist = r.checklist ?? {};
  const checklistRows = APPENDIX_10_CHECKLIST.map(({ key, control, appendix10Ref }) => {
    const val = checklist[key];
    const mark = val === true ? "✓ committed" : val === false ? "✗ gap (Risks)" : "— not assessed";
    return `| ${control} | ${appendix10Ref} | ${mark} |`;
  }).join("\n");
  return `## BNM RMiT compliance posture (BNM/RH/PD 028-98, 28 Nov 2025)
- **Critical-system classification (para 10.50):** ${isCritical ? "Yes — BNM consultation required" : "No — non-critical workload, RMiT applies but no consultation gate"}
- **Consultation status:** ${consult.replace(/-/g, " ")}${r.consultationNotes ? `\n- **Notes:** ${r.consultationNotes}` : ""}

### Appendix 10 control posture
| Control | Reference | Status |
|---|---|---|
${checklistRows}

_Acknowledged by user at ${r.acknowledgedAt ?? "(not yet)"}._`;
}
