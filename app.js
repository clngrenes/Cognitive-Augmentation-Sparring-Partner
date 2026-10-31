(function () {
  'use strict';

  var book = document.getElementById('book');
  var spreadsEl = document.getElementById('spreads');
  var leafSlot = document.getElementById('leafslot');
  var tabsEl = document.getElementById('tabs');
  var penEl = document.getElementById('pen');
  var delBtn = document.getElementById('del');
  var prevBtn = document.getElementById('prev');
  var nextBtn = document.getElementById('next');
  var root = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var STORE = 'sparring.v3', OLD_STORE = 'sparring.v2';
  var TAB_COLORS = ['#c8553d', '#e0b13b', '#6f9a8d', '#5b7aa3', '#b86b87', '#8c7bb3'];
  /* docs = Notizen (jede mit eigenem Klebereiter), jede Notiz besteht aus einer oder mehreren Doppelseiten */
  var state = { docs: [], cur: 0, selected: null, uid: 0, noteIndex: {}, saveTimer: null, single: false, lines: 0, ready: false, flip: null, tabSig: '' };

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

  /* ---------- Maße: Zeilenhöhe, Zeilen pro Seite, Buchbreite ---------- */
  function metrics() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var single = vw < 760;
    var L = single ? 32 : Math.max(32, Math.min(38, Math.round(27 + vw * 0.0075)));
    var padTop = Math.round(L * 1.35), padBot = Math.round(L * 1.6);
    var bookW = single ? vw - 52 : Math.min(1240, vw - 150);
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
    root.classList.toggle('is-single', single);
  }

  /* ---------- Speichern ---------- */
  function serialize() {
    var cur = curSpread(), di = 0, si = 0;
    state.docs.forEach(function (d, i) { var k = d.spreads.indexOf(cur); if (k >= 0) { di = i; si = k; } });
    return {
      v: 3, cur: { doc: di, spread: si },
      docs: state.docs.map(function (d) {
        return {
          id: d.id,
          rows: docRows(d).map(function (r) {
            return {
              type: r.dataset.type, text: text(r._blk), replyTo: r._replyTo ? r._replyTo.id : null,
              notes: Array.prototype.map.call(r._ai.querySelectorAll('.note:not(.note--off)'), function (n) {
                return { id: n._note.id, text: n._note.text, anchor: n._note.anchor };
              })
            };
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
    state.saveTimer = setTimeout(function () { save(); renderTabs(); }, 500);
  }
  window.addEventListener('pagehide', save);

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

  /* ---------- Seiten füllen sich, dann wird umgeblättert ---------- */
  function overflows(sp) { return sp.sheet.scrollHeight > sp.sheet.clientHeight + 1; }
  function addSpread(doc, at) {
    var sp = createSpread(doc);
    doc.spreads.splice(at == null ? doc.spreads.length : at, 0, sp);
    return sp;
  }
  function paginate(doc) {
    var ae = document.activeElement, focusRow = null, off = 0;
    if (ae && ae.classList && ae.classList.contains('blk')) { focusRow = ae.closest('.row'); off = caretOffset(ae); }
    var moved = false, i, sp, nx, list, keep = curSpread();
    for (i = 0; i < doc.spreads.length; i++) {
      sp = doc.spreads[i];
      list = rowsIn(sp);
      while (list.length > 1 && overflows(sp)) {
        var last = list.pop();
        nx = doc.spreads[i + 1] || addSpread(doc);
        nx.sheet.insertBefore(last, nx.sheet.firstChild);
        moved = true;
      }
    }
    for (i = 0; i < doc.spreads.length - 1; i++) {
      sp = doc.spreads[i]; nx = doc.spreads[i + 1];
      for (;;) {
        var first = rowsIn(nx)[0];
        if (!first || first === focusRow) break;
        sp.sheet.appendChild(first);
        if (overflows(sp)) { nx.sheet.insertBefore(first, nx.sheet.firstChild); break; }
        moved = true;
      }
    }
    for (i = doc.spreads.length - 1; i > 0; i--) {
      if (!rowsIn(doc.spreads[i]).length) removeSpread(doc, i);
    }
    var kept = keep ? flat().indexOf(keep) : -1;
    if (kept >= 0) state.cur = kept;
    if (moved) {
      state.cur = Math.min(state.cur, flat().length - 1);
      if (focusRow && focusRow.isConnected) reveal(focusRow, off);
      else syncChrome();
    }
  }
  /* Zeile sichtbar machen: wenn sie auf einer anderen Seite liegt, wird dorthin geblättert */
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
  function bookPoint(x, y) { var b = book.getBoundingClientRect(); return { x: x - b.left, y: y - b.top }; }
  function penTo(x, y, ai) {
    penEl.classList.toggle('pen--ai', !!ai);
    penEl.style.transform = 'translate(' + Math.round(x - 6) + 'px,' + Math.round(y - 104) + 'px)';
    penEl.classList.add('is-on');
    clearTimeout(penTo.t);
    penTo.t = setTimeout(penOff, ai ? 1700 : 2300);
  }
  function penOff() { penEl.classList.remove('is-on', 'is-writing'); }
  function penAtCaret() {
    if (reduced || state.flip) return;
    var sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return;
    var node = sel.anchorNode, host = node && (node.nodeType === 1 ? node : node.parentNode);
    var blk = host && host.closest && host.closest('.blk');
    if (!blk) return;
    var r = sel.getRangeAt(0).cloneRange(); r.collapse(true);
    var rc = r.getClientRects()[0], br = blk.getBoundingClientRect(), x, y;
    if (rc && (rc.width || rc.height)) { x = rc.left; y = rc.bottom - 6; }
    else { x = br.left; y = br.top + parseFloat(getComputedStyle(blk).lineHeight) - 6; }
    var p = bookPoint(x, y);
    penTo(p.x, p.y, false);
  }
  function penWord(s) {
    if (reduced || state.flip || !s.isConnected) return;
    var sp = s.closest('.spread');
    if (!sp || !sp.classList.contains('is-current')) return;
    var rs = s.getClientRects();
    var rc = rs[rs.length - 1];
    if (!rc) return;
    var p = bookPoint(rc.right, rc.bottom - 6);
    penTo(p.x, p.y, true);
    penEl.classList.add('is-writing');
  }

  function revealWords(p, txt) {
    var words = txt.split(' ');
    p.textContent = '';
    words.forEach(function (w, i) { p.appendChild(el('span', 'w', w + (i < words.length - 1 ? ' ' : ''))); });
    p.setAttribute('aria-label', txt);
    var spans = p.querySelectorAll('.w');
    Array.prototype.forEach.call(spans, function (s, i) {
      if (reduced) s.classList.add('on');
      else setTimeout(function () { s.classList.add('on'); penWord(s); }, 60 + i * 115);
    });
  }
  function renderNote(row, txt, anchor, instant, id) {
    var art = el('p', 'note');
    art.tabIndex = 0;
    art.setAttribute('role', 'button');
    art.title = 'Klicken, um zu antworten';
    var n = { id: id || newId(), row: row, text: txt, anchor: anchor || null, el: art };
    art._note = n;
    state.noteIndex[n.id] = n;
    if (instant) { art.textContent = txt; } else revealWords(art, txt);
    row._ai.appendChild(art);
    if (!instant) paginate(docOf(row));
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
    var list = docRows(docOf(upTo));
    for (var i = 0; i < list.length; i++) {
      var r = list[i], t = text(r._blk).trim();
      if (t) push('user', r.dataset.type === 'h1' ? 'Titel: ' + t : t);
      if (r === upTo) break;
      r._ai.querySelectorAll('.note:not(.note--off)').forEach(function (n) { push('model', n._note.text); });
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
    var txt = text(row._blk).trim();
    if (row.dataset.type === 'h1' || !txt) return;
    fetchThought(buildMessages(row))
      .then(function (t) { if (row.isConnected) renderNote(row, clean(t), txt, false); })
      .catch(function () { if (row.isConnected) renderOffline(row); });
  }
  function openReply(note) {
    if (note.replyRow && note.replyRow.isConnected) { reveal(note.replyRow); return; }
    var r = makeRow('p');
    r._replyTo = note;
    r._blk.dataset.placeholder = 'Deine Antwort …';
    note.row.after(r);
    note.replyRow = r;
    placeCaret(r._blk, 0);
    paginate(docOf(note.row));
  }

  /* ---------- Schreiben ---------- */
  function enter(row) {
    var full = text(row._blk), off = caretOffset(row._blk);
    if (row.dataset.type === 'li' && !full.trim()) { setType(row, 'p'); return; }
    var before = full.slice(0, off), after = full.slice(off);
    row._blk.textContent = before;
    var nr = addRow(row, row.dataset.type === 'li' ? 'li' : 'p', after, row.parentNode);
    requestThought(row);
    placeCaret(nr._blk, 0);
    paginate(docOf(row));
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

  var writingTimer = null;
  book.addEventListener('input', function (e) {
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
    paginate(docOf(row));
    penAtCaret();
    penEl.classList.add('is-writing');
    clearTimeout(writingTimer);
    writingTimer = setTimeout(function () { penEl.classList.remove('is-writing'); }, 150);
    saveSoon();
  });

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
  book.addEventListener('click', function (e) {
    var note = e.target.closest && e.target.closest('.note');
    if (note && note._note) openReply(note._note);
  });
  book.addEventListener('focusout', function (e) {
    if (e.target.closest && e.target.closest('.blk')) penOff();
  });

  /* Beim Berühren eines Gedankens leuchtet die Stelle wie mit Textmarker auf, auf die er sich bezieht */
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
    book.querySelectorAll('.is-linked').forEach(function (x) { x.classList.remove('is-linked'); });
  }
  ['pointerover', 'focusin'].forEach(function (ev) {
    book.addEventListener(ev, function (e) { var a = e.target.closest && e.target.closest('.note'); if (a && a._note) highlight(a._note); });
  });
  ['pointerout', 'focusout'].forEach(function (ev) {
    book.addEventListener(ev, function (e) { if (e.target.closest && e.target.closest('.note')) clearHL(); });
  });

  /* ---------- Doppelseiten und Blättern ---------- */
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
    var doc = { id: id || newId(), spreads: [] };
    addSpread(doc);
    state.docs.push(doc);
    return doc;
  }
  function fill(doc, data) {
    var pending = [];
    data.forEach(function (d) {
      var row = addRow(null, d.type || 'p', d.text || '', doc.spreads[0].sheet);
      (d.notes || []).forEach(function (n) { renderNote(row, n.text, n.anchor || (d.type === 'p' ? d.text : null), true, n.id); });
      if (d.replyTo) pending.push({ row: row, id: d.replyTo });
    });
    pending.forEach(function (x) {
      var parent = state.noteIndex[x.id];
      if (!parent) return;
      x.row._replyTo = parent;
      parent.replyRow = x.row;
      x.row._blk.dataset.placeholder = 'Deine Antwort …';
    });
    if (!docRows(doc).length) addRow(null, 'p', '', doc.spreads[0].sheet);
  }

  function syncChrome() {
    var list = flat();
    state.cur = Math.max(0, Math.min(state.cur, list.length - 1));
    list.forEach(function (s, i) {
      var c = i === state.cur;
      s.nl.textContent = String(i * 2 + 1);
      s.nr.textContent = String(i * 2 + 2);
      if (state.single) s.nr.textContent = String(i + 1);
      if (!state.flip) {
        s.el.classList.toggle('is-current', c);
        s.el.inert = !c;
        s.el.setAttribute('aria-hidden', c ? 'false' : 'true');
      }
    });
    prevBtn.hidden = state.cur <= 0;
    nextBtn.hidden = state.cur >= list.length - 1;
    renderTabs();
  }
  function titleOf(doc) {
    var list = docRows(doc), i, t;
    for (i = 0; i < list.length; i++) if (list[i].dataset.type === 'h1' && (t = text(list[i]._blk).trim())) return shorten(t);
    for (i = 0; i < list.length; i++) if ((t = text(list[i]._blk).trim())) return shorten(t);
    return 'Neu';
  }
  function renderTabs() {
    var cs = curSpread();
    var sig = state.docs.map(function (d) { return titleOf(d) + (cs && cs.doc === d ? '*' : ''); }).join('|');
    if (sig === state.tabSig) return;
    state.tabSig = sig;
    tabsEl.textContent = '';
    state.docs.forEach(function (d, i) {
      var b = el('button', 'ftab', titleOf(d));
      b.type = 'button';
      b.style.setProperty('--c', TAB_COLORS[i % TAB_COLORS.length]);
      b.setAttribute('aria-current', String(cs && cs.doc === d));
      b.title = titleOf(d);
      b.addEventListener('click', function () { openDoc(d); });
      tabsEl.appendChild(b);
    });
    var add = el('button', 'ftab ftab--add', '+');
    add.type = 'button';
    add.setAttribute('aria-label', 'Neue Notiz');
    add.addEventListener('click', addDoc);
    tabsEl.appendChild(add);
  }
  function openDoc(d) {
    var cs = curSpread();
    if (cs && cs.doc === d) return;
    var idx = flat().indexOf(d.spreads[0]), last = d.spreads.length === 1;
    var rl = rowsIn(d.spreads[0]);
    go(idx, last && rl.length ? { focus: rl[rl.length - 1] } : {});
  }
  function flipBy(dir) {
    var idx = state.cur + dir, list = flat();
    if (idx < 0 || idx >= list.length) return;
    var rl = rowsIn(list[idx]);
    go(idx, rl.length ? { focus: dir > 0 ? rl[0] : rl[rl.length - 1], off: dir > 0 ? 0 : Infinity } : {});
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

  /* Seite umschlagen: oben liegt ein Blatt aus Papier (aus Abzügen der beiden Seiten), das sich um den Falz dreht */
  function cloneSpread(sp) {
    var c = sp.el.cloneNode(true);
    c.classList.remove('is-current');
    c.removeAttribute('inert'); c.inert = true;
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'visibility:visible;position:absolute;top:0;right:auto;bottom:auto;inset:auto;';
    Array.prototype.forEach.call(c.querySelectorAll('[contenteditable]'), function (n) { n.removeAttribute('contenteditable'); });
    Array.prototype.forEach.call(c.querySelectorAll('[tabindex]'), function (n) { n.removeAttribute('tabindex'); });
    return c;
  }
  function finishFlip() {
    var f = state.flip;
    if (!f) return;
    state.flip = null;
    try { f.anim.cancel(); } catch (e) {}
    f.cleanup();
  }
  /* A kommt im Buch vor B. reverse = zurückblättern */
  function playTurn(A, B, reverse, to) {
    var W = book.clientWidth, H = book.clientHeight, single = state.single, half = single ? W : W / 2;
    var leaf = el('div', 'leaf');
    leaf.style.width = half + 'px';
    leaf.style.left = (single ? 0 : W - half) + 'px';

    var front = el('div', 'leaf__face leaf__face--front paper paper--r');
    var fc = cloneSpread(A);
    fc.style.width = W + 'px'; fc.style.height = H + 'px'; fc.style.left = single ? '0' : -(W - half) + 'px';
    var fs = el('div', 'leaf__shade');
    front.append(fc, fs);
    leaf.append(front);

    var bs = null;
    if (!single) {
      var back = el('div', 'leaf__face leaf__face--back paper paper--l');
      var bc = cloneSpread(B);
      bc.style.width = W + 'px'; bc.style.height = H + 'px'; bc.style.left = '0';
      bs = el('div', 'leaf__shade');
      back.append(bc, bs);
      leaf.append(back);
    }
    leafSlot.appendChild(leaf);

    if (single) { B.el.style.visibility = 'visible'; }
    else {
      A.el.style.visibility = 'visible'; A.el.style.clipPath = 'inset(0 50% 0 0)';
      B.el.style.visibility = 'visible'; B.el.style.clipPath = 'inset(0 0 0 50%)';
    }
    to.el.inert = false;
    to.el.setAttribute('aria-hidden', 'false');
    book.classList.add('is-turning');
    penOff();

    var opts = { duration: single ? 620 : 1000, easing: 'cubic-bezier(0.45, 0.05, 0.55, 0.95)', fill: 'both', direction: reverse ? 'reverse' : 'normal' };
    var anim = leaf.animate(single
      ? [{ transform: 'rotateY(0deg)', opacity: 1 }, { transform: 'rotateY(-100deg)', opacity: 0 }]
      : [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-180deg)' }], opts);
    fs.animate([{ opacity: 0 }, { opacity: single ? 0.5 : 0.62, offset: 0.5 }, { opacity: single ? 0.5 : 0.62 }], opts);
    if (bs) bs.animate([{ opacity: 0.62 }, { opacity: 0.62, offset: 0.5 }, { opacity: 0 }], opts);

    function cleanup() {
      leaf.remove();
      [A, B].forEach(function (s) { s.el.style.visibility = ''; s.el.style.clipPath = ''; });
      book.classList.remove('is-turning');
      syncChrome();
      save();
    }
    state.flip = { anim: anim, cleanup: cleanup };
    anim.onfinish = function () { if (state.flip && state.flip.anim === anim) { state.flip = null; cleanup(); } };
  }

  function go(idx, opts) {
    opts = opts || {};
    var list = flat();
    if (idx < 0 || idx >= list.length) return;
    function arrive() {
      if (opts.select) { selectRow(opts.select); return; }
      if (opts.focus && opts.focus.isConnected) placeCaret(opts.focus._blk, opts.off == null ? Infinity : opts.off);
    }
    if (idx === state.cur) { if (!state.flip) syncChrome(); arrive(); return; }
    finishFlip();
    var from = list[state.cur], to = list[idx], forward = idx > state.cur;
    clearSel();
    if (document.activeElement && document.activeElement.blur && !opts.focus) document.activeElement.blur();
    state.cur = idx;
    if (reduced || !state.ready) { syncChrome(); save(); arrive(); return; }
    playTurn(forward ? from : to, forward ? to : from, !forward, to);
    syncChrome();
    arrive();
  }

  /* ---------- Notizen anlegen und entfernen ---------- */
  function addDoc() {
    var doc = createDoc();
    fill(doc, [{ type: 'p', text: '' }]);
    state.tabSig = '';
    go(flat().indexOf(doc.spreads[0]), { focus: rowsIn(doc.spreads[0])[0], off: 0 });
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
    if (state.docs.length === 1) {
      doc.spreads.slice(1).forEach(function (s) { s.el.remove(); });
      doc.spreads.length = 1;
      doc.spreads[0].sheet.textContent = '';
      addRow(null, 'p', '', doc.spreads[0].sheet);
      state.cur = 0; state.tabSig = '';
      syncChrome(); save();
      return;
    }
    var di = state.docs.indexOf(doc);
    var targetDoc = state.docs[di + 1] || state.docs[di - 1];
    var targetSpread = targetDoc.spreads[0];
    state.docs.splice(di, 1);
    doc.spreads.forEach(function (s) { s.el.remove(); });
    var newIdx = flat().indexOf(targetSpread);
    state.cur = newIdx;
    state.tabSig = '';
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
    state.tabSig = '';
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
