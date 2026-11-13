/**
 * Gerdie — the guide in the dock.
 *
 * He still never opens himself: everything here happens after someone taps
 * him, taps a word he can translate, or taps a button that names him. The
 * only thing he does unasked is wear a small dot when there are notes newer
 * than your last visit.
 *
 * What he can do once open:
 *   - search the notes and the Commons for what you typed, and hand back one
 *     thing to read, with a prefilled "ask the Commons" when nothing matches
 *   - ask which of the three starting points sounds like your week
 *   - translate a glossary word in the note you are reading
 *   - suggest the next note, and explain how the Commons and sticky notes work
 *
 * He steps aside on anything serious (a breach, a legal line) and sends you
 * to a person instead.
 */
(function () {
  'use strict';

  var dock = document.querySelector('[data-gerdie-dock]');
  var panel = document.querySelector('[data-gerdie-panel]');
  if (!dock || !panel) return;

  var page = (window.location.pathname.replace(/\/+$/, '').split('/').pop() || 'index').replace(/\.html$/, '') || 'index';

  var KIND = { write: 'Writing', build: 'Build log', find: 'Research', weekly: 'Gerdie\u2019s Weekly' };
  var SERIOUS = /\b(breach(ed|es)?|hacked|ransomware|lawsuit|sued|subpoena|fined|leak(ed)?|stolen|investigat(ion|ed))\b/i;

  /* ── small helpers ────────────────────────────────────── */

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

  function api(path) {
    return fetch('/api' + path).then(function (res) {
      if (!res.ok) throw new Error('Could not load that.');
      return res.json();
    });
  }

  function action(label, onClick) {
    var b = el('button', { class: 'btn btn--ghost btn--block', type: 'button', text: label });
    b.addEventListener('click', onClick);
    return b;
  }

  function link(label, href, kind) {
    return el('a', { class: 'btn ' + (kind || 'btn--ghost') + ' btn--block', href: href, text: label });
  }

  /** Same rule as motion.js: read once per browser session, then held. */
  function since() {
    if (window.TRHMotion && window.TRHMotion.since) return window.TRHMotion.since();
    try {
      var prev = sessionStorage.getItem('trh-prev');
      if (prev === null) {
        prev = localStorage.getItem('trh-seen') || '';
        sessionStorage.setItem('trh-prev', prev);
        localStorage.setItem('trh-seen', new Date().toISOString());
      }
      return prev;
    } catch (e) {
      return '';
    }
  }

  var notesCache = null;
  function allNotes() {
    if (!notesCache) {
      notesCache = api('/notes').then(function (d) { return d.notes || []; });
      notesCache.catch(function () { notesCache = null; });
    }
    return notesCache;
  }

  /* ── the panel ────────────────────────────────────────── */

  // Everything but the close button is replaced: the markup in the page is
  // only what someone sees if this file fails to load.
  var currentView = 'home';
  var closeBtn = panel.querySelector('[data-gerdie-close]');
  Array.prototype.slice.call(panel.children).forEach(function (child) {
    if (child !== closeBtn) panel.removeChild(child);
  });
  var body = el('div', { class: 'gerdie-body', 'aria-live': 'polite' });
  panel.appendChild(body);

  function openPanel() { if (panel.hidden) dock.click(); }

  /** Swap what is in the panel and move focus to its heading. */
  function view(title, parts, keepFocus) {
    currentView = 'other';
    body.innerHTML = '';
    var h = el('h4', { text: title, tabindex: '-1' });
    body.appendChild(h);
    (parts || []).forEach(function (p) { if (p) body.appendChild(p); });
    if (!keepFocus && !panel.hidden) h.focus();
  }

  function back() {
    var b = el('button', { class: 'gerdie-back', type: 'button', text: '← Back' });
    b.addEventListener('click', function () { home(); });
    return b;
  }

  function say(text) { return el('p', { class: 'gerdie-say', text: text }); }

  /* ── one thing to read ────────────────────────────────── */

  function noteHref(n) { return 'note.html?n=' + encodeURIComponent(n.slug); }
  function threadHref(t) { return 'thread.html?id=' + t.id; }

  function pickCard(item) {
    var isNote = !!item.slug;
    var foot = isNote
      ? 'Read it · ' + (KIND[item.kind] || 'Note') + ' · ' + item.readMinutes + ' min'
      : 'Open the thread · ' + (item.replyCount === 1 ? '1 sticky note' : item.replyCount + ' sticky notes');
    return el('a', { class: 'gerdie-pick', href: isNote ? noteHref(item) : threadHref(item) }, [
      el('strong', { text: item.title }),
      isNote && item.summary ? el('span', { class: 'gerdie-pick__sum', text: item.summary }) : null,
      el('span', { class: 'gerdie-pick__foot', text: foot }),
    ]);
  }

  function others(items) {
    if (!items.length) return null;
    var list = el('ul', { class: 'gerdie-others' });
    items.forEach(function (item) {
      list.appendChild(el('li', {}, [
        el('a', { href: item.slug ? noteHref(item) : threadHref(item), text: item.title }),
      ]));
    });
    return el('div', {}, [el('p', { class: 'gerdie-say', text: 'If that isn’t it:' }), list]);
  }

  /* ── ask: search the notes and the Commons ────────────── */

  function askForm() {
    var input = el('input', {
      type: 'search', name: 'q', id: 'gerdie-q', maxlength: '120', autocomplete: 'off',
      placeholder: 'In your own words',
    });
    var form = el('form', { class: 'gerdie-ask' }, [
      el('label', { class: 'sr-only', for: 'gerdie-q', text: 'Tell Gerdie what you are stuck on' }),
      el('div', { class: 'field' }, [input]),
      el('button', { class: 'btn btn--primary btn--small', type: 'submit', text: 'Find it' }),
    ]);
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var q = input.value.trim();
      if (q.length < 2) { input.focus(); return; }
      ask(q);
    });
    return form;
  }

  function nothingFound(q) {
    view('I couldn’t find that.', [
      say('Nothing in the notes or the Commons matches yet. Ask it out loud and a person will answer.'),
      link('Ask the Commons', 'commons.html?ask=' + encodeURIComponent(q) + '#start', 'btn--primary'),
      back(),
    ]);
  }

  function search(q) {
    view('Looking…', [say('Checking the notes and the Commons.')]);
    api('/search?q=' + encodeURIComponent(q))
      .then(function (data) {
        var found = (data.notes || []).concat(data.threads || []);
        if (!found.length) { nothingFound(q); return; }
        view('Start with this one.', [
          pickCard(found[0]),
          others(found.slice(1, 3)),
          link('Still stuck? Ask the Commons', 'commons.html?ask=' + encodeURIComponent(q) + '#start'),
          back(),
        ]);
      })
      .catch(function () {
        view('That didn’t work.', [
          say('I couldn’t reach the notes just now. The Commons is still open.'),
          link('Ask the Commons', 'commons.html?ask=' + encodeURIComponent(q) + '#start', 'btn--primary'),
          back(),
        ]);
      });
  }

  function ask(q) {
    if (SERIOUS.test(q)) {
      view('I’ll step aside for this one.', [
        say('That sounds serious, and a cartoon shouldn’t guess about a breach or a legal line. Write to Kelvin directly.'),
        link('Get in touch', 'contact.html', 'btn--primary'),
        action('Search the notes anyway', function () { search(q); }),
        back(),
      ]);
      return;
    }
    search(q);
  }

  /* ── the one-question guide ───────────────────────────── */

  function guide() {
    function choose(kind) {
      return function () {
        view('Looking…', []);
        allNotes()
          .then(function (notes) {
            var match = notes.filter(function (n) { return n.kind === kind; });
            if (!match.length) {
              view('Nothing written for that yet.', [
                say('I won’t pretend otherwise. The Commons is the place to ask in the meantime.'),
                link('Ask the Commons', 'commons.html#start', 'btn--primary'),
                back(),
              ]);
              return;
            }
            view('Start with this one.', [pickCard(match[0]), others(match.slice(1, 3)), back()]);
          })
          .catch(function () {
            view('That didn’t work.', [say('I couldn’t reach the notes just now.'), link('See all field notes', 'notes.html'), back()]);
          });
      };
    }
    view('Which one sounds like your week?', [
      action('I’m new to this', choose('write')),
      action('I work in IT', choose('build')),
      action('I just want what works', choose('find')),
      back(),
    ]);
  }

  /* ── translating a word (note page) ───────────────────── */

  var glossary = [];     // every term Kelvin has written a meaning for
  var inThisNote = [];   // the ones that actually appear in the note on screen

  function showTerm(t) {
    openPanel();
    view('“' + t.term + '”', [
      say(t.meaning),
      inThisNote.length > 1 ? action('Other words in this note', termList) : null,
      back(),
    ]);
  }

  function termList() {
    var parts = inThisNote.map(function (t) {
      return action(t.term, function () { showTerm(t); });
    });
    parts.push(back());
    view('Which word?', parts);
  }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /**
   * Underline the first appearance of each glossary word in the note. Only
   * the first: a page where every third word is dotted is harder to read
   * than the jargon was.
   */
  function markTerms() {
    var root = document.querySelector('.journal__body');
    if (!root || !glossary.length || root.getAttribute('data-terms-done')) return;
    root.setAttribute('data-terms-done', 'true');
    inThisNote = [];

    glossary.slice().sort(function (a, b) { return b.term.length - a.term.length; }).forEach(function (t) {
      var re = new RegExp('(^|[^A-Za-z0-9])(' + escapeRe(t.term) + ')(?![A-Za-z0-9])', 'i');
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) {
        if (node.parentNode.closest('.term')) continue;
        var m = re.exec(node.nodeValue);
        if (!m) continue;

        var start = m.index + m[1].length;
        var word = node.splitText(start);
        word.splitText(m[2].length);
        var btn = el('button', { class: 'term', type: 'button', text: word.nodeValue, 'aria-label': word.nodeValue + ', tap for a plain meaning' });
        btn.addEventListener('click', function () { showTerm(t); });
        word.parentNode.replaceChild(btn, word);
        inThisNote.push(t);
        break;
      }
    });

    inThisNote.sort(function (a, b) { return a.term.localeCompare(b.term); });
    if (currentView === 'home') home(true);
  }

  function readNext() {
    view('Looking…', []);
    var here = new URLSearchParams(window.location.search).get('n');
    var kind = window.TRHNote ? window.TRHNote.kind : '';
    allNotes()
      .then(function (notes) {
        var rest = notes.filter(function (n) { return n.slug !== here; });
        if (!rest.length) {
          view('This is the only note up right now.', [
            say('If it left you with a question, the Commons is where to put it.'),
            link('Take it to the Commons', 'commons.html#start', 'btn--primary'),
            back(),
          ]);
          return;
        }
        var same = rest.filter(function (n) { return n.kind === kind; });
        var ordered = same.concat(rest.filter(function (n) { return n.kind !== kind; }));
        view('Read this one next.', [pickCard(ordered[0]), others(ordered.slice(1, 3)), back()]);
      })
      .catch(function () {
        view('That didn’t work.', [say('I couldn’t reach the notes just now.'), link('See all field notes', 'notes.html'), back()]);
      });
  }

  /* ── plain explanations ───────────────────────────────── */

  function steps(title, lines, after) {
    var list = el('ul', { class: 'gerdie-steps' });
    lines.forEach(function (line) { list.appendChild(el('li', { text: line })); });
    view(title, [list].concat(after || []).concat([back()]));
  }

  function howStickies() {
    steps('How sticky notes work', [
      'No account. Put a name on it and write.',
      'Your email is optional and never shown.',
      'Pick a paper colour. Your note goes on the board in it.',
      'Keep patients, clients and real systems out of it. Describe them instead.',
    ], [link('Add a sticky note', '#reply', 'btn--primary')]);
  }

  function howCommons() {
    steps('How the Commons works', [
      'Five rooms. Pick the closest one to your question.',
      'No account and nothing to install. A name is enough.',
      'Replies arrive as sticky notes under your thread.',
      'One email on Monday catches you up, if you ask for it.',
    ], [link('Start a thread', '#start', 'btn--primary')]);
  }

  /* ── the first screen, different on every page ────────── */

  var HOME = {
    index:   { title: 'What are you stuck on?', lead: 'Type it and I’ll point you at one thing to read, not twelve.' },
    contact: { title: 'What are you stuck on?', lead: 'Type it and I’ll point you at one thing to read, not twelve.' },
    notes:   { title: 'Looking for something?', lead: 'Type it and I’ll find the one note that fits.' },
    note:    { title: 'Lost the thread?', lead: 'Ask me about this note, or about anything else on the site.' },
    commons: { title: 'New in here?', lead: 'Someone may have asked it already. Type it and I’ll check.' },
    thread:  { title: 'About to stick one on?', lead: 'Looking for something else? Type it and I’ll check.' },
  };

  var fresh = [];          // notes published since the reader's last visit

  function welcomeBack() {
    if (!fresh.length) return null;
    var list = el('ul', { class: 'gerdie-others' });
    fresh.slice(0, 2).forEach(function (n) {
      list.appendChild(el('li', {}, [el('a', { href: noteHref(n), text: n.title })]));
    });
    return el('div', { class: 'gerdie-new' }, [
      el('p', { class: 'gerdie-new__lead', text: fresh.length === 1 ? '1 new note since you were last here' : fresh.length + ' new notes since you were last here' }),
      list,
    ]);
  }

  function home(keepFocus) {
    var copy = HOME[page] || HOME.index;
    var parts = [welcomeBack(), say(copy.lead), askForm()];

    if (page === 'note') {
      if (inThisNote.length) parts.push(action('Translate a word in this note', termList));
      parts.push(action('What should I read next?', readNext));
      var here = new URLSearchParams(window.location.search).get('n');
      parts.push(link('Take it to the Commons', here ? 'commons.html?note=' + encodeURIComponent(here) + '#start' : 'commons.html#start'));
    } else if (page === 'thread') {
      parts.push(action('How sticky notes work', howStickies));
      parts.push(link('See all the rooms', 'commons.html'));
    } else if (page === 'commons') {
      parts.push(action('How the Commons works', howCommons));
      parts.push(action('Help me pick something to read', guide));
    } else {
      parts.push(action('Help me pick where to start', guide));
      parts.push(link('Ask the Commons', 'commons.html'));
    }

    view(copy.title, parts, keepFocus);
    currentView = 'home';
  }

  home(true);

  // A button elsewhere on the page that names him ("Ask me now").
  Array.prototype.forEach.call(document.querySelectorAll('[data-gerdie-open]'), function (b) {
    b.addEventListener('click', function () {
      openPanel();
      home(true);
      var input = body.querySelector('input');
      if (input) input.focus();
    });
  });

  /* ── the dot: notes newer than your last visit ────────── */

  var last = since();
  if (last) {
    allNotes()
      .then(function (notes) {
        fresh = notes.filter(function (n) { return n.publishedAt && n.publishedAt > last; });
        if (!fresh.length) return;
        dock.classList.add('gerdie-dock--new');
        dock.setAttribute('aria-label', 'Ask Gerdie. ' + (fresh.length === 1 ? '1 new note' : fresh.length + ' new notes') + ' since you were last here');
        if (currentView === 'home') home(true);
      })
      .catch(function () { /* no dot is the right answer when the notes will not load */ });
  }

  /* ── the note page: glossary words ────────────────────── */

  if (page === 'note') {
    api('/glossary')
      .then(function (data) { glossary = data.terms || []; markTerms(); })
      .catch(function () { /* the note reads fine without it */ });
    document.addEventListener('trh:note', markTerms);
  }

  /* ── the Commons: a question carried over from Gerdie ─── */

  if (page === 'commons') {
    var carried = new URLSearchParams(window.location.search).get('ask');
    var title = document.getElementById('t-title');
    if (carried && title && !title.value) {
      title.value = carried.slice(0, 140);
    }
  }

  /* ── the thread page: help at the moment of posting ───── */

  if (page === 'thread') {
    var pad = document.getElementById('reply');
    var form = pad && pad.querySelector('form');
    var posted = false;
    try { posted = localStorage.getItem('trh-posted') === '1'; } catch (e) { /* treat as a first-timer */ }

    var hint = null;
    if (form && !posted) {
      hint = el('div', { class: 'gerdie-aside gerdie-aside--pad' }, [
        el('img', { src: 'images/gerdie-head.svg', alt: 'Gerdie' }),
        el('p', { text: 'First one? Two sentences is plenty. Say what you’d actually do.' }),
      ]);
      var firstRow = form.querySelector('.form-row');
      form.insertBefore(hint, firstRow);
    }

    document.addEventListener('trh:posted', function () {
      if (posted) return;
      posted = true;
      try { localStorage.setItem('trh-posted', '1'); } catch (e) { /* fine */ }
      if (hint && hint.parentNode) hint.parentNode.removeChild(hint);
      if (!pad) return;
      pad.parentNode.insertBefore(el('div', { class: 'gerdie-aside', role: 'status' }, [
        el('img', { src: 'images/gerdie-head.svg', alt: 'Gerdie' }),
        el('p', {}, [
          document.createTextNode('That’s your first one on the board. The Monday email is one a week: what went up, and the one thread worth reading. '),
          el('a', { href: '#nl-email', text: 'Get the Monday email' }),
        ]),
      ]), pad);
    });
  }
})();
