'use cache'

import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";

import { EducationList } from "@/components/site/lists";
import { PageHeader } from "@/components/site/ui";
import { CONTENT_TAG, getPublished } from "@/lib/content";
import { pageMeta } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  return pageMeta("Education", "Degrees, qualifications and academic background.");
}

export default async function EducationPage() {
  cacheTag(CONTENT_TAG);
  cacheLife("minutes");
  const rows = await getPublished("education");

  return (
    <>
      <PageHeader
        eyebrow="Curriculum vitae"
        title="Education"
        description="Degrees, courses and the academic foundation behind the work."
      />
      <EducationList rows={rows} />
    </>
  );
}
