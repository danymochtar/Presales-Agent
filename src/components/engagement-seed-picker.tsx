"use client";

import { useMemo, useState } from "react";

export type SeedOpportunity = {
  id: string;
  customer: string;
  name: string;
  status: string;
  trackerName: string;
  valueUsd: number | null;
  closeDate: string | null;
  originKind: string;
};

export function EngagementSeedPicker({
  opportunities,
  onPick,
}: {
  opportunities: SeedOpportunity[];
  onPick: (opp: SeedOpportunity) => void;
}) {
  const [q, setQ] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return opportunities.slice(0, 25);
    return opportunities
      .filter((o) =>
        o.customer.toLowerCase().includes(needle) ||
        o.name.toLowerCase().includes(needle) ||
        o.trackerName.toLowerCase().includes(needle),
      )
      .slice(0, 25);
  }, [q, opportunities]);

  if (opportunities.length === 0) return null;

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-medium">Pick from your pipeline</p>
          <p className="text-xs text-muted-foreground">
            Already uploaded the customer in a tracker? Pick the opportunity below — customer + opportunity name pre-fill on the form.
          </p>
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${opportunities.length} opportunities`}
          className="h-9 w-full sm:w-64 rounded-md border border-input bg-background px-3 py-1 text-sm"
        />
      </div>
      <ul className="max-h-64 overflow-y-auto divide-y border rounded bg-background">
        {filtered.length === 0 ? (
          <li className="p-3 text-xs text-muted-foreground">No matches.</li>
        ) : (
          filtered.map((o) => {
            const picked = pickedId === o.id;
            return (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => { setPickedId(o.id); onPick(o); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition flex flex-col gap-0.5 ${picked ? "bg-primary/10" : ""}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{o.customer}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="truncate">{o.name}</span>
                    {picked && <span className="text-[10px] uppercase rounded px-1.5 py-0.5 bg-primary text-primary-foreground">selected</span>}
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                    <span>{o.trackerName}</span>
                    <span>·</span>
                    <span>{o.status.replace(/_/g, " ")}</span>
                    {o.valueUsd && <><span>·</span><span>USD {o.valueUsd.toLocaleString()}</span></>}
                    {o.closeDate && <><span>·</span><span>close {new Date(o.closeDate).toLocaleDateString()}</span></>}
                  </div>
                </button>
              </li>
            );
          })
        )}
      </ul>
      <p className="text-[11px] text-muted-foreground">
        Don&apos;t see the customer? Skip and fill the form manually — or <a href="/pipeline/trackers/new" className="underline">upload another tracker</a> first.
      </p>
    </div>
  );
}
