"use client";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SOURCE_LABELS: Record<string, string> = {
  microsoft: "Microsoft", smb: "SMB", smc: "SMC", ent_ps: "ENT/PS",
  sales_rep: "Sales rep", funding: "Funding", other: "Other",
};

export function TrackerCard({
  id,
  name,
  source,
  count,
  lastSyncAt,
}: {
  id: string;
  name: string;
  source: string;
  count: number;
  lastSyncAt: string | null;
}) {
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
          <div>{count} opportunit{count === 1 ? "y" : "ies"}</div>
          {lastSyncAt && <div>Last sync {new Date(lastSyncAt).toLocaleString()}</div>}
        </CardContent>
      </Card>
    </Link>
  );
}
