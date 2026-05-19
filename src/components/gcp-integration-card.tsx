"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Initial = { apiKeySet: boolean; useLivePricing: boolean } | null;

export function GcpIntegrationCard({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [apiKeySet, setApiKeySet] = useState(!!initial?.apiKeySet);
  const [useLivePricing, setUseLivePricing] = useState(initial?.useLivePricing ?? true);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function save() {
    setBusy("save");
    setMsg(null);
    try {
      const res = await fetch("/api/integrations/gcp", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey || undefined, useLivePricing }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "save failed");
      setMsg({ kind: "ok", text: "Saved." });
      setApiKey("");
      setApiKeySet(true);
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "save failed" });
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    setMsg(null);
    try {
      const res = await fetch("/api/integrations/gcp/test", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.ok === false) throw new Error(j.error || "test failed");
      setMsg({ kind: "ok", text: "Connection OK — Cloud Billing Catalog API responded." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "test failed" });
    } finally {
      setBusy(null);
    }
  }

  async function clear() {
    if (!confirm("Disconnect GCP? API key wiped; GCP BOMs revert to deferred state.")) return;
    setBusy("save");
    try {
      const res = await fetch("/api/integrations/gcp", { method: "DELETE" });
      if (!res.ok) throw new Error("clear failed");
      setApiKeySet(false);
      setApiKey("");
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "clear failed" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="gcp-key">Cloud Billing API key</Label>
        <Input
          id="gcp-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={apiKeySet ? "•••••••• (leave blank to keep)" : "Paste the API key from Google Cloud Console"}
          autoComplete="off"
        />
        <p className="text-[11px] text-muted-foreground">
          Create in console.cloud.google.com → APIs & Services → Credentials → Create API key.
          Restrict the key to the Cloud Billing API (cloudbilling.googleapis.com). Public list prices only — no
          customer-specific Enterprise discounts here.
        </p>
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={useLivePricing}
          onChange={(e) => setUseLivePricing(e.target.checked)}
        />
        Use live pricing for GCP BOMs (recommended). Uncheck to skip the live API.
      </label>

      {msg && <p className={`text-sm ${msg.kind === "ok" ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"}`}>{msg.text}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={busy !== null || (!apiKey && !apiKeySet)}>
          {busy === "save" ? "Saving…" : "Save"}
        </Button>
        <Button variant="outline" onClick={test} disabled={busy !== null || !apiKeySet}>
          {busy === "test" ? "Testing…" : "Test connection"}
        </Button>
        {apiKeySet && (
          <Button variant="ghost" onClick={clear} disabled={busy !== null} className="text-destructive">
            Disconnect
          </Button>
        )}
      </div>
    </div>
  );
}
