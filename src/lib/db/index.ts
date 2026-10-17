import { AsyncLocalStorage } from "node:async_hooks";
import type { Client, QueryResultRow } from "pg";

import { ensureMigrated } from "./migrate";
import { dbDiagnostics, dbStatus, getPool, noteConnectError, probeDatabase } from "./pool";

export {
  closePool,
  dbDiagnostics,
  dbStatus,
  isDbConfigured,
  probeDatabase,
  redactCredentials,
  resetPool,
} from "./pool";

/**
 * PostgreSQL access layer.
 *
 * Design notes:
 *
 * - **One admin pool** connects as the table owner (the `DATABASE_URL` user).
 *   PostgreSQL exempts table owners from Row Level Security, so admin reads and
 *   writes see everything.
 * - **Public reads run as `portfolio_public`** via `withPublicRole()`, which
 *   opens a transaction and issues `SET LOCAL ROLE`. RLS then hides every
 *   unpublished row — the guarantee lives in the database, not in a `WHERE`
 *   clause the app might forget to write.
 * - The active client is carried in an `AsyncLocalStorage` so the existing
 *   `all()` / `get()` / `run()` helpers transparently reuse it. Callers never
 *   have to thread a client through.
 * - **Nothing throws when `DATABASE_URL` is absent.** Queries return empty
 *   results and `dbStatus()` reports why, so `next build` works before any
 *   database exists and the UI can say "not configured" instead of crashing.
 */

export type Row = Record<string, string | number | boolean | null>;

const PUBLIC_ROLE = "portfolio_public";

const activeClient = new AsyncLocalStorage<Client | null>();

type QueryResult<T> = { rows: T[]; rowCount: number | null };

async function execQuery<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  const ambient = activeClient.getStore();

  // Migrations are memoised, so this resolves on the first query and is a
  // microtask afterwards. Running it here guarantees a fresh database is never
  // queried before its schema exists.
  if (!ambient) await ensureMigrated().catch(() => undefined);

  if (ambient) {
    try {
      const res = await ambient.query<T>(sql, params);
      return { rows: res.rows, rowCount: res.rowCount };
    } catch (error) {
      // Remembered so a later diagnostic can say "set, but unreachable"
      // instead of silently reporting "not set". Re-thrown unchanged.
      noteConnectError(error);
      throw error;
    }
  }

  const p = await getPool();
  if (!p) return { rows: [] as T[], rowCount: 0 };

  try {
    const res = await p.query<T>(sql, params);
    return { rows: res.rows, rowCount: res.rowCount };
  } catch (error) {
    noteConnectError(error);
    throw error;
  }
}

/** Run a parameterised SELECT and return every row (empty when unconfigured). */
export async function all<T extends QueryResultRow = Row>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await execQuery<T>(sql, params);
  return res.rows;
}

/** Run a parameterised SELECT and return the first row, or `undefined`. */
export async function get<T extends QueryResultRow = Row>(
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const res = await execQuery<T>(sql, params);
  return res.rows[0];
}

/** Execute an INSERT/UPDATE/DELETE. Returns the affected row count. */
export async function run(sql: string, params: unknown[] = []): Promise<number> {
  const res = await execQuery(sql, params);
  return res.rowCount ?? 0;
}

/** Execute one or more statements with no parameters. Migration/bootstrap use only. */
export async function exec(sql: string): Promise<void> {
  const ambient = activeClient.getStore();
  if (ambient) {
    await ambient.query(sql);
    return;
  }
  const p = await getPool();
  if (!p) throw new Error(dbStatus() ?? "Database is not configured.");
  await p.query(sql);
}

/**
 * Why nothing can be written right now — `null` once `DATABASE_URL` is set.
 *
 * Degrading to empty results is right for *public reads* during `next build`,
 * but it is a trap for *writes*: `run()` reports 0 affected rows instead of
 * throwing, so a form that cannot possibly succeed answers "please retry"
 * forever. (The contact form went further and reported a successful send.)
 * Every write path surfaces this message instead, naming the variable to set.
 */
export function dbUnconfiguredMessage(): string | null {
  const reason = dbStatus();
  if (!reason) return null;
  return (
    `This deployment has no database, so nothing can be saved — ${reason} ` +
    "Set DATABASE_URL on the service and redeploy."
  );
}

/**
 * The async counterpart — and the one every write path should use.
 *
 * `dbUnconfiguredMessage()` can only see a *missing* variable: it answers
 * `null` whenever `DATABASE_URL` is present, however broken. An action would
 * then sail past the guard and die with an opaque 500 when the connection is
 * refused, which is precisely what a half-finished Railway variable change
 * looks like from the outside. Probing first turns that into a specific,
 * credential-free explanation naming `host:port`.
 */
export async function dbUnavailableMessage(): Promise<string | null> {
  const diag = dbDiagnostics();
  if (!diag.endpoint) {
    return (
      `This deployment has no database, so nothing can be saved — ${diag.reason ?? "DATABASE_URL is not set."} ` +
      "Set DATABASE_URL on the service and redeploy."
    );
  }

  const probe = await probeDatabase();
  if (probe.ok) return null;

  return (
    `This deployment cannot reach its database, so nothing can be saved — ${probe.detail} ` +
    "Check that the Postgres service is running and that this service's DATABASE_URL " +
    "references it, then redeploy."
  );
}

/**
 * Run `fn` with every query executed as `portfolio_public`, so Row Level
 * Security applies. Falls back to a plain call when no database is configured.
 */
export async function withPublicRole<T>(fn: () => Promise<T>): Promise<T> {
  await ensureMigrated().catch(() => undefined);

  const p = await getPool();
  if (!p) return fn();

  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${PUBLIC_ROLE}`);
    const value = await activeClient.run(client, fn);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run `fn` inside a transaction. Any `all()` / `get()` / `run()` call made
 * inside the callback reuses the transactional client, so an error anywhere
 * rolls the whole unit of work back.
 */
export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  await ensureMigrated().catch(() => undefined);

  const p = await getPool();
  if (!p) return fn();

  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const value = await activeClient.run(client, fn);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function now(): string {
  return new Date().toISOString();
}
