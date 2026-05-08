"use client";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CloudChip } from "@/components/cloud-chip";
import {
  GROUP_LABELS,
  SERVICE_MAP,
  type Group,
  type ServiceRow,
} from "@/lib/service-mapping";

const ALL_GROUPS = Object.keys(GROUP_LABELS) as Group[];

function matches(row: ServiceRow, q: string): boolean {
  if (!q) return true;
  const haystack = [row.service, row.azure, row.aws, row.gcp, row.notes ?? ""].join(" ").toLowerCase();
  return haystack.includes(q.toLowerCase());
}

export function ServiceMapTable() {
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState<Group | "all">("all");

  const groupCounts = useMemo(() => {
    const out: Record<Group, number> = Object.fromEntries(ALL_GROUPS.map((g) => [g, 0])) as Record<Group, number>;
    for (const r of SERVICE_MAP) if (matches(r, query)) out[r.group]++;
    return out;
  }, [query]);

  const visible = useMemo(() => {
    return SERVICE_MAP
      .filter((r) => activeGroup === "all" || r.group === activeGroup)
      .filter((r) => matches(r, query));
  }, [activeGroup, query]);

  const grouped = useMemo(() => {
    const out: Partial<Record<Group, ServiceRow[]>> = {};
    for (const r of visible) (out[r.group] ??= []).push(r);
    return out;
  }, [visible]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <Input
          placeholder="Search services (e.g. Kubernetes, queue, vector)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-md"
        />
        <p className="text-xs text-muted-foreground">{visible.length} of {SERVICE_MAP.length} rows</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <FilterChip active={activeGroup === "all"} onClick={() => setActiveGroup("all")}>
          All ({SERVICE_MAP.filter((r) => matches(r, query)).length})
        </FilterChip>
        {ALL_GROUPS.map((g) => {
          const n = groupCounts[g];
          if (n === 0) return null;
          return (
            <FilterChip key={g} active={activeGroup === g} onClick={() => setActiveGroup(g)}>
              {GROUP_LABELS[g]} ({n})
            </FilterChip>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No matches. Try a broader search term or a different category.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {(Object.keys(grouped) as Group[]).map((g) => (
            <section key={g} className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {GROUP_LABELS[g]}
              </h2>
              <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
                <table className="w-full text-sm min-w-[800px]">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="text-left py-2 pr-3 w-[22%]">Capability</th>
                      <th className="text-left pr-3 w-[22%]"><CloudChip cloud="azure" size="xs" /></th>
                      <th className="text-left pr-3 w-[22%]"><CloudChip cloud="aws" size="xs" /></th>
                      <th className="text-left pr-3 w-[22%]"><CloudChip cloud="gcp" size="xs" /></th>
                      <th className="text-left">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped[g]!.map((r, i) => (
                      <tr key={`${g}-${i}`} className="border-b last:border-0 align-top">
                        <td className="py-2 pr-3 font-medium">{r.service}</td>
                        <td className="pr-3">{r.azure}</td>
                        <td className="pr-3">{r.aws}</td>
                        <td className="pr-3">{r.gcp}</td>
                        <td className="text-xs text-muted-foreground">{r.notes ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs rounded-full border px-2.5 py-1 transition ${
        active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );
}
