// AI Club Content Desk: the Worker.
//
// It does two jobs:
//   1. Serves the desk page itself (public/index.html) through Cloudflare's static assets.
//   2. Answers /api/* so every officer sees the same posts, templates and photos, stored in D1
//      (the "aiclub-content" database bound as env.DB in wrangler.toml).
//
// API
//   GET    /api/me                      who you are, and whether the desk is in open (no-login) mode
//   GET    /api/posts[?since=ms]        all posts, or only what changed since a timestamp (for live sync)
//   PUT    /api/posts/:id               create or save a post. Body {post, baseVersion}
//   DELETE /api/posts/:id               hide a post for everyone (the row stays, flagged deleted)
//   GET    /api/templates[?since=ms]    custom templates the club uploaded
//   PUT    /api/templates/:id           create or save a template. Body {item, baseVersion}
//   DELETE /api/templates/:id           hide a template (posts already made from it keep working)
//   POST   /api/images                  upload one image (raw bytes, image/* content type), returns {id, url}
//   GET    /api/images/:id              read an image back
//
// Saving uses optimistic locking: every row has a version number. A save says which version it
// started from; if someone else saved in between, the save is refused (409) and the desk shows
// that person's version instead of silently overwriting it.
//
// Who is editing: with Cloudflare Access configured (TEAM_DOMAIN + POLICY_AUD in wrangler.toml)
// the email comes from Access's signed token. In open mode (OPEN_MODE = "true", no login) it is
// the name the officer typed, which labels changes but proves nothing.

// ---- limits ----------------------------------------------------------------------------------
// D1 caps a single row at 2 MB, so images are stored in 1 MB pieces: the first piece in `images`,
// the rest in `image_parts`. That lets a finished graphic keep its original quality up to 10 MB.
const CHUNK = 1000000;
const MAX_IMAGE = 10 * 1024 * 1024;
// Open mode has no login, so caps keep anyone with the link from filling the database.
const MAX_IMAGES = 3000;
const MAX_ITEM_JSON = 900000; // a post or template without its images is a few KB; this is generous

// The two shared collections. Both tables have the same core columns (id, data, version, who and
// when, deleted); `extra` adds the few columns each one keeps outside the JSON for quick queries.
const COLLECTIONS = {
  posts: {
    table: "posts", max: 2000,
    extra: p => ({
      title: String((p.fields && p.fields.headline) || "").slice(0, 200),
      status: ["draft", "approved", "posted"].includes(p.status) ? p.status : "draft"
    })
  },
  templates: {
    table: "templates", max: 200,
    extra: t => ({ name: String(t.name || "").slice(0, 120) })
  }
};

// ---- helpers ---------------------------------------------------------------------------------
const json = (o, status = 200, h = {}) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-robots-tag": "noindex", ...h } });

