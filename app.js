(function () {
  'use strict';

  var book = document.getElementById('book');
  var spreadsEl = document.getElementById('spreads');
  var leafSlot = document.getElementById('leafslot');
  var tabsL = document.getElementById('tabsL');
  var tabsR = document.getElementById('tabsR');
  var delBtn = document.getElementById('del');
  var prevBtn = document.getElementById('prev');
  var nextBtn = document.getElementById('next');
  var root = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var STORE = 'sparring.v3', OLD_STORE = 'sparring.v2';
  var TAB_COLORS = ['#c8553d', '#e0b13b', '#6f9a8d', '#5b7aa3', '#b86b87', '#8c7bb3'];
  /* docs = Notizen (jede mit eigenem Klebereiter), jede Notiz besteht aus einer oder mehreren Doppelseiten */
  var state = { docs: [], cur: 0, tabCur: 0, selected: null, uid: 0, noteIndex: {}, saveTimer: null, single: false, lines: 0, L: 36, ready: false, flip: null, pending: null, queued: null };

  var plain = (function () {
    var d = document.createElement('div');
    try { d.contentEditable = 'plaintext-only'; } catch (e) {}
    return d.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true';
  })();

  var PLACEHOLDER = { p: 'Schreib einen Gedanken …', h1: 'Titel', li: 'Listenpunkt' };
  var SEED = [
    { type: 'h1', text: 'Unsichtbare Technik' },
    { type: 'p', text: 'Je selbstverständlicher proaktive Systeme und IoT-Geräte werden, etwa der Aufzug im Büro oder das Thermostat zuhause, desto weniger müssen wir mit Technik interagieren. Alles wird einfach zu Daten und fließt direkt in unsere persönlichen Systeme. Manuelle Eingabe gehört damit der Vergangenheit an.',
      notes: [{ id: 'seed-1', text: 'Mark Weiser nannte das 1991 „Ubiquitous Computing“: Technik, die verschwindet. Der Preis: Wer nichts mehr bedient, merkt auch nicht mehr, wann für ihn entschieden wird.' }] },
    { type: 'p', text: 'Was meinst du damit?', replyTo: 'seed-1',
      notes: [{ id: 'seed-2', text: 'Dass unsichtbare Technik nicht neutral ist: Das Thermostat, das vorausschauend heizt, hat schon entschieden, was du brauchst. Bedienen war auch ein Moment, in dem du Nein sagen konntest.' }] },
    { type: 'p', text: '' }
  ];

  /* ---------- Hilfen ---------- */
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function newId() { return 'n' + Date.now().toString(36) + (++state.uid); }
  function text(blk) { return blk.textContent.replace(/ /g, ' '); }
  function rowsIn(sp) { return Array.prototype.filter.call(sp.sheet.children, function (c) { return c.classList.contains('row'); }); }
  function flat() { var a = []; state.docs.forEach(function (d) { d.spreads.forEach(function (s) { a.push(s); }); }); return a; }
  function docRows(doc) { var out = []; doc.spreads.forEach(function (s) { out.push.apply(out, rowsIn(s)); }); return out; }
  function spreadOf(row) { var s = row.closest('.spread'); return s && s._sp; }
  function docOf(row) { var s = spreadOf(row); return s && s.doc; }
  function curSpread() { return flat()[state.cur]; }
  function shorten(s, n) {
    n = n || 22;
    s = s.replace(/\s+/g, ' ').trim();
    return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
  }
  function placeCaret(blk, off) {
    try { blk.focus({ preventScroll: true }); } catch (e) { blk.focus(); }
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
    return r.toString().replace(/ /g, ' ').length;
  }
  function atEdge(blk, dir) {
    var sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return false;
    var lh = parseFloat(getComputedStyle(blk).lineHeight) || 32;
    var b = blk.getBoundingClientRect();
    var rr = sel.getRangeAt(0).getClientRects()[0];
    if (!rr) return true;
    return dir < 0 ? rr.top - b.top < lh * 0.9 : b.bottom - rr.bottom < lh * 0.9;
  }
  function relTop(row, sp) { return row.offsetTop - sp.sheet.offsetTop; }

  /* ---------- Maße: Zeilenhöhe, Zeilen pro Seite, Buchbreite ---------- */
  function metrics() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var single = vw < 760;
    var L = single ? 32 : Math.max(32, Math.min(38, Math.round(27 + vw * 0.0075)));
    var padTop = Math.round(L * 1.35), padBot = Math.round(L * 1.6);
    var bookW = single ? vw - 52 : Math.min(1240, vw - 190);
    var availH = vh - (single ? 210 : 150);
    var lines = Math.max(6, Math.floor((Math.min(availH, 880) - padTop - padBot) / L));
    var s = root.style;
    s.setProperty('--L', L + 'px');
    s.setProperty('--fs', Math.round(L * 0.6) + 'px');
    s.setProperty('--lines', String(lines));
    s.setProperty('--pad-top', padTop + 'px');
    s.setProperty('--pad-bot', padBot + 'px');
    s.setProperty('--book-w', bookW + 'px');
    state.single = single;
    state.lines = lines;
    state.L = L;
    root.classList.toggle('is-single', single);
  }

  /* ---------- Absätze können auf mehrere Seiten laufen ---------- */
  function logicalRows(doc) {
    var out = [], cur = null;
    docRows(doc).forEach(function (r) {
      if (r._cont && cur) { cur.rows.push(r); cur.text += text(r._blk); cur.tail = r; }
      else { cur = { rows: [r], head: r, tail: r, text: text(r._blk) }; out.push(cur); }
    });
    return out;
  }
  function chainTextUpTo(row) {
    var doc = docOf(row), t = '', head = null;
    logicalRows(doc).some(function (c) {
      var i = c.rows.indexOf(row);
      if (i < 0) return false;
      c.rows.slice(0, i + 1).forEach(function (r) { t += text(r._blk); });
      head = c.head;
      return true;
    });
    return { text: t, head: head };
  }
  function joinConts(row) {
    var list = docRows(docOf(row)), idx = list.indexOf(row), r;
    while ((r = list[++idx]) && r._cont) {
      row._blk.textContent = text(row._blk) + text(r._blk);
      r.remove();
    }
  }

  /* ---------- Speichern ---------- */
  function noteMarks(n) {
    var out = [], a = -1, i;
    for (i = 0; i <= n.words.length; i++) {
      if (n.mk[i]) { if (a < 0) a = i; }
      else if (a >= 0) { out.push([a, i - 1]); a = -1; }
    }
    return out;
  }
  function serialize() {
    var cur = curSpread(), di = 0, si = 0;
    state.docs.forEach(function (d, i) { var k = d.spreads.indexOf(cur); if (k >= 0) { di = i; si = k; } });
    return {
      v: 3, cur: { doc: di, spread: si },
      docs: state.docs.map(function (d) {
        return {
          id: d.id,
          rows: logicalRows(d).map(function (c) {
            var notes = [];
            c.rows.forEach(function (r) {
              Array.prototype.forEach.call(r._ai.querySelectorAll('.note:not(.note--off)'), function (n) {
                notes.push({ id: n._note.id, text: n._note.text, marks: noteMarks(n._note) });
              });
            });
            return { type: c.head.dataset.type, text: c.text, replyTo: c.head._replyTo ? c.head._replyTo.id : null, quote: c.head._quote || null, notes: notes };
          })
        };
      })
    };
  }
  function save() {
    if (!state.ready) return;
    try { localStorage.setItem(STORE, JSON.stringify(serialize())); } catch (e) {}
  }
  function saveSoon() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(function () { save(); layoutTabs(); }, 500);
  }
  window.addEventListener('pagehide', save);

  /* ---------- Blöcke ---------- */
  function replyPlaceholder(row) {
    return row._quote ? 'Zu „' + shorten(row._quote, 38) + '“ …' : 'Deine Antwort …';
  }
  function setType(row, type) {
    row.dataset.type = type;
    row._blk.dataset.placeholder = row._replyTo ? replyPlaceholder(row) : PLACEHOLDER[type];
  }
  function makeRow(type) {
    var row = el('section', 'row');
    var me = el('div', 'cell cell--me');
    var body = el('div', 'body');
    var blk = el('div', 'blk');
    blk.contentEditable = plain;
    blk.setAttribute('role', 'textbox');
    blk.setAttribute('aria-label', 'Dein Gedanke');
    blk.spellcheck = false;
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
  function addRow(after, type, txt, sheet) {
    var row = makeRow(type);
    if (txt) row._blk.textContent = txt;
    if (after) after.after(row); else sheet.append(row);
    return row;
  }
  function removeRow(row) {
    var doc = docOf(row);
    if (state.selected === row) state.selected = null;
    if (state.pending === row) state.pending = null;
    row.remove();
    if (!docRows(doc).length) addRow(null, 'p', '', doc.spreads[0].sheet);
    paginate(doc);
    saveSoon();
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
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    row.parentNode.focus({ preventScroll: true });
  }

  /* ---------- Seiten füllen sich ----------
     1. Dein Text läuft Zeile für Zeile bis zur letzten Linie und setzt sich dann auf der nächsten Seite fort.
     2. Ein Gedanke der KI braucht Platz neben deinem Block. Reicht er nicht mehr, beginnt dein nächster Block
        auf der nächsten Seite. Umgeblättert wird erst, wenn du weiterschreibst, damit du die KI noch schreiben siehst. */
  var AI_LINES = 8;
  function aiExtra(row) {
    if (row.dataset.type === 'h1' || row._ai.childNodes.length) return 0;
    return Math.max(0, (state.single ? AI_LINES + 3 : AI_LINES) - Math.round(row.offsetHeight / state.L));
  }
  function usedPx(sp) {
    var list = rowsIn(sp);
    if (!list.length) return 0;
    var last = list[list.length - 1];
    var me = last.firstChild.offsetHeight;
    var ai = last._ai.offsetHeight - (last._ai.childNodes.length ? state.L : 0);
    return relTop(last, sp) + Math.max(me, ai);
  }
  function overflows(sp) { return usedPx(sp) > sp.sheet.clientHeight + 1; }
  function freeLines(sp) { return Math.floor((sp.sheet.clientHeight - usedPx(sp) + 1) / state.L); }
  function addSpread(doc, at) {
    var sp = createSpread(doc);
    doc.spreads.splice(at == null ? doc.spreads.length : at, 0, sp);
    return sp;
  }
  function rangeAt(blk, i) {
    var w = document.createTreeWalker(blk, NodeFilter.SHOW_TEXT), n, pos = 0, r = document.createRange();
    while ((n = w.nextNode())) {
      var len = n.nodeValue.length;
      if (i < pos + len) { r.setStart(n, i - pos); r.setEnd(n, i - pos + 1); return r; }
      pos += len;
    }
    return null;
  }
  function lineOfChar(blk, i, top) {
    var r = rangeAt(blk, i);
    if (!r) return 1e9;
    var rects = r.getClientRects(), t = rects.length ? rects[0].top : r.getBoundingClientRect().top;
    return Math.floor((t - top + 2) / state.L);
  }
  function canSplit(row) {
    return (row.dataset.type === 'p' || row.dataset.type === 'li') && text(row._blk).length > 1;
  }
  /* Die Gedanken der KI gehören ans Ende des Absatzes */
  function adoptNotes(to, from) {
    while (from._ai.firstChild) {
      var c = from._ai.firstChild;
      if (c._note) c._note.row = to;
      to._ai.appendChild(c);
    }
  }
  /* Trennt den Absatz an der letzten Zeile, die noch auf die Seite passt */
  function splitRow(row, sp, ctx) {
    var avail = Math.floor((sp.sheet.clientHeight - relTop(row, sp) + 1) / state.L);
    if (avail < 1) return null;
    var blk = row._blk, t = text(blk), top = blk.getBoundingClientRect().top;
    if (lineOfChar(blk, t.length - 1, top) < avail) return null;
    var lo = 0, hi = t.length - 1;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (lineOfChar(blk, mid, top) >= avail) hi = mid; else lo = mid + 1;
    }
    var cut = lo;
    if (cut <= 0 || cut >= t.length) return null;
    var r2 = makeRow(row.dataset.type === 'li' ? 'li' : 'p');
    r2._cont = true;
    r2.dataset.cont = '1';
    blk.textContent = t.slice(0, cut);
    r2._blk.textContent = t.slice(cut);
    row.after(r2);
    adoptNotes(r2, row);
    if (ctx.row === row && ctx.off >= cut) { ctx.row = r2; ctx.off -= cut; }
    return r2;
  }
  function paginate(doc) {
    var ae = document.activeElement, ctx = { row: null, off: 0 }, keep = curSpread();
    if (ae && ae.classList && ae.classList.contains('blk')) {
      var fr = ae.closest('.row');
      if (fr && docOf(fr) === doc) { ctx.row = fr; ctx.off = caretOffset(ae); }
    }
    var moved = false, i, sp, nx, list, pass;
    for (pass = 0; pass < 40; pass++) {
      var changed = false;
      /* zu voll: Absatz teilen oder Block auf die nächste Seite schieben */
      for (i = 0; i < doc.spreads.length; i++) {
        sp = doc.spreads[i];
        while (overflows(sp)) {
          list = rowsIn(sp);
          var last = list[list.length - 1], r2 = canSplit(last) ? splitRow(last, sp, ctx) : null;
          nx = doc.spreads[i + 1] || addSpread(doc);
          if (r2) { nx.sheet.insertBefore(r2, nx.sheet.firstChild); changed = moved = true; continue; }
          if (list.length > 1) { nx.sheet.insertBefore(last, nx.sheet.firstChild); changed = moved = true; continue; }
          break;
        }
      }
      /* Platz frei: Fortsetzung zurückholen oder nachrückende Blöcke hochziehen */
      for (i = 0; i < doc.spreads.length - 1; i++) {
        sp = doc.spreads[i]; nx = doc.spreads[i + 1];
        var first = rowsIn(nx)[0], prevRow = rowsIn(sp).pop();
        if (!first || first === ctx.row) continue;
        if (first._cont && prevRow) {
          if (freeLines(sp) >= 1) {
            var pl = text(prevRow._blk).length;
            prevRow._blk.textContent = text(prevRow._blk) + text(first._blk);
            if (ctx.row === first) { ctx.row = prevRow; ctx.off += pl; }
            adoptNotes(prevRow, first);
            first.remove();
            changed = moved = true;
          }
          continue;
        }
        first._cont = false; delete first.dataset.cont;
        sp.sheet.appendChild(first);
        var ok = !overflows(sp) && (first._ai.childNodes.length || freeLines(sp) >= aiExtra(first));
        if (!ok) { nx.sheet.insertBefore(first, nx.sheet.firstChild); }
        else changed = moved = true;
      }
      if (!changed) break;
    }
    for (i = doc.spreads.length - 1; i > 0; i--) {
      if (!rowsIn(doc.spreads[i]).length) removeSpread(doc, i);
    }
    var kept = keep ? flat().indexOf(keep) : -1;
    if (kept >= 0) state.cur = kept;
    if (moved) {
      state.cur = Math.min(state.cur, flat().length - 1);
      if (ctx.row && ctx.row.isConnected) reveal(ctx.row, ctx.off);
      else syncChrome();
    }
  }
  /* Zeile sichtbar machen: liegt sie auf einer anderen Seite, wird dorthin geblättert */
  function reveal(row, off) {
    var idx = flat().indexOf(spreadOf(row));
    if (idx === state.cur) { placeCaret(row._blk, off == null ? Infinity : off); syncChrome(); return; }
    go(idx, { focus: row, off: off });
  }
  function repaginateAll() {
    state.docs.forEach(paginate);
    syncChrome();
  }

  /* ---------- Gedanken der KI ---------- */
  function buildWords(p, txt, instant) {
    var words = txt.split(' ');
    p.textContent = '';
    words.forEach(function (w, i) {
      var s = el('span', 'w' + (instant ? ' on' : ''), w + (i < words.length - 1 ? ' ' : ''));
      p.appendChild(s);
    });
    p.setAttribute('aria-label', txt);
    return words;
  }
  function applyMarks(n) {
    Array.prototype.forEach.call(n.el.querySelectorAll('.w'), function (s, i) { s.classList.toggle('mk', !!n.mk[i]); });
  }
  function revealWords(p) {
    var spans = p.querySelectorAll('.w');
    Array.prototype.forEach.call(spans, function (s, i) {
      if (reduced) s.classList.add('on');
      else setTimeout(function () { s.classList.add('on'); }, 60 + i * 115);
    });
  }
  /* Passt der neue Gedanke nicht mehr auf die Seite und rutscht mit seinem Block weiter, blättert das Buch mit,
     damit man die KI noch schreiben sieht (nur wenn man gerade nicht mitten im Text ist) */
  function followNote(row) {
    var p = state.pending;
    if (!p || !p.isConnected || !row.isConnected) return;
    var sp = spreadOf(row), idx = flat().indexOf(sp);
    if (idx !== state.cur && spreadOf(p) === sp) go(idx, {});
  }
  function renderNote(row, txt, instant, id, marks) {
    var art = el('p', 'note');
    art.tabIndex = 0;
    art.setAttribute('role', 'button');
    art.title = 'Anklicken zum Antworten, mit gedrückter Maustaste Stellen markieren';
    var n = { id: id || newId(), row: row, text: txt, el: art, mk: [], replyRows: [] };
    n.words = buildWords(art, txt, instant);
    (marks || []).forEach(function (m) { for (var i = m[0]; i <= m[1]; i++) n.mk[i] = true; });
    applyMarks(n);
    art._note = n;
    state.noteIndex[n.id] = n;
    row._ai.appendChild(art);
    if (!instant) { revealWords(art); paginate(docOf(row)); followNote(row); }
    saveSoon();
    return n;
  }
  function renderOffline(row) {
    var p = el('p', 'note note--off', 'Keine Verbindung zur KI.');
    row._ai.appendChild(p);
    setTimeout(function () { p.remove(); if (row.isConnected) paginate(docOf(row)); }, 6000);
  }

  /* Gesprächsverlauf dieser Notiz bis einschließlich dieser Zeile */
  function buildMessages(upTo) {
    var msgs = [];
    function push(role, t) {
      var last = msgs[msgs.length - 1];
      if (last && last.role === role) last.text += '\n' + t; else msgs.push({ role: role, text: t });
    }
    var list = logicalRows(docOf(upTo));
    for (var i = 0; i < list.length; i++) {
      var c = list[i], t = c.text.trim(), isLast = c.rows.indexOf(upTo) >= 0;
      if (t) {
        var line = c.head.dataset.type === 'h1' ? 'Titel: ' + t : t;
        if (c.head._quote) line = '[Bezieht sich auf deine Stelle: „' + c.head._quote + '“]\n' + line;
        push('user', line);
      }
      if (isLast) break;
      c.rows.forEach(function (r) {
        r._ai.querySelectorAll('.note:not(.note--off)').forEach(function (n) { push('model', n._note.text); });
      });
    }
    var total = 0;
    msgs = msgs.slice(-24).map(function (m) { return { role: m.role, text: m.text.slice(0, 1500) }; });
    return msgs.filter(function (m) { total += m.text.length; return total < 8000; });
  }
  function clean(t) {
    t = String(t || '').replace(/^\s*(Du|Beitrag)\s*:\s*/i, '').replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ').trim();
    if (t.length > 320) {
      var cut = t.slice(0, 320), end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
      t = end > 80 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(' ')) + '…';
    }
    return t;
  }
  function fetchThought(messages) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 40000);
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
  function requestThought(row) {
    var chain = chainTextUpTo(row), txt = chain.text.trim();
    if (!chain.head || chain.head.dataset.type === 'h1' || !txt) return;
    fetchThought(buildMessages(row))
      .then(function (t) { if (row.isConnected) renderNote(row, clean(t), false); })
      .catch(function () { if (row.isConnected) renderOffline(row); });
  }

  /* Antwort auf einen Gedanken, optional zu einer markierten Stelle */
  function openReply(note, quote) {
    var existing = note.replyRows.filter(function (r) { return r.isConnected && (r._quote || null) === (quote || null); })[0];
    if (existing) { reveal(existing); return; }
    var r = makeRow('p');
    r._replyTo = note;
    r._quote = quote || null;
    r._blk.dataset.placeholder = replyPlaceholder(r);
    var after = note.row;
    note.replyRows = note.replyRows.filter(function (x) { return x.isConnected; });
    note.replyRows.forEach(function (x) { if (x.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_PRECEDING) after = x; });
    var nn = after.nextElementSibling;
    while (nn && nn._replyTo === note) { after = nn; nn = nn.nextElementSibling; }
    after.after(r);
    note.replyRows.push(r);
    placeCaret(r._blk, 0);
    paginate(docOf(note.row));
    saveSoon();
  }

  /* Mit dem Marker eine Stelle im Gedanken der KI anstreichen */
  function wordSpans(n) {
    var pos = 0;
    return n.words.map(function (w) { var s = { a: pos, b: pos + w.length }; pos += w.length + 1; return s; });
  }
  function markSelection() {
    var sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return false;
    var range = sel.getRangeAt(0), host = range.commonAncestorContainer;
    host = host.nodeType === 1 ? host : host.parentNode;
    var noteEl = host && host.closest && host.closest('.note');
    if (!noteEl || !noteEl._note) return false;
    var n = noteEl._note, pre = document.createRange();
    pre.selectNodeContents(noteEl);
    pre.setEnd(range.startContainer, range.startOffset);
    var s = pre.toString().length;
    pre.setEnd(range.endContainer, range.endOffset);
    var e = pre.toString().length;
    var sp = wordSpans(n), a = -1, b = -1;
    sp.forEach(function (w, i) { if (s < w.b && e > w.a) { if (a < 0) a = i; b = i; } });
    sel.removeAllRanges();
    if (a < 0) return true;
    var allOn = true, i;
    for (i = a; i <= b; i++) if (!n.mk[i]) allOn = false;
    for (i = a; i <= b; i++) n.mk[i] = !allOn;
    applyMarks(n);
    save();
    if (!allOn) openReply(n, n.words.slice(a, b + 1).join(' '));
    return true;
  }
  function runAround(n, i) {
    var a = i, b = i;
    while (a > 0 && n.mk[a - 1]) a--;
    while (b < n.words.length - 1 && n.mk[b + 1]) b++;
    return n.words.slice(a, b + 1).join(' ');
  }

  /* ---------- Schreiben ---------- */
  function enter(row) {
    joinConts(row);
    var full = text(row._blk), off = Math.min(caretOffset(row._blk), full.length);
    if (row.dataset.type === 'li' && !full.trim()) { setType(row, 'p'); return; }
    var before = full.slice(0, off), after = full.slice(off);
    row._blk.textContent = before;
    var nr = addRow(row, row.dataset.type === 'li' ? 'li' : 'p', after, row.parentNode);
    requestThought(row);
    var sp = spreadOf(row);
    var free = state.lines - Math.round((relTop(row, sp) + row.offsetHeight) / state.L);
    var need = aiExtra(row) + 1;
    var doc = docOf(row), idx = doc.spreads.indexOf(sp);
    if (!after && free < need && state.ready) {
      /* kein Platz mehr für den Gedanken der KI: der nächste Block liegt schon auf der folgenden Seite */
      var nx = doc.spreads[idx + 1] || addSpread(doc);
      var tail = [], t0 = nr;
      while (t0) { tail.push(t0); t0 = t0.nextElementSibling; }
      var ref = nx.sheet.firstChild;
      tail.forEach(function (r) { nx.sheet.insertBefore(r, ref); });
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      state.pending = nr;
      syncChrome();
      paginate(doc);
    } else {
      placeCaret(nr._blk, 0);
      paginate(doc);
    }
    saveSoon();
    return nr;
  }
  function backspaceAtStart(row, e) {
    if (row.dataset.type !== 'p') { e.preventDefault(); setType(row, 'p'); return; }
    var list = docRows(docOf(row)), prev = list[list.indexOf(row) - 1];
    if (!prev) return;
    e.preventDefault();
    var mine = text(row._blk), prevText = text(prev._blk);
    if (!mine) { removeRow(row); reveal(prev); return; }
    if (prev._ai.querySelector('.note') || row._ai.querySelector('.note')) { reveal(prev); return; }
    prev._blk.textContent = prevText + mine;
    removeRow(row);
    reveal(prev, prevText.length);
  }

  book.addEventListener('input', function (e) {
    var blk = e.target.closest && e.target.closest('.blk');
    if (!blk) return;
    var row = blk.closest('.row');
    if (blk.textContent === '') blk.innerHTML = '';
    if (row.dataset.type === 'p' && !row._cont) {
      var m = /^(#|-|\*) /.exec(text(blk));
      if (m) {
        var rest = text(blk).slice(m[0].length);
        setType(row, m[1] === '#' ? 'h1' : 'li');
        blk.textContent = rest;
        placeCaret(blk, 0);
      }
    }
    paginate(docOf(row));
    saveSoon();
  });

  /* Wer nach einem vollen Blatt einfach weiterschreibt, schlägt dabei die Seite um */
  document.addEventListener('keydown', function (e) {
    var p = state.pending;
    if (!p) return;
    if (!p.isConnected) { state.pending = null; return; }
    var ae = document.activeElement;
    if (ae && ae.classList && ae.classList.contains('blk')) { state.pending = null; return; }
    if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
    e.preventDefault();
    state.pending = null;
    go(flat().indexOf(spreadOf(p)), { focus: p, off: 0 });
    try { document.execCommand('insertText', false, e.key); } catch (err) {}
  }, true);

  book.addEventListener('keydown', function (e) {
    if (e.key === 'PageDown' || e.key === 'PageUp') {
      e.preventDefault();
      flipBy(e.key === 'PageDown' ? 1 : -1);
      return;
    }
    var sheet = e.target.closest && e.target.closest('.sheet');
    if (!sheet) return;
    var blk = e.target.closest('.blk');

    /* Block ist markiert (Esc) */
    if (!blk && state.selected && e.target === sheet) {
      var sel = state.selected;
      var list = docRows(docOf(sel)), idx = list.indexOf(sel);
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        var sib = list[idx + (e.key === 'ArrowUp' ? -1 : 1)];
        if (sib) {
          var sidx = flat().indexOf(spreadOf(sib));
          if (sidx !== state.cur) go(sidx, { select: sib }); else selectRow(sib);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault(); clearSel(); reveal(sel);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        var next = list[idx + 1] || list[idx - 1];
        removeRow(sel);
        if (next && next.isConnected) {
          var nidx = flat().indexOf(spreadOf(next));
          if (nidx !== state.cur) go(nidx, { select: next }); else selectRow(next);
        } else clearSel();
      } else if (e.key === 'Escape') {
        clearSel();
      }
      return;
    }
    if (!blk) {
      var note = e.target.closest('.note');
      if (note && note._note && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openReply(note._note); }
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
      var rl = docRows(docOf(row)), other = rl[rl.indexOf(row) + d];
      if (other && atEdge(blk, d)) { e.preventDefault(); reveal(other); }
    }
  });

  book.addEventListener('paste', function (e) {
    var blk = e.target.closest && e.target.closest('.blk');
    if (!blk) return;
    e.preventDefault();
    var t = ((e.clipboardData || window.clipboardData).getData('text') || '').replace(/\s+/g, ' ');
    document.execCommand('insertText', false, t);
  });
  book.addEventListener('pointerdown', function (e) {
    if (e.target.closest && e.target.closest('.blk')) clearSel();
  });
  book.addEventListener('focusin', function (e) {
    if (e.target.closest && e.target.closest('.blk')) state.pending = null;
  });

  /* Rechts ist der Cursor ein Textmarker */
  book.addEventListener('mousemove', function (e) {
    if (state.single) return;
    var r = book.getBoundingClientRect();
    book.classList.toggle('on-right', e.clientX - r.left > r.width / 2);
  });
  book.addEventListener('mouseleave', function () { book.classList.remove('on-right'); });
  var justMarked = false;
  book.addEventListener('mouseup', function (e) {
    if (e.target.closest && e.target.closest('.note') && markSelection()) {
      justMarked = true;
      setTimeout(function () { justMarked = false; }, 80);
    }
  });
  book.addEventListener('click', function (e) {
    if (justMarked) return;
    var noteEl = e.target.closest && e.target.closest('.note');
    if (!noteEl || !noteEl._note) return;
    var n = noteEl._note, w = e.target.closest('.w');
    var quote = null;
    if (w && w.classList.contains('mk')) quote = runAround(n, Array.prototype.indexOf.call(noteEl.children, w));
    openReply(n, quote);
  });

  /* ---------- Doppelseiten ---------- */
  function createSpread(doc) {
    var el0 = el('div', 'spread');
    var sheet = el('div', 'sheet');
    sheet.tabIndex = -1;
    sheet.setAttribute('aria-label', 'Notizbuchseite');
    var nl = el('span', 'pgno pgno--l'), nr = el('span', 'pgno pgno--r');
    el0.append(sheet, nl, nr);
    var sp = { doc: doc, el: el0, sheet: sheet, nl: nl, nr: nr };
    el0._sp = sp;
    el0.inert = true;
    spreadsEl.appendChild(el0);
    return sp;
  }
  function removeSpread(doc, i) {
    var sp = doc.spreads.splice(i, 1)[0];
    sp.el.remove();
  }
  function createDoc(id) {
    var doc = { id: id || newId(), spreads: [], tab: null };
    addSpread(doc);
    state.docs.push(doc);
    return doc;
  }
  function fill(doc, data) {
    var pending = [];
    data.forEach(function (d) {
      var row = addRow(null, d.type || 'p', d.text || '', doc.spreads[0].sheet);
      (d.notes || []).forEach(function (n) { renderNote(row, n.text, true, n.id, n.marks); });
      if (d.replyTo) pending.push({ row: row, id: d.replyTo, quote: d.quote });
    });
    pending.forEach(function (x) {
      var parent = state.noteIndex[x.id];
      if (!parent) return;
      x.row._replyTo = parent;
      x.row._quote = x.quote || null;
      parent.replyRows.push(x.row);
      x.row._blk.dataset.placeholder = replyPlaceholder(x.row);
    });
    if (!docRows(doc).length) addRow(null, 'p', '', doc.spreads[0].sheet);
  }

  function syncChrome() {
    var list = flat();
    state.cur = Math.max(0, Math.min(state.cur, list.length - 1));
    list.forEach(function (s, i) {
      var c = i === state.cur;
      s.nl.textContent = String(i * 2 + 1);
      s.nr.textContent = state.single ? String(i + 1) : String(i * 2 + 2);
      if (!state.flip) {
        s.el.classList.toggle('is-current', c);
        s.el.inert = !c;
        s.el.setAttribute('aria-hidden', c ? 'false' : 'true');
      }
    });
    prevBtn.hidden = state.cur <= 0;
    nextBtn.hidden = state.cur >= list.length - 1;
    nextBtn.classList.toggle('is-hint', !!(state.pending && state.pending.isConnected && flat().indexOf(spreadOf(state.pending)) > state.cur));
    if (!state.flip) state.tabCur = state.cur;
    layoutTabs();
  }

  /* ---------- Klebereiter: sitzen an der Seite, auf der sie kleben ---------- */
  function titleOf(doc) {
    var list = logicalRows(doc), i, t;
    for (i = 0; i < list.length; i++) if (list[i].head.dataset.type === 'h1' && (t = list[i].text.trim())) return shorten(t);
    for (i = 0; i < list.length; i++) if ((t = list[i].text.trim())) return shorten(t);
    return 'neu';
  }
  function makeTab(doc) {
    var b = el('button', 'ftab');
    b.type = 'button';
    b.appendChild(el('span', 'ftab__label'));
    b.addEventListener('click', function () { openDoc(doc); });
    return b;
  }
  function layoutTabs() {
    var docs = state.docs, n = docs.length, list = flat(), cs = list[state.tabCur];
    var gap = 9, avail = book.clientHeight - 56;
    var tabH = Math.max(54, Math.min(150, Math.floor((avail - gap * n) / (n + 1))));
    docs.forEach(function (d, i) {
      if (!d.tab) d.tab = makeTab(d);
      var b = d.tab, lab = b.firstChild, title = titleOf(d);
      if (lab.textContent !== title) lab.textContent = title;
      b.title = title;
      b.style.setProperty('--c', TAB_COLORS[i % TAB_COLORS.length]);
      b.style.setProperty('--tilt', ((i % 3) - 1) * 0.55 + 'deg');
      b.style.top = 26 + i * (tabH + gap) + 'px';
      b.style.height = tabH + 'px';
      b.setAttribute('aria-current', String(!!cs && cs.doc === d));
      var side = state.single ? 'r' : (list.indexOf(d.spreads[0]) <= state.tabCur ? 'l' : 'r');
      if (b.dataset.side !== side || !b.isConnected) {
        var fresh = !!b.dataset.side;
        b.dataset.side = side;
        (side === 'l' ? tabsL : tabsR).appendChild(b);
        if (fresh && !reduced) { b.classList.remove('is-land'); void b.offsetWidth; b.classList.add('is-land'); }
      }
    });
    if (!state.spare) {
      state.spare = el('button', 'ftab ftab--spare');
      state.spare.type = 'button';
      state.spare.appendChild(el('span', 'ftab__label', 'neu'));
      state.spare.setAttribute('aria-label', 'Neue Notiz anlegen');
      state.spare.addEventListener('click', addDoc);
      tabsR.appendChild(state.spare);
    }
    state.spare.style.top = 26 + n * (tabH + gap) + 'px';
    state.spare.style.height = tabH + 'px';
    Array.prototype.forEach.call(book.querySelectorAll('.ftab'), function (b) {
      if (b !== state.spare && !state.docs.some(function (d) { return d.tab === b; })) b.remove();
    });
  }
  function openDoc(d) {
    var cs = curSpread();
    if (cs && cs.doc === d) return;
    var idx = flat().indexOf(d.spreads[0]), rl = rowsIn(d.spreads[0]);
    go(idx, d.spreads.length === 1 && rl.length ? { focus: rl[rl.length - 1] } : {});
  }
  function flipBy(dir) {
    var idx = state.cur + dir, list = flat();
    if (idx < 0 || idx >= list.length) return;
    var rl = rowsIn(list[idx]), pend = state.pending && state.pending.isConnected && dir > 0 && rl.indexOf(state.pending) >= 0;
    go(idx, rl.length ? { focus: pend ? state.pending : (dir > 0 ? rl[0] : rl[rl.length - 1]), off: dir > 0 ? 0 : Infinity } : {});
  }
  prevBtn.addEventListener('click', function () { flipBy(-1); });
  nextBtn.addEventListener('click', function () { flipBy(1); });

  /* Wischen zum Blättern (Touch) */
  (function () {
    var x0 = null, y0 = 0;
    book.addEventListener('touchstart', function (e) { if (e.touches.length === 1) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } }, { passive: true });
    book.addEventListener('touchend', function (e) {
      if (x0 == null) return;
      var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) flipBy(dx < 0 ? 1 : -1);
    }, { passive: true });
  })();

  /* ---------- Seite umschlagen ----------
     Das Blatt besteht aus schmalen Streifen, die sich ineinander um den Falz drehen. So biegt es sich wie echtes Papier:
     erst hinkt der freie Rand hinterher, dann schwingt er über. Vorderseite und Rückseite zeigen Abzüge der echten Seiten. */
  function cloneSpread(sp) {
    var c = sp.el.cloneNode(true);
    c.classList.remove('is-current');
    c.classList.add('is-clone');
    c.removeAttribute('inert'); c.inert = true;
    c.setAttribute('aria-hidden', 'true');
    Array.prototype.forEach.call(c.querySelectorAll('[contenteditable]'), function (n) { n.removeAttribute('contenteditable'); });
    Array.prototype.forEach.call(c.querySelectorAll('[tabindex]'), function (n) { n.removeAttribute('tabindex'); });
    return c;
  }
  function finishFlip() {
    var f = state.flip;
    if (!f) return;
    f.end();
  }
  function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function smooth(x) { return 0.5 - 0.5 * Math.cos(Math.PI * x); }

  /* A kommt im Buch vor B. reverse = zurückblättern */
  function playTurn(A, B, reverse, to) {
    var W = book.clientWidth, H = book.clientHeight, single = state.single, half = single ? W : W / 2;
    var N = single ? 7 : 14, sw = half / N;
    var leaf = el('div', 'leaf');
    leaf.style.width = half + 'px';
    leaf.style.left = (single ? 0 : W - half) + 'px';
    var strips = [], parent = leaf, k;
    for (k = 0; k < N; k++) {
      var st = el('div', 'strip');
      st.style.width = (sw + (k < N - 1 ? 0.7 : 0)) + 'px';
      if (k > 0) st.style.left = sw + 'px';
      var front = el('div', 'face face--front'), fp = el('div', 'paper paper--r');
      fp.style.cssText = 'position:absolute;top:0;height:100%;width:' + half + 'px;left:' + (-k * sw) + 'px';
      var fc = cloneSpread(A);
      fc.style.cssText = 'position:absolute;top:0;width:' + W + 'px;height:' + H + 'px;left:' + (single ? -k * sw : -(W - half) - k * sw) + 'px';
      var fs = el('div', 'shade');
      front.append(fp, fc, fs);
      st.appendChild(front);
      var back = null, bs = null;
      if (!single) {
        back = el('div', 'face face--back');
        var bp = el('div', 'paper paper--l');
        bp.style.cssText = 'position:absolute;top:0;height:100%;width:' + half + 'px;left:' + (-(half - (k + 1) * sw)) + 'px';
        var bc = cloneSpread(B);
        bc.style.cssText = 'position:absolute;top:0;width:' + W + 'px;height:' + H + 'px;left:' + (-(W / 2 - (k + 1) * sw)) + 'px';
        bs = el('div', 'shade');
        back.append(bp, bc, bs);
        st.appendChild(back);
      }
      parent.appendChild(st);
      strips.push({ el: st, front: front, back: back, fs: fs, bs: bs });
      parent = st;
    }
    var cast = el('div', 'cast');
    leafSlot.appendChild(cast);
    leafSlot.appendChild(leaf);

    if (single) { B.el.style.visibility = 'visible'; }
    else {
      A.el.style.visibility = 'visible'; A.el.style.clipPath = 'inset(0 50% 0 0)';
      B.el.style.visibility = 'visible'; B.el.style.clipPath = 'inset(0 0 0 50%)';
    }
    to.el.inert = false;
    to.el.setAttribute('aria-hidden', 'false');
    book.classList.add('is-turning');

    var maxAngle = single ? 98 : 180, curl = single ? 4.2 : 5.2;
    function draw(p) {
      var e = ease(p), theta = e * maxAngle;
      var rel = curl * Math.sin(2 * Math.PI * e) * (single ? 0.6 : 1);
      var abs = theta, i, S, angles = [], rotD;
      for (i = 0; i < N; i++) {
        if (i > 0) abs -= rel;
        angles.push(abs);
      }
      angles.push(abs - rel);
      for (i = 0; i < N; i++) {
        S = strips[i];
        rotD = i === 0 ? theta : -rel;
        S.el.style.transform = 'rotateY(' + (-rotD) + 'deg)';
        var a0 = Math.max(0, Math.min(180, angles[i])), a1 = Math.max(0, Math.min(180, angles[i + 1]));
        var s0 = 0.46 * Math.sin(a0 * Math.PI / 180), s1 = 0.46 * Math.sin(a1 * Math.PI / 180);
        var bg = 'linear-gradient(90deg,rgba(28,16,4,' + s0.toFixed(3) + '),rgba(28,16,4,' + s1.toFixed(3) + '))';
        var mid = (a0 + a1) / 2, showFront = mid <= 90;
        S.front.style.visibility = (showFront && !(single && mid > 90)) ? 'visible' : 'hidden';
        S.fs.style.background = bg;
        if (S.back) { S.back.style.visibility = showFront ? 'hidden' : 'visible'; S.bs.style.background = 'linear-gradient(270deg,rgba(28,16,4,' + s0.toFixed(3) + '),rgba(28,16,4,' + s1.toFixed(3) + '))'; }
      }
      cast.style.opacity = (0.8 * Math.sin(Math.PI * e)).toFixed(3);
    }

    var T = single ? 700 : 1150, prog = reverse ? 1 : 0, last = null, raf = 0, speed = 1, tabsDone = false, dir = reverse ? -1 : 1;
    draw(prog);
    function tick(now) {
      if (last == null) last = now;
      var dt = now - last; last = now;
      prog += dir * (dt / T) * speed;
      if (!tabsDone && ((dir > 0 && prog >= 0.5) || (dir < 0 && prog <= 0.5))) { tabsDone = true; state.tabCur = state.cur; layoutTabs(); }
      if ((dir > 0 && prog >= 1) || (dir < 0 && prog <= 0)) { end(); return; }
      draw(prog);
      raf = requestAnimationFrame(tick);
    }
    function end() {
      cancelAnimationFrame(raf);
      state.flip = null;
      leaf.remove(); cast.remove();
      [A, B].forEach(function (s) { s.el.style.visibility = ''; s.el.style.clipPath = ''; });
      book.classList.remove('is-turning');
      syncChrome();
      save();
      var q = state.queued;
      state.queued = null;
      if (q) go(q.idx, q.opts);
    }
    state.flip = { end: end, speedUp: function () { speed = 3.2; } };
    raf = requestAnimationFrame(tick);
  }

  function go(idx, opts) {
    opts = opts || {};
    var list = flat();
    if (idx < 0 || idx >= list.length) return;
    function arrive() {
      if (opts.select) { selectRow(opts.select); return; }
      if (opts.focus && opts.focus.isConnected) placeCaret(opts.focus._blk, opts.off == null ? Infinity : opts.off);
    }
    if (state.flip) {
      /* es wird gerade geblättert: das laufende Blatt schneller zu Ende führen, dann weiter */
      state.flip.speedUp();
      state.queued = { idx: idx, opts: opts };
      return;
    }
    if (idx === state.cur) { syncChrome(); arrive(); return; }
    var from = list[state.cur], to = list[idx], forward = idx > state.cur;
    clearSel();
    if (document.activeElement && document.activeElement.blur && !opts.focus) document.activeElement.blur();
    state.cur = idx;
    if (opts.focus === state.pending) state.pending = null;
    if (reduced || !state.ready) { syncChrome(); save(); arrive(); return; }
    playTurn(forward ? from : to, forward ? to : from, !forward, to);
    syncChrome();
    arrive();
  }

  /* ---------- Notizen anlegen und entfernen ---------- */
  function addDoc() {
    var doc = createDoc();
    fill(doc, [{ type: 'p', text: '' }]);
    go(flat().indexOf(doc.spreads[0]), { focus: rowsIn(doc.spreads[0])[0], off: 0 });
    layoutTabs();
    save();
  }
  function handleDelete() {
    if (!delBtn.classList.contains('is-armed')) {
      delBtn.classList.add('is-armed');
      delBtn.textContent = 'Wirklich entfernen?';
      setTimeout(function () { delBtn.classList.remove('is-armed'); delBtn.textContent = 'Notiz entfernen'; }, 3000);
      return;
    }
    delBtn.classList.remove('is-armed');
    delBtn.textContent = 'Notiz entfernen';
    var doc = curSpread().doc;
    finishFlip();
    state.pending = null;
    if (state.docs.length === 1) {
      doc.spreads.slice(1).forEach(function (s) { s.el.remove(); });
      doc.spreads.length = 1;
      doc.spreads[0].sheet.textContent = '';
      addRow(null, 'p', '', doc.spreads[0].sheet);
      state.cur = 0;
      syncChrome(); save();
      return;
    }
    var di = state.docs.indexOf(doc);
    var targetDoc = state.docs[di + 1] || state.docs[di - 1];
    var targetSpread = targetDoc.spreads[0];
    state.docs.splice(di, 1);
    doc.spreads.forEach(function (s) { s.el.remove(); });
    if (doc.tab) doc.tab.remove();
    state.cur = flat().indexOf(targetSpread);
    syncChrome();
    save();
  }
  delBtn.addEventListener('click', handleDelete);

  /* ---------- Start ---------- */
  function load() {
    try {
      var raw = localStorage.getItem(STORE), data, curPos = { doc: 0, spread: 0 };
      if (raw) {
        data = JSON.parse(raw);
        if (!data || !Array.isArray(data.docs) || !data.docs.length) return false;
        if (data.cur) curPos = data.cur;
      } else {
        var old = localStorage.getItem(OLD_STORE);
        if (!old) return false;
        var o = JSON.parse(old);
        if (!o || !Array.isArray(o.papers) || !o.papers.length) return false;
        data = { docs: o.papers };
        curPos = { doc: o.active | 0, spread: 0 };
      }
      data.docs.forEach(function (d) { fill(createDoc(d.id), Array.isArray(d.rows) ? d.rows : []); });
      state.pendingCur = curPos;
      return true;
    } catch (e) { return false; }
  }

  metrics();
  if (!load()) {
    state.docs = []; spreadsEl.textContent = ''; state.noteIndex = {};
    fill(createDoc(), SEED);
    state.pendingCur = { doc: 0, spread: 0 };
  }
  function settle() {
    state.docs.forEach(paginate);
    var pc = state.pendingCur;
    if (pc && !state.ready) {
      var d = state.docs[Math.max(0, Math.min(pc.doc | 0, state.docs.length - 1))];
      var sp = d.spreads[Math.max(0, Math.min(pc.spread | 0, d.spreads.length - 1))];
      state.cur = flat().indexOf(sp);
    }
    syncChrome();
  }
  settle();
  state.ready = true;

  /* Schrift nachladen oder Fenster verändern: Zeilenumbrüche ändern sich, also neu auf die Seiten verteilen */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { repaginateAll(); });
  var rz = null;
  window.addEventListener('resize', function () {
    clearTimeout(rz);
    rz = setTimeout(function () { finishFlip(); metrics(); repaginateAll(); }, 120);
  });
})();
