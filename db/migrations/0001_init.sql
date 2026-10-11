-- Initial schema for the portfolio & digital CV.
--
-- Column names deliberately match the form field names declared in
-- `src/lib/resources.ts`, so the generic CRUD layer can map a FormData entry
-- straight to a column without any per-resource glue code.
--
-- Every statement here is idempotent so the migration can be re-run safely.

-- gen_random_uuid() is built in from PostgreSQL 13.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

/* ------------------------------------------------------------------ */
/* Accounts & sessions                                                 */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'admin',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id           text PRIMARY KEY,
  token_hash   text NOT NULL UNIQUE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

/* ------------------------------------------------------------------ */
/* Profile (single row)                                                */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS profile (
  id          integer PRIMARY KEY CHECK (id = 1),
  full_name   text NOT NULL DEFAULT '',
  headline    text NOT NULL DEFAULT '',
  location    text NOT NULL DEFAULT '',
  summary     text NOT NULL DEFAULT '',
  email       text NOT NULL DEFAULT '',
  phone       text NOT NULL DEFAULT '',
  website     text NOT NULL DEFAULT '',
  linkedin    text NOT NULL DEFAULT '',
  github      text NOT NULL DEFAULT '',
  x_url       text NOT NULL DEFAULT '',
  footer_note text NOT NULL DEFAULT '',
  avatar_id   uuid,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Guarantees the singleton row exists without an application-level upsert.
INSERT INTO profile (id, updated_at)
VALUES (1, now())
ON CONFLICT (id) DO NOTHING;

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS experience (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  company     text NOT NULL DEFAULT '',
  location    text NOT NULL DEFAULT '',
  start_date  text NOT NULL DEFAULT '',
  end_date    text NOT NULL DEFAULT '',
  is_current  boolean NOT NULL DEFAULT false,
  description text NOT NULL DEFAULT '',
  sort_order  integer NOT NULL DEFAULT 0,
  published   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_experience_pub ON experience(published, sort_order);

CREATE TABLE IF NOT EXISTS education (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution    text NOT NULL,
  degree         text NOT NULL DEFAULT '',
  field_of_study text NOT NULL DEFAULT '',
  location       text NOT NULL DEFAULT '',
  start_date     text NOT NULL DEFAULT '',
  end_date       text NOT NULL DEFAULT '',
  description    text NOT NULL DEFAULT '',
  sort_order     integer NOT NULL DEFAULT 0,
  published      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_education_pub ON education(published, sort_order);

CREATE TABLE IF NOT EXISTS skills (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  category    text NOT NULL DEFAULT '',
  level       integer NOT NULL DEFAULT 3,
  description text NOT NULL DEFAULT '',
  sort_order  integer NOT NULL DEFAULT 0,
  published   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_skills_pub ON skills(published, sort_order);

CREATE TABLE IF NOT EXISTS projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  title       text NOT NULL,
  summary     text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  tech        text NOT NULL DEFAULT '',
  repo_url    text NOT NULL DEFAULT '',
  demo_url    text NOT NULL DEFAULT '',
  sort_order  integer NOT NULL DEFAULT 0,
  published   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projects_pub ON projects(published, sort_order);

CREATE TABLE IF NOT EXISTS achievements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  category    text NOT NULL DEFAULT 'Achievement',
  issuer      text NOT NULL DEFAULT '',
  "date"      text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  url         text NOT NULL DEFAULT '',
  sort_order  integer NOT NULL DEFAULT 0,
  published   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_achievements_pub ON achievements(published, "date");

CREATE TABLE IF NOT EXISTS certifications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  issuer         text NOT NULL DEFAULT '',
  issue_date     text NOT NULL DEFAULT '',
  expiry_date    text NOT NULL DEFAULT '',
  credential_id  text NOT NULL DEFAULT '',
  credential_url text NOT NULL DEFAULT '',
  verify_url     text NOT NULL DEFAULT '',
  description    text NOT NULL DEFAULT '',
  sort_order     integer NOT NULL DEFAULT 0,
  published      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_certifications_pub ON certifications(published, issue_date);

CREATE TABLE IF NOT EXISTS documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  category      text NOT NULL DEFAULT 'Other',
  description   text NOT NULL DEFAULT '',
  stored_name   text NOT NULL DEFAULT '',
  original_name text NOT NULL DEFAULT '',
  mime          text NOT NULL DEFAULT '',
  size          bigint NOT NULL DEFAULT 0,
  sort_order    integer NOT NULL DEFAULT 0,
  -- Files often contain personal data: publishing is an explicit act.
  published     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_pub ON documents(published, sort_order);

-- Keeps the profile avatar pointing at a real document.
ALTER TABLE profile
  DROP CONSTRAINT IF EXISTS fk_profile_avatar;
ALTER TABLE profile
  ADD CONSTRAINT fk_profile_avatar
  FOREIGN KEY (avatar_id) REFERENCES documents(id) ON DELETE SET NULL;

/* ------------------------------------------------------------------ */
/* updated_at maintenance                                               */
/* ------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_users ON users;
CREATE TRIGGER trg_touch_users BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
