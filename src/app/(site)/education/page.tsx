import type { Metadata } from "next";

import { EducationList } from "@/components/site/lists";
import { PageHeader } from "@/components/site/ui";
import { getPublished } from "@/lib/content";
import { pageMeta } from "@/lib/seo";
import { connection } from "next/server";

export async function generateMetadata(): Promise<Metadata> {
  return pageMeta("Education", "Degrees, qualifications and academic background.");
}

export default async function EducationPage() {

  // Deferred to request time: the build container cannot resolve the
  // database's private hostname, so this read must not run while
  // `next build` prerenders the route.
  await connection();
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
