-- Content and settings the first schema pass did not cover:
--
--   volunteer_experience  — volunteering & leadership, a required public section
--   site_settings         — owner-editable site title/description + which
--                            sections the home page features, plus contact prefs
--   social_links          — normalised professional links shown in the footer
--   contact_messages      — the inbox the contact form writes to (private)
--
-- Same rules as 0002: RLS is enabled here too, and `contact_messages` gets no
-- public policy at all, so the inbox is unreachable from the public read path.

/* ------------------------------------------------------------------ */
/* Volunteering & leadership                                           */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS volunteer_experience (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  organisation text NOT NULL DEFAULT '',
  cause        text NOT NULL DEFAULT '',
  location     text NOT NULL DEFAULT '',
  start_date   text NOT NULL DEFAULT '',
  end_date     text NOT NULL DEFAULT '',
  is_current   boolean NOT NULL DEFAULT false,
  description  text NOT NULL DEFAULT '',
  url          text NOT NULL DEFAULT '',
  sort_order   integer NOT NULL DEFAULT 0,
  published    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_volunteer_pub ON volunteer_experience(published, sort_order);

/* ------------------------------------------------------------------ */
/* Site settings (singleton)                                           */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS site_settings (
  id                   integer PRIMARY KEY CHECK (id = 1),
  site_title           text NOT NULL DEFAULT '',
  site_description     text NOT NULL DEFAULT '',
  -- Which sections the home page shows. Empty sections render nothing, so
  -- these are a presentation switch, not a second publication flag.
  featured_about       boolean NOT NULL DEFAULT true,
  featured_experience  boolean NOT NULL DEFAULT true,
  featured_education   boolean NOT NULL DEFAULT true,
  featured_skills      boolean NOT NULL DEFAULT true,
  featured_projects    boolean NOT NULL DEFAULT true,
  featured_achievements boolean NOT NULL DEFAULT true,
  featured_certifications boolean NOT NULL DEFAULT true,
  featured_volunteer   boolean NOT NULL DEFAULT true,
  featured_documents   boolean NOT NULL DEFAULT true,
  -- Contact preferences.
  contact_enabled      boolean NOT NULL DEFAULT true,
  contact_intro        text NOT NULL DEFAULT '',
  contact_show_phone   boolean NOT NULL DEFAULT false,
  contact_show_email   boolean NOT NULL DEFAULT true,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

INSERT INTO site_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

/* ------------------------------------------------------------------ */
/* Professional links                                                  */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS social_links (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform   text NOT NULL UNIQUE,
  url        text NOT NULL DEFAULT '',
  label      text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  published  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

/* ------------------------------------------------------------------ */
/* Contact inbox                                                       */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS contact_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  email      text NOT NULL,
  subject    text NOT NULL DEFAULT '',
  message    text NOT NULL,
  ip_hash    text NOT NULL DEFAULT '',
  user_agent text NOT NULL DEFAULT '',
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contact_created ON contact_messages(created_at DESC);

-- Never expose the inbox publicly, and never store raw IPs — only a salted
-- digest, so a database leak cannot be correlated back to a visitor.
REVOKE ALL ON contact_messages FROM PUBLIC;
REVOKE ALL ON contact_messages FROM portfolio_public;

/* ------------------------------------------------------------------ */
/* updated_at maintenance                                               */
/* ------------------------------------------------------------------ */

DROP TRIGGER IF EXISTS trg_touch_volunteer ON volunteer_experience;
CREATE TRIGGER trg_touch_volunteer BEFORE UPDATE ON volunteer_experience
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_social_links ON social_links;
CREATE TRIGGER trg_touch_social_links BEFORE UPDATE ON social_links
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_site_settings ON site_settings;
CREATE TRIGGER trg_touch_site_settings BEFORE UPDATE ON site_settings
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

/* ------------------------------------------------------------------ */
/* Row Level Security                                                   */
/* ------------------------------------------------------------------ */

ALTER TABLE volunteer_experience ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_links         ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_messages     ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON volunteer_experience TO portfolio_public;
GRANT SELECT ON social_links         TO portfolio_public;
GRANT SELECT ON site_settings        TO portfolio_public;

DROP POLICY IF EXISTS published_read ON volunteer_experience;
CREATE POLICY published_read ON volunteer_experience
  FOR SELECT TO portfolio_public USING (published = true);

DROP POLICY IF EXISTS published_read ON social_links;
CREATE POLICY published_read ON social_links
  FOR SELECT TO portfolio_public USING (published = true);

-- Settings are public by definition: they decide what the site displays.
DROP POLICY IF EXISTS public_settings ON site_settings;
CREATE POLICY public_settings ON site_settings
  FOR SELECT TO portfolio_public USING (true);

-- contact_messages is enabled but carries no policy: the public role gets
-- zero rows even if a query names the table directly.
