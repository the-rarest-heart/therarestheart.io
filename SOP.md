# Running the site

Everything here works from a phone. Nothing needs a computer.

---

## Getting in

1. Go to **therarestheart.io/admin**
2. Paste your admin token from your password manager
3. Tap **Unlock**

It stays unlocked until you close the tab. **Sign out** clears it immediately.

If it says *Not authorised*, the token is wrong — there is no second chance
prompt, just paste it again.

---

# FIELD NOTES

## Writing one

On `/admin`, the top panel is **Write a note**.

| Field | What goes in it |
| --- | --- |
| **Kind** | Writing (an essay), Build log (a project update), or Research (something you found) |
| **Build state** | Only appears for build logs. In progress or Shipped |
| **Title** | Say it the way you'd say it out loud |
| **One line for the card** | The sentence that makes someone open it. This is all they see on `/notes` |
| **The note** | The writing. Blank line between paragraphs |

Then either:

- **Save as draft** — kept off the site completely
- **Publish** — live on `/notes` straight away

### Get the title right before you publish

The web address is built from the title. `Week 7: what broke` becomes
`/note?n=week-7-what-broke`.

Change the title after publishing and **the address changes with it**. Any
link anyone has shared, posted or bookmarked stops working. There is no
redirect.

So: write the title, read it once, then publish.

### Drafts are properly private

A draft is not just hidden from the list. Its address returns a 404. Nobody
can read an unfinished note by guessing the URL.

### Things you don't fill in

- **Reading time** — counted from the words, about 220 a minute
- **The date** — set when you publish
- **The web address** — made from the title

---

## Adding photos, video and documents

Under the note, tap **Add a file**. On a phone that opens your camera roll and
your Files app. Pick as many as you want, one after another — they upload as
soon as you choose them, so by the time you tap Publish there is nothing left
to wait for.

**What it takes:** photos (JPG, PNG, HEIC, WebP, GIF), video (MP4, MOV, WebM),
audio (MP3, M4A, WAV), PDFs, and Word, Excel and PowerPoint files. A long
video goes up in pieces on its own; you will see the percentage climb.

**Caption each one** in the box beside it. The caption shows under a photo or
video; on a document it becomes the name people see, so "Retention policy,
draft" reads better than `policy-v3-FINAL-2.docx`.

**Up and Down** put them in the order you want.

### Putting a photo in the middle of the note

By default files sit at the end. To place one, put a line of its own in the
note body:

```
[media:1]
```

`[media:1]` is the first file in the list, `[media:2]` the second, and so on.
Anything you don't place that way still sits at the end, so nothing gets lost
if you miscount.

### Files on a note you already published

The box in the editor only adds new files. To caption, hide or delete the
ones already on a note, find it under **Your notes** and tap **Files**.

---

## Editing a note

1. Find it under **Your notes**
2. Tap **Edit** — it loads into the form at the top
3. Change what you need
4. Tap **Publish** to save

**Cancel edit** backs out without saving.

Editing a published note saves it straight back to the live site. There is no
"save without publishing" for something already public.

---

## Taking a note down

Two different things, and the difference matters.

**Unpublish** — tap **Unpublish**. It leaves the site, the address starts
returning 404, and the writing is kept. Use this for anything you might
revisit, anything you got wrong, or anything you want to rewrite.

**Delete** — tap **Delete**, then confirm. The note is gone from the database
permanently. There is no undo and no copy, unless you happen to have run a
backup since you wrote it.

**Unpublish first. Delete only when you are certain.**

Deleting a note deletes its photos and video with it.

---

## Deleting one file

Find the note under **Your notes**, tap **Files**, then on the file you want:

- **Hide** takes it off the page and stops the link working. The file is still
  stored, and **Unhide** puts it back.
- **Delete** removes the file itself. There is no undo — a backup of the
  database will not bring it back, because the database only ever held the
  index, never the picture.

**Hide first.** Delete when you are sure.

---

# THREADS

## Posting one

Threads are posted from the public site, not the admin screen — you post the
same way anyone else does.

1. Go to **therarestheart.io/commons**
2. Scroll to **Start a thread**
3. Fill in your name, pick a room, write a title and the post
4. Tap **Post it**

It appears in its room immediately.

Email is optional and never shown publicly. It only appears to you, in the
admin list.

## The five rooms

| Room | What belongs there |
| --- | --- |
| **Ask anything** | Questions, especially basic ones |
| **Show your setup** | What people actually run |
| **Compliance corner** | Audits, policies, paperwork |
| **Wins & warnings** | What worked, what went wrong |
| **Build along** | People following the build logs |

