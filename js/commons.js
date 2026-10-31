/**
 * The Commons — talks to the Worker API.
 * Plain JS, no dependencies, same as the rest of the site.
 */
(function () {
  'use strict';

  var API = '/api';

  /* ── small helpers ────────────────────────────────────── */

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function when(iso) {
    if (!iso) return '';
    var then = new Date(iso), mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + (mins === 1 ? ' minute ago' : ' minutes ago');
    var hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
    var days = Math.round(hrs / 24);
    if (days < 30) return days + (days === 1 ? ' day ago' : ' days ago');
    return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /** Paragraphs from plain text. Never innerHTML — whatever people type stays text. */
  function paragraphs(text) {
    var wrap = el('div', { class: 'stack stack--sm' });
    String(text || '').split(/\n{2,}/).forEach(function (chunk) {
      if (chunk.trim()) wrap.appendChild(el('p', { text: chunk.trim() }));
    });
    return wrap;
  }

  function api(path, options) {
    return fetch(API + path, Object.assign({ headers: { 'content-type': 'application/json' } }, options))
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw new Error(data.error || 'Something went wrong (' + res.status + ').');
          return data;
        });
      });
  }

  function note(container, message, kind) {
    container.textContent = message;
    container.className = 'muted' + (kind === 'bad' ? ' form-error' : '');
    container.hidden = !message;
  }

  /* ── room list ────────────────────────────────────────── */

  var list = document.querySelector('[data-commons-list]');

  if (list) {
    var pills = document.querySelectorAll('[data-commons-room]');
    var count = document.querySelector('[data-commons-count]');
    var room = 'all';

    function threadCard(t) {
      var meta = el('div', { class: 'thread__meta' });
      if (t.newHere) meta.appendChild(el('span', { class: 'badge badge--new', text: 'New here' }));
      if (t.status === 'answered') meta.appendChild(el('span', { class: 'badge', text: 'Answered' }));
      meta.appendChild(el('span', { text: roomLabel(t.room) }));

      return el('a', { class: 'thread', href: 'thread.html?id=' + t.id }, [
        meta,
        el('h3', { text: t.title }),
        el('p', {
          class: 'muted',
          text: t.author + ' · ' + t.replyCount + (t.replyCount === 1 ? ' reply' : ' replies') + ' · ' + when(t.updatedAt),
        }),
      ]);
    }

    var ROOM_LABELS = {};
    function roomLabel(id) { return ROOM_LABELS[id] || id; }

    function load() {
      list.setAttribute('aria-busy', 'true');
      list.innerHTML = '';
      list.appendChild(el('p', { class: 'muted', text: 'Loading…' }));

      api('/threads?room=' + encodeURIComponent(room))
        .then(function (data) {
          list.innerHTML = '';
          list.removeAttribute('aria-busy');

          if (!data.threads.length) {
            list.appendChild(el('div', { class: 'panel panel--paper stack stack--sm' }, [
              el('h3', { class: 'h-card', text: 'Nothing here yet.' }),
              el('p', { class: 'muted', text: 'Be the first. A question with no answer is still useful to the next person who searches for it.' }),
            ]));
          } else {
            data.threads.forEach(function (t) { list.appendChild(threadCard(t)); });
          }

          if (count) {
            count.textContent = 'Showing ' + data.threads.length +
              (data.threads.length === 1 ? ' thread' : ' threads') +
              (room === 'all' ? '.' : ' in ' + roomLabel(room) + '.');
          }
        })
        .catch(function (err) {
          list.innerHTML = '';
          list.removeAttribute('aria-busy');
          list.appendChild(el('div', { class: 'panel panel--paper stack stack--sm' }, [
            el('h3', { class: 'h-card', text: 'The Commons is not reachable.' }),
            el('p', { class: 'muted', text: err.message }),
          ]));
        });
    }

    Array.prototype.forEach.call(pills, function (pill) {
      ROOM_LABELS[pill.getAttribute('data-commons-room')] = pill.textContent.trim();
      pill.addEventListener('click', function () {
        room = pill.getAttribute('data-commons-room');
        Array.prototype.forEach.call(pills, function (p) {
          p.setAttribute('aria-pressed', p === pill ? 'true' : 'false');
        });
        load();
      });
    });

    api('/rooms').then(function (data) {
      data.rooms.forEach(function (r) { ROOM_LABELS[r.id] = r.label; });
    }).catch(function () { /* labels fall back to the pill text */ });

    load();

    /* new thread */
    var form = document.querySelector('[data-new-thread]');
    if (form) {
      var status = form.querySelector('[data-form-note]');
      var files = form.querySelector('[data-upload]');
      var picker = files ? window.TRHMedia.picker(files, {}) : null;
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        note(status, 'Posting…');

        var payload = {
          room: form.room.value,
          title: form.title.value,
          body: form.body.value,
          author: form.author.value,
          email: form.email.value,
          website: form.website.value,
        };
        if (picker) Object.assign(payload, picker.payload());

        api('/threads', { method: 'POST', body: JSON.stringify(payload) })
          .then(function (data) {
            if (data.id) window.location.href = 'thread.html?id=' + data.id;
            else {
              form.reset();
              if (picker) picker.reset();
              note(status, 'Thanks — posted.');
              button.disabled = false;
            }
          })
          .catch(function (err) { note(status, err.message, 'bad'); button.disabled = false; });
      });
    }
  }

  /* ── single thread ────────────────────────────────────── */

  var threadRoot = document.querySelector('[data-thread]');

  if (threadRoot) {
    var id = new URLSearchParams(window.location.search).get('id');
    var repliesRoot = document.querySelector('[data-replies]');
    var replyForm = document.querySelector('[data-reply-form]');

    function renderThread(data) {
      threadRoot.innerHTML = '';
      var t = data.thread;
      document.title = t.title + ' — The Commons';

      var meta = el('div', { class: 'thread__meta' });
      if (t.newHere) meta.appendChild(el('span', { class: 'badge badge--new', text: 'New here' }));
      if (t.status === 'answered') meta.appendChild(el('span', { class: 'badge', text: 'Answered' }));
      meta.appendChild(el('span', { text: t.author + ' · ' + when(t.createdAt) }));

      threadRoot.appendChild(meta);
      threadRoot.appendChild(el('h1', { class: 'h-sect', text: t.title }));
      threadRoot.appendChild(paragraphs(t.body));

      var threadMedia = window.TRHMedia.render(t.attachments);
      if (threadMedia) threadRoot.appendChild(threadMedia);

      repliesRoot.innerHTML = '';
      repliesRoot.appendChild(el('h2', {
        class: 'h-card',
        text: data.replies.length ? data.replies.length + (data.replies.length === 1 ? ' reply' : ' replies') : 'No replies yet',
      }));

      data.replies.forEach(function (r) {
        repliesRoot.appendChild(el('article', { class: 'reply' }, [
          el('p', { class: 'reply__who', text: r.author + ' · ' + when(r.createdAt) }),
          paragraphs(r.body),
          window.TRHMedia.render(r.attachments),
        ]));
      });
    }

    function load() {
      api('/threads/' + encodeURIComponent(id))
        .then(renderThread)
        .catch(function (err) {
          threadRoot.innerHTML = '';
          threadRoot.appendChild(el('h1', { class: 'h-sect', text: 'That thread is not here.' }));
          threadRoot.appendChild(el('p', { class: 'muted', text: err.message }));
          if (replyForm) replyForm.hidden = true;
        });
    }

    if (!id) {
      threadRoot.innerHTML = '';
      threadRoot.appendChild(el('h1', { class: 'h-sect', text: 'No thread chosen.' }));
      if (replyForm) replyForm.hidden = true;
    } else {
      load();
    }

    if (replyForm) {
      var replyNote = replyForm.querySelector('[data-form-note]');
      var replyFiles = replyForm.querySelector('[data-upload]');
      var replyPicker = replyFiles ? window.TRHMedia.picker(replyFiles, {}) : null;
      replyForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var button = replyForm.querySelector('button[type="submit"]');
        button.disabled = true;
        note(replyNote, 'Posting…');

        var reply = {
          body: replyForm.body.value,
          author: replyForm.author.value,
          email: replyForm.email.value,
          website: replyForm.website.value,
        };
        if (replyPicker) Object.assign(reply, replyPicker.payload());

        api('/threads/' + encodeURIComponent(id) + '/replies', {
          method: 'POST',
          body: JSON.stringify(reply),
        })
          .then(function () {
            replyForm.body.value = '';
            if (replyPicker) replyPicker.reset();
            note(replyNote, '');
            button.disabled = false;
            load();
          })
          .catch(function (err) { note(replyNote, err.message, 'bad'); button.disabled = false; });
      });
    }
  }
})();
