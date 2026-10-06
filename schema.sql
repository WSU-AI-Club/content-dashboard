CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_by TEXT, updated_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS posts_updated ON posts(updated_at);
CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, post_id TEXT, mime TEXT NOT NULL, bytes BLOB NOT NULL, size INTEGER NOT NULL, created_by TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS images_post ON images(post_id);
