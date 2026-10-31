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
 *   Moderation — all require the X-Admin-Token header:
 *   GET    /api/admin/threads?room=&status=      includes hidden rows
 *   GET    /api/admin/subscribers?format=csv
 *   GET    /api/admin/notes            POST   /api/admin/notes
 *   PATCH  /api/admin/notes/:id         DELETE /api/admin/notes/:id
 *   PATCH  /api/admin/threads/:id                { status, new_here, title, body }
 *   DELETE /api/admin/threads/:id
 *   PATCH  /api/admin/replies/:id                { status, body }
 *   DELETE /api/admin/replies/:id
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

/** True when this poster is over the hourly cap. */
async function overLimit(db, ipHash) {
  const windowStart = now().slice(0, 13); // YYYY-MM-DDTHH
  const row = await db
    .prepare('SELECT count FROM rate_limit WHERE ip_hash = ? AND window_start = ?')
    .bind(ipHash, windowStart)
    .first();

  if (row && row.count >= LIMITS.postsPerHour) return true;

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

  return json({ thread: publicThread(thread), replies: results.map(publicReply) });
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

  return json({ ok: true, id: res.meta.last_row_id }, 201);
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
  return json({ note: publicNote(note) });
}

function readNoteFields(payload) {
  const kind = String(payload.kind || '');
  const title = clean(payload.title, LIMITS.noteTitle);
  const summary = clean(payload.summary, LIMITS.noteSummary);
  const body = clean(payload.body, LIMITS.noteBody);
  const buildState = clean(payload.buildState, 40);

  if (!NOTE_KINDS.includes(kind)) return { error: 'Pick writing, build log or research.' };
  if (title.length < 6) return { error: 'Give it a title of at least 6 characters.' };
  if (body.length < 40) return { error: 'The body is too short to publish.' };

  return { kind, title, summary, body, buildState };
}

async function adminListNotes(db) {
  const { results } = await db.prepare('SELECT * FROM notes ORDER BY updated_at DESC LIMIT 200').all();
  return json({ notes: results.map((n) => Object.assign(publicNote(n), { status: n.status })) });
}

async function adminCreateNote(db, request) {
  let payload;
  try { payload = await request.json(); } catch (e) { return fail(400, 'Expected JSON.'); }

  const f = readNoteFields(payload);
  if (f.error) return fail(400, f.error);

  const stamp = now();
  const status = payload.status === 'published' ? 'published' : 'draft';
  const slug = await uniqueSlug(db, slugify(f.title));

  const res = await db
    .prepare(
      `INSERT INTO notes (slug, kind, title, summary, body, status, build_state, read_minutes, created_at, updated_at, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(slug, f.kind, f.title, f.summary, f.body, status, f.buildState || null,
          readMinutes(f.body), stamp, stamp, status === 'published' ? stamp : null)
    .run();

  return json({ ok: true, id: res.meta.last_row_id, slug }, 201);
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

  const f = readNoteFields(payload);
  if (f.error) return fail(400, f.error);

  const status = payload.status === 'published' ? 'published' : 'draft';
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

  return json({ ok: true, slug });
}

async function adminDeleteNote(db, id) {
  const res = await db.prepare('DELETE FROM notes WHERE id = ?').bind(id).run();
  if (!res.meta.changes) return fail(404, 'No such note.');
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

async function adminDeleteThread(db, id) {
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

async function adminDeleteReply(db, id) {
  const reply = await db.prepare('SELECT thread_id, status FROM replies WHERE id = ?').bind(id).first();
  if (!reply) return fail(404, 'No such reply.');

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

/* ── router ──────────────────────────────────────────────── */

async function api(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;
  const db = env.DB;

  if (!db) return fail(503, 'The Commons database is not connected yet.');

  if (path === '/api/rooms' && method === 'GET') return json({ rooms: ROOMS });

  if (path === '/api/subscribe' && method === 'POST') return subscribe(db, request, env);

  if (path === '/api/notes' && method === 'GET') return listNotes(db, url);

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
    if (m && method === 'DELETE') return adminDeleteNote(db, Number(m[1]));

    m = path.match(/^\/api\/admin\/threads\/(\d+)$/);
    if (m && method === 'PATCH') return adminPatchThread(db, request, Number(m[1]));
    if (m && method === 'DELETE') return adminDeleteThread(db, Number(m[1]));

    m = path.match(/^\/api\/admin\/replies\/(\d+)$/);
    if (m && method === 'PATCH') return adminPatchReply(db, request, Number(m[1]));
    if (m && method === 'DELETE') return adminDeleteReply(db, Number(m[1]));

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
