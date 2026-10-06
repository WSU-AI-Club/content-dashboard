// AI Club Content Desk API. Static desk is served from ./public; /api/* runs here.
// Auth: Cloudflare Access puts a signed JWT on every request. We verify it, then trust the email in it.

const MAX_IMAGE = 1900000; // D1 caps a BLOB/row near 2 MB
const MAX_POSTS = 2000, MAX_IMAGES = 3000; // open mode: keeps a vandal from filling the database
let keyCache = { at: 0, keys: null };

const json = (o, status = 200, h = {}) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-robots-tag": "noindex", ...h } });

function b64u(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function accessKeys(team) {
  if (keyCache.keys && Date.now() - keyCache.at < 3600e3) return keyCache.keys;
  const r = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error("certs");
  const { keys } = await r.json();
  keyCache = { at: Date.now(), keys };
  return keys;
}

// Returns the signed-in email, or null. Fails closed when Access isn't configured.
async function who(req, env) {
  if (!env.TEAM_DOMAIN || !env.POLICY_AUD) {
    if (env.DEV_EMAIL) return env.DEV_EMAIL; // only for `wrangler dev`
    if (env.OPEN_MODE === "true") { // no login: the name is whatever the officer typed, so it's a label, not proof
      let n = ""; try { n = decodeURIComponent(req.headers.get("x-desk-name") || ""); } catch (e) {}
      return n.replace(/[^\p{L}\p{N} .'-]/gu, "").trim().slice(0, 40) || "guest";
    }
    return null;
  }
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

const rowToPost = r => {
  const p = JSON.parse(r.data);
  return Object.assign(p, { id: r.id, status: r.status, _v: r.version, updated: r.updated_at, updatedBy: r.updated_by, createdBy: r.created_by, created: p.created || r.created_at });
};

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

      if (path === "/api/posts" && req.method === "GET") {
        const since = Number(url.searchParams.get("since")) || 0;
        const { results } = await env.DB.prepare(
          since ? "SELECT * FROM posts WHERE updated_at > ? ORDER BY updated_at" : "SELECT * FROM posts WHERE deleted = 0 ORDER BY updated_at"
        ).bind(...(since ? [since] : [])).all();
        return json({
          now: Date.now(),
          posts: results.filter(r => !r.deleted).map(rowToPost),
          deleted: results.filter(r => r.deleted).map(r => r.id)
        });
      }

      let m = path.match(/^\/api\/posts\/([\w-]{3,64})$/);
      if (m && req.method === "PUT") {
        const id = m[1], body = await req.json(), post = body.post, base = Number(body.baseVersion) || 0;
        if (!post || typeof post !== "object") return json({ error: "Bad post" }, 400);
        const data = JSON.stringify(post);
        if (data.length > 900000) return json({ error: "Post too large" }, 413);
        const now = Date.now(), title = String((post.fields && post.fields.headline) || "").slice(0, 200);
        const status = ["draft", "approved", "posted"].includes(post.status) ? post.status : "draft";
        const cur = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();
        if (!cur) {
          const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM posts").first();
          if (n.n >= MAX_POSTS) return json({ error: "Post limit reached" }, 429);
          await env.DB.prepare("INSERT INTO posts (id,title,status,data,version,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,1,?,?,?,?)")
            .bind(id, title, status, data, email, email, now, now).run();
          return json({ version: 1, updated: now, updatedBy: email });
        }
        if (cur.version !== base) return json({ error: "conflict", post: rowToPost(cur) }, 409);
        // Guarded update: only wins if nobody bumped the version since we read it.
        const r = await env.DB.prepare("UPDATE posts SET title=?,status=?,data=?,version=version+1,updated_by=?,updated_at=?,deleted=0 WHERE id=? AND version=?")
          .bind(title, status, data, email, now, id, base).run();
        if (!r.meta.changes) return json({ error: "conflict", post: rowToPost(await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first()) }, 409);
        return json({ version: base + 1, updated: now, updatedBy: email });
      }
      if (m && req.method === "DELETE") {
        await env.DB.prepare("UPDATE posts SET deleted=1, version=version+1, updated_by=?, updated_at=? WHERE id=?").bind(email, Date.now(), m[1]).run();
        return json({ ok: true });
      }

      if (path === "/api/images" && req.method === "POST") {
        const type = (req.headers.get("content-type") || "").split(";")[0];
        if (!/^image\/(jpeg|png|webp|gif|svg\+xml)$/.test(type)) return json({ error: "Not an image" }, 415);
        const buf = await req.arrayBuffer();
        if (buf.byteLength > MAX_IMAGE) return json({ error: "Image too large" }, 413);
        const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM images").first();
        if (n.n >= MAX_IMAGES) return json({ error: "Image limit reached" }, 429);
        const id = crypto.randomUUID().replace(/-/g, "");
        await env.DB.prepare("INSERT INTO images (id,mime,bytes,size,created_by,created_at) VALUES (?,?,?,?,?,?)")
          .bind(id, type, buf, buf.byteLength, email, Date.now()).run();
        return json({ id, url: "/api/images/" + id });
      }
      m = path.match(/^\/api\/images\/([a-f0-9]{32})$/);
      if (m && req.method === "GET") {
        const r = await env.DB.prepare("SELECT mime, bytes FROM images WHERE id = ?").bind(m[1]).first();
        if (!r) return new Response("Not found", { status: 404 });
        const bytes = r.bytes instanceof ArrayBuffer ? r.bytes : new Uint8Array(r.bytes).buffer;
        // SVG can carry script; sandbox it so an uploaded one can never run in the desk's origin.
        return new Response(bytes, { headers: { "content-type": r.mime, "cache-control": "private, max-age=31536000, immutable", "content-security-policy": "sandbox", "x-content-type-options": "nosniff" } });
      }
      return json({ error: "Not found" }, 404);
    } catch (e) {
      return json({ error: "Server error" }, 500);
    }
  }
};
