/* The Rarest Heart — shared behaviour. No dependencies, no build step. */
(function () {
  'use strict';

  /* ── mobile nav ───────────────────────────────────────── */
  var toggle = document.querySelector('[data-nav-toggle]');
  var links = document.querySelector('[data-nav-links]');

  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* ── filter groups ────────────────────────────────────────
     <div data-filter-group="notes">
       <button data-filter="all" aria-pressed="true">…</button>
       <article data-key="write">…</article>
     Pills set aria-pressed; items with a non-matching data-key hide.
     An element with data-filter-count gets "N shown" text.
     ─────────────────────────────────────────────────────── */
  var groups = document.querySelectorAll('[data-filter-group]');

  Array.prototype.forEach.call(groups, function (group) {
    var pills = group.querySelectorAll('[data-filter]');
    var items = group.querySelectorAll('[data-key]');
    var counter = group.querySelector('[data-filter-count]');
    var nouns = {};

    try {
      nouns = JSON.parse(group.getAttribute('data-filter-nouns') || '{}');
    } catch (err) {
      nouns = {};
    }

    function apply(value) {
      var shown = 0;

      Array.prototype.forEach.call(items, function (item) {
        var match = value === 'all' || item.getAttribute('data-key') === value;
        item.classList.toggle('is-hidden', !match);
        if (match) { shown += 1; }
      });

      Array.prototype.forEach.call(pills, function (pill) {
        var on = pill.getAttribute('data-filter') === value;
        pill.setAttribute('aria-pressed', on ? 'true' : 'false');
      });

      if (counter) {
        counter.textContent = 'Showing ' + shown + ' ' + (nouns[value] || 'items') + '.';
      }
    }

    Array.prototype.forEach.call(pills, function (pill) {
      pill.addEventListener('click', function () {
        apply(pill.getAttribute('data-filter'));
      });
    });

    var initial = group.querySelector('[data-filter][aria-pressed="true"]');
    apply(initial ? initial.getAttribute('data-filter') : 'all');
  });

  /* ── mailto forms ─────────────────────────────────────────
     No backend here, so the contact form composes the message
     and hands it to the visitor's own mail app. They keep a copy
     in their sent folder, which a POST to a form service doesn't
     give them. Swap this for a real endpoint when there is one.
     ─────────────────────────────────────────────────────── */
  var mailForms = document.querySelectorAll('[data-mailto-form]');

  Array.prototype.forEach.call(mailForms, function (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();

      var to = form.getAttribute('data-mailto');
      var get = function (name) {
        var el = form.querySelector('[name="' + name + '"]');
        return el ? el.value : '';
      };

      var topic = get('topic') || 'Message from the site';
      var body = get('message') + '\n\n---\n' + get('name') + '\n' + get('email');

      window.location.href = 'mailto:' + to +
        '?subject=' + encodeURIComponent(topic) +
        '&body=' + encodeURIComponent(body);
    });
  });

  /* ── gerdie dock ──────────────────────────────────────────
     He never opens himself. One click to open, Escape or the
     close button to shut him up.
     ─────────────────────────────────────────────────────── */
  var dock = document.querySelector('[data-gerdie-dock]');
  var panel = document.querySelector('[data-gerdie-panel]');

  if (dock && panel) {
    var close = panel.querySelector('[data-gerdie-close]');

    function setOpen(open) {
      panel.hidden = !open;
      dock.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        var target = close || panel;
        target.focus();
      } else {
        dock.focus();
      }
    }

    dock.addEventListener('click', function () {
      setOpen(panel.hidden);
    });

    if (close) {
      close.addEventListener('click', function () { setOpen(false); });
    }

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !panel.hidden) { setOpen(false); }
    });
  }
})();
