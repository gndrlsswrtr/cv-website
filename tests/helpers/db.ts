import { randomBytes } from "node:crypto";

import type { QueryResultRow } from "pg";

import { getPool } from "@/lib/db/pool";

/**
 * Helpers shared by the test suites.
 *
 * Tests own their rows: every record is created with a unique marker so a
 * leftover row from an earlier run can never make a later assertion pass.
 */

export function marker(): string {
  return `T${randomBytes(6).toString("hex")}`;
}

/** Run SQL as the superuser/admin connection (bypasses RLS, as in production). */
export async function adminQuery<T extends QueryResultRow = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const pool = await getPool();
  if (!pool) throw new Error("DATABASE_URL is not configured in the test run.");
  const res = await pool.query<T>(sql, params);
  return res.rows;
}

/**
 * Run SQL as the `portfolio_public` role — the exact session a public page
 * opens. Anything not covered by an RLS policy is invisible here.
 */
export async function publicQuery<T extends QueryResultRow = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const pool = await getPool();
  if (!pool) throw new Error("DATABASE_URL is not configured in the test run.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE portfolio_public");
    const res = await client.query<T>(sql, params);
    await client.query("COMMIT");
    return res.rows;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Leave the migration bookkeeping empty when a suite finishes.
 *
 * `tests/database.test.ts` asserts that *its own* `beforeAll` applies at least
 * one migration — an assertion that only holds while no earlier suite has
 * already recorded them. Every migration file is idempotent (guarded by
 * `IF NOT EXISTS` / `DROP IF EXISTS`), so the next suite simply re-applies
 * them. Database-touching suites call this in `afterAll` so the whole run
 * stays green regardless of file order.
 */
export async function resetMigrationBookkeeping(): Promise<void> {
  await adminQuery(`DELETE FROM schema_migrations`);
}

/** Wipe every content row so suites stay independent. */
export async function resetContent(): Promise<void> {
  // `DELETE`, not `TRUNCATE ... CASCADE`: profile.avatar_id has a foreign key
  // to documents, and a cascading truncate would silently empty the profile
  // row too.
  await adminQuery(`UPDATE profile SET avatar_id = NULL`);
  await adminQuery(
    `DELETE FROM experience; DELETE FROM education; DELETE FROM skills;
     DELETE FROM projects; DELETE FROM achievements;
     DELETE FROM certifications; DELETE FROM documents;`,
  );
}
