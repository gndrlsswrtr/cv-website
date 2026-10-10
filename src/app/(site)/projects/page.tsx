'use cache'

import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";

import { ProjectGrid } from "@/components/site/lists";
import { PageHeader } from "@/components/site/ui";
import { CONTENT_TAG, getPublished } from "@/lib/content";
import { pageMeta } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  return pageMeta(
    "Projects",
    "Selected projects with summaries, technologies, source code and live demos.",
  );
}

export default async function ProjectsPage() {
  cacheTag(CONTENT_TAG);
  cacheLife("minutes");
  const rows = await getPublished("projects");

  return (
    <>
      <PageHeader
        eyebrow="Selected work"
        title="Projects"
        description="A selection of things I have designed, built or contributed to."
      />
      <ProjectGrid rows={rows} />
    </>
  );
}
