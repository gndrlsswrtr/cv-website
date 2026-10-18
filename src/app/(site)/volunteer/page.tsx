import type { Metadata } from "next";

import { VolunteerList } from "@/components/site/VolunteerList";
import { PageHeader } from "@/components/site/ui";
import { getPublished } from "@/lib/content";
import { pageMeta } from "@/lib/seo";
import { connection } from "next/server";

export async function generateMetadata(): Promise<Metadata> {
  return pageMeta(
    "Volunteering & leadership",
    "Community work, mentoring and leadership roles beyond paid employment.",
  );
}

export default async function VolunteerPage() {

  // Deferred to request time: the build container cannot resolve the
  // database's private hostname, so this read must not run while
  // `next build` prerenders the route.
  await connection();
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
