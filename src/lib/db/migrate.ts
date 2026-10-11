import fs from "node:fs";
import path from "node:path";

import { getPool } from "./index";

/**
 * Versioned SQL migration runner.
 *
 * Files live in `db/migrations/*.sql` and are applied in lexicographic order
 * inside a single transaction, guarded by a Postgres advisory lock so two
 * instances booting at the same time (a Railway deploy, a local `npm run dev`
 * next to it) cannot race and apply the same file twice.
 *
 * Every migration file must therefore be idempotent — the runner is safe to
 * call on every boot.
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

/** Arbitrary but stable: derived from the string "portfolio-migrate". */
const ADVISORY_LOCK_KEY = 783_114_201;

let migrationPromise: Promise<void> | null = null;

export type MigrationFile = { name: string; sql: string };

export function readMigrationFiles(dir = MIGRATIONS_DIR): MigrationFile[] {
  if (!fs.existsSync(dir)) {
    throw new Error(
      `No migrations directory at ${dir}. Expected db/migrations/*.sql in the project root.`,
    );
  }
  const names = fs
    .readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en"));

  return names.map((name) => ({
    name,
    sql: fs.readFileSync(path.join(dir, name), "utf8"),
  }));
}

const BOOTSTRAP = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name       text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`;

/**
 * Apply every migration that has not run yet.
 * Memoised per process: safe (and cheap) to call on every request.
 */
export async function ensureMigrated(): Promise<void> {
  if (process.env.AUTO_MIGRATE === "false") return;
  if (!migrationPromise) {
    migrationPromise = applyMigrations().catch((error) => {
      // Allow the next caller to retry instead of caching the failure forever.
      migrationPromise = null;
      throw error;
    });
  }
  return migrationPromise;
}

/** Test helper — forget the memoised result. */
export function resetMigrationMemo(): void {
  migrationPromise = null;
}

export async function applyMigrations(dir = MIGRATIONS_DIR): Promise<string[]> {
  const pool = getPool();
  if (!pool) return []; // No DATABASE_URL: nothing to migrate.

  const files = readMigrationFiles(dir);
  const client = await pool.connect();
  const applied: string[] = [];

  try {
    await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
    await client.query(BOOTSTRAP);

    const { rows } = await client.query<{ name: string }>("SELECT name FROM schema_migrations");
    const done = new Set(rows.map((row) => row.name));
    const pending = files.filter((file) => !done.has(file.name));
    if (pending.length === 0) return applied;

    await client.query("BEGIN");
    try {
      for (const file of pending) {
        await client.query(file.sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file.name]);
        applied.push(file.name);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]).catch(() => undefined);
    client.release();
  }

  return applied;
}
