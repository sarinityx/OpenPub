/* OpenPub – editor input: pointer tools, snapping, keyboard, object commands. */
var OP = (typeof globalThis.OP !== 'undefined') ? globalThis.OP : (globalThis.OP = {});

(function () {
  'use strict';
  var A = OP.app, S = A.S, $ = A.$, MM = OP.MM;
  var spaceDown = false;

  function scr(e) {
    var r = $('ov').getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // ---------------------------------------------------------------- hit testing
  A.hitTest = function (p) {
    var items = A.page().items, tol = 4 / S.view.zoom;
    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      if (it.hidden || it.locked) continue;
      if (OP.hitItem(it, p.x, p.y, tol)) return it;
    }
    return null;
  };
  function hitHandle(s) {
    var hs = A.handles();
    for (var i = hs.length - 1; i >= 0; i--) if (Math.abs(hs[i].x - s.x) <= 7 && Math.abs(hs[i].y - s.y) <= 7) return hs[i];
    return null;
  }
  function hitGuide(s) {
    if (!S.guides) return null;
    var g = A.page().guides, i;
    for (i = 0; i < g.v.length; i++) if (Math.abs(A.toScreen(g.v[i], 0).x - s.x) <= 3) return { axis: 'v', index: i };
    for (i = 0; i < g.h.length; i++) if (Math.abs(A.toScreen(0, g.h[i]).y - s.y) <= 3) return { axis: 'h', index: i };
    return null;
  }

  // ---------------------------------------------------------------- snapping
  function snapTargets(excludeIds) {
    var d = S.doc, m = d.margins, g = A.page().guides;
    var xs = [0, d.w / 2, d.w], ys = [0, d.h / 2, d.h];
    if (m.l) xs.push(m.l); if (m.r) xs.push(d.w - m.r);
    if (m.t) ys.push(m.t); if (m.b) ys.push(d.h - m.b);
    if (S.guides) { g.v.forEach(function (x) { xs.push(x); }); g.h.forEach(function (y) { ys.push(y); }); }
    A.page().items.forEach(function (it) {
      if (it.hidden || excludeIds.indexOf(it.id) >= 0) return;
      var b = OP.boundsOf([it]);
      xs.push(b.x, b.x + b.w / 2, b.x + b.w);
      ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    });
    return { xs: xs, ys: ys };
  }
  function nearest(cands, targets, thr) {
    var best = null;
    for (var i = 0; i < cands.length; i++) for (var j = 0; j < targets.length; j++) {
      var d = targets[j] - cands[i];
      if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d))) best = { d: d, t: targets[j] };
    }
    return best;
  }
  function snapPoint(p, t, on) {
    S.snapLines = [];
    if (!on) return p;
    var thr = 6 / S.view.zoom, sx = nearest([p.x], t.xs, thr), sy = nearest([p.y], t.ys, thr);
    if (sx) S.snapLines.push({ v: sx.t });
    if (sy) S.snapLines.push({ h: sy.t });
    return { x: p.x + (sx ? sx.d : 0), y: p.y + (sy ? sy.d : 0) };
  }

  // ---------------------------------------------------------------- pointer
  function geom(it) { return { it: it, x: it.x, y: it.y, w: it.w, h: it.h, rot: it.rot || 0, flipH: it.flipH, flipV: it.flipV }; }

  function onDown(e) {
    var ov = $('ov');
    if (S.editing) A.endEdit();
    A.closeMenus();
    try { ov.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
    var s = scr(e), p = A.toPage(s.x, s.y);
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      S.drag = { type: 'pan', sx: s.x, sy: s.y, ox: S.view.ox, oy: S.view.oy };
      ov.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    if (S.tool !== 'select') {
      var t = snapTargets([]);
      var p0 = snapPoint(p, t, S.snap && !e.altKey);
      S.drag = { type: 'create', kind: S.tool === 'text' ? 'text' : S.tool === 'line' ? 'line' : S.shapeKind, x0: p0.x, y0: p0.y, x1: p0.x, y1: p0.y, moved: false, sx: s.x, sy: s.y, targets: t };
      return;
    }
    var h = hitHandle(s);
    if (h) {
      var items = A.selItems();
      S.drag = {
        type: h.id === 'rot' ? 'rotate' : (h.id === 'p0' || h.id === 'p1') ? 'line' : 'resize',
        h: h.id, start: p, orig: items.map(geom), bounds: OP.boundsOf(items), multi: items.length > 1,
        targets: snapTargets(S.sel), moved: true
      };
      if (S.drag.type === 'line') S.drag.ends = A.lineEnds(items[0]);
      return;
    }
    var gd = hitGuide(s);
    if (gd) {
      S.drag = { type: 'guide', axis: gd.axis, index: gd.index, pos: A.page().guides[gd.axis][gd.index] };
      return;
    }
    var it = A.hitTest(p);
    if (S.painter) { // format painter: the click applies the copied formatting, or cancels on empty page
      if (it) { A.pasteFormat([it]); A.setSel([it.id]); if (!S.painter.sticky) A.stopPainter(); }
      else { A.stopPainter(); A.setSel([]); }
      return;
    }
    if (S.linkFrom) { // choosing the box a story continues into
      var from = A.find(S.linkFrom) || OP.docIndex(S.doc).map[S.linkFrom];
      S.linkFrom = null; ov.style.cursor = '';
      if (it && from) {
        var err = OP.linkBoxes(S.doc, from, it);
        if (err) A.toast(err, true); else { A.commit(); A.setSel([it.id]); A.toast('Linked. Text now flows on into this box.'); }
      } else A.toast('Linking cancelled.');
      A.refreshAll();
      return;
    }
    if (it) {
      var wasSel = S.sel.length === 1 && S.sel[0] === it.id;
      var ids = A.withGroups([it.id]);
      if (e.shiftKey) {
        if (S.sel.indexOf(it.id) >= 0) A.setSel(S.sel.filter(function (id) { return ids.indexOf(id) < 0; }));
        else A.setSel(S.sel.concat(ids));
      } else if (S.sel.indexOf(it.id) < 0) A.setSel(ids);
      if (it.type === 'table' && wasSel && !e.shiftKey) { // second click picks a cell
        var hc = OP.cellAt(it, p.x, p.y);
        S.cell = hc ? { id: it.id, r: hc.r, c: hc.c } : null;
        A.refreshPanels(); A.invalidateOverlay();
      }
      var sel = A.selItems();
      S.drag = { type: 'move', start: p, sx: s.x, sy: s.y, orig: sel.map(geom), bounds: OP.boundsOf(sel), targets: snapTargets(S.sel), moved: false };
    } else {
      S.drag = { type: 'marquee', x0: p.x, y0: p.y, x1: p.x, y1: p.y, add: e.shiftKey ? S.sel.slice() : [], moved: false };
      if (!e.shiftKey && S.sel.length) A.setSel([]);
    }
  }

  function onMove(e) {
    var s = scr(e), p = A.toPage(s.x, s.y), g = S.drag;
    S.cursor = { sx: s.x, sy: s.y };
    $('stpos').textContent = 'x ' + OP.round(p.x / MM, 1).toFixed(1) + '  y ' + OP.round(p.y / MM, 1).toFixed(1) + ' mm';
    if (!g) { hoverCursor(s, p); A.drawRulers(); return; }
    var snapOn = S.snap && !e.altKey, thr = 6 / S.view.zoom, i;
    if (g.type === 'pan') {
      S.view.ox = g.ox + (s.x - g.sx); S.view.oy = g.oy + (s.y - g.sy);
      A.invalidate();
    } else if (g.type === 'move') {
      var dx = p.x - g.start.x, dy = p.y - g.start.y;
      if (!g.moved && Math.abs(s.x - g.sx) < 3 && Math.abs(s.y - g.sy) < 3) return;
      g.moved = true;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      S.snapLines = [];
      if (snapOn) {
        var b = g.bounds;
        var sx = nearest([b.x + dx, b.x + b.w / 2 + dx, b.x + b.w + dx], g.targets.xs, thr);
        var sy = nearest([b.y + dy, b.y + b.h / 2 + dy, b.y + b.h + dy], g.targets.ys, thr);
        if (sx && !(e.shiftKey && dx === 0)) { dx += sx.d; S.snapLines.push({ v: sx.t }); }
        if (sy && !(e.shiftKey && dy === 0)) { dy += sy.d; S.snapLines.push({ h: sy.t }); }
      }
      g.orig.forEach(function (o) { o.it.x = o.x + dx; o.it.y = o.y + dy; });
      A.invalidate();
    } else if (g.type === 'resize') {
      if (g.multi) resizeMulti(g, p); else resizeOne(g, p, e, snapOn, thr);
      A.invalidate();
    } else if (g.type === 'rotate') {
      var c = { x: g.bounds.x + g.bounds.w / 2, y: g.bounds.y + g.bounds.h / 2 };
      if (!g.multi) { var o0 = g.orig[0]; c = { x: o0.x + o0.w / 2, y: o0.y + o0.h / 2 }; }
      var a0 = Math.atan2(g.start.y - c.y, g.start.x - c.x), a1 = Math.atan2(p.y - c.y, p.x - c.x);
      var delta = (a1 - a0) * 180 / Math.PI;
      var base = g.multi ? 0 : g.orig[0].rot, target = base + delta;
      if (e.shiftKey) target = Math.round(target / 15) * 15;
      else { var q = Math.round(target / 90) * 90; if (Math.abs(target - q) < 3) target = q; }
      delta = target - base;
      g.orig.forEach(function (o) {
        var pc = OP.rotatePoint(o.x + o.w / 2, o.y + o.h / 2, c.x, c.y, g.multi ? delta : 0);
        o.it.x = pc.x - o.w / 2; o.it.y = pc.y - o.h / 2;
        o.it.rot = OP.round((((o.rot + delta) % 360) + 360) % 360, 2);
      });
      A.invalidate();
    } else if (g.type === 'line') {
      var it = g.orig[0].it, other = g.h === 'p0' ? g.ends[1] : g.ends[0];
      var np = snapPoint(p, g.targets, snapOn);
      if (e.shiftKey) { np = constrain45(other, p); S.snapLines = []; }
      if (g.h === 'p0') A.setLineEnds(it, np, other); else A.setLineEnds(it, other, np);
      A.invalidate();
    } else if (g.type === 'marquee' || g.type === 'create') {
      if (!g.moved && g.type === 'create' && Math.abs(s.x - g.sx) < 3 && Math.abs(s.y - g.sy) < 3) return;
      g.moved = true;
      var q1 = g.type === 'create' ? snapPoint(p, g.targets, snapOn) : p;
      if (g.type === 'create' && e.shiftKey) {
        if (g.kind === 'line') q1 = constrain45({ x: g.x0, y: g.y0 }, p);
        else { var m = Math.max(Math.abs(q1.x - g.x0), Math.abs(q1.y - g.y0)); q1 = { x: g.x0 + (q1.x < g.x0 ? -m : m), y: g.y0 + (q1.y < g.y0 ? -m : m) }; }
      }
      g.x1 = q1.x; g.y1 = q1.y;
      if (g.type === 'marquee') {
        var x0 = Math.min(g.x0, g.x1), y0 = Math.min(g.y0, g.y1), x1 = Math.max(g.x0, g.x1), y1 = Math.max(g.y0, g.y1), ids = g.add.slice();
        A.page().items.forEach(function (it2) {
          if (it2.hidden || it2.locked) return;
          var bb = OP.boundsOf([it2]);
          if (bb.x >= x0 && bb.y >= y0 && bb.x + bb.w <= x1 && bb.y + bb.h <= y1) ids.push(it2.id);
        });
        ids = A.withGroups(ids);
        if (ids.join() !== S.sel.join()) { S.sel = ids; A.status(); }
      }
      A.invalidateOverlay();
    } else if (g.type === 'guide') {
      var v = g.axis === 'v' ? p.x : p.y;
      if (!e.altKey) v = Math.round(v / MM) * MM; // whole millimetres
      var inside = g.axis === 'v' ? (s.x >= 0 && s.x <= S.cw) : (s.y >= 0 && s.y <= S.ch);
      g.pos = inside ? v : null;
      if (g.index >= 0) { A.page().guides[g.axis][g.index] = inside ? v : -99999; }
      $('stmsg').textContent = inside ? 'Guide at ' + OP.round(v / MM, 1) + ' mm' : 'Release to remove guide';
      A.invalidateOverlay();
    }
    void i;
  }

  function constrain45(from, p) {
    var dx = p.x - from.x, dy = p.y - from.y, len = Math.sqrt(dx * dx + dy * dy);
    var a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    return { x: from.x + Math.cos(a) * len, y: from.y + Math.sin(a) * len };
  }

  function resizeOne(g, p, e, snapOn, thr) {
    var o = g.orig[0], it = o.it, id = g.h;
    var hx = id.indexOf('e') >= 0 ? 1 : id.indexOf('w') >= 0 ? -1 : 0, hy = id.indexOf('s') >= 0 ? 1 : id.indexOf('n') >= 0 ? -1 : 0;
    var c0 = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
    var d = OP.rotatePoint(p.x - g.start.x, p.y - g.start.y, 0, 0, -o.rot);
    S.snapLines = [];
    if (snapOn && o.rot === 0) {
      if (hx) { var ex = hx > 0 ? o.x + o.w + d.x : o.x + d.x, sx = nearest([ex], g.targets.xs, thr); if (sx) { d.x += sx.d; S.snapLines.push({ v: sx.t }); } }
      if (hy) { var ey = hy > 0 ? o.y + o.h + d.y : o.y + d.y, sy = nearest([ey], g.targets.ys, thr); if (sy) { d.y += sy.d; S.snapLines.push({ h: sy.t }); } }
    }
    var nw = o.w + hx * d.x, nh = o.h + hy * d.y;
    var keep = hx && hy && ((it.type === 'image') !== e.shiftKey);
    if (keep && o.w > 0 && o.h > 0) {
      var f = Math.max(nw / o.w, nh / o.h);
      nw = o.w * f; nh = o.h * f;
      S.snapLines = [];
    }
    nw = Math.max(1, nw); nh = Math.max(1, nh);
    var sh = OP.rotatePoint(hx * (nw - o.w) / 2, hy * (nh - o.h) / 2, 0, 0, o.rot);
    it.w = nw; it.h = nh;
    it.x = c0.x + sh.x - nw / 2; it.y = c0.y + sh.y - nh / 2;
  }

  function resizeMulti(g, p) {
    var b = g.bounds, id = g.h;
    var ax = id.indexOf('w') >= 0 ? b.x + b.w : b.x, ay = id.indexOf('n') >= 0 ? b.y + b.h : b.y;
    var f = Math.max(Math.abs(p.x - ax) / (b.w || 1), Math.abs(p.y - ay) / (b.h || 1), 0.02);
    g.orig.forEach(function (o) {
      var cx = ax + (o.x + o.w / 2 - ax) * f, cy = ay + (o.y + o.h / 2 - ay) * f;
      o.it.w = o.w * f; o.it.h = o.h * f;
      o.it.x = cx - o.it.w / 2; o.it.y = cy - o.it.h / 2;
    });
  }

  function onUp(e) {
    var g = S.drag;
    S.drag = null;
    S.snapLines = [];
    if (!g) return;
    var ov = $('ov');
    try { ov.releasePointerCapture(e.pointerId); } catch (err) { /* not captured */ }
    if (g.type === 'pan') { ov.style.cursor = ''; return; }
    if (g.type === 'create') { finishCreate(g); return; }
    if (g.type === 'marquee') { A.setSel(S.sel); return; }
    if (g.type === 'guide') {
      var arr = A.page().guides[g.axis];
      if (g.index >= 0) { if (g.pos === null) arr.splice(g.index, 1); else arr[g.index] = g.pos; }
      else if (g.pos !== null) arr.push(g.pos);
      $('stmsg').textContent = '';
      A.commit(); A.invalidate();
      return;
    }
    if (g.moved) {
      g.orig.forEach(function (o) { ['x', 'y', 'w', 'h'].forEach(function (k) { o.it[k] = OP.round(o.it[k], 3); }); });
      A.commit();
      A.refreshPanels();
    }
    A.invalidate();
    A.status();
  }

  function finishCreate(g) {
    var d = S.doc, it;
    var x = Math.min(g.x0, g.x1), y = Math.min(g.y0, g.y1), w = Math.abs(g.x1 - g.x0), h = Math.abs(g.y1 - g.y0);
    if (g.kind === 'line') {
      it = OP.newShape('line', 0, 0, 1, 1);
      if (!g.moved) { g.x1 = g.x0 + d.w * 0.3; g.y1 = g.y0; }
      A.setLineEnds(it, { x: g.x0, y: g.y0 }, { x: g.x1, y: g.y1 });
      it.stroke = { color: '#000000', width: Math.max(1, OP.round(d.w / 400, 1)), dash: 'solid' };
    } else if (g.kind === 'text') {
      if (!g.moved || w < 8 || h < 8) { w = d.w * 0.45; h = Math.max(40, d.w * 0.08); }
      var size = S.lastStyle ? S.lastStyle.size : Math.max(12, Math.round(d.w / 30));
      it = OP.newTextBox(x, y, w, h, [OP.newPara([OP.newRun('', S.lastStyle ? OP.clone(S.lastStyle) : { size: size })])]);
    } else {
      if (!g.moved || w < 2 || h < 2) { w = h = d.w * 0.25; }
      it = OP.newShape(g.kind, x, y, w, h);
      it.fill = { type: 'solid', color: '#3d7ea6' };
      it.stroke = null;
    }
    A.page().items.push(it);
    A.setTool('select');
    S.sel = [it.id];
    if (g.kind === 'text') { A.refreshAll(); A.beginEdit(it, true); }
    else { A.commit(); A.refreshAll(); }
  }

  function hoverCursor(s, p) {
    var ov = $('ov'), cur = '';
    if (spaceDown) cur = 'grab';
    else if (S.painter) cur = 'copy';
    else if (S.tool === 'text') cur = 'text';
    else if (S.tool !== 'select') cur = 'crosshair';
    else {
      var h = hitHandle(s);
      if (h) {
        if (h.id === 'rot') cur = 'grab';
        else if (h.id === 'p0' || h.id === 'p1') cur = 'crosshair';
        else {
          // pick a resize cursor that matches the handle's on-screen direction
          var it = A.selItems()[0], base = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 }[h.id];
          var ang = (((base + (A.selItems().length === 1 && it ? it.rot : 0)) % 180) + 180) % 180;
          cur = ang < 22.5 || ang >= 157.5 ? 'ew-resize' : ang < 67.5 ? 'nwse-resize' : ang < 112.5 ? 'ns-resize' : 'nesw-resize';
        }
      } else {
        var g = hitGuide(s);
        if (g) cur = g.axis === 'v' ? 'col-resize' : 'row-resize';
        else if (A.hitTest(p)) cur = 'move';
      }
    }
    if (ov.style.cursor !== cur) ov.style.cursor = cur;
  }

  function onDbl(e) {
    if (S.tool !== 'select') return;
    var s = scr(e), it = A.hitTest(A.toPage(s.x, s.y));
    if (!it) return;
    if (it.type === 'table') {
      var hc = OP.cellAt(it, A.toPage(s.x, s.y).x, A.toPage(s.x, s.y).y);
      if (hc) { S.sel = [it.id]; A.beginEdit(it, false, { x: e.clientX, y: e.clientY }, hc); }
    } else if (it.wa) {
      A.setSel([it.id]); A.showTab('props');
      setTimeout(function () { var f = $('waText'); if (f) { f.focus(); f.select(); } }, 30);
    } else if (it.type === 'shape' && !OP.isOpen(it)) { S.sel = [it.id]; A.beginEdit(it, false, { x: e.clientX, y: e.clientY }); }
  }

  function onWheel(e) {
    e.preventDefault();
    var s = scr(e);
    if (e.ctrlKey || e.metaKey) {
      A.setZoom(S.view.zoom * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0022)), s.x, s.y);
      A.zoomLabel();
    } else {
      var k = e.deltaMode ? 30 : 1;
      if (e.shiftKey) S.view.ox -= (e.deltaY || e.deltaX) * k;
      else { S.view.ox -= e.deltaX * k; S.view.oy -= e.deltaY * k; }
      A.invalidate();
    }
  }

  function rulerDown(axis) {
    return function (e) {
      if (S.editing) A.endEdit();
      S.guides = true;
      S.drag = { type: 'guide', axis: axis, index: -1, pos: null };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      e.preventDefault();
    };
  }

  // ---------------------------------------------------------------- object commands
  A.setTool = function (t, kind) {
    if (S.editing) A.endEdit();
    S.tool = t;
    if (kind) S.shapeKind = kind;
    A.refreshToolbar();
    $('ov').style.cursor = t === 'select' ? '' : (t === 'text' ? 'text' : 'crosshair');
  };

  A.addItems = function (items, select) {
    var pg = A.page();
    items.forEach(function (it) { pg.items.push(it); });
    if (select !== false) S.sel = items.map(function (it) { return it.id; });
    A.commit(); A.refreshAll();
  };

  A.deleteSel = function () {
    if (!S.sel.length) return;
    var pg = A.page(), locked = 0;
    // keep linked stories intact: hand the text on and close the gap in the chain
    A.selItems().forEach(function (it) {
      if (it.locked || it.type !== 'shape') return;
      var st = OP.storyOf(S.doc, it);
      if (!st) return;
      var i = st.chain.indexOf(it), prev = st.chain[i - 1], next = st.chain[i + 1];
      if (i === 0 && next && it.text) next.text.paras = it.text.paras;
      if (prev) { if (next) prev.next = next.id; else delete prev.next; }
      delete it.next;
      OP.reindex(S.doc);
    });
    pg.items = pg.items.filter(function (it) {
      if (S.sel.indexOf(it.id) < 0) return true;
      if (it.locked) { locked++; return true; }
      return false;
    });
    if (locked) A.toast('Locked objects were kept. Unlock them first to delete.');
    S.sel = [];
    A.commit(); A.refreshAll();
  };

  function cloneItems(items, dx, dy) {
    var gmap = {};
    return items.map(function (it) {
      var c = OP.clone(it);
      c.id = OP.uid('i');
      delete c.next; // a copy starts a story of its own
      if (c.group) { gmap[c.group] = gmap[c.group] || OP.uid('g'); c.group = gmap[c.group]; }
      c.x += dx; c.y += dy;
      return c;
    });
  }
  A.duplicate = function () {
    var items = A.selItems();
    if (!items.length) return;
    var off = Math.max(8, S.doc.w / 60);
    A.addItems(cloneItems(items, off, off));
  };
  A.copy = function () {
    var items = A.selItems();
    if (!items.length) return false;
    S.clip = { json: JSON.stringify(items), n: 0, page: A.page().id };
    return true;
  };
  A.cut = function () { if (A.copy()) A.deleteSel(); };
  A.paste = function () {
    if (!S.clip) return;
    S.clip.n++;
    var same = S.clip.page === A.page().id, off = same ? S.clip.n * Math.max(8, S.doc.w / 60) : 0;
    A.addItems(cloneItems(JSON.parse(S.clip.json), off, off));
  };
  A.selectAll = function () {
    A.setSel(A.page().items.filter(function (it) { return !it.hidden && !it.locked; }).map(function (it) { return it.id; }));
  };
  A.nudge = function (dx, dy) {
    var items = A.selItems().filter(function (it) { return !it.locked; });
    if (!items.length) return;
    items.forEach(function (it) { it.x += dx; it.y += dy; });
    A.invalidate(); A.nudgeCommitSoon();
  };
  var nudgeTimer = 0;
  A.nudgeCommitSoon = function () { clearTimeout(nudgeTimer); nudgeTimer = setTimeout(function () { A.commit(); A.refreshPanels(); }, 400); };

  A.order = function (how) {
    var pg = A.page(), items = pg.items, sel = S.sel, i;
    if (!sel.length) return;
    var isSel = function (it) { return sel.indexOf(it.id) >= 0; };
    if (how === 'front') pg.items = items.filter(function (it) { return !isSel(it); }).concat(items.filter(isSel));
    else if (how === 'back') pg.items = items.filter(isSel).concat(items.filter(function (it) { return !isSel(it); }));
    else if (how === 'fwd') {
      for (i = items.length - 2; i >= 0; i--) if (isSel(items[i]) && !isSel(items[i + 1])) { var t = items[i]; items[i] = items[i + 1]; items[i + 1] = t; }
    } else {
      for (i = 1; i < items.length; i++) if (isSel(items[i]) && !isSel(items[i - 1])) { var u = items[i]; items[i] = items[i - 1]; items[i - 1] = u; }
    }
    A.commit(); A.refreshAll();
  };

  /** Selection split into movable units (a group moves as one). */
  function units() {
    var map = {}, out = [];
    A.selItems().forEach(function (it) {
      if (it.locked) return;
      var key = it.group || it.id;
      if (!map[key]) { map[key] = []; out.push(map[key]); }
      map[key].push(it);
    });
    return out;
  }
  // ---------------------------------------------------------------- format painter
  var RUN_KEYS = ['font', 'size', 'b', 'i', 'u', 's', 'caps', 'sp', 'color'];
  var PARA_KEYS = ['align', 'ls', 'lsPt', 'before', 'after', 'indent', 'left', 'right', 'bullet', 'num'];
  function pick(o, keys) { var r = {}; keys.forEach(function (k) { if (o[k] !== undefined) r[k] = OP.clone(o[k]); }); return r; }
  function hasText(it) { return !!(it && it.type === 'shape' && it.text && !it.wa); }
  /** What the painter copies from an item: object look, and its text's first character and paragraph formatting.
   *  While editing, the text formatting comes from the caret instead. */
  function formatOf(it) {
    var f = { obj: {}, run: null, para: null };
    if (it.type !== 'table') {
      if (it.type === 'shape' && !OP.isOpen(it)) f.obj.fill = OP.clone(it.fill || null);
      if (it.type === 'shape' || it.type === 'image') f.obj.stroke = OP.clone(it.stroke || null);
      f.obj.shadow = OP.clone(it.shadow || null);
      f.obj.opacity = it.opacity === undefined ? 1 : it.opacity;
      if (it.kind === 'roundrect' && it.radius !== undefined) f.obj.radius = it.radius;
    }
    if (S.editing === it.id && A.isEditing() && hasText(it)) {
      var st = A.textState();
      f.run = pick(st, RUN_KEYS);
      f.para = pick(st, PARA_KEYS);
      f.para.bullet = st.bullet ? '•' : null; f.para.num = !!st.num;
    } else if (hasText(it)) {
      var p0 = it.text.paras[0], r0 = p0.runs.filter(function (r) { return r.t; })[0] || p0.runs[0];
      f.run = pick(r0, RUN_KEYS);
      f.para = pick(p0, PARA_KEYS);
    }
    return f;
  }
  function applyFormat(it, f) {
    if (it.locked) return false;
    var o = f.obj;
    if (it.type !== 'table') {
      if ('fill' in o && it.type === 'shape' && !OP.isOpen(it) && !it.wa) it.fill = OP.clone(o.fill);
      if ('stroke' in o && (it.type === 'shape' || it.type === 'image')) it.stroke = OP.clone(o.stroke);
      if ('shadow' in o) it.shadow = OP.clone(o.shadow);
      if ('opacity' in o) it.opacity = o.opacity;
      if ('radius' in o && it.kind === 'roundrect') it.radius = o.radius;
    }
    if (f.run && hasText(it)) {
      it.text.paras.forEach(function (p) {
        PARA_KEYS.forEach(function (k) {
          if (k === 'num') { if (f.para.num) p.num = true; else delete p.num; }
          else if (k === 'bullet') p.bullet = f.para.num ? null : (f.para.bullet || null);
          else if (f.para[k] !== undefined) p[k] = OP.clone(f.para[k]);
        });
        p.runs.forEach(function (r) {
          RUN_KEYS.forEach(function (k) { if (f.run[k] === undefined || f.run[k] === false) delete r[k]; else r[k] = OP.clone(f.run[k]); });
        });
      });
    }
    return true;
  }
  /** Copy the formatting of the selected object (or of the text at the caret). */
  A.copyFormat = function (quiet) {
    var src = S.editing ? A.find(S.editing) : A.selItems()[0];
    if (!src || src.type === 'table') { A.toast('Select a text box, shape or picture to copy its formatting.'); return false; }
    S.fmt = formatOf(src);
    if (!quiet) A.toast('Formatting copied. Select objects and press Ctrl+Shift+V to apply it.');
    return true;
  };
  /** Apply copied formatting to the given items (default: the selection). One undo step. */
  A.pasteFormat = function (items) {
    if (!S.fmt) { A.toast('Nothing copied yet. Select an object and press Ctrl+Shift+C first.'); return; }
    if (S.editing) A.endEdit();
    var n = 0;
    (items || A.selItems()).forEach(function (it) { if (applyFormat(it, S.fmt)) n++; });
    if (!n) return;
    A.commit(); A.refreshAll(); A.updateFontList();
  };
  /** Arm the painter: copy from the selection, then the next click on an object applies it.
   *  sticky: keep applying on every click until Esc. */
  A.startPainter = function (sticky) {
    if (!A.copyFormat(true)) return;
    if (S.editing) A.endEdit();
    if (S.tool !== 'select') A.setTool('select');
    S.painter = { sticky: !!sticky };
    $('ov').style.cursor = 'copy';
    A.toast(sticky ? 'Format painter on: click objects to apply. Press Esc to stop.' : 'Click an object to apply the formatting. Press Esc to cancel.');
    A.refreshToolbar();
  };
  A.stopPainter = function () { S.painter = null; $('ov').style.cursor = ''; A.refreshToolbar(); };

  /** The units align and distribute would move: unlocked selected objects, a group counting as one. */
  A.alignUnits = function () { return units(); };
  A.align = function (how) {
    var us = units();
    if (!us.length) return;
    var d = S.doc, ref = us.length > 1 ? OP.boundsOf(A.selItems()) : { x: 0, y: 0, w: d.w, h: d.h };
    us.forEach(function (u) {
      var b = OP.boundsOf(u), dx = 0, dy = 0;
      if (how === 'l') dx = ref.x - b.x; else if (how === 'c') dx = ref.x + ref.w / 2 - (b.x + b.w / 2); else if (how === 'r') dx = ref.x + ref.w - (b.x + b.w);
      else if (how === 't') dy = ref.y - b.y; else if (how === 'm') dy = ref.y + ref.h / 2 - (b.y + b.h / 2); else if (how === 'b') dy = ref.y + ref.h - (b.y + b.h);
      u.forEach(function (it) { it.x += dx; it.y += dy; });
    });
    A.commit(); A.refreshAll();
  };
  A.distribute = function (axis) {
    var us = units().map(function (u) { return { u: u, b: OP.boundsOf(u) }; });
    if (us.length < 3) { A.toast('Select three or more objects to distribute.'); return; }
    var k = axis === 'h' ? 'x' : 'y', s = axis === 'h' ? 'w' : 'h';
    us.sort(function (a, b) { return a.b[k] - b.b[k]; });
    var first = us[0].b, last = us[us.length - 1].b, total = 0;
    us.forEach(function (e) { total += e.b[s]; });
    var gap = (last[k] + last[s] - first[k] - total) / (us.length - 1), pos = first[k];
    us.forEach(function (e) {
      var delta = pos - e.b[k];
      e.u.forEach(function (it) { it[k] += delta; });
      pos += e.b[s] + gap;
    });
    A.commit(); A.refreshAll();
  };
  A.group = function () {
    var items = A.selItems();
    if (items.length < 2) return;
    var gid = OP.uid('g');
    items.forEach(function (it) { it.group = gid; });
    A.commit(); A.refreshPanels();
  };
  A.ungroup = function () {
    A.selItems().forEach(function (it) { it.group = null; });
    A.commit(); A.refreshPanels();
  };
  A.toggleLock = function () {
    var items = A.selItems();
    if (!items.length) return;
    var lock = !items.every(function (it) { return it.locked; });
    items.forEach(function (it) { it.locked = lock; });
    A.commit(); A.refreshAll();
  };

  // ---------------------------------------------------------------- pictures
  function readDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error('Could not read ' + file.name)); };
      fr.readAsDataURL(file);
    });
  }
  function imageSize(url) {
    return new Promise(function (resolve, reject) {
      var im = new Image();
      im.onload = function () { resolve({ w: im.naturalWidth || 300, h: im.naturalHeight || 300 }); };
      im.onerror = function () { reject(new Error('This picture format cannot be shown by the browser.')); };
      im.src = url;
    });
  }
  /** Insert picture files at a page position (default: page centre). */
  A.insertImageFiles = async function (files, at) {
    var d = S.doc, made = [], n = 0;
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (!/^image\//.test(f.type)) continue;
      try {
        var url = await readDataUrl(f), sz = await imageSize(url);
        var id = OP.addAsset(d, url, sz);
        var w = sz.w * 0.75, h = sz.h * 0.75; // 96 dpi -> points
        var k = Math.min(1, d.w * 0.7 / w, d.h * 0.7 / h);
        w *= k; h *= k;
        var c = at || { x: d.w / 2, y: d.h / 2 };
        var it = OP.newImage(id, c.x - w / 2 + n * 12, c.y - h / 2 + n * 12, w, h);
        it.name = f.name.replace(/\.[^.]+$/, '').slice(0, 40);
        made.push(it); n++;
      } catch (err) { A.toast(err.message, true); }
    }
    if (made.length) { A.setTool('select'); A.addItems(made); }
  };
  /** Swap the picture inside an existing frame, keeping its position and width. */
  A.replaceImage = async function (it, file) {
    try {
      var url = await readDataUrl(file), sz = await imageSize(url);
      it.asset = OP.addAsset(S.doc, url, sz);
      it.crop = { l: 0, t: 0, r: 0, b: 0 };
      it.h = it.w * sz.h / sz.w;
      await OP.ensureImages(S.doc);
      A.commit(); A.refreshAll();
    } catch (err) { A.toast(err.message, true); }
  };

  // ---------------------------------------------------------------- keyboard
  function typing(e) {
    var t = e.target;
    return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  }
  function onKey(e) {
    var mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 's') { e.preventDefault(); A.saveProject(); return; }
    if (mod && k === 'o') { e.preventDefault(); $('fileOpen').click(); return; }
    if (A.modalOpen()) { if (e.key === 'Escape') A.closeModal(); return; }
    if (mod && e.shiftKey && (k === 'c' || k === 'v') && (S.editing || !typing(e))) { // format painter shortcuts (also while editing text)
      e.preventDefault();
      if (k === 'c') A.copyFormat(); else A.pasteFormat();
      return;
    }
    if (S.editing) {
      if (e.key === 'Escape') { e.preventDefault(); A.endEdit(); }
      return;
    }
    if (typing(e)) return;
    if (e.key === 'Escape' && S.painter) { A.stopPainter(); A.toast('Format painter off.'); return; }
    if (e.key === ' ') { spaceDown = true; if (!S.drag) $('ov').style.cursor = 'grab'; e.preventDefault(); return; }
    if (mod) {
      if (k === 'z') { e.preventDefault(); if (e.shiftKey) A.redo(); else A.undo(); }
      else if (k === 'y') { e.preventDefault(); A.redo(); }
      else if (k === 'c') { A.copy(); }
      else if (k === 'x') { A.cut(); }
      else if (k === 'd') { e.preventDefault(); A.duplicate(); }
      else if (k === 'a') { e.preventDefault(); A.selectAll(); }
      else if (k === 'g') { e.preventDefault(); if (e.shiftKey) A.ungroup(); else A.group(); }
      else if (k === ']') { e.preventDefault(); A.order(e.shiftKey ? 'front' : 'fwd'); }
      else if (k === '[') { e.preventDefault(); A.order(e.shiftKey ? 'back' : 'bwd'); }
      else if (k === '0') { e.preventDefault(); A.fit(); A.zoomLabel(); }
      else if (k === '1') { e.preventDefault(); A.setZoom(96 / 72); A.zoomLabel(); }
      else if (k === '=' || k === '+') { e.preventDefault(); A.setZoom(S.view.zoom * 1.25); A.zoomLabel(); }
      else if (k === '-') { e.preventDefault(); A.setZoom(S.view.zoom / 1.25); A.zoomLabel(); }
      return;
    }
    var step = (e.shiftKey ? 5 : 0.5) * MM;
    switch (e.key) {
      case 'Delete': case 'Backspace': e.preventDefault(); A.deleteSel(); break;
      case 'Escape': if (S.linkFrom) { S.linkFrom = null; $('ov').style.cursor = ''; A.toast('Linking cancelled.'); } else if (S.tool !== 'select') A.setTool('select'); else A.setSel([]); break;
      case 'ArrowLeft': e.preventDefault(); A.nudge(-step, 0); break;
      case 'ArrowRight': e.preventDefault(); A.nudge(step, 0); break;
      case 'ArrowUp': e.preventDefault(); A.nudge(0, -step); break;
      case 'ArrowDown': e.preventDefault(); A.nudge(0, step); break;
      case 'Enter': {
        var it = A.selItems()[0];
        if (S.sel.length === 1 && it && it.type === 'table' && !it.locked) { e.preventDefault(); A.beginEdit(it, false, null, S.cell && S.cell.id === it.id ? { r: S.cell.r, c: S.cell.c } : { r: 0, c: 0 }); }
        else if (S.sel.length === 1 && it && it.type === 'shape' && !OP.isOpen(it) && !it.locked && !it.wa) { e.preventDefault(); A.beginEdit(it); }
        break;
      }
      default:
        if (k === 'v') A.setTool('select'); else if (k === 't') A.setTool('text');
        else if (k === 'r') A.setTool('shape', 'rect'); else if (k === 'o') A.setTool('shape', 'ellipse'); else if (k === 'l') A.setTool('line');
    }
  }

  A.initInput = function () {
    var ov = $('ov');
    ov.addEventListener('pointerdown', onDown);
    ov.addEventListener('pointermove', onMove);
    ov.addEventListener('pointerup', onUp);
    ov.addEventListener('pointercancel', onUp);
    ov.addEventListener('dblclick', onDbl);
    ov.addEventListener('wheel', onWheel, { passive: false });
    ov.addEventListener('pointerleave', function () { S.cursor = null; A.drawRulers(); });
    ov.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    [['rulerH', 'h'], ['rulerV', 'v']].forEach(function (r) {
      var el = $(r[0]);
      el.addEventListener('pointerdown', rulerDown(r[1]));
      el.addEventListener('pointermove', function (e) { if (S.drag && S.drag.type === 'guide') onMove(e); });
      el.addEventListener('pointerup', onUp);
      el.style.cursor = r[1] === 'h' ? 'row-resize' : 'col-resize';
      el.title = 'Drag from the ruler to add a guide';
    });
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', function (e) { if (e.key === ' ') { spaceDown = false; if (!S.drag) $('ov').style.cursor = ''; } });
    document.addEventListener('paste', function (e) {
      if (typing(e) || S.editing || A.modalOpen()) return;
      var files = e.clipboardData && e.clipboardData.files;
      if (files && files.length) { e.preventDefault(); A.insertImageFiles(Array.prototype.slice.call(files)); }
      else if (S.clip) { e.preventDefault(); A.paste(); }
    });
    // drag & drop of files
    var stage = $('stage'), depth = 0;
    stage.addEventListener('dragenter', function (e) { e.preventDefault(); depth++; stage.classList.add('dragging'); });
    stage.addEventListener('dragover', function (e) { e.preventDefault(); });
    stage.addEventListener('dragleave', function () { depth = Math.max(0, depth - 1); if (!depth) stage.classList.remove('dragging'); });
    stage.addEventListener('drop', function (e) {
      e.preventDefault(); depth = 0; stage.classList.remove('dragging');
      var files = Array.prototype.slice.call((e.dataTransfer && e.dataTransfer.files) || []);
      if (!files.length) return;
      var doc = files.filter(function (f) { return /\.(pub|json|opub)$/i.test(f.name); })[0];
      if (doc) { A.openFile(doc); return; }
      var s = scr(e);
      A.insertImageFiles(files, A.toPage(s.x, s.y));
    });
  };
})();
