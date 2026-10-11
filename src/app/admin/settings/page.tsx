import type { Metadata } from "next";

import { PasswordForm } from "@/components/admin/PasswordForm";
import { ProfileForm } from "@/components/admin/ProfileForm";
import { requireUser } from "@/lib/auth/session";
import { adminProfile } from "@/lib/content";
import { findRow } from "@/lib/crud";

export const instant = false;

export const metadata: Metadata = {
  title: "Profile & settings",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const user = await requireUser();
  const profile = await adminProfile();

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
    </div>
  );
}
