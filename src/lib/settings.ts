import { all, get, run, withPublicRole, withTransaction, type Row } from "@/lib/db";
import { isSafeExternalUrl } from "@/lib/resources";
import { SOCIAL_PLATFORMS } from "@/lib/social-platforms";

/**
 * Owner-editable site settings and professional links.
 *
 * Settings decide what the public site shows — the title used in `<title>` and
 * Open Graph tags, which home-page sections are featured, and whether the
 * contact form is open. They live in the database rather than in environment
 * variables so the owner can change them without redeploying.
 */

export type SiteSettings = {
  site_title: string;
  site_description: string;
  featured_about: boolean;
  featured_experience: boolean;
  featured_education: boolean;
  featured_skills: boolean;
  featured_projects: boolean;
  featured_achievements: boolean;
  featured_certifications: boolean;
  featured_volunteer: boolean;
  featured_documents: boolean;
  contact_enabled: boolean;
  contact_intro: string;
  contact_show_phone: boolean;
  contact_show_email: boolean;
};

export const DEFAULT_SETTINGS: SiteSettings = {
  site_title: "",
  site_description: "",
  featured_about: true,
  featured_experience: true,
  featured_education: true,
  featured_skills: true,
  featured_projects: true,
  featured_achievements: true,
  featured_certifications: true,
  featured_volunteer: true,
  featured_documents: true,
  contact_enabled: true,
  contact_intro: "",
  contact_show_phone: false,
  contact_show_email: true,
};

/** Home-page sections in the order they appear, each behind a featured flag. */
export const FEATURED_SECTIONS: { key: keyof SiteSettings; label: string }[] = [
  { key: "featured_about", label: "About" },
  { key: "featured_experience", label: "Work experience" },
  { key: "featured_volunteer", label: "Volunteering & leadership" },
  { key: "featured_education", label: "Education" },
  { key: "featured_skills", label: "Skills" },
  { key: "featured_projects", label: "Projects" },
  { key: "featured_achievements", label: "Achievements & awards" },
  { key: "featured_certifications", label: "Certifications" },
  { key: "featured_documents", label: "Document library" },
];

const TEXT_FIELDS = ["site_title", "site_description", "contact_intro"] as const;
const BOOL_FIELDS: (keyof SiteSettings)[] = [
  ...FEATURED_SECTIONS.map((section) => section.key),
  "contact_enabled",
  "contact_show_phone",
  "contact_show_email",
];

function coerceSettings(row: Row | undefined): SiteSettings {
  const out: SiteSettings = { ...DEFAULT_SETTINGS };
  if (!row) return out;

  // Indexing a mixed-type object by a union key needs a widened view.
  const target = out as unknown as Record<string, string | boolean>;
  const defaults = DEFAULT_SETTINGS as unknown as Record<string, string | boolean>;

  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof SiteSettings)[]) {
    const value = row[key];
    if (value === undefined || value === null) continue;
    target[key] = typeof defaults[key] === "boolean" ? value === true : String(value);
  }
  return out;
}

/** Live settings for the admin dashboard (runs as the table owner). */
export async function readSettings(): Promise<SiteSettings> {
  const row = await get<Row>(`SELECT * FROM site_settings WHERE "id" = 1`);
  return coerceSettings(row);
}

/** Settings as the public site reads them — through the `portfolio_public` role. */
export async function getPublicSettings(): Promise<SiteSettings> {
  return withPublicRole(async () => {
    const row = await get<Row>(`SELECT * FROM site_settings WHERE "id" = 1`);
    return coerceSettings(row);
  });
}

export type SaveResult = { ok: true } | { ok: false; errors: Record<string, string> };

