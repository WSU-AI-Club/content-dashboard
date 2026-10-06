# AI Club Content Desk (shared)

One Cloudflare Worker serves the desk (`public/index.html`) and its API (`src/worker.js`).
Posts and photos live in the D1 database `aiclub-content` (already created in your account).

## Deploy
1. `npm install`
2. `npx wrangler login`
3. `npx wrangler deploy`

`wrangler.toml` is already set to serve at `desk.zadok.dev` in open mode. Open that address, enter a name, and you're in.

## Open mode (no login)
Anyone with the link can read, edit and delete posts. Each officer types a name once per browser; it labels their
changes but is not proof of who they are. Share the link only with the club. Search engines are told not to index it,
and the Worker caps posts (2,000) and photos (3,000) so nobody can fill the database.

## Add a login later
Cloudflare dashboard > Zero Trust > Access > Applications > Self-hosted, domain `desk.zadok.dev`, policy Allow with your
officers' emails. Copy the team domain and the Application Audience (AUD) tag into `TEAM_DOMAIN` and `POLICY_AUD` in
`wrangler.toml`, then `npx wrangler deploy`. Names then come from the verified login.

## Update the desk
Replace `public/index.html` with the new build and `npx wrangler deploy`.

## Notes
- Photos are stored in D1 (each under 1.9 MB; the desk shrinks bigger ones).
- If two officers edit the same post at once, the second save is refused and that officer sees the first one's version.
- Deleting a post hides it for everyone; the row stays in D1.
