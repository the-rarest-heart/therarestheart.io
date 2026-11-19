# Writing handoff: field notes, threads and Gerdie's Weekly

Read this before writing anything for therarestheart.io. It says how Kelvin wants
things written, how they get onto the site, and what has already gone out.
When Kelvin publishes or changes something, add a line to the log at the bottom.

---

## Who this is for

Kelvin owns the site and is learning in public. Readers are the **Commons**: people
learning alongside him, mostly not technical. A reader should feel "that could be me",
never "I'm behind".

## Voice (applies to everything)

- **Plain and warm.** Written "with love". First person, as Kelvin.
- **No jargon without a plain sentence next to it.** Explain a term the first time it
  appears, in everyday words or with a comparison (an SSH key is like a house key).
- **Only use facts Kelvin gave.** Do not invent details, numbers, dates, devices or
  quotes. If something is missing, ask or leave it out.
- **Keep his own words.** When he pastes a draft, change formatting and fix obvious
  slips; do not rewrite it into something else.
- **Short paragraphs.** Blank line between them.
- **A close of "Love."** on its own line. Kelvin ended the Nov 9 and Nov 16 weekly issues
  with it himself. It was added to the Pi note on Claude's own suggestion and he did not
  object, so treat it as likely but not confirmed for field notes.
- Reading level: someone smart who does not work in tech.

## How a note is delivered

Hand Kelvin the fields of **Write a note** on `/admin`, in this order, so he can paste:

| Field | Rule |
| --- | --- |
| **Kind** | Writing (`write`), Build log (`build`), Research (`find`) or Gerdie's Weekly (`weekly`) |
| **Title** | The way he would say it out loud. **The web address is built from the title. Changing it after publishing breaks every shared link, with no redirect.** Get it right first |
| **One line for the card** | The sentence that makes someone open it. This is all they see in the list |
| **The note** | The body |

Always say which Kind to pick. Tell him to **Save as draft** first and publish after he
has read it. Reading time and date are automatic.

### Formatting that works in the note box

Only these. Anything else shows as plain text.

- `## Heading` on its own line
- `**bold**`
- `[the words](https://the-address)` for a link; a bare `https://…` also becomes a link
- A blank line starts a new paragraph
- These labels are made bold automatically: `What it is:`, `Why it matters to you:`,
  `Why it matters:`, `Try this:`, `Source:`

There are no code blocks, tables or images typed into the body. Photos are added in
admin after saving.

### Gerdie's glossary

For each hard word a note uses, give Kelvin a line for **admin > Gerdie's glossary**:

`word = one plain sentence, ideally with a comparison`

The word is underlined the first time it appears in a note; tapping it opens Gerdie with
the meaning. Matching ignores capitals and whole words only. Saving the same word again
replaces its meaning. The glossary lives in the site database, so **add words on the live
site (therarestheart.io/admin), not only on localhost**.

## Gerdie's Weekly

A plain-English weekly tech review for non-technical readers. Fun, warm, exciting to read.

**Routine**

- **Sunday 6:00 PM Eastern:** a scheduled cloud routine emails 8–10 candidate stories to
  kmartin@therarestheart.io. It sends only that one email. It never publishes, never
  emails subscribers and never touches the site. Routine page:
  https://claude.ai/code/routines/trig_015j9eVuD1LixkEKHfFwzqJ5
  (the time shifts by an hour when the clocks change in March).
- **Monday:** Kelvin picks five, writes the issue, saves a draft, previews it, sends
  himself a test, then presses **Email it to subscribers**.
- **The Sunday after:** the issue appears on the site by itself (6 days after it is
  emailed, set by `WEEKLY_SITE_DELAY_DAYS` in `_worker.js`).
- An old issue goes onto the site with **Put on the site now** or **Publish**. That
  emails nobody.

**Issue shape**

1. Title: `Gerdie's Weekly: Month D, YYYY` (the Monday it is sent)
2. Five stories, each: `## N. Headline in plain words`, then `What it is:`,
   `Why it matters to you:`, `Try this:` and `Source: [Name](https://real-address)`
