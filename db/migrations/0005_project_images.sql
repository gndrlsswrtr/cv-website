-- File attachment on projects: a cover image or screenshot per project.
--
-- Same four columns `0004_attachments.sql` added to certifications and
-- achievements, and for the same reason: the admin upload machinery in
-- `src/app/admin/actions.ts` already writes them for any resource whose
-- registry entry declares an `upload`. Projects are the one content type a
-- portfolio is judged on visually and the one that had no image at all, so
-- the columns are what make a cover possible — the form, the public card and
-- the `/media/projects/[id]` route all key off them.
--
-- Deleting a row still deletes its file, via the same generic path.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS stored_name   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS original_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS mime          text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS size          bigint NOT NULL DEFAULT 0;

-- Public list pages show a cover when one exists; this partial index keeps
-- "which rows have an image" cheap without costing anything on the majority
-- of rows that have none.
CREATE INDEX IF NOT EXISTS idx_projects_attached
  ON projects (id) WHERE stored_name <> '';
