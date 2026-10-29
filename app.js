(function () {
  'use strict';

  var sheet = document.getElementById('sheet');
  var narrow = window.matchMedia('(max-width: 44rem)');
  var state = { gen: 0, selected: null };

  var plain = (function () {
    var d = document.createElement('div');
    try { d.contentEditable = 'plaintext-only'; } catch (e) {}
    return d.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true';
  })();

  var TITLE = 'Unsichtbare Technik';
  var P1 = 'Je selbstverständlicher proaktive Systeme und IoT-Geräte werden, etwa der Aufzug im Büro oder das Thermostat zuhause, desto weniger müssen wir mit Technik interagieren. Alles wird einfach zu Daten und fließt direkt in unsere persönlichen Systeme. Manuelle Eingabe gehört damit der Vergangenheit an.';
  var SEED_NOTE = 'Wenn die Umgebung alles über Daten vorwegnimmt: Verschwindet echte Interaktion mit Technik ganz, oder verlagert sie sich nur hinter die Kulissen?';
  var SEED_REPLY = 'Was meinst du damit?';
  var SEED_ANSWER = 'Du schreibst, dass wir kaum noch mit Technik interagieren müssen. Ich frage, ob die Interaktion wegfällt oder nur unsichtbar wird, denn dann entscheidet jemand anderes, was zu Daten wird.';

  var PLACEHOLDER = { p: 'Schreib einen Gedanken …', h1: 'Titel', li: 'Listenpunkt' };
  var MIN_THINKING_MS = 700;

  /* ---------- Hilfen ---------- */
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function text(blk) { return blk.textContent.replace(/ /g, ' '); }
  function shorten(s, n) {
    n = n || 70;
    s = s.replace(/[.!?\s]+$/, '');
    if (s.length <= n) return s;
    var cut = s.slice(0, n);
    return cut.slice(0, cut.lastIndexOf(' ') > 30 ? cut.lastIndexOf(' ') : n) + '…';
  }
  function sentences(t) {
    return (t.match(/[^.!?]+[.!?]*/g) || []).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function rows() { return Array.prototype.slice.call(sheet.querySelectorAll('.row')); }
  function placeCaret(blk, off) {
    blk.focus();
    var sel = window.getSelection(), r = document.createRange();
    var w = document.createTreeWalker(blk, NodeFilter.SHOW_TEXT), n, pos = 0, done = false;
    while ((n = w.nextNode())) {
      var len = n.nodeValue.length;
      if (off <= pos + len) { r.setStart(n, off - pos); done = true; break; }
      pos += len;
    }
    if (!done) { r.selectNodeContents(blk); r.collapse(false); } else r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }
  function caretOffset(blk) {
    var sel = window.getSelection();
    if (!sel.rangeCount || !blk.contains(sel.anchorNode)) return text(blk).length;
    var r = document.createRange();
    r.selectNodeContents(blk);
    r.setEnd(sel.anchorNode, sel.anchorOffset);
    return r.toString().replace(/ /g, ' ').length;
  }
  function atEdge(blk, dir) {
    var sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return false;
    var lh = parseFloat(getComputedStyle(blk).lineHeight) || 24;
    var b = blk.getBoundingClientRect();
    var rr = sel.getRangeAt(0).getClientRects()[0];
    if (!rr) return true;
    return dir < 0 ? rr.top - b.top < lh * 0.9 : b.bottom - rr.bottom < lh * 0.9;
  }

  /* ---------- Blöcke ---------- */
  function setType(row, type) {
    row.dataset.type = type;
    row._blk.dataset.placeholder = row._replyTo ? 'Deine Antwort …' : PLACEHOLDER[type];
  }
  function makeRow(type) {
    var row = el('section', 'row');
    var me = el('div', 'cell cell--me');
    var body = el('div', 'body');
    var blk = el('div', 'blk');
    blk.contentEditable = plain;
    blk.setAttribute('role', 'textbox');
    blk.setAttribute('aria-label', 'Dein Gedanke');
    blk.spellcheck = true;
    blk.lang = 'de';
    body.append(blk);
    me.append(body);
    var ai = el('div', 'cell cell--ai');
    ai.setAttribute('aria-live', 'polite');
    row.append(me, ai);
    row._blk = blk; row._ai = ai;
    setType(row, type || 'p');
    return row;
  }
  function addRow(after, type, txt) {
    var row = makeRow(type);
    if (txt) row._blk.textContent = txt;
    if (after) after.after(row); else sheet.append(row);
    return row;
  }
  function removeRow(row) {
    if (state.selected === row) state.selected = null;
    row.remove();
    if (!sheet.querySelector('.row')) addRow(null, 'p');
  }

  /* ---------- Auswahl (Esc) ---------- */
  function clearSel() {
    if (state.selected) state.selected.classList.remove('is-selected');
    state.selected = null;
  }
  function selectRow(row) {
    clearSel();
    state.selected = row;
    row.classList.add('is-selected');
    if (document.activeElement && document.activeElement !== sheet) document.activeElement.blur();
    sheet.focus({ preventScroll: true });
    row.scrollIntoView({ block: 'nearest' });
  }

  /* ---------- Gedanken der KI ---------- */
  function updateHasNotes(row) {
    row.classList.toggle('has-notes', !!row._ai.querySelector('.note'));
  }
  function renderNote(row, txt, anchor, instant) {
    var art = el('p', 'note', txt);
    art.tabIndex = 0;
    art.setAttribute('role', 'button');
    art.title = 'Klicken, um zu antworten';
    art._note = { row: row, text: txt, anchor: anchor || null, el: art };
    row._ai.appendChild(art);
    if (instant) art.classList.add('is-in');
    else requestAnimationFrame(function () { requestAnimationFrame(function () { art.classList.add('is-in'); }); });
    updateHasNotes(row);
    return art._note;
  }
  function thinking() {
    var t = el('div', 'thinking');
    t.setAttribute('aria-label', 'Die KI überlegt');
    t.append(el('i'), el('i'), el('i'));
    return t;
  }

  /* Gesprächsverlauf bis einschließlich dieser Zeile, abwechselnd Nutzer und KI */
  function buildMessages(upTo) {
    var msgs = [];
    function push(role, t) {
      var last = msgs[msgs.length - 1];
      if (last && last.role === role) last.text += '\n' + t; else msgs.push({ role: role, text: t });
    }
    var list = rows();
    for (var i = 0; i < list.length; i++) {
      var r = list[i], t = text(r._blk).trim();
      if (t) push('user', r.dataset.type === 'h1' ? 'Titel: ' + t : t);
      if (r === upTo) break;
      r._ai.querySelectorAll('.note').forEach(function (n) { push('model', n._note.text); });
    }
    var total = 0;
    msgs = msgs.slice(-24).map(function (m) { return { role: m.role, text: m.text.slice(0, 1500) }; });
    return msgs.filter(function (m) { total += m.text.length; return total < 8000; });
  }

  function clean(t) {
    t = String(t || '').replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ').trim();
    if (t.length > 260) {
      var cut = t.slice(0, 260), end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
      t = end > 80 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(' ')) + '…';
    }
    return t;
  }
  function fetchThought(messages) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 15000);
    return fetch('/api/think', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages }),
      signal: ctrl.signal
    }).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (j) {
      if (!j || !j.text) throw new Error('empty');
      return j.text;
    });
  }

  /* Notfall, wenn der Server nicht antwortet (zum Beispiel noch kein Schlüssel hinterlegt): wenige kurze Fragen aus Regeln */
  function localThought(row, txt) {
    if (row._replyTo) return 'Und wenn das Gegenteil stimmt, was ändert sich dann?';
    var low = txt.toLowerCase(), m;
    if (/interaktion|interagier/.test(low) && /technik|daten|system/.test(low)) return SEED_NOTE;
    m = low.match(/\b(immer|nie|niemals|alle|alles|jeder|jede|niemand|nichts|stets|überall)\b/);
    if (m) return '„' + m[0] + '“? Fällt dir ein Fall ein, in dem das nicht stimmt?';
    m = low.match(/\b(einfach|besser|gut|schlecht|intuitiv|modern|smart|wichtig|klar)\b/);
    if (m) return 'Was heißt „' + m[0] + '“ hier konkret?';
    if (txt.length >= 60) return 'Was wäre das Gegenteil davon, und wer würde es vertreten?';
    return '';
  }

  function requestThought(row) {
    var txt = text(row._blk).trim();
    if (row.dataset.type === 'h1' || !txt) return;
    var gen = state.gen, started = Date.now();
    var th = thinking();
    row._ai.appendChild(th);
    function show(t) {
      setTimeout(function () {
        if (gen !== state.gen) return;
        th.remove();
        if (row.isConnected && t) renderNote(row, t, txt);
        else updateHasNotes(row);
      }, Math.max(0, MIN_THINKING_MS - (Date.now() - started)));
    }
    fetchThought(buildMessages(row))
      .then(function (t) { show(clean(t)); })
      .catch(function () { show(localThought(row, txt)); });
  }

  function openReply(note) {
    if (note.replyRow && note.replyRow.isConnected) { placeCaret(note.replyRow._blk, Infinity); return; }
    var r = makeRow('p');
    r._replyTo = note;
    r._blk.dataset.placeholder = 'Deine Antwort …';
    note.row.after(r);
    note.replyRow = r;
    placeCaret(r._blk, Infinity);
  }

  /* ---------- Schreiben ---------- */
  function enter(row) {
    var full = text(row._blk), off = caretOffset(row._blk);
    if (row.dataset.type === 'li' && !full.trim()) { setType(row, 'p'); return; }
    var before = full.slice(0, off), after = full.slice(off);
    row._blk.textContent = before;
    var nr = addRow(row, row.dataset.type === 'li' ? 'li' : 'p', after);
    requestThought(row);
    placeCaret(nr._blk, 0);
    return nr;
  }
  function backspaceAtStart(row, e) {
    if (row.dataset.type !== 'p') { e.preventDefault(); setType(row, 'p'); return; }
    var prev = row.previousElementSibling;
    if (!prev) return;
    e.preventDefault();
    var mine = text(row._blk), prevText = text(prev._blk);
    if (!mine) { removeRow(row); placeCaret(prev._blk, Infinity); return; }
    if (prev._ai.querySelector('.note') || row._ai.querySelector('.note')) { placeCaret(prev._blk, Infinity); return; }
    prev._blk.textContent = prevText + mine;
    removeRow(row);
    placeCaret(prev._blk, prevText.length);
  }

  sheet.addEventListener('input', function (e) {
    var blk = e.target.closest && e.target.closest('.blk');
    if (!blk) return;
    var row = blk.closest('.row');
    if (blk.textContent === '') blk.innerHTML = '';
    if (row.dataset.type === 'p') {
      var m = /^(#|-|\*) /.exec(text(blk));
      if (m) {
        var rest = text(blk).slice(m[0].length);
        setType(row, m[1] === '#' ? 'h1' : 'li');
        blk.textContent = rest;
        placeCaret(blk, 0);
      }
    }
  });

  sheet.addEventListener('keydown', function (e) {
    var blk = e.target.closest && e.target.closest('.blk');

    /* Block ist markiert (Esc) */
    if (!blk && state.selected && e.target === sheet) {
      var sel = state.selected;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        var sib = e.key === 'ArrowUp' ? sel.previousElementSibling : sel.nextElementSibling;
        if (sib) selectRow(sib);
      } else if (e.key === 'Enter') {
        e.preventDefault(); clearSel(); placeCaret(sel._blk, Infinity);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        var list = rows(), idx = list.indexOf(sel);
        var next = list[idx + 1] || list[idx - 1];
        removeRow(sel);
        if (next && next.isConnected) selectRow(next); else clearSel();
      } else if (e.key === 'Escape') {
        clearSel();
      }
      return;
    }
    if (!blk) {
      var note = e.target.closest && e.target.closest('.note');
      if (note && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openReply(note._note); }
      return;
    }

    var row = blk.closest('.row');
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!text(blk).trim() && row.dataset.type !== 'li') return;
      enter(row);
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); selectRow(row); return; }
    if (e.key === 'Backspace' && window.getSelection().isCollapsed && caretOffset(blk) === 0) {
      backspaceAtStart(row, e);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      var d = e.key === 'ArrowUp' ? -1 : 1;
      var other = d < 0 ? row.previousElementSibling : row.nextElementSibling;
      if (other && atEdge(blk, d)) { e.preventDefault(); placeCaret(other._blk, Infinity); }
    }
  });

  sheet.addEventListener('paste', function (e) {
    var blk = e.target.closest && e.target.closest('.blk');
    if (!blk) return;
    e.preventDefault();
    var t = ((e.clipboardData || window.clipboardData).getData('text') || '').replace(/\s+/g, ' ');
    document.execCommand('insertText', false, t);
  });

  sheet.addEventListener('pointerdown', function (e) {
    if (e.target.closest && e.target.closest('.blk')) clearSel();
  });
  sheet.addEventListener('click', function (e) {
    var note = e.target.closest('.note');
    if (note) openReply(note._note);
  });

  /* Beim Berühren eines Gedankens leuchtet der Block auf, auf den er sich bezieht */
  var hasHL = !!(window.CSS && CSS.highlights && typeof Highlight !== 'undefined');
  function anchorRange(blk, anchor) {
    if (!anchor) return null;
    var t = text(blk), i = t.indexOf(anchor);
    if (i < 0) return null;
    var e = i + anchor.length, w = document.createTreeWalker(blk, NodeFilter.SHOW_TEXT);
    var r = document.createRange(), pos = 0, node, started = false;
    while ((node = w.nextNode())) {
      var len = node.nodeValue.length;
      if (!started && i < pos + len) { r.setStart(node, i - pos); started = true; }
      if (started && e <= pos + len) { r.setEnd(node, e - pos); return r; }
      pos += len;
    }
    return null;
  }
  function highlight(n) {
    if (!n || !n.anchor) return;
    if (hasHL) {
      var r = anchorRange(n.row._blk, n.anchor);
      if (r) CSS.highlights.set('anchor', new Highlight(r));
    } else n.row._blk.classList.add('is-linked');
  }
  function clearHL() {
    if (hasHL) CSS.highlights.delete('anchor');
    sheet.querySelectorAll('.is-linked').forEach(function (x) { x.classList.remove('is-linked'); });
  }
  ['pointerover', 'focusin'].forEach(function (ev) {
    sheet.addEventListener(ev, function (e) { var a = e.target.closest && e.target.closest('.note'); if (a) highlight(a._note); });
  });
  ['pointerout', 'focusout'].forEach(function (ev) {
    sheet.addEventListener(ev, function (e) { if (e.target.closest && e.target.closest('.note')) clearHL(); });
  });

  /* ---------- Startzustand: dein Beispiel ---------- */
  function seed() {
    addRow(null, 'h1', TITLE);
    var r1 = addRow(sheet.lastElementChild, 'p', P1);
    var n1 = renderNote(r1, SEED_NOTE, P1, true);
    var rr = makeRow('p');
    rr._replyTo = n1;
    rr._blk.dataset.placeholder = 'Deine Antwort …';
    rr._blk.textContent = SEED_REPLY;
    r1.after(rr);
    n1.replyRow = rr;
    renderNote(rr, SEED_ANSWER, SEED_REPLY, true);
    addRow(rr, 'p');
  }
  seed();
})();
