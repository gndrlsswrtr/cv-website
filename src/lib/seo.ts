import type { Metadata } from "next";

/** Per-page `<title>` + description used by the async `generateMetadata` exports. */
export function pageMeta(title: string, description: string): Metadata {
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
  };
}
