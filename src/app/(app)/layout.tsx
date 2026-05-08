import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { requireSessionAndTenant } from "@/lib/tenant";
import { SignOutButton } from "@/components/sign-out-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const { user, tenant } = await requireSessionAndTenant(session.user.id);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="font-semibold">Presales Agent</Link>
            <nav className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link href="/dashboard" className="hover:text-foreground">Dashboard</Link>
              <Link href="/projects" className="hover:text-foreground">Projects</Link>
              <Link href="/settings" className="hover:text-foreground">Settings</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{tenant.name}</span>
            <span className="text-xs">·</span>
            <span>{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="flex-1 container py-6">{children}</main>
    </div>
  );
}
