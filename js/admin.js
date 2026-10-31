/**
 * The Commons — moderation.
 * The token lives in sessionStorage, so it's gone when the tab closes.
 */
(function () {
  'use strict';

  var KEY = 'trh-admin-token';
  var gate = document.querySelector('[data-gate]');
  var panel = document.querySelector('[data-mod]');
  var rows = document.querySelector('[data-rows]');
  var status = document.querySelector('[data-status]');
  var roomSelect = document.querySelector('[data-room-filter]');

  function token() { try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; } }

  function api(path, options) {
    options = options || {};
    options.headers = Object.assign({ 'content-type': 'application/json', 'x-admin-token': token() }, options.headers || {});
    return fetch('/api' + path, options).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ').');
        return data;
      });
    });
  }

  function say(message, bad) {
    status.textContent = message || '';
    status.className = 'muted' + (bad ? ' form-error' : '');
  }

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

  function button(label, kind, onClick) {
    var b = el('button', { class: 'btn btn--small ' + kind, type: 'button', text: label });
    b.addEventListener('click', onClick);
    return b;
  }

  function patch(id, body, after) {
    api('/admin/threads/' + id, { method: 'PATCH', body: JSON.stringify(body) })
      .then(function () { say(after); load(); })
      .catch(function (err) { say(err.message, true); });
  }

  function render(threads) {
    rows.innerHTML = '';

    if (!threads.length) {
      rows.appendChild(el('p', { class: 'muted', text: 'No threads in this room yet.' }));
      return;
    }

    threads.forEach(function (t) {
      var hidden = t.status === 'hidden';

      var meta = [t.room, t.replyCount + (t.replyCount === 1 ? ' reply' : ' replies'), t.status];
      if (t.newHere) meta.push('pinned as new here');
      if (t.email) meta.push(t.email);

      var acts = el('div', { class: 'mod-row__acts' }, [
        el('a', { class: 'btn btn--small btn--ghost', href: 'thread.html?id=' + t.id, text: 'Open' }),
        button(hidden ? 'Unhide' : 'Hide', 'btn--ghost', function () {
          patch(t.id, { status: hidden ? 'open' : 'hidden' }, hidden ? 'Thread is visible again.' : 'Thread hidden.');
        }),
        button(t.status === 'answered' ? 'Mark open' : 'Mark answered', 'btn--ghost', function () {
          patch(t.id, { status: t.status === 'answered' ? 'open' : 'answered' }, 'Status changed.');
        }),
        button(t.newHere ? 'Unpin' : 'Pin as new', 'btn--ghost', function () {
          patch(t.id, { newHere: !t.newHere }, t.newHere ? 'Unpinned.' : 'Pinned to the top of its room.');
        }),
        button('Edit', 'btn--ghost', function () {
          var title = window.prompt('Title', t.title);
          if (title === null) return;
          var body = window.prompt('Body', t.body);
          if (body === null) return;
          patch(t.id, { title: title, body: body }, 'Thread edited.');
        }),
        button('Delete', 'btn--danger', function () {
          if (!window.confirm('Delete "' + t.title + '" and all its replies? This cannot be undone.')) return;
          api('/admin/threads/' + t.id, { method: 'DELETE' })
            .then(function () { say('Thread deleted.'); load(); })
            .catch(function (err) { say(err.message, true); });
        }),
      ]);

      rows.appendChild(el('div', { class: 'mod-row', 'data-hidden': hidden ? 'true' : 'false' }, [
        el('div', { class: 'mod-row__main' }, [
          el('strong', { text: t.title }),
          el('p', { class: 'muted', text: meta.join(' · ') }),
          el('p', { class: 'muted', text: t.body.slice(0, 180) + (t.body.length > 180 ? '…' : '') }),
        ]),
        acts,
      ]));
    });
  }

  function load() {
    var room = roomSelect ? roomSelect.value : 'all';
    api('/admin/threads?room=' + encodeURIComponent(room))
      .then(function (data) { say(''); render(data.threads); })
      .catch(function (err) {
        say(err.message, true);
        if (/not authorised/i.test(err.message)) { lock(); }
      });
  }

  /* ── subscribers ──────────────────────────────────────── */

  var subsCount = document.querySelector('[data-subs-count]');
  var subsList = document.querySelector('[data-subs-list]');
  var subsToggle = document.querySelector('[data-subs-toggle]');
  var subsCsv = document.querySelector('[data-subs-csv]');

  function loadSubscribers() {
    api('/admin/subscribers')
      .then(function (data) {
        subsCount.textContent = data.count === 0
          ? 'Nobody has signed up yet.'
          : data.count + (data.count === 1 ? ' person has' : ' people have') + ' asked for the Friday email.';

        subsList.innerHTML = '';
        data.subscribers.forEach(function (s) {
          subsList.appendChild(el('p', {
            class: 'muted',
            text: (s.name ? s.name + ' \u00b7 ' : '') + s.email + ' \u00b7 via ' + s.source + ' \u00b7 ' + s.created_at.slice(0, 10),
          }));
        });
      })
      .catch(function (err) { subsCount.textContent = err.message; });
  }

  if (subsToggle) {
    subsToggle.addEventListener('click', function () {
      subsList.hidden = !subsList.hidden;
      subsToggle.textContent = subsList.hidden ? 'Show them' : 'Hide them';
    });
  }

  if (subsCsv) {
    subsCsv.addEventListener('click', function () {
      fetch('/api/admin/subscribers?format=csv', { headers: { 'x-admin-token': token() } })
        .then(function (res) { return res.ok ? res.blob() : Promise.reject(new Error('Could not fetch the list.')); })
        .then(function (blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = 'commons-subscribers.csv';
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        })
        .catch(function (err) { say(err.message, true); });
    });
  }

  function unlock() { gate.hidden = true; panel.hidden = false; load(); loadSubscribers(); }

  function lock() {
    try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    gate.hidden = false;
    panel.hidden = true;
  }

  document.querySelector('[data-gate-form]').addEventListener('submit', function (event) {
    event.preventDefault();
    var value = event.target.querySelector('input').value.trim();
    if (!value) return;
    try { sessionStorage.setItem(KEY, value); } catch (e) { /* ignore */ }
    unlock();
  });

  var signOut = document.querySelector('[data-sign-out]');
  if (signOut) signOut.addEventListener('click', lock);

  if (roomSelect) roomSelect.addEventListener('change', load);

  if (token()) unlock();
})();
