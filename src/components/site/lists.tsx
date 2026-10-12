import Image from "next/image";
import Link from "next/link";

import type { Row } from "@/lib/crud";
import {
  LEVEL_LABELS,
  formatBytes,
  formatDate,
  formatDateRange,
  levelOf,
} from "@/lib/format";
import { Description, EmptyState, ExternalLink, Pill } from "./ui";

/* ------------------------------------------------------------------ */
/* Row helpers                                                         */
/* ------------------------------------------------------------------ */

function str(row: Row, key: string): string {
  const value = row[key];
  return value === null || value === undefined ? "" : String(value);
}

function dateRange(row: Row, currentLabel = "Present"): string {
  const current = row.is_current === true || row.is_current === 1;
  const end = current ? "" : str(row, "end_date");
  return formatDateRange(str(row, "start_date"), end, currentLabel);
}

/**
 * A file attached to a certification or achievement: an image preview plus a
 * link that also covers PDFs.
 *
 * The URL names the table the entry lives in, which `/media/[resource]`
 * allow-lists. The file is unreachable while the entry is unpublished — the
 * route reads through the `portfolio_public` role, so Row Level Security is
 * what enforces that, not an application-level check.
 */
function Attachment({
  row,
  resource,
  alt,
}: {
  row: Row;
  resource: "certifications" | "achievements";
  alt: string;
}) {
  const id = str(row, "id");
  if (!id || !str(row, "stored_name")) return null;

  const href = `/media/${resource}/${id}`;
  const isImage = str(row, "mime").startsWith("image/");
  const label = str(row, "original_name") || "Attachment";
  const size = Number(row.size ?? 0);

  return (
    <figure className="mt-3">
      {isImage ? (
        // The caption below carries the real link; this preview is decorative
        // and skipped by keyboard and screen readers, so the same file is not
        // announced twice.
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={-1}
          aria-hidden
          className="relative block aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-surface"
        >
          <Image
            src={href}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, 560px"
            className="object-contain"
          />
        </a>
      ) : null}
      <figcaption className="mt-2 text-xs text-muted">
        <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
          {isImage ? "View image" : "Open document"} — {label}
          {size > 0 ? ` (${formatBytes(size)})` : ""}
        </a>
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Experience                                                          */
/* ------------------------------------------------------------------ */

export function ExperienceList({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return <EmptyState title="No experience published yet." />;
  }

  return (
    <div className="grid gap-4">
      {rows.map((row) => (
        <article key={String(row.id)} className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h3 className="text-base font-semibold tracking-tight">{str(row, "title")}</h3>
            <span className="eyebrow whitespace-nowrap">{dateRange(row)}</span>
          </div>
          <p className="mt-1 text-sm text-accent">
            {str(row, "company")}
            {str(row, "location") ? (
              <span className="text-muted"> · {str(row, "location")}</span>
            ) : null}
          </p>
          {str(row, "description") ? (
            <div className="mt-3 border-t border-border pt-3">
              <Description text={str(row, "description")} />
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Education                                                           */
/* ------------------------------------------------------------------ */

export function EducationList({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return <EmptyState title="No education published yet." />;
  }

  return (
    <div className="grid gap-4">
      {rows.map((row) => (
        <article key={String(row.id)} className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h3 className="text-base font-semibold tracking-tight">{str(row, "institution")}</h3>
            <span className="eyebrow whitespace-nowrap">{dateRange(row, "")}</span>
          </div>
          <p className="mt-1 text-sm text-muted">
            {[str(row, "degree"), str(row, "field_of_study")].filter(Boolean).join(" · ")}
            {str(row, "location") ? ` · ${str(row, "location")}` : ""}
          </p>
          {str(row, "description") ? (
            <div className="mt-3 border-t border-border pt-3">
              <Description text={str(row, "description")} />
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Skills                                                              */
/* ------------------------------------------------------------------ */

export function SkillGrid({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return <EmptyState title="No skills published yet." />;
  }

  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const category = str(row, "category") || "Skills";
    const list = groups.get(category);
    if (list) list.push(row);
    else groups.set(category, [row]);
  }

  return (
    <div className="grid gap-7 sm:grid-cols-2">
      {[...groups.entries()].map(([category, items]) => (
        <div key={category}>
          <p className="eyebrow mb-3">{category}</p>
          <ul className="grid gap-2">
            {items.map((row) => {
              const level = levelOf(row.level);
              return (
                <li
                  key={String(row.id)}
                  className="card flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{str(row, "name")}</p>
                    {str(row, "description") ? (
                      <p className="truncate text-xs text-muted">{str(row, "description")}</p>
                    ) : null}
                  </div>
                  <div
                    className="flex shrink-0 items-center gap-1.5"
                    title={LEVEL_LABELS[level]}
                    aria-label={`${LEVEL_LABELS[level]} (level ${level} of 5)`}
                  >
                    {[1, 2, 3, 4, 5].map((step) => (
                      <span
                        key={step}
                        className={`h-1.5 w-1.5 rounded-full ${
                          step <= level ? "bg-accent" : "bg-border"
                        }`}
                      />
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Projects                                                            */
/* ------------------------------------------------------------------ */

export function ProjectGrid({ rows, linked = true }: { rows: Row[]; linked?: boolean }) {
  if (rows.length === 0) {
    return <EmptyState title="No projects published yet." />;
  }

  const techOf = (row: Row) =>
    str(row, "tech")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {rows.map((row) => {
        const slug = str(row, "slug");
        const body = (
          <>
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-base font-semibold tracking-tight">{str(row, "title")}</h3>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted">{str(row, "summary")}</p>
            {techOf(row).length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {techOf(row).map((tech) => (
                  <Pill key={tech}>{tech}</Pill>
                ))}
              </div>
            ) : null}
          </>
        );

        return (
          <article key={String(row.id)} className="card flex flex-col p-5 transition-colors hover:border-accent/50">
            {linked && slug ? (
              <Link href={`/projects/${slug}`} className="block">
                {body}
              </Link>
            ) : (
              body
            )}
            {(str(row, "repo_url") || str(row, "demo_url")) && (
              <div className="mt-4 flex flex-wrap gap-4 border-t border-border pt-3 text-sm">
                {str(row, "repo_url") ? (
                  <ExternalLink href={str(row, "repo_url")}>Source</ExternalLink>
                ) : null}
                {str(row, "demo_url") ? (
                  <ExternalLink href={str(row, "demo_url")}>Live demo</ExternalLink>
                ) : null}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Achievements                                                        */
/* ------------------------------------------------------------------ */

export function AchievementList({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return <EmptyState title="No achievements published yet." />;
  }

  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <article key={String(row.id)} className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Pill>{str(row, "category") || "Achievement"}</Pill>
              {str(row, "date") ? (
                <span className="eyebrow">{formatDate(str(row, "date"))}</span>
              ) : null}
            </div>
            <h3 className="mt-2 text-base font-semibold tracking-tight">{str(row, "title")}</h3>
            {str(row, "issuer") ? (
              <p className="mt-0.5 text-sm text-muted">{str(row, "issuer")}</p>
            ) : null}
            {str(row, "description") ? (
              <div className="mt-3">
                <Description text={str(row, "description")} />
              </div>
            ) : null}
            <Attachment row={row} resource="achievements" alt={str(row, "title")} />
          </div>
          {str(row, "url") ? (
            <div className="shrink-0 text-sm">
              <ExternalLink href={str(row, "url")}>Reference</ExternalLink>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Certifications                                                      */
/* ------------------------------------------------------------------ */

export function CertificationList({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return <EmptyState title="No certifications published yet." />;
  }

  return (
    <div className="grid gap-3">
      {rows.map((row) => {
        const issue = formatDate(str(row, "issue_date"), true);
        const expiry = formatDate(str(row, "expiry_date"), true);
        const period = [issue, expiry ? `expires ${expiry}` : null].filter(Boolean).join(" · ");

        return (
          <article key={String(row.id)} className="card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h3 className="text-base font-semibold tracking-tight">{str(row, "name")}</h3>
              {period ? <span className="eyebrow whitespace-nowrap">{period}</span> : null}
            </div>
            {str(row, "issuer") ? <p className="mt-1 text-sm text-accent">{str(row, "issuer")}</p> : null}
            {str(row, "credential_id") ? (
              <p className="mt-2 font-mono text-xs text-muted">
                Credential ID: {str(row, "credential_id")}
              </p>
            ) : null}
            {str(row, "description") ? (
              <div className="mt-3 border-t border-border pt-3">
                <Description text={str(row, "description")} />
              </div>
            ) : null}
            <Attachment row={row} resource="certifications" alt={`${str(row, "name")} certificate`} />
            {(str(row, "credential_url") || str(row, "verify_url")) && (
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                {str(row, "credential_url") ? (
                  <ExternalLink href={str(row, "credential_url")}>Credential</ExternalLink>
                ) : null}
                {str(row, "verify_url") ? (
                  <ExternalLink href={str(row, "verify_url")}>Verify</ExternalLink>
                ) : null}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

export function DocumentList({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No documents published yet."
        hint="Published files — CV, certificates, papers — appear here."
      />
    );
  }

  return (
    <div className="grid gap-3">
      {rows.map((row) => {
        const id = String(row.id);
        return (
          <article
            key={id}
            className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Pill>{str(row, "category") || "Document"}</Pill>
                <span className="eyebrow">{formatBytes(Number(row.size ?? 0))}</span>
              </div>
              <h3 className="mt-2 text-base font-semibold tracking-tight">{str(row, "title")}</h3>
              {str(row, "description") ? (
                <p className="mt-1 text-sm text-muted">{str(row, "description")}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-2">
              <a className="btn btn-secondary" href={`/documents/${id}`}>
                View
              </a>
              <a className="btn btn-primary" href={`/documents/${id}?download=1`}>
                Download
              </a>
            </div>
          </article>
        );
      })}
    </div>
  );
}
