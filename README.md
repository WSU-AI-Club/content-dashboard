# AI Club Content Desk

The club's shared tool for making on-brand graphics: officers pick a template, write the words, add
photos, and download PNGs sized for Instagram, LinkedIn and the campus screens. Drafts, photos and
templates are shared, so every officer sees the same queue.

Live at **desk.zadok.dev**. What changed recently, in plain language: [docs/whats-new.md](docs/whats-new.md).

## How it fits together

```
browser ── desk.zadok.dev ──► Cloudflare Worker (src/worker.js)
                                 ├─ serves the desk page: public/index.html
                                 └─ /api/*  ──► D1 database "aiclub-content"
                                                 posts · templates · images (+ image_parts)
```

| Path | What it is |
| --- | --- |
| `public/index.html` | The desk, as one self-contained page. **Built file: don't edit by hand.** |
| `source/desk.html` | The desk's layout, styles and app logic. Edit this. |
| `source/components/bundle.js` | The brand templates (EventPost, SpeakerPost, GeneralPost, RecapPost, BlankPost, FinishedPost, TemplatePost) as React components. |
| `source/components/bundle.css` | How every template looks in every format (feed, story, LinkedIn wide, WSU TV, Woolsey Big TV, Shockerblast). |
| `source/tokens.json`, `source/logos/` | Brand colors/type and the logo, inlined at build time. |
| `source/build.py` | Stitches the above into `public/index.html`. |
| `src/worker.js` | The API: posts, templates, images, who is editing. |
| `schema.sql` | Database schema for a fresh database. |
| `migrations/` | Upgrades for an existing database, in order. |
| `wrangler.toml` | Cloudflare settings: Worker name, domain, database binding, login mode. |

## Making a change

1. Edit files in `source/` (or `src/worker.js` for the API).
2. Rebuild the page: `python3 source/build.py`
3. Try it locally (optional): `npm install`, then
   `npx wrangler d1 execute aiclub-content --local --file=schema.sql` once, then `npx wrangler dev`.
4. Commit and push to `main`. Cloudflare deploys `main` automatically (Workers & Pages >
   aiclub-content-desk > Settings > Builds). No build command is needed because the built page is committed.

If the database needs a new table or column, add a file to `migrations/` and run it against the
live database **before** pushing the Worker that needs it:
`npx wrangler d1 execute aiclub-content --remote --file=migrations/<file>.sql`

## Formats

Layouts for screens are drawn at a 1080px-tall design size and scaled to the exact pixels on download.

| Format | Downloads at | For |
| --- | --- | --- |
| Feed 4:5 | 1080 × 1350 | Instagram and LinkedIn feed |
| Story 9:16 | 1080 × 1920 | Instagram stories |
| LinkedIn wide | 1200 × 627 | LinkedIn event and link cards |
| WSU TV | 1280 × 720 | WSU TV |
| Woolsey Big TV | 1920 × 1080 | The big screen in Woolsey Hall |
| Shockerblast | 800 × 600 | The Shockerblast newsletter |

To add a format: add its layout size to `SIZE` (and `LAND` if it's landscape) in `bundle.js`, its
download size and label to `FORMATS` in `desk.html`, list it in the templates' `formats` in `T`,
and add layout rules in `bundle.css` if the existing ones don't fit.

## Login

Open mode (no login) is on: `OPEN_MODE = "true"` in `wrangler.toml`. Anyone with the link can use
the desk; each officer types a name once per browser, which labels their edits but proves nothing.
Share the link only with officers. The Worker caps posts (2,000), templates (200) and images (3,000).

To require a login: Cloudflare dashboard > Zero Trust > Access > Applications > Self-hosted, domain
`desk.zadok.dev`, policy Allow with the officers' emails. Copy the team domain and the Application
Audience (AUD) tag into `TEAM_DOMAIN` and `POLICY_AUD` in `wrangler.toml` and push. Names then come
from the verified login.

## Storage notes

- Images are stored in D1 in 1 MB pieces, up to 10 MB per file, so finished graphics keep their
  original quality. Phone photos are resized to 2400px when added.
- Two officers saving the same post at once: the second save is refused and that officer is shown
  the first one's version (nothing is silently overwritten).
- Deleting a post or template hides it for everyone; the row stays in D1.
- Posts copy their custom template when created, so editing or deleting a template never changes
  posts already made from it.

_Deploys automatically from `main` via Cloudflare Workers Builds._
