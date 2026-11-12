/**
 * Field Notes — reads from the API. Notes are written in /admin.html.
 */
(function () {
  'use strict';

  var KIND = { write: 'Writing', build: 'Build log', find: 'Research' };
  var CAP = { write: '', build: ' card__cap--build', find: ' card__cap--find' };

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  function when(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /**
   * Paragraphs as text nodes. Whatever is typed stays text.
   *
   * A line of its own reading [media:2] is swapped for the second attached
   * file, which is how a photo lands between two paragraphs instead of in a
   * heap at the end. Anything not placed that way follows the body.
   */
  function paragraphs(text, files) {
    var wrap = el('div', { class: 'stack' });
    var media = files || [];
    var placed = {};

    String(text || '').split(/\n{2,}/).forEach(function (chunk) {
      var line = chunk.trim();
      if (!line) return;

      var marker = /^\[media:(\d{1,2})\]$/.exec(line);
      if (marker) {
        var at = Number(marker[1]) - 1;
        if (media[at] && !placed[at]) {
          placed[at] = true;
          wrap.appendChild(window.TRHMedia.render([media[at]]));
        }
        return;
      }

      wrap.appendChild(el('p', { text: line }));
    });

    var left = media.filter(function (a, i) { return !placed[i]; });
    var rest = window.TRHMedia.render(left);
    if (rest) wrap.appendChild(rest);

    return wrap;
  }

  function api(path) {
    return fetch('/api' + path).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Could not load that.');
        return data;
      });
    });
  }

  /* ── the list ─────────────────────────────────────────── */

  var list = document.querySelector('[data-notes-list]');

  if (list) {
    var pills = document.querySelectorAll('[data-notes-kind]');
    var count = document.querySelector('[data-notes-count]');
    var kind = 'all';

    /* notes.html?kind=build opens already filtered (the homepage links here) */
    var wanted = new URLSearchParams(window.location.search).get('kind');
    if (wanted && KIND[wanted]) {
      kind = wanted;
      Array.prototype.forEach.call(pills, function (p) {
        p.setAttribute('aria-pressed', p.getAttribute('data-notes-kind') === kind ? 'true' : 'false');
      });
    }

    function card(n) {
      var capText = KIND[n.kind] + ' · ' + n.readMinutes + ' min';
      var cap = el('div', { class: 'card__cap' + (CAP[n.kind] || '') }, [el('span', { text: capText })]);
      if (n.buildState) cap.appendChild(el('span', { text: n.buildState }));

      return el('a', { class: 'card', href: 'note.html?n=' + encodeURIComponent(n.slug) }, [
        cap,
        el('div', { class: 'card__body' }, [
          el('h2', { class: 'h-card', text: n.title }),
          n.summary ? el('p', { class: 'muted', text: n.summary }) : null,
          el('div', { class: 'card__foot' }, [
            el('span', { class: 'hand', text: when(n.publishedAt) }),
            isNew(n) ? el('span', { class: 'flag-new', text: 'new since your last visit' }) : null,
          ]),
        ]),
      ]);
    }

    var lastHere = window.TRHMotion.since();
    function isNew(n) { return !!lastHere && !!n.publishedAt && n.publishedAt > lastHere; }
    list.classList.add('journal-list');

    function load() {
      window.TRHMotion.skeletons(list, 'note', 3);

      api('/notes?kind=' + encodeURIComponent(kind))
        .then(function (data) {
          list.innerHTML = '';
          list.removeAttribute('aria-busy');

          if (!data.notes.length) {
            list.appendChild(el('div', { class: 'panel panel--paper stack stack--sm' }, [
              el('h2', { class: 'h-card', text: kind === 'all' ? 'Nothing published yet.' : 'Nothing here yet.' }),
              el('p', { class: 'muted', text: 'The first notes are being written. The Commons is open in the meantime.' }),
            ]));
          } else {
            var cards = data.notes.map(function (n) {
              var node = card(n);
              list.appendChild(node);
              return node;
            });
            window.TRHMotion.reveal(cards);
          }

          if (count) {
            var nouns = {
              all: ['note', 'notes'],
              write: ['essay', 'essays'],
              build: ['build log', 'build logs'],
              find: ['research note', 'research notes'],
            };
            var n = data.notes.length;
            count.textContent = 'Showing ' + n + ' ' + nouns[kind][n === 1 ? 0 : 1] + '.';
          }
        })
        .catch(function (err) {
          list.innerHTML = '';
          list.removeAttribute('aria-busy');
          list.appendChild(el('p', { class: 'muted form-error', text: err.message }));
        });
    }

    Array.prototype.forEach.call(pills, function (pill) {
      pill.addEventListener('click', function () {
        kind = pill.getAttribute('data-notes-kind');
        Array.prototype.forEach.call(pills, function (p) {
          p.setAttribute('aria-pressed', p === pill ? 'true' : 'false');
        });
        load();
      });
    });

    load();
  }

  /* ── one note ─────────────────────────────────────────── */

  var root = document.querySelector('[data-note]');

  if (root) {
    var slug = new URLSearchParams(window.location.search).get('n');

    /** The panel beside the note: the conversations on it, or a way to start one. */
    function conversation(n) {
      var text = document.querySelector('[data-note-cta-text]');
      var list = document.querySelector('[data-note-cta-list]');
      var btn = document.querySelector('[data-note-cta-btn]');
      if (!text || !list || !btn) return;

      var threads = n.threads || [];
      list.innerHTML = '';

      if (!threads.length) {
        text.textContent = 'Nobody has started a conversation on this one yet. Yours can be the first.';
        btn.textContent = 'Start the conversation';
        btn.setAttribute('href', 'commons.html?note=' + encodeURIComponent(n.slug) + '#start');
        return;
      }

      text.textContent = threads.length === 1 ? 'The conversation on this note:' : 'The conversations on this note:';
      threads.forEach(function (t) {
        var count = t.replyCount === 1 ? '1 sticky note' : t.replyCount + ' sticky notes';
        list.appendChild(el('a', { class: 'thread__link', href: 'thread.html?id=' + t.id }, [
          el('strong', { text: t.title }),
          el('span', { text: count }),
        ]));
      });
      btn.textContent = 'Add your sticky note';
      btn.setAttribute('href', 'thread.html?id=' + threads[0].id + '#reply');
    }

    function show(n) {
      root.innerHTML = '';
      document.title = n.title + ' | Field Notes';

      var meta = [KIND[n.kind], n.readMinutes + ' min'];
      if (n.buildState) meta.push(n.buildState);

      // A page from the journal: the date in the margin hand, the title
      // underlined in pen, and the body written onto ruled paper.
      root.classList.add('journal');
      root.appendChild(el('p', { class: 'journal__date', text: when(n.publishedAt) }));
      root.appendChild(el('p', { class: 'eyebrow', text: meta.join(' · ') }));
      root.appendChild(el('h1', { class: 'h-hero journal__title', text: n.title }));
      if (n.summary) root.appendChild(el('p', { class: 'lede', text: n.summary }));

      var body = paragraphs(n.body, n.attachments);
      body.classList.add('journal__body');
      root.appendChild(body);
      window.TRHMotion.ink(body.querySelectorAll(':scope > p'));

      conversation(n);

      // Gerdie underlines the glossary words once the note is on the page.
      window.TRHNote = n;
      document.dispatchEvent(new CustomEvent('trh:note'));

      // Only worth drawing once there is a note to measure against.
      window.TRHMotion.readingProgress(root);
    }

    if (!slug) {
      root.innerHTML = '';
      root.appendChild(el('h1', { class: 'h-sect', text: 'No note chosen.' }));
    } else {
      api('/notes/' + encodeURIComponent(slug))
        .then(function (data) { show(data.note); })
        .catch(function (err) {
          root.innerHTML = '';
          root.appendChild(el('h1', { class: 'h-sect', text: 'That note is not here.' }));
          root.appendChild(el('p', { class: 'muted', text: err.message }));
        });
    }
  }
})();
