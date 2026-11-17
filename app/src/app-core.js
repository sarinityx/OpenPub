/* OpenPub – editor core: state, undo, view transform, canvas drawing. */
var OP = (typeof globalThis.OP !== 'undefined') ? globalThis.OP : (globalThis.OP = {});

(function () {
  'use strict';
  var A = OP.app = {};
  var MM = OP.MM;
  var $ = A.$ = function (id) { return document.getElementById(id); };
  var RULER = 20;

  var S = A.S = {
    doc: null, pi: 0, sel: [], tool: 'select', shapeKind: 'rect',
    view: { zoom: 1, ox: 40, oy: 40 }, dpr: 1, cw: 100, ch: 100,
    snap: true, guides: true, editing: null,
    undo: [], redo: [], last: '', clip: null, dirty: false,
    drag: null, snapLines: [], cursor: null, tab: 'props', lastStyle: null,
    master: null, cell: null, editCell: null, linkFrom: null
  };

  // ---------------------------------------------------------------- icons
  var IC = {
    cursor: '<path d="M5 3l14 7-6 2-2 6z"/>',
    text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
    image: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
    shape: '<rect x="3" y="3" width="11" height="11" rx="1"/><circle cx="15.5" cy="15.5" r="5.5"/>',
    line: '<path d="M4 20L20 4"/>',
    undo: '<path d="M9 7L4 12l5 5M4 12h10a5 5 0 010 10h-2" transform="translate(0 -4)"/>',
    redo: '<path d="M15 7l5 5-5 5M20 12H10a5 5 0 000 10h2" transform="translate(0 -4)"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    up: '<path d="M6 14l6-6 6 6"/>', down: '<path d="M6 10l6 6 6-6"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M3 3l18 18M10.6 5.2A9.6 9.6 0 0112 5c6 0 10 7 10 7a17 17 0 01-3.2 3.9M6.2 6.6A17 17 0 002 12s4 7 10 7a9.7 9.7 0 004.3-1"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    unlock: '<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 017.5-2"/>',
    alL: '<path d="M4 3v18M8 7h10v4H8zM8 14h6v4H8z"/>', alC: '<path d="M12 3v18M6 7h12v4H6zM8 14h8v4H8z"/>', alR: '<path d="M20 3v18M6 7h10v4H6zM10 14h6v4h-6z"/>',
    alT: '<path d="M3 4h18M7 8h4v10H7zM14 8h4v6h-4z"/>', alM: '<path d="M3 12h18M7 6h4v12H7zM14 8h4v8h-4z"/>', alB: '<path d="M3 20h18M7 6h4v10H7zM14 10h4v6h-4z"/>',
    distH: '<path d="M4 3v18M20 3v18M9 8h6v8H9z"/>', distV: '<path d="M3 4h18M3 20h18M8 9h8v6H8z"/>',
    front: '<rect x="4" y="4" width="11" height="11" rx="1" fill="currentColor"/><rect x="9" y="9" width="11" height="11" rx="1"/>',
    back: '<rect x="9" y="9" width="11" height="11" rx="1" fill="currentColor"/><rect x="4" y="4" width="11" height="11" rx="1"/>',
    group: '<rect x="3" y="3" width="18" height="18" rx="1" stroke-dasharray="3 2.5"/><rect x="7" y="7" width="6" height="6"/><rect x="11" y="11" width="6" height="6"/>',
    ungroup: '<rect x="4" y="4" width="8" height="8"/><rect x="12" y="12" width="8" height="8"/>',
    tL: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>', tC: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
    tR: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>', tJ: '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>',
    vT: '<path d="M4 4h16M12 20V8M8 12l4-4 4 4"/>', vM: '<path d="M4 12h16M12 3v5M12 21v-5M9.5 6l2.5 2.5L14.5 6M9.5 18l2.5-2.5 2.5 2.5"/>', vB: '<path d="M4 20h16M12 4v12M8 12l4 4 4-4"/>',
    flipH: '<path d="M12 3v18M9 7L4 12l5 5zM15 7l5 5-5 5z"/>', flipV: '<path d="M3 12h18M7 9l5-5 5 5zM7 15l5 5 5-5z"/>',
    bullet: '<circle cx="5" cy="7" r="1.3" fill="currentColor"/><circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="5" cy="17" r="1.3" fill="currentColor"/><path d="M10 7h10M10 12h10M10 17h10"/>'
  };
  A.registerIcons = function (o) { for (var k in o) IC[k] = o[k]; };
  A.icon = function (n) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || '') + '</svg>';
  };

  // ---------------------------------------------------------------- theme colours for canvas
  var cssCache = {};
  A.css = function (name) {
    if (!cssCache[name]) cssCache[name] = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
    return cssCache[name];
  };
  A.themeChanged = function () { cssCache = {}; A.invalidate(); };

  // ---------------------------------------------------------------- document access
  /** The page being edited: a normal page, or a master page while S.master is set. */
  A.page = function () {
    if (S.master) {
      var ms = S.doc.masters || [];
      for (var i = 0; i < ms.length; i++) if (ms[i].id === S.master) return ms[i];
      S.master = null;
    }
    return S.doc.pages[S.pi];
  };
  A.find = function (id) {
    var items = A.page().items;
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  };
  A.selItems = function () {
    var out = [], items = A.page().items;
    for (var i = 0; i < items.length; i++) if (S.sel.indexOf(items[i].id) >= 0) out.push(items[i]);
    return out;
  };
  /** Add every member of any group touched by the given ids. */
  A.withGroups = function (ids) {
    var items = A.page().items, groups = {}, out = [];
    items.forEach(function (it) { if (ids.indexOf(it.id) >= 0 && it.group) groups[it.group] = true; });
    items.forEach(function (it) { if (ids.indexOf(it.id) >= 0 || (it.group && groups[it.group])) out.push(it.id); });
    return out;
  };
  A.setSel = function (ids) {
    S.sel = ids.filter(function (id, i) { return ids.indexOf(id) === i && A.find(id); });
    if (!(S.cell && S.sel.length === 1 && S.sel[0] === S.cell.id)) S.cell = null;
    A.refreshPanels();
    A.invalidateOverlay();
    A.status();
  };

  // ---------------------------------------------------------------- undo
  function snapshot() {
    var d = S.doc;
    return JSON.stringify({ name: d.name, w: d.w, h: d.h, bleed: d.bleed, margins: d.margins, pages: d.pages, masters: d.masters || [], merge: d.merge || null });
  }
  function restore(json) {
    var o = JSON.parse(json), d = S.doc;
    d.name = o.name; d.w = o.w; d.h = o.h; d.bleed = o.bleed; d.margins = o.margins; d.pages = o.pages;
    d.masters = o.masters || []; d.merge = o.merge || null; S.cell = null; S.linkFrom = null;
    OP.reindex(d);
    if (S.pi >= d.pages.length) S.pi = d.pages.length - 1;
    S.sel = S.sel.filter(function (id) { return !!A.find(id); });
    A.refreshAll();
  }
  /** Record the current state as an undo step (no-op if nothing changed). */
  A.commit = function () {
    if (S.doc && OP.growAll) OP.growAll(S.doc); // "Grow box to fit" boxes follow their text
    var cur = snapshot();
    if (cur === S.last) return false;
    S.undo.push(S.last);
    if (S.undo.length > 120) S.undo.shift();
    S.redo = [];
    S.last = cur;
    S.dirty = true;
    A.refreshPagesSoon();
    A.autosaveSoon();
    A.updateUndoButtons();
    if (A.setTitle) A.setTitle();
    return true;
  };
  A.undo = function () {
    if (S.editing) A.endEdit();
    if (!S.undo.length) return;
    S.redo.push(S.last);
    S.last = S.undo.pop();
    restore(S.last);
    A.updateUndoButtons();
  };
  A.redo = function () {
    if (S.editing) A.endEdit();
    if (!S.redo.length) return;
    S.undo.push(S.last);
    S.last = S.redo.pop();
    restore(S.last);
    A.updateUndoButtons();
  };
  A.updateUndoButtons = function () {
    var u = $('tbUndo'), r = $('tbRedo');
    if (u) u.disabled = !S.undo.length;
    if (r) r.disabled = !S.redo.length;
  };

  /** Replace the whole document (new / open / import). */
  A.loadDoc = function (doc) {
    if (S.editing) A.endEdit(true);
    if (!doc.masters) doc.masters = [];
    if (doc.merge === undefined) doc.merge = null;
    S.doc = doc; S.pi = 0; S.sel = []; S.undo = []; S.redo = []; S.master = null; S.cell = null; S.linkFrom = null;
    OP.reindex(doc);
    S.last = snapshot(); S.dirty = false;
    $('docname').value = doc.name;
    OP.ensureImages(doc).then(function () { A.invalidate(); A.refreshPagesSoon(); });
    A.refreshAll();
    A.fit();
    A.updateUndoButtons();
    A.updateFontList();
  };

  // ---------------------------------------------------------------- view
  A.toPage = function (sx, sy) { return { x: (sx - S.view.ox) / S.view.zoom, y: (sy - S.view.oy) / S.view.zoom }; };
  A.toScreen = function (x, y) { return { x: S.view.ox + x * S.view.zoom, y: S.view.oy + y * S.view.zoom }; };
  A.setZoom = function (z, sx, sy) {
    z = OP.clamp(z, 0.03, 32);
    if (sx === undefined) { sx = S.cw / 2; sy = S.ch / 2; }
    var p = A.toPage(sx, sy);
    S.view.zoom = z;
    S.view.ox = sx - p.x * z; S.view.oy = sy - p.y * z;
    A.invalidate();
  };
  A.fit = function () {
    var d = S.doc, pad = 36;
    var z = Math.min((S.cw - pad * 2) / (d.w + 2 * d.bleed), (S.ch - pad * 2) / (d.h + 2 * d.bleed));
    z = OP.clamp(z, 0.03, 32);
    S.view.zoom = z;
    S.view.ox = (S.cw - d.w * z) / 2; S.view.oy = (S.ch - d.h * z) / 2;
    A.invalidate();
  };
  A.resize = function () {
    var st = $('stage'), w = Math.max(50, st.clientWidth - RULER), h = Math.max(50, st.clientHeight - RULER);
    var dpr = window.devicePixelRatio || 1;
    S.dpr = dpr; S.cw = w; S.ch = h;
    [['cv', w, h], ['ov', w, h], ['rulerH', w, RULER], ['rulerV', RULER, h]].forEach(function (c) {
      var el = $(c[0]);
      el.width = Math.round(c[1] * dpr); el.height = Math.round(c[2] * dpr);
      el.style.width = c[1] + 'px'; el.style.height = c[2] + 'px';
    });
    A.invalidate();
  };

  // ---------------------------------------------------------------- drawing
  var needContent = false, needOverlay = false, raf = 0;
  function frame() {
    raf = 0;
    if (needContent) { needContent = false; drawContent(); drawRulers(); A.positionEditor(); }
    if (needOverlay) { needOverlay = false; drawOverlay(); }
  }
  A.invalidate = function () { needContent = true; needOverlay = true; if (!raf) raf = requestAnimationFrame(frame); };
  A.invalidateOverlay = function () { needOverlay = true; if (!raf) raf = requestAnimationFrame(frame); };

  function drawContent() {
    var ctx = $('cv').getContext('2d'), d = S.doc, v = S.view, dpr = S.dpr, b = d.bleed, page = A.page();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = A.css('--paste');
    ctx.fillRect(0, 0, S.cw, S.ch);
    ctx.save();
    ctx.translate(v.ox, v.oy);
    ctx.scale(v.zoom, v.zoom);
    OP.renderPage(ctx, d, page, { bleed: b, pxPerPt: v.zoom * dpr, skipTextOf: S.editCell ? null : S.editing, skipCell: S.editCell });
    ctx.restore();
    // Objects hanging off the page stay visible on the pasteboard, but dimmed.
    var x0 = v.ox - b * v.zoom, y0 = v.oy - b * v.zoom, w = (d.w + 2 * b) * v.zoom, h = (d.h + 2 * b) * v.zoom;
    ctx.save();
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = A.css('--paste');
    ctx.beginPath();
    ctx.rect(0, 0, S.cw, S.ch);
    ctx.rect(x0, y0, w, h);
    ctx.fill('evenodd');
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(v.ox) - 0.5, Math.round(v.oy) - 0.5, Math.round(d.w * v.zoom) + 1, Math.round(d.h * v.zoom) + 1);
  }

  function niceStep(pxPerMm) {
    var steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    for (var i = 0; i < steps.length; i++) if (steps[i] * pxPerMm >= 46) return steps[i];
    return 2000;
  }
  function drawRulers() {
    var v = S.view, dpr = S.dpr, pxmm = v.zoom * MM, step = niceStep(pxmm), minor = step / (step === 2 || step === 20 || step === 200 ? 4 : 5);
    [['rulerH', true], ['rulerV', false]].forEach(function (r) {
      var c = $(r[0]), ctx = c.getContext('2d'), horiz = r[1], len = horiz ? S.cw : S.ch, org = horiz ? v.ox : v.oy;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = A.css('--panel');
      ctx.fillRect(0, 0, horiz ? len : RULER, horiz ? RULER : len);
      ctx.strokeStyle = A.css('--line');
      ctx.beginPath();
      if (horiz) { ctx.moveTo(0, RULER - 0.5); ctx.lineTo(len, RULER - 0.5); } else { ctx.moveTo(RULER - 0.5, 0); ctx.lineTo(RULER - 0.5, len); }
      ctx.stroke();
      ctx.fillStyle = A.css('--ink-2');
      ctx.strokeStyle = A.css('--ink-2');
      ctx.font = '9px ' + getComputedStyle(document.body).getPropertyValue('--font-mono');
      ctx.textBaseline = 'top';
      var first = Math.floor((0 - org) / pxmm / minor) * minor, last = (len - org) / pxmm;
      ctx.beginPath();
      for (var mm = first; mm <= last; mm += minor) {
        var p = Math.round(org + mm * pxmm) + 0.5, major = Math.abs(mm / step - Math.round(mm / step)) < 1e-6;
        var t = major ? 9 : 4;
        if (horiz) { ctx.moveTo(p, RULER); ctx.lineTo(p, RULER - t); } else { ctx.moveTo(RULER, p); ctx.lineTo(RULER - t, p); }
        if (major) {
          var label = String(Math.round(mm));
          if (horiz) ctx.fillText(label, p + 2, 2);
          else { ctx.save(); ctx.translate(2, p - 2); ctx.rotate(-Math.PI / 2); ctx.fillText(label, 0, 0); ctx.restore(); }
        }
      }
      ctx.stroke();
      if (S.cursor) {
        ctx.strokeStyle = A.css('--margin');
        ctx.beginPath();
        var cp = Math.round(horiz ? S.cursor.sx : S.cursor.sy) + 0.5;
        if (horiz) { ctx.moveTo(cp, 0); ctx.lineTo(cp, RULER); } else { ctx.moveTo(0, cp); ctx.lineTo(RULER, cp); }
        ctx.stroke();
      }
    });
  }
  A.drawRulers = drawRulers;

  /** Handles for the current selection, in screen coordinates. */
  A.handles = function () {
    var items = A.selItems(), out = [];
    if (!items.length || S.editing) return out;
    function scr(p) { return A.toScreen(p.x, p.y); }
    if (items.length === 1) {
      var it = items[0];
      if (it.locked) return out;
      if (OP.isLine(it)) {
        var e = A.lineEnds(it);
        out.push({ id: 'p0', x: scr(e[0]).x, y: scr(e[0]).y }, { id: 'p1', x: scr(e[1]).x, y: scr(e[1]).y });
        return out;
      }
      var c = OP.itemCorners(it).map(scr);
      var mid = function (a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
      var pts = { nw: c[0], n: mid(c[0], c[1]), ne: c[1], e: mid(c[1], c[2]), se: c[2], s: mid(c[2], c[3]), sw: c[3], w: mid(c[3], c[0]) };
      var small = Math.min(it.w, it.h) * S.view.zoom < 26;
      Object.keys(pts).forEach(function (k) { if (!small || k.length === 2) out.push({ id: k, x: pts[k].x, y: pts[k].y }); });
      var a = (it.rot - 90) * Math.PI / 180;
      out.push({ id: 'rot', x: pts.n.x + Math.cos(a) * 24, y: pts.n.y + Math.sin(a) * 24, ax: pts.n.x, ay: pts.n.y });
      return out;
    }
    if (items.some(function (it) { return it.locked; })) return out;
    var b = OP.boundsOf(items), tl = A.toScreen(b.x, b.y), br = A.toScreen(b.x + b.w, b.y + b.h);
    out.push({ id: 'nw', x: tl.x, y: tl.y }, { id: 'ne', x: br.x, y: tl.y }, { id: 'se', x: br.x, y: br.y }, { id: 'sw', x: tl.x, y: br.y });
    out.push({ id: 'rot', x: (tl.x + br.x) / 2, y: tl.y - 24, ax: (tl.x + br.x) / 2, ay: tl.y });
    return out;
  };
  /** End points of a line item in page space. */
  A.lineEnds = function (it) {
    var cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    var a = { x: it.x + (it.flipH ? it.w : 0), y: it.y + (it.flipV ? it.h : 0) }, b = { x: it.x + (it.flipH ? 0 : it.w), y: it.y + (it.flipV ? 0 : it.h) };
    return [OP.rotatePoint(a.x, a.y, cx, cy, it.rot || 0), OP.rotatePoint(b.x, b.y, cx, cy, it.rot || 0)];
  };
  A.setLineEnds = function (it, a, b) {
    it.x = Math.min(a.x, b.x); it.y = Math.min(a.y, b.y);
    it.w = Math.abs(b.x - a.x); it.h = Math.abs(b.y - a.y);
    it.flipH = a.x > b.x; it.flipV = a.y > b.y; it.rot = 0;
  };

  function drawOverlay() {
    var ctx = $('ov').getContext('2d'), d = S.doc, v = S.view, dpr = S.dpr, page = A.page();
    OP.reindex(d);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, S.cw, S.ch);
    var px = function (n) { return Math.round(n) + 0.5; };
    var tl = A.toScreen(0, 0), br = A.toScreen(d.w, d.h);

    if (S.guides) {
      // bleed box
      if (d.bleed > 0) {
        var b0 = A.toScreen(-d.bleed, -d.bleed), b1 = A.toScreen(d.w + d.bleed, d.h + d.bleed);
        ctx.strokeStyle = '#e0352b'; ctx.lineWidth = 1; ctx.setLineDash([5, 3]);
        ctx.strokeRect(px(b0.x), px(b0.y), Math.round(b1.x - b0.x), Math.round(b1.y - b0.y));
        ctx.setLineDash([]);
      }
      // margins
      var m = d.margins;
      if (m.l || m.t || m.r || m.b) {
        var m0 = A.toScreen(m.l, m.t), m1 = A.toScreen(d.w - m.r, d.h - m.b);
        ctx.strokeStyle = A.css('--margin'); ctx.globalAlpha = 0.75; ctx.lineWidth = 1;
        ctx.strokeRect(px(m0.x), px(m0.y), Math.round(m1.x - m0.x), Math.round(m1.y - m0.y));
        ctx.globalAlpha = 1;
      }
      // ruler guides
      ctx.strokeStyle = A.css('--guide'); ctx.lineWidth = 1;
      ctx.beginPath();
      page.guides.v.forEach(function (x) { var sx = px(A.toScreen(x, 0).x); ctx.moveTo(sx, 0); ctx.lineTo(sx, S.ch); });
      page.guides.h.forEach(function (y) { var sy = px(A.toScreen(0, y).y); ctx.moveTo(0, sy); ctx.lineTo(S.cw, sy); });
      ctx.stroke();
    }
    void tl; void br;

    // snap feedback
    if (S.snapLines.length) {
      ctx.strokeStyle = A.css('--margin'); ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      ctx.beginPath();
      S.snapLines.forEach(function (l) {
        if (l.v !== undefined) { var sx = px(A.toScreen(l.v, 0).x); ctx.moveTo(sx, 0); ctx.lineTo(sx, S.ch); }
        else { var sy = px(A.toScreen(0, l.h).y); ctx.moveTo(0, sy); ctx.lineTo(S.cw, sy); }
      });
      ctx.stroke(); ctx.setLineDash([]);
    }

    // selection outlines
    var sel = A.selItems(), selCol = A.css('--sel');
    ctx.strokeStyle = selCol; ctx.lineWidth = 1;
    sel.forEach(function (it) {
      var c = OP.itemCorners(it).map(function (p) { return A.toScreen(p.x, p.y); });
      ctx.beginPath();
      if (OP.isLine(it)) {
        var e = A.lineEnds(it).map(function (p) { return A.toScreen(p.x, p.y); });
        ctx.moveTo(e[0].x, e[0].y); ctx.lineTo(e[1].x, e[1].y);
      } else {
        ctx.moveTo(c[0].x, c[0].y); ctx.lineTo(c[1].x, c[1].y); ctx.lineTo(c[2].x, c[2].y); ctx.lineTo(c[3].x, c[3].y); ctx.closePath();
      }
      if (it.locked) ctx.setLineDash([2, 3]);
      ctx.stroke(); ctx.setLineDash([]);
      if (it.type === 'shape' && it.text && !it.wa && it.id !== S.editing) {
        var lay = OP.textCols(S.doc, it, null);
        if (lay && lay.overflow) { // more text than the box can show
          ctx.fillStyle = '#e0352b';
          ctx.fillRect(c[2].x - 13, c[2].y - 13, 12, 12);
          ctx.fillStyle = '#fff';
          ctx.fillRect(c[2].x - 11, c[2].y - 8, 8, 2); ctx.fillRect(c[2].x - 8, c[2].y - 11, 2, 8);
        }
      }
    });
    if (sel.length > 1) {
      var bb = OP.boundsOf(sel), s0 = A.toScreen(bb.x, bb.y), s1 = A.toScreen(bb.x + bb.w, bb.y + bb.h);
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(px(s0.x), px(s0.y), Math.round(s1.x - s0.x), Math.round(s1.y - s0.y));
      ctx.setLineDash([]);
    }
    if (A.drawOverlayExtra) A.drawOverlayExtra(ctx, sel);
    var hs = A.handles();
    hs.forEach(function (h) {
      if (h.id === 'rot') {
        ctx.beginPath(); ctx.moveTo(h.ax, h.ay); ctx.lineTo(h.x, h.y); ctx.stroke();
        ctx.beginPath(); ctx.arc(h.x, h.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
      } else {
        ctx.fillStyle = '#fff';
        ctx.fillRect(h.x - 4, h.y - 4, 8, 8);
        ctx.strokeRect(h.x - 3.5, h.y - 3.5, 7, 7);
      }
    });

    // rubber band / new-object preview
    var g = S.drag;
    if (g && (g.type === 'marquee' || g.type === 'create') && g.moved) {
      var a = A.toScreen(g.x0, g.y0), b = A.toScreen(g.x1, g.y1);
      ctx.strokeStyle = selCol; ctx.fillStyle = 'rgba(10,132,201,0.10)';
      if (g.type === 'create' && g.kind === 'line') {
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      } else {
        var rx = Math.min(a.x, b.x), ry = Math.min(a.y, b.y), rw = Math.abs(b.x - a.x), rh = Math.abs(b.y - a.y);
        if (g.type === 'marquee') ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeRect(px(rx), px(ry), Math.round(rw), Math.round(rh));
      }
    }
    if (g && g.type === 'guide' && g.pos !== null) {
      ctx.strokeStyle = A.css('--guide'); ctx.lineWidth = 1;
      ctx.beginPath();
      if (g.axis === 'v') { var gx = px(A.toScreen(g.pos, 0).x); ctx.moveTo(gx, 0); ctx.lineTo(gx, S.ch); }
      else { var gy = px(A.toScreen(0, g.pos).y); ctx.moveTo(0, gy); ctx.lineTo(S.cw, gy); }
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------- status + toasts
  A.status = function (msg) {
    var d = S.doc;
    $('stpage').textContent = (S.master ? 'MASTER PAGE “' + (A.page().name || 'Master') + '”' : 'Page ' + (S.pi + 1) + '/' + d.pages.length) + '  ' + OP.round(d.w / MM, 1) + ' × ' + OP.round(d.h / MM, 1) + ' mm';
    var sel = A.selItems();
    if (sel.length) {
      var b = OP.boundsOf(sel);
      $('stsel').textContent = sel.length + ' selected  ' + OP.round(b.w / MM, 1) + ' × ' + OP.round(b.h / MM, 1) + ' mm';
    } else $('stsel').textContent = '';
    if (msg !== undefined) $('stmsg').textContent = msg;
  };
  A.toast = function (msg, isError) {
    var t = document.createElement('div');
    t.className = 'toast' + (isError ? ' err' : '');
    t.textContent = msg;
    $('toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, isError ? 7000 : 3200);
  };

  A.refreshAll = function () { A.refreshPanels(); A.refreshPages(); A.invalidate(); A.status(); };
})();
