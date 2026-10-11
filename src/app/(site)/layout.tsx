import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { getProfile, getSiteSettings } from "@/lib/content";

const SITE_URL = process.env.SITE_URL || "http://localhost:3000";
const FALLBACK_TITLE = process.env.SITE_TITLE || "Portfolio";
const FALLBACK_DESCRIPTION =
  "Published achievements, certifications, education, skills, experience, projects and documents.";

/**
 * The public site's title and meta description come from the database so the
 * owner can change them in Settings without redeploying. The environment
 * variables are only a fallback for a freshly created, still-empty site.
 *
 * Scoped to this route group so the admin, login and setup pages keep the
 * root layout's static metadata and never touch the database for `<head>`.
 */
export async function generateMetadata(): Promise<Metadata> {
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
