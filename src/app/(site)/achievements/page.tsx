'use cache'

import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";

import { AchievementList } from "@/components/site/lists";
import { PageHeader } from "@/components/site/ui";
import { CONTENT_TAG, getPublished } from "@/lib/content";
import { pageMeta } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  return pageMeta(
    "Achievements",
    "Awards, publications, talks and other published achievements.",
  );
}

export default async function AchievementsPage() {
  cacheTag(CONTENT_TAG);
  cacheLife("minutes");
  const rows = await getPublished("achievements");

  return (
    <>
      <PageHeader
        eyebrow="Published record"
        title="Achievements"
        description="Awards, publications, talks and other highlights worth keeping on the record."
      />
      <AchievementList rows={rows} />
    </>
  );
}
