import type { Metadata } from "next";

import { CertificationList } from "@/components/site/lists";
import { PageHeader } from "@/components/site/ui";
import { getPublished } from "@/lib/content";
import { pageMeta } from "@/lib/seo";
import { connection } from "next/server";

export async function generateMetadata(): Promise<Metadata> {
  return pageMeta(
    "Certifications",
    "Professional certifications with issuers, credential IDs and verification links.",
  );
}

export default async function CertificationsPage() {

  // Deferred to request time: the build container cannot resolve the
  // database's private hostname, so this read must not run while
  // `next build` prerenders the route.
  await connection();
  const rows = await getPublished("certifications");

  return (
    <>
      <PageHeader
        eyebrow="Published record"
        title="Certifications"
        description="Professional certifications, with issuer, dates and links to verify them."
      />
      <CertificationList rows={rows} />
    </>
  );
}
