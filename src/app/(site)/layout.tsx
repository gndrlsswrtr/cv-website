import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { getProfile, getSiteSettings } from "@/lib/content";
import { DEFAULT_DESCRIPTION } from "@/lib/seo";

/**
 * The public site reads the database on every render — the owner edits it from
 * the admin panel and expects the change to show up without a redeploy.
 *
 * `next build` cannot do that read: Railway's build container runs outside the
 * project's private network, so the database hostname
 * (`postgres.railway.internal`) does not resolve there. Prerendering these
 * routes therefore failed every deploy with `getaddrinfo ENOTFOUND` even though
 * the database itself was healthy and reachable at runtime.
 *
 * `instant = false` declares this route group blocking — rendered on demand
 * rather than prerendered — which is the documented opt-out for a route that
 * must reach runtime data. A `false` here also covers every page beneath it, so
 * the rest of the app keeps its static-shell validation.
 *
 * Nothing is lost by it: the reads below stay wrapped in `use cache` and tagged
 * `content`, so admin mutations still invalidate the whole public site through
 * `updateTag("content")` and `cacheLife("minutes")` still refreshes content on
 * its own. SEO metadata is unaffected — `generateMetadata` simply runs per
 * request instead of once at build.
 */
export const instant = false;

const SITE_URL = process.env.SITE_URL || "http://localhost:3000";
const FALLBACK_TITLE = process.env.SITE_TITLE || "Portfolio";
const FALLBACK_DESCRIPTION =
  process.env.SITE_DESCRIPTION?.trim() || DEFAULT_DESCRIPTION;

/**
 * The public site's title and meta description come from the database so the
 * owner can change them in Settings without redeploying. The environment
 * variables are only a fallback for a freshly created, still-empty site.
 *
 * Scoped to this route group so the admin, login and setup pages keep the
 * root layout's static metadata and never touch the database for `<head>`.
 */
export async function generateMetadata(): Promise<Metadata> {
  // Metadata is rendered separately from the page, so it needs its own
  // deferral — otherwise `next build` evaluates it while prerendering and hits
  // the same unreachable database hostname.
  await connection();

  const [settings, profile] = await Promise.all([getSiteSettings(), getProfile()]);

  const title = settings.site_title.trim() || FALLBACK_TITLE;
  const description = settings.site_description.trim() || FALLBACK_DESCRIPTION;
  const owner = String(profile.full_name ?? "").trim();

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: title,
      template: `%s · ${title}`,
    },
    description,
    applicationName: title,
    openGraph: {
      type: "website",
      siteName: title,
      title,
      description,
      ...(owner ? { authors: [owner] } : {}),
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    robots: { index: true, follow: true },
  };
}

export default async function SiteLayout({ children }: { children: ReactNode }) {
  // Deferred for the same reason as `generateMetadata` above.
  await connection();

  const profile = await getProfile();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader profile={profile} />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-5 py-12 sm:px-8 sm:py-16">
        {children}
      </main>
      <SiteFooter profile={profile} />
    </div>
  );
}
