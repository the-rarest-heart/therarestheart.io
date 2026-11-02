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

      var repliesBox = el('div', { class: 'stack stack--sm' });
      repliesBox.hidden = true;

      function loadReplies() {
        repliesBox.innerHTML = '';
        fetch('/api/threads/' + t.id)
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (!data.replies || !data.replies.length) {
              repliesBox.appendChild(el('p', { class: 'muted', text: 'No replies on this one.' }));
              return;
            }
            data.replies.forEach(function (r) {
              var hide = button('Hide', 'btn--ghost', function () {
                api('/admin/replies/' + r.id, { method: 'PATCH', body: JSON.stringify({ status: 'hidden' }) })
                  .then(function () { say('Reply hidden.'); loadReplies(); })
                  .catch(function (err) { say(err.message, true); });
              });
              var del = button('Delete', 'btn--danger', function () {
                if (!window.confirm('Delete the reply from ' + r.author + '? This cannot be undone.')) return;
                api('/admin/replies/' + r.id, { method: 'DELETE' })
                  .then(function () { say('Reply deleted.'); loadReplies(); load(); })
                  .catch(function (err) { say(err.message, true); });
              });
              var replyFiles = filesPanel('reply', r.id);

              repliesBox.appendChild(el('div', { class: 'mod-row' }, [
                el('div', { class: 'mod-row__main' }, [
                  el('strong', { text: r.author }),
                  el('p', { class: 'muted', text: r.body.slice(0, 160) + (r.body.length > 160 ? '\u2026' : '') }),
                  replyFiles.box,
                ]),
                el('div', { class: 'mod-row__acts' }, [
                  button('Files', 'btn--ghost', replyFiles.toggle),
                  hide,
                  del,
                ]),
              ]));
            });
          })
          .catch(function () {
            repliesBox.appendChild(el('p', { class: 'muted form-error', text: 'Could not load the replies.' }));
          });
      }

      var threadFiles = filesPanel('thread', t.id);

      var acts = el('div', { class: 'mod-row__acts' }, [
        el('a', { class: 'btn btn--small btn--ghost', href: 'thread.html?id=' + t.id, text: 'Open' }),
        button('Files', 'btn--ghost', threadFiles.toggle),
        t.replyCount ? button('Replies (' + t.replyCount + ')', 'btn--ghost', function () {
          var opening = repliesBox.hidden;
          repliesBox.hidden = !opening;
          if (opening) loadReplies();
        }) : null,
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

      var rowEl = el('div', { class: 'mod-row', 'data-hidden': hidden ? 'true' : 'false' }, [
        el('div', { class: 'mod-row__main' }, [
          el('strong', { text: t.title }),
          el('p', { class: 'muted', text: meta.join(' · ') }),
          el('p', { class: 'muted', text: t.body.slice(0, 180) + (t.body.length > 180 ? '…' : '') }),
        ]),
        acts,
      ]);

      rows.appendChild(el('div', { class: 'stack stack--sm' }, [rowEl, threadFiles.box, repliesBox]));
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

  /* ── the files on a post ──────────────────────────────── */

  /**
   * One collapsible panel listing the media on a post, with a caption field,
   * Hide and Delete on each. Threads, replies and notes all use it, so a photo
   * is moderated the same way wherever it was posted.
   */
  function filesPanel(kind, id, onChange) {
    var box = el('div', { class: 'stack stack--sm' });
    box.hidden = true;

    function load() {
      box.innerHTML = '';
      api('/admin/attachments?kind=' + kind + '&id=' + id)
        .then(function (data) {
          if (!data.attachments.length) {
            box.appendChild(el('p', { class: 'muted', text: 'No files on this one.' }));
            return;
          }

          data.attachments.forEach(function (a) {
            var caption = el('input', {
              type: 'text',
              class: 'input input--small',
              placeholder: 'Caption (optional)',
              value: a.caption || '',
              maxlength: '300',
            });

            var save = button('Save caption', 'btn--ghost', function () {
              api('/admin/attachments/' + a.id, {
                method: 'PATCH',
                body: JSON.stringify({ caption: caption.value }),
              })
                .then(function () { say('Caption saved.'); })
                .catch(function (err) { say(err.message, true); });
            });

            var hide = button(a.status === 'hidden' ? 'Unhide' : 'Hide', 'btn--ghost', function () {
              api('/admin/attachments/' + a.id, {
                method: 'PATCH',
                body: JSON.stringify({ status: a.status === 'hidden' ? 'visible' : 'hidden' }),
              })
                .then(function () { say(a.status === 'hidden' ? 'File is visible again.' : 'File hidden.'); load(); })
                .catch(function (err) { say(err.message, true); });
            });

            var del = button('Delete', 'btn--danger', function () {
              if (!window.confirm('Delete ' + a.filename + '? The file itself goes too, and that cannot be undone.')) return;
              api('/admin/attachments/' + a.id, { method: 'DELETE' })
                .then(function () { say('File deleted.'); load(); if (onChange) onChange(); })
                .catch(function (err) { say(err.message, true); });
            });

            box.appendChild(el('div', { class: 'mod-row', 'data-hidden': a.status === 'hidden' ? 'true' : 'false' }, [
              el('div', { class: 'mod-row__main' }, [
                el('strong', { text: a.filename }),
                el('p', { class: 'muted', text: a.media + ' · ' + window.TRHMedia.size(a.bytes) + ' · ' + a.status }),
                caption,
              ]),
              el('div', { class: 'mod-row__acts' }, [
                el('a', { class: 'btn btn--small btn--ghost', href: a.previewUrl || a.url, target: '_blank', rel: 'noopener', text: 'View' }),
                save, hide, del,
              ]),
            ]));
          });
        })
        .catch(function (err) {
          box.appendChild(el('p', { class: 'muted form-error', text: err.message }));
        });
    }

    return {
      box: box,
      toggle: function () {
        var opening = box.hidden;
        box.hidden = !opening;
        if (opening) load();
      },
    };
  }

  /* ── field notes ──────────────────────────────────────── */

  var noteForm = document.querySelector('[data-note-form]');
  var noteRows = document.querySelector('[data-note-rows]');
  var noteNote = noteForm && noteForm.querySelector('[data-note-note]');
  var noteMode = document.querySelector('[data-note-mode]');
  var buildField = document.querySelector('[data-build-state]');
  var cancelBtn = document.querySelector('[data-note-cancel]');
  var noteUpload = document.querySelector('[data-note-upload]');
  var notePicker = null;
  var editingId = null;

  function tellNote(message, bad) {
    if (!noteNote) return;
    noteNote.textContent = message || '';
    noteNote.className = 'muted' + (bad ? ' form-error' : '');
    noteNote.hidden = !message;
  }

  function toggleBuildField() {
    if (buildField) buildField.hidden = noteForm.kind.value !== 'build';
  }

  function resetNoteForm() {
    editingId = null;
    noteForm.reset();
    if (notePicker) notePicker.reset();
    toggleBuildField();
    if (noteMode) noteMode.textContent = 'Write a note';
    if (cancelBtn) cancelBtn.hidden = true;
    tellNote('');
  }

  function noteBody(status) {
    var payload = {
      kind: noteForm.kind.value,
      title: noteForm.title.value,
      summary: noteForm.summary.value,
      body: noteForm.body.value,
      buildState: noteForm.kind.value === 'build' ? noteForm.buildState.value : '',
      status: status,
    };
    // Files uploaded in this editing session; the ones already on the note are
    // managed from its row below, where they can be captioned or taken off.
    if (notePicker) Object.assign(payload, notePicker.payload());
    return payload;
  }

  function saveNote(status) {
    tellNote(status === 'published' ? 'Publishing\u2026' : 'Saving\u2026');

    var path = editingId ? '/admin/notes/' + editingId : '/admin/notes';
    var method = editingId ? 'PATCH' : 'POST';

    api(path, { method: method, body: JSON.stringify(noteBody(status)) })
      .then(function () {
        resetNoteForm();
        tellNote(status === 'published' ? 'Published. It is on the site now.' : 'Saved as a draft.');
        loadNotes();
      })
      .catch(function (err) { tellNote(err.message, true); });
  }

  function editNote(n) {
    editingId = n.id;
    noteForm.kind.value = n.kind;
    noteForm.title.value = n.title;
    noteForm.summary.value = n.summary || '';
    noteForm.body.value = n.body;
    if (n.buildState) noteForm.buildState.value = n.buildState;
    toggleBuildField();
    if (noteMode) noteMode.textContent = 'Editing: ' + n.title;
    if (cancelBtn) cancelBtn.hidden = false;
    tellNote('');
    noteForm.scrollIntoView({ block: 'start' });
  }

  function loadNotes() {
    api('/admin/notes')
      .then(function (data) {
        noteRows.innerHTML = '';

        if (!data.notes.length) {
          noteRows.appendChild(el('p', { class: 'muted', text: 'Nothing written yet.' }));
          return;
        }

        var KIND = { write: 'Writing', build: 'Build log', find: 'Research' };

        data.notes.forEach(function (n) {
          var live = n.status === 'published';
          var meta = [KIND[n.kind] || n.kind, n.status, n.readMinutes + ' min'];
          if (n.buildState) meta.push(n.buildState);

          var acts = el('div', { class: 'mod-row__acts' }, [
            live ? el('a', { class: 'btn btn--small btn--ghost', href: 'note.html?n=' + n.slug, text: 'View' }) : null,
            button(live ? 'Unpublish' : 'Publish', 'btn--ghost', function () {
              api('/admin/notes/' + n.id, { method: 'PATCH', body: JSON.stringify({ status: live ? 'draft' : 'published' }) })
                .then(function () { tellNote(live ? 'Back to draft.' : 'Published.'); loadNotes(); })
                .catch(function (err) { tellNote(err.message, true); });
            }),
            button('Files', 'btn--ghost', function () { noteFiles.toggle(); }),
            button('Edit', 'btn--ghost', function () { editNote(n); }),
            button('Delete', 'btn--danger', function () {
              if (!window.confirm('Delete "' + n.title + '"? This cannot be undone.')) return;
              api('/admin/notes/' + n.id, { method: 'DELETE' })
                .then(function () { tellNote('Deleted.'); loadNotes(); })
                .catch(function (err) { tellNote(err.message, true); });
            }),
          ]);

          var noteFiles = filesPanel('note', n.id);

          noteRows.appendChild(el('div', { class: 'stack stack--sm' }, [
            el('div', { class: 'mod-row', 'data-hidden': live ? 'false' : 'true' }, [
              el('div', { class: 'mod-row__main' }, [
                el('strong', { text: n.title }),
                el('p', { class: 'muted', text: meta.join(' \u00b7 ') }),
              ]),
              acts,
            ]),
            noteFiles.box,
          ]));
        });
      })
      .catch(function (err) { tellNote(err.message, true); });
  }

  if (noteForm) {
    noteForm.kind.addEventListener('change', toggleBuildField);
    noteForm.addEventListener('submit', function (event) { event.preventDefault(); saveNote('published'); });
    document.querySelector('[data-note-draft]').addEventListener('click', function () { saveNote('draft'); });
    if (cancelBtn) cancelBtn.addEventListener('click', resetNoteForm);
    toggleBuildField();
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

  function unlock() {
    gate.hidden = true;
    panel.hidden = false;
    // Built here, not at page load: the box asks the server what it may send,
    // and before you unlock there is no token to ask with.
    if (noteUpload && !notePicker) {
      notePicker = window.TRHMedia.picker(noteUpload, { admin: true, token: token });
    }
    load();
    loadNotes();
    loadSubscribers();
  }

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
