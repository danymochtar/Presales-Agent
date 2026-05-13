"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACCENT_SWATCHES, type Branding } from "@/lib/tenant-settings";

const CLOUD_SWATCHES = ["sky", "indigo", "violet", "emerald", "amber", "orange", "rose", "slate"];

function Swatch({ hue, active, onClick }: { hue: string; active: boolean; onClick: () => void }) {
  const sample = hue === "primary" ? "bg-primary" : `bg-${hue}-500`;
  return (
    <button
      type="button"
      aria-label={hue}
      onClick={onClick}
      className={`relative h-7 w-7 rounded-md border-2 ${sample} ${active ? "border-foreground ring-2 ring-foreground/30" : "border-transparent hover:border-foreground/40"}`}
    >
      {active && <span className="absolute inset-0 flex items-center justify-center text-white text-xs">✓</span>}
    </button>
  );
}

export function BrandingForm({ initial }: { initial: Branding }) {
  const router = useRouter();
  const [b, setB] = useState<Branding>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function setCloud(c: keyof Branding["perCloudHue"], hue: string) {
    setB({ ...b, perCloudHue: { ...b.perCloudHue, [c]: hue } });
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/tenant/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === "string" ? j.error : "save failed");
      }
      setMsg({ kind: "ok", text: "Saved. Reload to see header + chips update." });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "save failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="b-name">Workspace display name</Label>
          <Input id="b-name" value={b.displayName} onChange={(e) => setB({ ...b, displayName: e.target.value })} />
          <p className="text-[11px] text-muted-foreground">Shows in the top nav next to the logo letter.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="b-letter">Logo letter (1-2 chars)</Label>
          <Input id="b-letter" maxLength={2} value={b.logoLetter} onChange={(e) => setB({ ...b, logoLetter: e.target.value.toUpperCase() })} />
          <p className="text-[11px] text-muted-foreground">The square badge in the top nav. Default &ldquo;N&rdquo;.</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Accent color</Label>
        <p className="text-[11px] text-muted-foreground">Drives primary buttons + active nav highlights.</p>
        <div className="flex gap-2 flex-wrap">
          {ACCENT_SWATCHES.map((s) => (
            <Swatch key={s.hue} hue={s.hue} active={b.accentHue === s.hue} onClick={() => setB({ ...b, accentHue: s.hue })} />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Cloud chip colors</Label>
        <p className="text-[11px] text-muted-foreground">Per-cloud chip color across the pipeline + business dashboard.</p>
        {(["azure", "aws", "gcp", "services"] as const).map((c) => (
          <div key={c} className="flex items-center gap-3">
            <span className="text-xs font-medium uppercase w-20">{c}</span>
            <div className="flex gap-1.5 flex-wrap">
              {CLOUD_SWATCHES.map((hue) => (
                <Swatch key={hue} hue={hue} active={b.perCloudHue[c] === hue} onClick={() => setCloud(c, hue)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {msg && <p className={`text-sm ${msg.kind === "ok" ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"}`}>{msg.text}</p>}

      <div className="flex justify-end">
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save branding"}</Button>
      </div>
    </div>
  );
}