/** Validates and persists the settings form. */
export async function saveSettings(values: Record<string, string>): Promise<SaveResult> {
  const errors: Record<string, string> = {};

  const siteTitle = (values.site_title ?? "").trim();
  if (siteTitle.length > 120) errors.site_title = "Keep the site title under 120 characters.";

  const siteDescription = (values.site_description ?? "").trim();
  if (siteDescription.length > 320) {
    errors.site_description =
      "Keep the description under 320 characters so search results do not truncate it.";
  }

  const contactIntro = (values.contact_intro ?? "").trim();
  if (contactIntro.length > 2000) {
    errors.contact_intro = "This field is too long (2 000 characters max).";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const allFields = [...TEXT_FIELDS, ...BOOL_FIELDS.map(String)];
  const valuesList: (string | boolean)[] = [
    siteTitle,
    siteDescription,
    contactIntro,
    ...BOOL_FIELDS.map((field) => values[field] === "1" || values[field] === "true"),
  ];

  // The same $1..$n feed both the INSERT and the ON CONFLICT update.
  const insertValues = valuesList.map((_, index) => `$${index + 1}`).join(", ");
  const updateSets = allFields
    .map((field, index) => `"${field}" = $${index + 1}`)
    .concat([`"updated_at" = now()`])
    .join(", ");

  await run(
    `INSERT INTO site_settings ("id", ${allFields.map((field) => `"${field}"`).join(", ")})
     VALUES (1, ${insertValues})
     ON CONFLICT ("id") DO UPDATE SET ${updateSets}`,
    valuesList,
  );

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Social links                                                        */
/* ------------------------------------------------------------------ */

export type SocialLink = {
  platform: string;
  label: string;
  url: string;
  published: boolean;
};

type LinkRow = Pick<Row, "platform" | "url" | "label" | "published">;

function toLink(row: LinkRow): SocialLink {
  return {
    platform: String(row.platform ?? ""),
    url: String(row.url ?? ""),
    label: String(row.label ?? ""),
    published: row.published === true,
  };
}

/**
 * Every known platform paired with its stored URL — blank ones included, so the
 * settings form renders a complete, predictable list of inputs.
 */
export async function readSocialLinks(): Promise<SocialLink[]> {
  const rows = await all<LinkRow>(
    `SELECT "platform", "url", "label", "published" FROM social_links ORDER BY "sort_order"`,
  );
  const byKey = new Map(rows.map((row) => [String(row.platform), toLink(row)]));

  return SOCIAL_PLATFORMS.map((platform) => {
    const stored = byKey.get(platform.key);
    return {
      platform: platform.key,
      label: platform.label,
      url: stored?.url ?? "",
      published: stored ? stored.published : true,
    };
  });
}

/** Links the public site renders: published and non-empty, in display order. */
export async function getPublishedSocialLinks(): Promise<SocialLink[]> {
  const rows = await withPublicRole(() =>
    all<LinkRow>(
      `SELECT "platform", "url", "label", "published"
         FROM social_links
        WHERE "published" = true AND "url" <> ''
        ORDER BY "sort_order"`,
    ),
  );
  return rows.map(toLink);
}

export type SaveLinksResult = { ok: true } | { ok: false; errors: Record<string, string> };

/**
 * Saves the link list. A blank URL removes the row; a filled one is stored.
 * Only known platforms are accepted, and every URL must be http(s) — except
 * the email platform, which stores a `mailto:`.
 */
export async function saveSocialLinks(
  entries: { platform: string; url: string }[],
): Promise<SaveLinksResult> {
  const errors: Record<string, string> = {};
  const known = new Set(SOCIAL_PLATFORMS.map((platform) => platform.key));
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const cleaned: { platform: string; label: string; url: string }[] = [];

  for (const entry of entries) {
    if (!known.has(entry.platform)) continue;
    const url = (entry.url ?? "").trim();
    if (!url) continue;

    const meta = SOCIAL_PLATFORMS.find((platform) => platform.key === entry.platform)!;

    if (entry.platform === "email") {
      const bare = url.startsWith("mailto:") ? url.slice(7) : url;
      if (!EMAIL.test(bare)) {
        errors[entry.platform] = "Enter a valid email address.";
        continue;
      }
      cleaned.push({ platform: entry.platform, label: meta.label, url: `mailto:${bare}` });
      continue;
    }

    if (!isSafeExternalUrl(url)) {
      errors[entry.platform] = "Use a full http(s) URL.";
      continue;
    }
    cleaned.push({ platform: entry.platform, label: meta.label, url });
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  await withTransaction(async () => {
    await run(`DELETE FROM social_links`);
    let order = 1;
    for (const entry of cleaned) {
      await run(
        `INSERT INTO social_links ("platform", "url", "label", "sort_order", "published")
         VALUES ($1, $2, $3, $4, true)`,
        [entry.platform, entry.url, entry.label, order],
      );
      order += 1;
    }
  });

  return { ok: true };
}
