-- Full schema for a NEW database. Safe to re-run (everything is IF NOT EXISTS).
-- Upgrading an existing database instead? Run the files in migrations/ in order.

-- Posts: one row per post. The post itself is JSON in `data`; title and status are copied out for quick queries.
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,              -- bumps on every save; used to catch two people editing at once
  created_by TEXT, updated_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0               -- deletes are soft: the row stays, hidden from the desk
);
CREATE INDEX IF NOT EXISTS posts_updated ON posts(updated_at);

-- Custom templates uploaded by the club (background images + text settings), same pattern as posts.
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1, created_by TEXT, updated_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS templates_updated ON templates(updated_at);

-- Images (photos, logos, backgrounds, finished graphics). D1 rows max out at 2 MB, so a file is split
-- into 1 MB pieces: piece 0 in images.bytes, pieces 1..n-1 in image_parts. `parts` says how many.
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY, post_id TEXT, mime TEXT NOT NULL, bytes BLOB NOT NULL, size INTEGER NOT NULL,
  created_by TEXT, created_at INTEGER NOT NULL, parts INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS images_post ON images(post_id);
CREATE TABLE IF NOT EXISTS image_parts (
  image_id TEXT NOT NULL, idx INTEGER NOT NULL, bytes BLOB NOT NULL, PRIMARY KEY (image_id, idx)
);
