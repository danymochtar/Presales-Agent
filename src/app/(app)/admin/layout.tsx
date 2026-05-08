import Link from "next/link";
import { redirect } from "next/navigation";
import { getSuperadminContextForPage } from "@/lib/admin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSuperadminContextForPage();
  if (!ctx) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Admin</h1>
          <p className="text-xs text-muted-foreground">
            Superadmin / presales manager view — define standards, monitor usage, manage users.
          </p>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/admin" className="hover:text-foreground text-muted-foreground">Overview</Link>
          <Link href="/admin/templates" className="hover:text-foreground text-muted-foreground">Templates</Link>
          <Link href="/admin/usage" className="hover:text-foreground text-muted-foreground">Usage</Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
