/* OpenPub – text wrap. An item with wrap = {mode:'square'|'tight', dist} pushes the text of
 * overlapping text boxes on the same page aside; so do such items on the page's master page.
 * Each obstacle is reduced to a left/right extent per row of the text box, so wrapping follows
 * rotated shapes, ovals and transparent pictures alike. Text flows on both sides of an obstacle:
 * each line fills the free space left of it, then the space right of it. A side narrower than
 * OP.WRAP_MIN_SIDE is skipped. */
var OP = (typeof globalThis.OP !== 'undefined') ? globalThis.OP : (globalThis.OP = {});

(function () {
  'use strict';
  var cache = {}, cacheN = 0;
  /** Narrowest free space beside an obstacle that text is put into, in points (36 pt ≈ 12.7 mm,
   *  room for a short word or two at body sizes). Narrower gaps stay empty. */
  OP.WRAP_MIN_SIDE = 36;

  /** Items on a page's master page that text on the page wraps around. */
  function masterObstacles(doc, pi) {
    var pg = doc.pages[pi], out = [];
    if (!pg || !pg.master) return out;
    (doc.masters || []).forEach(function (m) {
      if (m.id === pg.master) m.items.forEach(function (o) { if (o.wrap) out.push(o); });
    });
    return out;
  }

  function aabb(it, grow) {
    var c = OP.itemCorners(it), x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    c.forEach(function (p) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; });
    return { x0: x0 - grow, y0: y0 - grow, x1: x1 + grow, y1: y1 + grow };
  }
  function canAlpha(doc, it) {
    if (it.type !== 'image') return null;
    var a = doc.assets[it.asset];
    if (!a || !/^data:image\/(png|gif|webp|svg)/i.test(a.src || '')) return null;
    var c = OP.getImage(doc, it.asset);
    return (c && c.ok) ? c : null;
  }

  /** Per-row extents of one obstacle in the text box's own coordinates. */
  function profile(doc, box, o, s, W, H) {
    var d = Math.max(0, o.wrap.dist || 0), rows = { min: new Float32Array(H).fill(Infinity), max: new Float32Array(H).fill(-Infinity) };
    var canvasOk = typeof OffscreenCanvas !== 'undefined' || typeof document !== 'undefined';
    if (o.wrap.mode !== 'tight' || !canvasOk) {
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      OP.itemCorners(o).forEach(function (p) {
        var q = OP.toLocal(box, p.x, p.y);
        if (q.x < x0) x0 = q.x; if (q.y < y0) y0 = q.y; if (q.x > x1) x1 = q.x; if (q.y > y1) y1 = q.y;
      });
      var r0 = Math.max(0, Math.floor((y0 - d) * s)), r1 = Math.min(H - 1, Math.ceil((y1 + d) * s));
      for (var r = r0; r <= r1; r++) { rows.min[r] = (x0 - d) * s; rows.max[r] = (x1 + d) * s; }
      return rows;
    }
    var cv = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(W, H) : document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.translate(box.w / 2, box.h / 2);
    ctx.rotate(-(box.rot || 0) * Math.PI / 180);
    ctx.translate(-(box.x + box.w / 2), -(box.y + box.h / 2));
    ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
    ctx.rotate((o.rot || 0) * Math.PI / 180);
    ctx.scale(o.flipH ? -1 : 1, o.flipV ? -1 : 1);
    ctx.translate(-o.w / 2, -o.h / 2);
    ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    var img = canAlpha(doc, o), mask = o.type === 'image' ? OP.maskPath(o) : null;
    if (img) { // follow the picture's own transparency
      if (mask) ctx.clip(new Path2D(mask));
      var steps = d > 0 ? 12 : 1;
      for (var k = 0; k < steps; k++) {
        var a = k / steps * Math.PI * 2;
        ctx.save();
        if (d > 0) ctx.translate(Math.cos(a) * d, Math.sin(a) * d);
        OP.drawCropped(ctx, img, o.crop, o.w, o.h);
        ctx.restore();
      }
      if (d > 0) OP.drawCropped(ctx, img, o.crop, o.w, o.h);
    } else {
      var solid = o.type === 'shape' && !o.wa && !(o.text && !o.fill && !o.stroke);
      var path = new Path2D(mask || (solid ? OP.shapePath(o) : 'M0 0H' + o.w + 'V' + o.h + 'H0Z'));
      var open = o.type === 'shape' && OP.isOpen(o);
      if (!open) ctx.fill(path);
      ctx.lineWidth = Math.max(open ? ((o.stroke && o.stroke.width) || 1) : 0, 0) + 2 * d;
      if (ctx.lineWidth > 0) ctx.stroke(path);
    }
    var px = ctx.getImageData(0, 0, W, H).data;
    for (var y = 0; y < H; y++) {
      var base = y * W * 4 + 3, lo = -1, hi = -1, x;
      for (x = 0; x < W; x++) if (px[base + x * 4] > 40) { lo = x; break; }
      if (lo < 0) continue;
      for (x = W - 1; x >= lo; x--) if (px[base + x * 4] > 40) { hi = x; break; }
      rows.min[y] = lo; rows.max[y] = hi + 1;
    }
    return rows;
  }

  /**
   * Wrap data for a text box: null when nothing wraps it, else
   * {sig, avail(colX, colY, colW, y, h) -> [{x, w}, …] | null}: the free gaps of the column at
   * that height, left to right, x relative to the column, each at least OP.WRAP_MIN_SIDE wide.
   */
  OP.wrapProfile = function (doc, box) {
    var ix = OP.docIndex(doc), pi = ix.pageOf[box.id];
    var list = ((ix.wraps && ix.wraps[pi]) || []).concat(pi >= 0 ? masterObstacles(doc, pi) : []);
    if (!list.length) return null;
    var bb = aabb(box, 0);
    var obs = list.filter(function (o) {
      if (o.id === box.id || o.hidden || (o.group && o.group === box.group)) return false;
      var ob = aabb(o, o.wrap.dist || 0);
      return ob.x0 < bb.x1 && ob.x1 > bb.x0 && ob.y0 < bb.y1 && ob.y1 > bb.y0;
    });
    if (!obs.length) return null;
    var sig = [box.x, box.y, box.w, box.h, box.rot || 0].join(',') + '|' + obs.map(function (o) {
      return [o.id, o.x, o.y, o.w, o.h, o.rot || 0, o.flipH ? 1 : 0, o.flipV ? 1 : 0, o.kind || o.type, o.mask || '', o.wrap.mode, o.wrap.dist || 0, o.asset || '', canAlpha(doc, o) ? 1 : 0,
        o.crop ? [o.crop.l, o.crop.t, o.crop.r, o.crop.b].join('/') : ''].join(',');
    }).join(';');
    var hit = cache[box.id];
    if (hit && hit.sig === sig) return hit;
    var s = Math.min(1, 1400 / Math.max(box.w, box.h, 1)), W = Math.max(1, Math.ceil(box.w * s)), H = Math.max(1, Math.ceil(box.h * s));
    var profs = obs.map(function (o) { return profile(doc, box, o, s, W, H); });
    var val = {
      sig: sig,
      avail: function (colX, colY, colW, y, h) {
        var r0 = Math.max(0, Math.floor((colY + y) * s)), r1 = Math.min(H - 1, Math.ceil((colY + y + h) * s) - 1), busy = [];
        for (var i = 0; i < profs.length; i++) {
          var lo = Infinity, hi = -Infinity, p = profs[i];
          for (var r = r0; r <= r1; r++) { if (p.min[r] < lo) lo = p.min[r]; if (p.max[r] > hi) hi = p.max[r]; }
          if (hi > lo) { lo /= s; hi /= s; if (hi > colX && lo < colX + colW) busy.push([Math.max(lo, colX), Math.min(hi, colX + colW)]); }
        }
        if (!busy.length) return [{ x: 0, w: colW }];
        busy.sort(function (a, b) { return a[0] - b[0]; });
        var gaps = [], at = colX, min = OP.WRAP_MIN_SIDE;
        busy.forEach(function (b) {
          if (b[0] - at >= min) gaps.push({ x: at - colX, w: b[0] - at });
          if (b[1] > at) at = b[1];
        });
        if (colX + colW - at >= min) gaps.push({ x: at - colX, w: colX + colW - at });
        return gaps.length ? gaps : null;
      }
    };
    if (cacheN++ > 400) { cache = {}; cacheN = 0; }
    cache[box.id] = val;
    return val;
  };
})();
