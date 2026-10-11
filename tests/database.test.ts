import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { applyMigrations, readMigrationFiles, resetMigrationMemo } from "@/lib/db/migrate";
import { all, get, run, withPublicRole } from "@/lib/db";
import { closePool, getPool } from "@/lib/db/pool";
import { adminQuery, marker, publicQuery, resetContent } from "./helpers/db";

/**
 * The database contract: migrations are idempotent, and Row Level Security —
 * not application filtering — is what keeps unpublished content, password
 * hashes and session tokens out of the public read path.
 */

beforeAll(async () => {
  resetMigrationMemo();
  const applied = await applyMigrations();
  expect(applied.length).toBeGreaterThan(0);
});

afterEach(async () => {
  await resetContent();
});

describe("migrations", () => {
  it("reads migration files in order", () => {
    const files = readMigrationFiles();
    expect(files.map((f) => f.name)).toEqual(
      [...files.map((f) => f.name)].sort((a, b) => a.localeCompare(b, "en")),
    );
    expect(files.some((f) => f.name === "0001_init.sql")).toBe(true);
    expect(files.some((f) => f.name === "0002_rls.sql")).toBe(true);
  });

  it("is idempotent — a second run applies nothing", async () => {
    const again = await applyMigrations();
    expect(again).toEqual([]);
  });

  it("records every migration in schema_migrations", async () => {
    const rows = await adminQuery<{ name: string }>(
      "SELECT name FROM schema_migrations ORDER BY name",
    );
    const names = rows.map((r) => r.name);
    for (const file of readMigrationFiles()) {
      expect(names).toContain(file.name);
    }
  });

  it("creates every table the resource registry points at", async () => {
    const rows = await adminQuery<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name`,
    );
    const tables = rows.map((r) => r.table_name);

    for (const expected of [
      "achievements",
      "certifications",
      "documents",
      "education",
      "experience",
      "profile",
      "projects",
      "schema_migrations",
      "sessions",
      "skills",
      "users",
    ]) {
      expect(tables).toContain(expected);
    }
  });
});

describe("row level security", () => {
  it("exposes published rows to the public role", async () => {
    const tag = marker();
    await adminQuery(
      `INSERT INTO experience (title, company, published, sort_order)
       VALUES ($1, 'ACME', true, 1)`,
      [`${tag} published`],
    );
    await adminQuery(
      `INSERT INTO experience (title, company, published, sort_order)
       VALUES ($1, 'ACME', false, 2)`,
      [`${tag} draft`],
    );

    const visible = await publicQuery<{ title: string }>(
      `SELECT title FROM experience WHERE title LIKE $1`,
      [`${tag}%`],
    );
    expect(visible.map((r) => r.title)).toEqual([`${tag} published`]);

    const asAdmin = await adminQuery<{ title: string }>(
      `SELECT title FROM experience WHERE title LIKE $1 ORDER BY title`,
      [`${tag}%`],
    );
    expect(asAdmin).toHaveLength(2);
  });

  it("never exposes password hashes or session tokens to the public role", async () => {
    const users = await publicQuery("SELECT * FROM users");
    expect(users).toEqual([]);

    const sessions = await publicQuery("SELECT * FROM sessions");
    expect(sessions).toEqual([]);
  });

  it("hides unpublished documents from the public role", async () => {
    const tag = marker();
    await adminQuery(
      `INSERT INTO documents (title, category, stored_name, original_name, mime, size, published)
       VALUES ($1, 'CV', 'a.pdf', 'cv.pdf', 'application/pdf', 10, true),
              ($2, 'Other', 'b.pdf', 'private.pdf', 'application/pdf', 10, false)`,
      [`${tag} public`, `${tag} private`],
    );

    const visible = await publicQuery<{ title: string }>(
      `SELECT title FROM documents WHERE title LIKE $1`,
      [`${tag}%`],
    );
    expect(visible.map((r) => r.title)).toEqual([`${tag} public`]);
  });

  it("leaves the public profile readable", async () => {
    const rows = await publicQuery("SELECT id FROM profile WHERE id = 1");
    expect(rows).toHaveLength(1);
  });

  it("denies every write to the public role", async () => {
    await expect(publicQuery(`DELETE FROM experience`)).rejects.toThrow();
    await expect(
      publicQuery(`INSERT INTO experience (title) VALUES ('nope')`),
    ).rejects.toThrow();
    await expect(publicQuery(`UPDATE profile SET full_name = 'nope'`)).rejects.toThrow();
  });

  it("keeps RLS enabled on every content table", async () => {
    const rows = await adminQuery<{ relname: string }>(
      `SELECT c.relname
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND c.relrowsecurity = false
          AND c.relname <> 'schema_migrations'`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });
});

describe("the application's public read path", () => {
  it("runs as portfolio_public so RLS applies", async () => {
    const tag = marker();
    await adminQuery(
      `INSERT INTO skills (name, category, published, sort_order)
       VALUES ($1, 'Lang', true, 1), ($2, 'Lang', false, 2)`,
      [`${tag}-on`, `${tag}-off`],
    );

    // `withPublicRole` is what every public page uses.
    const visible = await withPublicRole(() =>
      all<{ name: string }>(
        `SELECT name FROM skills WHERE name LIKE $1 ORDER BY sort_order`,
        [`${tag}%`],
      ),
    );
    expect(visible.map((r) => r.name)).toEqual([`${tag}-on`]);
  });

  it("reports the current role inside a public transaction", async () => {
    const row = await withPublicRole(() => get<{ current_user: string }>("SELECT current_user"));
    expect(row?.current_user).toBe("portfolio_public");
  });

  it("returns empty results instead of throwing when unconfigured", async () => {
    const original = process.env.DATABASE_URL;
    try {
      delete process.env.DATABASE_URL;
      await closePool();
      await expect(all("SELECT 1")).resolves.toEqual([]);
      expect(await run("SELECT 1")).toBe(0);
    } finally {
      process.env.DATABASE_URL = original;
      await closePool();
      const pool = await getPool();
      expect(pool).not.toBeNull();
    }
  });
});
