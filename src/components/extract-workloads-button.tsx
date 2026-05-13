"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ExtractWorkloadsButton({ projectId, inputId }: { projectId: string; inputId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/engagements/${projectId}/inputs/${inputId}/extract-workloads`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "extract failed");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={run} disabled={loading}>
        {loading ? "Extracting…" : "Extract workloads with AI"}
      </Button>
      {err && <span className="text-xs text-destructive">{err}</span>}
    </span>
  );
}
