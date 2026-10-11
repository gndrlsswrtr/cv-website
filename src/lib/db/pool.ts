import type { Pool } from "pg";

/**
 * Connection management for the portfolio database.
 *
 * Split out from `index.ts` so both the query helpers and the migration
 * runner can share one pool without an import cycle.
 */

let pool: Pool | null = null;
let poolKey = "";
let missingReason: string | null = null;
let normalisedTypes = false;

/**
 * `"2026-10-11 19:00:00.123+00"` → `"2026-10-11T19:00:00.123+00:00"` → ISO.
 * Postgres emits a space separator and a colon-less offset, neither of which
 * `Date` parses reliably across engines, so both are fixed up first.
 */
function toIso(value: string): string {
  const candidate = value
    .trim()
    .replace(" ", "T")
    .replace(/([+-]\d{2})$/, "$1:00");
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function resolveUrl(): string | null {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    missingReason = "DATABASE_URL is not set.";
    return null;
  }
  if (!/^(postgres|postgresql):\/\//i.test(raw)) {
    missingReason = "DATABASE_URL must start with postgresql://.";
    return null;
  }
  missingReason = null;
  return raw;
}

/** True when a database has been configured. Public pages degrade gracefully otherwise. */
export function isDbConfigured(): boolean {
  return resolveUrl() !== null;
}

/** Why the database is unavailable — `null` when it is configured. */
export function dbStatus(): string | null {
  resolveUrl();
  return missingReason;
}

export async function getPool(): Promise<Pool | null> {
  const url = resolveUrl();
  if (!url) return null;

  // Recreate when the URL changes (tests point the app at an ephemeral cluster).
  if (pool && poolKey === url) return pool;
  if (pool) {
    await pool.end().catch(() => undefined);
    pool = null;
  }

  const { Pool: PgPool, types } = await import("pg");

  /**
   * Normalise driver types so rows look exactly like the ones the rest of the
   * app expects (and stay plain JSON for `'use cache'`):
   *
   * - `timestamptz` / `timestamp` → ISO-8601 string, not a `Date` object.
   * - `bigint` → `number`. Every bigint we store is a byte size or a count,
   *   nowhere near Number.MAX_SAFE_INTEGER.
   */
  if (!normalisedTypes) {
    types.setTypeParser(1184, (value: string) => toIso(value));
    types.setTypeParser(1114, (value: string) => toIso(value));
    types.setTypeParser(20, (value: string) => Number(value));
    normalisedTypes = true;
  }

  const wantsSsl = process.env.DATABASE_SSL === "true";
  const wantsNoSsl = process.env.DATABASE_SSL === "false";

  pool = new PgPool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...(wantsNoSsl
      ? { ssl: false }
      : wantsSsl
        ? { ssl: { rejectUnauthorized: false } }
        : {}),
  });
  pool.on("error", () => {
    // A dead idle backend must never take the process down.
  });
  poolKey = url;
  return pool;
}

/** Close the pool (tests, graceful shutdown). */
export async function closePool(): Promise<void> {
  const current = pool;
  pool = null;
  poolKey = "";
  if (current) await current.end().catch(() => undefined);
}

/** Force the next `getPool()` to rebuild — used when tests swap `DATABASE_URL`. */
export async function resetPool(): Promise<void> {
  await closePool();
}
