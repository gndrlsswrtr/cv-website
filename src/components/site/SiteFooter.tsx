import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";

import { CONTENT_TAG, getSocialLinks } from "@/lib/content";

type FooterProfile = {
  full_name: string;
  footer_note: string;
  email: string;
  website: string;
};

function labelFor(href: string, fallback: string): string {
  try {
    const host = new URL(href).hostname.replace(/^www\./, "");
    return host || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Cached (and tagged like the rest of the public site) so the year can be
 * read at render time without making the layout request-dependent.
 *
 * Links come from the `social_links` table rather than columns on the profile:
 * the owner adds or removes platforms in Settings without a schema change, and
 * unpublished rows never reach this component because the read runs as the
 * `portfolio_public` role.
 */
export async function SiteFooter({ profile }: { profile: FooterProfile }) {
  "use cache";
  cacheTag(CONTENT_TAG);
  cacheLife("minutes");

  const socialLinks = await getSocialLinks();

  type FooterLink = { href: string; label: string; external: boolean };
  const links: FooterLink[] = [];

  if (profile.website) {
    links.push({
      href: profile.website,
      label: labelFor(profile.website, "Website"),
      external: true,
    });
  }
  for (const link of socialLinks) {
    links.push({
      href: link.url,
      label: link.label,
      external: !link.url.startsWith("mailto:"),
    });
  }

  const name = profile.full_name.trim() || "Portfolio";
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-start sm:justify-between sm:px-8">
        <div className="max-w-sm">
          <p className="text-sm font-semibold">{name}</p>
          {profile.footer_note.trim() ? (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">
              {profile.footer_note}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Curriculum vitae, projects and published work.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {links.map((link) => (
              <a
                key={`${link.href}:${link.label}`}
                href={link.href}
                {...(link.external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
                className="text-muted hover:text-accent"
              >
                {link.label}
              </a>
            ))}
            {profile.email ? (
              <a href={`mailto:${profile.email}`} className="text-muted hover:text-accent">
                Email
              </a>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
            <Link href="/documents" className="hover:text-accent">
              Documents
            </Link>
            <span>© {year}</span>
            {/*
              Owner shortcut, deliberately last. It targets `/login` rather than
              `/admin` so this component can stay inside `'use cache'` — reading
              the session cookie here would make every public page
              request-dependent. `proxy.ts` already bounces an authenticated
              session from `/login` to `/admin`, so one link covers both cases:
              signed out it shows the form, signed in it lands on the dashboard.
            */}
            <Link
              href="/login"
              title="Sign in to manage this site"
              className="ml-auto rounded-md border border-border px-2 py-1 transition-colors hover:border-accent/50 hover:text-accent"
            >
              Admin
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
