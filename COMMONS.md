# The Commons — how it runs

Threads and replies live in a Cloudflare D1 database. A Worker serves the site
and answers `/api/*`. No build step, no framework, no third-party community
service: it stays yours.

---

## Files

| Path | What it is |
| --- | --- |
| `worker/index.js` | The Worker — the API, plus serving the static site |
| `schema.sql` | The database tables |
| `wrangler.toml` | Worker config and the D1 binding |
| `js/commons.js` | Room list, new-thread form, thread view, replies |
| `js/admin.js` | Your moderation screen |
| `admin.html` | `/admin.html` — hide, pin, edit, delete |
| `thread.html` | One thread and its replies |

---

## First-time setup

Run these once, from this folder. Wrangler comes down with `npx`; you don't
need to install anything globally.

**1. Sign in.**

```bash
npx wrangler login
```

**2. Create the database.**

```bash
npx wrangler d1 create trh-commons
```

It prints a `database_id`. Paste it into `wrangler.toml`, replacing
`PASTE_THE_ID_FROM_WRANGLER_D1_CREATE`.

**3. Create the tables.**

```bash
npx wrangler d1 execute trh-commons --remote --file=./schema.sql
```

**4. Set the two secrets.**

`ADMIN_TOKEN` is the password for `/admin.html`. Make it long and random.

```bash
npx wrangler secret put ADMIN_TOKEN
```

`IP_SALT` makes the rate-limiting hashes unguessable. Any long random string.

```bash
npx wrangler secret put IP_SALT
```

**5. Deploy.**

```bash
npx wrangler deploy
```

---

## Working on it locally

```bash
npx wrangler dev --local
```

Local runs read secrets from `.dev.vars`, which is gitignored and must never
be committed. Give the local database its tables once:

```bash
npx wrangler d1 execute trh-commons --local --file=./schema.sql
```

---

## Moderating

Open `/admin.html` and paste your `ADMIN_TOKEN`. It's held for that browser tab
only — close the tab and it's gone. Per thread you can:

- **Hide / Unhide** — drops it from the public rooms, keeps it in the database
- **Mark answered** — shows an "Answered" badge
- **Pin as new** — sticks it to the top of its room, for beginner questions
- **Edit** — fix a title or body
- **Delete** — removes the thread and every reply, permanently

Hiding is almost always the right first move. Delete is for spam.

`/admin.html` and `/thread.html` both carry `noindex`, so search engines leave
them alone.

---

## What stops spam

There are no accounts, by design — an account is the same barrier that made
Discord wrong for this. So instead:

- **A honeypot field.** Invisible to people, filled in by bots. Those posts are
  silently dropped, so the bot thinks it worked.
- **Six posts an hour per machine**, counted against a salted hash of the IP.
  The raw IP is never stored.
- **Length limits** — 140 characters on a title, 6000 on a body.
- **Everything is text.** Replies render as text nodes, never HTML, so pasted
  markup can't execute.

If spam gets through anyway, lower `LIMITS.postsPerHour` in `worker/index.js`
and redeploy.

---

## The API

Public:

```
GET  /api/rooms
GET  /api/threads?room=ask
POST /api/threads                   { room, title, body, author, email? }
GET  /api/threads/:id
POST /api/threads/:id/replies       { body, author, email? }
```

Moderation — every one needs an `X-Admin-Token` header:

```
GET    /api/admin/threads?room=
PATCH  /api/admin/threads/:id       { status, newHere, title, body }
DELETE /api/admin/threads/:id
PATCH  /api/admin/replies/:id       { status, body }
DELETE /api/admin/replies/:id
```

Email addresses are collected but never returned by the public endpoints. They
appear only in the admin list, so you can reach someone whose thread needs a
real answer offline.

---

## Backing it up

D1 has no automatic export. Run this now and then and keep the file somewhere
safe:

```bash
npx wrangler d1 export trh-commons --remote --output=commons-backup.sql
```

---

## Still to do

- The three newsletter forms post nowhere. They need a mailing list service
  (Buttondown or Kit) before they collect anything.
- Nobody is emailed when a thread gets a reply. That wants either a Worker
  cron job or an email service wired into the reply handler.
- Gerdie's Monday question is written on the page but nothing posts it. A
  Worker cron trigger could create that thread automatically.
