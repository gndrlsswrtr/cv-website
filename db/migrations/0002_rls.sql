-- Row Level Security.
--
-- Two guarantees, enforced by the database rather than by application code:
--
--   1. The public read role (`portfolio_public`) can only ever see *published*
--      content. Drafts, unpublished documents, password hashes and session
--      tokens are invisible to it — no matter what query the app issues.
--   2. `users` and `sessions` carry RLS with no public policy at all, so a
--      connection running as `portfolio_public` returns zero rows from them.
--
-- The application connects as the table owner (which PostgreSQL exempts from
-- RLS unless FORCE ROW LEVEL SECURITY is set) for admin reads and writes, and
-- wraps every public read in `SET LOCAL ROLE portfolio_public` — see
-- `src/lib/db/query.ts`.
--
-- Roles are cluster-wide, so creation is guarded and re-runnable.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'portfolio_public') THEN
    CREATE ROLE portfolio_public NOLOGIN;
  END IF;
END
$$;

-- The migration runner (and therefore the app's DATABASE_URL user) must be
-- able to assume the public role at query time.
GRANT portfolio_public TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO portfolio_public;

/* ------------------------------------------------------------------ */
/* Content: published rows only                                        */
/* ------------------------------------------------------------------ */

ALTER TABLE experience     ENABLE ROW LEVEL SECURITY;
ALTER TABLE education      ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills         ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects       ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements   ENABLE ROW LEVEL SECURITY;
ALTER TABLE certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents      ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON experience     TO portfolio_public;
GRANT SELECT ON education      TO portfolio_public;
GRANT SELECT ON skills         TO portfolio_public;
GRANT SELECT ON projects       TO portfolio_public;
GRANT SELECT ON achievements   TO portfolio_public;
GRANT SELECT ON certifications TO portfolio_public;
GRANT SELECT ON documents      TO portfolio_public;

DROP POLICY IF EXISTS published_read ON experience;
CREATE POLICY published_read ON experience
  FOR SELECT TO portfolio_public USING (published = true);

DROP POLICY IF EXISTS published_read ON education;
CREATE POLICY published_read ON education
  FOR SELECT TO portfolio_public USING (published = true);

DROP POLICY IF EXISTS published_read ON skills;
CREATE POLICY published_read ON skills
  FOR SELECT TO portfolio_public USING (published = true);

DROP POLICY IF EXISTS published_read ON projects;
CREATE POLICY published_read ON projects
  FOR SELECT TO portfolio_public USING (published = true);

DROP POLICY IF EXISTS published_read ON achievements;
CREATE POLICY published_read ON achievements
  FOR SELECT TO portfolio_public USING (published = true);

DROP POLICY IF EXISTS published_read ON certifications;
CREATE POLICY published_read ON certifications
  FOR SELECT TO portfolio_public USING (published = true);

DROP POLICY IF EXISTS published_read ON documents;
CREATE POLICY published_read ON documents
  FOR SELECT TO portfolio_public USING (published = true);

/* ------------------------------------------------------------------ */
/* Profile: public identity is readable, nothing else is               */
/* ------------------------------------------------------------------ */

ALTER TABLE profile ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON profile TO portfolio_public;

DROP POLICY IF EXISTS public_profile ON profile;
CREATE POLICY public_profile ON profile
  FOR SELECT TO portfolio_public USING (true);

/* ------------------------------------------------------------------ */
/* Accounts & sessions: no public policy at all                        */
/* ------------------------------------------------------------------ */

-- RLS enabled with zero policies means `portfolio_public` reads zero rows.
-- This is what keeps password hashes and session tokens unreachable from the
-- public read path even if a query is written carelessly.
ALTER TABLE users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Force RLS for the owner too? No. The owner (DATABASE_URL) must be able to
-- administer accounts, so FORCE ROW LEVEL SECURITY is deliberately NOT set.
