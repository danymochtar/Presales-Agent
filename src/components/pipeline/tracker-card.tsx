"use client";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PURPOSE_LABELS, PURPOSE_COLORS, type TrackerPurpose } from "@/lib/pipeline/purpose";

const SOURCE_LABELS: Record<string, string> = {
  microsoft: "Microsoft", smb: "SMB", smc: "SMC", ent_ps: "ENT/PS",
  sales_rep: "Sales rep", funding: "Funding", creatio: "Creatio", other: "Other",
};

export function TrackerCard({
  id,
  name,
  source,
  purpose,
  count,
  lastSyncAt,
}: {
  id: string;
  name: string;
  source: string;
  purpose: string | null;
  count: number;
  lastSyncAt: string | null;
}) {
  const p = (purpose ?? "current_pipe") as TrackerPurpose;
  return (
    <Link href={`/pipeline/trackers/${id}`} className="block">
      <Card className="hover:bg-accent transition">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between gap-2">
            <span className="truncate">{name}</span>
            <span className="text-[10px] uppercase tracking-wider rounded border px-1.5 py-0.5 text-muted-foreground shrink-0">
              {SOURCE_LABELS[source] ?? source}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <div>
            <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${PURPOSE_COLORS[p]}`}>
              {PURPOSE_LABELS[p]}
            </span>
          </div>
          <div>{count} opportunit{count === 1 ? "y" : "ies"}</div>
          {lastSyncAt && <div>Last sync {new Date(lastSyncAt).toLocaleString()}</div>}
        </CardContent>
      </Card>
    </Link>
  );
}
