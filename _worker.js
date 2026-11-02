/**
 * The Rarest Heart — Worker
 *
 * Serves the static site and the Commons API. No framework, no build step,
 * matching the rest of the project.
 *
 *   GET    /api/rooms
 *   GET    /api/threads?room=ask
 *   POST   /api/threads
 *   GET    /api/threads/:id
 *   POST   /api/threads/:id/replies
 *   POST   /api/subscribe
 *   GET    /api/notes?kind=write
 *   GET    /api/notes/:slug
 *
 *   Media — the bytes live in R2, the index lives in D1:
 *   GET    /api/uploads                        what may be sent, and whether
 *   POST   /api/uploads?name=photo.jpg          one file, one request
 *   POST   /api/uploads/multipart?name=clip.mp4 big files, in parts (yours only)
 *   PUT    /api/uploads/multipart?key=&uploadId=&part=
 *   POST   /api/uploads/multipart/complete
 *   DELETE /api/uploads/multipart?key=&uploadId=
 *   GET    /api/files/:id/:filename             serves it, Range and all
 *
 *   Moderation — all require the X-Admin-Token header:
 *   GET    /api/admin/threads?room=&status=      includes hidden rows
 *   GET    /api/admin/subscribers?format=csv
 *   GET    /api/admin/notes            POST   /api/admin/notes
 *   PATCH  /api/admin/notes/:id         DELETE /api/admin/notes/:id
 *   PATCH  /api/admin/threads/:id                { status, new_here, title, body }
 *   DELETE /api/admin/threads/:id
 *   PATCH  /api/admin/replies/:id                { status, body }
 *   DELETE /api/admin/replies/:id
 *   GET    /api/admin/attachments?kind=thread&id=7
 *   PATCH  /api/admin/attachments/:id            { status, caption, sort }
 *   DELETE /api/admin/attachments/:id
 */

const ROOMS = [
  { id: 'ask',    label: 'Ask anything',      blurb: 'Questions you think are too basic. They are not.' },
  { id: 'setup',  label: 'Show your setup',   blurb: 'What you actually run, however unglamorous.' },
  { id: 'comply', label: 'Compliance corner', blurb: 'Audits, policies, and the paperwork nobody enjoys.' },
  { id: 'wins',   label: 'Wins & warnings',   blurb: 'What worked, and what went wrong so it does not go wrong twice.' },
  { id: 'build',  label: 'Build along',       blurb: 'Following the build logs, breaking the same things.' },
];

const ROOM_IDS = ROOMS.map((r) => r.id);

const NOTE_KINDS = ['write', 'build', 'find'];

const LIMITS = {
  noteTitle: 160,
  noteSummary: 400,
  noteBody: 60000,
  title: 140,
  body: 6000,
  author: 60,
  email: 140,
  postsPerHour: 6,
};

/* ── helpers ─────────────────────────────────────────────── */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

const fail = (status, message) => json({ error: message }, status);

const now = () => new Date().toISOString();

