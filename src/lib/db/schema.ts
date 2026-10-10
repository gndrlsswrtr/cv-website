/**
 * SQLite schema for the portfolio.
 *
 * Column names intentionally match the form field names declared in
 * `src/lib/resources.ts`, so the generic CRUD layer can map a FormData entry
 * straight to a column without any per-resource glue code.
 *
 * Statements are idempotent (`IF NOT EXISTS`) and are executed in order the
 * first time the database file is opened.
 */

export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
     id            TEXT PRIMARY KEY,
     email         TEXT NOT NULL UNIQUE,
     name          TEXT NOT NULL,
     password_hash TEXT NOT NULL,
     role          TEXT NOT NULL DEFAULT 'admin',
     created_at    TEXT NOT NULL,
     updated_at    TEXT NOT NULL
   )`,

  `CREATE TABLE IF NOT EXISTS sessions (
     id           TEXT PRIMARY KEY,
     token_hash   TEXT NOT NULL UNIQUE,
     user_id      TEXT NOT NULL,
     expires_at   TEXT NOT NULL,
     created_at   TEXT NOT NULL,
     last_seen_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`,

  `CREATE TABLE IF NOT EXISTS profile (
     id          INTEGER PRIMARY KEY CHECK (id = 1),
     full_name   TEXT NOT NULL DEFAULT '',
     headline    TEXT NOT NULL DEFAULT '',
     location    TEXT NOT NULL DEFAULT '',
     summary     TEXT NOT NULL DEFAULT '',
     email       TEXT NOT NULL DEFAULT '',
     phone       TEXT NOT NULL DEFAULT '',
     website     TEXT NOT NULL DEFAULT '',
     linkedin    TEXT NOT NULL DEFAULT '',
     github      TEXT NOT NULL DEFAULT '',
     x_url       TEXT NOT NULL DEFAULT '',
     footer_note TEXT NOT NULL DEFAULT '',
     avatar_id   TEXT,
     updated_at  TEXT NOT NULL
   )`,

  `CREATE TABLE IF NOT EXISTS experience (
     id          TEXT PRIMARY KEY,
     title       TEXT NOT NULL,
     company     TEXT NOT NULL DEFAULT '',
     location    TEXT NOT NULL DEFAULT '',
     start_date  TEXT NOT NULL DEFAULT '',
     end_date    TEXT NOT NULL DEFAULT '',
     is_current  INTEGER NOT NULL DEFAULT 0,
     description TEXT NOT NULL DEFAULT '',
     sort_order  INTEGER NOT NULL DEFAULT 0,
     published   INTEGER NOT NULL DEFAULT 1,
     created_at  TEXT NOT NULL,
     updated_at  TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_experience_pub ON experience(published, sort_order)`,

  `CREATE TABLE IF NOT EXISTS education (
     id             TEXT PRIMARY KEY,
     institution    TEXT NOT NULL,
     degree         TEXT NOT NULL DEFAULT '',
     field_of_study TEXT NOT NULL DEFAULT '',
     location       TEXT NOT NULL DEFAULT '',
     start_date     TEXT NOT NULL DEFAULT '',
     end_date       TEXT NOT NULL DEFAULT '',
     description    TEXT NOT NULL DEFAULT '',
     sort_order     INTEGER NOT NULL DEFAULT 0,
     published      INTEGER NOT NULL DEFAULT 1,
     created_at     TEXT NOT NULL,
     updated_at     TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_education_pub ON education(published, sort_order)`,

  `CREATE TABLE IF NOT EXISTS skills (
     id          TEXT PRIMARY KEY,
     name        TEXT NOT NULL,
     category    TEXT NOT NULL DEFAULT '',
     level       INTEGER NOT NULL DEFAULT 3,
     description TEXT NOT NULL DEFAULT '',
     sort_order  INTEGER NOT NULL DEFAULT 0,
     published   INTEGER NOT NULL DEFAULT 1,
     created_at  TEXT NOT NULL,
     updated_at  TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_skills_pub ON skills(published, sort_order)`,

  `CREATE TABLE IF NOT EXISTS projects (
     id          TEXT PRIMARY KEY,
     slug        TEXT NOT NULL UNIQUE,
     title       TEXT NOT NULL,
     summary     TEXT NOT NULL DEFAULT '',
     description TEXT NOT NULL DEFAULT '',
     tech        TEXT NOT NULL DEFAULT '',
     repo_url    TEXT NOT NULL DEFAULT '',
     demo_url    TEXT NOT NULL DEFAULT '',
     sort_order  INTEGER NOT NULL DEFAULT 0,
     published   INTEGER NOT NULL DEFAULT 1,
     created_at  TEXT NOT NULL,
     updated_at  TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_projects_pub ON projects(published, sort_order)`,

  `CREATE TABLE IF NOT EXISTS achievements (
     id          TEXT PRIMARY KEY,
     title       TEXT NOT NULL,
     category    TEXT NOT NULL DEFAULT 'Achievement',
     issuer      TEXT NOT NULL DEFAULT '',
     date        TEXT NOT NULL DEFAULT '',
     description TEXT NOT NULL DEFAULT '',
     url         TEXT NOT NULL DEFAULT '',
     sort_order  INTEGER NOT NULL DEFAULT 0,
     published   INTEGER NOT NULL DEFAULT 1,
     created_at  TEXT NOT NULL,
     updated_at  TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_achievements_pub ON achievements(published, date)`,

  `CREATE TABLE IF NOT EXISTS certifications (
     id            TEXT PRIMARY KEY,
     name          TEXT NOT NULL,
     issuer        TEXT NOT NULL DEFAULT '',
     issue_date    TEXT NOT NULL DEFAULT '',
    expiry_date    TEXT NOT NULL DEFAULT '',
     credential_id TEXT NOT NULL DEFAULT '',
     credential_url TEXT NOT NULL DEFAULT '',
     verify_url    TEXT NOT NULL DEFAULT '',
     description   TEXT NOT NULL DEFAULT '',
     sort_order    INTEGER NOT NULL DEFAULT 0,
     published     INTEGER NOT NULL DEFAULT 1,
     created_at    TEXT NOT NULL,
     updated_at    TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_certifications_pub ON certifications(published, issue_date)`,

  `CREATE TABLE IF NOT EXISTS documents (
     id            TEXT PRIMARY KEY,
     title         TEXT NOT NULL,
     category      TEXT NOT NULL DEFAULT 'Other',
     description   TEXT NOT NULL DEFAULT '',
     stored_name   TEXT NOT NULL,
     original_name TEXT NOT NULL,
     mime          TEXT NOT NULL,
     size          INTEGER NOT NULL DEFAULT 0,
     sort_order    INTEGER NOT NULL DEFAULT 0,
     published     INTEGER NOT NULL DEFAULT 0,
     created_at    TEXT NOT NULL,
     updated_at    TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_documents_pub ON documents(published, sort_order)`,
];
