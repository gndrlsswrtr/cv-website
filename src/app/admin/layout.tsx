import Link from "next/link";
import type { ReactNode } from "react";

import { logout } from "./actions";
import { requireUser } from "@/lib/auth/session";
import { RESOURCE_KEYS, RESOURCES } from "@/lib/resources";

/**
 * The admin area blocks on the session (rather than streaming behind a
 * boundary) so that `redirect("/login")` can still be sent as a real HTTP
 * redirect before anything is flushed.
 */
export const instant = false;

const NAV_SECTIONS = [
  { href: "/admin", label: "Dashboard" },
  ...RESOURCE_KEYS.map((key) => ({
    href: `/admin/${key}`,
    label: RESOURCES[key].label,
  })),
  { href: "/admin/settings", label: "Profile & settings" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen">
      {/* Top bar ---------------------------------------------------- */}
      <div className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-foreground text-xs font-semibold text-background">
              A
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Content dashboard</p>
              <p className="text-xs text-muted">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/" className="btn btn-secondary" target="_blank">
              View site ↗
            </Link>
            <form action={logout}>
              <button type="submit" className="btn btn-ghost">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8 lg:flex-row">
        {/* Sidebar --------------------------------------------------- */}
        <nav
          aria-label="Admin"
          className="flex shrink-0 gap-1 overflow-x-auto pb-1 lg:w-56 lg:flex-col lg:overflow-visible lg:pb-0"
        >
          {NAV_SECTIONS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-muted hover:bg-surface hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Content --------------------------------------------------- */}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
