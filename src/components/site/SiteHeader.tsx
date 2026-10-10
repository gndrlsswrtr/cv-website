import Link from "next/link";
import { Suspense } from "react";

import { MobileMenu } from "./MobileMenu";
import { NavLinks } from "./NavLinks";
import { NAV_ITEMS } from "./nav";

type HeaderProfile = {
  full_name: string;
  headline: string;
};

/**
 * Server component: everything here prerenders into the static shell, except
 * the nav — which needs the current URL and therefore streams in behind a
 * boundary. The fallback renders the same links without active highlighting,
 * so there is no visible layout shift.
 */
export function SiteHeader({ profile }: { profile: HeaderProfile }) {
  const name = profile.full_name.trim() || "Portfolio";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-6 px-5 py-3.5 sm:px-8">
        <Link href="/" className="group flex min-w-0 items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-foreground text-[13px] font-semibold text-background">
            {name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold leading-tight group-hover:text-accent">
              {name}
            </span>
            {profile.headline.trim() ? (
              <span className="block truncate text-xs leading-tight text-muted">
                {profile.headline}
              </span>
            ) : null}
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          <Suspense
            fallback={
              <>
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-md px-2.5 py-1.5 text-[13px] text-muted"
                  >
                    {item.label}
                  </Link>
                ))}
              </>
            }
          >
            <NavLinks />
          </Suspense>
        </nav>

        <MobileMenu />
      </div>
    </header>
  );
}
