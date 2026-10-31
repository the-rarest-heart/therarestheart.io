# The Commons — how it runs

Threads and replies live in a Cloudflare D1 database.

**This site runs on Cloudflare Pages**, project `therarestheart-io`, built
automatically from the `main` branch of this repository. It is not a Worker —
running `wrangler deploy` would create a separate Worker that does not serve
the domain. Pushing to `main` is what deploys.

`_worker.js` at the repository root puts Pages in advanced mode: it answers
`/api/*` itself and hands every other request to the static files. No build
step, no framework, no third-party community service: it stays yours.

---

## Files

| Path | What it is |
| --- | --- |
| `_worker.js` | The API, plus handing everything else to the static files |
| `schema.sql` | The database tables |
| `wrangler.toml` | Pages config, the D1 binding and the R2 binding |
| `js/commons.js` | Room list, new-thread form, thread view, replies |
| `js/media.js` | The upload box, and drawing attachments back out |
| `js/admin.js` | Your writing and moderation screen |
| `js/notes.js` | Field Notes list and the single note page |
| `note.html` | One field note |
| `admin.html` | `/admin.html` — write notes, and hide / pin / edit / delete threads |
| `thread.html` | One thread and its replies |

---

## Media

Attachments go in **R2**, Cloudflare's file store. D1 holds the index — who
posted it, what it is, what order it goes in — and R2 holds the bytes. Nothing
is served straight from R2: every file goes through `/api/files/:id`, so a
hidden post's photos stop being reachable the moment you hide it.

**Storage is not switched on yet,** so the binding in `wrangler.toml` is
commented out. That is deliberate: Pages refuses to publish the Function at
all when a binding names a bucket that does not exist. The assets go up, the
Function does not, and `/api/*` — the whole Commons — goes down with it. The
build log says it plainly:

```
Error: Failed to publish your Function. Got error: R2 bucket 'trh-media'
not found.
```

The schema is the other half of the same problem. `attachments` is created by
`schema.sql`, applied by hand, so it can lag a deploy — and a note that reads
its attachments from a table that is not there is a 500 on writing that has
nothing to do with attachments. Every read of the table now goes through
`readAttachments()`, which treats *no such table* as "no attachments" and
rethrows anything else. Notes, threads and replies render, and posting and
moderating keep working, whether or not the table has landed.

Three steps, in this order:

1. Cloudflare dashboard → **R2** → enable it (needs a card on file; the free
   allowance below still applies)
2. From this folder:

```bash
npx wrangler r2 bucket create trh-media
npx wrangler d1 execute trh-commons --remote --file=./schema.sql
```

3. Uncomment the `[[r2_buckets]]` block in `wrangler.toml`, commit, push

The `d1 execute` is safe to run whenever and more than once — `schema.sql` is
nothing but `CREATE TABLE IF NOT EXISTS`, so it adds what is missing and
leaves everything already there alone.

Until step 3, uploads answer *"File storage is not connected yet."*, the
upload box never draws itself, and everything else on the site carries on as
normal.

**Free allowance:** 10 GB stored, 1M uploads and 10M reads a month, and
Cloudflare charges nothing for bandwidth out. Above that it is $0.015 per GB
per month — a hundred short videos would cost pennies.

**What is allowed, and to whom** — the `UPLOADS` block near the top of
`_worker.js`:

| | Visitors | You |
| --- | --- | --- |
| Images | yes | yes |
| PDFs, Word, Excel, PowerPoint | yes | yes |
| Video and audio | no | yes |
| Size of one file | 15 MB | 95 MB in one go, no real limit in parts |
| Files on one post | 4 | 16 |

Video is off for visitors on purpose. Change `publicMedia` to
`['image', 'doc', 'video', 'audio']` if that ever stops being the right call.

The file type is decided by the extension, never by what the browser claims,
and the list is in `MEDIA_TYPES`. SVG is deliberately absent: it can carry
script, and it would run on our own origin.

Uploads that never get attached to a post are swept after 24 hours.

---

## Setup — already done

Recorded here so it can be redone. Nothing below needs running again.

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

**4. Set the two secrets** — on the Pages project, not on a Worker.

`ADMIN_TOKEN` is the password for `/admin.html`. `IP_SALT` makes the
rate-limiting hashes unguessable; you never type it anywhere.

```bash
npx wrangler pages secret put ADMIN_TOKEN --project-name therarestheart-io
```

```bash
npx wrangler pages secret put IP_SALT --project-name therarestheart-io
```

**5. Deploying.**

Merge to `main`. Pages builds and publishes it. Pushing any other branch gives
you a preview deployment at its own URL, sharing the same D1 database.

