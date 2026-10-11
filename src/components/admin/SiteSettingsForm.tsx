"use client";

import { useActionState, useState } from "react";

import { saveSiteSettingsAction } from "@/app/admin/settings-actions";
import type { SettingsFormState } from "@/app/admin/settings-state";
import type { SiteSettings } from "@/lib/settings";

/** Must match the cap enforced by `saveSettings()`. */
const DESCRIPTION_LIMIT = 320;

const CONTACT_OPTIONS: { name: keyof SiteSettings; label: string; hint: string }[] = [
  {
    name: "contact_enabled",
    label: "Accept messages",
    hint: "Visitors can reach you through the contact form. Messages land in your admin inbox.",
  },
  {
    name: "contact_show_email",
    label: "Show my email address",
    hint: "Displays your profile email on the contact page as a direct alternative.",
  },
  {
    name: "contact_show_phone",
    label: "Show my phone number",
    hint: "Displays your profile phone number on the contact page.",
  },
];

export function SiteSettingsForm({
  settings,
  sections,
}: {
  settings: SiteSettings;
  sections: { key: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(
    saveSiteSettingsAction,
    {},
  );
  const [description, setDescription] = useState(settings.site_description);

  const titleError = state.fieldErrors?.site_title;
  const descriptionError = state.fieldErrors?.site_description;
  const introError = state.fieldErrors?.contact_intro;
  const overLimit = description.length > DESCRIPTION_LIMIT;

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
          {state.message ?? "Site settings saved."}
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        {/* Title ------------------------------------------------------ */}
        <div className="sm:col-span-2">
          <label htmlFor="site_title" className="mb-1.5 block text-sm font-medium">
            Site title
          </label>
          <input
            type="text"
            id="site_title"
            name="site_title"
            className="control"
            defaultValue={settings.site_title}
            placeholder="Jane Doe — Software Engineer"
            maxLength={120}
            aria-describedby={titleError ? "site_title-hint site_title-error" : "site_title-hint"}
            {...(titleError ? { "aria-invalid": true } : {})}
          />
          <p id="site_title-hint" className="mt-1.5 text-xs text-muted">
            Used for the browser tab and search results. Leave blank to fall back to your name.
          </p>
          {titleError ? (
            <p id="site_title-error" className="mt-1.5 text-xs text-red-500">
              {titleError}
            </p>
          ) : null}
        </div>

        {/* Description ------------------------------------------------ */}
        <div className="sm:col-span-2">
          <label htmlFor="site_description" className="mb-1.5 block text-sm font-medium">
            Site description
          </label>
          <textarea
            id="site_description"
            name="site_description"
            rows={3}
            className="control"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            aria-describedby={
              descriptionError
                ? "site_description-error site_description-hint"
                : "site_description-hint"
            }
            {...(descriptionError ? { "aria-invalid": true } : {})}
          />
          <p id="site_description-hint" className="mt-1.5 text-xs text-muted">
            <span className={`tabular-nums ${overLimit ? "font-medium text-red-500" : ""}`}>
              {description.length}
            </span>{" "}
            / {DESCRIPTION_LIMIT} characters. Shown in search results and social previews — keep it
            under {DESCRIPTION_LIMIT} so it is not cut off.
          </p>
          {descriptionError ? (
            <p id="site_description-error" className="mt-1.5 text-xs text-red-500">
              {descriptionError}
            </p>
          ) : null}
        </div>

        {/* Contact intro ----------------------------------------------- */}
        <div className="sm:col-span-2">
          <label htmlFor="contact_intro" className="mb-1.5 block text-sm font-medium">
            Contact intro
          </label>
          <textarea
            id="contact_intro"
            name="contact_intro"
            rows={4}
            className="control"
            defaultValue={settings.contact_intro}
            placeholder="Tell visitors what you are open to — roles, collaborations, questions."
            aria-describedby={introError ? "contact_intro-hint contact_intro-error" : "contact_intro-hint"}
            {...(introError ? { "aria-invalid": true } : {})}
          />
          <p id="contact_intro-hint" className="mt-1.5 text-xs text-muted">
            Shown above the contact form. Leave blank to use no intro.
          </p>
          {introError ? (
            <p id="contact_intro-error" className="mt-1.5 text-xs text-red-500">
              {introError}
            </p>
          ) : null}
        </div>
      </div>

      {/* Contact options ---------------------------------------------- */}
      <div
        role="group"
        aria-labelledby="contact-options-heading"
        className="border-t border-border pt-6"
      >
        <p id="contact-options-heading" className="text-sm font-semibold">
          Contact options
        </p>
        <div className="mt-4 grid gap-3">
          {CONTACT_OPTIONS.map((option) => (
            <label key={option.name} className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name={option.name}
                value="1"
                defaultChecked={settings[option.name] === true}
                className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                <span className="font-medium">{option.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Featured sections -------------------------------------------- */}
      <div
        role="group"
        aria-labelledby="featured-sections-heading"
        className="border-t border-border pt-6"
      >
        <p id="featured-sections-heading" className="text-sm font-semibold">
          Featured home-page sections
        </p>
        <p className="mt-1 text-xs text-muted">
          Tick the sections visitors see on the home page. They appear in this order, and empty
          ones are skipped.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {sections.map((section) => (
            <label key={section.key} className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                name={section.key}
                value="1"
                defaultChecked={settings[section.key as keyof SiteSettings] === true}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span className="font-medium">{section.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="border-t border-border pt-5">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save site settings"}
        </button>
      </div>
    </form>
  );
}
