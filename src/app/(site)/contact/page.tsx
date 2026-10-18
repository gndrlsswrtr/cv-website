import type { Metadata } from "next";
import Link from "next/link";
import { Globe, Mail, MapPin, Phone } from "lucide-react";

import { ContactForm } from "@/components/site/ContactForm";
import { Description, EmptyState, ExternalLink, Section } from "@/components/site/ui";
import { getProfile, getSiteSettings, getSocialLinks } from "@/lib/content";
import { platformLabel } from "@/lib/social-platforms";
import { pageMeta } from "@/lib/seo";
import { connection } from "next/server";

export async function generateMetadata(): Promise<Metadata> {
  return pageMeta(
    "Contact",
    "How to get in touch — send a message directly or use the listed contact details.",
  );
}

/** `tel:` wants digits; keep an extension-friendly `+` and drop the rest. */
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export default async function ContactPage() {

  // Deferred to request time: the build container cannot resolve the
  // database's private hostname, so this read must not run while
  // `next build` prerenders the route.
  await connection();
  const [settings, profile, links] = await Promise.all([
    getSiteSettings(),
    getProfile(),
    getSocialLinks(),
  ]);

  const showEmail = settings.contact_show_email && profile.email.trim() !== "";
  const showPhone = settings.contact_show_phone && profile.phone.trim() !== "";
  const showLocation = profile.location.trim() !== "";
  const showWebsite = profile.website.trim() !== "";
  const intro = settings.contact_intro.trim();

  const direct = (
    <ul className="grid gap-3 text-sm">
      {showEmail ? (
        <li className="flex items-center gap-2.5">
          <Mail aria-hidden className="h-4 w-4 shrink-0 text-accent" />
          <a href={`mailto:${profile.email}`} className="font-medium text-accent hover:underline">
            {profile.email}
          </a>
        </li>
      ) : null}
      {showPhone ? (
        <li className="flex items-center gap-2.5">
          <Phone aria-hidden className="h-4 w-4 shrink-0 text-accent" />
          <a href={telHref(profile.phone)} className="font-medium text-accent hover:underline">
            {profile.phone}
          </a>
        </li>
      ) : null}
      {showLocation ? (
        <li className="flex items-center gap-2.5 text-muted">
          <MapPin aria-hidden className="h-4 w-4 shrink-0 text-accent" />
          <span>{profile.location}</span>
        </li>
      ) : null}
      {showWebsite ? (
        <li className="flex items-center gap-2.5">
          <Globe aria-hidden className="h-4 w-4 shrink-0 text-accent" />
          <ExternalLink href={profile.website.trim()}>Website</ExternalLink>
        </li>
      ) : null}
    </ul>
  );

  const professionalLinks =
    links.length > 0 ? (
      <ul className="grid gap-2 text-sm">
        {links.map((link) => (
          <li key={`${link.platform}:${link.url}`} className="flex items-center gap-2.5">
            <Globe aria-hidden className="h-4 w-4 shrink-0 text-accent" />
            <ExternalLink href={link.url}>{link.label || platformLabel(link.platform)}</ExternalLink>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-muted">
        No professional links are published yet — add them in Settings → Profile.
      </p>
    );

  return (
    <>
      <header className="mb-10 max-w-3xl">
        <p className="eyebrow mb-3">Contact</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Get in touch</h1>
        {intro ? (
          <div className="mt-4 text-base leading-relaxed sm:text-lg">
            <Description text={settings.contact_intro} />
          </div>
        ) : (
          <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
            The fastest way to reach me is the form below — it goes straight to my inbox.
          </p>
        )}
      </header>

      {settings.contact_enabled ? (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
          <Section id="message" title="Send a message" kicker="I read every one">
            <div className="card p-5 sm:p-6">
              <ContactForm />
            </div>
          </Section>

          <aside className="grid gap-8" aria-label="Other ways to reach me">
            {showEmail || showPhone || showLocation || showWebsite ? (
              <div className="card p-6">
                <h2 className="text-sm font-semibold">Direct</h2>
                <div className="mt-4">{direct}</div>
              </div>
            ) : null}

            <div className="card p-6">
              <h2 className="text-sm font-semibold">Professional links</h2>
              <div className="mt-4">{professionalLinks}</div>
            </div>
          </aside>
        </div>
      ) : (
        <div className="grid gap-8">
          <EmptyState
            title="The contact form is closed right now."
            hint={
              showEmail
                ? "This form is not accepting messages at the moment — the direct options below are the best way to reach me."
                : "This form is not accepting messages at the moment. Please check back later."
            }
          />
          {showEmail || showPhone || showLocation || showWebsite ? (
            <div className="card p-6">
              <h2 className="text-sm font-semibold">Direct</h2>
              <div className="mt-4">{direct}</div>
            </div>
          ) : null}
          <div className="card p-6">
            <h2 className="text-sm font-semibold">Professional links</h2>
            <div className="mt-4">{professionalLinks}</div>
          </div>
          <div>
            <Link href="/about" className="text-sm text-accent hover:underline">
              More about me →
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
