"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrainingPanel } from "@/components/training-panel";
import { CloudChip } from "@/components/cloud-chip";
import { streamGenerate } from "@/lib/sse-stream";
import { DELIVERABLE_PREREQS, kindOfDbType } from "@/lib/deliverable-prereqs";

type Version = { id: string; version: number; status: string; createdAt: string };
type CloudTab = { id: string; label: string };

export function DeliverableWorkspace({
  projectId,
  projectName,
  projectMode,
  deliverableType,
  generatePath,
  prerequisiteMessage,
  canGenerate,
  versions,
  selectedContent,
  selectedVersion,
  selectedDeliverableId,
  cloudTabs,
  activeCloud,
  basePath,
}: {
  projectId: string;
  projectName: string;
  projectMode: "production" | "training";
  deliverableType: "bom" | "proposal" | "architecture" | "assessment" | "project_plan" | "tco" | "sow" | "ms_offering" | "customer_study";
  generatePath: string;
  prerequisiteMessage: string | null;
  canGenerate: boolean;
  versions: Version[];
  selectedContent: string | null;
  selectedVersion: number | null;
  selectedDeliverableId: string | null;
  cloudTabs?: CloudTab[];
  activeCloud?: string | null;
  basePath?: string;
}) {
  const router = useRouter();
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  const kind = kindOfDbType(deliverableType);
  const label = kind ? DELIVERABLE_PREREQS[kind].label : deliverableType;

  async function generate() {
    if (!canGenerate) {
      setErr(prerequisiteMessage ?? "prerequisites missing");
      return;
    }
    setStreaming(true);
    setStreamText("");
    setErr(null);
    try {
      await streamGenerate(generatePath, {
        onDelta: (d) => setStreamText((t) => t + d),
        onDone: () => router.refresh(),
      });
    } catch (e) {
      const raw = e instanceof Error ? e.message : "stream failed";
      // iOS Safari surfaces network/abort during streaming as "Load failed".
      const friendly = /load failed|network|aborted|fetch/i.test(raw)
        ? "Stream was interrupted (network or function timeout). The partial content above is still in-memory — click Generate again to retry. If this happens repeatedly, try a smaller scope or re-run from the Workflow pipeline button on the project page."
        : raw;
      setErr(friendly);
    } finally {
      setStreaming(false);
    }
  }

  const display = streamText || selectedContent || "";

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold flex flex-wrap items-baseline gap-x-2">
            <span className="truncate">{label}</span>
            <span className="text-sm md:text-base font-normal text-muted-foreground truncate">{projectName}</span>
            {activeCloud && <CloudChip cloud={activeCloud} />}
          </h1>
          <p className="text-sm text-muted-foreground">
            {versions.length === 0 ? "No versions yet" : `Latest v${versions[0].version} · ${versions.length} version(s)`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {selectedDeliverableId && (
            <Button asChild variant="outline" size="sm">
              <a href={`/api/deliverables/${selectedDeliverableId}/docx`}>Download .docx</a>
            </Button>
          )}
          <Button onClick={generate} disabled={streaming || !canGenerate} size="sm">
            {streaming ? "Generating..." : "Generate new version"}
          </Button>
        </div>
      </div>

      {cloudTabs && cloudTabs.length > 0 && basePath && (
        <div className="flex gap-1 border-b overflow-x-auto -mx-1 px-1">
          {cloudTabs.map((c) => (
            <Link
              key={c.id}
              href={`${basePath}?cloud=${c.id}`}
              className={`px-3 py-2 text-sm border-b-2 -mb-[1px] transition whitespace-nowrap ${
                activeCloud === c.id ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.label}
            </Link>
          ))}
        </div>
      )}

      {!canGenerate && prerequisiteMessage && (
        <p className="text-sm text-muted-foreground border rounded p-3">{prerequisiteMessage}</p>
      )}

      {err && <p className="text-sm text-destructive">{err}</p>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="md:col-span-1 order-2 md:order-1">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Versions</CardTitle></CardHeader>
          <CardContent>
            {versions.length === 0 ? (
              <p className="text-xs text-muted-foreground">none</p>
            ) : (
              <ul className="flex md:block gap-1 md:space-y-1 text-sm overflow-x-auto md:overflow-visible">
                {versions.map((v) => {
                  const params = new URLSearchParams();
                  params.set("v", String(v.version));
                  if (activeCloud) params.set("cloud", activeCloud);
                  return (
                    <li key={v.id} className="shrink-0">
                      <a
                        href={`?${params.toString()}`}
                        className={`block rounded px-2 py-1 hover:bg-accent whitespace-nowrap ${v.version === selectedVersion ? "bg-accent" : ""}`}
                      >
                        v{v.version} <span className="text-xs text-muted-foreground">· {v.status}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-3 order-1 md:order-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">{streaming ? "Streaming…" : selectedVersion ? `Version ${selectedVersion}` : "Preview"}</CardTitle></CardHeader>
          <CardContent>
            {display ? (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed max-w-full overflow-x-auto">{display}</pre>
            ) : (
              <p className="text-sm text-muted-foreground">Click "Generate new version" to draft a {label.toLowerCase()}.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {projectMode === "training" && display && !streaming && (
        <TrainingPanel
          projectId={projectId}
          deliverableType={deliverableType}
          draftContent={selectedContent}
        />
      )}
    </div>
  );
}
