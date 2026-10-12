-- October 2026: custom templates + images over 2 MB.
-- Already applied to the live "aiclub-content" database. Kept here so a copy of the database
-- (for example in the club's own Cloudflare account) can be brought up to date:
--   npx wrangler d1 execute aiclub-content --remote --file=migrations/0002_templates_and_large_images.sql
-- Purely additive: nothing existing is changed or removed.

ALTER TABLE images ADD COLUMN parts INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS image_parts (
  image_id TEXT NOT NULL, idx INTEGER NOT NULL, bytes BLOB NOT NULL, PRIMARY KEY (image_id, idx)
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1, created_by TEXT, updated_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS templates_updated ON templates(updated_at);
