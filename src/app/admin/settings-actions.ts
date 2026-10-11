"use server";

import { updateTag } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { CONTENT_TAG } from "@/lib/content";
import { FEATURED_SECTIONS, saveSettings, saveSocialLinks } from "@/lib/settings";
import { SOCIAL_PLATFORMS } from "@/lib/social-platforms";

import type { SettingsFormState } from "./settings-state";

/**
 * Settings and social links save in place on the settings page, so these
 * actions return a `SettingsFormState` instead of redirecting. Every other
 * rule from `./actions.ts` still applies: re-establish the caller first, and
 * invalidate the content cache once a write has landed.
 */

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

const TEXT_FIELDS = ["site_title", "site_description", "contact_intro"] as const;

const CONTACT_FLAGS = ["contact_enabled", "contact_show_email", "contact_show_phone"] as const;

export async function saveSiteSettingsAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  await requireUser();

  const values: Record<string, string> = {};
  for (const field of TEXT_FIELDS) values[field] = text(formData, field);

  // Every non-text field is a checkbox: it submits "1" when ticked and is
  // absent from the form data when not — exactly what `saveSettings` expects.
  const flagFields: string[] = [...CONTACT_FLAGS, ...FEATURED_SECTIONS.map((s) => s.key)];
  for (const field of flagFields) values[field] = text(formData, field) === "1" ? "1" : "";

  const result = await saveSettings(values);
  if (!result.ok) {
    return { error: "Please fix the highlighted fields.", fieldErrors: result.errors };
  }

  updateTag(CONTENT_TAG);
  return {
    ok: true,
    message: "Site settings saved. The public site refreshes within about a minute.",
  };
}

export async function saveSocialLinksAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  await requireUser();

  const entries = SOCIAL_PLATFORMS.map((platform) => ({
    platform: platform.key,
    url: text(formData, `link_${platform.key}`),
  }));

  const result = await saveSocialLinks(entries);
  if (!result.ok) {
    return { error: "Please fix the highlighted fields.", fieldErrors: result.errors };
  }

  updateTag(CONTENT_TAG);
  return {
    ok: true,
    message: "Links saved. Blank fields are hidden from the public site.",
  };
}
