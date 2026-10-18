import type { Metadata } from "next";

import { SkillGrid } from "@/components/site/lists";
import { PageHeader } from "@/components/site/ui";
import { getPublished } from "@/lib/content";
import { pageMeta } from "@/lib/seo";
import { connection } from "next/server";

export async function generateMetadata(): Promise<Metadata> {
  return pageMeta(
    "Skills",
    "Languages, frameworks, tools and technologies, grouped by category.",
  );
}

export default async function SkillsPage() {

  // Deferred to request time: the build container cannot resolve the
  // database's private hostname, so this read must not run while
  // `next build` prerenders the route.
  await connection();
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