Five is the ceiling. More rooms than people is how a community dies quietly.

## Replying

Open any thread and use the reply box at the bottom. No account needed, for
you or for anyone else.

---

## Managing threads

On `/admin`, below your notes, every thread has five buttons.

**Hide** — drops it from the public rooms. The thread and its replies stay in
the database, and you can unhide it later. This is your first move for almost
everything.

**Mark answered** — puts an "Answered" badge on it. Nothing else changes.

**Pin as new** — sticks it to the top of its room. This is the beginner-first
rule made real: use it on a question from someone new so it gets seen and
answered rather than sinking.

**Edit** — fix a title or body. Tapping Edit asks for the title, then the
body, one at a time.

**Delete** — removes the thread and every reply on it, permanently. No undo.

### Hide or delete?

**Hide** when the thread is real but wrong, out of date, duplicated, or got
heated.

**Delete** when it is spam, or when someone posted something that identifies
a patient, a client or a real system and it has to be gone rather than
hidden.

If someone asks you to remove their post, delete it. Hidden is still stored.

---

## Dealing with one reply

A thread with replies has a **Replies (n)** button. Tap it and every reply
appears underneath with two buttons of its own.

**Hide** — the reply leaves the thread and the count drops to match. Nobody
reading can tell it was there.

**Delete** — gone permanently.

Same rule as threads: hide first, delete when you are certain. And if the
person who wrote it asks you to remove it, delete rather than hide, because
hidden is still stored.

---

## Files on a thread or a reply

Anyone can attach **images and documents** — up to 15 MB each, four per post.
Video is deliberately off for visitors: it costs storage and invites what
nobody wants to spend their evening moderating. You can post video yourself,
because the admin token lifts the limits.

To moderate what someone attached, open the thread's row and tap **Files**, or
**Replies** and then **Files** on the reply. The same Hide and Delete, with
the same meanings as above.

Hiding a whole thread hides its photos too — the links stop working for
everyone but you. Deleting a thread deletes every file on it and on all its
replies.

---

# THE SIGNUP LIST

On `/admin`, under **The list**:

- **Show them** — names, addresses, which form they used, when
- **Download CSV** — the whole list as a spreadsheet file

Signing up twice does not create a duplicate.

**The site collects addresses. It cannot send email.** For the Friday email,
send it from Zoho with the list on BCC. When that gets unwieldy, import the
CSV into Buttondown or Kit.

---

# BACKING IT UP

Your writing lives in the database. Threads can be rebuilt by the people who
wrote them; your field notes cannot.

Paste this whole line — it moves to the project folder itself, so it works
wherever you are:

```bash
mkdir -p "$HOME/trh-backups" && cd /Users/rareheart/therarestheart.io && npx wrangler d1 export trh-commons --remote --output="$HOME/trh-backups/commons-$(date +%F).sql"
```

It lands in `~/trh-backups` with the date in the name, deliberately **outside**
the project folder. The export contains your subscribers' names and email
addresses, and the project folder is a git repository — a file dropped in
there can end up pushed to GitHub. Keep a copy somewhere that is not
Cloudflare.

**That backs up the writing, not the files.** Photos and video live in R2, a
separate store, and the export above does not touch them. To pull those down
too:

```bash
mkdir -p "$HOME/trh-backups" && cd /Users/rareheart/therarestheart.io && npx wrangler r2 object get trh-media --remote --recursive --output-dir="$HOME/trh-backups/media"
```

---

# WHEN SOMETHING LOOKS WRONG

**You changed something and the site looks the same.** The browser showing you
an old copy. Hard-reload: `Cmd+Shift+R` on a Mac, or pull down to refresh on
a phone.

Occasionally it is not only you: Cloudflare can keep handing out an old copy
even after a deploy, and then it looks perfect on any phone that has not been
to the site before. If a change is missing for other people and not just for
you, purge the cache — *Caching* in `COMMONS.md` has where.

**"The Commons database is not connected yet."** The site cannot reach the
database. Not something you can fix from the admin screen.

**"File storage is not connected yet."** Photos and video have nowhere to go:
the R2 bucket is not reachable. Expected until storage is switched on. The
rest of the site keeps working either way.

**A photo uploaded but the post would not go.** The file is kept for a day and
then swept away. Nothing you need to clean up.

**"Not authorised" after it was working.** The tab's session ended. Paste the
token again.

**A post vanished.** Check the admin list before assuming it broke — if you
hid it, it is still there, just not public.
