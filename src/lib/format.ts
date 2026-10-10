/** Small presentation helpers shared by the public site and the admin. */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** `2024-03` or `2024-03-01` → `Mar 2024`. */
export function formatDate(value: string | null | undefined, long = false): string {
  if (!value) return "";
  const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(value.trim());
  if (!match) return value;
  const year = match[1];
  const month = match[2];
  if (!month) return year;
  const index = Number(month) - 1;
  if (index < 0 || index > 11) return value;
  const name = long ? MONTHS_LONG[index] : MONTHS[index];
  return `${name} ${year}`;
}

/**
 * `Mar 2021 — Present`
 * Uses an em dash when a date is missing so ranges still read cleanly.
 */
export function formatDateRange(
  start?: string | null,
  end?: string | null,
  currentLabel = "Present",
): string {
  const from = formatDate(start);
  const to = end ? formatDate(end) : currentLabel;
  if (!from && !to) return "";
  if (!from) return to;
  if (!to) return from;
  return `${from} — ${to}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

export const LEVEL_LABELS: Record<number, string> = {
  1: "Awareness",
  2: "Working knowledge",
  3: "Proficient",
  4: "Advanced",
  5: "Expert",
};

export function levelOf(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, Math.round(n)));
}

/** Turns a `description` textarea into paragraphs and bullet items. */
export function splitBlock(text: string | null | undefined): {
  paragraphs: string[];
  bullets: string[];
} {
  if (!text) return { paragraphs: [], bullets: [] };
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const bullets: string[] = [];
  const paragraphs: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    if (/^[-*•]\s+/.test(line)) {
      bullets.push(line.replace(/^[-*•]\s+/, ""));
    } else {
      paragraphs.push(line);
    }
  }
  return { paragraphs, bullets };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "•";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

/** Excerpt of plain text for meta descriptions. */
export function excerpt(text: string | null | undefined, max = 160): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}
