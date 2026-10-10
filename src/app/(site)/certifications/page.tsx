'use cache'

import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";

import { CertificationList } from "@/components/site/lists";
import { PageHeader } from "@/components/site/ui";
import { CONTENT_TAG, getPublished } from "@/lib/content";
import { pageMeta } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  return pageMeta(
    "Certifications",
    "Professional certifications with issuers, credential IDs and verification links.",
  );
}

export default async function CertificationsPage() {
  cacheTag(CONTENT_TAG);
  cacheLife("minutes");
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
