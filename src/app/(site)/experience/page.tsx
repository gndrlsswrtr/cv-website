'use cache'

import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";

import { ExperienceList } from "@/components/site/lists";
import { PageHeader } from "@/components/site/ui";
import { CONTENT_TAG, getPublished } from "@/lib/content";
import { pageMeta } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  return pageMeta(
    "Experience",
    "Roles, responsibilities and employment history.",
  );
}

export default async function ExperiencePage() {
  cacheTag(CONTENT_TAG);
  cacheLife("minutes");
  const rows = await getPublished("experience");

  return (
    <>
      <PageHeader
        eyebrow="Curriculum vitae"
        title="Experience"
        description="Roles I have held, what I was responsible for, and where the work happened."
      />
      <ExperienceList rows={rows} />
    </>
  );
}
