import type { Metadata } from "next";

import { PasswordForm } from "@/components/admin/PasswordForm";
import { ProfileForm } from "@/components/admin/ProfileForm";
import { SiteSettingsForm } from "@/components/admin/SiteSettingsForm";
import { SocialLinksForm } from "@/components/admin/SocialLinksForm";
import { requireUser } from "@/lib/auth/session";
import { adminProfile } from "@/lib/content";
import { findRow } from "@/lib/crud";
import { FEATURED_SECTIONS, readSettings, readSocialLinks } from "@/lib/settings";

export const instant = false;

export const metadata: Metadata = {
  title: "Profile & settings",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const user = await requireUser();
  const [profile, settings, links] = await Promise.all([
    adminProfile(),
    readSettings(),
    readSocialLinks(),
  ]);

  const avatarRow = profile.avatar_id
    ? await findRow("documents", profile.avatar_id)
    : undefined;
  const avatar = avatarRow
    ? {
        original_name: String(avatarRow.original_name ?? "photo"),
        url: `/documents/${String(avatarRow.id)}`,
      }
    : null;

  const values: Record<string, string> = {
    full_name: profile.full_name,
    headline: profile.headline,
    location: profile.location,
    summary: profile.summary,
    email: profile.email,
    phone: profile.phone,
    website: profile.website,
    linkedin: profile.linkedin,
    github: profile.github,
    x_url: profile.x_url,
    footer_note: profile.footer_note,
  };

  return (
    <div className="grid gap-10">
      <header>
        <p className="eyebrow mb-2">Admin</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Profile & settings
        </h1>
        <p className="mt-2 text-sm text-muted">
          Your profile is the identity shown across the public site — header, home page and footer.
        </p>
      </header>

      <section aria-labelledby="profile-heading" className="grid gap-6">
        <div>
          <h2 id="profile-heading" className="text-lg font-semibold">
            Public profile
          </h2>
          <p className="mt-1 text-sm text-muted">
            Leave a field blank to hide it. Only published entries appear on the public site.
          </p>
        </div>
        <div className="card px-5 py-6 sm:px-6">
          <ProfileForm
            values={values}
            avatar={avatar}
            avatarUrl={avatar ? avatar.url : null}
          />
        </div>
      </section>

      <section aria-labelledby="password-heading" className="grid gap-6">
        <div>
          <h2 id="password-heading" className="text-lg font-semibold">
            Change password
          </h2>
          <p className="mt-1 text-sm text-muted">
            Signed in as <span className="font-medium text-foreground">{user.email}</span>. Changing
            your password signs out every other session.
          </p>
        </div>
        <div className="card px-5 py-6 sm:px-6">
          <PasswordForm />
        </div>
      </section>

      <section aria-labelledby="site-settings-heading" className="grid gap-6">
        <div>
          <h2 id="site-settings-heading" className="text-lg font-semibold">
            Site settings
          </h2>
          <p className="mt-1 text-sm text-muted">
            The title and description search engines and social previews use, plus which home-page
            sections appear — and how visitors can reach you.
          </p>
        </div>
        <div className="card px-5 py-6 sm:px-6">
          <SiteSettingsForm settings={settings} sections={FEATURED_SECTIONS} />
        </div>
      </section>

      <section aria-labelledby="social-links-heading" className="grid gap-6">
        <div>
          <h2 id="social-links-heading" className="text-lg font-semibold">
            Social links
          </h2>
          <p className="mt-1 text-sm text-muted">
            These appear in the site footer, in the order they are filled in. Leave a field blank to
            hide that link.
          </p>
        </div>
        <div className="card px-5 py-6 sm:px-6">
          <SocialLinksForm links={links} />
        </div>
      </section>
    </div>
  );
}
