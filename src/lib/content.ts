import { cacheLife, cacheTag } from "next/cache";

import {
  countRows,
  findRow,
  listRows,
  readProfile,
  type ProfileRow,
  type Row,
} from "@/lib/crud";
import type { ResourceKey } from "@/lib/resources";

/**
 * Data access split by trust level.
 *
 * Public reads are wrapped in `use cache` and tagged `content`, so every admin
 * mutation can invalidate the whole public site with one `updateTag("content")`.
 * `cacheLife("minutes")` is a safety net: even if a tag is missed, content
 * refreshes within a minute on its own.
 *
 * Admin reads are deliberately uncached — the dashboard must show live state.
 */

export const CONTENT_TAG = "content";

/* ------------------------------------------------------------------ */
/* Public (published only)                                             */
/* ------------------------------------------------------------------ */

export async function getPublished(key: ResourceKey): Promise<Row[]> {
  "use cache";
  cacheTag(CONTENT_TAG);
  cacheLife("minutes");
  return listRows(key, { publishedOnly: true });
}

export async function getPublishedProject(slug: string): Promise<Row | null> {
  "use cache";
  cacheTag(CONTENT_TAG);
  cacheLife("minutes");
  const rows = listRows("projects", { publishedOnly: true }).filter(
    (row) => row.slug === slug,
  );
  return rows[0] ?? null;
}

/** Published documents only — the avatar copy is never listed. */
export async function getPublishedDocuments(): Promise<Row[]> {
  "use cache";
  cacheTag(CONTENT_TAG);
  cacheLife("minutes");
  return listRows("documents", { publishedOnly: true }).filter(
    (row) => row.category !== "Avatar",
  );
}

export async function getProfile(): Promise<ProfileRow> {
  "use cache";
  cacheTag(CONTENT_TAG);
  cacheLife("minutes");
  return readProfile();
}

export async function getPublicCounts(): Promise<Record<string, number>> {
  "use cache";
  cacheTag(CONTENT_TAG);
  cacheLife("minutes");
  return {
    experience: countRows("experience", true),
    education: countRows("education", true),
    skills: countRows("skills", true),
    projects: countRows("projects", true),
    achievements: countRows("achievements", true),
    certifications: countRows("certifications", true),
    documents: countRows("documents", true),
  };
}

/* ------------------------------------------------------------------ */
/* Admin (live)                                                        */
/* ------------------------------------------------------------------ */

export function adminList(
  key: ResourceKey,
  options: { q?: string; publishedOnly?: boolean } = {},
): Row[] {
  return listRows(key, options);
}

export function adminFind(key: ResourceKey, id: string): Row | undefined {
  return findRow(key, id);
}

export function adminProfile(): ProfileRow {
  return readProfile();
}

export function adminStats() {
  const keys: ResourceKey[] = [
    "experience",
    "education",
    "skills",
    "projects",
    "achievements",
    "certifications",
    "documents",
  ];
  const stats = {} as Record<string, { total: number; published: number }>;
  for (const key of keys) {
    stats[key] = { total: countRows(key), published: countRows(key, true) };
  }
  return stats;
}
