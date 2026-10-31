(function () {
  'use strict';

  var root = document.documentElement;
  var rail = document.getElementById('rail');
  var listEl = document.getElementById('list');
  var addBtn = document.getElementById('addBtn');
  var wrap = document.getElementById('wrap');
  var box = document.getElementById('box');
  var binBtn = document.getElementById('bin');
  var confirmEl = document.getElementById('confirm');
  var paletteEl = document.getElementById('palette');
  var trashLayer = document.getElementById('trashlayer');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var STORE = 'sparring.v4', STORE3 = 'sparring.v3', STORE2 = 'sparring.v2';
  var COLORS = ['#c8553d', '#e0b13b', '#6f9a8d', '#5b7aa3', '#b86b87', '#8c7bb3', '#5f9462', '#d9822b'];
  /* docs = Schriftrollen. Jede ist eine einzige endlose Bahn aus Zeilen (links du, rechts die KI) */
  var state = { docs: [], cur: null, uid: 0, noteIndex: {}, saveTimer: null, single: false, L: 36, ready: false, selected: null, switching: false, queued: null };

  var plain = (function () {
    var d = document.createElement('div');
    try { d.contentEditable = 'plaintext-only'; } catch (e) {}
    return d.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true';
  })();

  var PLACEHOLDER = { p: 'Write a thought …', h1: 'Title', li: 'List item' };
  var SEED = [
    { type: 'h1', text: 'Invisible technology' },
    { type: 'p', text: 'The more self-evident proactive systems and IoT devices become, like the elevator at the office or the thermostat at home, the less we have to interact with technology. Everything turns into data and flows straight into our personal systems. Manual input belongs to the past.',
      notes: [{ id: 'seed-1', text: 'Mark Weiser called this "ubiquitous computing" in 1991: technology that disappears. The price is that when nothing needs operating, you also stop noticing when decisions are made for you.' }] },
    { type: 'p', text: 'What do you mean by that?', replyTo: 'seed-1',
      notes: [{ id: 'seed-2', text: 'That invisible technology is not neutral: a thermostat that heats ahead of time has already decided what you need. Operating a device used to be a moment where you could say no.' }] },
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
  function docRows(d) { return Array.prototype.filter.call(d.el.children, function (c) { return c.classList.contains('row'); }); }
  function docOf(row) { var e = row.closest('.doc'); return e && e._d; }
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

  /* ---------- Maße: nur die Zeilenhöhe, alles andere ergibt sich ---------- */
  function metrics() {
    var vw = window.innerWidth;
    var single = vw < 760;
    var L = single ? 32 : Math.max(34, Math.min(40, Math.round(28 + vw * 0.0065)));
    var s = root.style;
    s.setProperty('--L', L + 'px');
    s.setProperty('--fs', Math.round(L * 0.6) + 'px');
    state.single = single;
    state.L = L;
    root.classList.toggle('is-single', single);
  }

  /* Die Zeile mit dem Cursor bleibt im ruhigen Bereich der Rolle, unten wird mitgerollt */
  function ensureVisible(row, smooth) {
    if (!row || !row.isConnected) return;
    var d = docOf(row);
    if (!d || d !== state.cur) return;
    var sel = window.getSelection(), r = null;
    if (document.activeElement === row._blk && sel.rangeCount && sel.isCollapsed) {
      var rects = sel.getRangeAt(0).getClientRects();
      if (rects.length) r = rects[rects.length - 1];
    }
    if (!r) r = row._blk.getBoundingClientRect();
    var b = box.getBoundingClientRect(), L = state.L, top = b.top + 60 + L, bottom = b.top + b.height * 0.72;
    var delta = 0;
    if (r.bottom > bottom) delta = r.bottom - bottom;
    else if (r.top < top) delta = r.top - top;
    if (!delta) return;
    if (smooth && Math.abs(delta) > L * 1.5 && !reduced) box.scrollTo({ top: box.scrollTop + delta, behavior: 'smooth' });
    else box.scrollTop += delta;
  }
  function focusRow(row, off) {
    if (!row || !row.isConnected) return;
    var d = docOf(row);
    if (d !== state.cur) { switchTo(d, true, function () { focusRow(row, off); }); return; }
    placeCaret(row._blk, off == null ? Infinity : off);
    ensureVisible(row, true);
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
    return {
      v: 4, cur: Math.max(0, state.docs.indexOf(state.cur)),
      docs: state.docs.map(function (d) {
        if (d === state.cur) d.scroll = box.scrollTop;
        return {
          id: d.id, color: d.color, scroll: Math.round(d.scroll || 0),
          rows: docRows(d).map(function (r) {
            var notes = [];
            Array.prototype.forEach.call(r._ai.querySelectorAll('.note:not(.note--off)'), function (n) {
              notes.push({ id: n._note.id, text: n._note.text, marks: noteMarks(n._note) });
            });
            return { type: r.dataset.type, text: text(r._blk), replyTo: r._replyTo ? r._replyTo.id : null, quote: r._quote || null, snap: r._snap || null, notes: notes };
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
    state.saveTimer = setTimeout(function () { save(); refreshRail(); }, 450);
  }
  window.addEventListener('pagehide', save);
  box.addEventListener('scroll', function () { if (state.cur) state.cur.scroll = box.scrollTop; clearTimeout(state.scrollTimer); state.scrollTimer = setTimeout(save, 700); }, { passive: true });

  /* ---------- Blöcke ---------- */
  function replyPlaceholder(row) {
    return row._quote ? 'Your take on this …' : 'Your reply …';
  }
  /* Antwort auf einen Gedanken: trägt wie die Gedanken rechts einen Punkt am Rand, die Stelle bleibt rechts markiert */
  function setQuote(row, quote) {
    row._quote = quote || null;
    row.classList.add('is-reply');
    if (row._replyTo) row._blk.dataset.placeholder = replyPlaceholder(row);
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
    blk.setAttribute('aria-label', 'Your thought');
    blk.spellcheck = false;
    blk.lang = 'en';
    body.append(blk);
    me.append(body);
    var ai = el('div', 'cell cell--ai');
    ai.setAttribute('aria-live', 'polite');
    var fold = el('button', 'fold');
    fold.type = 'button';
    fold.textContent = 'Show all';
    row.append(me, ai, fold);
    row._blk = blk; row._ai = ai; row._fold = fold;
    setType(row, type || 'p');
    return row;
  }
  function addRow(after, type, txt, d) {
    var row = makeRow(type);
    if (txt) row._blk.textContent = txt;
    if (after) after.after(row); else d.el.append(row);
    return row;
  }
  function removeRow(row) {
    var d = docOf(row);
    if (state.selected === row) state.selected = null;
    clearTimeout(row._tt);
    row.remove();
    if (!docRows(d).length) addRow(null, 'p', '', d);
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
    ensureVisible(row, true);
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
  /* Wort für Wort: ein Takt entscheidet, wie viele Wörter schon da sind, so erscheinen sie immer von vorn nach hinten */
  function revealWords(p) {
    var spans = p.querySelectorAll('.w'), n = spans.length, shown = 0, t0 = performance.now();
    function all() { while (shown < n) spans[shown++].classList.add('on'); }
    if (reduced) { all(); return; }
    function tick(now) {
      if (!p.isConnected) { all(); return; }
      var k = Math.min(n, Math.floor((now - t0 - 60) / 115) + 1);
      while (shown < k) spans[shown++].classList.add('on');
      if (shown < n) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  function renderNote(row, txt, instant, id, marks) {
    var art = el('p', 'note');
    art.tabIndex = 0;
    art.setAttribute('role', 'button');
    var n = { id: id || newId(), row: row, text: txt, el: art, mk: [], replyRows: [] };
    n.words = buildWords(art, txt, instant);
    (marks || []).forEach(function (m) { for (var i = m[0]; i <= m[1]; i++) n.mk[i] = true; });
    applyMarks(n);
    var x = el('span', 'note__x');
    x.setAttribute('role', 'button');
    x.setAttribute('aria-label', 'Remove this thought');
    art.appendChild(x);
    art._note = n;
    state.noteIndex[n.id] = n;
    row._ai.appendChild(art);
    updateFold(row);
    if (!instant) { revealWords(art); ensureVisible(document.activeElement && document.activeElement.closest && document.activeElement.closest('.row')); }
    saveSoon();
    return n;
  }
  function renderOffline(row) {
    var p = el('p', 'note note--off', 'No connection to the AI.');
    row._ai.appendChild(p);
    setTimeout(function () { p.remove(); }, 6000);
  }

  /* Rechts nie höher als sechs Zeilen: ist mehr da, erscheint "Show all" */
  function updateFold(row) {
    var d = docOf(row);
    if (!d || !d.el.classList.contains('is-current') || !row.isConnected) return;
    var ai = row._ai, ns = ai.querySelectorAll('.note:not(.note--off)'), over = false, lines = 6;
    /* Ist dein Text länger als sechs Zeilen, darf rechts bis zu dessen Ende stehen */
    if (!state.single) lines = Math.max(6, Math.ceil((row._blk.getBoundingClientRect().height - 2) / state.L));
    if (row._cap !== lines) { row._cap = lines; row.style.setProperty('--cap', lines); }
    if (ns.length) over = ns[ns.length - 1].getBoundingClientRect().bottom - ai.getBoundingClientRect().top > state.L * lines + 2;
    row.classList.toggle('is-foldable', over);
    if (!over) row.classList.remove('is-open');
    row._fold.textContent = row.classList.contains('is-open') ? 'Fold' : 'Show all';
  }
  function foldAll(d) { if (d) docRows(d).forEach(updateFold); }
  function removeNote(n) {
    var art = n.el, row = n.row;
    if (n.gone) return;
    n.gone = true;
    delete state.noteIndex[n.id];
    n.replyRows.slice().forEach(function (r) {
      if (!r.isConnected) return;
      if (!text(r._blk).trim()) { removeRow(r); return; }
      r._replyTo = null; r._quote = null;
      r.classList.remove('is-reply');
      r._blk.dataset.placeholder = PLACEHOLDER[r.dataset.type] || PLACEHOLDER.p;
    });
    n.replyRows = [];
    function done() {
      art.remove();
      if (!row._ai.querySelector('.note:not(.note--off)')) row._snap = '';
      updateFold(row);
      saveSoon();
    }
    if (reduced || !art.animate) { done(); return; }
    art.style.pointerEvents = 'none';
    var an = art.animate([{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'translateX(18px)', filter: 'blur(3px)' }], { duration: 260, easing: 'ease-in', fill: 'forwards' });
    an.onfinish = done;
  }

  /* Gesprächsverlauf bis einschließlich dieser Zeile. Es zählt immer der aktuelle Text:
     Was du löschst oder änderst, sieht die KI so, wie es jetzt dasteht. */
  function notesOfRow(r) {
    var out = [];
    r._ai.querySelectorAll('.note:not(.note--off)').forEach(function (n) { out.push(n._note.text); });
    return out;
  }
  function diffText(snap, cur) {
    var p = 0, n = Math.min(snap.length, cur.length);
    while (p < n && snap.charCodeAt(p) === cur.charCodeAt(p)) p++;
    var s = 0, m = Math.min(snap.length, cur.length) - p;
    while (s < m && snap.charCodeAt(snap.length - 1 - s) === cur.charCodeAt(cur.length - 1 - s)) s++;
    return { removed: snap.slice(p, snap.length - s), added: cur.slice(p, cur.length - s) };
  }
  function buildMessages(upTo) {
    var msgs = [];
    function push(role, t) {
      var last = msgs[msgs.length - 1];
      if (last && last.role === role) last.text += '\n' + t; else msgs.push({ role: role, text: t });
    }
    var rows = docRows(docOf(upTo)), idx = rows.indexOf(upTo);
    for (var i = 0; i <= idx; i++) {
      var r = rows[i], t = text(r._blk).trim(), isLast = r === upTo, notes = notesOfRow(r);
      var line = function (s) {
        var l = r.dataset.type === 'h1' ? 'Title: ' + s : s;
        if (isLast && r._replyTo) l = '[Direct reply to your note]\n' + l;
        if (r._quote) l = '[Refers to your passage: "' + r._quote + '"]\n' + l;
        return l;
      };
      var cur = text(r._blk), snap = r._snap || '', changed = notes.length && snap.trim() && snap !== cur;
      if (changed) {
        /* Die KI hat auf eine ältere Fassung geantwortet: erst diese, dann was sich geändert hat */
        var d = diffText(snap, cur);
        push('user', line(snap.trim()));
        notes.forEach(function (n) { push('model', n); });
        if (d.removed.trim()) {
          push('user', '[They edited their text above. Removed: "' + d.removed.trim().slice(0, 220) + '"' + (d.added.trim() ? ' Replaced by: "' + d.added.trim().slice(0, 300) + '"' : ' (nothing in its place)') + ']\n[Current text]\n' + (t || '(now empty)'));
        } else if (d.added.trim()) {
          push('user', '[New text since your last note]\n' + d.added.trim());
        }
        if (isLast) break;
        continue;
      }
      if (isLast) { if (t) push('user', line(t)); break; }
      if (t) push('user', line(t));
      notes.forEach(function (n) { push('model', n); });
    }
    /* Ändert jemand etwas weiter oben, soll die KI wissen, was danach noch kommt */
    var later = rows.slice(idx + 1).map(function (r) { return text(r._blk).trim(); }).filter(Boolean).join(' ');
    if (later && msgs.length && msgs[msgs.length - 1].role === 'user') msgs[msgs.length - 1].text += '\n[The text continues after this passage: ' + later.slice(0, 700) + ']';
    var total = 0;
    msgs = msgs.slice(-24).map(function (m) { return { role: m.role, text: m.text.slice(0, 1500) }; });
    return msgs.filter(function (m) { total += m.text.length; return total < 8000; });
  }
  function clean(t) {
    t = String(t || '').replace(/^\s*(Du|Beitrag|You)\s*:\s*/i, '').replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ').trim();
    if (t.length > 230) {
      var cut = t.slice(0, 230), end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
      t = end > 60 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(' ')) + '…';
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

  /* Die KI wartet nicht auf Enter. Sie meldet sich, wenn du eine Pause machst oder zwei, drei Sätze geschrieben hast
     und genug Neues dasteht. Das Modell entscheidet selbst, ob es etwas Wertvolles zu sagen hat (sonst SKIP). */
  var AUTO = { idle: 2600, idleSentence: 1500, idleEnter: 900, idleReply: 1300, minChars: 48, minReply: 6, minGap: 6000 };
  function scheduleThought(row, delay) {
    clearTimeout(row._tt);
    row._tt = setTimeout(function () { maybeThink(row); }, delay);
  }
  function maybeThink(row) {
    if (!row.isConnected || row.dataset.type === 'h1') return;
    var cur = text(row._blk);
    if (!cur.trim()) return;
    var d = docOf(row), df = diffText(row._snap || '', cur);
    var need = row._replyTo ? AUTO.minReply : AUTO.minChars;
    var enough = df.added.length >= need || (df.removed.length > 0 && df.added.length >= 15 && df.removed.length + df.added.length >= 40);
    if (!enough) return;
    var wait = (d._lastAsk || 0) + AUTO.minGap - Date.now();
    if (d._busy || wait > 0) { scheduleThought(row, Math.max(600, wait)); return; }
    var msgs = buildMessages(row), ctx = othersContext(d);
    if (ctx && msgs.length && msgs[0].role === 'user') msgs[0].text = '[Other notes in this notebook]\n' + ctx + '\n\n' + msgs[0].text;
    row._snap = cur;
    d._lastAsk = Date.now();
    d._busy = true;
    fetchThought(msgs)
      .then(function (t) {
        d._busy = false;
        if (!row.isConnected || /^\W*SKIP\W*$/i.test(t.trim())) return;
        renderNote(row, clean(t), false);
      })
      .catch(function () { d._busy = false; if (row.isConnected) renderOffline(row); });
  }
  function othersContext(d0) {
    var out = [];
    state.docs.forEach(function (d) {
      if (d === d0) return;
      var t = docRows(d).map(function (r) { return text(r._blk).trim(); }).filter(Boolean).join(' ').replace(/\s+/g, ' ');
      if (t) out.push('- ' + titleOf(d) + ': ' + t.slice(0, 320));
    });
    return out.slice(0, 4).join('\n').slice(0, 1100);
  }
  /* Pause oder zwei, drei fertige Sätze */
  function delayFor(row) {
    if (row._replyTo) return AUTO.idleReply;
    var cur = text(row._blk), df = diffText(row._snap || '', cur);
    var sentences = (df.added.match(/[.!?…]+["”')\]]*(?:\s|$)/g) || []).length;
    if (sentences >= 3) return 500;
    if (sentences >= 2 && df.added.length >= 110) return 900;
    return /[.!?…]["”')\]]?\s*$/.test(cur) ? AUTO.idleSentence : AUTO.idle;
  }

  /* Antwort auf einen Gedanken, optional zu einer markierten Stelle */
  function openReply(note, quote) {
    var existing = note.replyRows.filter(function (r) { return r.isConnected && (r._quote || null) === (quote || null); })[0];
    if (existing) { focusRow(existing); return; }
    var r = makeRow('p');
    r._replyTo = note;
    setQuote(r, quote);
    var after = note.row;
    note.replyRows = note.replyRows.filter(function (x) { return x.isConnected; });
    note.replyRows.forEach(function (x) { if (x.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_PRECEDING) after = x; });
    var nn = after.nextElementSibling;
    while (nn && nn._replyTo === note) { after = nn; nn = nn.nextElementSibling; }
    after.after(r);
    note.replyRows.push(r);
    placeCaret(r._blk, 0);
    ensureVisible(r, true);
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
  /* Markierung zurücknehmen: leere Antwortblöcke zu dieser Stelle verschwinden mit ihr */
  function dropEmptyReplies(n, quote) {
    n.replyRows.slice().forEach(function (r) {
      if (r.isConnected && r._quote && (quote == null || r._quote === quote) && !text(r._blk).trim()) removeRow(r);
    });
    n.replyRows = n.replyRows.filter(function (r) { return r.isConnected; });
  }
  function unmarkRun(n, i) {
    var quote = runAround(n, i), a = i, b = i;
    while (a > 0 && n.mk[a - 1]) a--;
    while (b < n.words.length - 1 && n.mk[b + 1]) b++;
    for (var k = a; k <= b; k++) n.mk[k] = false;
    applyMarks(n);
    dropEmptyReplies(n, quote);
    save();
  }
  function clearMarks(d) {
    var any = false;
    Array.prototype.forEach.call(d.el.querySelectorAll('.note'), function (el0) {
      var n = el0._note;
      if (!n || !n.mk.some(Boolean)) return;
      any = true;
      n.mk = [];
      applyMarks(n);
      dropEmptyReplies(n, null);
    });
    if (any) save();
    return any;
  }

  /* ---------- Schreiben ---------- */
  function enter(row) {
    var full = text(row._blk), off = Math.min(caretOffset(row._blk), full.length);
    if (row.dataset.type === 'li' && !full.trim()) { setType(row, 'p'); return; }
    var before = full.slice(0, off), after = full.slice(off);
    row._blk.textContent = before;
    var nr = addRow(row, row.dataset.type === 'li' ? 'li' : 'p', after, docOf(row));
    scheduleThought(row, AUTO.idleEnter);
    placeCaret(nr._blk, 0);
    ensureVisible(nr, true);
    saveSoon();
    return nr;
  }
  function backspaceAtStart(row, e) {
    if (row.dataset.type !== 'p') { e.preventDefault(); setType(row, 'p'); return; }
    var list = docRows(docOf(row)), prev = list[list.indexOf(row) - 1];
    if (!prev) return;
    e.preventDefault();
    var mine = text(row._blk), prevText = text(prev._blk);
    if (!mine) { removeRow(row); focusRow(prev); return; }
    if (prev._ai.querySelector('.note') || row._ai.querySelector('.note')) { focusRow(prev); return; }
    prev._blk.textContent = prevText + mine;
    removeRow(row);
    focusRow(prev, prevText.length);
    scheduleThought(prev, delayFor(prev));
  }

  box.addEventListener('input', function (e) {
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
    ensureVisible(row);
    if (row._ai.firstChild) updateFold(row);
    scheduleThought(row, delayFor(row));
    saveSoon();
  });

  box.addEventListener('keydown', function (e) {
    var doc = e.target.closest && e.target.closest('.doc');
    if (!doc) return;
    var blk = e.target.closest('.blk');

    /* Block ist markiert (Esc) */
    if (!blk && state.selected && e.target === doc) {
      var sel = state.selected;
      var list = docRows(docOf(sel)), idx = list.indexOf(sel);
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        var sib = list[idx + (e.key === 'ArrowUp' ? -1 : 1)];
        if (sib) selectRow(sib);
      } else if (e.key === 'Enter') {
        e.preventDefault(); clearSel(); focusRow(sel);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
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
      else if (note && note._note && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); removeNote(note._note); }
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
      var dd = e.key === 'ArrowUp' ? -1 : 1;
      var rl = docRows(docOf(row)), other = rl[rl.indexOf(row) + dd];
      if (other && atEdge(blk, dd)) { e.preventDefault(); focusRow(other, dd < 0 ? Infinity : 0); }
    }
  });
  box.addEventListener('paste', function (e) {
    var blk = e.target.closest && e.target.closest('.blk');
    if (!blk) return;
    e.preventDefault();
    var t = ((e.clipboardData || window.clipboardData).getData('text') || '').replace(/\s+/g, ' ');
    document.execCommand('insertText', false, t);
  });
  box.addEventListener('pointerdown', function (e) {
    if (e.target.closest && e.target.closest('.blk')) clearSel();
  });

  /* Rechts auf dem Papier ist der Cursor ein Textmarker */
  box.addEventListener('mousemove', function (e) {
    if (state.single) return;
    var r = box.getBoundingClientRect();
    box.classList.toggle('on-right', e.clientX - r.left > r.width / 2);
  });
  box.addEventListener('mouseleave', function () { box.classList.remove('on-right'); });
  var justMarked = false;
  box.addEventListener('mouseup', function (e) {
    if (e.target.closest && e.target.closest('.note') && markSelection()) {
      justMarked = true;
      setTimeout(function () { justMarked = false; }, 80);
    }
  });
  box.addEventListener('click', function (e) {
    if (justMarked) return;
    var fb = e.target.closest && e.target.closest('.fold');
    if (fb) {
      var fr = fb.closest('.row');
      fr.classList.toggle('is-open');
      updateFold(fr);
      return;
    }
    var xb = e.target.closest && e.target.closest('.note__x');
    if (xb) { e.preventDefault(); removeNote(xb.closest('.note')._note); return; }
    var noteEl = e.target.closest && e.target.closest('.note');
    var d = state.cur;
    if (!noteEl || !noteEl._note) {
      if (!d || (e.target.closest && e.target.closest('.blk'))) return;
      var br = box.getBoundingClientRect();
      var rightSide = !state.single && e.clientX - br.left > br.width / 2;
      /* ein Klick auf die leere rechte Seite nimmt die Markierungen zurück, links ins Leere schreibt am Ende weiter */
      if (rightSide) clearMarks(d);
      else {
        var rows = docRows(d), last = rows[rows.length - 1];
        if (last && !e.target.closest('.row')) focusRow(last);
      }
      return;
    }
    var n = noteEl._note, w = e.target.closest('.w');
    if (w && w.classList.contains('mk')) { unmarkRun(n, Array.prototype.indexOf.call(noteEl.children, w)); return; }
    openReply(n, null);
  });

  /* ---------- Rollen anlegen, laden, wechseln ---------- */
  function createDoc(id, color) {
    var d = { id: id || newId(), color: color || COLORS[state.docs.length % COLORS.length], el: el('div', 'doc'), item: null, scroll: 0 };
    d.el.tabIndex = -1;
    d.el._d = d;
    d.el.append(el('i', 'mline mline--l'), el('i', 'mline mline--r'));
    box.appendChild(d.el);
    state.docs.push(d);
    return d;
  }
  function fill(d, data) {
    var pending = [];
    data.forEach(function (x) {
      var row = addRow(null, x.type || 'p', x.text || '', d);
      (x.notes || []).forEach(function (n) { renderNote(row, n.text, true, n.id, n.marks); });
      if (x.notes && x.notes.length) row._snap = x.snap != null ? x.snap : (x.text || '');
      if (x.replyTo) pending.push({ row: row, id: x.replyTo, quote: x.quote });
    });
    pending.forEach(function (x) {
      var parent = state.noteIndex[x.id];
      if (!parent) return;
      x.row._replyTo = parent;
      parent.replyRows.push(x.row);
      setQuote(x.row, x.quote);
    });
    if (!docRows(d).length) addRow(null, 'p', '', d);
  }

  function titleOf(d) {
    var rows = docRows(d), i, t;
    for (i = 0; i < rows.length; i++) if (rows[i].dataset.type === 'h1' && (t = text(rows[i]._blk).trim())) return shorten(t, 26);
    for (i = 0; i < rows.length; i++) if ((t = text(rows[i]._blk).trim())) return shorten(t, 26);
    return 'New scroll';
  }
  function makeItem(d) {
    var it = el('div', 'si');
    it.tabIndex = 0;
    it.setAttribute('role', 'button');
    it.innerHTML = '<span class="si__hole"><i class="si__scroll"></i></span>';
    it.appendChild(el('span', 'si__t'));
    var act = el('span', 'si__act');
    var pal = el('span', 'si__pal'); pal.setAttribute('role', 'button'); pal.setAttribute('aria-label', 'Change color');
    var x = el('span', 'si__x'); x.setAttribute('role', 'button'); x.setAttribute('aria-label', 'Delete this scroll');
    act.append(pal, x);
    it.appendChild(act);
    pal.addEventListener('click', function (e) { e.stopPropagation(); openPalette(d, pal); });
    x.addEventListener('click', function (e) { e.stopPropagation(); openConfirm(d, it, state.single ? 'below' : 'right'); });
    it.addEventListener('click', function () { closePops(); switchTo(d, true, function () { focusEnd(d); }); });
    it.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target === it) { e.preventDefault(); it.click(); } });
    return it;
  }
  function refreshRail() {
    var frag = document.createDocumentFragment();
    state.docs.forEach(function (d) {
      var fresh = !d.item;
      if (!d.item) d.item = makeItem(d);
      var it = d.item, t = titleOf(d), lab = it.querySelector('.si__t');
      if (lab.textContent !== t) lab.textContent = t;
      it.style.setProperty('--c', d.color);
      it.classList.toggle('is-current', d === state.cur);
      it.setAttribute('aria-current', String(d === state.cur));
      if (fresh && state.ready && !reduced) it.classList.add('is-land');
      frag.appendChild(it);
    });
    listEl.appendChild(frag);
    Array.prototype.forEach.call(listEl.children, function (c) { if (!state.docs.some(function (d) { return d.item === c; })) c.remove(); });
    wrap.style.setProperty('--c', state.cur ? state.cur.color : COLORS[0]);
  }
  function focusEnd(d) {
    var rows = docRows(d), pick = null, i;
    for (i = rows.length - 1; i >= 0; i--) if (!text(rows[i]._blk).trim() || i === rows.length - 1) { pick = rows[i]; break; }
    if (rows.length === 1) pick = rows[0];
    if (pick) { placeCaret(pick._blk, Infinity); }
  }

  /* Rolle wechseln: die alte rollt sich nach oben ein, die neue rollt sich von der Walze ab */
  function switchTo(d, animate, done) {
    if (state.switching) { state.queued = { d: d, done: done }; return; }
    if (state.cur === d) { if (done) done(); return; }
    var prev = state.cur;
    clearSel();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    function swap() {
      if (prev) { prev.scroll = box.scrollTop; prev.el.classList.remove('is-current'); }
      state.cur = d;
      d.el.classList.add('is-current');
      box.scrollTop = d.scroll || 0;
      foldAll(d);
      refreshRail();
      save();
    }
    if (!animate || reduced || !box.animate || !prev) { swap(); if (done) done(); return; }
    state.switching = true;
    var up = box.animate([{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 0 100% 0)' }], { duration: 230, easing: 'cubic-bezier(.5,0,.8,.45)', fill: 'forwards' });
    up.onfinish = function () {
      swap();
      var down = box.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 560, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
      up.cancel();
      down.onfinish = function () {
        state.switching = false;
        if (done) done();
        var q = state.queued; state.queued = null;
        if (q) switchTo(q.d, true, q.done);
      };
    };
  }
  function nextColor() {
    var used = state.docs.map(function (d) { return d.color; });
    for (var i = 0; i < COLORS.length; i++) if (used.indexOf(COLORS[i]) < 0) return COLORS[i];
    return COLORS[state.docs.length % COLORS.length];
  }
  function addDoc() {
    closePops();
    var d = createDoc(null, nextColor());
    fill(d, [{ type: 'p', text: '' }]);
    refreshRail();
    switchTo(d, true, function () { var r = docRows(d)[0]; if (r) placeCaret(r._blk, 0); });
    save();
  }
  addBtn.addEventListener('click', addDoc);

  /* ---------- Rückfrage, Farbwahl ---------- */
  var delTarget = null;
  function popAt(pop, anchor, kind) {
    var ar = anchor.getBoundingClientRect(), s = pop.style, vw = window.innerWidth, vh = window.innerHeight;
    s.left = s.top = s.right = s.bottom = 'auto';
    pop.hidden = false;
    var pw = pop.offsetWidth, ph = pop.offsetHeight, x, y;
    if (kind === 'right') { x = ar.right + 14; y = ar.top + ar.height / 2 - ph / 2; }
    else if (kind === 'below') { x = ar.left + ar.width / 2 - pw / 2; y = ar.bottom + 10; }
    else { x = ar.left + ar.width / 2 - pw / 2; y = ar.top - ph - 12; }
    x = Math.max(8, Math.min(vw - pw - 8, x)); y = Math.max(8, Math.min(vh - ph - 8, y));
    s.left = x + 'px'; s.top = y + 'px';
  }
  function closeConfirm() { confirmEl.hidden = true; delTarget = null; confirmEl._anchor = null; }
  function closePalette() { paletteEl.hidden = true; paletteEl._anchor = null; }
  function closePops() { closeConfirm(); closePalette(); }
  function openConfirm(d, anchor, kind) {
    var same = !confirmEl.hidden && confirmEl._anchor === anchor;
    closePops();
    if (same) return;
    delTarget = d;
    confirmEl._anchor = anchor;
    popAt(confirmEl, anchor, kind);
  }
  function openPalette(d, anchor) {
    var same = !paletteEl.hidden && paletteEl._anchor === anchor;
    closePops();
    if (same) return;
    paletteEl.textContent = '';
    COLORS.forEach(function (c) {
      var b = el('button');
      b.type = 'button';
      b.style.setProperty('--s', c);
      b.setAttribute('aria-label', 'Color ' + c);
      if (c === d.color) b.classList.add('is-on');
      b.addEventListener('click', function () { d.color = c; refreshRail(); save(); closePalette(); });
      paletteEl.appendChild(b);
    });
    paletteEl._anchor = anchor;
    popAt(paletteEl, anchor, state.single ? 'below' : 'right');
  }
  confirmEl.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button');
    if (!b) return;
    var d = delTarget;
    closeConfirm();
    if (b.dataset.act === 'delete' && d && state.docs.indexOf(d) >= 0) deleteDoc(d);
  });
  document.addEventListener('pointerdown', function (e) {
    if (confirmEl.hidden && paletteEl.hidden) return;
    if (e.target.closest && (e.target.closest('#confirm') || e.target.closest('#palette') || e.target.closest('.si__x') || e.target.closest('.si__pal') || e.target.closest('#bin'))) return;
    closePops();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePops(); });
  binBtn.addEventListener('click', function () { if (state.cur) openConfirm(state.cur, binBtn, 'above'); });

  /* ---------- Löschen: das Papier knüllt sich zusammen und fliegt in den Eimer ---------- */
  function cloneDoc(d) {
    var c = d.el.cloneNode(true);
    c.classList.add('is-current', 'is-clone');
    c.removeAttribute('tabindex');
    Array.prototype.forEach.call(c.querySelectorAll('[contenteditable]'), function (n) { n.removeAttribute('contenteditable'); });
    Array.prototype.forEach.call(c.querySelectorAll('[tabindex]'), function (n) { n.removeAttribute('tabindex'); });
    return c;
  }
  function makeSheet(d, top) {
    var W = box.clientWidth, H = box.clientHeight;
    var sh = el('div', 'tsheet');
    sh.style.cssText = 'width:' + W + 'px;height:' + H + 'px';
    var c = cloneDoc(d);
    c.style.cssText = 'width:' + W + 'px;transform:translateY(' + (-top) + 'px);display:block';
    sh.append(c);
    return sh;
  }
  /* 1. Das Blatt rollt sich von unten nach oben auf, bis es in der Walze verschwindet */
  function rollUp(sheet, done) {
    var H = box.clientHeight, end = 20, dur = 1200, ease = 'cubic-bezier(.5,.05,.35,1)';
    var tube = el('div', 'rollup');
    trashLayer.append(sheet, tube);
    sheet.animate([{ clipPath: 'inset(0 0 0px 0)' }, { clipPath: 'inset(0 0 ' + (H - end) + 'px 0)' }], { duration: dur, easing: ease, fill: 'forwards' });
    var a = tube.animate([
      { transform: 'translateY(' + (H - 17) + 'px) scaleY(0.4)' },
      { transform: 'translateY(' + (end - 17) + 'px) scaleY(1)' }
    ], { duration: dur, easing: ease, fill: 'forwards' });
    a.onfinish = function () { sheet.remove(); tube.remove(); done(); };
  }
  /* 2. Die fertige Rolle fliegt in den Eimer (der Eimer ist ein Gitter, man sieht sie darin) */
  function dropIntoBin(color, from) {
    var src = wrap.querySelector('.roller'), rr = src.getBoundingClientRect();
    var img = binBtn.querySelector('img'), br = img.getBoundingClientRect();
    var fl = el('div', 'flyer'), ro = src.cloneNode(true);
    ro.style.setProperty('--c', color);
    fl.style.cssText = 'left:' + rr.left + 'px;top:' + rr.top + 'px;width:' + rr.width + 'px;height:' + rr.height + 'px';
    fl.appendChild(ro);
    var bf = el('div', 'binfront'), bi = img.cloneNode();
    bf.style.cssText = 'left:' + br.left + 'px;top:' + br.top + 'px;width:' + br.width + 'px;height:' + br.height + 'px';
    bf.appendChild(bi);
    document.body.append(fl, bf);
    binBtn.style.visibility = 'hidden';
    var fx = rr.left + rr.width / 2, fy = rr.top + rr.height / 2;
    var sx = from ? from.x - fx : 0, sy = from ? from.y - fy : 0, k0 = from ? [0.07, 0.22] : [1, 1];
    var tx = br.left + br.width / 2 - fx, ty = br.top + br.height * 0.1 - fy;
    function tf(x, y, rot, a, b) { return 'translate(' + x + 'px,' + y + 'px) rotate(' + rot + 'deg) scale(' + a + ',' + b + ')'; }
    var an = fl.animate([
      { transform: tf(sx, sy, 0, k0[0], k0[1]), offset: 0 },
      { transform: tf(sx + (tx - sx) * 0.08, sy + (ty - sy) * 0.05 - 34, -4, from ? 0.2 : 0.62, from ? 0.4 : 0.8), offset: 0.2 },
      { transform: tf(sx + (tx - sx) * 0.7, sy + (ty - sy) * 0.45 - 130, -42, 0.12, 0.34), offset: 0.58 },
      { transform: tf(tx, ty - 70, -88, 0.075, 0.3), offset: 0.84 },
      { transform: tf(tx, ty + 52, -90, 0.075, 0.3), offset: 1 }
    ], { duration: 1250, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'forwards' });
    an.onfinish = function () {
      fl.remove();
      if (bi.animate) bi.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.1,0.9)' }, { transform: 'scale(0.98,1.04)' }, { transform: 'scale(1)' }], { duration: 340 });
      setTimeout(function () { bf.remove(); binBtn.style.visibility = ''; }, 360);
    };
    return fl;
  }
  function deleteDoc(d) {
    var isCur = state.cur === d, color = d.color;
    var itemRect = d.item ? d.item.getBoundingClientRect() : null;
    var anim = !reduced && !!Element.prototype.animate;
    var sheet = anim && isCur ? makeSheet(d, box.scrollTop) : null;
    state.queued = null;
    if (state.docs.length === 1) {
      docRows(d).forEach(function (r) { r.remove(); });
      d.scroll = 0; box.scrollTop = 0;
      addRow(null, 'p', '', d);
      d.color = COLORS[0];
    } else {
      var di = state.docs.indexOf(d);
      var target = state.docs[di + 1] || state.docs[di - 1];
      state.docs.splice(di, 1);
      d.el.remove();
      if (d.item) d.item.remove();
      if (isCur) {
        state.cur = target;
        target.el.classList.add('is-current');
        box.scrollTop = target.scroll || 0;
      }
    }
    refreshRail();
    foldAll(state.cur);
    save();
    if (!anim) return;
    if (!isCur) {
      dropIntoBin(color, itemRect ? { x: itemRect.left + 3.4 * 8 + 14, y: itemRect.top + itemRect.height / 2 } : null);
      return;
    }
    var next = state.cur.color;
    state.switching = true;
    box.style.visibility = 'hidden';
    wrap.style.setProperty('--c', color);
    rollUp(sheet, function () {
      dropIntoBin(color, null);
      wrap.classList.add('is-bare');
      setTimeout(function () {
        wrap.style.setProperty('--c', next);
        box.style.visibility = '';
        wrap.classList.remove('is-bare');
        box.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 600, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' }).onfinish = function () {
          state.switching = false;
          var q = state.queued; state.queued = null;
          if (q) switchTo(q.d, true, q.done);
        };
      }, 560);
    });
    sheet.style.setProperty('--c', color);
  }

  /* ---------- Start ---------- */
  function load() {
    try {
      var raw = localStorage.getItem(STORE), data, curIdx = 0;
      if (raw) {
        data = JSON.parse(raw);
        if (!data || !Array.isArray(data.docs) || !data.docs.length) return false;
        curIdx = data.cur | 0;
      } else {
        var old = localStorage.getItem(STORE3);
        if (old) {
          data = JSON.parse(old);
          if (!data || !Array.isArray(data.docs) || !data.docs.length) return false;
          curIdx = data.cur && data.cur.doc | 0;
        } else {
          old = localStorage.getItem(STORE2);
          if (!old) return false;
          var o = JSON.parse(old);
          if (!o || !Array.isArray(o.papers) || !o.papers.length) return false;
          data = { docs: o.papers };
          curIdx = o.active | 0;
        }
      }
      data.docs.forEach(function (x, i) {
        var d = createDoc(x.id, x.color || COLORS[i % COLORS.length]);
        d.scroll = x.scroll || 0;
        fill(d, Array.isArray(x.rows) ? x.rows : []);
      });
      state.cur = state.docs[Math.max(0, Math.min(curIdx, state.docs.length - 1))];
      return true;
    } catch (e) { return false; }
  }

  metrics();
  if (!load()) {
    state.docs = []; box.textContent = ''; state.noteIndex = {};
    var d0 = createDoc(null, COLORS[0]);
    fill(d0, SEED);
    state.cur = d0;
  }
  state.cur.el.classList.add('is-current');
  refreshRail();
  box.scrollTop = state.cur.scroll || 0;
  state.ready = true;
  foldAll(state.cur);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { foldAll(state.cur); });

  window.addEventListener('resize', function () { clearTimeout(state.rz); state.rz = setTimeout(function () { metrics(); closePops(); foldAll(state.cur); }, 120); });
})();
