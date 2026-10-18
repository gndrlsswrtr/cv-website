import type { Metadata } from "next";

import { ProjectGrid } from "@/components/site/lists";
import { PageHeader } from "@/components/site/ui";
import { getPublished } from "@/lib/content";
import { pageMeta } from "@/lib/seo";
import { connection } from "next/server";

export async function generateMetadata(): Promise<Metadata> {
  return pageMeta(
    "Projects",
    "Selected projects with summaries, technologies, source code and live demos.",
  );
}

export default async function ProjectsPage() {

  // Deferred to request time: the build container cannot resolve the
  // database's private hostname, so this read must not run while
  // `next build` prerenders the route.
  await connection();
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
