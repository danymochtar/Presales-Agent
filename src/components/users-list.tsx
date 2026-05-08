"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Row = {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
};

export function UsersList({ initial, currentUserId }: { initial: Row[]; currentUserId: string }) {
  const router = useRouter();
  const [users, setUsers] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function setRole(u: Row, role: "user" | "superadmin") {
    setBusy(u.id);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "update failed");
      setUsers(users.map((x) => (x.id === u.id ? { ...x, role: data.user.role } : x)));
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="text-left py-2">Email</th>
            <th className="text-left">Name</th>
            <th className="text-left">Role</th>
            <th className="text-left">Joined</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const isMe = u.id === currentUserId;
            return (
              <tr key={u.id} className="border-b last:border-0">
                <td className="py-2">
                  {u.email}
                  {isMe && <span className="ml-1.5 text-[10px] uppercase text-muted-foreground">you</span>}
                </td>
                <td>{u.name}</td>
                <td>
                  <span className={`text-[10px] uppercase rounded px-1.5 py-0.5 ${
                    u.role === "superadmin"
                      ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"
                      : "bg-accent"
                  }`}>
                    {u.role}
                  </span>
                </td>
                <td className="text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="text-right space-x-1">
                  {u.role === "user" ? (
                    <Button size="sm" variant="outline" onClick={() => setRole(u, "superadmin")} disabled={busy === u.id}>
                      Promote
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRole(u, "user")}
                      disabled={busy === u.id || isMe}
                      title={isMe ? "Promote another user first if you want to demote yourself" : undefined}
                    >
                      Demote
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
