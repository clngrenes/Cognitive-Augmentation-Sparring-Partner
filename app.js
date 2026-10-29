(function () {
  'use strict';

  var deck = document.getElementById('deck');
  var tabsEl = document.getElementById('tabs');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var narrow = window.matchMedia('(max-width: 44rem)');
  var STORE = 'sparring.v2';
  var state = { papers: [], active: 0, selected: null, uid: 0, noteIndex: {}, saveTimer: null };

  var plain = (function () {
    var d = document.createElement('div');
    try { d.contentEditable = 'plaintext-only'; } catch (e) {}
    return d.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true';
  })();

  var PLACEHOLDER = { p: 'Schreib einen Gedanken …', h1: 'Titel', li: 'Listenpunkt' };
  var SEED = {
    rows: [
      { type: 'h1', text: 'Unsichtbare Technik' },
      { type: 'p', text: 'Je selbstverständlicher proaktive Systeme und IoT-Geräte werden, etwa der Aufzug im Büro oder das Thermostat zuhause, desto weniger müssen wir mit Technik interagieren. Alles wird einfach zu Daten und fließt direkt in unsere persönlichen Systeme. Manuelle Eingabe gehört damit der Vergangenheit an.',
        notes: [{ id: 'seed-1', text: 'Mark Weiser nannte das 1991 „Ubiquitous Computing“: Technik, die verschwindet. Der Preis: Wer nichts mehr bedient, merkt auch nicht mehr, wann für ihn entschieden wird.' }] },
      { type: 'p', text: 'Was meinst du damit?', replyTo: 'seed-1',
        notes: [{ id: 'seed-2', text: 'Dass unsichtbare Technik nicht neutral ist: Das Thermostat, das vorausschauend heizt, hat schon entschieden, was du brauchst. Bedienen war auch ein Moment, in dem du Nein sagen konntest.' }] },
      { type: 'p', text: '' }
    ]
  };

  /* ---------- Hilfen ---------- */
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function newId() { return 'n' + Date.now().toString(36) + (++state.uid); }
  function text(blk) { return blk.textContent.replace(/ /g, ' '); }
  function rows(sheet) { return Array.prototype.slice.call(sheet.querySelectorAll('.row')); }
  function placeCaret(blk, off) {
    blk.focus({ preventScroll: false });
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
    var lh = parseFloat(getComputedStyle(blk).lineHeight) || 32;
    var b = blk.getBoundingClientRect();
    var rr = sel.getRangeAt(0).getClientRects()[0];
    if (!rr) return true;
    return dir < 0 ? rr.top - b.top < lh * 0.9 : b.bottom - rr.bottom < lh * 0.9;
  }
  function shorten(s, n) {
    n = n || 22;
    s = s.replace(/\s+/g, ' ').trim();
    return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
  }

  /* ---------- Speichern ---------- */
  function serialize() {
    return {
      v: 2, active: state.active,
      papers: state.papers.map(function (p) {
        return {
          id: p.id,
          rows: rows(p.sheet).map(function (r) {
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
    var sheet = row.parentNode;
    if (state.selected === row) state.selected = null;
    row.remove();
    if (!sheet.querySelector('.row')) addRow(null, 'p', '', sheet);
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
    row.scrollIntoView({ block: 'nearest' });
  }

  /* ---------- Gedanken der KI ---------- */
  function revealWords(p, txt) {
    var words = txt.split(' ');
    p.textContent = '';
    words.forEach(function (w, i) { p.appendChild(el('span', 'w', w + (i < words.length - 1 ? ' ' : ''))); });
    p.setAttribute('aria-label', txt);
    var spans = p.querySelectorAll('.w');
    Array.prototype.forEach.call(spans, function (s, i) {
      if (reduced) s.classList.add('on');
      else setTimeout(function () { s.classList.add('on'); }, 40 + i * 60);
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
    saveSoon();
    return n;
  }
  function renderOffline(row) {
    var p = el('p', 'note note--off', 'Keine Verbindung zur KI.');
    row._ai.appendChild(p);
    setTimeout(function () { p.remove(); }, 6000);
  }

  /* Gesprächsverlauf dieses Zettels bis einschließlich dieser Zeile */
  function buildMessages(upTo) {
    var msgs = [];
    function push(role, t) {
      var last = msgs[msgs.length - 1];
      if (last && last.role === role) last.text += '\n' + t; else msgs.push({ role: role, text: t });
    }
    var list = rows(upTo.parentNode);
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
    var nr = addRow(row, row.dataset.type === 'li' ? 'li' : 'p', after, row.parentNode);
    requestThought(row);
    placeCaret(nr._blk, 0);
    saveSoon();
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

  deck.addEventListener('input', function (e) {
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
    saveSoon();
  });

  deck.addEventListener('keydown', function (e) {
    var sheet = e.target.closest && e.target.closest('.sheet');
    if (!sheet) return;
    var blk = e.target.closest('.blk');

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
        var list = rows(sheet), idx = list.indexOf(sel);
        var next = list[idx + 1] || list[idx - 1];
        removeRow(sel);
        if (next && next.isConnected) selectRow(next); else clearSel();
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
      var other = d < 0 ? row.previousElementSibling : row.nextElementSibling;
      if (other && atEdge(blk, d)) { e.preventDefault(); placeCaret(other._blk, Infinity); }
    }
  });

  deck.addEventListener('paste', function (e) {
    var blk = e.target.closest && e.target.closest('.blk');
    if (!blk) return;
    e.preventDefault();
    var t = ((e.clipboardData || window.clipboardData).getData('text') || '').replace(/\s+/g, ' ');
    document.execCommand('insertText', false, t);
  });
  deck.addEventListener('pointerdown', function (e) {
    if (e.target.closest && e.target.closest('.blk')) clearSel();
  });
  deck.addEventListener('click', function (e) {
    var paper = e.target.closest('.paper');
    if (!paper) return;
    if (!paper.classList.contains('is-active')) { setActive(state.papers.indexOf(paper._p), true); return; }
    var del = e.target.closest('.paper__del');
    if (del) { handleDelete(paper._p); return; }
    var note = e.target.closest('.note');
    if (note && note._note) openReply(note._note);
  });

  /* Beim Berühren eines Gedankens leuchtet die Stelle auf, auf die er sich bezieht */
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
    deck.querySelectorAll('.is-linked').forEach(function (x) { x.classList.remove('is-linked'); });
  }
  ['pointerover', 'focusin'].forEach(function (ev) {
    deck.addEventListener(ev, function (e) { var a = e.target.closest && e.target.closest('.note'); if (a && a._note) highlight(a._note); });
  });
  ['pointerout', 'focusout'].forEach(function (ev) {
    deck.addEventListener(ev, function (e) { if (e.target.closest && e.target.closest('.note')) clearHL(); });
  });

  /* ---------- Zettel ---------- */
  function createPaper(id, enterFrom) {
    var paper = el('article', 'paper');
    paper.setAttribute('aria-label', 'Notiz');
    var del = el('button', 'paper__del', 'Löschen');
    del.type = 'button';
    var sheet = el('div', 'sheet');
    sheet.tabIndex = -1;
    sheet.setAttribute('aria-label', 'Dokument');
    paper.append(del, sheet);
    var p = { id: id || newId(), el: paper, sheet: sheet, del: del };
    paper._p = p;
    if (enterFrom) paper.classList.add('is-far-next');
    deck.appendChild(paper);
    state.papers.push(p);
    return p;
  }
  function fill(p, data) {
    var pending = [];
    data.forEach(function (d) {
      var row = addRow(null, d.type || 'p', d.text || '', p.sheet);
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
    if (!p.sheet.querySelector('.row')) addRow(null, 'p', '', p.sheet);
  }
  function layoutDeck() {
    state.papers.forEach(function (p, i) {
      var d = i - state.active;
      p.el.classList.remove('is-active', 'is-prev', 'is-next', 'is-far-prev', 'is-far-next');
      p.el.classList.add(d === 0 ? 'is-active' : d === -1 ? 'is-prev' : d === 1 ? 'is-next' : d < 0 ? 'is-far-prev' : 'is-far-next');
      p.sheet.inert = d !== 0;
      p.el.setAttribute('aria-hidden', d === 0 ? 'false' : 'true');
    });
  }
  function titleOf(p) {
    var list = rows(p.sheet), i, t;
    for (i = 0; i < list.length; i++) if (list[i].dataset.type === 'h1' && (t = text(list[i]._blk).trim())) return shorten(t);
    for (i = 0; i < list.length; i++) if ((t = text(list[i]._blk).trim())) return shorten(t);
    return 'Neue Notiz';
  }
  function renderTabs() {
    tabsEl.textContent = '';
    state.papers.forEach(function (p, i) {
      var b = el('button', 'tab', titleOf(p));
      b.type = 'button';
      b.setAttribute('aria-current', String(i === state.active));
      b.addEventListener('click', function () { setActive(i, true); });
      tabsEl.appendChild(b);
    });
    var add = el('button', 'tab tab--add', '+');
    add.type = 'button';
    add.setAttribute('aria-label', 'Neue Notiz');
    add.addEventListener('click', addPaper);
    tabsEl.appendChild(add);
    var cur = tabsEl.querySelector('[aria-current="true"]');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
  function setActive(i, focus) {
    if (i < 0 || i >= state.papers.length) return;
    clearSel();
    state.active = i;
    layoutDeck();
    renderTabs();
    save();
    if (focus) {
      var list = rows(state.papers[i].sheet), last = list[list.length - 1];
      setTimeout(function () { if (last && last.isConnected && !narrow.matches) placeCaret(last._blk, Infinity); }, reduced ? 0 : 350);
    }
  }
  function addPaper() {
    var p = createPaper(null, true);
    fill(p, [{ type: 'p', text: '' }]);
    p.el.getBoundingClientRect();
    state.active = state.papers.length - 1;
    layoutDeck();
    renderTabs();
    save();
    setTimeout(function () { placeCaret(rows(p.sheet)[0]._blk, 0); }, reduced ? 0 : 350);
  }
  function handleDelete(p) {
    if (!p.del.classList.contains('is-armed')) {
      p.del.classList.add('is-armed');
      p.del.textContent = 'Wirklich löschen?';
      setTimeout(function () { p.del.classList.remove('is-armed'); p.del.textContent = 'Löschen'; }, 3000);
      return;
    }
    if (state.papers.length === 1) {
      p.sheet.textContent = '';
      addRow(null, 'p', '', p.sheet);
      p.del.classList.remove('is-armed');
      p.del.textContent = 'Löschen';
      save(); renderTabs();
      return;
    }
    var i = state.papers.indexOf(p);
    state.papers.splice(i, 1);
    state.active = Math.min(i, state.papers.length - 1);
    p.el.classList.add('is-far-next');
    setTimeout(function () { p.el.remove(); }, 700);
    layoutDeck();
    renderTabs();
    save();
  }

  /* ---------- Start ---------- */
  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.papers) || !data.papers.length) return false;
      data.papers.forEach(function (d) { fill(createPaper(d.id), Array.isArray(d.rows) ? d.rows : []); });
      state.active = Math.max(0, Math.min(data.active | 0, state.papers.length - 1));
      return true;
    } catch (e) { return false; }
  }
  if (!load()) {
    state.papers = []; deck.textContent = ''; state.noteIndex = {};
    fill(createPaper(), SEED.rows);
    state.active = 0;
  }
  layoutDeck();
  renderTabs();
})();