One catch: `wrangler pages secret put` only writes to the **production**
environment — there is no CLI flag for preview. So on a preview deployment
`ADMIN_TOKEN` is unset and `/admin.html` will refuse you, while posting and
replying work normally. Set the preview copies by hand in the dashboard
(Workers & Pages -> therarestheart-io -> Settings -> Variables and Secrets ->
Preview) if you ever want to moderate from a preview.

---

## Working on it locally

```bash
npx wrangler pages dev
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

If spam gets through anyway, lower `LIMITS.postsPerHour` in `_worker.js` and
push to `main`.

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

## Caching, and why a deploy can look like it did nothing

Pages serves everything it holds — pages, scripts, stylesheet, images — with

```
cache-control: public, max-age=0, must-revalidate
```

which is the right default: every request asks whether the file changed, and
the ETag makes the answer a 304 rather than a download. That is what the
`*.pages.dev` preview URLs return.

**The custom domain does not.** On therarestheart.io the scripts, stylesheet
and images come back with

```
cache-control: public, max-age=14400, must-revalidate
```

Four hours. That is the zone's **Browser Cache TTL**, a Cloudflare default
that rewrites the origin's header on anything it caches. The pages themselves
escape it because Cloudflare does not cache HTML, which is why a deploy can
look like it worked — the new page arrives, the old scripts do not.

So a returning visitor can run new HTML against up to four-hour-old
JavaScript, and the two have to agree. It bit us for real: the fix for the
stranded upload label was deployed and correct, the file Cloudflare was
serving contained it, and an already-open page still ran the old script. On a
phone that had never visited, it looked perfect.

**The fix is one setting, and it is not in this repository:**

> Cloudflare dashboard → therarestheart.io → **Caching** → **Configuration**
> → **Browser Cache TTL** → **Respect Existing Headers**

Then the origin's `max-age=0` is honoured and every change is live for
everyone on their next page load.

Worth knowing what *doesn't* fix it. A `_headers` file is ignored, because
`_worker.js` puts Pages in advanced mode. Setting the header in the Worker
does nothing either — the zone overrides it downstream, which is exactly how
this was mistaken for an origin problem in the first place. Versioned
filenames (`media.js?v=3`) would work, but only while someone remembers to
bump them on every edit, and forgetting is silent.

---

## Backing it up

D1 has no automatic export. Run this now and then and keep the file somewhere
safe:

```bash
npx wrangler d1 export trh-commons --remote --output=commons-backup.sql
```

This matters more now that your writing lives here too. Threads can be
rebuilt by the people who wrote them; your field notes cannot. Put a reminder
somewhere.

---

## Writing a field note

Open `/admin.html`, paste your token, and the first panel is the editor. It
works on a phone, which is the whole point — editing HTML by hand never did.

- **Kind** picks where it lands: Writing, Build log, or Research. Choosing
  Build log reveals an *In progress / Shipped* badge.
- **One line for the card** is the sentence that makes someone open it. The
  body is plain text; leave a blank line between paragraphs.
- **Save as draft** keeps it off the site entirely — a draft returns 404 at
  its own URL, not just hidden from the list.
- **Publish** puts it on `/notes` immediately. No deploy, no commit.

The URL comes from the title. Retitling a published note changes its address,
so any link somebody already shared will break — rewrite the title before you
publish, not after.

Reading time is counted from the body at roughly 220 words a minute.

---

## The signup list

Every signup form on the site — the Commons join box and each footer
newsletter box — posts to `/api/subscribe` and lands in the `subscribers`
table. Duplicate signups quietly update the existing row rather than erroring.

Open `/admin.html` to see the count, read the list, or **Download CSV**.

**Collecting is not sending.** D1 stores addresses; it cannot send email. For
the first stretch, send the Friday email from Zoho with the list on BCC. When
that stops being practical, import the CSV into Buttondown or Kit and point
the forms at their endpoint instead.

---

## Still to do
- **Enable R2, create the `trh-media` bucket, uncomment the binding.** See
  Media above — all three, in that order. Uploads do not work until they are
  done, and uncommenting the binding before the bucket exists takes `/api/*`
  down. Nothing else is affected.
- Images are stored and served at whatever size they were taken, so a photo
  straight off a phone can be several MB. Cloudflare Images would resize them
  on the way out, at $5 a month.
- Nobody is emailed when a thread gets a reply. That wants either a Worker
  cron job or an email service wired into the reply handler.
- Gerdie's Monday question is written on the page but nothing posts it. A
  Worker cron trigger could create that thread automatically.
