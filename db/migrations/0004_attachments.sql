-- File attachments on certifications and achievements.
--
-- The admin upload machinery in `src/app/admin/actions.ts` already writes these
-- four columns for *any* resource whose registry entry declares an `upload`
-- (`documents` has since the first migration). Adding them here is what lets
-- the owner attach a scanned certificate or a photo of an award directly to the
-- entry, instead of filing it separately in the document library.
--
-- Deleting a row already deletes its file — that path is generic too.

ALTER TABLE certifications
  ADD COLUMN IF NOT EXISTS stored_name   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS original_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS mime          text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS size          bigint NOT NULL DEFAULT 0;

ALTER TABLE achievements
  ADD COLUMN IF NOT EXISTS stored_name   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS original_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS mime          text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS size          bigint NOT NULL DEFAULT 0;

-- Public list pages show an attachment thumbnail when one exists; this partial
-- index keeps "which rows have a file" cheap as the record grows, without
-- costing anything on the (majority) of rows that have none.
CREATE INDEX IF NOT EXISTS idx_certifications_attached
  ON certifications (id) WHERE stored_name <> '';
CREATE INDEX IF NOT EXISTS idx_achievements_attached
  ON achievements (id) WHERE stored_name <> '';