// base64url -> bytes (for reading the Access token)
function b64u(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Cloudflare Access signing keys, cached for an hour.
let keyCache = { at: 0, keys: null };
async function accessKeys(team) {
  if (keyCache.keys && Date.now() - keyCache.at < 3600e3) return keyCache.keys;
  const r = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error("certs");
  const { keys } = await r.json();
  keyCache = { at: Date.now(), keys };
  return keys;
}

// Who is making this request? Returns a name/email, or null to refuse.
// Fails closed: with no Access settings and open mode off, nobody gets in.
async function who(req, env) {
  if (!env.TEAM_DOMAIN || !env.POLICY_AUD) {
    if (env.DEV_EMAIL) return env.DEV_EMAIL; // only for `wrangler dev`
    if (env.OPEN_MODE === "true") { // no login: the name is whatever the officer typed, so it's a label, not proof
      let n = ""; try { n = decodeURIComponent(req.headers.get("x-desk-name") || ""); } catch (e) {}
      return n.replace(/[^\p{L}\p{N} .'-]/gu, "").trim().slice(0, 40) || "guest";
    }
    return null;
  }
  // Access mode: verify the RS256 token Access attaches, check its audience and expiry.
  const tok = req.headers.get("Cf-Access-Jwt-Assertion");
  if (!tok) return null;
  try {
    const [h, p, s] = tok.split(".");
    const head = JSON.parse(new TextDecoder().decode(b64u(h)));
    const keys = await accessKeys(env.TEAM_DOMAIN);
    const jwk = keys.find(k => k.kid === head.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64u(s), new TextEncoder().encode(h + "." + p));
    if (!ok) return null;
    const c = JSON.parse(new TextDecoder().decode(b64u(p)));
    const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
    if (!aud.includes(env.POLICY_AUD) || c.exp * 1000 < Date.now() || !c.email) return null;
    return String(c.email).toLowerCase();
  } catch (e) { return null; }
}

// A database row -> the object the desk works with. Server-owned fields (version, who, when) are
// added on top of the stored JSON so the desk can't overwrite them.
function rowToItem(r) {
  const o = JSON.parse(r.data);
  Object.assign(o, { id: r.id, _v: r.version, updated: r.updated_at, updatedBy: r.updated_by, createdBy: r.created_by, created: o.created || r.created_at });
  if (r.status !== undefined) o.status = r.status;
  return o;
}

// ---- collections (posts, templates) ----------------------------------------------------------
async function list(env, name, url) {
  const c = COLLECTIONS[name], since = Number(url.searchParams.get("since")) || 0;
  const { results } = await env.DB.prepare(
    since ? `SELECT * FROM ${c.table} WHERE updated_at > ? ORDER BY updated_at` : `SELECT * FROM ${c.table} WHERE deleted = 0 ORDER BY updated_at`
  ).bind(...(since ? [since] : [])).all();
  // The list is returned under the collection's name ("posts" / "templates") for older pages.
  return json({ now: Date.now(), [name]: results.filter(r => !r.deleted).map(rowToItem), deleted: results.filter(r => r.deleted).map(r => r.id) });
}

async function save(env, name, id, req, email) {
  const c = COLLECTIONS[name], body = await req.json();
  const item = body.item || body.post, base = Number(body.baseVersion) || 0;
  if (!item || typeof item !== "object") return json({ error: "Bad request" }, 400);
  const data = JSON.stringify(item);
  if (data.length > MAX_ITEM_JSON) return json({ error: "Too large" }, 413);
  const now = Date.now(), extra = c.extra(item), cols = Object.keys(extra);
  const cur = await env.DB.prepare(`SELECT * FROM ${c.table} WHERE id = ?`).bind(id).first();

  if (!cur) { // new row
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${c.table}`).first();
    if (n.n >= c.max) return json({ error: "Limit reached" }, 429);
    await env.DB.prepare(
      `INSERT INTO ${c.table} (id,${cols.join(",")},data,version,created_by,updated_by,created_at,updated_at) VALUES (?,${cols.map(() => "?").join(",")},?,1,?,?,?,?)`
    ).bind(id, ...cols.map(k => extra[k]), data, email, email, now, now).run();
    return json({ version: 1, updated: now, updatedBy: email });
  }
  const conflict = row => json({ error: "conflict", post: rowToItem(row), item: rowToItem(row) }, 409);
  if (cur.version !== base) return conflict(cur);
  // Guarded update: only wins if nobody bumped the version since we read it.
  const r = await env.DB.prepare(
    `UPDATE ${c.table} SET ${cols.map(k => k + "=?").join(",")},data=?,version=version+1,updated_by=?,updated_at=?,deleted=0 WHERE id=? AND version=?`
  ).bind(...cols.map(k => extra[k]), data, email, now, id, base).run();
  if (!r.meta.changes) return conflict(await env.DB.prepare(`SELECT * FROM ${c.table} WHERE id = ?`).bind(id).first());
  return json({ version: base + 1, updated: now, updatedBy: email });
}

async function remove(env, name, id, email) {
  const c = COLLECTIONS[name];
  await env.DB.prepare(`UPDATE ${c.table} SET deleted=1, version=version+1, updated_by=?, updated_at=? WHERE id=?`).bind(email, Date.now(), id).run();
  return json({ ok: true });
}

// ---- images ----------------------------------------------------------------------------------
async function putImage(env, req, email) {
  const buf = new Uint8Array(await req.arrayBuffer());
  // Trust the bytes over the label: JPEGs often arrive as image/jpg, image/pjpeg or with no type.
  const at = (i, ...v) => v.every((x, k) => buf[i + k] === x);
  const sniffed = at(0, 0xff, 0xd8, 0xff) ? "image/jpeg" : at(0, 0x89, 0x50, 0x4e, 0x47) ? "image/png" :
    at(0, 0x47, 0x49, 0x46, 0x38) ? "image/gif" : at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50) ? "image/webp" : "";
  const label = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const type = sniffed || (label === "image/svg+xml" ? label : "");
  if (!type) return json({ error: "Not an image" }, 415);
  if (buf.byteLength > MAX_IMAGE) return json({ error: "Image too large (10 MB max)" }, 413);
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM images").first();
  if (n.n >= MAX_IMAGES) return json({ error: "Image limit reached" }, 429);
  const id = crypto.randomUUID().replace(/-/g, "");
  const pieces = [];
  for (let at = 0; at < buf.byteLength || at === 0; at += CHUNK) pieces.push(buf.slice(at, at + CHUNK));
  // First piece lives on the images row; any others go to image_parts. One batch = all or nothing.
  const stmts = [env.DB.prepare("INSERT INTO images (id,mime,bytes,size,parts,created_by,created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(id, type, pieces[0], buf.byteLength, pieces.length, email, Date.now())];
  for (let i = 1; i < pieces.length; i++) stmts.push(env.DB.prepare("INSERT INTO image_parts (image_id,idx,bytes) VALUES (?,?,?)").bind(id, i, pieces[i]));
  await env.DB.batch(stmts);
  return json({ id, url: "/api/images/" + id });
}

async function getImage(env, id) {
  const r = await env.DB.prepare("SELECT mime, bytes, size, parts FROM images WHERE id = ?").bind(id).first();
  if (!r) return new Response("Not found", { status: 404 });
  const first = new Uint8Array(r.bytes);
  let bytes = first;
  if ((r.parts || 1) > 1) { // stitch the pieces back together in order
    const { results } = await env.DB.prepare("SELECT bytes FROM image_parts WHERE image_id = ? ORDER BY idx").bind(id).all();
    bytes = new Uint8Array(r.size);
    bytes.set(first, 0);
    let at = first.byteLength;
    for (const p of results) { const b = new Uint8Array(p.bytes); bytes.set(b, at); at += b.byteLength; }
  }
  // SVG can carry script; the sandbox header means an uploaded one can never run in the desk's origin.
  return new Response(bytes, { headers: { "content-type": r.mime, "cache-control": "private, max-age=31536000, immutable", "content-security-policy": "sandbox", "x-content-type-options": "nosniff" } });
}

// ---- router ----------------------------------------------------------------------------------
export default {
  async fetch(req, env) {
    const url = new URL(req.url), path = url.pathname;
    if (!path.startsWith("/api/")) {
      const r = await env.ASSETS.fetch(req), h = new Headers(r.headers); h.set("x-robots-tag", "noindex, nofollow");
      return new Response(r.body, { status: r.status, headers: h });
    }

    const email = await who(req, env);
    if (!email) return json({ error: env.TEAM_DOMAIN ? "Not signed in" : "No login and open mode is off on this Worker" }, env.TEAM_DOMAIN ? 401 : 503);

    try {
      if (path === "/api/me" && req.method === "GET") return json({ email, open: !(env.TEAM_DOMAIN && env.POLICY_AUD) && env.OPEN_MODE === "true" });

      // /api/posts and /api/templates share one implementation
      let m = path.match(/^\/api\/(posts|templates)$/);
      if (m && req.method === "GET") return await list(env, m[1], url);
      m = path.match(/^\/api\/(posts|templates)\/([\w-]{3,64})$/);
      if (m && req.method === "PUT") return await save(env, m[1], m[2], req, email);
      if (m && req.method === "DELETE") return await remove(env, m[1], m[2], email);

      if (path === "/api/images" && req.method === "POST") return await putImage(env, req, email);
      m = path.match(/^\/api\/images\/([a-f0-9]{32})$/);
      if (m && req.method === "GET") return await getImage(env, m[1]);

      return json({ error: "Not found" }, 404);
    } catch (e) {
      return json({ error: "Server error" }, 500);
    }
  }
};
