/**
 * Homepage: the latest notes and the latest Commons questions, read from the
 * same API the Notes and Commons pages use. Nothing here is typed in by hand,
 * so a count or a date on the homepage can never disagree with the real page.
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
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function api(path) {
    return fetch('/api' + path).then(function (res) {
      if (!res.ok) throw new Error('Could not load that.');
      return res.json();
    });
  }

  function empty(title, text, href, label) {
    return el('div', { class: 'panel panel--paper stack stack--sm' }, [
      el('h3', { class: 'h-card', text: title }),
      el('p', { class: 'muted', text: text }),
      href ? el('a', { href: href, text: label }) : null,
    ]);
  }

  var lastHere = window.TRHMotion ? window.TRHMotion.since() : '';

  /* ── the local-session demo, typed out ─────────────────────
     The full text never leaves the page: the part not yet "typed" is only
     made transparent, so the box keeps its size, a screen reader reads the
     whole exchange, and with no script or reduced motion it is just text. */

  var typed = Array.prototype.slice.call(document.querySelectorAll('[data-typed]'));
  if (typed.length && window.TRHMotion && !window.TRHMotion.still && 'IntersectionObserver' in window) {
    var lines = typed.map(function (p) {
      var text = p.textContent;
      var on = el('span', { class: 'typed-on' });
      var off = el('span', { class: 'typed-off', text: text });
      p.textContent = '';
      p.appendChild(on);
      p.appendChild(off);
      return { p: p, on: on, off: off, text: text };
    });

    var type = function (i) {
      var line = lines[i];
      if (!line) return;
      var k = 0;
      line.p.classList.add('is-typing');
      (function tick() {
        k++;
        line.on.textContent = line.text.slice(0, k);
        line.off.textContent = line.text.slice(k);
        if (k < line.text.length) {
          setTimeout(tick, i === 0 ? 30 : 16);
        } else {
          line.p.classList.remove('is-typing');
          setTimeout(function () { type(i + 1); }, 550);
        }
      })();
    };

    var watcher = new IntersectionObserver(function (entries) {
      if (!entries.some(function (e) { return e.isIntersecting; })) return;
      watcher.disconnect();
      type(0);
    }, { threshold: 0.6 });
    watcher.observe(typed[0].closest('.panel') || typed[0]);
  }

  /* ── latest notes ──────────────────────────────────────── */

  var notes = document.querySelector('[data-home-notes]');
  if (notes) {
    api('/notes?kind=all')
      .then(function (data) {
        notes.innerHTML = '';
        notes.removeAttribute('aria-busy');
        var latest = (data.notes || []).slice(0, 3);

        if (!latest.length) {
          notes.classList.remove('grid--3', 'grid--lead');
          notes.appendChild(empty(
            'Nothing published yet.',
            'The first notes are being written. The Commons is open in the meantime.',
            'commons.html', 'See the Commons →'
          ));
          return;
        }

        var cards = latest.map(function (n) {
          var cap = el('div', { class: 'card__cap' + (CAP[n.kind] || '') }, [
            el('span', { text: KIND[n.kind] + ' · ' + n.readMinutes + ' min' }),
          ]);
          if (n.buildState) cap.appendChild(el('span', { text: n.buildState }));

          var card = el('a', { class: 'card', href: 'note.html?n=' + encodeURIComponent(n.slug) }, [
            cap,
            el('div', { class: 'card__body' }, [
              el('h3', { class: 'h-card', text: n.title }),
              n.summary ? el('p', { class: 'muted', text: n.summary }) : null,
              el('div', { class: 'card__foot' }, [
                el('span', { class: 'hand', text: when(n.publishedAt) }),
                lastHere && n.publishedAt > lastHere
                  ? el('span', { class: 'flag-new', text: 'new since your last visit' }) : null,
              ]),
            ]),
          ]);
          notes.appendChild(card);
          return card;
        });

        if (window.TRHMotion) window.TRHMotion.reveal(cards);
      })
      .catch(function () {
        notes.innerHTML = '';
        notes.removeAttribute('aria-busy');
        notes.classList.remove('grid--3', 'grid--lead');
        notes.appendChild(el('p', { class: 'muted' }, [
          document.createTextNode('The latest notes are on '),
          el('a', { href: 'notes.html', text: 'the notes page' }),
          document.createTextNode('.'),
        ]));
      });
  }

  /* ── latest Commons questions ──────────────────────────── */

  var threads = document.querySelector('[data-home-threads]');
  if (threads) {
    api('/threads?room=all')
      .then(function (data) {
        threads.innerHTML = '';
        threads.removeAttribute('aria-busy');
        var latest = (data.threads || []).slice(0, 2);

        if (!latest.length) {
          threads.appendChild(empty(
            'No questions yet.',
            'Be the first. A question with no answer is still useful to the next person who searches for it.',
            'commons.html#join', 'Ask the first one →'
          ));
          return;
        }

        latest.forEach(function (t) {
          var meta = el('div', { class: 'thread__meta' });
          if (t.newHere) meta.appendChild(el('span', { class: 'badge badge--new', text: 'New here' }));
          if (t.status === 'answered') meta.appendChild(el('span', { class: 'badge', text: 'Answered' }));

          threads.appendChild(el('a', { class: 'thread', href: 'thread.html?id=' + t.id }, [
            meta,
            el('h3', { text: t.title }),
            el('p', {
              class: 'muted',
              text: t.replyCount + (t.replyCount === 1 ? ' reply' : ' replies') + ' · last one ' + when(t.updatedAt),
            }),
          ]));
        });
      })
      .catch(function () {
        threads.innerHTML = '';
        threads.removeAttribute('aria-busy');
        threads.appendChild(el('p', { class: 'muted' }, [
          document.createTextNode('Questions live in '),
          el('a', { href: 'commons.html', text: 'the Commons' }),
          document.createTextNode('.'),
        ]));
      });
  }
})();
