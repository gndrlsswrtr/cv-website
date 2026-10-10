import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";

import { SCHEMA_STATEMENTS } from "./schema";

/**
 * Thin, typed wrapper around Node's built-in SQLite driver.
 *
 * Deliberately dependency-free: no ORM, no native module to compile. All
 * queries are parameterised — identifiers only ever come from the static
 * resource registry, never from user input.
 */

export type SqlValue = string | number | bigint | null | Uint8Array;
export type BindValue = SqlValue | boolean | undefined | Date;

const globalForDb = globalThis as unknown as {
  __portfolioDb?: DatabaseSync;
  __portfolioDbPath?: string;
};

function resolveDbPath(): string {
  const fromEnv = process.env.DATABASE_FILE;
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(process.cwd(), "data", "portfolio.db");
}

/** Booleans/undefined/Date are not bindable to node:sqlite — normalise first. */
function normalise(value: BindValue): SqlValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function prepare(db: DatabaseSync, sql: string): StatementSync {
  return db.prepare(sql);
}

export function getDb(): DatabaseSync {
  const dbPath = resolveDbPath();
  if (globalForDb.__portfolioDb && globalForDb.__portfolioDbPath === dbPath) {
    return globalForDb.__portfolioDb;
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");

  // Schema creation is idempotent, so a race between build workers is harmless:
  // the loser waits on busy_timeout and then sees the tables already exist.
  for (const statement of SCHEMA_STATEMENTS) {
    db.exec(statement);
  }

  globalForDb.__portfolioDb = db;
  globalForDb.__portfolioDbPath = dbPath;
  return db;
}

/** Run a parameterised statement. Returns rows for SELECTs. */
export function all<T = Record<string, unknown>>(
  sql: string,
  params: BindValue[] = [],
): T[] {
  const stmt = prepare(getDb(), sql);
  return stmt.all(...params.map(normalise)) as T[];
}

/** Fetch the first matching row, or `undefined`. */
export function get<T = Record<string, unknown>>(
  sql: string,
  params: BindValue[] = [],
): T | undefined {
  const stmt = prepare(getDb(), sql);
  return stmt.get(...params.map(normalise)) as T | undefined;
}

/** Execute an INSERT/UPDATE/DELETE. */
export function run(
  sql: string,
  params: BindValue[] = [],
): { changes: number; lastInsertRowid: number } {
  const stmt = prepare(getDb(), sql);
  const result = stmt.run(...params.map(normalise));
  return {
    changes: Number(result.changes),
    lastInsertRowid: Number(result.lastInsertRowid),
  };
}

/** Execute one or more statements without parameters (migrations only). */
export function exec(sql: string): void {
  getDb().exec(sql);
}

export function now(): string {
  return new Date().toISOString();
}

/** Remove expired sessions. Cheap enough to call on every login. */
export function purgeExpiredSessions(): void {
  run("DELETE FROM sessions WHERE expires_at <= ?", [now()]);
}
