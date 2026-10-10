'use cache'

import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";

import { DocumentList } from "@/components/site/lists";
import { PageHeader } from "@/components/site/ui";
import { CONTENT_TAG, getPublishedDocuments } from "@/lib/content";
import { pageMeta } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  return pageMeta(
    "Documents",
    "Published CV, certificates and other files — view or download without signing in.",
  );
}

export default async function DocumentsPage() {
  cacheTag(CONTENT_TAG);
  cacheLife("minutes");
  const rows = await getPublishedDocuments();

  return (
    <>
      <PageHeader
        eyebrow="Files"
        title="Documents"
        description="Everything published here is openly readable — no account required. Unpublished files never appear."
      />
      <DocumentList rows={rows} />
    </>
  );
}
