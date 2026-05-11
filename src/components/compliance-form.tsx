"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  APPENDIX_10_CHECKLIST,
  CRITICAL_SYSTEM_QUESTIONS,
  type CriticalSystemAnswers,
  type RmitChecklist,
  type ConsultationStatus,
  type ProjectComplianceJson,
} from "@/lib/compliance/bnm-rmit";

type RmitJson = NonNullable<ProjectComplianceJson["rmit"]>;

export function ComplianceForm({
  projectId,
  initial,
}: {
  projectId: string;
  initial: RmitJson | null;
}) {
  const router = useRouter();
  const [criticalAnswers, setCriticalAnswers] = useState<CriticalSystemAnswers>(initial?.criticalSystemAnswers ?? {});
  const [checklist, setChecklist] = useState<RmitChecklist>(initial?.checklist ?? {});
  const [consultationStatus, setConsultationStatus] = useState<ConsultationStatus>(initial?.consultationStatus ?? "not-started");
  const [consultationNotes, setConsultationNotes] = useState(initial?.consultationNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isCritical = Object.values(criticalAnswers).some(Boolean);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/compliance`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rmit: { criticalSystemAnswers: criticalAnswers, checklist, consultationStatus, consultationNotes },
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === "string" ? j.error : "save failed");
      }
      router.push(`/projects/${projectId}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Critical-system triage (BNM RMiT para 10.50)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            If ANY answer is &ldquo;Yes&rdquo;, this workload is classified as critical and BNM consultation is required
            (Section 15) before go-live. Allow 6–12 weeks lead time in the project plan.
          </p>
          {CRITICAL_SYSTEM_QUESTIONS.map((q) => (
            <label key={q.key} className="flex items-start gap-3 text-sm border rounded-md p-3 cursor-pointer hover:bg-accent/30">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={!!criticalAnswers[q.key]}
                onChange={(e) => setCriticalAnswers({ ...criticalAnswers, [q.key]: e.target.checked })}
              />
              <span className="flex-1">
                <span className="block">{q.question}</span>
                <span className="text-xs text-muted-foreground">{q.rationale}</span>
              </span>
            </label>
          ))}
          <p className={`text-sm font-medium ${isCritical ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}`}>
            {isCritical
              ? "→ Critical system. BNM consultation required."
              : "→ Non-critical workload. RMiT controls still apply; consultation not required."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Appendix 10 control posture</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Tick controls the customer commits to implement. Untick = gap (will be surfaced in SOW Risks).
          </p>
          {APPENDIX_10_CHECKLIST.map((c) => (
            <label key={c.key} className="flex items-start gap-3 text-sm border rounded-md p-3 cursor-pointer hover:bg-accent/30">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={!!checklist[c.key]}
                onChange={(e) => setChecklist({ ...checklist, [c.key]: e.target.checked })}
              />
              <span className="flex-1">
                <span className="block">{c.control}</span>
                <span className="text-xs text-muted-foreground">{c.appendix10Ref}</span>
              </span>
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Consultation status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="status">BNM consultation status</Label>
            <select
              id="status"
              value={consultationStatus}
              onChange={(e) => setConsultationStatus(e.target.value as ConsultationStatus)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="not-started">Not started</option>
              <option value="initiated">Initiated (concurrence pending)</option>
              <option value="approved">Approved (concurrence received)</option>
              <option value="n/a">N/A (non-critical workload)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <textarea
              id="notes"
              value={consultationNotes}
              onChange={(e) => setConsultationNotes(e.target.value)}
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Reference letter date, BNM contact, scope of consultation, expected concurrence timeline…"
            />
          </div>
        </CardContent>
      </Card>

      {err && <p className="text-sm text-destructive">{err}</p>}

      <div className="flex justify-end gap-2">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : initial?.acknowledgedAt ? "Update compliance check" : "Acknowledge + save"}
        </Button>
      </div>
    </div>
  );
}
