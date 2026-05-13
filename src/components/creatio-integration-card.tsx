"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Initial = {
  baseUrl: string;
  username: string;
  passwordSet: boolean;
  lastSyncAt: string | null;
} | null;

export function CreatioIntegrationCard({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState(initial?.lastSyncAt ?? null);
  const [passwordSet, setPasswordSet] = useState(!!initial?.passwordSet);
  const [busy, setBusy] = useState<"save" | "test" | "sync" | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function save() {
    setBusy("save");
    setMsg(null);
    try {
      const res = await fetch("/api/integrations/creatio", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, username, password: password || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "save failed");
      setMsg({ kind: "ok", text: "Saved." });
      setPassword("");
      setPasswordSet(true);
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
      const res = await fetch("/api/integrations/creatio/test", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.ok === false) {
        throw new Error(j.error || "test failed");
      }
      setMsg({ kind: "ok", text: "Connection OK — credentials accepted by Creatio." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "test failed" });
    } finally {
      setBusy(null);
    }
  }

  async function sync() {
    setBusy("sync");
    setMsg(null);
    try {
      const res = await fetch("/api/integrations/creatio/sync", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "sync failed");
      setLastSyncAt(new Date().toISOString());
      setMsg({
        kind: "ok",
        text: `Sync complete — ${j.total} opportunities (${j.created} new, ${j.updated} updated). View in the Pipeline tracker.`,
      });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "sync failed" });
    } finally {
      setBusy(null);
    }
  }

  async function clear() {
    if (!confirm("Disconnect Creatio? Credentials are wiped from the tenant config; synced opportunities are kept.")) return;
    setBusy("save");
    setMsg(null);
    try {
      const res = await fetch("/api/integrations/creatio", { method: "DELETE" });
      if (!res.ok) throw new Error("clear failed");
      setBaseUrl("");
      setUsername("");
      setPassword("");
      setPasswordSet(false);
      setLastSyncAt(null);
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "clear failed" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="creatio-url">Creatio base URL</Label>
          <Input id="creatio-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://yourcompany.creatio.com" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="creatio-user">Username</Label>
          <Input id="creatio-user" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="api.user@yourcompany.com" />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="creatio-pass">Password</Label>
          <Input
            id="creatio-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={passwordSet ? "•••••••• (leave blank to keep)" : "Enter password"}
            autoComplete="off"
          />
          <p className="text-[11px] text-muted-foreground">
            Stored on the tenant config — pilot only, no KMS envelope. Use a dedicated API user with read-only
            access to the Opportunity entity, not your personal account.
          </p>
        </div>
      </div>

      {msg && (
        <p className={`text-sm ${msg.kind === "ok" ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"}`}>
          {msg.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={busy !== null || !baseUrl || !username}>
          {busy === "save" ? "Saving…" : "Save credentials"}
        </Button>
        <Button variant="outline" onClick={test} disabled={busy !== null || !passwordSet}>
          {busy === "test" ? "Testing…" : "Test connection"}
        </Button>
        <Button variant="outline" onClick={sync} disabled={busy !== null || !passwordSet}>
          {busy === "sync" ? "Syncing…" : "Sync opportunities now"}
        </Button>
        {passwordSet && (
          <Button variant="ghost" onClick={clear} disabled={busy !== null} className="text-destructive">
            Disconnect
          </Button>
        )}
        {lastSyncAt && (
          <span className="text-xs text-muted-foreground">
            Last sync {new Date(lastSyncAt).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}
