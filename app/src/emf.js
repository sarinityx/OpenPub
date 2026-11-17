/* OpenPub – Enhanced Metafile (EMF) to SVG converter, written from scratch.
 * Covers the drawing records Office artwork uses: polygons, polylines, béziers, paths, rectangles,
 * ellipses, arcs, text and embedded bitmaps, with world transforms. Clipping, raster operations,
 * hatch brushes and EMF+ only files are not handled (EMF+ "dual" files work through their GDI records). */
var OP = (typeof globalThis.OP !== 'undefined') ? globalThis.OP : (globalThis.OP = {});

(function () {
  'use strict';
  function hex2(n) { return (n < 16 ? '0' : '') + n.toString(16); }
  function colorRef(v) { return '#' + hex2(v & 0xFF) + hex2((v >>> 8) & 0xFF) + hex2((v >>> 16) & 0xFF); }
  function f(v) { return Math.round(v * 100) / 100; }
  var STOCK = {
    0: { t: 'brush', color: '#ffffff', on: true }, 1: { t: 'brush', color: '#c0c0c0', on: true }, 2: { t: 'brush', color: '#808080', on: true },
    3: { t: 'brush', color: '#404040', on: true }, 4: { t: 'brush', color: '#000000', on: true }, 5: { t: 'brush', color: '#000000', on: false },
    6: { t: 'pen', color: '#ffffff', width: 0, on: true }, 7: { t: 'pen', color: '#000000', width: 0, on: true }, 8: { t: 'pen', color: '#000000', width: 0, on: false }
  };

  /**
   * @param {Uint8Array} bytes raw EMF
   * @returns {{svg:string, w:number, h:number}|null} size in points
   */
  OP.emfToSvg = function (bytes) {
    var n = bytes.length;
    if (n < 88) return null;
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (dv.getUint32(0, true) !== 1 || dv.getUint32(40, true) !== 0x464D4520) return null; // EMR_HEADER, " EMF"
    function i32(o) { return dv.getInt32(o, true); }
    function u32(o) { return dv.getUint32(o, true); }
    function i16(o) { return dv.getInt16(o, true); }
    function f32(o) { return dv.getFloat32(o, true); }
    var bounds = { l: i32(8), t: i32(12), r: i32(16), b: i32(20) };
    var frame = { l: i32(24), t: i32(28), r: i32(32), b: i32(36) }; // 0.01 mm
    var szDev = { x: i32(72) || 1, y: i32(76) || 1 }, szMm = { x: i32(80) || 1, y: i32(84) || 1 };
    var fw = frame.r - frame.l, fh = frame.b - frame.t;
    if (fw <= 0 || fh <= 0) return null;
    // the frame, expressed in device units, is the picture's box
    var vb = { x: frame.l / 100 * szDev.x / szMm.x, y: frame.t / 100 * szDev.y / szMm.y, w: fw / 100 * szDev.x / szMm.x, h: fh / 100 * szDev.y / szMm.y };
    if (!(vb.w > 0) || !(vb.h > 0)) vb = { x: bounds.l, y: bounds.t, w: Math.max(1, bounds.r - bounds.l), h: Math.max(1, bounds.b - bounds.t) };

    var dc = {
      wOrg: { x: 0, y: 0 }, wExt: { x: 1, y: 1 }, vOrg: { x: 0, y: 0 }, vExt: { x: 1, y: 1 }, mapMode: 1,
      xf: [1, 0, 0, 1, 0, 0], pen: { color: '#000000', width: 0, on: true, dash: 0 }, brush: { color: '#ffffff', on: true },
      font: { size: 12, face: 'Arial', bold: false, italic: false, esc: 0 }, textColor: '#000000', textAlign: 0, polyFill: 1,
      cur: { x: 0, y: 0 }, miter: 10
    };
    var stack = [], objects = {}, out = [], path = null, inPath = false;

    function mul(m, k) { // k applied first, then m
      return [k[0] * m[0] + k[1] * m[2], k[0] * m[1] + k[1] * m[3], k[2] * m[0] + k[3] * m[2], k[2] * m[1] + k[3] * m[3], k[4] * m[0] + k[5] * m[2] + m[4], k[4] * m[1] + k[5] * m[3] + m[5]];
    }
    function mapScale() {
      if (dc.mapMode === 7 || dc.mapMode === 8) return { x: dc.vExt.x / (dc.wExt.x || 1), y: dc.vExt.y / (dc.wExt.y || 1) };
      return { x: 1, y: 1 };
    }
    function P(x, y) {
      var m = dc.xf, wx = x * m[0] + y * m[2] + m[4], wy = x * m[1] + y * m[3] + m[5], s = mapScale();
      return [f((wx - dc.wOrg.x) * s.x + dc.vOrg.x), f((wy - dc.wOrg.y) * s.y + dc.vOrg.y)];
    }
    function scale() {
      var m = dc.xf, s = mapScale();
      return Math.sqrt(Math.abs((m[0] * m[3] - m[1] * m[2]) * s.x * s.y)) || 1;
    }
    function paint(fill, stroke) {
      var a = ' fill="' + (fill && dc.brush.on ? dc.brush.color : 'none') + '"';
      if (fill && dc.brush.on && dc.polyFill === 1) a += ' fill-rule="evenodd"';
      if (stroke && dc.pen.on) {
        var w = Math.max(dc.pen.width * scale(), 0.75);
        a += ' stroke="' + dc.pen.color + '" stroke-width="' + f(w) + '" stroke-linejoin="round" stroke-linecap="round"';
        if (dc.pen.dash === 1) a += ' stroke-dasharray="' + f(w * 4) + ' ' + f(w * 3) + '"';
        else if (dc.pen.dash === 2) a += ' stroke-dasharray="' + f(w) + ' ' + f(w * 2) + '"';
      }
      return a;
    }
    function emit(d, fill, stroke) {
      if (!d) return;
      if (inPath) { path += d; return; }
      if ((fill && dc.brush.on) || (stroke && dc.pen.on)) out.push('<path d="' + d + '"' + paint(fill, stroke) + '/>');
    }
    function pts(o, cnt, small) {
      var a = [], step = small ? 4 : 8;
      for (var i = 0; i < cnt; i++) a.push(small ? P(i16(o + i * step), i16(o + i * step + 2)) : P(i32(o + i * step), i32(o + i * step + 4)));
      return a;
    }
    function polyD(a, close, start) {
      if (!a.length) return '';
      var d = (start ? 'M' + a[0][0] + ' ' + a[0][1] : 'L' + a[0][0] + ' ' + a[0][1]);
      for (var i = 1; i < a.length; i++) d += 'L' + a[i][0] + ' ' + a[i][1];
      return d + (close ? 'Z' : '');
    }
    function bezD(a, from) {
      var d = '';
      for (var i = from; i + 2 < a.length; i += 3) d += 'C' + a[i][0] + ' ' + a[i][1] + ' ' + a[i + 1][0] + ' ' + a[i + 1][1] + ' ' + a[i + 2][0] + ' ' + a[i + 2][1];
      return d;
    }
    function curD() { var c = P(dc.cur.x, dc.cur.y); return 'M' + c[0] + ' ' + c[1]; }
    function ellipseD(l, t, r, b) {
      var cx = (l + r) / 2, cy = (t + b) / 2, rx = (r - l) / 2, ry = (b - t) / 2, k = 0.5522848;
      var p = function (x, y) { var q = P(x, y); return q[0] + ' ' + q[1]; };
      return 'M' + p(cx + rx, cy) + 'C' + p(cx + rx, cy + ry * k) + ' ' + p(cx + rx * k, cy + ry) + ' ' + p(cx, cy + ry) +
        'C' + p(cx - rx * k, cy + ry) + ' ' + p(cx - rx, cy + ry * k) + ' ' + p(cx - rx, cy) +
        'C' + p(cx - rx, cy - ry * k) + ' ' + p(cx - rx * k, cy - ry) + ' ' + p(cx, cy - ry) +
        'C' + p(cx + rx * k, cy - ry) + ' ' + p(cx + rx, cy - ry * k) + ' ' + p(cx + rx, cy) + 'Z';
    }
    function arcD(o, mode) { // 45 arc, 46 chord, 47 pie, 55 arcto
      var l = i32(o + 8), t = i32(o + 12), r = i32(o + 16), b = i32(o + 20);
      var c = P((l + r) / 2, (t + b) / 2), e0 = P(l, t), e1 = P(r, b), s = P(i32(o + 24), i32(o + 28)), e = P(i32(o + 32), i32(o + 36));
      var rx = Math.abs(e1[0] - e0[0]) / 2, ry = Math.abs(e1[1] - e0[1]) / 2;
      if (!rx || !ry) return '';
      var a0 = Math.atan2((s[1] - c[1]) / ry, (s[0] - c[0]) / rx), a1 = Math.atan2((e[1] - c[1]) / ry, (e[0] - c[0]) / rx);
      var sweep = a0 - a1; while (sweep <= 0) sweep += Math.PI * 2; // counter-clockwise on screen
      var p0 = [f(c[0] + rx * Math.cos(a0)), f(c[1] + ry * Math.sin(a0))], p1 = [f(c[0] + rx * Math.cos(a1)), f(c[1] + ry * Math.sin(a1))];
      var d = (mode === 55 ? 'L' : 'M') + p0[0] + ' ' + p0[1] + 'A' + f(rx) + ' ' + f(ry) + ' 0 ' + (sweep > Math.PI ? 1 : 0) + ' 0 ' + p1[0] + ' ' + p1[1];
      if (mode === 47) d += 'L' + c[0] + ' ' + c[1] + 'Z';
      else if (mode === 46) d += 'Z';
      return d;
    }
    function bmpUrl(o, offBmi, cbBmi, offBits, cbBits, end) {
      if (!cbBmi || !cbBits || o + offBmi + cbBmi > end || o + offBits + cbBits > end) return null;
      var total = 14 + cbBmi + cbBits, b = new Uint8Array(total), v = new DataView(b.buffer);
      b[0] = 0x42; b[1] = 0x4D; v.setUint32(2, total, true); v.setUint32(10, 14 + cbBmi, true);
      b.set(bytes.subarray(o + offBmi, o + offBmi + cbBmi), 14);
      b.set(bytes.subarray(o + offBits, o + offBits + cbBits), 14 + cbBmi);
      return OP.bytesToDataUrl(b, 'image/bmp');
    }
    function utf16(o, cnt) {
      var s = '';
      for (var i = 0; i < cnt; i++) { var c = dv.getUint16(o + i * 2, true); if (!c) break; s += String.fromCharCode(c); }
      return s;
    }

    var p = 0, guard = 0;
    while (p + 8 <= n && guard++ < 400000) {
      var type = u32(p), size = u32(p + 4), end = p + size, cnt, a, d, i, o;
      if (size < 8 || end > n) break;
      switch (type) {
        case 9: dc.wExt = { x: i32(p + 8) || 1, y: i32(p + 12) || 1 }; break;
        case 10: dc.wOrg = { x: i32(p + 8), y: i32(p + 12) }; break;
        case 11: dc.vExt = { x: i32(p + 8) || 1, y: i32(p + 12) || 1 }; break;
        case 12: dc.vOrg = { x: i32(p + 8), y: i32(p + 12) }; break;
        case 17: dc.mapMode = u32(p + 8); break;
        case 19: dc.polyFill = u32(p + 8); break;
        case 22: dc.textAlign = u32(p + 8); break;
        case 24: dc.textColor = colorRef(u32(p + 8)); break;
        case 58: dc.miter = f32(p + 8); break;
        case 27: dc.cur = { x: i32(p + 8), y: i32(p + 12) }; if (inPath) path += curD(); break;
        case 33: stack.push(JSON.stringify(dc)); break;
        case 34: { var rel = i32(p + 8), st = null; for (i = 0; i < Math.max(1, -rel) && stack.length; i++) st = stack.pop(); if (st) dc = JSON.parse(st); break; }
        case 35: dc.xf = [f32(p + 8), f32(p + 12), f32(p + 16), f32(p + 20), f32(p + 24), f32(p + 28)]; break;
        case 36: {
          var m = [f32(p + 8), f32(p + 12), f32(p + 16), f32(p + 20), f32(p + 24), f32(p + 28)], mode = u32(p + 32);
          if (mode === 1) dc.xf = [1, 0, 0, 1, 0, 0];
          else if (mode === 2) dc.xf = mul(dc.xf, m);
          else if (mode === 3) dc.xf = mul(m, dc.xf);
          else if (mode === 4) dc.xf = m;
          break;
        }
        case 37: {
          var ih = u32(p + 8), ob = (ih & 0x80000000) ? STOCK[ih & 0x7FFFFFFF] : objects[ih];
          if (ob && ob.t === 'pen') dc.pen = { color: ob.color, width: ob.width, on: ob.on, dash: ob.dash || 0 };
          else if (ob && ob.t === 'brush') dc.brush = { color: ob.color, on: ob.on };
          else if (ob && ob.t === 'font') dc.font = ob.font;
          break;
        }
        case 38: { var ps = u32(p + 12); objects[u32(p + 8)] = { t: 'pen', color: colorRef(u32(p + 24)), width: Math.abs(i32(p + 16)), on: (ps & 0xF) !== 5, dash: (ps & 0xF) === 1 ? 1 : ((ps & 0xF) >= 2 && (ps & 0xF) <= 4) ? 2 : 0 }; break; }
        case 95: { var es = u32(p + 28); objects[u32(p + 8)] = { t: 'pen', color: colorRef(u32(p + 40)), width: u32(p + 32), on: (es & 0xF) !== 5, dash: (es & 0xF) === 1 ? 1 : ((es & 0xF) >= 2 && (es & 0xF) <= 4) ? 2 : 0 }; break; }
        case 39: objects[u32(p + 8)] = { t: 'brush', color: colorRef(u32(p + 16)), on: u32(p + 12) !== 1 }; break;
        case 82: {
          var hgt = i32(p + 12);
          objects[u32(p + 8)] = { t: 'font', font: { size: Math.abs(hgt) || 12, face: utf16(p + 40, 32) || 'Arial', bold: i32(p + 28) >= 600, italic: !!bytes[p + 32], esc: i32(p + 20) } };
          break;
        }
        case 40: delete objects[u32(p + 8)]; break;
        case 42: emit(ellipseD(i32(p + 8), i32(p + 12), i32(p + 16), i32(p + 20)), true, true); break;
        case 43: a = [P(i32(p + 8), i32(p + 12)), P(i32(p + 16), i32(p + 12)), P(i32(p + 16), i32(p + 20)), P(i32(p + 8), i32(p + 20))]; emit(polyD(a, true, true), true, true); break;
        case 44: a = [P(i32(p + 8), i32(p + 12)), P(i32(p + 16), i32(p + 12)), P(i32(p + 16), i32(p + 20)), P(i32(p + 8), i32(p + 20))]; emit(polyD(a, true, true), true, true); break;
        case 45: emit(arcD(p, 45), false, true); break;
        case 46: emit(arcD(p, 46), true, true); break;
        case 47: emit(arcD(p, 47), true, true); break;
        case 55: d = arcD(p, 55); if (inPath) path += d; else emit(curD() + d, false, true); dc.cur = { x: i32(p + 32), y: i32(p + 36) }; break;
        case 54: {
          var to = { x: i32(p + 8), y: i32(p + 12) }, q = P(to.x, to.y);
          if (inPath) path += 'L' + q[0] + ' ' + q[1];
          else emit(curD() + 'L' + q[0] + ' ' + q[1], false, true);
          dc.cur = to;
          break;
        }
        case 3: case 86: cnt = u32(p + 24); emit(polyD(pts(p + 28, cnt, type === 86), true, true), true, true); break;
        case 4: case 87: cnt = u32(p + 24); emit(polyD(pts(p + 28, cnt, type === 87), false, true), false, true); break;
        case 2: case 85: cnt = u32(p + 24); a = pts(p + 28, cnt, type === 85); if (a.length) emit('M' + a[0][0] + ' ' + a[0][1] + bezD(a, 1), false, true); break;
        case 5: case 88: {
          cnt = u32(p + 24); a = pts(p + 28, cnt, type === 88); d = bezD(a, 0);
          if (inPath) path += d; else emit(curD() + d, false, true);
          if (cnt) { o = p + 28 + (cnt - 1) * (type === 88 ? 4 : 8); dc.cur = type === 88 ? { x: i16(o), y: i16(o + 2) } : { x: i32(o), y: i32(o + 4) }; }
          break;
        }
        case 6: case 89: {
          cnt = u32(p + 24); a = pts(p + 28, cnt, type === 89); d = polyD(a, false, false);
          if (inPath) path += d; else emit(curD() + d, false, true);
          if (cnt) { o = p + 28 + (cnt - 1) * (type === 89 ? 4 : 8); dc.cur = type === 89 ? { x: i16(o), y: i16(o + 2) } : { x: i32(o), y: i32(o + 4) }; }
          break;
        }
        case 7: case 8: case 90: case 91: {
          var np = u32(p + 24), small = type >= 90, closed = type === 8 || type === 91, po = p + 32 + np * 4;
          d = '';
          for (i = 0; i < np && i < 20000; i++) {
            var c = u32(p + 32 + i * 4);
            if (po + c * (small ? 4 : 8) > end) break;
            d += polyD(pts(po, c, small), closed, true);
            po += c * (small ? 4 : 8);
          }
          emit(d, closed, true);
          break;
        }
        case 59: inPath = true; path = ''; break;
        case 60: inPath = false; break;
        case 61: if (inPath || path !== null) path += 'Z'; break;
        case 62: case 63: case 64:
          if (path) {
            var fill = type !== 64, stroke = type !== 62;
            if ((fill && dc.brush.on) || (stroke && dc.pen.on)) out.push('<path d="' + path + '"' + paint(fill, stroke) + '/>');
          }
          path = null; inPath = false;
          break;
        case 84: {
          var nChars = u32(p + 44), offStr = u32(p + 48);
          if (nChars && p + offStr + nChars * 2 <= end) {
            var str = utf16(p + offStr, nChars), pos = (dc.textAlign & 1) ? P(dc.cur.x, dc.cur.y) : P(i32(p + 36), i32(p + 40));
            var ms = mapScale(), fs = Math.max(1, dc.font.size * Math.abs(dc.xf[3] || 1) * Math.abs(ms.y));
            var anchor = (dc.textAlign & 6) === 6 ? 'middle' : (dc.textAlign & 2) ? 'end' : 'start';
            var base = (dc.textAlign & 24) === 24 ? 0 : (dc.textAlign & 8) ? -fs * 0.2 : fs * 0.85;
            if (str.trim()) out.push('<text x="' + pos[0] + '" y="' + f(pos[1] + base) + '" font-family="' + OP.escXml(dc.font.face) + ', sans-serif" font-size="' + f(fs) + '"' +
              (dc.font.bold ? ' font-weight="bold"' : '') + (dc.font.italic ? ' font-style="italic"' : '') + ' text-anchor="' + anchor + '" fill="' + dc.textColor + '"' +
              (dc.font.esc ? ' transform="rotate(' + f(-dc.font.esc / 10) + ' ' + pos[0] + ' ' + pos[1] + ')"' : '') + ' xml:space="preserve">' + OP.escXml(str) + '</text>');
          }
          break;
        }
        case 81: {
          var url = bmpUrl(p, u32(p + 48), u32(p + 52), u32(p + 56), u32(p + 60), end);
          if (url) {
            var d0 = P(i32(p + 24), i32(p + 28)), d1 = P(i32(p + 24) + i32(p + 72), i32(p + 28) + i32(p + 76));
            out.push('<image x="' + Math.min(d0[0], d1[0]) + '" y="' + Math.min(d0[1], d1[1]) + '" width="' + f(Math.abs(d1[0] - d0[0])) + '" height="' + f(Math.abs(d1[1] - d0[1])) + '" preserveAspectRatio="none" href="' + url + '"/>');
          }
          break;
        }
        case 14: p = n; break;
        default: break;
      }
      if (type === 14) break;
      p = end;
    }
    if (!out.length) return null;
    var wPt = fw / 100 * 72 / 25.4, hPt = fh / 100 * 72 / 25.4;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + f(wPt) + '" height="' + f(hPt) + '" viewBox="' + f(vb.x) + ' ' + f(vb.y) + ' ' + f(vb.w) + ' ' + f(vb.h) +
      '" preserveAspectRatio="none">' + out.join('') + '</svg>';
    return { svg: svg, w: f(wPt), h: f(hPt) };
  };
})();
