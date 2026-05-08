import Link from "next/link";
import { redirect } from "next/navigation";
import { getSuperadminContextForPage } from "@/lib/admin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSuperadminContextForPage();
  if (!ctx) redirect("/dashboard");

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
              Superadmin
            </span>
            <h1 className="text-xl md:text-2xl font-semibold">Admin</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Presales manager view — define standards, monitor usage, manage users.
          </p>
        </div>
        <nav className="flex items-center gap-1 text-sm overflow-x-auto -mx-1 px-1 md:overflow-visible">
          <Link href="/admin"           className="shrink-0 rounded-md px-2.5 py-1.5 hover:bg-accent text-muted-foreground hover:text-foreground">Overview</Link>
          <Link href="/admin/templates" className="shrink-0 rounded-md px-2.5 py-1.5 hover:bg-accent text-muted-foreground hover:text-foreground">Templates</Link>
          <Link href="/admin/usage"     className="shrink-0 rounded-md px-2.5 py-1.5 hover:bg-accent text-muted-foreground hover:text-foreground">Usage</Link>
          <Link href="/admin/users"     className="shrink-0 rounded-md px-2.5 py-1.5 hover:bg-accent text-muted-foreground hover:text-foreground">Users</Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
