(function () {
  'use strict';

  var sheet = document.getElementById('sheet');
  var statusEl = document.getElementById('status');
  var statusWrap = document.getElementById('statusWrap');
  var statsEl = document.getElementById('stats');
  var playBtn = document.getElementById('play');
  var narrow = window.matchMedia('(max-width: 44rem)');

  /* Pausen, Mindestabstand zwischen zwei Anmerkungen, wie viele gleichzeitig kräftig sichtbar bleiben */
  var IDLE = { rand: 3500, gespraech: 2000, still: Infinity };
  var GAP = { rand: 4000, gespraech: 2500, still: Infinity };
  var CAP = { rand: 3, gespraech: 5, still: 3 };

  var state = {
    mode: 'rand', lastKey: 0, lastDeliver: 0, queue: [], notes: [],
    busy: false, gen: 0, uid: 0, demoToken: null, selected: null, drag: null
  };

  var plain = (function () {
    var d = document.createElement('div');
    try { d.contentEditable = 'plaintext-only'; } catch (e) {}
    return d.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true';
  })();

  var TITLE = 'Unsichtbare Technik';
  var P1 = 'Je selbstverständlicher proaktive Systeme und IoT-Geräte werden, etwa der Aufzug im Büro oder das Thermostat zuhause, desto weniger müssen wir mit Technik interagieren. Alles wird einfach zu Daten und fließt direkt in unsere persönlichen Systeme. Manuelle Eingabe gehört damit der Vergangenheit an.';
  var P2 = 'Ich glaube, dass das vor allem Menschen mit wenig Zeit nützt.';

  var PLACEHOLDER = { p: 'Schreib einen Gedanken oder eine Annahme …', h1: 'Titel', li: 'Listenpunkt' };
  var FALLBACKS = [
    { kind: 'frage', text: 'Was wäre das Gegenteil dieser Aussage, und wer würde es vertreten?',
      explain: 'Ein Gegenteil zeigt, was deine Aussage wirklich trägt. Wenn du es nicht ausformulieren kannst, ist sie vermutlich noch zu weich.' },
    { kind: 'erweiterung', text: 'Zoom rein: Nimm ein konkretes Beispiel aus deinem Alltag. Hält die Aussage dort noch?',
      explain: 'Allgemeine Sätze fühlen sich schnell richtig an. Ein Beispiel prüft sie. Welches fällt dir als Erstes ein?' },
    { kind: 'erweiterung', text: 'Zoom raus: In welchem größeren Zusammenhang steht das, und wer profitiert davon?',
      explain: 'Ich frage nach dem Zusammenhang, weil Aussagen oft erst durch ihren Rahmen eine Richtung bekommen. Wer hat ein Interesse daran, dass es so ist?' }
  ];
  var STOP = ['natürlich', 'allerdings', 'gleichzeitig', 'außerdem', 'dadurch', 'deshalb', 'trotzdem', 'manchmal', 'wirklich', 'eigentlich', 'besonders', 'verschiedene', 'verschiedenen', 'unterschiedlich'];
  var HANDLE_SVG = '<svg viewBox="0 0 10 14" aria-hidden="true"><circle cx="2" cy="2" r="1.3"/><circle cx="8" cy="2" r="1.3"/><circle cx="2" cy="7" r="1.3"/><circle cx="8" cy="7" r="1.3"/><circle cx="2" cy="12" r="1.3"/><circle cx="8" cy="12" r="1.3"/></svg>';

  /* ---------- Hilfen ---------- */
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
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
    row._blk.dataset.placeholder = PLACEHOLDER[type];
  }
  function makeRow(type) {
    var row = el('section', 'row');
    var me = el('div', 'cell cell--me');
    var handle = el('button', 'handle');
    handle.type = 'button';
    handle.draggable = true;
    handle.tabIndex = -1;
    handle.setAttribute('aria-label', 'Block markieren oder verschieben');
    handle.innerHTML = HANDLE_SVG;
    var body = el('div', 'body');
    var blk = el('div', 'blk');
    blk.contentEditable = plain;
    blk.setAttribute('role', 'textbox');
    blk.setAttribute('aria-label', 'Dein Gedanke');
    blk.spellcheck = true;
    blk.lang = 'de';
    body.append(blk);
    me.append(handle, body);
    var ai = el('div', 'cell cell--ai');
    ai.setAttribute('aria-live', 'polite');
    row.append(me, ai);
    row._blk = blk; row._ai = ai;
    row._analyzed = new Set(); row._shown = new Set(); row._noteCount = 0;
    setType(row, type || 'p');
    return row;
  }
  function addRow(after, type, txt) {
    var row = makeRow(type);
    if (txt) row._blk.textContent = txt;
    if (after) after.after(row); else sheet.append(row);
    return row;
  }
  function purgeNotes() {
    state.notes = state.notes.filter(function (n) { return n.row.isConnected; });
    updateStats();
  }
  function removeRow(row) {
    if (state.selected === row) state.selected = null;
    row.remove();
    if (!sheet.querySelector('.row')) addRow(null, 'p');
    purgeNotes();
  }
  function moveRow(row, dir) {
    var sib = dir < 0 ? row.previousElementSibling : row.nextElementSibling;
    if (!sib) return;
    if (dir < 0) sib.before(row); else sib.after(row);
    rows().forEach(layoutNotes);
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

  /* ---------- Analyse (simulierte KI) ---------- */
  function prevSentences(row) {
    var out = [], list = rows();
    for (var i = 0; i < list.length && list[i] !== row; i++) {
      if (list[i].dataset.type !== 'h1') out = out.concat(sentences(text(list[i]._blk).trim()));
    }
    return out;
  }
  function recentNote(row) {
    var list = rows(), idx = list.indexOf(row);
    for (var i = idx - 1; i >= Math.max(0, idx - 3); i--) {
      var found = state.notes.filter(function (n) { return n.row === list[i] && !n._explained && !n.el.hidden; });
      if (found.length) return found[found.length - 1];
    }
    return null;
  }
  function answerFor(txt, parent) {
    var isQ = /\?\s*$/.test(txt) || /^(was|wie|warum|wieso|weshalb|wer|wo|wann|welche|meinst|what|why|how)\b/i.test(txt);
    parent._explained = true;
    if (parent.kind === 'antwort') {
      return isQ ? 'Das beantwortest du besser selbst. Wie lautet deine erste Antwort in einem Satz?'
                 : 'Notiert. Schreib das als Satz in deinen Text, dann lese ich ihn mit.';
    }
    return isQ ? parent.explain
               : 'Das ist ein neuer Gedanke: „' + shorten(txt) + '“. Gehört er in diesen Absatz, oder ist er ein eigener?';
  }
  function rulesFor(s, prevs) {
    var out = [], low = s.toLowerCase(), m;
    if (/interaktion|interagier|interact/.test(low) && /technik|technolog|daten|data|system/.test(low)) {
      out.push({ pri: 1, kind: 'frage',
        text: 'Wenn die Umgebung alles über Daten vorwegnimmt: Verschwindet echte Interaktion mit Technik ganz, oder verlagert sie sich nur hinter die Kulissen?',
        explain: 'Du schreibst, dass wir kaum noch mit Technik interagieren müssen. Ich frage, ob die Interaktion wegfällt oder nur unsichtbar wird. Dann entscheidet nämlich jemand anderes, was zu Daten wird und was nicht.' });
    }
    m = low.match(/\b(immer|nie|niemals|alle|alles|jeder|jede|jedes|niemand|nichts|stets|überall|ausschließlich|always|never|everyone|everything)\b/);
    if (m) {
      out.push({ pri: 2, kind: 'frage',
        text: '„' + m[0] + '“? Fällt dir ein Fall ein, in dem das nicht stimmt?',
        explain: 'Ich frage, weil „' + m[0] + '“ eine Aussage ohne Ausnahme behauptet. Ein einziges Gegenbeispiel verändert deine These. Wie sähe das stärkste aus?' });
    }
    m = low.match(/\b(einfach|einfacher|besser|beste|gut|schlecht|intuitiv|modern|smart|wichtig|natürlich|offensichtlich|logisch|klar)\b/);
    if (m) {
      out.push({ pri: 2.5, kind: 'frage',
        text: 'Was heißt „' + m[0] + '“ hier konkret? Woran würdest du es erkennen?',
        explain: '„' + m[0] + '“ klingt klar, lässt sich aber ganz verschieden lesen. Wenn du den Gedanken ohne dieses Wort sagst, wird er schärfer. Wie lautet er?' });
    }
    if (/\b(ich glaube|ich denke|ich vermute|ich finde|vermutlich|wahrscheinlich|vielleicht|i think|i believe)\b|\b(weil|deshalb|daher|denn)\b/.test(low)) {
      out.push({ pri: 3, kind: 'festhalten',
        text: '„' + shorten(s) + '“ ist bei dir eine Annahme, kein Befund. Sie darf bleiben, solange du weißt, dass sie eine ist.',
        explain: 'Ich trenne, was du weißt, von dem, was du annimmst. Für diesen Satz sehe ich im Text keinen Beleg. Woher kommt er: aus Erfahrung, aus einer Studie, aus einem Gefühl?' });
    }
    var words = (low.match(/[a-zäöüß]{8,}/g) || []).filter(function (w) { return STOP.indexOf(w) < 0; });
    for (var i = 0; i < words.length && !out.some(function (o) { return o.pri === 4; }); i++) {
      for (var j = 0; j < prevs.length; j++) {
        if (prevs[j].toLowerCase().indexOf(words[i]) >= 0 && prevs[j] !== s) {
          out.push({ pri: 4, kind: 'erweiterung',
            text: 'Das knüpft an weiter oben an: „' + shorten(prevs[j], 60) + '“. Passen beide Aussagen zusammen, oder zieht eine an der anderen?',
            explain: 'Zwei Stellen sprechen von „' + words[i] + '“, sagen dazu aber vielleicht Verschiedenes. Dort widerspricht sich ein Text oft selbst, ohne dass es auffällt.' });
          break;
        }
      }
    }
    if (/\?\s*$/.test(s)) {
      out.push({ pri: 4.5, kind: 'erweiterung',
        text: 'Du stellst die Frage, beantwortest sie aber noch nicht. Was wäre deine vorläufige Antwort in einem Satz?',
        explain: 'Eine offene Frage im Text ist ein Versprechen. Eine vorläufige Antwort, auch eine falsche, gibt dir etwas zum Prüfen.' });
    }
    if (/\b(ki|ai|llm|modell|modelle)\b|künstliche intelligenz/.test(low)) {
      out.push({ pri: 5, kind: 'erweiterung',
        text: 'Was verlierst du, wenn die KI das übernimmt, und woran würdest du es merken?',
        explain: 'Wer etwas abgibt, merkt den Verlust oft erst spät. Ich frage nach dem Anzeichen, an dem du es früher bemerken würdest.' });
    }
    if (/nutzer|user|menschen|kunden|zielgruppe/.test(low)) {
      out.push({ pri: 5.5, kind: 'erweiterung',
        text: 'Eine Sicht, die fehlt: Menschen, die das nicht freiwillig nutzen oder gar nicht nutzen können.',
        explain: 'Texte über „die Menschen“ meinen meist die, die mitmachen. Ich frage nach denen, die es nicht tun.' });
    }
    return out;
  }
  function fallback(row, anchor, kind) {
    var list = FALLBACKS.filter(function (f) { return !kind || f.kind === kind; });
    var f = list.find(function (x) { return !row._shown.has(x.text); });
    if (!f) { row._fb = ((row._fb || 0) + 1) % list.length; f = list[row._fb]; }
    return Object.assign({}, f, { anchor: anchor, pri: 9 });
  }
  function analyze(row, opts) {
    if (row.dataset.type === 'h1') return null;
    var full = text(row._blk).trim();
    if (!full) return null;
    var isQuestion = /\?\s*$/.test(full) && /^(was|wie|warum|wieso|weshalb|wer|wo|wann|welche|meinst)\b/i.test(full);
    if (!row._replyTo && isQuestion) row._replyTo = recentNote(row);
    if (row._replyTo) {
      if (row._answered) return null;
      row._answered = true;
      return [{ kind: 'antwort', text: answerFor(full, row._replyTo), anchor: null }];
    }
    var all = sentences(full);
    var fresh = opts.force ? all : all.filter(function (s) { return !row._analyzed.has(s); });
    all.forEach(function (s) { row._analyzed.add(s); });
    var prevs = prevSentences(row), cands = [];
    fresh.forEach(function (s, i) {
      rulesFor(s, prevs).forEach(function (c) { c.anchor = s; c.idx = i; cands.push(c); });
    });
    cands = cands.filter(function (c) { return !row._shown.has(c.text); })
      .sort(function (a, b) { return a.pri - b.pri || a.idx - b.idx; });
    var out = [];
    if (cands.length) out.push(cands[0]);
    else if (opts.force || (opts.closed && row._noteCount === 0 && full.length >= 60)) out.push(fallback(row, all[all.length - 1]));
    if (!out.length) return null;
    row._shown.add(out[0].text);
    if (state.mode === 'gespraech') {
      var alt = cands.slice(1).find(function (c) { return c.kind === 'erweiterung' && c.text !== out[0].text; });
      out.push(alt || fallback(row, out[0].anchor, 'erweiterung'));
      row._shown.add(out[1].text);
    }
    return out;
  }

  /* ---------- Anmerkungen ---------- */
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
  function layoutNotes(row) {
    var first = row._ai.querySelector('.note:not([hidden])');
    if (!first) return;
    first.style.marginTop = '';
    var n = first._note;
    if (narrow.matches || !n || !n.anchor) return;
    var r = anchorRange(row._blk, n.anchor);
    if (!r) return;
    var top = r.getBoundingClientRect().top - row._blk.getBoundingClientRect().top;
    var max = Math.max(0, row._blk.offsetHeight - 48);
    first.style.marginTop = Math.max(0, Math.min(top, max)) + 'px';
  }
  function updateHasNotes(row) {
    row.classList.toggle('has-notes', !!row._ai.querySelector('.note:not([hidden])'));
  }
  function applyCap() {
    var open = state.notes.filter(function (n) { return n.kind !== 'antwort' && n.row.isConnected; });
    var keep = CAP[state.mode];
    open.forEach(function (n, i) { n.el.classList.toggle('is-faded', i < open.length - keep); });
  }
  function updateStats() {
    var asked = state.notes.filter(function (n) { return n.kind !== 'antwort'; }).length;
    var answered = state.notes.length - asked;
    statsEl.textContent = asked + ' Anmerkungen · ' + answered + ' Antworten · 0 übernommen';
  }
  function put(row, node) { row._ai.appendChild(node); }
  function renderNote(row, d, instant) {
    var n = { id: ++state.uid, kind: d.kind, text: d.text, explain: d.explain, anchor: d.anchor || null, row: row };
    var art = el('p', 'note note--' + n.kind, n.text);
    art.tabIndex = 0;
    art.setAttribute('role', 'button');
    art.title = 'Klicken, um zu antworten';
    art._note = n; n.el = art;
    state.notes.push(n);
    if (n.kind !== 'antwort') row._noteCount++;
    put(row, art);
    if (instant) art.classList.add('is-in');
    else requestAnimationFrame(function () { requestAnimationFrame(function () { art.classList.add('is-in'); }); });
    updateHasNotes(row);
    layoutNotes(row);
    applyCap();
    updateStats();
    return n;
  }
  function thinking() {
    var t = el('div', 'thinking');
    t.append(el('i'), el('i'), el('i'));
    return t;
  }
  function deliver(item) {
    var row = item.row, notes = item.notes, gen = state.gen;
    if (!row.isConnected) return;
    state.busy = true;
    var th = thinking();
    put(row, th);
    function finish() { state.busy = false; state.lastDeliver = Date.now(); }
    setTimeout(function () {
      if (gen !== state.gen) return;
      th.remove();
      if (row.isConnected) renderNote(row, notes[0]);
      if (notes[1]) {
        var th2 = thinking();
        put(row, th2);
        setTimeout(function () {
          if (gen !== state.gen) return;
          th2.remove();
          if (row.isConnected) renderNote(row, notes[1]);
          finish();
        }, 1000);
      } else finish();
    }, 1100);
  }
  function pump() {
    while (state.queue.length && !state.queue[0].row.isConnected) state.queue.shift();
    if (state.busy || !state.queue.length) return;
    var item = state.queue[0], now = Date.now();
    if (!item.force) {
      if (state.mode === 'still') return;
      if (now - state.lastKey < IDLE[state.mode] || now - state.lastDeliver < GAP[state.mode]) return;
    }
    state.queue.shift();
    deliver(item);
  }
  function ping(row) {
    if (!text(row._blk).trim()) return;
    var notes = analyze(row, { force: true });
    if (notes) { state.queue.unshift({ row: row, notes: notes, force: true }); pump(); }
  }
  function openReply(note) {
    if (note.replyRow && note.replyRow.isConnected) { placeCaret(note.replyRow._blk, Infinity); return note.replyRow; }
    var r = addRow(note.row, 'p');
    r._replyTo = note;
    r.classList.add('is-reply');
    note.replyRow = r;
    r._blk.dataset.placeholder = 'Deine Antwort …';
    placeCaret(r._blk, Infinity);
    return r;
  }

  /* ---------- Schreiben ---------- */
  function closeRow(row) {
    if (row.dataset.type === 'h1' || !text(row._blk).trim()) return;
    row._closed = true;
    row._dirty = false;
    if (state.mode === 'still') return;
    var notes = analyze(row, { closed: true });
    if (notes) state.queue.push({ row: row, notes: notes, force: !!row._replyTo });
  }
  function enter(row) {
    var full = text(row._blk), off = caretOffset(row._blk);
    if (row.dataset.type === 'li' && !full.trim()) { setType(row, 'p'); return; }
    var before = full.slice(0, off), after = full.slice(off);
    row._blk.textContent = before;
    var nr = addRow(row, row.dataset.type === 'li' ? 'li' : 'p', after);
    if (after) { nr._dirty = true; row._dirty = true; }
    closeRow(row);
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
    prev._dirty = true;
    placeCaret(prev._blk, prevText.length);
  }
  function staleCheck(row) {
    var t = text(row._blk);
    state.notes.forEach(function (n) {
      if (n.row === row && n.anchor) n.el.classList.toggle('is-stale', t.indexOf(n.anchor) < 0);
    });
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
    state.lastKey = Date.now();
    if (row.dataset.type !== 'h1') row._dirty = true;
    staleCheck(row);
    layoutNotes(row);
  });

  sheet.addEventListener('keydown', function (e) {
    if (e.isTrusted) stopDemo();
    var blk = e.target.closest && e.target.closest('.blk');

    /* Block ist markiert (Esc) */
    if (!blk && state.selected && e.target === sheet) {
      var sel = state.selected, idx;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        var dir = e.key === 'ArrowUp' ? -1 : 1;
        if (e.shiftKey && (e.metaKey || e.ctrlKey)) { moveRow(sel, dir); return; }
        var sib = dir < 0 ? sel.previousElementSibling : sel.nextElementSibling;
        if (sib) selectRow(sib);
      } else if (e.key === 'Enter') {
        e.preventDefault(); clearSel(); placeCaret(sel._blk, Infinity);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        var list = rows(); idx = list.indexOf(sel);
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
      if (e.metaKey || e.ctrlKey) { ping(row); return; }
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
      if (e.shiftKey && (e.metaKey || e.ctrlKey)) { e.preventDefault(); moveRow(row, d); placeCaret(blk, Infinity); return; }
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
    if (e.isTrusted) stopDemo();
    if (e.target.closest && e.target.closest('.blk')) clearSel();
  });
  sheet.addEventListener('click', function (e) {
    var note = e.target.closest('.note');
    if (note) { openReply(note._note); return; }
    var h = e.target.closest('.handle');
    if (h) selectRow(h.closest('.row'));
  });

  /* Ziehen am Griff */
  function clearDrop() {
    sheet.querySelectorAll('.drop-before,.drop-after').forEach(function (r) { r.classList.remove('drop-before', 'drop-after'); });
  }
  function endDrag() {
    if (state.drag) state.drag.classList.remove('is-dragging');
    state.drag = null;
    clearDrop();
  }
  sheet.addEventListener('dragstart', function (e) {
    var h = e.target.closest && e.target.closest('.handle');
    if (!h) return;
    var row = h.closest('.row');
    state.drag = row;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'sparring-block');
    try { e.dataTransfer.setDragImage(row._blk.parentNode, 20, 20); } catch (_) {}
    row.classList.add('is-dragging');
  });
  sheet.addEventListener('dragover', function (e) {
    if (!state.drag) return;
    e.preventDefault();
    clearDrop();
    var t = e.target.closest && e.target.closest('.row');
    if (!t || t === state.drag) return;
    var r = t.getBoundingClientRect();
    t.classList.add(e.clientY > r.top + r.height / 2 ? 'drop-after' : 'drop-before');
  });
  sheet.addEventListener('drop', function (e) {
    if (!state.drag) return;
    e.preventDefault();
    var t = sheet.querySelector('.drop-before,.drop-after');
    if (t) { if (t.classList.contains('drop-after')) t.after(state.drag); else t.before(state.drag); }
    endDrag();
    rows().forEach(layoutNotes);
  });
  sheet.addEventListener('dragend', endDrag);

  /* Anker im Text zeigen, wenn man eine Anmerkung berührt */
  var hasHL = !!(window.CSS && CSS.highlights && typeof Highlight !== 'undefined');
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

  /* ---------- Modus, Status, Takt ---------- */
  function setMode(m) {
    state.mode = m;
    document.querySelectorAll('#mode button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === m)); });
    applyCap();
    updateStatus();
  }
  function updateStatus() {
    var t;
    if (state.mode === 'still') t = 'still, fragt nur auf Wunsch';
    else if (state.busy) t = 'überlegt …';
    else if (state.queue.length) t = 'wartet auf deine Pause';
    else t = 'liest mit';
    if (statusEl.textContent !== t) statusEl.textContent = t;
    statusWrap.classList.toggle('is-busy', state.busy);
  }
  document.getElementById('mode').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-mode]');
    if (b) setMode(b.dataset.mode);
  });
  setInterval(function () {
    var now = Date.now();
    if (state.mode === 'still') {
      state.queue = state.queue.filter(function (i) { return i.force; });
    } else if (now - state.lastKey >= IDLE[state.mode]) {
      rows().forEach(function (row) {
        if (!row._dirty || row.dataset.type === 'h1') return;
        var t = text(row._blk).trim();
        if (t.length >= 30 && /[.!?]["“”)]*$/.test(t)) {
          row._dirty = false;
          var notes = analyze(row, {});
          if (notes) state.queue.push({ row: row, notes: notes });
        }
      });
    }
    pump();
    updateStatus();
  }, 400);
  window.addEventListener('resize', function () { rows().forEach(layoutNotes); });

  /* ---------- Blatt, Beispiel, Demo ---------- */
  function clearSheet() {
    state.gen++;
    sheet.textContent = '';
    state.notes = []; state.queue = []; state.busy = false; state.lastDeliver = 0; state.selected = null;
    addRow(null, 'p');
    updateStats();
  }
  function seed() {
    addRow(null, 'h1', TITLE);
    var r1 = addRow(sheet.lastElementChild, 'p', P1);
    r1._closed = true;
    var n1 = renderNote(r1, analyze(r1, { closed: true })[0], true);
    var rr = openReply(n1);
    rr._blk.textContent = 'Was meinst du damit?';
    renderNote(rr, analyze(rr, { closed: true })[0], true);
    var r2 = addRow(rr, 'p', P2);
    r2._closed = true;
    renderNote(r2, analyze(r2, { closed: true })[0], true);
    addRow(r2, 'p');
    updateStats();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
  function stopDemo() {
    state.demoToken = null;
    playBtn.textContent = 'Beispiel abspielen';
  }
  async function typeText(blk, str, token) {
    placeCaret(blk, Infinity);
    for (var i = 0; i < str.length; i++) {
      if (state.demoToken !== token) return false;
      var ch = str[i];
      if (document.activeElement !== blk) placeCaret(blk, Infinity);
      var ok = false;
      try { ok = document.execCommand('insertText', false, ch); } catch (_) {}
      if (!ok) { blk.textContent += ch; blk.dispatchEvent(new Event('input', { bubbles: true })); }
      await wait(22 + Math.random() * 40 + (ch === '.' ? 220 : ch === ',' ? 70 : 0));
    }
    return true;
  }
  async function demo() {
    var token = state.demoToken = Symbol('demo');
    clearSheet();
    setMode('rand');
    playBtn.textContent = 'Stopp';
    var row = rows()[0];
    if (!(await typeText(row._blk, P1, token))) return;
    await wait(700);
    if (state.demoToken !== token) return;
    var nx = enter(row);
    if (!(await typeText(nx._blk, P2, token))) return;
    if (state.demoToken === token) stopDemo();
  }
  playBtn.addEventListener('click', function () {
    if (state.demoToken) stopDemo(); else demo();
  });
  document.getElementById('clear').addEventListener('click', function () {
    stopDemo();
    clearSheet();
    placeCaret(rows()[0]._blk, 0);
  });

  seed();
  updateStatus();
})();