3. `## Market Watch`: one line saying which closes it covers (Friday close to Friday
   close), then one bold company per entry with the percent move, a plain sentence on
   what moved it, `Why it matters:`, and a source. Cover big tech players and a few
   up-and-comers worth watching
4. `This is news, not investment advice.`
5. `## Word of the Week: the word`, a plain definition with a comparison, and the same
   word added to the glossary
6. `Love.`

**Rules for sources and numbers**

- Open every source page before using it. Prefer the original (the company, an agency, a
  bulletin) over a report about it.
- Never invent or guess a fact, number, date, price or web address. If it cannot be
  confirmed, leave it out or tell Kelvin plainly.
- Every story needs a real, working link. No link, no story.
- Never give investment advice. Report what happened.
- Tell Kelvin which of his claims could not be confirmed, before he sends.

**Sending safety**

- **Email it to subscribers** cannot be taken back and goes to everyone on the list at
  that moment. Never trigger it without Kelvin saying so. A test goes only to the address
  he types.
- If a send reports a problem, do not press it again; check Resend first so nobody gets
  two copies.
- The postal address at the bottom of every issue is a **virtual mailbox** (`MAIL_ADDRESS`
  secret). His home address must never be put on the site, in an email or in a file.
- Never print, display or ask for the admin token or any Resend key in chat.

**Still undecided:** Kelvin wants a one-line card text with more feeling than "This week in
plain English". Options offered: "The week in tech, for all of us in the Commons."
Update this line when he chooses.

## Threads (the Commons)

Threads are posted from the public site, not admin: `therarestheart.io/commons`, **Start a
thread**. Kelvin posts the same way anyone does.

- **Rooms (five is the ceiling):** Ask anything · Show your setup · Compliance corner ·
  Wins & warnings · Build along
- **Put a thread under a note:** publish the note first, open it on the site and tap
  **Start the conversation**. That carries the note into the form. A thread started from
  the Commons page directly is not attached. Only published notes can have threads. There
  is no unlink button: delete and repost.
- **Writing one:** a title that says the thing plainly, a short post in his voice, and one
  real question at the end that a beginner can answer (for example: "Does anybody else own
  one?"). Never talk down to anyone.
- **Replies** come back as sticky notes in a handwriting font; writers can pick a colour.
- Email on a thread is optional and never shown publicly.
- Gerdie's Monday question is written on the page, but nothing posts it automatically yet.

## Photos and files

Added in admin after saving a note, not typed into the body. Phone photos can be several
MB. Images are stored at their original size.

## Safety rules (learned the hard way)

- **The local preview (`localhost:8788`) holds Kelvin's real writing.** Never run a blanket
  delete on it. List rows first and delete only ones Claude made. Ask which site he
  published to (localhost or therarestheart.io) before assuming anything is live.
- Live changes, secrets, merges and sends need Kelvin's go-ahead.
- Commit only named files. Pull requests merge into `main`, and that deploys the site.
  Secrets only take effect on the next deployment (use **Retry deployment**).
- Work notes in the repo: `SOP.md` (how to run the site), `COMMONS.md` (how it is built).

---

## Log

Add one line each time Kelvin publishes, sends or changes something. Newest at the bottom.
Do not copy the note text here, only what happened.

| Date | What | Kind | Where |
| --- | --- | --- | --- |
| 2026-11-12 | Pi 5 note, "My Pi 5 lost its screen and my old iPad mini got a job" | Build log | Live |
| 2026-11-13 | "How I use AI to study for an exam" (Network+, prompt template) | Writing | Live |
| 2026-11-13 | Gerdie's Weekly: November 9, 2026, archive only, no email | Weekly | Live, dated Nov 9 |
| 2026-11-16 | Gerdie's Weekly: November 16, 2026 formatted at `/home/rarestheart/gerdies-weekly/2026-11-16-issue.txt`; send status not recorded | Weekly | Ask Kelvin |
