"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewProjectPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    customer: "",
    industry: "",
    scopeSummary: "",
    primaryRegion: "Malaysia Central",
    drRegion: "Southeast Asia",
    mode: "production",
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "create failed");
      router.push(`/projects/${data.project.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
      setLoading(false);
    }
  }

  function field<K extends keyof typeof form>(k: K, label: string, type = "text") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={k}>{label}</Label>
        <Input id={k} type={type} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} required={k === "name" || k === "customer"} />
      </div>
    );
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>New project</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          {field("name", "Project name")}
          {field("customer", "Customer")}
          {field("industry", "Industry (e.g. BFSI, Retail, Gov)")}
          {field("scopeSummary", "Scope summary (1-2 sentences)")}
          <div className="grid grid-cols-2 gap-4">
            {field("primaryRegion", "Primary region")}
            {field("drRegion", "DR region")}
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="submit" disabled={loading}>{loading ? "Creating..." : "Create project"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
