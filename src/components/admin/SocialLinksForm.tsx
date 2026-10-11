"use client";

import { useActionState } from "react";

import { saveSocialLinksAction } from "@/app/admin/settings-actions";
import type { SettingsFormState } from "@/app/admin/settings-state";
import type { SocialLink } from "@/lib/settings";
import { SOCIAL_PLATFORMS } from "@/lib/social-platforms";

export function SocialLinksForm({ links }: { links: SocialLink[] }) {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(
    saveSocialLinksAction,
    {},
  );

  // `readSocialLinks()` returns one entry per known platform, blank ones
  // included, so the stored value is just a lookup by platform key.
  const stored = new Map(links.map((link) => [link.platform, link.url]));

  return (
    <form action={formAction} className="grid gap-6">
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500"
        >
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p
          role="status"
          className="rounded-md border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-600"
        >
          {state.message ?? "Links saved."}
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        {SOCIAL_PLATFORMS.map((platform) => {
          const id = `link_${platform.key}`;
          const error = state.fieldErrors?.[platform.key];

          return (
            <div key={platform.key}>
              <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
                {platform.label}
              </label>
              <input
                // The email link stores a `mailto:` address; every other
                // platform must be a full http(s) URL.
                type={platform.key === "email" ? "text" : "url"}
                id={id}
                name={id}
                className="control"
                defaultValue={stored.get(platform.key) ?? ""}
                placeholder={platform.placeholder}
                aria-describedby={error ? `${id}-error` : undefined}
                {...(error ? { "aria-invalid": true } : {})}
              />
              {error ? (
                <p id={`${id}-error`} className="mt-1.5 text-xs text-red-500">
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted">
        Leave a field blank to hide that link from the site. Use a full{" "}
        <span className="font-medium text-foreground">https://</span> address — for the email link,
        just the address itself.
      </p>

      <div className="border-t border-border pt-5">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save links"}
        </button>
      </div>
    </form>
  );
}
