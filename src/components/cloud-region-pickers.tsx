"use client";
import { Label } from "@/components/ui/label";
import { listRegionsForCloud, MARKET_DEFAULT_REGIONS } from "@/lib/pricing/regions";
import {
  PURCHASE_MODEL_LABELS,
  PURCHASE_MODEL_HINTS,
  PURCHASE_MODELS,
  type Term,
  type CloudType,
} from "@/lib/pricing/types";

const CLOUDS: { id: CloudType; label: string; available: boolean; note?: string }[] = [
  { id: "azure", label: "Azure", available: true },
  { id: "aws",   label: "AWS",   available: true },
  { id: "gcp",   label: "GCP",   available: false, note: "Pricing integration deferred" },
];

export function CloudTogglePicker({
  selected,
  onToggle,
}: {
  selected: CloudType[];
  onToggle: (id: CloudType) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
      {CLOUDS.map((c) => {
        const checked = selected.includes(c.id);
        return (
          <button
            type="button"
            key={c.id}
            onClick={() => c.available && onToggle(c.id)}
            disabled={!c.available}
            className={`text-left rounded-md border p-3 text-sm transition ${
              checked ? "bg-primary/10 border-primary" : "hover:bg-accent"
            } ${!c.available ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            <div className="font-medium flex items-center gap-2">
              <span>{checked ? "☑" : "☐"}</span> {c.label}
            </div>
            {!c.available && c.note && <div className="text-xs text-muted-foreground">{c.note}</div>}
          </button>
        );
      })}
    </div>
  );
}

export function RegionSelect({
  cloudId,
  kind,
  value,
  onChange,
}: {
  cloudId: CloudType;
  kind: "primary" | "dr";
  value: string;
  onChange: (v: string) => void;
}) {
  const id = `${cloudId}-${kind}`;
  const regions = listRegionsForCloud(cloudId);
  const recommended = regions.filter((r) => r.recommended);
  const other = regions.filter((r) => !r.recommended);
  const known = new Set(regions.map((r) => r.code));
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{kind === "primary" ? "Primary" : "DR"}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        {value && !known.has(value) && <option value={value}>{value} (custom)</option>}
        {recommended.length > 0 && (
          <optgroup label="Recommended (Malaysia / SEA)">
            {recommended.map((r) => (
              <option key={r.code} value={r.code}>{r.label} — {r.location}</option>
            ))}
          </optgroup>
        )}
        {other.length > 0 && (
          <optgroup label="Other regions">
            {other.map((r) => (
              <option key={r.code} value={r.code}>{r.label} — {r.location}</option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}

export function RegionPickerPerCloud({
  targetClouds,
  cloudRegions,
  onChange,
}: {
  targetClouds: CloudType[];
  cloudRegions: Record<string, { primary: string; dr: string }>;
  onChange: (cloud: CloudType, kind: "primary" | "dr", v: string) => void;
}) {
  return (
    <>
      {targetClouds.map((cloudId) => (
        <div key={cloudId} className="space-y-2 border rounded-md p-3 bg-accent/30">
          <div className="text-sm font-medium">{cloudId.toUpperCase()} regions</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <RegionSelect
              cloudId={cloudId}
              kind="primary"
              value={cloudRegions[cloudId]?.primary ?? MARKET_DEFAULT_REGIONS[cloudId].primary}
              onChange={(v) => onChange(cloudId, "primary", v)}
            />
            <RegionSelect
              cloudId={cloudId}
              kind="dr"
              value={cloudRegions[cloudId]?.dr ?? MARKET_DEFAULT_REGIONS[cloudId].dr}
              onChange={(v) => onChange(cloudId, "dr", v)}
            />
          </div>
        </div>
      ))}
    </>
  );
}

export function PurchaseModelPicker({
  value,
  onChange,
  showHints = false,
}: {
  value: Term;
  onChange: (m: Term) => void;
  showHints?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {PURCHASE_MODELS.map((m) => {
        const active = value === m;
        return (
          <button
            type="button"
            key={m}
            onClick={() => onChange(m)}
            className={`text-left rounded-md border p-${showHints ? "3" : "2"} text-sm transition ${
              active ? "bg-primary/10 border-primary" : "hover:bg-accent"
            }`}
          >
            <div className="font-medium flex items-center gap-2">
              <span>{active ? "●" : "○"}</span> {PURCHASE_MODEL_LABELS[m]}
            </div>
            {showHints && (
              <div className="text-xs text-muted-foreground mt-0.5">{PURCHASE_MODEL_HINTS[m]}</div>
            )}
          </button>
        );
      })}
    </div>
  );
}
