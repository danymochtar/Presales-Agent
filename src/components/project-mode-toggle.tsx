"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ProjectModeToggle({
  projectId,
  initialMode,
}: {
  projectId: string;
  initialMode: "production" | "training";
}) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [pending, setPending] = useState(false);

  async function toggle() {
    const next = mode === "production" ? "training" : "production";
    setPending(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMode(next);
      router.refresh();
    } catch {
      // ignore for now
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      onClick={toggle}
      disabled={pending}
      variant={mode === "training" ? "default" : "outline"}
      size="sm"
      title={
        mode === "training"
          ? "Training mode active. Deliverable workspaces show feedback panel after generation."
          : "Production mode. Switch to Training to capture feedback as learned patterns."
      }
    >
      {pending ? "..." : mode === "training" ? "● Training mode" : "○ Production"}
    </Button>
  );
}
