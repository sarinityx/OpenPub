/* OpenPub – in-place rich text editing. While a box is edited its text lives in a
 * contenteditable element laid over the canvas; on exit it is read back into the model. */
var OP = (typeof globalThis.OP !== 'undefined') ? globalThis.OP : (globalThis.OP = {});

(function () {
  'use strict';
  var A = OP.app, S = A.S, $ = A.$;
  var ed = null, savedRange = null, editNew = false, addedText = false;

  function styleSpan(span, r) {
    span.style.fontFamily = OP.fontStack(r.font);
    span.style.fontSize = r.size + 'px';
    span.style.fontWeight = r.b ? '700' : '400';
    span.style.fontStyle = r.i ? 'italic' : 'normal';
    span.style.textDecoration = ((r.u ? 'underline ' : '') + (r.s ? 'line-through' : '')).trim() || 'none';
    span.style.letterSpacing = r.sp ? r.sp + 'px' : '';
    span.style.textTransform = r.caps ? 'uppercase' : '';
    span.style.color = r.color || '#000000';
  }
  function paraAttrs(p) {
    return { ls: p.ls || 1, lsPt: p.lsPt || null, before: p.before || 0, after: p.after || 0, indent: p.indent || 0, left: p.left || 0, right: p.right || 0, bullet: p.bullet || null, num: !!p.num };
  }
  function styleDiv(div, a, align) {
    div.style.textAlign = align;
    div.style.lineHeight = a.lsPt ? a.lsPt + 'px' : (Math.abs(a.ls - 1) < 0.01 ? 'normal' : String(OP.round(a.ls * 1.17, 3)));
    div.style.marginTop = a.before + 'px'; div.style.marginBottom = a.after + 'px';
    div.style.paddingLeft = a.left + 'px'; div.style.paddingRight = a.right + 'px';
    div.style.textIndent = a.indent + 'px';
    div.dataset.p = JSON.stringify(a);
    div.classList.toggle('bul', !!a.bullet && !a.num);
    div.classList.toggle('num', !!a.num);
  }
  function buildPara(p) {
    var div = document.createElement('div');
    styleDiv(div, paraAttrs(p), p.align || 'left');
    var any = false;
    p.runs.forEach(function (r) {
      if (!r.t && p.runs.length > 1) return;
      var span = document.createElement('span');
      styleSpan(span, r);
      if (r.t) {
        r.t.split('\n').forEach(function (part, i) {
          if (i) span.appendChild(document.createElement('br'));
          if (part) span.appendChild(document.createTextNode(part));
        });
      } else span.appendChild(document.createElement('br'));
      div.appendChild(span);
      any = true;
    });
    if (!any) div.appendChild(document.createElement('br'));
    return div;
  }

  /** What is being edited: a text box, the first box of a linked story, or one table cell. */
  function target() {
    var it = A.find(S.editing);
    if (!it) return null;
    if (it.type === 'table') {
      var c = S.editCell;
      if (!c || !it.cells[c.r] || !it.cells[c.r][c.c]) return null;
      var rc = OP.cellRect(it, c.r, c.c);
      return { it: it, text: it.cells[c.r][c.c].text, x: rc.x, y: rc.y, w: rc.w, h: rc.h, cell: true };
    }
    return it.text ? { it: it, text: it.text, x: 0, y: 0, w: it.w, h: it.h, cell: false } : null;
  }
  A.editTarget = target;
  /** Text objects the formatting controls act on when nothing is being edited. */
  A.textTargets = function () {
    var out = [];
    A.selItems().forEach(function (it) {
      if (it.locked) return;
      if (it.type === 'table') {
        if (S.cell && S.cell.id === it.id && it.cells[S.cell.r] && it.cells[S.cell.r][S.cell.c]) out.push(it.cells[S.cell.r][S.cell.c].text);
        else OP.eachCell(it, function (cell) { out.push(cell.text); });
      } else if (it.text && !it.wa) {
        var hd = OP.storyHead(S.doc, it);
        if (hd.text && out.indexOf(hd.text) < 0) out.push(hd.text);
      }
    });
    return out;
  };

  A.positionEditor = function () {
    if (!ed || !S.editing) return;
    var t = target();
    if (!t) return;
    var it = t.it, z = S.view.zoom;
    var p = OP.rotatePoint(it.x + t.x + t.w / 2, it.y + t.y + t.h / 2, it.x + it.w / 2, it.y + it.h / 2, it.rot || 0), c = A.toScreen(p.x, p.y);
    ed.style.width = t.w + 'px';
    ed.style.minHeight = t.h + 'px';
    if (ed.dataset.cols) ed.style.height = t.h + 'px';
    ed.style.transform = 'translate(' + c.x + 'px,' + c.y + 'px) rotate(' + (it.rot || 0) + 'deg) scale(' + z + ') translate(' + (-t.w / 2) + 'px,' + (-t.h / 2) + 'px)';
  };

  /** Start editing an item's text. isNew: the box was just created with the text tool. */
  A.beginEdit = function (it, isNew, clientPt, cell) {
    if (S.editing) A.endEdit();
    if (!it || it.locked) return;
    S.editCell = null;
    if (it.type === 'table') {
      var own = OP.cellOwner(it, cell ? cell.r : 0, cell ? cell.c : 0);
      S.editCell = { id: it.id, r: own.r, c: own.c };
      S.cell = { id: it.id, r: own.r, c: own.c };
    } else {
      if (it.type !== 'shape' || OP.isOpen(it) || it.wa) return;
      var head = OP.storyHead(S.doc, it);
      if (head !== it) { // a linked story is edited from its first box
        var hp = OP.docIndex(S.doc).pageOf[head.id];
        if (!S.master && hp >= 0 && hp !== S.pi) A.gotoPage(hp);
        A.toast('This box continues a story, which is edited from its first box.');
        it = head; clientPt = null;
      }
    }
    addedText = false;
    if (it.type === 'shape' && !it.text) {
      var st = S.lastStyle ? OP.clone(S.lastStyle) : { size: Math.max(12, Math.round(S.doc.w / 34)) };
      it.text = OP.newText([OP.newPara([OP.newRun('', st)], { align: 'center' })]);
      it.text.valign = 'middle';
      addedText = true;
    }
    editNew = !!isNew;
    S.editing = it.id;
    S.sel = [it.id];
    ed = document.createElement('div');
    ed.id = 'ted';
    ed.contentEditable = 'true';
    ed.spellcheck = !!OP.desktop; // the desktop app underlines misspellings
    var tg = target(), tx = tg.text;
    var pad = tx.pad || [0, 0, 0, 0];
    ed.style.padding = pad[1] + 'px ' + pad[2] + 'px ' + pad[3] + 'px ' + pad[0] + 'px';
    ed.style.justifyContent = tx.valign === 'middle' ? 'center' : tx.valign === 'bottom' ? 'flex-end' : 'flex-start';
    if (tx.cols > 1 && !tg.cell && !OP.storyOf(S.doc, it)) { // show the columns while typing
      ed.dataset.cols = '1';
      ed.style.display = 'block'; ed.style.columnCount = tx.cols; ed.style.columnGap = (tx.gap === undefined ? 12 : tx.gap) + 'px'; ed.style.columnFill = 'auto';
    }
    tx.paras.forEach(function (p) { ed.appendChild(buildPara(p)); });
    $('edwrap').appendChild(ed);
    A.positionEditor();
    startWrapEdit(it, tg);
    try { document.execCommand('defaultParagraphSeparator', false, 'div'); document.execCommand('styleWithCSS', false, true); } catch (e) { /* not supported */ }
    ed.addEventListener('paste', function (e) {
      e.preventDefault();
      var t = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
      document.execCommand('insertText', false, t.replace(/\r\n?/g, '\n'));
    });
    ed.addEventListener('keydown', function (e) {
      if (e.key === 'Tab' && S.editCell) { // next / previous cell
        e.preventDefault();
        var tb = A.find(S.editing), cc = S.editCell, n = tb.rows.length * tb.cols.length, idx = cc.r * tb.cols.length + cc.c, guard = 0, r2, c2;
        do { idx = (idx + (e.shiftKey ? n - 1 : 1)) % n; r2 = Math.floor(idx / tb.cols.length); c2 = idx % tb.cols.length; } while (!tb.cells[r2][c2] && guard++ < n);
        A.endEdit();
        var again = A.find(tb.id);
        if (again) A.beginEdit(again, false, null, { r: r2, c: c2 });
      } else if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '\t'); }
    });
    ed.addEventListener('input', growWhileEditing);
    ed.addEventListener('keyup', A.refreshTextControls);
    ed.addEventListener('pointerup', function () { setTimeout(A.refreshTextControls, 0); });
    ed.addEventListener('wheel', function (e) { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
    ed.focus();
    var sel = window.getSelection(), range = null;
    if (clientPt) {
      if (document.caretRangeFromPoint) range = document.caretRangeFromPoint(clientPt.x, clientPt.y);
      else if (document.caretPositionFromPoint) {
        var cp = document.caretPositionFromPoint(clientPt.x, clientPt.y);
        if (cp) { range = document.createRange(); range.setStart(cp.offsetNode, cp.offset); range.collapse(true); }
      }
      if (range && !ed.contains(range.startContainer)) range = null;
    }
    if (!range) {
      range = document.createRange();
      range.selectNodeContents(ed);
      if (isNew || addedText) range.collapse(true);
    }
    sel.removeAllRanges(); sel.addRange(range);
    if (wrapEdit && clientPt) { // the click lands where the wrapped text is drawn, not in the hidden editor
      var L = wrapLayout();
      if (L) { var q = screenToBox(it, clientPt.x, clientPt.y); setPos(hitPos(L, q.x, q.y)); }
    }
    savedRange = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : range.cloneRange();
    A.invalidate();
    A.refreshPanels();
  };

  document.addEventListener('selectionchange', function () {
    if (!ed) return;
    var sel = window.getSelection();
    if (sel.rangeCount && ed.contains(sel.anchorNode)) savedRange = sel.getRangeAt(0).cloneRange();
  });

  // ---- reading the editor back into the model
  function hexOf(css) {
    var m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(css || '');
    if (!m) return '#000000';
    return '#' + [m[1], m[2], m[3]].map(function (v) { v = (+v).toString(16); return v.length < 2 ? '0' + v : v; }).join('');
  }
  function styleOf(el) {
    var cs = getComputedStyle(el), u = false, st = false;
    for (var n = el; n && n !== ed.parentNode; n = n.parentNode) {
      if (n.nodeType === 1) {
        var dl = getComputedStyle(n).textDecorationLine || '';
        if (n.tagName === 'U' || /underline/.test(dl)) u = true;
        if (n.tagName === 'S' || n.tagName === 'STRIKE' || /line-through/.test(dl)) st = true;
      }
      if (n === ed) break;
    }
    var sp = parseFloat(cs.letterSpacing) || 0, caps = cs.textTransform === 'uppercase';
    var fam = (cs.fontFamily || 'Arial').split(',')[0].trim().replace(/^["']|["']$/g, '');
    var w = cs.fontWeight === 'bold' ? 700 : (parseInt(cs.fontWeight, 10) || 400);
    var o = { font: fam || 'Arial', size: OP.round(parseFloat(cs.fontSize) || 12, 2), b: w >= 600, i: cs.fontStyle !== 'normal', u: u, color: hexOf(cs.color) };
    if (st) o.s = true;
    if (sp) o.sp = OP.round(sp, 2);
    if (caps) o.caps = true;
    return o;
  }
  function sameStyle(a, b) {
    return a.font === b.font && a.size === b.size && a.b === b.b && a.i === b.i && a.u === b.u && a.color === b.color &&
      !!a.s === !!b.s && !!a.caps === !!b.caps && (a.sp || 0) === (b.sp || 0);
  }

  function readEditor() {
    var paras = [], cur = null;
    function attrsOf(el, inherit) {
      var a = inherit ? OP.clone(inherit) : { a: paraAttrs({}), align: 'left' };
      if (el.dataset && el.dataset.p) { try { a.a = JSON.parse(el.dataset.p); } catch (e) { /* keep inherited */ } }
      if (el.style && el.style.textAlign) a.align = el.style.textAlign;
      return a;
    }
    function open(attrs, el) { cur = { attrs: attrs, runs: [], el: el }; }
    function close() {
      if (!cur) return;
      var runs = cur.runs;
      if (runs.length) { // a trailing <br> is only a placeholder
        var last = runs[runs.length - 1];
        if (last.t.charAt(last.t.length - 1) === '\n') last.t = last.t.slice(0, -1);
      }
      runs = runs.filter(function (r, i) { return r.t.length || runs.length === 1; });
      if (!runs.length || (runs.length === 1 && !runs[0].t.length)) {
        var probe = cur.el && cur.el.querySelector ? (cur.el.querySelector('span') || cur.el) : ed;
        runs = [OP.newRun('', styleOf(probe))];
      }
      var a = cur.attrs.a, al = cur.attrs.align;
      var np = OP.newPara(runs, { align: /center|right|justify/.test(al) ? al : 'left', ls: a.ls || 1, lsPt: a.lsPt || null, before: a.before || 0, after: a.after || 0, indent: a.indent || 0, left: a.left || 0, right: a.right || 0, bullet: a.num ? null : (a.bullet || null) });
      if (a.num) np.num = true;
      paras.push(np);
      cur = null;
    }
    function addText(t, el) {
      var st = styleOf(el), last = cur.runs[cur.runs.length - 1];
      if (last && sameStyle(last, st)) last.t += t;
      else cur.runs.push(OP.newRun(t, st));
    }
    function walk(node, attrs) {
      for (var n = node.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) {
          var t = n.nodeValue.replace(/​/g, '');
          if (!t) continue;
          if (!cur) open(attrs, node);
          addText(t, n.parentNode);
        } else if (n.nodeType === 1) {
          if (n.tagName === 'BR') {
            if (!cur) open(attrs, node);
            addText('\n', n.parentNode);
          } else if (/^(DIV|P|LI|H[1-6])$/.test(n.tagName)) {
            close();
            var a = attrsOf(n, attrs);
            open(a, n);
            walk(n, a);
            close();
          } else walk(n, attrs);
        }
      }
    }
    walk(ed, attrsOf(ed, null));
    close();
    if (!paras.length) paras.push(OP.newPara([OP.newRun('', styleOf(ed))]));
    return paras;
  }

  /** "Grow box to fit": resize the box as the text is typed, not only when editing ends. */
  function growWhileEditing() {
    var t = target();
    if (!t || t.cell || !t.it.text || t.it.text.fit !== 'grow') return;
    if (OP.growToFit(S.doc, t.it, { paras: readEditor() })) { A.positionEditor(); A.invalidate(); A.status(); }
  }

  // ---- text wrap while typing
  // The browser's editor cannot flow text around an object in the middle of a box. So in a box that
  // wraps, the editor keeps the text and the caret but is invisible; each change is written through
  // to the model and the canvas draws the wrapped text, and OpenPub draws the caret and selection,
  // and maps clicks, drags and Up/Down/Home/End onto the wrapped lines.
  var wrapEdit = false, origParas = null, observer = null, syncPending = false, dragging = false, goalX = null;
  A.isWrapEditing = function () { return !!(ed && wrapEdit); };
  function startWrapEdit(it, tg) {
    wrapEdit = !!(!tg.cell && !(tg.text.cols > 1) && !OP.storyOf(S.doc, it) && OP.wrapProfile && OP.wrapProfile(S.doc, it));
    if (!wrapEdit) return;
    origParas = OP.clone(tg.text.paras);
    ed.classList.add('wrapedit');
    ed.spellcheck = false; // its underlines would sit where the hidden text is, not where it is drawn
    observer = new MutationObserver(scheduleSync);
    observer.observe(ed, { childList: true, subtree: true, characterData: true, attributes: true });
    ed.addEventListener('pointerdown', wrapPointerDown);
    ed.addEventListener('pointermove', wrapPointerMove);
    ed.addEventListener('pointerup', function () { dragging = false; });
    ed.addEventListener('dblclick', wrapDblClick);
    ed.addEventListener('keydown', wrapKey);
  }
  function stopWrapEdit() {
    if (observer) observer.disconnect();
    observer = null; wrapEdit = false; origParas = null; dragging = false; goalX = null;
  }
  function scheduleSync() {
    if (syncPending) return;
    syncPending = true;
    requestAnimationFrame(function () {
      syncPending = false;
      var t = ed && wrapEdit ? target() : null;
      if (!t) return;
      t.text.paras = readEditor();
      A.invalidate();
    });
  }
  document.addEventListener('selectionchange', function () { if (ed && wrapEdit) A.invalidateOverlay(); });

  /** Text pieces of the editor per paragraph, in the same order and units as readEditor. */
  function editorMap() {
    var paras = [], cur = null;
    function open(el) { cur = { segs: [], len: 0, el: el }; }
    function close() {
      if (!cur) return;
      var last = cur.segs[cur.segs.length - 1];
      if (last && last.br) cur.len -= 1; // a trailing <br> is only a placeholder
      paras.push(cur); cur = null;
    }
    function walk(node) {
      for (var n = node.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) {
          var len = n.nodeValue.replace(/​/g, '').length;
          if (!len) continue;
          if (!cur) open(node);
          cur.segs.push({ node: n, start: cur.len, len: len, text: true }); cur.len += len;
        } else if (n.nodeType === 1) {
          if (n.tagName === 'BR') { if (!cur) open(node); cur.segs.push({ node: n, start: cur.len, len: 1, br: true }); cur.len += 1; }
          else if (/^(DIV|P|LI|H[1-6])$/.test(n.tagName)) { close(); open(n); walk(n); close(); }
          else walk(n);
        }
      }
    }
    walk(ed); close();
    if (!paras.length) paras.push({ segs: [], len: 0, el: ed });
    return paras;
  }
  function plainCount(s, upto) { return s.slice(0, upto).replace(/​/g, '').length; }
  function plainIndex(s, n) { // DOM offset of the n-th visible character
    for (var i = 0, c = 0; i < s.length; i++) { if (c === n) return i; if (s.charAt(i) !== '​') c++; }
    return s.length;
  }
  /** Editor point (node, offset) -> {pi, off}: paragraph index and character offset. */
  function domToPos(map, node, offset) {
    var r = document.createRange();
    try { r.setStart(node, offset); } catch (e) { return { pi: 0, off: 0 }; }
    var pi = map.length - 1;
    for (var i = 0; i < map.length; i++) {
      var el = map[i].el, first = map[i].segs[0];
      if (el !== ed && (el === node || el.contains(node))) { pi = i; break; }
      if (first && r.comparePoint(first.node, 0) > 0) { pi = Math.max(0, i - 1); break; }
    }
    var p = map[pi], off = 0;
    for (var k = 0; k < p.segs.length; k++) {
      var sg = p.segs[k];
      if (sg.text && sg.node === node) return { pi: pi, off: sg.start + plainCount(node.nodeValue, offset) };
      if (r.comparePoint(sg.node, 0) < 0) off = Math.min(sg.start + sg.len, p.len); else break;
    }
    return { pi: pi, off: off };
  }
  /** {pi, off} -> editor point. */
  function posToDom(map, pi, off) {
    var p = map[Math.max(0, Math.min(pi, map.length - 1))];
    if (!p.segs.length) return { node: p.el, offset: 0 };
    for (var k = 0; k < p.segs.length; k++) {
      var sg = p.segs[k];
      if (sg.text && off >= sg.start && off <= sg.start + sg.len) return { node: sg.node, offset: plainIndex(sg.node.nodeValue, off - sg.start) };
      if (sg.br && off === sg.start) return { node: sg.node.parentNode, offset: Array.prototype.indexOf.call(sg.node.parentNode.childNodes, sg.node) };
    }
    var last = p.segs[p.segs.length - 1];
    if (last.text) return { node: last.node, offset: last.node.nodeValue.length };
    return { node: last.node.parentNode, offset: Array.prototype.indexOf.call(last.node.parentNode.childNodes, last.node) + 1 };
  }

  var mctx = null;
  function measure(mk, n) { // width of the first n characters of a piece on a line
    if (n <= 0) return 0;
    if (n >= mk.e - mk.s) return mk.w;
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
    mctx.font = mk.css; OP.setLetterSpacingPx(mctx, mk.sp || 0);
    return mctx.measureText(mk.text.slice(0, n)).width;
  }
  /** The edited box's lines, in box space, with each paragraph's run start offsets. */
  function wrapLayout() {
    var t = target();
    if (!t) return null;
    var tc = OP.textCols(S.doc, t.it, null), col = tc && tc.cols[0];
    if (!col) return null;
    var starts = t.text.paras.map(function (p) { var a = [], acc = 0; p.runs.forEach(function (r) { a.push(acc); acc += r.t.length; }); return a; });
    return { it: t.it, col: col, lines: col.lay.lines, starts: starts };
  }
  function lineRange(L, ln) { // paragraph offsets covered by a line
    if (!ln.marks.length) return null;
    var a = ln.marks[0], b = ln.marks[ln.marks.length - 1], st = L.starts[ln.pi] || [];
    return { s: (st[a.ri] || 0) + a.s, e: (st[b.ri] || 0) + b.e };
  }
  function xOnLine(L, ln, off) { // x of a paragraph offset on one line (box space)
    var st = L.starts[ln.pi] || [];
    for (var k = 0; k < ln.marks.length; k++) {
      var mk = ln.marks[k], ms = (st[mk.ri] || 0) + mk.s, me = (st[mk.ri] || 0) + mk.e;
      if (off >= ms && off <= me) return L.col.x + mk.x + measure(mk, off - ms);
    }
    var last = ln.marks[ln.marks.length - 1];
    return L.col.x + (last ? last.x + last.w : ln.x);
  }
  /** Which line shows a position: the first whose text includes it, preferring the start of a line. */
  function lineOf(L, pos) {
    var hit = null;
    for (var i = 0; i < L.lines.length; i++) {
      var ln = L.lines[i];
      if (ln.pi !== pos.pi) continue;
      var r = lineRange(L, ln);
      if (!r) { if (!hit) hit = ln; continue; }
      if (pos.off >= r.s && pos.off < r.e) return ln;
      if (pos.off === r.e) hit = ln;
      if (pos.off < r.s && !hit) hit = ln;
    }
    return hit || L.lines[L.lines.length - 1] || null;
  }
  /** Box-space point -> paragraph position. */
  function hitPos(L, lx, ly) {
    var cy = ly - L.col.y, cx = lx - L.col.x, best = null, bestD = Infinity;
    L.lines.forEach(function (ln) {
      var dy = cy < ln.y ? ln.y - cy : cy > ln.y + ln.h ? cy - ln.y - ln.h : 0;
      var x1 = ln.x, x2 = ln.marks.length ? ln.marks[ln.marks.length - 1].x + ln.marks[ln.marks.length - 1].w : ln.x;
      var dx = cx < x1 ? x1 - cx : cx > x2 ? cx - x2 : 0, d = dy * 1000 + dx;
      if (d < bestD) { bestD = d; best = ln; }
    });
    if (!best) return { pi: 0, off: 0 };
    var st = L.starts[best.pi] || [];
    if (!best.marks.length) return { pi: best.pi, off: 0 };
    for (var k = 0; k < best.marks.length; k++) {
      var mk = best.marks[k];
      if (cx < mk.x + mk.w || k === best.marks.length - 1) {
        var n = mk.e - mk.s, at = 0, prev = 0;
        if (mk.type === 'br') return { pi: best.pi, off: (st[mk.ri] || 0) + mk.s };
        for (var c = 1; c <= n; c++) {
          var w = measure(mk, c);
          if (mk.x + w > cx) { at = (cx - (mk.x + prev) < (mk.x + w) - cx) ? c - 1 : c; break; }
          prev = w; at = c;
        }
        // past the end of a wrapped line: stay before its trailing space
        if (k === best.marks.length - 1 && cx >= mk.x + mk.w && (mk.type === 'space' || mk.type === 'br')) at = 0;
        return { pi: best.pi, off: (st[mk.ri] || 0) + mk.s + at };
      }
    }
    return { pi: best.pi, off: 0 };
  }
  function boxToScreen(it, lx, ly) {
    var p = OP.rotatePoint(it.x + lx, it.y + ly, it.x + it.w / 2, it.y + it.h / 2, it.rot || 0);
    return A.toScreen(p.x, p.y);
  }
  function screenToBox(it, clientX, clientY) {
    var r = $('ov').getBoundingClientRect(), p = A.toPage(clientX - r.left, clientY - r.top);
    return OP.toLocal(it, p.x, p.y);
  }
  function editorSel() {
    var sel = window.getSelection();
    if (sel.rangeCount && ed.contains(sel.anchorNode)) return { anchor: [sel.anchorNode, sel.anchorOffset], focus: [sel.focusNode, sel.focusOffset] };
    if (savedRange) return { anchor: [savedRange.startContainer, savedRange.startOffset], focus: [savedRange.endContainer, savedRange.endOffset] };
    return null;
  }
  function cmpPos(a, b) { return a.pi !== b.pi ? a.pi - b.pi : a.off - b.off; }
  function setPos(pos, extend) {
    var map = editorMap(), d = posToDom(map, pos.pi, pos.off), sel = window.getSelection();
    if (extend && sel.rangeCount && ed.contains(sel.anchorNode)) sel.extend(d.node, d.offset);
    else sel.collapse(d.node, d.offset);
    A.invalidateOverlay();
  }

  /** Where the drawn caret is while typing in a box with text wrap: paragraph, offset, and its
   *  position in box space. null when not typing in such a box. */
  A.wrapEditState = function () {
    if (!A.isWrapEditing()) return null;
    var L = wrapLayout(), s = editorSel();
    if (!L || !s) return null;
    var f = domToPos(editorMap(), s.focus[0], s.focus[1]), ln = lineOf(L, f);
    return { pi: f.pi, off: f.off, x: ln ? xOnLine(L, ln, f.off) : 0, y: ln ? L.col.y + ln.y : 0, h: ln ? ln.h : 0 };
  };

  /** Caret and selection for a box with text wrap, drawn over the canvas. */
  A.drawEditOverlay = function (ctx) {
    if (!A.isWrapEditing()) return;
    var L = wrapLayout(), s = editorSel();
    if (!L || !s) return;
    var map = editorMap(), a = domToPos(map, s.anchor[0], s.anchor[1]), f = domToPos(map, s.focus[0], s.focus[1]);
    var it = L.it, from = cmpPos(a, f) <= 0 ? a : f, to = from === a ? f : a;
    function quad(x1, y1, x2, y2) {
      var p = [boxToScreen(it, x1, y1), boxToScreen(it, x2, y1), boxToScreen(it, x2, y2), boxToScreen(it, x1, y2)];
      ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y); for (var i = 1; i < 4; i++) ctx.lineTo(p[i].x, p[i].y); ctx.closePath();
    }
    if (cmpPos(from, to) !== 0) {
      ctx.fillStyle = 'rgba(46, 125, 230, 0.32)';
      L.lines.forEach(function (ln) {
        if (ln.pi < from.pi || ln.pi > to.pi) return;
        var r = lineRange(L, ln);
        if (!r) return;
        var s0 = ln.pi === from.pi ? Math.max(r.s, from.off) : r.s, s1 = ln.pi === to.pi ? Math.min(r.e, to.off) : r.e;
        if (s1 <= s0) return;
        quad(xOnLine(L, ln, s0), L.col.y + ln.y, xOnLine(L, ln, s1), L.col.y + ln.y + ln.h);
        ctx.fill();
      });
    }
    var ln = lineOf(L, f);
    if (!ln) return;
    var cx = xOnLine(L, ln, f.off), top = boxToScreen(it, cx, L.col.y + ln.y), bot = boxToScreen(it, cx, L.col.y + ln.y + ln.h);
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(bot.x, bot.y); ctx.stroke();
  };

  function wrapPointerDown(e) {
    if (!wrapEdit || e.button !== 0) return;
    e.preventDefault();
    ed.focus();
    var L = wrapLayout(), it = target().it, q = screenToBox(it, e.clientX, e.clientY);
    if (!L) return;
    setPos(hitPos(L, q.x, q.y), e.shiftKey);
    dragging = true; goalX = null;
    try { ed.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
    A.refreshTextControls();
  }
  function wrapPointerMove(e) {
    if (!wrapEdit || !dragging || !(e.buttons & 1)) return;
    var L = wrapLayout(), it = target().it, q = screenToBox(it, e.clientX, e.clientY);
    if (L) setPos(hitPos(L, q.x, q.y), true);
  }
  function wrapDblClick() {
    if (!wrapEdit) return;
    var sel = window.getSelection();
    if (!sel.modify) return;
    sel.modify('move', 'backward', 'word');
    sel.modify('extend', 'forward', 'word');
  }
  function wrapKey(e) {
    if (!wrapEdit || e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key;
    if (k !== 'ArrowUp' && k !== 'ArrowDown' && k !== 'Home' && k !== 'End') { goalX = null; return; }
    var L = wrapLayout(), s = editorSel();
    if (!L || !s) return;
    e.preventDefault();
    var f = domToPos(editorMap(), s.focus[0], s.focus[1]), ln = lineOf(L, f);
    if (!ln) return;
    var r = lineRange(L, ln), st = L.starts[ln.pi] || [];
    if (k === 'Home') { setPos({ pi: ln.pi, off: r ? r.s : 0 }, e.shiftKey); goalX = null; return; }
    if (k === 'End') {
      var lm = ln.marks[ln.marks.length - 1], endOff = r ? r.e : 0;
      if (lm && (lm.type === 'space' || lm.type === 'br') && ln !== L.lines[L.lines.length - 1]) endOff = (st[lm.ri] || 0) + lm.s;
      setPos({ pi: ln.pi, off: endOff }, e.shiftKey); goalX = null; return;
    }
    // Up/Down: the nearest row above or below, at the same x
    var x = goalX !== null ? goalX : xOnLine(L, ln, f.off), up = k === 'ArrowUp', rowY = null;
    L.lines.forEach(function (o) {
      if (up ? o.y < ln.y - 0.01 : o.y > ln.y + 0.01) { if (rowY === null || (up ? o.y > rowY : o.y < rowY)) rowY = o.y; }
    });
    if (rowY === null) { setPos(up ? { pi: 0, off: 0 } : { pi: L.lines[L.lines.length - 1].pi, off: Infinity }, e.shiftKey); return; }
    var row = L.lines.filter(function (o) { return Math.abs(o.y - rowY) < 0.01; });
    var tgt = hitPos(L, x, L.col.y + row[0].y + row[0].h / 2);
    goalX = x;
    setPos(tgt, e.shiftKey);
  }

  /** Leave text editing, writing the text back to the item. */
  A.endEdit = function (discard) {
    if (!ed) { S.editing = null; S.editCell = null; return; }
    var t = target(), it = t ? t.it : A.find(S.editing);
    var paras = discard ? null : readEditor();
    if (wrapEdit) { // the text was written through while typing: put it back if the edit is discarded
      var orig = origParas;
      stopWrapEdit();
      if (discard && t && orig) t.text.paras = orig;
    }
    ed.remove(); ed = null; savedRange = null;
    S.editing = null; S.editCell = null;
    if (t && paras) {
      t.text.paras = paras;
      var empty = !OP.plainText(t.text).trim().length;
      if (t.cell) {
        OP.tableFitRows(it);
      } else if (empty && !it.fill && !it.stroke && !it.next) {
        var pg = A.page();
        pg.items = pg.items.filter(function (x) { return x !== it; });
        S.sel = [];
        OP.reindex(S.doc);
      } else if (empty && addedText) {
        it.text = null;
      } else {
        var r0 = paras[0].runs[0];
        S.lastStyle = { font: r0.font, size: r0.size, b: r0.b, i: r0.i, u: r0.u, color: r0.color };
        if (editNew && it.text.fit !== 'shrink') {
          var need = OP.textHeight(it);
          if (need > it.h) it.h = OP.round(need, 2);
        }
      }
    } else if (it && addedText && !(t && t.cell)) it.text = null;
    A.commit();
    A.refreshAll();
    A.updateFontList();
  };

  // ---- formatting
  function withSelection(fn) {
    if (!ed) return;
    var sel = window.getSelection();
    if (!(sel.rangeCount && ed.contains(sel.anchorNode)) && savedRange) {
      ed.focus();
      sel.removeAllRanges(); sel.addRange(savedRange);
    }
    if (sel.isCollapsed) { // nothing highlighted: format the whole box
      var r = document.createRange();
      r.selectNodeContents(ed);
      sel.removeAllRanges(); sel.addRange(r);
      fn();
      sel.collapseToEnd();
    } else fn();
    if (sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange();
  }
  function exec(cmd, val) { try { document.execCommand('styleWithCSS', false, true); document.execCommand(cmd, false, val); } catch (e) { /* ignore */ } }

  /** Wrap the highlighted text in spans and style them (for properties execCommand cannot set). */
  function wrapSel(styleFn) {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var range = sel.getRangeAt(0), nodes = [];
    var walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) { if (range.intersectsNode(walker.currentNode) && walker.currentNode.nodeValue.length) nodes.push(walker.currentNode); }
    var first = null, last = null;
    nodes.forEach(function (n) {
      var s0 = n === range.startContainer ? range.startOffset : 0, e0 = n === range.endContainer ? range.endOffset : n.nodeValue.length;
      if (e0 <= s0) return;
      if (e0 < n.nodeValue.length) n.splitText(e0);
      if (s0 > 0) n = n.splitText(s0);
      var span = document.createElement('span');
      n.parentNode.insertBefore(span, n);
      span.appendChild(n);
      styleFn(span);
      first = first || n; last = n;
    });
    if (first) { var r = document.createRange(); r.setStart(first, 0); r.setEnd(last, last.nodeValue.length); sel.removeAllRanges(); sel.addRange(r); }
  }

  /** Apply character formatting: to the highlighted text when editing, otherwise to every selected box. */
  A.applyRunStyle = function (patch, final) {
    if (ed) {
      withSelection(function () {
        if ('s' in patch) exec('strikeThrough');
        if ('caps' in patch) { var capsOn = !A.textState().caps; wrapSel(function (sp) { sp.style.textTransform = capsOn ? 'uppercase' : 'none'; }); }
        if ('sp' in patch) wrapSel(function (sp) { sp.style.letterSpacing = patch.sp + 'px'; });
        if ('b' in patch) exec('bold');
        if ('i' in patch) exec('italic');
        if ('u' in patch) exec('underline');
        if (patch.color) exec('foreColor', patch.color);
        if (patch.font) exec('fontName', patch.font);
        if (patch.size) {
          exec('fontSize', '7');
          Array.prototype.forEach.call(ed.querySelectorAll('font[size="7"], [style*="xxx-large"]'), function (el) {
            if (el.tagName === 'FONT') el.removeAttribute('size');
            el.style.fontSize = patch.size + 'px';
            Array.prototype.forEach.call(el.querySelectorAll('[style]'), function (k) { if (k.style.fontSize) k.style.fontSize = ''; });
          });
        }
      });
      return;
    }
    var changed = false;
    A.textTargets().forEach(function (tx) {
      var all = [];
      tx.paras.forEach(function (p) { p.runs.forEach(function (r) { all.push(r); }); });
      // toggles switch on unless every run already has them
      ['b', 'i', 'u', 's', 'caps'].forEach(function (k) {
        if (k in patch && patch[k] === 'toggle') { var on = all.every(function (r) { return r[k]; }); all.forEach(function (r) { r[k] = !on; }); changed = true; }
      });
      all.forEach(function (r) {
        if (patch.font) r.font = patch.font;
        if (patch.size) r.size = patch.size;
        if (patch.color) r.color = patch.color;
        if ('sp' in patch) r.sp = patch.sp;
      });
      changed = true;
    });
    if (changed) { A.invalidate(); if (final !== false) { A.commit(); A.updateFontList(); } }
  };

  function editorParas() {
    var sel = window.getSelection(), out = [];
    var range = (sel.rangeCount && ed.contains(sel.anchorNode)) ? sel.getRangeAt(0) : savedRange;
    Array.prototype.forEach.call(ed.children, function (div) {
      if (div.tagName !== 'DIV' && div.tagName !== 'P') return;
      if (!range || range.collapsed && !div.contains(range.startContainer) && range.startContainer !== ed) return;
      if (range && !range.collapsed && !range.intersectsNode(div)) return;
      out.push(div);
    });
    if (!out.length) out = Array.prototype.filter.call(ed.children, function (d) { return d.tagName === 'DIV' || d.tagName === 'P'; });
    return out;
  }
  // Paragraph spacing and indents, all in points: copied as given.
  var PARA_NUMS = ['before', 'after', 'indent', 'left', 'right'];
  /** Apply paragraph formatting ({align, ls, lsPt, before, after, indent, left, right, bullet, num}). ls (a multiple) clears lsPt (exact points). */
  A.applyParaStyle = function (patch, final) {
    if (ed) {
      editorParas().forEach(function (div) {
        var a = paraAttrs({});
        try { if (div.dataset.p) a = JSON.parse(div.dataset.p); } catch (e) { /* defaults */ }
        if ('ls' in patch) { a.ls = patch.ls; a.lsPt = null; }
        if ('lsPt' in patch) a.lsPt = patch.lsPt;
        PARA_NUMS.forEach(function (k) { if (k in patch) a[k] = patch[k]; });
        if ('bullet' in patch) { a.bullet = patch.bullet === 'toggle' ? (a.bullet ? null : '•') : patch.bullet; if (a.bullet) a.num = false; }
        if ('num' in patch) { a.num = patch.num === 'toggle' ? !a.num : !!patch.num; if (a.num) a.bullet = null; }
        styleDiv(div, a, patch.align || div.style.textAlign || 'left');
      });
      return;
    }
    A.textTargets().forEach(function (tx) {
      var on = tx.paras.every(function (p) { return p.bullet; }), non = tx.paras.every(function (p) { return p.num; });
      tx.paras.forEach(function (p) {
        if (patch.align) p.align = patch.align;
        if ('ls' in patch) { p.ls = patch.ls; p.lsPt = null; }
        if ('lsPt' in patch) p.lsPt = patch.lsPt;
        PARA_NUMS.forEach(function (k) { if (k in patch) p[k] = patch[k]; });
        if ('bullet' in patch) { p.bullet = patch.bullet === 'toggle' ? (on ? null : '•') : patch.bullet; if (p.bullet) delete p.num; }
        if ('num' in patch) { if (patch.num === 'toggle' ? !non : patch.num) { p.num = true; p.bullet = null; } else delete p.num; }
      });
    });
    A.invalidate();
    if (final !== false) A.commit();
  };

  /** Formatting at the caret / of the selection, for the panel to display. */
  A.textState = function () {
    if (ed) {
      var sel = window.getSelection(), node = (sel.rangeCount && ed.contains(sel.anchorNode)) ? sel.anchorNode : (savedRange ? savedRange.startContainer : ed);
      var el = node.nodeType === 3 ? node.parentNode : node;
      if (el === ed) el = ed.querySelector('span') || ed;
      var st = styleOf(el), div = el;
      while (div && div.parentNode !== ed && div !== ed) div = div.parentNode;
      var a = paraAttrs({});
      try { if (div && div.dataset && div.dataset.p) a = JSON.parse(div.dataset.p); } catch (e) { /* defaults */ }
      st.align = (div && div.style && div.style.textAlign) || 'left';
      st.ls = a.ls; st.lsPt = a.lsPt || null; st.bullet = !!a.bullet && !a.num; st.num = !!a.num;
      PARA_NUMS.forEach(function (k) { st[k] = a[k] || 0; });
      return st;
    }
    var tx = A.textTargets()[0];
    if (!tx) return null;
    var p = tx.paras[0], r = p.runs[0];
    return { font: r.font, size: r.size, b: r.b, i: r.i, u: r.u, s: !!r.s, caps: !!r.caps, sp: r.sp || 0, color: r.color, align: p.align, ls: p.ls, lsPt: p.lsPt || null,
      before: p.before || 0, after: p.after || 0, indent: p.indent || 0, left: p.left || 0, right: p.right || 0, bullet: !!p.bullet && !p.num, num: !!p.num };
  };
  A.isEditing = function () { return !!ed; };
  A.setEditorBox = function (it) {
    if (!ed) return;
    var t = target(), tx = t ? t.text : it.text;
    if (!tx) return;
    var pad = tx.pad;
    ed.style.padding = pad[1] + 'px ' + pad[2] + 'px ' + pad[3] + 'px ' + pad[0] + 'px';
    ed.style.justifyContent = tx.valign === 'middle' ? 'center' : tx.valign === 'bottom' ? 'flex-end' : 'flex-start';
  };
})();
