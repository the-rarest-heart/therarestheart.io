/**
 * Attachments — the upload box and the thing that draws media back out.
 *
 * Shared by the Commons, the Field Notes and the admin screen, so a photo
 * behaves the same wherever it was posted. Plain JS, no dependencies, same as
 * the rest of the site.
 *
 *   TRHMedia.picker(root, opts)  → an upload box wired into a form
 *   TRHMedia.render(list)        → a node holding the media of one post
 */
window.TRHMedia = (function () {
  'use strict';

  // One request can carry 95 MB. Anything heavier goes up in parts, which
  // only you can do — see UPLOADS in _worker.js.
  var SIMPLE_MAX = 95 * 1024 * 1024;

  var ACCEPT = {
    everyone: 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.md',
    admin: 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.md',
  };

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (attrs[k] !== null && attrs[k] !== false) n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  function mb(bytes) { return Math.round(bytes / (1024 * 1024)) + ' MB'; }

  function size(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    var mb = bytes / (1024 * 1024);
    return (mb < 10 ? mb.toFixed(1) : Math.round(mb)) + ' MB';
  }

  /**
   * Who is uploading, as far as the server is concerned. It is only ever used
   * to tie this browser's uploads to the post it is about to make.
   */
  function session() {
    var key = 'trh-upload-session';
    var id;
    try { id = window.sessionStorage.getItem(key); } catch (e) { /* private mode */ }
    if (!id) {
      id = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : String(Date.now()) + '-' + Math.random().toString(36).slice(2, 12);
      try { window.sessionStorage.setItem(key, id); } catch (e) { /* fine */ }
    }
    return id;
  }

  function adminHeader(opts) {
    var admin = opts && (typeof opts.token === 'function' ? opts.token() : opts.token);
    return admin ? { 'x-admin-token': admin } : {};
  }

  /**
   * XHR rather than fetch, for one reason: fetch cannot tell you how far an
   * upload has got, and a video on a phone connection needs a progress bar.
   */
  function send(method, url, body, opts, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      xhr.setRequestHeader('x-upload-session', session());

      // The admin token is read at send time, not when the box was built —
      // the page draws its editor before you have unlocked it.
      var admin = adminHeader(opts)['x-admin-token'];
      if (admin) xhr.setRequestHeader('x-admin-token', admin);
      if (body && typeof body === 'string') xhr.setRequestHeader('content-type', 'application/json');

      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = function (e) {
          if (e.lengthComputable) onProgress(e.loaded / e.total);
        };
      }

      xhr.onload = function () {
        var data = {};
        try { data = JSON.parse(xhr.responseText); } catch (e) { /* no body */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || 'That upload failed (' + xhr.status + ').'));
      };
      xhr.onerror = function () { reject(new Error('The connection dropped mid-upload.')); };
      xhr.onabort = function () { reject(new Error('Upload cancelled.')); };

      xhr.send(body);
      if (opts) opts.xhr = xhr;
    });
  }

  function uploadWhole(file, opts, onProgress) {
    return send('POST', '/api/uploads?name=' + encodeURIComponent(file.name), file, opts, onProgress);
  }

  /** Big files, a slice at a time, so no single request is too large. */
  function uploadInParts(file, opts, onProgress) {
    var name = encodeURIComponent(file.name);
    return send('POST', '/api/uploads/multipart?name=' + name, null, opts)
      .then(function (start) {
        var chunk = start.partBytes || 32 * 1024 * 1024;
        var total = Math.ceil(file.size / chunk);
        var parts = [];

        function nextPart(n) {
          if (n > total) return Promise.resolve();
          var slice = file.slice((n - 1) * chunk, Math.min(n * chunk, file.size));
          var url = '/api/uploads/multipart?key=' + encodeURIComponent(start.key) +
            '&uploadId=' + encodeURIComponent(start.uploadId) + '&part=' + n;

          return send('PUT', url, slice, opts, function (fraction) {
            if (onProgress) onProgress((n - 1 + fraction) / total);
          }).then(function (done) {
            parts.push({ partNumber: done.partNumber, etag: done.etag });
            return nextPart(n + 1);
          });
        }

        return nextPart(1)
          .then(function () {
            return send('POST', '/api/uploads/multipart/complete', JSON.stringify({
              key: start.key,
              uploadId: start.uploadId,
              name: file.name,
              parts: parts,
            }), opts);
          })
          .catch(function (err) {
            // Leave no half-finished upload paying for storage.
            send('DELETE', '/api/uploads/multipart?key=' + encodeURIComponent(start.key) +
              '&uploadId=' + encodeURIComponent(start.uploadId), null, opts).catch(function () {});
            throw err;
          });
      });
  }

  function upload(file, opts, onProgress) {
    return (file.size > SIMPLE_MAX && opts.admin)
      ? uploadInParts(file, opts, onProgress)
      : uploadWhole(file, opts, onProgress);
  }

  /* ── drawing media back out ───────────────────────────── */

  function docLabel(a) {
    var ext = (a.filename.match(/\.([A-Za-z0-9]{1,5})$/) || ['', 'file'])[1].toUpperCase();
    return ext + ' · ' + size(a.bytes);
  }

  function one(a) {
    var cap = a.caption ? el('figcaption', { text: a.caption }) : null;

    if (a.media === 'image') {
      return el('figure', { class: 'media media--image' }, [
        el('a', { href: a.url, target: '_blank', rel: 'noopener' }, [
          el('img', { src: a.url, alt: a.caption || a.filename, loading: 'lazy', decoding: 'async' }),
        ]),
        cap,
      ]);
    }

    if (a.media === 'video') {
      return el('figure', { class: 'media media--video' }, [
        el('video', { controls: 'controls', preload: 'metadata', playsinline: 'playsinline', src: a.url }),
        cap,
      ]);
    }

    if (a.media === 'audio') {
      return el('figure', { class: 'media media--audio' }, [
        el('audio', { controls: 'controls', preload: 'metadata', src: a.url }),
        cap || el('figcaption', { text: a.filename }),
      ]);
    }

    return el('figure', { class: 'media media--doc' }, [
      el('a', { class: 'media-doc', href: a.url, download: a.filename }, [
        el('span', { class: 'media-doc__name', text: a.caption || a.filename }),
        el('span', { class: 'media-doc__meta', text: docLabel(a) }),
      ]),
    ]);
  }

  function render(list) {
    if (!list || !list.length) return null;
    var images = list.filter(function (a) { return a.media === 'image'; }).length;
    var set = el('div', {
      class: 'media-set' + (images === list.length && images > 1 ? ' media-set--grid' : ''),
    });
    list.forEach(function (a) { set.appendChild(one(a)); });
    return set;
  }

  /* ── the upload box ───────────────────────────────────── */

  /**
   * Hangs an upload box inside `root`. Files go up as soon as they are chosen,
   * so by the time the post is submitted there is nothing left to wait for —
   * the form sends their ids and the server hands them over to the new post.
   */
  function picker(root, options) {
    var opts = options || {};
    var admin = !!opts.admin;
    var max = opts.max || (admin ? 16 : 4);
    var chosen = [];

    var input = el('input', {
      type: 'file',
      multiple: 'multiple',
      accept: opts.accept || (admin ? ACCEPT.admin : ACCEPT.everyone),
      id: 'files-' + Math.random().toString(36).slice(2, 8),
      class: 'visually-hidden',
    });

    var button = el('label', { class: 'btn btn--ghost btn--small', for: input.id, text: 'Add a file' });
    var hint = el('p', { class: 'muted small', text: 'Checking what you can send\u2026' });
    var list = el('div', { class: 'stack stack--sm' });
    var status = el('p', { class: 'muted small', hidden: 'hidden' });

    var box = el('div', { class: 'upload stack stack--sm' }, [
      el('div', { class: 'row row--tight' }, [button, input]),
      hint,
      list,
      status,
    ]);
    box.hidden = true;
    root.appendChild(box);

    // Hiding the box alone left its label — "Anything to show" — stranded on
    // the form with nothing underneath it. Hide the whole field.
    var field = root.closest ? root.closest('.field') : null;
    if (field) field.hidden = true;

    // Ask the server what is allowed before offering a button. If there is
    // nowhere to put a file, say nothing rather than offering a dead button.
    fetch('/api/uploads', { headers: adminHeader(opts) })
      .then(function (res) { return res.json(); })
      .then(function (limits) {
        if (!limits.enabled) return;
        max = limits.perPost;
        hint.textContent = limits.media.indexOf('video') >= 0
          ? 'Images, video, audio, PDFs and Office documents. Anything over ' +
            mb(limits.maxBytes) + ' goes up in parts.'
          : 'Images and documents, up to ' + mb(limits.maxBytes) + ' each, ' + max + ' per post.';
        box.hidden = false;
        if (field) field.hidden = false;
      })
      .catch(function () { /* no upload box, and the form still works */ });

    function say(message, bad) {
      status.textContent = message || '';
      status.className = 'muted small' + (bad ? ' form-error' : '');
      status.hidden = !message;
    }

    function redraw() {
      list.innerHTML = '';
      chosen.forEach(function (item, i) {
        var caption = el('input', {
          type: 'text',
          class: 'input input--small',
          placeholder: 'Caption (optional)',
          value: item.caption || '',
          maxlength: '300',
        });
        caption.addEventListener('input', function () { item.caption = caption.value; });

        var move = el('div', { class: 'row row--tight' }, [
          i > 0 ? el('button', { type: 'button', class: 'btn btn--ghost btn--small', text: 'Up' }) : null,
          i < chosen.length - 1 ? el('button', { type: 'button', class: 'btn btn--ghost btn--small', text: 'Down' }) : null,
          el('button', { type: 'button', class: 'btn btn--ghost btn--small', text: 'Remove' }),
        ]);

        var buttons = move.querySelectorAll('button');
        Array.prototype.forEach.call(buttons, function (b) {
          b.addEventListener('click', function () {
            var at = chosen.indexOf(item);
            if (b.textContent === 'Up') chosen.splice(at - 1, 0, chosen.splice(at, 1)[0]);
            else if (b.textContent === 'Down') chosen.splice(at + 1, 0, chosen.splice(at, 1)[0]);
            else chosen.splice(at, 1);
            redraw();
          });
        });

        list.appendChild(el('div', { class: 'upload__row' }, [
          el('div', { class: 'upload__what' }, [
            el('span', { class: 'pill pill--tag', text: item.media }),
            el('span', { class: 'upload__name', text: item.filename }),
            el('span', { class: 'muted small', text: size(item.bytes) }),
          ]),
          caption,
          move,
        ]));
      });
    }

    function take(files) {
      var queue = Array.prototype.slice.call(files);
      if (!queue.length) return;

      if (chosen.length + queue.length > max) {
        say('That would be more than ' + max + ' files on one post.', true);
        queue = queue.slice(0, Math.max(0, max - chosen.length));
        if (!queue.length) return;
      }

      button.classList.add('is-busy');

      function nextFile() {
        var file = queue.shift();
        if (!file) {
          button.classList.remove('is-busy');
          say('');
          return;
        }

        var label = file.name + ' (' + size(file.size) + ')';
        say('Uploading ' + label + '…');

        return upload(file, { admin: admin, token: opts.token }, function (fraction) {
          say('Uploading ' + label + ' — ' + Math.round(fraction * 100) + '%');
        })
          .then(function (data) {
            chosen.push(Object.assign({ caption: '' }, data.attachment));
            redraw();
            return nextFile();
          })
          .catch(function (err) {
            button.classList.remove('is-busy');
            say(err.message, true);
          });
      }

      nextFile();
    }

    input.addEventListener('change', function () {
      take(input.files);
      input.value = '';
    });

    return {
      /** What the form sends: the ids, in the order they are shown. */
      payload: function () {
        return {
          uploadSession: session(),
          attachments: chosen.map(function (a) { return a.id; }),
          captions: chosen.map(function (a) { return { id: a.id, caption: a.caption || '' }; }),
        };
      },
      count: function () { return chosen.length; },
      load: function (list) {
        chosen = (list || []).map(function (a) { return Object.assign({}, a); });
        redraw();
      },
      reset: function () { chosen = []; redraw(); say(''); },
    };
  }

  return { picker: picker, render: render, session: session, size: size, upload: upload };
})();
