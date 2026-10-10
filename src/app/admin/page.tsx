import type { Metadata } from "next";
import Link from "next/link";

import { loadSampleContent } from "./actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { adminProfile, adminStats } from "@/lib/content";
import { CONTENT_ORDER, RESOURCES } from "@/lib/resources";

/**
 * The dashboard is deliberately uncached: it reads live counts so the owner
 * always sees the true state of the site.
 */
export const instant = false;

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default async function AdminDashboardPage({
  searchParams,
}: PageProps<"/admin">) {
  const params = await searchParams;
  const sample = typeof params.sample === "string" ? params.sample : null;

  const stats = adminStats();
  const profile = adminProfile();

  const totalEntries = CONTENT_ORDER.reduce((sum, key) => sum + stats[key].total, 0);
  const isEmpty = totalEntries === 0;

  return (
    <div className="grid gap-8">
      <header>
        <p className="eyebrow mb-2">Admin</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Dashboard</h1>
        <p className="mt-2 text-sm text-muted">
          {profile.full_name
            ? `Signed in as ${profile.full_name}. Changes show on the public site within about a minute.`
            : "Changes show on the public site within about a minute."}
        </p>
      </header>

      {sample === "added" ? (
        <p
          role="status"
          className="rounded-md border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-600"
        >
          Sample content added. Edit or delete it, then add your own.
        </p>
      ) : null}
      {sample === "skipped" ? (
        <p className="rounded-md border border-border bg-surface px-4 py-3 text-sm text-muted">
          Every section already has content, so nothing was added.
        </p>
      ) : null}

      {/* Overview ---------------------------------------------------- */}
      <section aria-labelledby="overview-heading">
        <h2 id="overview-heading" className="mb-4 text-lg font-semibold">
          Content overview
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {CONTENT_ORDER.map((key) => {
            const def = RESOURCES[key];
            const stat = stats[key];
            return (
              <Link
                key={key}
                href={`/admin/${key}`}
                className="card px-4 py-4 transition-colors hover:border-accent"
              >
                <p className="text-2xl font-semibold tabular-nums">{stat.total}</p>
                <p className="mt-0.5 text-sm font-medium">{def.label}</p>
                <p className="mt-1 text-xs text-muted">
                  {stat.published} published · {stat.total - stat.published} draft
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Quick actions ----------------------------------------------- */}
      <section aria-labelledby="actions-heading">
        <h2 id="actions-heading" className="mb-4 text-lg font-semibold">
          Quick actions
        </h2>
        <div className="card divide-y divide-border">
          {CONTENT_ORDER.map((key) => {
            const def = RESOURCES[key];
            return (
              <div
                key={key}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
              >
                <div>
                  <p className="text-sm font-medium">{def.label}</p>
                  <p className="text-xs text-muted">{def.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/admin/${key}`} className="btn btn-secondary">
                    Manage
                  </Link>
                  <Link href={`/admin/${key}/new`} className="btn btn-primary">
                    Add {def.singular}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* First-run help ---------------------------------------------- */}
      {isEmpty ? (
        <section className="card px-6 py-8">
          <h2 className="text-lg font-semibold">Your portfolio is empty</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Add your first entry above, or load realistic sample content you can edit and replace.
            Everything starts private until you publish it — except documents, which stay drafts
            until you say otherwise.
          </p>
          <form action={loadSampleContent} className="mt-5">
            <input type="hidden" name="__confirm" value="yes" />
            <ConfirmSubmit message="Add sample content to every empty section?">
              Load sample content
            </ConfirmSubmit>
          </form>
        </section>
      ) : null}
    </div>
  );
}
