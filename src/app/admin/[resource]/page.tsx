import type { Metadata } from "next";
import Link from "next/link";

import { deleteResource, moveItem, togglePublish } from "@/app/admin/actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { adminList } from "@/lib/content";
import { formatBytes, formatDate, formatDateRange } from "@/lib/format";
import { getResource, isResourceKey, type ResourceDef } from "@/lib/resources";
import type { Row } from "@/lib/crud";

export const instant = false;

/** Fields worth showing as the one-line summary under a row title. */
const SUBTITLE_FIELDS = [
  "company",
  "institution",
  "issuer",
  "degree",
  "field_of_study",
  "category",
  "tech",
  "credential_id",
];

function subtitleFor(def: ResourceDef, row: Row): string {
  const parts: string[] = [];
  for (const field of SUBTITLE_FIELDS) {
    const value = row[field];
    if (typeof value === "string" && value.trim()) parts.push(value.trim());
  }

  if (def.key === "experience") {
    const range = formatDateRange(
      String(row.start_date ?? ""),
      row.is_current === true ? "" : String(row.end_date ?? ""),
      "Present",
    );
    if (range) parts.push(range);
  } else if (def.key === "documents") {
    const size = Number(row.size ?? 0);
    if (size > 0) parts.push(formatBytes(size));
  } else {
    const date = String(row.date ?? row.issue_date ?? row.end_date ?? "");
    const formatted = formatDate(date);
    if (formatted) parts.push(formatted);
  }

  return parts.join(" · ");
}

type Props = {
  params: Promise<{ resource: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { resource } = await params;
  const def = isResourceKey(resource) ? getResource(resource) : undefined;
  return {
    title: def ? `${def.label} — admin` : "Not found",
    robots: { index: false, follow: false },
  };
}

export default async function ResourceListPage({ params, searchParams }: Props) {
  const { resource } = await params;
  const sp = await searchParams;

  if (!isResourceKey(resource)) {
    return (
      <div className="card px-6 py-10 text-center">
        <p className="text-sm font-medium">Unknown content type.</p>
        <Link href="/admin" className="btn btn-secondary mt-4">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const def = getResource(resource)!;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const rows = await adminList(resource, q ? { q } : {});
  const flash = typeof sp.saved === "string" ? "saved" : typeof sp.deleted === "string" ? "deleted" : null;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">Manage</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{def.label}</h1>
          <p className="mt-2 text-sm text-muted">
            {def.description}{" "}
            {def.publicPath ? (
              <Link href={def.publicPath} target="_blank" className="font-medium text-accent">
                View page ↗
              </Link>
            ) : null}
          </p>
        </div>
        <Link href={`/admin/${def.key}/new`} className="btn btn-primary">
          Add {def.singular}
        </Link>
      </header>

      {flash === "saved" ? (
        <p
          role="status"
          className="rounded-md border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-600"
        >
          Saved. The public site refreshes within about a minute.
        </p>
      ) : null}
      {flash === "deleted" ? (
        <p
          role="status"
          className="rounded-md border border-border bg-surface px-4 py-3 text-sm text-muted"
        >
          Entry deleted.
        </p>
      ) : null}

      <form method="get" action={`/admin/${def.key}`} className="flex flex-wrap gap-3">
        <label htmlFor="q" className="sr-only">
          Search {def.label.toLowerCase()}
        </label>
        <input
          type="search"
          name="q"
          id="q"
          defaultValue={q}
          placeholder={`Search ${def.label.toLowerCase()}…`}
          className="control max-w-xs flex-1"
        />
        <button type="submit" className="btn btn-secondary">
          Search
        </button>
        {q ? (
          <Link href={`/admin/${def.key}`} className="btn btn-ghost">
            Clear
          </Link>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <div className="card px-6 py-12 text-center">
          <p className="text-sm font-medium">
            {q ? `Nothing matches “${q}”.` : `No ${def.label.toLowerCase()} yet.`}
          </p>
          <p className="mt-2 text-sm text-muted">
            {q
              ? "Try a different search term."
              : `Add your first ${def.singular} to get started.`}
          </p>
          {!q ? (
            <Link href={`/admin/${def.key}/new`} className="btn btn-primary mt-5">
              Add {def.singular}
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="card divide-y divide-border">
          {rows.map((row, index) => {
            const id = String(row.id);
            const published = row.published === true;
            const title = String(row[def.titleField] ?? "(untitled)");

            return (
              <li key={id} className="flex flex-wrap items-start gap-x-4 gap-y-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{title}</p>
                    <span className={published ? "badge badge-live" : "badge badge-draft"}>
                      {published ? "Published" : "Draft"}
                    </span>
                  </div>
                  {subtitleFor(def, row) ? (
                    <p className="mt-1 truncate text-xs text-muted">{subtitleFor(def, row)}</p>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <form action={moveItem}>
                    <input type="hidden" name="__resource" value={def.key} />
                    <input type="hidden" name="__id" value={id} />
                    <input type="hidden" name="__dir" value="up" />
                    <input type="hidden" name="next" value={q ? `/admin/${def.key}?q=${encodeURIComponent(q)}` : `/admin/${def.key}`} />
                    <button
                      type="submit"
                      className="btn btn-ghost px-2"
                      disabled={index === 0}
                      aria-label={`Move “${title}” up`}
                      title="Move up"
                    >
                      ↑
                    </button>
                  </form>
                  <form action={moveItem}>
                    <input type="hidden" name="__resource" value={def.key} />
                    <input type="hidden" name="__id" value={id} />
                    <input type="hidden" name="__dir" value="down" />
                    <input type="hidden" name="next" value={q ? `/admin/${def.key}?q=${encodeURIComponent(q)}` : `/admin/${def.key}`} />
                    <button
                      type="submit"
                      className="btn btn-ghost px-2"
                      disabled={index === rows.length - 1}
                      aria-label={`Move “${title}” down`}
                      title="Move down"
                    >
                      ↓
                    </button>
                  </form>

                  <Link href={`/admin/${def.key}/${id}`} className="btn btn-secondary">
                    Edit
                  </Link>

                  <form action={togglePublish}>
                    <input type="hidden" name="__resource" value={def.key} />
                    <input type="hidden" name="__id" value={id} />
                    <input type="hidden" name="next" value={q ? `/admin/${def.key}?q=${encodeURIComponent(q)}` : `/admin/${def.key}`} />
                    <button type="submit" className="btn btn-ghost">
                      {published ? "Unpublish" : "Publish"}
                    </button>
                  </form>

                  <form action={deleteResource}>
                    <input type="hidden" name="__resource" value={def.key} />
                    <input type="hidden" name="__id" value={id} />
                    <input type="hidden" name="next" value={q ? `/admin/${def.key}?q=${encodeURIComponent(q)}` : `/admin/${def.key}`} />
                    <ConfirmSubmit message={`Delete “${title}”? This cannot be undone.`}>
                      Delete
                    </ConfirmSubmit>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-muted">
        Use ↑ and ↓ to change the order visitors see. Deleting an entry also removes its uploaded
        file — there is no undo.
      </p>
    </div>
  );
}
