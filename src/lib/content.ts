import { cacheLife, cacheTag } from "next/cache";

import {
  countRows,
  findRow,
  listRows,
  readProfile,
  type ProfileRow,
  type Row,
} from "@/lib/crud";
import { withPublicRole } from "@/lib/db";
import type { ResourceKey } from "@/lib/resources";

/**
 * Data access split by trust level.
 *
 * **Public reads** run as the `portfolio_public` database role, so Row Level
 * Security hides unpublished rows at the source. They are also wrapped in
 * `use cache` and tagged `content`, so every admin mutation can invalidate the
 * whole public site with one `updateTag("content")`. `cacheLife("minutes")` is
 * a safety net: even if a tag is missed, content refreshes within a minute on
 * its own.
 *
 * **Admin reads** are deliberately uncached — the dashboard must show live
 * state — and run as the table owner, which RLS does not restrict.
 */

export const CONTENT_TAG = "content";

const RESOURCE_KEYS: ResourceKey[] = [
  "experience",
  "education",
  "skills",
  "projects",
  "achievements",
  "certifications",
  "documents",
];

/* ------------------------------------------------------------------ */
/* Public (published only, RLS-enforced)                               */
/* ------------------------------------------------------------------ */

export async function getPublished(key: ResourceKey): Promise<Row[]> {
  "use cache";
  cacheTag(CONTENT_TAG);
  cacheLife("minutes");
  return withPublicRole(() => listRows(key, { publishedOnly: true }));
}

export async function getPublishedProject(slug: string): Promise<Row | null> {
  "use cache";
  cacheTag(CONTENT_TAG);
  cacheLife("minutes");
  const rows = await withPublicRole(() => listRows("projects", { publishedOnly: true }));
  return rows.find((row) => row.slug === slug) ?? null;
}

/** Published documents only — the avatar copy is never listed. */
export async function getPublishedDocuments(): Promise<Row[]> {
  "use cache";
  cacheTag(CONTENT_TAG);
  cacheLife("minutes");
  const rows = await withPublicRole(() => listRows("documents", { publishedOnly: true }));
  return rows.filter((row) => row.category !== "Avatar");
}

export async function getProfile(): Promise<ProfileRow> {
  "use cache";
  cacheTag(CONTENT_TAG);
  cacheLife("minutes");
  return withPublicRole(() => readProfile());
}

export async function getPublicCounts(): Promise<Record<string, number>> {
  "use cache";
  cacheTag(CONTENT_TAG);
  cacheLife("minutes");
  return withPublicRole(async () => {
    const counts: Record<string, number> = {};
    for (const key of RESOURCE_KEYS) {
      counts[key] = await countRows(key, true);
    }
    return counts;
  });
}

/* ------------------------------------------------------------------ */
/* Admin (live, unrestricted)                                          */
/* ------------------------------------------------------------------ */

export async function adminList(
  key: ResourceKey,
  options: { q?: string; publishedOnly?: boolean } = {},
): Promise<Row[]> {
  return listRows(key, options);
}

export async function adminFind(key: ResourceKey, id: string): Promise<Row | undefined> {
  return findRow(key, id);
}

export async function adminProfile(): Promise<ProfileRow> {
  return readProfile();
}

export async function adminStats(): Promise<
  Record<string, { total: number; published: number }>
> {
  const stats = {} as Record<string, { total: number; published: number }>;
  for (const key of RESOURCE_KEYS) {
    stats[key] = { total: await countRows(key), published: await countRows(key, true) };
  }
  return stats;
}
