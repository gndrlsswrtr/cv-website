import type { Metadata } from "next";

/**
 * Used when neither Settings nor the `SITE_DESCRIPTION` variable has a value —
 * i.e. a freshly created site. Kept factual: it names the owner and lists what
 * the site contains, and never claims qualifications, institutions or awards
 * that have not actually been entered.
 */
export const DEFAULT_DESCRIPTION =
  "Denrica Samson — computer engineering student. CV with work experience, education, skills, projects, certifications and a downloadable résumé.";

/** Per-page `<title>` + description used by the async `generateMetadata` exports. */
export function pageMeta(title: string, description: string): Metadata {
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
  };
}
