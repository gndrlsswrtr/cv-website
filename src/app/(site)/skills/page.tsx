'use cache'

import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";

import { SkillGrid } from "@/components/site/lists";
import { PageHeader } from "@/components/site/ui";
import { CONTENT_TAG, getPublished } from "@/lib/content";
import { pageMeta } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  return pageMeta(
    "Skills",
    "Languages, frameworks, tools and technologies, grouped by category.",
  );
}

export default async function SkillsPage() {
  cacheTag(CONTENT_TAG);
  cacheLife("minutes");
  const rows = await getPublished("skills");

  return (
    <>
      <PageHeader
        eyebrow="Curriculum vitae"
        title="Skills"
        description="A grouped view of the languages, frameworks and tools I use day to day."
      />
      <SkillGrid rows={rows} />
    </>
  );
}
