import type { Metadata } from "next";

import { AchievementList } from "@/components/site/lists";
import { PageHeader } from "@/components/site/ui";
import { getPublished } from "@/lib/content";
import { pageMeta } from "@/lib/seo";
import { connection } from "next/server";

export async function generateMetadata(): Promise<Metadata> {
  return pageMeta(
    "Achievements",
    "Awards, publications, talks and other published achievements.",
  );
}

export default async function AchievementsPage() {

  // Deferred to request time: the build container cannot resolve the
  // database's private hostname, so this read must not run while
  // `next build` prerenders the route.
  await connection();
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
