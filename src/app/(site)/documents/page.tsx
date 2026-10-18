import type { Metadata } from "next";

import { DocumentList } from "@/components/site/lists";
import { PageHeader } from "@/components/site/ui";
import { getPublishedDocuments } from "@/lib/content";
import { pageMeta } from "@/lib/seo";
import { connection } from "next/server";

export async function generateMetadata(): Promise<Metadata> {
  return pageMeta(
    "Documents",
    "Published CV, certificates and other files — view or download without signing in.",
  );
}

export default async function DocumentsPage() {

  // Deferred to request time: the build container cannot resolve the
  // database's private hostname, so this read must not run while
  // `next build` prerenders the route.
  await connection();
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
