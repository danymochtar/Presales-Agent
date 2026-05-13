// Lightweight tooltip — renders an "ⓘ" glyph that surfaces the native
// browser tooltip via `title=` (accessible by default, no JS required) plus
// `aria-describedby` for screen readers. Use this anywhere a KPI label /
// chip / threshold needs a one-line explainer.

import { cn } from "@/lib/utils";

let counter = 0;

export function HelpTooltip({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  // Deterministic-ish id per render; only used for aria-describedby so a
  // collision across SSR + client is harmless.
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER;
  const id = `helptip-${counter}`;
  return (
    <span
      role="img"
      aria-label="More info"
      aria-describedby={id}
      title={text}
      tabIndex={0}
      className={cn(
        "inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-muted text-muted-foreground text-[9px] font-bold cursor-help align-middle leading-none",
        "hover:bg-muted-foreground hover:text-background transition",
        className,
      )}
    >
      i
      <span id={id} className="sr-only">{text}</span>
    </span>
  );
}
