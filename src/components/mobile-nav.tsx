"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string; badge?: string };

export function MobileNav({ items, currentTenant, currentEmail }: { items: NavItem[]; currentTenant: string; currentEmail: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-accent"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40 md:hidden"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="fixed inset-y-0 left-0 w-[80%] max-w-sm bg-card text-card-foreground shadow-xl z-50 md:hidden flex flex-col"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <p className="font-semibold">Noventiq</p>
                <p className="text-xs text-muted-foreground">Multicloud Agent</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-accent"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-2">
              <ul className="space-y-1">
                {items.map((item) => {
                  const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
                          active ? "bg-accent text-accent-foreground font-medium" : "hover:bg-accent"
                        }`}
                      >
                        <span>{item.label}</span>
                        {item.badge && (
                          <span className="text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 bg-amber-100 text-amber-900">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="border-t p-3 text-xs text-muted-foreground space-y-0.5">
              <p className="truncate">{currentEmail}</p>
              <p className="truncate">{currentTenant}</p>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
