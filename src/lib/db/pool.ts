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
let lastConnectError: string | null = null;
let varPresent = false;
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
  // Captured before trimming: Railway injects an *empty string* when a
  // `${{...}}` reference fails to resolve, which is a different fault from the
  // variable never having been set at all.
  varPresent = process.env.DATABASE_URL !== undefined;
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

/**
 * Strip anything that looks like a credential out of a driver message before
 * it is shown to an operator or written to a log.
 *
 * `pg` normally reports only `host:port` and an error code, but an
 * authentication failure echoes the role name and a malformed URL can echo the
 * entire connection string, so both shapes are redacted defensively. No call
 * site ever prints the URL itself — only this redacted text and `host:port`.
 */
export function redactCredentials(message: string): string {
  return (
    message
      // scheme://user:secret@host  ->  scheme://***@host
      .replace(/([a-z][a-z0-9+.-]*:\/\/)[^@\s/]*@/gi, "$1***@")
      // password=secret / password: secret / password "secret"
      .replace(/(pass(?:word)?\s*[=:]\s*)(?:"[^"]*"|'[^']*'|\S+)/gi, "$1***")
  );
}

/** `host:port` only — enough to identify the target, never a credential. */
function endpointHint(url: string): string | null {
  const at = url.lastIndexOf("@");
  const authority = at === -1 ? url : url.slice(at + 1);
  const hostPort = authority.split("/")[0]?.trim() ?? "";
  return hostPort || null;
}

/** Remember a driver failure so diagnostics can tell it apart from "unset". */
export function noteConnectError(error: unknown): void {
  const raw = error instanceof Error ? error.message : String(error);
  lastConnectError = redactCredentials(raw);
}

/**
 * Distinguish the three states that all look like "the database is broken" from
 * the outside:
 *
 * - `unconfigured` — `DATABASE_URL` is absent.
 * - `misconfigured` — present but not a `postgres(ql)://` URL.
 * - `configured`   — present and well-formed (says nothing about reachability).
 *
 * `endpoint` is `host:port`; `lastError` is already redacted.
 */
export function dbDiagnostics(): {
  state: "unconfigured" | "misconfigured" | "configured";
  reason: string | null;
  endpoint: string | null;
  lastError: string | null;
} {
  const url = resolveUrl();
  if (url) {
    return { state: "configured", reason: null, endpoint: endpointHint(url), lastError: lastConnectError };
  }
  return {
    state: missingReason === "DATABASE_URL is not set." ? "unconfigured" : "misconfigured",
    reason: missingReason,
    endpoint: null,
    lastError: null,
  };
}

/**
 * Open a real connection and report the outcome in operator-safe language.
 *
 * This is the only way to tell "the variable was never injected" apart from
 * "the variable is there but points at the wrong place / a stopped service".
 */
export async function probeDatabase(): Promise<{ ok: boolean; detail: string }> {
  const diag = dbDiagnostics();
  if (!diag.endpoint) return { ok: false, detail: diag.reason ?? "DATABASE_URL is not set." };

  try {
    const p = await getPool();
    if (!p) return { ok: false, detail: diag.reason ?? "DATABASE_URL is not set." };
    await p.query("SELECT 1");
    lastConnectError = null;
    return { ok: true, detail: `connected to ${diag.endpoint}` };
  } catch (error) {
    noteConnectError(error);
    const raw = redactCredentials(error instanceof Error ? error.message : String(error));
    return {
      ok: false,
      detail: `DATABASE_URL is set and points at ${diag.endpoint}, but the connection failed: ${raw}`,
    };
  }
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
