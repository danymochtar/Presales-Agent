"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CLOUDS = [
  { id: "azure", label: "Azure", default: { primary: "malaysiacentral", dr: "southeastasia" }, primaryLabel: "Malaysia Central", drLabel: "Southeast Asia (Singapore)", available: true },
  { id: "aws",   label: "AWS",   default: { primary: "ap-southeast-5", dr: "ap-southeast-1" }, primaryLabel: "ap-southeast-5 (Malaysia)", drLabel: "ap-southeast-1 (Singapore)", available: true },
  { id: "gcp",   label: "GCP",   default: { primary: "asia-southeast2", dr: "asia-southeast1" }, primaryLabel: "asia-southeast2 (Jakarta)", drLabel: "asia-southeast1 (Singapore)", available: false, note: "Pricing integration deferred" },
] as const;

export default function NewProjectPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    customer: "",
    industry: "",
    customerSegment: "" as "" | "BFSI" | "Gov" | "MNC" | "SMB",
    scopeSummary: "",
    mode: "production" as "production" | "training",
  });
  const [targetClouds, setTargetClouds] = useState<string[]>(["azure", "aws"]);
  const [cloudRegions, setCloudRegions] = useState<Record<string, { primary: string; dr: string }>>({
    azure: CLOUDS[0].default,
    aws: CLOUDS[1].default,
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleCloud(id: string) {
    if (targetClouds.includes(id)) {
      if (targetClouds.length === 1) return; // need at least one
      setTargetClouds(targetClouds.filter((c) => c !== id));
      const next = { ...cloudRegions };
      delete next[id];
      setCloudRegions(next);
    } else {
      setTargetClouds([...targetClouds, id]);
      const def = CLOUDS.find((c) => c.id === id)!.default;
      setCloudRegions({ ...cloudRegions, [id]: { ...def } });
    }
  }

  function setRegion(cloud: string, key: "primary" | "dr", value: string) {
    setCloudRegions({ ...cloudRegions, [cloud]: { ...cloudRegions[cloud], [key]: value } });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          customerSegment: form.customerSegment || undefined,
          industry: form.industry || undefined,
          scopeSummary: form.scopeSummary || undefined,
          targetClouds,
          cloudRegions,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "create failed");
      router.push(`/projects/${data.project.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
      setLoading(false);
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader><CardTitle>New project</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Project name</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer">Customer</Label>
              <Input id="customer" value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="industry">Industry</Label>
              <Input id="industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="BFSI, Retail, Gov, etc." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="segment">Customer segment</Label>
              <select
                id="segment"
                value={form.customerSegment}
                onChange={(e) => setForm({ ...form, customerSegment: e.target.value as typeof form.customerSegment })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— select —</option>
                <option value="BFSI">BFSI</option>
                <option value="Gov">Gov / Public sector</option>
                <option value="MNC">MNC</option>
                <option value="SMB">SMB</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="scope">Scope summary (1-2 sentences)</Label>
            <textarea
              id="scope"
              value={form.scopeSummary}
              onChange={(e) => setForm({ ...form, scopeSummary: e.target.value })}
              className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Migrate 30 on-prem VMs to cloud, primary in MY, DR in SG."
            />
          </div>

          <div className="space-y-2 pt-2 border-t">
            <Label>Target clouds (compare across these)</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {CLOUDS.map((c) => {
                const checked = targetClouds.includes(c.id);
                return (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => c.available && toggleCloud(c.id)}
                    disabled={!c.available}
                    className={`text-left rounded-md border p-3 text-sm transition ${
                      checked ? "bg-primary/10 border-primary" : "hover:bg-accent"
                    } ${!c.available ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <div className="font-medium flex items-center gap-2">
                      <span>{checked ? "☑" : "☐"}</span> {c.label}
                    </div>
                    {!c.available && <div className="text-xs text-muted-foreground">{(c as { note?: string }).note}</div>}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Pick 1 cloud for single-cloud BOM, or 2+ for side-by-side compare. GCP pricing deferred.
            </p>
          </div>

          {targetClouds.map((cloudId) => {
            const cloud = CLOUDS.find((c) => c.id === cloudId)!;
            return (
              <div key={cloudId} className="space-y-2 border rounded-md p-3 bg-accent/30">
                <div className="text-sm font-medium">{cloud.label} regions</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`${cloudId}-primary`} className="text-xs">Primary</Label>
                    <Input
                      id={`${cloudId}-primary`}
                      value={cloudRegions[cloudId]?.primary ?? ""}
                      onChange={(e) => setRegion(cloudId, "primary", e.target.value)}
                      placeholder={cloud.primaryLabel}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${cloudId}-dr`} className="text-xs">DR</Label>
                    <Input
                      id={`${cloudId}-dr`}
                      value={cloudRegions[cloudId]?.dr ?? ""}
                      onChange={(e) => setRegion(cloudId, "dr", e.target.value)}
                      placeholder={cloud.drLabel}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="submit" disabled={loading}>{loading ? "Creating..." : "Create project"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
