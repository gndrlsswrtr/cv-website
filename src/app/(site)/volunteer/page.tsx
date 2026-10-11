'use cache'

import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";

import { VolunteerList } from "@/components/site/VolunteerList";
import { PageHeader } from "@/components/site/ui";
import { CONTENT_TAG, getPublished } from "@/lib/content";
import { pageMeta } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  return pageMeta(
    "Volunteering & leadership",
    "Community work, mentoring and leadership roles beyond paid employment.",
  );
}

export default async function VolunteerPage() {
  cacheTag(CONTENT_TAG);
  cacheLife("minutes");
  const rows = await getPublished("volunteer");

  return (
    <>
      <PageHeader
        eyebrow="Beyond work"
        title="Volunteering & leadership"
        description="Community work, mentoring and leadership roles I have taken on alongside my career."
      />
      <VolunteerList rows={rows} />
    </>
  );
}
