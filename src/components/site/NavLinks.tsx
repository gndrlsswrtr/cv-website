"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ITEMS } from "./nav";

/**
 * Reads the URL, which is only known at request time — so this component is
 * rendered behind a `<Suspense>` boundary in the header (Next 16 + Cache
 * Components blocks prerendering otherwise).
 */
export function NavLinks() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          prefetch={true}
          className={`rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
            isActive(item.href)
              ? "bg-accent-soft font-medium text-accent"
              : "text-muted hover:text-foreground"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </>
  );
}
