import { AsyncLocalStorage } from "node:async_hooks";
import type { Client, QueryResultRow } from "pg";

import { ensureMigrated } from "./migrate";
import { dbStatus, getPool, isDbConfigured } from "./pool";

export { closePool, dbStatus, isDbConfigured, resetPool } from "./pool";

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
    const res = await ambient.query<T>(sql, params);
    return { rows: res.rows, rowCount: res.rowCount };
  }

  const p = await getPool();
  if (!p) return { rows: [] as T[], rowCount: 0 };

  const res = await p.query<T>(sql, params);
  return { rows: res.rows, rowCount: res.rowCount };
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
