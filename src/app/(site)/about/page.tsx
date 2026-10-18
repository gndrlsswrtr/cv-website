import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Globe, MapPin } from "lucide-react";

import { Description, EmptyState, ExternalLink, Section } from "@/components/site/ui";
import { getProfile, getSocialLinks } from "@/lib/content";
import { excerpt } from "@/lib/format";
import { platformLabel } from "@/lib/social-platforms";
import { pageMeta } from "@/lib/seo";
import { connection } from "next/server";

export async function generateMetadata(): Promise<Metadata> {
  // Metadata is rendered separately from the page, so it needs its own
  // deferral - otherwise `next build` evaluates it while prerendering.
  await connection();

  const profile = await getProfile();
  const name = profile.full_name.trim();
  const description =
    excerpt(profile.summary, 180) ||
    "About — background, focus areas and the fastest ways to get in touch.";

  return pageMeta(name ? `${name} — About` : "About", description);
}

/** Fallback links for owners who have not published any professional links. */
function profileLinks(profile: {
  website: string;
  linkedin: string;
  github: string;
  x_url: string;
}): { href: string; label: string }[] {
  const links: { href: string; label: string }[] = [];
  if (profile.website.trim()) links.push({ href: profile.website.trim(), label: "Website" });
  if (profile.linkedin.trim()) links.push({ href: profile.linkedin.trim(), label: "LinkedIn" });
  if (profile.github.trim()) links.push({ href: profile.github.trim(), label: "GitHub" });
  if (profile.x_url.trim()) links.push({ href: profile.x_url.trim(), label: "X / Twitter" });
  return links;
}

export default async function AboutPage() {

  // Deferred to request time: the build container cannot resolve the
  // database's private hostname, so this read must not run while
  // `next build` prerenders the route.
  await connection();
  const [profile, socialLinks] = await Promise.all([getProfile(), getSocialLinks()]);

  const name = profile.full_name.trim() || "Your name";
  const headline = profile.headline.trim();
  const hasSummary = profile.summary.trim().length > 0;

  const links =
    socialLinks.length > 0
      ? socialLinks.map((link) => ({
          href: link.url,
          label: link.label || platformLabel(link.platform),
        }))
      : profileLinks(profile);

  return (
    <>
      {/* Header ------------------------------------------------------ */}
      <header className="mb-10 grid max-w-3xl gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
        {profile.avatar_id ? (
          <Image
            src={`/documents/${profile.avatar_id}`}
            alt={name}
            width={88}
            height={88}
            priority
            unoptimized
            className="h-24 w-24 rounded-2xl border border-border object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="grid h-24 w-24 place-items-center rounded-2xl border border-border bg-surface text-2xl font-semibold"
          >
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div>
          <p className="eyebrow mb-3">About</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{name}</h1>
          {headline ? <p className="mt-2 text-base text-muted sm:text-lg">{headline}</p> : null}
        </div>
      </header>

      {/* Body --------------------------------------------------------- */}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <Section id="summary" title="Profile" kicker="In short">
          {hasSummary ? (
            <Description text={profile.summary} />
          ) : (
            <EmptyState
              title="No summary has been written yet."
              hint="Add a short paragraph about yourself in Settings → Profile and it will appear here."
            />
          )}
        </Section>

        <aside className="card p-6" aria-labelledby="about-details">
          <h2 id="about-details" className="text-sm font-semibold">
            Details
          </h2>

          <ul className="mt-4 space-y-3 text-sm">
            {profile.location.trim() ? (
              <li className="flex items-center gap-2.5 text-muted">
                <MapPin aria-hidden className="h-4 w-4 shrink-0 text-accent" />
                <span>{profile.location}</span>
              </li>
            ) : null}
            {links.map((link) => (
              <li key={link.href} className="flex items-center gap-2.5">
                <Globe aria-hidden className="h-4 w-4 shrink-0 text-accent" />
                <ExternalLink href={link.href}>{link.label}</ExternalLink>
              </li>
            ))}
            {profile.location.trim() === "" && links.length === 0 ? (
              <li className="text-muted">
                Add your location and professional links in Settings → Profile.
              </li>
            ) : null}
          </ul>

          <div className="mt-6 border-t border-border pt-5">
            <Link href="/contact" className="btn btn-primary w-full">
              Get in touch
            </Link>
            <p className="mt-3 text-xs text-muted">
              The contact page lists the fastest ways to reach me.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
