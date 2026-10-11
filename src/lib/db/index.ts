import { AsyncLocalStorage } from "node:async_hooks";
import type { Client, Pool } from "pg";

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
 *   results and `isDbConfigured()` reports the reason, so `next build` works
 *   before any database exists and the UI can say "not configured" instead of
 *   crashing.
 */

export type Row = Record<string, string | number | boolean | null>;

const PUBLIC_ROLE = "portfolio_public";

let pool: Pool | null = null;
let poolKey = "";
let missingReason: string | null = null;

const activeClient = new AsyncLocalStorage<Client | null>();

function resolveUrl(): string | null {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    missingReason = "DATABASE_URL is not set.";
    return null;
  }
  if (!/^(postgres|postgresql):\/\//i.test(raw)) {
    missingReason = "DATABASE_URL must start with postgresql://";
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

async function loadPg(): Promise<typeof import("pg")> {
  return import("pg");
}

async function getPool(): Promise<Pool | null> {
  const url = resolveUrl();
  if (!url) return null;

  // Recreate if the URL changed (tests point the app at an ephemeral cluster).
  if (pool && poolKey === url) return pool;
  if (pool) {
    await pool.end().catch(() => undefined);
    pool = null;
  }

  const { Pool: PgPool } = await loadPg();
  pool = new PgPool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Supabase/Railway poolers and self-signed local clusters both need this.
    ssl: /sslmode=disable/i.test(url) ? false : undefined,
  });
  pool.on("error", () => {
    // A dead idle backend must not take the process down.
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

type QueryResult<T> = { rows: T[]; rowCount: number | null };

async function execQuery<T>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
  const ambient = activeClient.getStore();
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
export async function all<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await execQuery<T>(sql, params);
  return res.rows;
}

/** Run a parameterised SELECT and return the first row, or `undefined`. */
export async function get<T = Row>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  const res = await execQuery<T>(sql, params);
  return res.rows[0];
}

/** Execute an INSERT/UPDATE/DELETE. Returns the affected row count. */
export async function run(sql: string, params: unknown[] = []): Promise<number> {
  const res = await execQuery(sql, params);
  return res.rowCount ?? 0;
}

/** Execute one or more statements with no parameters. Migration use only. */
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
