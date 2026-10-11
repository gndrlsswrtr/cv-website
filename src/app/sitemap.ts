import type { MetadataRoute } from "next";

import { getPublished } from "@/lib/content";

const STATIC_PATHS = [
  "/",
  "/about",
  "/experience",
  "/volunteer",
  "/education",
  "/skills",
  "/projects",
  "/achievements",
  "/certifications",
  "/documents",
  "/contact",
];

// Evaluated once at build time so the prerender does not see a live clock.
const TODAY = new Date().toISOString().slice(0, 10);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.SITE_URL || "http://localhost:3000";
  const today = TODAY;

  const entries: MetadataRoute.Sitemap = STATIC_PATHS.map((path, index) => ({
    url: `${base}${path}`,
    lastModified: today,
    changeFrequency: (index === 0 ? "weekly" : "monthly") as MetadataRoute.Sitemap[number]["changeFrequency"],
    priority: index === 0 ? 1 : 0.7,
  }));

  const projects = await getPublished("projects");
  for (const project of projects) {
    const slug = String(project.slug ?? "").trim();
    if (!slug) continue;
    entries.push({
      url: `${base}/projects/${slug}`,
      lastModified: today,
      changeFrequency: "monthly",
      priority: 0.6,
    });
  }

  return entries;
}
