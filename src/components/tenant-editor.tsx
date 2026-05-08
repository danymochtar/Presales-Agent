"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TenantEditor({
  tenant,
}: {
  tenant: { id: string; name: string; country: string; locale: string; currency: string; fxMyrPerUsd: number | null };
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: tenant.name,
    country: tenant.country,
    locale: tenant.locale,
    currency: tenant.currency,
    fxMyrPerUsd: tenant.fxMyrPerUsd ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/tenant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          country: form.country,
          locale: form.locale,
          currency: form.currency,
          fxMyrPerUsd: form.fxMyrPerUsd > 0 ? form.fxMyrPerUsd : null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg("Saved.");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <Label htmlFor="t-name">Tenant name</Label>
        <Input id="t-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="t-country">Country</Label>
        <Input id="t-country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="t-locale">Locale</Label>
        <Input id="t-locale" value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })} placeholder="en-MY" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="t-curr">Billing currency</Label>
        <Input id="t-curr" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} placeholder="USD" />
      </div>
      <div className="space-y-1.5 md:col-span-2">
        <Label htmlFor="t-fx">FX rate (MYR per 1 USD)</Label>
        <Input
          id="t-fx"
          type="number"
          step="0.01"
          value={form.fxMyrPerUsd || ""}
          onChange={(e) => setForm({ ...form, fxMyrPerUsd: Number(e.target.value) })}
          placeholder="4.70"
        />
        <p className="text-xs text-muted-foreground">Used for MYR equivalents in BOM totals + TCO references. Update quarterly against Bank Negara reference.</p>
      </div>
      <div className="md:col-span-2 flex items-center gap-3">
        <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
        {err && <span className="text-sm text-destructive">{err}</span>}
      </div>
    </div>
  );
}
