// Reusable cloud-brand chip. Used everywhere we identify a deliverable's
// cloud target. Brand-accurate hue per cloud, consistent sizing.

import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  azure: "Azure",
  aws: "AWS",
  gcp: "GCP",
  compare: "Compare",
  multi: "Multi-cloud",
};

const CLASSES: Record<string, string> = {
  azure: "chip-azure",
  aws: "chip-aws",
  gcp: "chip-gcp",
  compare: "chip-multi",
  multi: "chip-multi",
};

type Size = "xs" | "sm" | "md";

const SIZE_CLASSES: Record<Size, string> = {
  xs: "text-[10px] px-1.5 py-0.5",
  sm: "text-xs px-2 py-0.5",
  md: "text-sm px-2.5 py-1",
};

export function CloudChip({
  cloud,
  size = "sm",
  className,
  withLabel = true,
}: {
  cloud: string;
  size?: Size;
  className?: string;
  withLabel?: boolean;
}) {
  const label = LABELS[cloud] ?? cloud.toUpperCase();
  const cls = CLASSES[cloud] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border font-medium tracking-wide uppercase",
        SIZE_CLASSES[size],
        cls,
        className,
      )}
    >
      {withLabel ? label : null}
    </span>
  );
}

export function CloudChipGroup({ clouds, size = "sm" }: { clouds: string[]; size?: Size }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {clouds.map((c) => <CloudChip key={c} cloud={c} size={size} />)}
    </span>
  );
}
