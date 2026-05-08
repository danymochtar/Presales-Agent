"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Candidate = {
  pattern: string;
  scope: "universal" | "conditional";
  conditions: string[];
  confidence: "high" | "medium" | "low";
  rationale: string;
  example_from_draft?: string;
};

type ApprovalState = "approved" | "rejected" | "pending";
type WithApproval = Candidate & { state: ApprovalState; edited?: string };

export function TrainingPanel({
  projectId,
  deliverableType,
  draftContent,
}: {
  projectId: string;
  deliverableType: "bom" | "proposal" | "architecture" | "assessment" | "project_plan" | "tco" | "sow" | "ms_offering";
  draftContent: string | null;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<{
    candidates: WithApproval[];
    skipped: string[];
  } | null>(null);
  const [persisting, setPersisting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function extract() {
    if (feedback.trim().length < 5) {
      setErr("write some feedback first (≥5 chars)");
      return;
    }
    setExtracting(true);
    setExtractResult(null);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/training/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliverableType,
          feedback,
          draftContent: draftContent ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data));
      setExtractResult({
        candidates: (data.candidates as Candidate[]).map((c) => ({ ...c, state: "approved" as ApprovalState })),
        skipped: data.skipped_feedback ?? [],
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "extract failed");
    } finally {
      setExtracting(false);
    }
  }

  function setState(idx: number, state: ApprovalState) {
    if (!extractResult) return;
    const next = [...extractResult.candidates];
    next[idx] = { ...next[idx], state };
    setExtractResult({ ...extractResult, candidates: next });
  }

  function setEdited(idx: number, edited: string) {
    if (!extractResult) return;
    const next = [...extractResult.candidates];
    next[idx] = { ...next[idx], edited };
    setExtractResult({ ...extractResult, candidates: next });
  }

  async function persist() {
    if (!extractResult) return;
    const approved = extractResult.candidates
      .filter((c) => c.state === "approved")
      .map((c) => ({
        pattern: (c.edited ?? c.pattern).trim(),
        scope: c.scope,
        conditions: c.conditions,
        confidence: c.confidence,
        rationale: c.rationale,
      }));
    setPersisting(true);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/training/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliverableType,
          feedback,
          approvedPatterns: approved,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "persist failed");
      setMsg(`Saved. ${data.persistedCount} pattern(s) added to learned-patterns. Next regeneration will apply them.`);
      setFeedback("");
      setExtractResult(null);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "persist failed");
    } finally {
      setPersisting(false);
    }
  }

  return (
    <Card className="border-amber-300 bg-amber-50/40 dark:bg-amber-950/10">
      <CardHeader>
        <CardTitle className="text-base">Training mode — give feedback</CardTitle>
        <CardDescription>
          What should the agent do differently next time? Structural rules ("always include risks section"),
          stylistic ("bullet points only for MNCs"), or terminology preferences become saved patterns.
          Data fixes ("VM count is wrong") aren't pattern-worthy and are skipped automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="e.g. Exec summary too long for this customer segment. For MNCs, keep it under 1 page, bullet points only, lead with compliance posture."
          className="w-full min-h-[100px] rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          disabled={extracting || persisting}
        />
        <div className="flex gap-2">
          <Button onClick={extract} disabled={extracting || feedback.trim().length < 5}>
            {extracting ? "Extracting..." : "Extract patterns"}
          </Button>
          {extractResult && (
            <Button
              variant="outline"
              onClick={persist}
              disabled={persisting || extractResult.candidates.filter((c) => c.state === "approved").length === 0}
            >
              {persisting
                ? "Saving..."
                : `Save ${extractResult.candidates.filter((c) => c.state === "approved").length} approved`}
            </Button>
          )}
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        {msg && <p className="text-sm text-green-700 dark:text-green-400">{msg}</p>}

        {extractResult && (
          <div className="space-y-3 pt-2 border-t">
            <p className="text-sm font-medium">
              {extractResult.candidates.length} candidate pattern{extractResult.candidates.length === 1 ? "" : "s"}.
              Approve, edit, or reject each before saving.
            </p>
            {extractResult.candidates.map((c, idx) => (
              <div
                key={idx}
                className={`border rounded-md p-3 space-y-2 ${
                  c.state === "rejected" ? "opacity-50" : c.state === "approved" ? "border-green-400" : ""
                }`}
              >
                <Input
                  defaultValue={c.pattern}
                  onChange={(e) => setEdited(idx, e.target.value)}
                  className="font-medium"
                />
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>
                    <span className="font-medium">Scope:</span> {c.scope}
                    {c.conditions.length > 0 && ` (${c.conditions.join(", ")})`} ·
                    <span className="font-medium ml-2">Confidence:</span> {c.confidence}
                  </div>
                  <div className="italic">"{c.rationale}"</div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={c.state === "approved" ? "default" : "outline"}
                    onClick={() => setState(idx, "approved")}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant={c.state === "rejected" ? "destructive" : "outline"}
                    onClick={() => setState(idx, "rejected")}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
            {extractResult.skipped.length > 0 && (
              <div className="text-xs text-muted-foreground border-t pt-2">
                <span className="font-medium">Skipped (not pattern-worthy):</span>
                <ul className="list-disc pl-4 mt-1">
                  {extractResult.skipped.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