/** Trim, collapse newlines, and cap. Returns '' for anything unusable. */
function clean(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

function isEmail(value) {
  return value === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

/** Salted hash of the client IP. Used only for rate limiting; never stored raw. */
async function hashIp(request, salt) {
  const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
  const bytes = new TextEncoder().encode(ip + '|' + (salt || 'trh'));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * True when this poster is over the hourly cap.
 *
 * Uploads are counted separately from posts: attaching four photos must not
 * use up the allowance for the thread they are going on.
 */
async function overLimit(db, ipHash, cap) {
  const ceiling = cap || LIMITS.postsPerHour;
  const windowStart = now().slice(0, 13); // YYYY-MM-DDTHH
  const row = await db
    .prepare('SELECT count FROM rate_limit WHERE ip_hash = ? AND window_start = ?')
    .bind(ipHash, windowStart)
    .first();

  if (row && row.count >= ceiling) return true;

  await db
    .prepare(
      `INSERT INTO rate_limit (ip_hash, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT (ip_hash, window_start) DO UPDATE SET count = count + 1`
    )
    .bind(ipHash, windowStart)
    .run();

  return false;
}

/** Strip the columns the public should never see. */
const publicThread = (t) => ({
  id: t.id,
  room: t.room,
  title: t.title,
  body: t.body,
  author: t.author,
  newHere: !!t.new_here,
  status: t.status,
  replyCount: t.reply_count,
  createdAt: t.created_at,
  updatedAt: t.updated_at,
});

const publicReply = (r) => ({
  id: r.id,
  body: r.body,
  author: r.author,
  createdAt: r.created_at,
});

/* ── public handlers ─────────────────────────────────────── */

async function listThreads(db, url) {
  const room = url.searchParams.get('room') || 'all';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 100);

  if (room !== 'all' && !ROOM_IDS.includes(room)) return fail(400, 'Unknown room.');

  const where = room === 'all' ? "status != 'hidden'" : "room = ? AND status != 'hidden'";
  const stmt = db.prepare(
    `SELECT * FROM threads WHERE ${where}
     ORDER BY new_here DESC, updated_at DESC LIMIT ?`
  );

  const { results } = await (room === 'all' ? stmt.bind(limit) : stmt.bind(room, limit)).all();
  return json({ room, threads: results.map(publicThread) });
}

async function getThread(db, id) {
  const thread = await db.prepare('SELECT * FROM threads WHERE id = ?').bind(id).first();
  if (!thread || thread.status === 'hidden') return fail(404, 'No such thread.');

  const { results } = await db
    .prepare("SELECT * FROM replies WHERE thread_id = ? AND status = 'visible' ORDER BY created_at ASC")
    .bind(id)
    .all();

  const [own, byReply] = await Promise.all([
    attachmentsFor(db, 'thread', id),
    attachmentsForReplies(db, id),
  ]);

  return json({
    thread: Object.assign(publicThread(thread), { attachments: own.map(publicAttachment) }),
    replies: results.map((r) => Object.assign(publicReply(r), { attachments: byReply[r.id] || [] })),
  });
}

async function createThread(db, request, env) {
  let payload;
  try { payload = await request.json(); } catch (e) { return fail(400, 'Expected JSON.'); }

  // Honeypot: a real person never fills this in.
  if (clean(payload.website, 100)) return json({ ok: true, id: null });

  const room = String(payload.room || '');
  const title = clean(payload.title, LIMITS.title);
  const body = clean(payload.body, LIMITS.body);
  const author = clean(payload.author, LIMITS.author);
  const email = clean(payload.email, LIMITS.email);

  if (!ROOM_IDS.includes(room)) return fail(400, 'Pick a room.');
  if (title.length < 8) return fail(400, 'Give it a title of at least 8 characters.');
  if (body.length < 15) return fail(400, 'Say a little more than that.');
  if (!author) return fail(400, 'What should people call you?');
  if (!isEmail(email)) return fail(400, 'That email address does not look right.');

  const ipHash = await hashIp(request, env.IP_SALT);
  if (await overLimit(db, ipHash)) return fail(429, 'That is a lot of posting in one hour. Try again later.');

  const stamp = now();
  const res = await db
    .prepare(
      `INSERT INTO threads (room, title, body, author, email, new_here, status, reply_count, created_at, updated_at, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?, 'open', 0, ?, ?, ?)`
    )
    .bind(room, title, body, author, email || null, payload.newHere ? 1 : 0, stamp, stamp, ipHash)
    .run();

  const id = res.meta.last_row_id;
  await claimAttachments(db, payload, 'thread', id, authorised(request, env));

  return json({ ok: true, id }, 201);
}

async function createReply(db, request, env, threadId) {
  let payload;
  try { payload = await request.json(); } catch (e) { return fail(400, 'Expected JSON.'); }

  if (clean(payload.website, 100)) return json({ ok: true, id: null });

  const body = clean(payload.body, LIMITS.body);
  const author = clean(payload.author, LIMITS.author);
  const email = clean(payload.email, LIMITS.email);

  if (body.length < 2) return fail(400, 'Write something first.');
  if (!author) return fail(400, 'What should people call you?');
  if (!isEmail(email)) return fail(400, 'That email address does not look right.');

  const thread = await db.prepare('SELECT id, status FROM threads WHERE id = ?').bind(threadId).first();
  if (!thread || thread.status === 'hidden') return fail(404, 'No such thread.');

  const ipHash = await hashIp(request, env.IP_SALT);
  if (await overLimit(db, ipHash)) return fail(429, 'That is a lot of posting in one hour. Try again later.');

  const stamp = now();
  const res = await db
    .prepare(
      `INSERT INTO replies (thread_id, body, author, email, status, created_at, ip_hash)
       VALUES (?, ?, ?, ?, 'visible', ?, ?)`
    )
    .bind(threadId, body, author, email || null, stamp, ipHash)
    .run();

  await claimAttachments(db, payload, 'reply', res.meta.last_row_id, authorised(request, env));

  await db
    .prepare('UPDATE threads SET reply_count = reply_count + 1, updated_at = ? WHERE id = ?')
    .bind(stamp, threadId)
    .run();

  return json({ ok: true, id: res.meta.last_row_id }, 201);
}

async function subscribe(db, request, env) {
  let payload;
  try { payload = await request.json(); } catch (e) { return fail(400, 'Expected JSON.'); }

  if (clean(payload.website, 100)) return json({ ok: true });

  const email = clean(payload.email, LIMITS.email).toLowerCase();
  const name = clean(payload.name, LIMITS.author);
  const source = clean(payload.source, 40) || 'footer';

  if (!email) return fail(400, 'An email address, and that is all.');
  if (!isEmail(email)) return fail(400, 'That email address does not look right.');

  const ipHash = await hashIp(request, env.IP_SALT);
  if (await overLimit(db, ipHash)) return fail(429, 'Try again in a little while.');

  // Signing up twice is not an error worth showing anyone.
  await db
    .prepare(
      `INSERT INTO subscribers (email, name, source, status, created_at, ip_hash)
       VALUES (?, ?, ?, 'active', ?, ?)
       ON CONFLICT (email) DO UPDATE SET
         name = COALESCE(NULLIF(excluded.name, ''), subscribers.name),
         status = 'active'`
    )
    .bind(email, name || null, source, now(), ipHash)
    .run();

  return json({ ok: true }, 201);
}

/* ── field notes ─────────────────────────────────────────── */

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'note';
}

/** Rough but honest: average reading runs about 220 words a minute. */
function readMinutes(body) {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

async function uniqueSlug(db, base, ignoreId) {
  let slug = base;
  for (let n = 2; n < 60; n += 1) {
    const row = await db.prepare('SELECT id FROM notes WHERE slug = ?').bind(slug).first();
    if (!row || (ignoreId && row.id === ignoreId)) return slug;
    slug = base + '-' + n;
  }
  return base + '-' + Date.now();
}

const publicNote = (n) => ({
  id: n.id,
  slug: n.slug,
  kind: n.kind,
  title: n.title,
  summary: n.summary,
  body: n.body,
  buildState: n.build_state || '',
  readMinutes: n.read_minutes,
  publishedAt: n.published_at,
  updatedAt: n.updated_at,
});

const noteCard = (n) => {
  const card = publicNote(n);
  delete card.body;
  return card;
};

async function listNotes(db, url) {
  const kind = url.searchParams.get('kind') || 'all';
  if (kind !== 'all' && !NOTE_KINDS.includes(kind)) return fail(400, 'Unknown kind.');

  const where = kind === 'all' ? "status = 'published'" : "status = 'published' AND kind = ?";
  const stmt = db.prepare(`SELECT * FROM notes WHERE ${where} ORDER BY published_at DESC LIMIT 100`);

  const { results } = await (kind === 'all' ? stmt : stmt.bind(kind)).all();
  return json({ kind, notes: results.map(noteCard) });
}

async function getNote(db, slug) {
  const note = await db.prepare('SELECT * FROM notes WHERE slug = ?').bind(slug).first();
  if (!note || note.status !== 'published') return fail(404, 'No such note.');

  const files = await attachmentsFor(db, 'note', note.id);
  return json({ note: Object.assign(publicNote(note), { attachments: files.map(publicAttachment) }) });
}

/**
 * A draft is unfinished by definition — that is what the button is for. Only
 * the rules a draft genuinely needs apply to one: a kind, and a title, since
 * the web address is built from it. The body minimum is a publishing rule and
 * is checked only when something is actually going public.
 */
function readNoteFields(payload, status) {
  const kind = String(payload.kind || '');
  const title = clean(payload.title, LIMITS.noteTitle);
  const summary = clean(payload.summary, LIMITS.noteSummary);
  const body = clean(payload.body, LIMITS.noteBody);
  const buildState = clean(payload.buildState, 40);

  if (!NOTE_KINDS.includes(kind)) return { error: 'Pick writing, build log or research.' };
  if (title.length < 6) return { error: 'Give it a title of at least 6 characters.' };
  if (status === 'published' && body.length < 40) {
    return { error: 'The body is too short to publish. Save it as a draft instead.' };
  }

  return { kind, title, summary, body, buildState };
}

/** 'published' only when asked for explicitly; everything else is a draft. */
function intendedStatus(payload) {
  return payload.status === 'published' ? 'published' : 'draft';
}

async function adminListNotes(db) {
  const { results } = await db.prepare('SELECT * FROM notes ORDER BY updated_at DESC LIMIT 200').all();
  return json({ notes: results.map((n) => Object.assign(publicNote(n), { status: n.status })) });
}

async function adminCreateNote(db, request) {
  let payload;
  try { payload = await request.json(); } catch (e) { return fail(400, 'Expected JSON.'); }

  const status = intendedStatus(payload);
  const f = readNoteFields(payload, status);
  if (f.error) return fail(400, f.error);

  const stamp = now();
  const slug = await uniqueSlug(db, slugify(f.title));

  const res = await db
    .prepare(
      `INSERT INTO notes (slug, kind, title, summary, body, status, build_state, read_minutes, created_at, updated_at, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(slug, f.kind, f.title, f.summary, f.body, status, f.buildState || null,
          readMinutes(f.body), stamp, stamp, status === 'published' ? stamp : null)
    .run();

  const id = res.meta.last_row_id;
  await claimAttachments(db, payload, 'note', id, true);

  return json({ ok: true, id, slug }, 201);
}

async function adminPatchNote(db, request, id) {
  let payload;
  try { payload = await request.json(); } catch (e) { return fail(400, 'Expected JSON.'); }

  const existing = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first();
  if (!existing) return fail(404, 'No such note.');

  // A status-only toggle should not have to resend the whole note.
  if (Object.keys(payload).length === 1 && typeof payload.status === 'string') {
    const status = payload.status === 'published' ? 'published' : 'draft';
    const stamp = now();
    await db
      .prepare('UPDATE notes SET status = ?, updated_at = ?, published_at = COALESCE(published_at, ?) WHERE id = ?')
      .bind(status, stamp, status === 'published' ? stamp : null, id)
      .run();
    return json({ ok: true, slug: existing.slug });
  }

  const status = intendedStatus(payload);
  const f = readNoteFields(payload, status);
  if (f.error) return fail(400, f.error);

  const stamp = now();
  const slug = f.title === existing.title ? existing.slug : await uniqueSlug(db, slugify(f.title), id);

  await db
    .prepare(
      `UPDATE notes SET slug = ?, kind = ?, title = ?, summary = ?, body = ?, status = ?,
              build_state = ?, read_minutes = ?, updated_at = ?, published_at = COALESCE(published_at, ?)
       WHERE id = ?`
    )
    .bind(slug, f.kind, f.title, f.summary, f.body, status, f.buildState || null,
          readMinutes(f.body), stamp, status === 'published' ? stamp : null, id)
    .run();

  await claimAttachments(db, payload, 'note', id, true);

  return json({ ok: true, slug });
}

async function adminDeleteNote(db, env, id) {
  const res = await db.prepare('DELETE FROM notes WHERE id = ?').bind(id).run();
  if (!res.meta.changes) return fail(404, 'No such note.');

  await purgeAttachments(db, env.MEDIA, 'note', id);
  return json({ ok: true });
}

/* ── moderation ──────────────────────────────────────────── */

function authorised(request, env) {
  const token = request.headers.get('x-admin-token') || '';
  return Boolean(env.ADMIN_TOKEN) && token === env.ADMIN_TOKEN;
}

async function adminListThreads(db, url) {
  const room = url.searchParams.get('room') || 'all';
  const stmt = room === 'all'
    ? db.prepare('SELECT * FROM threads ORDER BY updated_at DESC LIMIT 200')
    : db.prepare('SELECT * FROM threads WHERE room = ? ORDER BY updated_at DESC LIMIT 200').bind(room);

  const { results } = await stmt.all();
  return json({
    threads: results.map((t) => Object.assign(publicThread(t), { email: t.email, hidden: t.status === 'hidden' })),
  });
}

async function adminPatchThread(db, request, id) {
  let payload;
  try { payload = await request.json(); } catch (e) { return fail(400, 'Expected JSON.'); }

  const sets = [];
  const binds = [];

  if (typeof payload.status === 'string' && ['open', 'answered', 'hidden'].includes(payload.status)) {
    sets.push('status = ?'); binds.push(payload.status);
  }
  if (typeof payload.newHere === 'boolean') { sets.push('new_here = ?'); binds.push(payload.newHere ? 1 : 0); }
  if (typeof payload.title === 'string') {
    const t = clean(payload.title, LIMITS.title);
    if (t.length < 8) return fail(400, 'Title is too short.');
    sets.push('title = ?'); binds.push(t);
  }
  if (typeof payload.body === 'string') {
    const b = clean(payload.body, LIMITS.body);
    if (b.length < 15) return fail(400, 'Body is too short.');
    sets.push('body = ?'); binds.push(b);
  }

  if (!sets.length) return fail(400, 'Nothing to change.');

  sets.push('updated_at = ?'); binds.push(now());
  binds.push(id);

  const res = await db.prepare(`UPDATE threads SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  if (!res.meta.changes) return fail(404, 'No such thread.');
  return json({ ok: true });
}

async function adminDeleteThread(db, env, id) {
  // Collect the media before the rows it hangs off are gone.
  await purgeThreadAttachments(db, env.MEDIA, id);

  await db.prepare('DELETE FROM replies WHERE thread_id = ?').bind(id).run();
  const res = await db.prepare('DELETE FROM threads WHERE id = ?').bind(id).run();
  if (!res.meta.changes) return fail(404, 'No such thread.');
  return json({ ok: true });
}

async function adminPatchReply(db, request, id) {
  let payload;
  try { payload = await request.json(); } catch (e) { return fail(400, 'Expected JSON.'); }

  const existing = await db.prepare('SELECT thread_id, status FROM replies WHERE id = ?').bind(id).first();
  if (!existing) return fail(404, 'No such reply.');

  const sets = [];
  const binds = [];
  let countDelta = 0;

  if (typeof payload.status === 'string' && ['visible', 'hidden'].includes(payload.status)) {
    sets.push('status = ?'); binds.push(payload.status);
    // The count on the card should match what a reader can actually see.
    if (payload.status !== existing.status) {
      countDelta = payload.status === 'hidden' ? -1 : 1;
    }
  }
  if (typeof payload.body === 'string') {
    const b = clean(payload.body, LIMITS.body);
    if (b.length < 2) return fail(400, 'Body is empty.');
    sets.push('body = ?'); binds.push(b);
  }

  if (!sets.length) return fail(400, 'Nothing to change.');
  binds.push(id);

  const res = await db.prepare(`UPDATE replies SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  if (!res.meta.changes) return fail(404, 'No such reply.');

  if (countDelta !== 0) {
    await db
      .prepare('UPDATE threads SET reply_count = MAX(reply_count + ?, 0) WHERE id = ?')
      .bind(countDelta, existing.thread_id)
      .run();
  }

  return json({ ok: true });
}

async function adminDeleteReply(db, env, id) {
  const reply = await db.prepare('SELECT thread_id, status FROM replies WHERE id = ?').bind(id).first();
  if (!reply) return fail(404, 'No such reply.');

  await purgeAttachments(db, env.MEDIA, 'reply', id);
  await db.prepare('DELETE FROM replies WHERE id = ?').bind(id).run();

  // A hidden reply was already taken off the count when it was hidden.
  if (reply.status !== 'hidden') {
    await db
      .prepare('UPDATE threads SET reply_count = MAX(reply_count - 1, 0) WHERE id = ?')
      .bind(reply.thread_id)
      .run();
  }

  return json({ ok: true });
}

async function adminListSubscribers(db, url) {
  if (url.searchParams.get('format') === 'csv') {
    const { results } = await db
      .prepare("SELECT name, email, source, created_at FROM subscribers WHERE status = 'active' ORDER BY created_at")
      .all();

    const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = [['name', 'email', 'source', 'joined'].join(',')]
      .concat(results.map((r) => [r.name, r.email, r.source, r.created_at].map(esc).join(',')));

    return new Response(rows.join('\n'), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="commons-subscribers.csv"',
        'cache-control': 'no-store',
      },
    });
  }

  const { results } = await db
    .prepare("SELECT id, name, email, source, created_at FROM subscribers WHERE status = 'active' ORDER BY created_at DESC LIMIT 500")
    .all();

  return json({ subscribers: results, count: results.length });
}

/* ── attachments ─────────────────────────────────────────── */

/**
 * The only file types this site will store or serve. The browser's own
 * content-type is never trusted; the extension decides, and these values are
 * what we send back. SVG and anything executable are deliberately absent —
 * they would run as code on our own origin.
 */
const MEDIA_TYPES = {
  jpg:  ['image/jpeg', 'image'],
  jpeg: ['image/jpeg', 'image'],
  png:  ['image/png', 'image'],
  gif:  ['image/gif', 'image'],
  webp: ['image/webp', 'image'],
  avif: ['image/avif', 'image'],
  heic: ['image/heic', 'image'],
  mp4:  ['video/mp4', 'video'],
  m4v:  ['video/mp4', 'video'],
  webm: ['video/webm', 'video'],
  mov:  ['video/quicktime', 'video'],
  mp3:  ['audio/mpeg', 'audio'],
  m4a:  ['audio/mp4', 'audio'],
  wav:  ['audio/wav', 'audio'],
  pdf:  ['application/pdf', 'doc'],
  doc:  ['application/msword', 'doc'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'doc'],
  xls:  ['application/vnd.ms-excel', 'doc'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'doc'],
  ppt:  ['application/vnd.ms-powerpoint', 'doc'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'doc'],
  csv:  ['text/csv', 'doc'],
  txt:  ['text/plain', 'doc'],
  md:   ['text/markdown', 'doc'],
};

const UPLOADS = {
  // What a visitor to the Commons may attach. Video is left off on purpose:
  // anonymous video costs storage and invites what nobody wants to moderate.
  // Widen this list when the room is worth the risk.
  publicMedia: ['image', 'doc'],
  publicMaxBytes: 15 * 1024 * 1024,
  publicPerPost: 4,
  // Counted apart from posts, and set high enough that four photos on each of
  // six posts never trips it.
  publicPerHour: 30,
  // Yours. 95 MB is the ceiling Cloudflare puts on a single request body;
  // bigger files go up in parts instead, which has no practical ceiling.
  adminMaxBytes: 95 * 1024 * 1024,
  adminPerPost: 16,
  partBytes: 32 * 1024 * 1024,
  caption: 300,
  // Unclaimed uploads are swept after this long. Someone who starts a post,
  // attaches a photo and wanders off should not leave bytes behind forever.
  orphanHours: 24,
};

const OWNER_KINDS = ['note', 'thread', 'reply'];

function extensionOf(filename) {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(filename || '');
  return m ? m[1].toLowerCase() : '';
}

/** Keep the name readable, keep it safe to put in a URL or a download header. */
function safeFilename(filename) {
  const name = String(filename || '')
    .replace(/[\\/]/g, '-')
    .replace(/[\u0000-\u001f\u007f"]/g, '')
    .trim()
    .slice(0, 120);
  return name || 'file';
}

function publicAttachment(a) {
  return {
    id: a.id,
    media: a.media,
    filename: a.filename,
    contentType: a.content_type,
    bytes: a.bytes,
    caption: a.caption || '',
    url: '/api/files/' + a.id + '/' + encodeURIComponent(a.filename),
  };
}

/**
 * The attachments table is created by schema.sql, which is applied by hand and
 * so can lag a deploy. Every read of it goes through here: a note or a thread
 * has to keep rendering whether or not the table has landed yet, because the
 * alternative is a 500 on writing that has nothing to do with attachments.
 * Anything other than a missing table is a real fault and is rethrown.
 */
async function readAttachments(db, sql, binds) {
  try {
    const { results } = await db.prepare(sql).bind(...binds).all();
    return results;
  } catch (err) {
    const message = (err && err.message) || '';
    if (/no such table/i.test(message)) {
      console.error('attachments table is not there yet — run schema.sql');
      return [];
    }
    throw err;
  }
}

/** Attachments for one post, in the order they were arranged. */
async function attachmentsFor(db, kind, id, includeHidden) {
  const where = includeHidden ? '' : " AND status = 'visible'";
  return readAttachments(
    db,
    `SELECT * FROM attachments WHERE owner_kind = ? AND owner_id = ?${where}
     ORDER BY sort ASC, id ASC`,
    [kind, id]
  );
}

/** The same, for every reply in a thread, as a map of reply id to list. */
async function attachmentsForReplies(db, threadId) {
  const results = await readAttachments(
    db,
    `SELECT a.* FROM attachments a
     JOIN replies r ON r.id = a.owner_id
     WHERE a.owner_kind = 'reply' AND a.status = 'visible' AND r.thread_id = ?
     ORDER BY a.sort ASC, a.id ASC`,
    [threadId]
  );

  const byReply = {};
  results.forEach((a) => {
    (byReply[a.owner_id] = byReply[a.owner_id] || []).push(publicAttachment(a));
  });
  return byReply;
}

/**
 * Hand the uploads this poster just made to the post they belong to. Only
 * rows still unclaimed and carrying the same session id can be taken, so one
 * person's upload can never be hung off another person's post.
 */
async function claimAttachments(db, payload, kind, ownerId, isAdmin) {
  const ids = Array.isArray(payload.attachments) ? payload.attachments : [];
  const session = clean(payload.uploadSession, 80);
  if (!ids.length || !session) return 0;

  const max = isAdmin ? UPLOADS.adminPerPost : UPLOADS.publicPerPost;
  const wanted = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, max);
  if (!wanted.length) return 0;

  const holes = wanted.map(() => '?').join(',');
  const { results } = await db
    .prepare(
      `SELECT id, media FROM attachments
       WHERE id IN (${holes}) AND session_id = ? AND owner_kind = 'orphan'`
    )
    .bind(...wanted, session)
    .all();

  const allowed = new Set(
    results
      .filter((a) => isAdmin || UPLOADS.publicMedia.includes(a.media))
      .map((a) => a.id)
  );

  // Keep the order the poster arranged them in, not the order they uploaded.
  const ordered = wanted.filter((id) => allowed.has(id));
  if (!ordered.length) return 0;

  // Carry on from the files already on this post rather than starting at zero
  // again. Editing a note to add a second batch used to number them 0,1,2…
  // on top of the first batch's 0,1,2…, and two files sharing a sort are put
  // in whatever order their ids happen to fall in.
  const last = await db
    .prepare('SELECT MAX(sort) AS top FROM attachments WHERE owner_kind = ? AND owner_id = ?')
    .bind(kind, ownerId)
    .first();
  const base = last && Number.isInteger(last.top) ? last.top + 1 : 0;

  // Captions ride along with the post, so they are saved in the same breath
  // and a visitor with no admin token can still caption a photo.
  const captions = {};
  (Array.isArray(payload.captions) ? payload.captions : []).forEach((c) => {
    if (c && Number.isInteger(Number(c.id))) {
      captions[Number(c.id)] = clean(c.caption, UPLOADS.caption);
    }
  });

  await db.batch(
    ordered.map((id, i) =>
      db
        .prepare(
          `UPDATE attachments SET owner_kind = ?, owner_id = ?, sort = ?, caption = ?
           WHERE id = ? AND session_id = ? AND owner_kind = 'orphan'`
        )
        .bind(kind, ownerId, base + i, captions[id] || '', id, session)
    )
  );

  return ordered.length;
}

/** Drop the rows and the bytes together. Used when a post is deleted. */
async function purgeAttachments(db, bucket, kind, ownerId) {
  const rows = await attachmentsFor(db, kind, ownerId, true);
  if (!rows.length) return;

  if (bucket) {
    try {
      await bucket.delete(rows.map((r) => r.r2_key));
    } catch (err) {
      // A missing object must not block the delete the moderator asked for.
      console.error('r2 delete failed', err && err.message);
    }
  }

  await db
    .prepare('DELETE FROM attachments WHERE owner_kind = ? AND owner_id = ?')
    .bind(kind, ownerId)
    .run();
}

/** Every reply's attachments in one go, before the replies themselves go. */
async function purgeThreadAttachments(db, bucket, threadId) {
  const results = await readAttachments(
    db,
    `SELECT a.id, a.r2_key FROM attachments a
     JOIN replies r ON r.id = a.owner_id
     WHERE a.owner_kind = 'reply' AND r.thread_id = ?`,
    [threadId]
  );

  if (results.length) {
    if (bucket) {
      try { await bucket.delete(results.map((r) => r.r2_key)); }
      catch (err) { console.error('r2 delete failed', err && err.message); }
    }
    await db
      .prepare(`DELETE FROM attachments WHERE id IN (${results.map(() => '?').join(',')})`)
      .bind(...results.map((r) => r.id))
      .run();
  }

  await purgeAttachments(db, bucket, 'thread', threadId);
}

/**
 * Sweep uploads nobody ever attached to anything. Cheap enough to run on every
 * upload, and it has to be awaited: a promise left dangling after the response
 * is returned gets cancelled, so a fire-and-forget sweep never ran at all.
 */
async function sweepOrphans(db, bucket) {
  const cutoff = new Date(Date.now() - UPLOADS.orphanHours * 3600 * 1000).toISOString();
  const { results } = await db
    .prepare("SELECT id, r2_key FROM attachments WHERE owner_kind = 'orphan' AND created_at < ? LIMIT 100")
    .bind(cutoff)
    .all();

  if (!results.length) return;

  if (bucket) {
    try { await bucket.delete(results.map((r) => r.r2_key)); }
    catch (err) { console.error('r2 sweep failed', err && err.message); }
  }

  await db
    .prepare(`DELETE FROM attachments WHERE id IN (${results.map(() => '?').join(',')})`)
    .bind(...results.map((r) => r.id))
    .run();
}

/** What an upload request is asking for, or why we are turning it down. */
function readUploadIntent(url, request, isAdmin) {
  const bucketMissing = 'File storage is not connected yet.';
  const filename = safeFilename(url.searchParams.get('name'));
  const ext = extensionOf(filename);
  const type = MEDIA_TYPES[ext];

  if (!type) {
    return { error: ext
      ? '.' + ext + ' files are not accepted. Images, video, audio, PDFs and Office documents are.'
      : 'That file has no extension, so there is no telling what it is.' };
  }

  const [contentType, media] = type;
  if (!isAdmin && !UPLOADS.publicMedia.includes(media)) {
    return { error: media === 'video'
      ? 'Video cannot be posted to the Commons. An image or a document can.'
      : 'That kind of file cannot be posted here.' };
  }

  const session = clean(request.headers.get('x-upload-session'), 80);
  if (session.length < 8) return { error: 'This upload is missing its session. Reload the page and try again.' };

  return { filename, ext, contentType, media, session, bucketMissing };
}

function uploadKey(session, ext) {
  return 'up/' + session.replace(/[^A-Za-z0-9-]/g, '').slice(0, 40) + '/' +
    crypto.randomUUID() + '.' + ext;
}

/**
 * What the upload box needs to know before it draws itself: whether there is
 * anywhere to put a file at all, and what this visitor is allowed to send.
 * Without this the button would sit there live but dead until R2 is switched
 * on in the dashboard.
 */
function uploadLimits(env, request) {
  const isAdmin = authorised(request, env);
  return json({
    enabled: Boolean(env.MEDIA),
    admin: isAdmin,
    media: isAdmin ? ['image', 'video', 'audio', 'doc'] : UPLOADS.publicMedia,
    maxBytes: isAdmin ? UPLOADS.adminMaxBytes : UPLOADS.publicMaxBytes,
    perPost: isAdmin ? UPLOADS.adminPerPost : UPLOADS.publicPerPost,
    parts: isAdmin,
  });
}

/** One request, one file. Everything a phone camera photo needs. */
async function putUpload(db, env, request, url) {
  const bucket = env.MEDIA;
  if (!bucket) return fail(503, 'File storage is not connected yet.');

  const isAdmin = authorised(request, env);
  const intent = readUploadIntent(url, request, isAdmin);
  if (intent.error) return fail(400, intent.error);

  const declared = Number(request.headers.get('content-length') || 0);
  const cap = isAdmin ? UPLOADS.adminMaxBytes : UPLOADS.publicMaxBytes;

  if (!declared) return fail(411, 'That upload did not say how big it is.');
  if (declared > cap) {
    return fail(413, isAdmin
      ? 'Over ' + mb(cap) + ' has to go up in parts. The upload box does that for you.'
      : 'That file is ' + mb(declared) + '. The limit here is ' + mb(cap) + '.');
  }

  const ipHash = await hashIp(request, env.IP_SALT);
  if (!isAdmin && (await overLimit(db, 'up:' + ipHash, UPLOADS.publicPerHour))) {
    return fail(429, 'That is a lot of uploading in one hour. Try again later.');
  }

  const key = uploadKey(intent.session, intent.ext);
  await bucket.put(key, request.body, {
    httpMetadata: { contentType: intent.contentType },
  });

  const row = await insertAttachment(db, {
    key,
    session: intent.session,
    filename: intent.filename,
    contentType: intent.contentType,
    media: intent.media,
    bytes: declared,
    ipHash,
  });

  try { await sweepOrphans(db, bucket); }
  catch (err) { console.error('sweep failed', err && err.message); }

  return json({ ok: true, attachment: publicAttachment(row) }, 201);
}

async function insertAttachment(db, f) {
  const res = await db
    .prepare(
      `INSERT INTO attachments
         (r2_key, owner_kind, session_id, filename, content_type, media, bytes, created_at, ip_hash)
       VALUES (?, 'orphan', ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(f.key, f.session, f.filename, f.contentType, f.media, f.bytes, now(), f.ipHash)
    .run();

  return {
    id: res.meta.last_row_id,
    media: f.media,
    filename: f.filename,
    content_type: f.contentType,
    bytes: f.bytes,
    caption: '',
  };
}

const mb = (bytes) => Math.round(bytes / (1024 * 1024)) + ' MB';

/* Big files, in parts. Yours only — a visitor has no need of it. */

async function startMultipart(db, env, request, url) {
  const bucket = env.MEDIA;
  if (!bucket) return fail(503, 'File storage is not connected yet.');

  const intent = readUploadIntent(url, request, true);
  if (intent.error) return fail(400, intent.error);

  const key = uploadKey(intent.session, intent.ext);
  const upload = await bucket.createMultipartUpload(key, {
    httpMetadata: { contentType: intent.contentType },
  });

  return json({ ok: true, key, uploadId: upload.uploadId, partBytes: UPLOADS.partBytes });
}

async function putPart(env, request, url) {
  const bucket = env.MEDIA;
  if (!bucket) return fail(503, 'File storage is not connected yet.');

  const key = url.searchParams.get('key') || '';
  const uploadId = url.searchParams.get('uploadId') || '';
  const part = Number(url.searchParams.get('part') || 0);
  const session = clean(request.headers.get('x-upload-session'), 80);

  if (!key.startsWith('up/' + session.replace(/[^A-Za-z0-9-]/g, '').slice(0, 40) + '/')) {
    return fail(403, 'That upload belongs to another session.');
  }
  if (!uploadId || !Number.isInteger(part) || part < 1 || part > 10000) {
    return fail(400, 'That part number makes no sense.');
  }

  const upload = bucket.resumeMultipartUpload(key, uploadId);
  const uploaded = await upload.uploadPart(part, request.body);
  return json({ ok: true, partNumber: uploaded.partNumber, etag: uploaded.etag });
}

async function finishMultipart(db, env, request) {
  const bucket = env.MEDIA;
  if (!bucket) return fail(503, 'File storage is not connected yet.');

  let payload;
  try { payload = await request.json(); } catch (e) { return fail(400, 'Expected JSON.'); }

  const key = String(payload.key || '');
  const uploadId = String(payload.uploadId || '');
  const session = clean(request.headers.get('x-upload-session'), 80);
  const filename = safeFilename(payload.name);
  const ext = extensionOf(filename);
  const type = MEDIA_TYPES[ext];
  const parts = Array.isArray(payload.parts) ? payload.parts : [];

  if (!type) return fail(400, 'That file type is not accepted.');
  if (!key.startsWith('up/' + session.replace(/[^A-Za-z0-9-]/g, '').slice(0, 40) + '/')) {
    return fail(403, 'That upload belongs to another session.');
  }
  if (!uploadId || !parts.length) return fail(400, 'There is nothing to finish.');

  const upload = bucket.resumeMultipartUpload(key, uploadId);
  const object = await upload.complete(
    parts.map((p) => ({ partNumber: Number(p.partNumber), etag: String(p.etag) }))
  );

  const row = await insertAttachment(db, {
    key,
    session,
    filename,
    contentType: type[0],
    media: type[1],
    bytes: object.size,
    ipHash: await hashIp(request, env.IP_SALT),
  });

  try { await sweepOrphans(db, bucket); }
  catch (err) { console.error('sweep failed', err && err.message); }

  return json({ ok: true, attachment: publicAttachment(row) }, 201);
}

async function abortMultipart(env, request, url) {
  const bucket = env.MEDIA;
  if (!bucket) return fail(503, 'File storage is not connected yet.');

  const key = url.searchParams.get('key') || '';
  const uploadId = url.searchParams.get('uploadId') || '';
  const session = clean(request.headers.get('x-upload-session'), 80);

  if (!key.startsWith('up/' + session.replace(/[^A-Za-z0-9-]/g, '').slice(0, 40) + '/')) {
    return fail(403, 'That upload belongs to another session.');
  }

  try { await bucket.resumeMultipartUpload(key, uploadId).abort(); }
  catch (err) { /* already gone is the outcome we wanted */ }

  return json({ ok: true });
}

/* Serving the bytes back out. */

/** A hidden post must take its media with it, or the URLs stay live. */
async function attachmentIsPublic(db, row) {
  if (row.status !== 'visible') return false;

  if (row.owner_kind === 'note') {
    const n = await db.prepare('SELECT status FROM notes WHERE id = ?').bind(row.owner_id).first();
    return !!n && n.status === 'published';
  }
  if (row.owner_kind === 'thread') {
    const t = await db.prepare('SELECT status FROM threads WHERE id = ?').bind(row.owner_id).first();
    return !!t && t.status !== 'hidden';
  }
  if (row.owner_kind === 'reply') {
    const r = await db
      .prepare(
        `SELECT r.status AS rs, t.status AS ts FROM replies r
         JOIN threads t ON t.id = r.thread_id WHERE r.id = ?`
      )
      .bind(row.owner_id)
      .first();
    return !!r && r.rs === 'visible' && r.ts !== 'hidden';
  }

  // An orphan is a draft. Only you can see it, and only until the sweep.
  return false;
}

/**
 * A draft's files are not public, and serveFile lets you past that on the
 * X-Admin-Token header — but a "View" link is a plain navigation and cannot
 * send a header, so clicking it on your own unpublished note returned 404.
 *
 * The admin file list therefore hands out a short-lived signed link instead.
 * The signature is an HMAC over the attachment id and the expiry, keyed on
 * the admin token, so it cannot be forged, cannot be moved to another file,
 * stops working after two hours, and never puts the token itself in a URL.
 * It stays an ordinary URL, which matters for video: the browser can still
 * make Range requests against it, so seeking works.
 */
const PREVIEW_TTL_MS = 2 * 60 * 60 * 1000;

async function previewSignature(secret, id, exp) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(id + '.' + exp));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function previewKey(env, id) {
  if (!env.ADMIN_TOKEN) return '';
  const exp = Date.now() + PREVIEW_TTL_MS;
  return exp + '.' + (await previewSignature(env.ADMIN_TOKEN, id, exp));
}

/** Same length every time, so comparing them leaks nothing about the secret. */
function sameString(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function validPreviewKey(env, request, id) {
  if (!env.ADMIN_TOKEN) return false;
  const given = new URL(request.url).searchParams.get('k') || '';
  const cut = given.indexOf('.');
  if (cut < 1) return false;

  const exp = Number(given.slice(0, cut));
  if (!Number.isFinite(exp) || exp < Date.now()) return false;

  return sameString(given.slice(cut + 1), await previewSignature(env.ADMIN_TOKEN, id, exp));
}

async function serveFile(db, env, request, id) {
  const bucket = env.MEDIA;
  if (!bucket) return fail(503, 'File storage is not connected yet.');

  const row = await db.prepare('SELECT * FROM attachments WHERE id = ?').bind(id).first();
  if (!row) return fail(404, 'No such file.');

  const maySee = (await attachmentIsPublic(db, row))
    || authorised(request, env)
    || (await validPreviewKey(env, request, id));
  if (!maySee) return fail(404, 'No such file.');

  const headers = new Headers({
    'content-type': row.content_type,
    'cache-control': 'public, max-age=31536000, immutable',
    'accept-ranges': 'bytes',
    'x-content-type-options': 'nosniff',
    // Images, video and audio play in the page. Everything else downloads,
    // which is also what keeps a document from rendering on our own origin.
    'content-disposition':
      (row.media === 'doc' ? 'attachment' : 'inline') +
      "; filename*=UTF-8''" + encodeURIComponent(row.filename),
  });

  if (request.method === 'HEAD') {
    const head = await bucket.head(row.r2_key);
    if (!head) return fail(404, 'No such file.');
    headers.set('content-length', String(head.size));
    headers.set('etag', head.httpEtag);
    return new Response(null, { headers });
  }

  // R2 reads the Range header itself, which is what lets a video seek.
  const object = await bucket.get(row.r2_key, {
    range: request.headers,
    onlyIf: request.headers,
  });

  if (!object) return fail(404, 'No such file.');
  headers.set('etag', object.httpEtag);

  if (!('body' in object)) return new Response(null, { status: 304, headers });

  if (object.range && (object.range.offset || object.range.length !== object.size)) {
    const start = object.range.offset || 0;
    const length = object.range.length === undefined ? object.size - start : object.range.length;
    headers.set('content-range', 'bytes ' + start + '-' + (start + length - 1) + '/' + object.size);
    headers.set('content-length', String(length));
    return new Response(object.body, { status: 206, headers });
  }

  headers.set('content-length', String(object.size));
  return new Response(object.body, { headers });
}

/* Moderating one file at a time, same as a reply. */

async function adminListAttachments(db, env, url) {
  const kind = url.searchParams.get('kind') || '';
  const ownerId = Number(url.searchParams.get('id') || 0);
  if (!OWNER_KINDS.includes(kind) || !ownerId) return fail(400, 'Which post?');

  const rows = await attachmentsFor(db, kind, ownerId, true);
  const attachments = await Promise.all(rows.map(async (a) => {
    const key = await previewKey(env, a.id);
    return Object.assign(publicAttachment(a), {
      status: a.status,
      // Opens a draft's or a hidden file in the browser, where the header
      // a fetch would send cannot follow.
      previewUrl: key ? '/api/files/' + a.id + '/' + encodeURIComponent(a.filename) + '?k=' + key : null,
    });
  }));
  return json({ attachments });
}

async function adminPatchAttachment(db, request, id) {
  let payload;
  try { payload = await request.json(); } catch (e) { return fail(400, 'Expected JSON.'); }

  const sets = [];
  const binds = [];

  if (typeof payload.status === 'string' && ['visible', 'hidden'].includes(payload.status)) {
    sets.push('status = ?');
    binds.push(payload.status);
  }
  if (typeof payload.caption === 'string') {
    sets.push('caption = ?');
    binds.push(clean(payload.caption, UPLOADS.caption));
  }
  if (Number.isInteger(payload.sort)) {
    sets.push('sort = ?');
    binds.push(payload.sort);
  }

  if (!sets.length) return fail(400, 'Nothing to change.');

  const res = await db
    .prepare(`UPDATE attachments SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds, id)
    .run();

  if (!res.meta.changes) return fail(404, 'No such file.');
  return json({ ok: true });
}

async function adminDeleteAttachment(db, env, id) {
  const row = await db.prepare('SELECT r2_key FROM attachments WHERE id = ?').bind(id).first();
  if (!row) return fail(404, 'No such file.');

  if (env.MEDIA) {
    try { await env.MEDIA.delete(row.r2_key); }
    catch (err) { console.error('r2 delete failed', err && err.message); }
  }

  await db.prepare('DELETE FROM attachments WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

/* ── router ──────────────────────────────────────────────── */

async function api(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;
  const db = env.DB;

  if (!db) return fail(503, 'The Commons database is not connected yet.');

  if (path === '/api/rooms' && method === 'GET') return json({ rooms: ROOMS });

  if (path === '/api/subscribe' && method === 'POST') return subscribe(db, request, env);

  if (path === '/api/notes' && method === 'GET') return listNotes(db, url);

  if (path === '/api/uploads') {
    if (method === 'GET') return uploadLimits(env, request);
    if (method === 'POST') return putUpload(db, env, request, url);
    return fail(405, 'Method not allowed.');
  }

  if (path === '/api/uploads/multipart') {
    if (!authorised(request, env)) return fail(401, 'Not authorised.');
    if (method === 'POST') return startMultipart(db, env, request, url);
    if (method === 'PUT') return putPart(env, request, url);
    if (method === 'DELETE') return abortMultipart(env, request, url);
    return fail(405, 'Method not allowed.');
  }

  if (path === '/api/uploads/multipart/complete' && method === 'POST') {
    if (!authorised(request, env)) return fail(401, 'Not authorised.');
    return finishMultipart(db, env, request);
  }

  const fm = path.match(/^\/api\/files\/(\d+)(?:\/[^/]*)?$/);
  if (fm && (method === 'GET' || method === 'HEAD')) return serveFile(db, env, request, Number(fm[1]));

  const nm = path.match(/^\/api\/notes\/([a-z0-9-]+)$/);
  if (nm && method === 'GET') return getNote(db, nm[1]);

  if (path === '/api/threads') {
    if (method === 'GET') return listThreads(db, url);
    if (method === 'POST') return createThread(db, request, env);
    return fail(405, 'Method not allowed.');
  }

  let m = path.match(/^\/api\/threads\/(\d+)$/);
  if (m && method === 'GET') return getThread(db, Number(m[1]));

  m = path.match(/^\/api\/threads\/(\d+)\/replies$/);
  if (m && method === 'POST') return createReply(db, request, env, Number(m[1]));

  if (path.startsWith('/api/admin/')) {
    if (!authorised(request, env)) return fail(401, 'Not authorised.');

    if (path === '/api/admin/threads' && method === 'GET') return adminListThreads(db, url);
    if (path === '/api/admin/subscribers' && method === 'GET') return adminListSubscribers(db, url);

    if (path === '/api/admin/notes') {
      if (method === 'GET') return adminListNotes(db);
      if (method === 'POST') return adminCreateNote(db, request);
    }

    m = path.match(/^\/api\/admin\/notes\/(\d+)$/);
    if (m && method === 'PATCH') return adminPatchNote(db, request, Number(m[1]));
    if (m && method === 'DELETE') return adminDeleteNote(db, env, Number(m[1]));

    m = path.match(/^\/api\/admin\/threads\/(\d+)$/);
    if (m && method === 'PATCH') return adminPatchThread(db, request, Number(m[1]));
    if (m && method === 'DELETE') return adminDeleteThread(db, env, Number(m[1]));

    m = path.match(/^\/api\/admin\/replies\/(\d+)$/);
    if (m && method === 'PATCH') return adminPatchReply(db, request, Number(m[1]));
    if (m && method === 'DELETE') return adminDeleteReply(db, env, Number(m[1]));

    if (path === '/api/admin/attachments' && method === 'GET') return adminListAttachments(db, env, url);

    m = path.match(/^\/api\/admin\/attachments\/(\d+)$/);
    if (m && method === 'PATCH') return adminPatchAttachment(db, request, Number(m[1]));
    if (m && method === 'DELETE') return adminDeleteAttachment(db, env, Number(m[1]));

    return fail(404, 'No such endpoint.');
  }

  return fail(404, 'No such endpoint.');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      try {
        return await api(request, env, url);
      } catch (err) {
        console.error('api error', err && err.stack ? err.stack : err);
        return fail(500, 'Something broke at our end.');
      }
    }

    return env.ASSETS.fetch(request);
  },
};
