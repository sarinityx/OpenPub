/* OpenPub – shape outlines. Every shape is described as an SVG path in the item's own
 * coordinate space (0,0)-(w,h); the same string feeds canvas (Path2D), SVG export and hit tests. */
var OP = (typeof globalThis.OP !== 'undefined') ? globalThis.OP : (globalThis.OP = {});

(function () {
  'use strict';

  function n(v) { return Math.round(v * 1000) / 1000; }
  function poly(pts, w, h, open) {
    var d = '';
    for (var i = 0; i < pts.length; i++) d += (i ? 'L' : 'M') + n(pts[i][0] * w) + ' ' + n(pts[i][1] * h);
    return d + (open ? '' : 'Z');
  }
  function regular(sides, startDeg) {
    var pts = [];
    for (var i = 0; i < sides; i++) {
      var a = (startDeg + i * 360 / sides) * Math.PI / 180;
      pts.push([0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]);
    }
    return pts;
  }
  function star(points, inner) {
    var pts = [];
    for (var i = 0; i < points * 2; i++) {
      var a = (-90 + i * 180 / points) * Math.PI / 180, r = (i % 2) ? 0.5 * inner : 0.5;
      pts.push([0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)]);
    }
    return pts;
  }
  var ARROW_R = [[0, 0.25], [0.6, 0.25], [0.6, 0], [1, 0.5], [0.6, 1], [0.6, 0.75], [0, 0.75]];
  function mapPts(pts, fn) { return pts.map(function (p) { return fn(p[0], p[1]); }); }

  var K = {
    rect: { label: 'Rectangle', pts: [[0, 0], [1, 0], [1, 1], [0, 1]] },
    roundrect: { label: 'Rounded rectangle' },
    ellipse: { label: 'Ellipse' },
    triangle: { label: 'Triangle', pts: [[0.5, 0], [1, 1], [0, 1]] },
    rtriangle: { label: 'Right triangle', pts: [[0, 0], [1, 1], [0, 1]] },
    diamond: { label: 'Diamond', pts: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]] },
    parallelogram: { label: 'Parallelogram', pts: [[0.25, 0], [1, 0], [0.75, 1], [0, 1]] },
    trapezoid: { label: 'Trapezoid', pts: [[0.2, 0], [0.8, 0], [1, 1], [0, 1]] },
    pentagon: { label: 'Pentagon', pts: regular(5, -90) },
    hexagon: { label: 'Hexagon', pts: [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]] },
    octagon: { label: 'Octagon', pts: [[0.29, 0], [0.71, 0], [1, 0.29], [1, 0.71], [0.71, 1], [0.29, 1], [0, 0.71], [0, 0.29]] },
    plus: { label: 'Cross', pts: [[0.33, 0], [0.67, 0], [0.67, 0.33], [1, 0.33], [1, 0.67], [0.67, 0.67], [0.67, 1], [0.33, 1], [0.33, 0.67], [0, 0.67], [0, 0.33], [0.33, 0.33]] },
    star4: { label: '4-point star', pts: star(4, 0.38) },
    star5: { label: '5-point star', pts: star(5, 0.382) },
    star6: { label: '6-point star', pts: star(6, 0.577) },
    star8: { label: '8-point star', pts: star(8, 0.72) },
    star16: { label: '16-point burst', pts: star(16, 0.8) },
    star24: { label: '24-point burst', pts: star(24, 0.85) },
    arrowR: { label: 'Arrow right', pts: ARROW_R },
    arrowL: { label: 'Arrow left', pts: mapPts(ARROW_R, function (x, y) { return [1 - x, y]; }) },
    arrowD: { label: 'Arrow down', pts: mapPts(ARROW_R, function (x, y) { return [y, x]; }) },
    arrowU: { label: 'Arrow up', pts: mapPts(ARROW_R, function (x, y) { return [y, 1 - x]; }) },
    arrowLR: { label: 'Double arrow', pts: [[0, 0.5], [0.25, 0], [0.25, 0.25], [0.75, 0.25], [0.75, 0], [1, 0.5], [0.75, 1], [0.75, 0.75], [0.25, 0.75], [0.25, 1]] },
    chevron: { label: 'Chevron', pts: [[0, 0], [0.7, 0], [1, 0.5], [0.7, 1], [0, 1], [0.3, 0.5]] },
    homeplate: { label: 'Tag', pts: [[0, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0, 1]] },
    callout: { label: 'Speech bubble', pts: [[0, 0], [1, 0], [1, 0.75], [0.45, 0.75], [0.2, 1], [0.25, 0.75], [0, 0.75]] },
    heart: { label: 'Heart' },
    line: { label: 'Line' },
    path: { label: 'Freeform' }
  };
  OP.SHAPE_KINDS = K;
  /** Kinds offered in the Insert > Shape menu, in display order. */
  OP.SHAPE_MENU = ['rect', 'roundrect', 'ellipse', 'triangle', 'rtriangle', 'diamond', 'pentagon', 'hexagon', 'octagon',
    'parallelogram', 'trapezoid', 'plus', 'star4', 'star5', 'star6', 'star8', 'star16', 'star24',
    'arrowR', 'arrowL', 'arrowU', 'arrowD', 'arrowLR', 'chevron', 'homeplate', 'callout', 'heart'];

  OP.isLine = function (it) { return it.type === 'shape' && it.kind === 'line'; };
  /** Open outlines cannot be filled. */
  OP.isOpen = function (it) { return it.type === 'shape' && (it.kind === 'line' || (it.kind === 'path' && it.path && !it.path.closed)); };

  function rectPath(w, h) { return 'M0 0H' + n(w) + 'V' + n(h) + 'H0Z'; }

  /**
   * Outline of an item as SVG path data in local coordinates.
   * @param {Object} it item (uses kind, w, h, radius, path)
   */
  OP.shapePath = function (it) {
    var w = it.w, h = it.h;
    if (it.type === 'image') return rectPath(w, h);
    var k = it.kind, def = K[k];
    if (k === 'roundrect') {
      var r = Math.max(0, Math.min(it.radius === undefined ? Math.min(w, h) * 0.167 : it.radius, w / 2, h / 2));
      if (r <= 0) return rectPath(w, h);
      return 'M' + n(r) + ' 0H' + n(w - r) + 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + n(w) + ' ' + n(r) +
        'V' + n(h - r) + 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + n(w - r) + ' ' + n(h) +
        'H' + n(r) + 'A' + n(r) + ' ' + n(r) + ' 0 0 1 0 ' + n(h - r) +
        'V' + n(r) + 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + n(r) + ' 0Z';
    }
    if (k === 'ellipse') {
      var rx = w / 2, ry = h / 2;
      return 'M0 ' + n(ry) + 'A' + n(rx) + ' ' + n(ry) + ' 0 1 1 ' + n(w) + ' ' + n(ry) +
        'A' + n(rx) + ' ' + n(ry) + ' 0 1 1 0 ' + n(ry) + 'Z';
    }
    if (k === 'heart') {
      var X = function (v) { return n(v * w); }, Y = function (v) { return n(v * h); };
      return 'M' + X(0.5) + ' ' + Y(1) +
        'C' + X(0.1) + ' ' + Y(0.7) + ' ' + X(0) + ' ' + Y(0.45) + ' ' + X(0) + ' ' + Y(0.28) +
        'C' + X(0) + ' ' + Y(0.1) + ' ' + X(0.13) + ' ' + Y(0) + ' ' + X(0.27) + ' ' + Y(0) +
        'C' + X(0.38) + ' ' + Y(0) + ' ' + X(0.46) + ' ' + Y(0.07) + ' ' + X(0.5) + ' ' + Y(0.18) +
        'C' + X(0.54) + ' ' + Y(0.07) + ' ' + X(0.62) + ' ' + Y(0) + ' ' + X(0.73) + ' ' + Y(0) +
        'C' + X(0.87) + ' ' + Y(0) + ' ' + X(1) + ' ' + Y(0.1) + ' ' + X(1) + ' ' + Y(0.28) +
        'C' + X(1) + ' ' + Y(0.45) + ' ' + X(0.9) + ' ' + Y(0.7) + ' ' + X(0.5) + ' ' + Y(1) + 'Z';
    }
    if (k === 'line') return 'M0 0L' + n(w) + ' ' + n(h);
    if (k === 'path' && it.path && it.path.cmds) {
      var d = '';
      it.path.cmds.forEach(function (c) {
        if (c[0] === 'Z') { d += 'Z'; return; }
        d += c[0];
        for (var i = 1; i < c.length; i += 2) d += (i > 1 ? ' ' : '') + n(c[i] * w) + ' ' + n(c[i + 1] * h);
      });
      return d || rectPath(w, h);
    }
    if (def && def.pts) return poly(def.pts, w, h, false);
    return rectPath(w, h);
  };

  /** Arrowhead triangles for a line item, as path data (filled with the stroke colour). */
  OP.arrowPath = function (it) {
    if (!OP.isLine(it) || !it.stroke || (!it.arrowStart && !it.arrowEnd)) return '';
    var len = Math.sqrt(it.w * it.w + it.h * it.h);
    if (len < 0.01) return '';
    var ux = it.w / len, uy = it.h / len;
    var s = Math.max(6, it.stroke.width * 4), half = s * 0.4, d = '';
    function head(tx, ty, dx, dy) {
      var bx = tx - dx * s, by = ty - dy * s;
      d += 'M' + n(tx) + ' ' + n(ty) + 'L' + n(bx - dy * half) + ' ' + n(by + dx * half) + 'L' + n(bx + dy * half) + ' ' + n(by - dx * half) + 'Z';
    }
    if (it.arrowEnd) head(it.w, it.h, ux, uy);
    if (it.arrowStart) head(0, 0, -ux, -uy);
    return d;
  };

  OP.dashArray = function (stroke) {
    var w = Math.max(stroke.width, 0.5);
    switch (stroke.dash) {
      case 'dash': return [w * 4, w * 3];
      case 'dot': return [w, w * 2];
      case 'dashdot': return [w * 4, w * 2, w, w * 2];
      case 'longdash': return [w * 8, w * 3];
    }
    return [];
  };

  // ---- geometry helpers used by the editor
  OP.rotatePoint = function (x, y, cx, cy, deg) {
    var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return { x: cx + (x - cx) * c - (y - cy) * s, y: cy + (x - cx) * s + (y - cy) * c };
  };
  /** Four corners of an item in page space (tl, tr, br, bl). */
  OP.itemCorners = function (it) {
    var cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    return [[it.x, it.y], [it.x + it.w, it.y], [it.x + it.w, it.y + it.h], [it.x, it.y + it.h]].map(function (p) {
      return OP.rotatePoint(p[0], p[1], cx, cy, it.rot || 0);
    });
  };
  /** Axis-aligned bounds of one or more items. */
  OP.boundsOf = function (items) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    items.forEach(function (it) {
      OP.itemCorners(it).forEach(function (p) {
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
      });
    });
    if (!isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0 };
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  /** Page point -> item-local point (undoing rotation, not flips). */
  OP.toLocal = function (it, px, py) {
    var cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    var p = OP.rotatePoint(px, py, cx, cy, -(it.rot || 0));
    return { x: p.x - it.x, y: p.y - it.y };
  };
  OP.hitItem = function (it, px, py, tol) {
    var p = OP.toLocal(it, px, py);
    if (OP.isLine(it)) {
      var ax = it.flipH ? it.w : 0, ay = it.flipV ? it.h : 0, bx = it.flipH ? 0 : it.w, by = it.flipV ? 0 : it.h;
      var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      var t = l2 ? Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / l2)) : 0;
      var qx = ax + t * dx - p.x, qy = ay + t * dy - p.y;
      return Math.sqrt(qx * qx + qy * qy) <= tol + (it.stroke ? it.stroke.width / 2 : 0);
    }
    return p.x >= -tol && p.y >= -tol && p.x <= it.w + tol && p.y <= it.h + tol;
  };
})();
