import type { Row } from "@/lib/crud";
import { formatDateRange } from "@/lib/format";
import { Description, EmptyState, ExternalLink } from "./ui";

/**
 * Volunteer roles and leadership positions.
 *
 * Same card structure as `ExperienceList`, but the middle line reads
 * organisation · cause · location instead of company · location.
 */

function str(row: Row, key: string): string {
  const value = row[key];
  return value === null || value === undefined ? "" : String(value);
}

function dateRange(row: Row): string {
  const current = row.is_current === true || row.is_current === 1;
  const end = current ? "" : str(row, "end_date");
  return formatDateRange(str(row, "start_date"), end);
}

export function VolunteerList({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return <EmptyState title="No volunteering roles published yet." />;
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
            {str(row, "organisation")}
            {str(row, "cause") ? <span className="text-muted"> · {str(row, "cause")}</span> : null}
            {str(row, "location") ? (
              <span className="text-muted"> · {str(row, "location")}</span>
            ) : null}
          </p>
          {str(row, "description") ? (
            <div className="mt-3 border-t border-border pt-3">
              <Description text={str(row, "description")} />
            </div>
          ) : null}
          {str(row, "url") ? (
            <div className="mt-3 text-sm">
              <ExternalLink href={str(row, "url")}>Organisation</ExternalLink>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
