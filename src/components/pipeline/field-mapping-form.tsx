"use client";
import { CANONICAL_FIELDS, FIELD_LABELS, type CanonicalField, type FieldMapping } from "@/lib/pipeline/field-mapping";

export function FieldMappingForm({
  headers,
  mapping,
  onChange,
}: {
  headers: string[];
  mapping: FieldMapping;
  onChange: (next: FieldMapping) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {CANONICAL_FIELDS.map((field: CanonicalField) => (
        <label key={field} className="text-sm space-y-1">
          <span className="text-muted-foreground">{FIELD_LABELS[field]}</span>
          <select
            value={mapping[field] ?? ""}
            onChange={(e) => onChange({ ...mapping, [field]: e.target.value || null })}
            className="block w-full rounded border bg-background px-2 py-1 text-sm"
          >
            <option value="">— ignore —</option>
            {headers.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
