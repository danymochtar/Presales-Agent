import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { requireSessionAndTenant } from "@/lib/tenant";
import { SignOutButton } from "@/components/sign-out-button";
import { MobileNav } from "@/components/mobile-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const { user, tenant } = await requireSessionAndTenant(session.user.id);

  const navItems: { href: string; label: string; badge?: string }[] = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/projects", label: "Projects" },
    { href: "/quick", label: "Quick" },
    { href: "/settings", label: "Settings" },
  ];
  if (user.role === "superadmin") navItems.push({ href: "/admin", label: "Admin", badge: "admin" });

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-card sticky top-0 z-30">
        <div className="container flex items-center justify-between h-14 gap-2">
          <div className="flex items-center gap-2 md:gap-6 min-w-0 flex-1">
            <MobileNav items={navItems} currentEmail={user.email} currentTenant={tenant.name} />
            <Link href="/dashboard" className="font-semibold flex items-center gap-1.5 truncate">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-primary text-primary-foreground text-[10px] font-bold tracking-tighter shrink-0">N</span>
              <span className="hidden sm:inline">Noventiq</span>
              <span className="text-muted-foreground font-normal hidden md:inline">Multicloud Agent</span>
            </Link>
            <nav className="hidden md:flex items-center gap-4 text-sm text-muted-foreground">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`hover:text-foreground ${item.badge ? "rounded px-1.5 py-0.5 bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200 text-xs" : ""}`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
            <span className="hidden lg:inline truncate max-w-[160px]">{tenant.name}</span>
            <span className="hidden lg:inline text-xs">·</span>
            <span className="hidden md:inline truncate max-w-[200px]">{user.email}</span>
            {user.role === "superadmin" && (
              <span className="hidden lg:inline text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
                Superadmin
              </span>
            )}
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="flex-1 container py-4 md:py-6">{children}</main>
    </div>
  );
}
