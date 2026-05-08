"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signUp } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      if (mode === "sign-up") {
        const res = await signUp.email({ email, password, name });
        if (res.error) throw new Error(res.error.message);
      } else {
        const res = await signIn.email({ email, password });
        if (res.error) throw new Error(res.error.message);
      }
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Presales Agent</CardTitle>
          <CardDescription>{mode === "sign-in" ? "Sign in to continue." : "Create an internal account."}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            {mode === "sign-up" && (
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "..." : mode === "sign-in" ? "Sign in" : "Create account"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setMode((m) => (m === "sign-in" ? "sign-up" : "sign-in"))}
            >
              {mode === "sign-in" ? "Need an account? Sign up" : "Have an account? Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
