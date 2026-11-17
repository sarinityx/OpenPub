/* OpenPub – Windows Metafile (WMF) to SVG converter, written from scratch.
 * Publisher clip art is usually stored as WMF, which browsers cannot display. This turns the
 * drawing records into SVG so the artwork stays vector. Covers the records clip art actually
 * uses (polygons, lines, rectangles, ellipses, arcs, text, embedded bitmaps); clipping regions,
 * raster operations and pattern brushes are ignored. */
var OP = (typeof globalThis.OP !== 'undefined') ? globalThis.OP : (globalThis.OP = {});

(function () {
  'use strict';

  function hex2(n) { return (n < 16 ? '0' : '') + n.toString(16); }
  function colorRef(v) { return '#' + hex2(v & 0xFF) + hex2((v >>> 8) & 0xFF) + hex2((v >>> 16) & 0xFF); }
  function f(v) { return Math.round(v * 100) / 100; }

  /**
   * @param {Uint8Array} bytes raw WMF (with or without the placeable header)
   * @returns {{svg:string, w:number, h:number}|null}
   */
  OP.wmfToSvg = function (bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var p = 0, n = bytes.length;
    var placeable = null;
    if (n >= 22 && dv.getUint32(0, true) === 0x9AC6CDD7) {
      placeable = { l: dv.getInt16(6, true), t: dv.getInt16(8, true), r: dv.getInt16(10, true), b: dv.getInt16(12, true) };
      p = 22;
    }
    if (p + 18 > n) return null;
    var hdrWords = dv.getUint16(p + 2, true);
    if (hdrWords !== 9) return null;
    p += 18;

    // ---- device context state
    var dc = {
      org: { x: 0, y: 0 }, ext: { x: 0, y: 0 }, pen: { color: '#000000', width: 0, on: true },
      brush: { color: '#ffffff', on: true }, font: { size: 12, face: 'Arial', bold: false, italic: false, underline: false, esc: 0 },
      textColor: '#000000', textAlign: 0, polyFill: 1, cur: { x: 0, y: 0 }
    };
    var stack = [], objects = [];
    var ops = []; // deferred output so that the window is known before coordinates are emitted
    var bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    var firstWin = null;

    function addObject(o) {
      for (var i = 0; i < objects.length; i++) if (!objects[i]) { objects[i] = o; return; }
      objects.push(o);
    }
    function snap() {
      return { org: { x: dc.org.x, y: dc.org.y }, ext: { x: dc.ext.x, y: dc.ext.y } };
    }
    function note(x, y) {
      if (x < bounds.x0) bounds.x0 = x; if (x > bounds.x1) bounds.x1 = x;
      if (y < bounds.y0) bounds.y0 = y; if (y > bounds.y1) bounds.y1 = y;
    }
    function style(fill, stroke) {
      return {
        fill: fill && dc.brush.on ? dc.brush.color : null,
        stroke: stroke && dc.pen.on ? dc.pen.color : null,
        sw: dc.pen.width, rule: dc.polyFill === 1 ? 'evenodd' : 'nonzero'
      };
    }
    function i16(o) { return dv.getInt16(o, true); }
    function u16(o) { return dv.getUint16(o, true); }

    function readPts(o, cnt) {
      var pts = [];
      for (var i = 0; i < cnt; i++) { var x = i16(o + i * 4), y = i16(o + i * 4 + 2); pts.push([x, y]); note(x, y); }
      return pts;
    }
    function dibUrl(o, end) {
      if (o + 40 > end) return null;
      var dib = bytes.subarray(o, end);
      var hs = dv.getUint32(o, true), bpp = dv.getUint16(o + 14, true), colors = dv.getUint32(o + 32, true);
      if (hs < 12 || hs > 124) return null;
      if (colors === 0 && bpp <= 8) colors = 1 << bpp;
      var out = new Uint8Array(dib.length + 14), ov = new DataView(out.buffer);
      out[0] = 0x42; out[1] = 0x4D;
      ov.setUint32(2, out.length, true);
      ov.setUint32(10, 14 + hs + 4 * colors, true);
      out.set(dib, 14);
      return OP.bytesToDataUrl(out, 'image/bmp');
    }

    var guard = 0;
    while (p + 6 <= n && guard++ < 500000) {
      var size = dv.getUint32(p, true) * 2, fn = u16(p + 4), a = p + 6, end = Math.min(p + size, n);
      if (size < 6) break;
      if (fn === 0) break;
      var s, pts, cnt, i, o;
      switch (fn) {
        case 0x020B: dc.org = { x: i16(a + 2), y: i16(a) }; break;
        case 0x020C:
          dc.ext = { x: i16(a + 2), y: i16(a) };
          if (!firstWin && dc.ext.x && dc.ext.y) firstWin = snap();
          break;
        case 0x0410: // ScaleWindowExt: yDenom, yNum, xDenom, xNum
          if (i16(a + 4) && i16(a)) { dc.ext = { x: dc.ext.x * i16(a + 6) / i16(a + 4), y: dc.ext.y * i16(a + 2) / i16(a) }; }
          break;
        case 0x001E: stack.push(JSON.stringify(dc)); break;
        case 0x0127: if (stack.length) dc = JSON.parse(stack.pop()); break;
        case 0x0106: dc.polyFill = u16(a); break;
        case 0x0209: dc.textColor = colorRef(dv.getUint32(a, true)); break;
        case 0x012E: dc.textAlign = u16(a); break;
        case 0x02FA: // CreatePenIndirect
          s = u16(a) & 0xF;
          addObject({ t: 'pen', on: s !== 5, width: Math.abs(i16(a + 2)), color: colorRef(dv.getUint32(a + 6, true)) });
          break;
        case 0x02FC: // CreateBrushIndirect
          addObject({ t: 'brush', on: u16(a) !== 1, color: colorRef(dv.getUint32(a + 2, true)) });
          break;
        case 0x02FB: // CreateFontIndirect
          var face = '';
          for (i = a + 18; i < Math.min(a + 50, end) && bytes[i]; i++) face += String.fromCharCode(bytes[i]);
          addObject({ t: 'font', size: Math.abs(i16(a)) || 12, esc: i16(a + 4), bold: i16(a + 8) >= 600, italic: !!bytes[a + 10], underline: !!bytes[a + 11], face: face || 'Arial' });
          break;
        case 0x00F7: case 0x0142: case 0x01F9: case 0x06FF: case 0x02FD: case 0x02FE:
          addObject({ t: 'other' }); // palettes, pattern brushes, regions: keep the slot numbering right
          break;
        case 0x012D:
          o = objects[u16(a)];
          if (o && o.t === 'pen') dc.pen = { color: o.color, width: o.width, on: o.on };
          else if (o && o.t === 'brush') dc.brush = { color: o.color, on: o.on };
          else if (o && o.t === 'font') dc.font = { size: o.size, face: o.face, bold: o.bold, italic: o.italic, underline: o.underline, esc: o.esc };
          break;
        case 0x01F0: if (u16(a) < objects.length) objects[u16(a)] = null; break;
        case 0x0324: case 0x0325: // Polygon / Polyline
          cnt = u16(a);
          if (a + 2 + cnt * 4 > end) break;
          pts = readPts(a + 2, cnt);
          ops.push({ k: 'poly', polys: [pts], close: fn === 0x0324, st: style(fn === 0x0324, true), w: snap() });
          break;
        case 0x0538: // PolyPolygon
          cnt = u16(a);
          var counts = [], total = 0;
          for (i = 0; i < cnt; i++) { counts.push(u16(a + 2 + i * 2)); total += counts[i]; }
          o = a + 2 + cnt * 2;
          if (o + total * 4 > end) break;
          var polys = [];
          for (i = 0; i < cnt; i++) { polys.push(readPts(o, counts[i])); o += counts[i] * 4; }
          ops.push({ k: 'poly', polys: polys, close: true, st: style(true, true), w: snap() });
          break;
        case 0x041B: case 0x0418: // Rectangle / Ellipse: bottom, right, top, left
          var b = i16(a), r = i16(a + 2), t = i16(a + 4), l = i16(a + 6);
          note(l, t); note(r, b);
          ops.push({ k: fn === 0x041B ? 'rect' : 'ellipse', l: l, t: t, r: r, b: b, st: style(true, true), w: snap() });
          break;
        case 0x061C: // RoundRect: h, w, bottom, right, top, left
          note(i16(a + 10), i16(a + 8)); note(i16(a + 6), i16(a + 4));
          ops.push({ k: 'rect', l: i16(a + 10), t: i16(a + 8), r: i16(a + 6), b: i16(a + 4), rx: i16(a + 2) / 2, ry: i16(a) / 2, st: style(true, true), w: snap() });
          break;
        case 0x0214: dc.cur = { x: i16(a + 2), y: i16(a) }; break;
        case 0x0213:
          pts = [[dc.cur.x, dc.cur.y], [i16(a + 2), i16(a)]];
          note(pts[0][0], pts[0][1]); note(pts[1][0], pts[1][1]);
          ops.push({ k: 'poly', polys: [pts], close: false, st: style(false, true), w: snap() });
          dc.cur = { x: pts[1][0], y: pts[1][1] };
          break;
        case 0x0817: case 0x081A: case 0x0830: // Arc / Pie / Chord
          note(i16(a + 14), i16(a + 12)); note(i16(a + 10), i16(a + 8));
          ops.push({ k: 'arc', mode: fn, ye: i16(a), xe: i16(a + 2), ys: i16(a + 4), xs: i16(a + 6), b: i16(a + 8), r: i16(a + 10), t: i16(a + 12), l: i16(a + 14), st: style(fn !== 0x0817, true), w: snap() });
          break;
        case 0x0A32: case 0x0521: // ExtTextOut / TextOut
          var x, y, str = '', so;
          if (fn === 0x0A32) {
            y = i16(a); x = i16(a + 2); cnt = u16(a + 4);
            so = a + 8 + ((u16(a + 6) & 6) ? 8 : 0);
          } else {
            cnt = u16(a); so = a + 2;
            var after = so + cnt + (cnt & 1);
            if (after + 4 > end) break;
            y = i16(after); x = i16(after + 2);
          }
          for (i = 0; i < cnt && so + i < end; i++) str += String.fromCharCode(bytes[so + i]);
          if (str.trim().length) {
            note(x, y);
            ops.push({ k: 'text', x: x, y: y, str: str, font: JSON.parse(JSON.stringify(dc.font)), color: dc.textColor, align: dc.textAlign, w: snap() });
          }
          break;
        case 0x0F43: case 0x0B41: // StretchDIBits / DibStretchBlt
          o = fn === 0x0F43 ? a + 6 : a + 4;
          if (o + 16 > end) break;
          var dh = i16(o + 8), dw = i16(o + 10), dy = i16(o + 12), dx = i16(o + 14);
          var url = dibUrl(o + 16, end);
          if (url) {
            note(dx, dy); note(dx + dw, dy + dh);
            ops.push({ k: 'img', x: dx, y: dy, wd: dw, ht: dh, url: url, w: snap() });
          }
          break;
      }
      p += size;
    }
    if (!ops.length) return null;

    // ---- choose the picture frame
    var frame;
    if (firstWin) frame = { x: firstWin.org.x, y: firstWin.org.y, w: firstWin.ext.x, h: firstWin.ext.y };
    else if (placeable) frame = { x: placeable.l, y: placeable.t, w: placeable.r - placeable.l, h: placeable.b - placeable.t };
    else frame = { x: bounds.x0, y: bounds.y0, w: bounds.x1 - bounds.x0, h: bounds.y1 - bounds.y0 };
    if (!frame.w || !frame.h) return null;
    var VW = Math.abs(frame.w), VH = Math.abs(frame.h);
    var k = 1000 / Math.max(VW, VH);
    VW *= k; VH *= k;

    function mapper(w) {
      var ex = w.ext.x || frame.w, ey = w.ext.y || frame.h;
      var ox = (w.ext.x ? w.org.x : frame.x), oy = (w.ext.y ? w.org.y : frame.y);
      var sx = VW / ex, sy = VH / ey;
      return {
        x: function (v) { return f((v - ox) * sx); },
        y: function (v) { return f((v - oy) * sy); },
        s: Math.sqrt(Math.abs(sx * sy)), sx: Math.abs(sx), sy: Math.abs(sy)
      };
    }
    function paint(st, m) {
      var s = ' fill="' + (st.fill || 'none') + '"';
      if (st.fill && st.rule === 'evenodd') s += ' fill-rule="evenodd"';
      if (st.stroke) s += ' stroke="' + st.stroke + '" stroke-width="' + f(Math.max(st.sw * m.s, VW / 1500)) + '" stroke-linejoin="round"';
      return s;
    }

    var out = [];
    ops.forEach(function (op) {
      var m = mapper(op.w), d, i, j;
      if (op.k === 'poly') {
        if (!op.st.fill && !op.st.stroke) return;
        d = '';
        for (i = 0; i < op.polys.length; i++) {
          var pts = op.polys[i];
          for (j = 0; j < pts.length; j++) d += (j ? 'L' : 'M') + m.x(pts[j][0]) + ' ' + m.y(pts[j][1]);
          if (op.close) d += 'Z';
        }
        out.push('<path d="' + d + '"' + paint(op.st, m) + '/>');
      } else if (op.k === 'rect') {
        var x0 = Math.min(m.x(op.l), m.x(op.r)), y0 = Math.min(m.y(op.t), m.y(op.b));
        out.push('<rect x="' + x0 + '" y="' + y0 + '" width="' + f(Math.abs(m.x(op.r) - m.x(op.l))) + '" height="' + f(Math.abs(m.y(op.b) - m.y(op.t))) + '"' +
          (op.rx ? ' rx="' + f(Math.abs(op.rx) * m.sx) + '" ry="' + f(Math.abs(op.ry) * m.sy) + '"' : '') + paint(op.st, m) + '/>');
      } else if (op.k === 'ellipse') {
        out.push('<ellipse cx="' + f((m.x(op.l) + m.x(op.r)) / 2) + '" cy="' + f((m.y(op.t) + m.y(op.b)) / 2) + '" rx="' + f(Math.abs(m.x(op.r) - m.x(op.l)) / 2) +
          '" ry="' + f(Math.abs(m.y(op.b) - m.y(op.t)) / 2) + '"' + paint(op.st, m) + '/>');
      } else if (op.k === 'arc') {
        var cx = (m.x(op.l) + m.x(op.r)) / 2, cy = (m.y(op.t) + m.y(op.b)) / 2;
        var rx = Math.abs(m.x(op.r) - m.x(op.l)) / 2, ry = Math.abs(m.y(op.b) - m.y(op.t)) / 2;
        if (!rx || !ry) return;
        var a0 = Math.atan2((m.y(op.ys) - cy) / ry, (m.x(op.xs) - cx) / rx), a1 = Math.atan2((m.y(op.ye) - cy) / ry, (m.x(op.xe) - cx) / rx);
        // GDI arcs run counter-clockwise on screen from start to end
        var sweep = a0 - a1; while (sweep <= 0) sweep += Math.PI * 2;
        var p0 = [cx + rx * Math.cos(a0), cy + ry * Math.sin(a0)], p1 = [cx + rx * Math.cos(a1), cy + ry * Math.sin(a1)];
        d = 'M' + f(p0[0]) + ' ' + f(p0[1]) + 'A' + f(rx) + ' ' + f(ry) + ' 0 ' + (sweep > Math.PI ? 1 : 0) + ' 0 ' + f(p1[0]) + ' ' + f(p1[1]);
        if (op.mode === 0x081A) d += 'L' + f(cx) + ' ' + f(cy) + 'Z';
        else if (op.mode === 0x0830) d += 'Z';
        out.push('<path d="' + d + '"' + paint(op.st, m) + '/>');
      } else if (op.k === 'text') {
        var fs = Math.max(1, op.font.size * m.sy);
        var anchor = (op.align & 6) === 6 ? 'middle' : (op.align & 2) ? 'end' : 'start';
        var base = (op.align & 24) === 24 ? 0 : (op.align & 8) ? -fs * 0.2 : fs * 0.85;
        var tx = m.x(op.x), ty = m.y(op.y);
        out.push('<text x="' + tx + '" y="' + f(ty + base) + '" font-family="' + OP.escXml(op.font.face) + ', sans-serif" font-size="' + f(fs) + '"' +
          (op.font.bold ? ' font-weight="bold"' : '') + (op.font.italic ? ' font-style="italic"' : '') + ' text-anchor="' + anchor + '" fill="' + op.color + '"' +
          (op.font.esc ? ' transform="rotate(' + f(-op.font.esc / 10) + ' ' + tx + ' ' + ty + ')"' : '') + ' xml:space="preserve">' + OP.escXml(op.str) + '</text>');
      } else if (op.k === 'img') {
        var ix = Math.min(m.x(op.x), m.x(op.x + op.wd)), iy = Math.min(m.y(op.y), m.y(op.y + op.ht));
        out.push('<image x="' + ix + '" y="' + iy + '" width="' + f(Math.abs(m.x(op.x + op.wd) - m.x(op.x))) + '" height="' + f(Math.abs(m.y(op.y + op.ht) - m.y(op.y))) +
          '" preserveAspectRatio="none" href="' + op.url + '"/>');
      }
    });
    if (!out.length) return null;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + f(VW) + '" height="' + f(VH) + '" viewBox="0 0 ' + f(VW) + ' ' + f(VH) +
      '" preserveAspectRatio="none">' + out.join('') + '</svg>';
    return { svg: svg, w: f(VW), h: f(VH) };
  };
})();
