/* OpenPub – WordArt. Text is stretched to fill its frame and bent by a warp. Each glyph gets its
 * own affine transform, so the same placement drives the canvas renderer and vector (SVG) output. */
var OP = (typeof globalThis.OP !== 'undefined') ? globalThis.OP : (globalThis.OP = {});

(function () {
  'use strict';
  var F = 100; // nominal font size used for measuring

  function tri(u) { return Math.abs(2 * u - 1); }
  /** Envelope warps: top and bottom edge (0..1 of the frame height) as functions of u (0..1 across). */
  var ENV = {
    plain: { label: 'Straight', t: function () { return 0; }, b: function () { return 1; } },
    wave: { label: 'Wave', t: function (u) { return 0.14 + 0.14 * Math.sin(2 * Math.PI * u); }, b: function (u) { return 0.86 + 0.14 * Math.sin(2 * Math.PI * u); } },
    wave2: { label: 'Wave (reverse)', t: function (u) { return 0.14 - 0.14 * Math.sin(2 * Math.PI * u); }, b: function (u) { return 0.86 - 0.14 * Math.sin(2 * Math.PI * u); } },
    inflate: { label: 'Inflate', t: function (u) { return 0.25 * (1 - Math.sin(Math.PI * u)); }, b: function (u) { return 1 - 0.25 * (1 - Math.sin(Math.PI * u)); } },
    deflate: { label: 'Deflate', t: function (u) { return 0.28 * Math.sin(Math.PI * u); }, b: function (u) { return 1 - 0.28 * Math.sin(Math.PI * u); } },
    inflateTop: { label: 'Inflate top', t: function (u) { return 0.4 * (1 - Math.sin(Math.PI * u)); }, b: function () { return 1; } },
    inflateBottom: { label: 'Inflate bottom', t: function () { return 0; }, b: function (u) { return 1 - 0.4 * (1 - Math.sin(Math.PI * u)); } },
    deflateTop: { label: 'Deflate top', t: function (u) { return 0.4 * Math.sin(Math.PI * u); }, b: function () { return 1; } },
    deflateBottom: { label: 'Deflate bottom', t: function () { return 0; }, b: function (u) { return 1 - 0.4 * Math.sin(Math.PI * u); } },
    slantUp: { label: 'Slant up', t: function (u) { return 0.4 * (1 - u); }, b: function (u) { return 0.6 + 0.4 * (1 - u); } },
    slantDown: { label: 'Slant down', t: function (u) { return 0.4 * u; }, b: function (u) { return 0.6 + 0.4 * u; } },
    fadeRight: { label: 'Fade right', t: function (u) { return 0.32 * u; }, b: function (u) { return 1 - 0.32 * u; } },
    fadeLeft: { label: 'Fade left', t: function (u) { return 0.32 * (1 - u); }, b: function (u) { return 1 - 0.32 * (1 - u); } },
    triangle: { label: 'Triangle', t: function (u) { return 0.7 * tri(u); }, b: function () { return 1; } },
    triangleDown: { label: 'Triangle down', t: function () { return 0; }, b: function (u) { return 1 - 0.7 * tri(u); } },
    chevron: { label: 'Chevron up', t: function (u) { return 0.3 * tri(u); }, b: function (u) { return 0.7 + 0.3 * tri(u); } },
    chevronDown: { label: 'Chevron down', t: function (u) { return 0.3 * (1 - tri(u)); }, b: function (u) { return 0.7 + 0.3 * (1 - tri(u)); } },
    canUp: { label: 'Curve up', t: function (u) { return 0.2 * (1 - Math.sin(Math.PI * u)); }, b: function (u) { return 0.8 + 0.2 * (1 - Math.sin(Math.PI * u)); } },
    canDown: { label: 'Curve down', t: function (u) { return 0.2 * Math.sin(Math.PI * u); }, b: function (u) { return 0.8 + 0.2 * Math.sin(Math.PI * u); } }
  };
  var ARC = { archUp: 'Arch up', archDown: 'Arch down', circle: 'Circle' };
  /** How lines of different lengths share the width (straight and envelope warps). */
  var ALIGNS = { center: 'Centre', left: 'Left', right: 'Right', stretch: 'Stretch each line' };
  OP.WA_ALIGNS = Object.keys(ALIGNS).map(function (k) { return [k, ALIGNS[k]]; });
  OP.WARPS = Object.keys(ENV).map(function (k) { return [k, ENV[k].label]; }).concat(Object.keys(ARC).map(function (k) { return [k, ARC[k]]; }));
  /** Publisher / Office shape type -> warp name. */
  OP.WARP_OF_SHAPE = {
    136: 'plain', 137: 'deflate', 138: 'triangle', 139: 'triangleDown', 140: 'chevron', 141: 'chevronDown', 142: 'inflate', 143: 'deflate',
    144: 'archUp', 145: 'archDown', 146: 'circle', 147: 'circle', 148: 'archUp', 149: 'archDown', 150: 'circle', 151: 'circle',
    152: 'slantUp', 153: 'slantDown', 154: 'slantUp', 155: 'slantDown', 156: 'wave', 157: 'wave2', 158: 'wave', 159: 'wave2',
    160: 'inflate', 161: 'deflate', 162: 'inflateBottom', 163: 'deflateBottom', 164: 'inflateTop', 165: 'deflateTop', 166: 'deflate', 167: 'deflate',
    168: 'fadeRight', 169: 'fadeLeft', 170: 'inflateTop', 171: 'inflateBottom', 172: 'slantUp', 173: 'slantDown', 174: 'canUp', 175: 'canDown'
  };
  OP.newWordArt = function (text, x, y, w, h) {
    var it = OP.newShape('rect', x, y, w, h);
    it.fill = { type: 'solid', color: '#1d1c19' };
    it.stroke = null;
    it.wa = { text: text || 'Your text', font: 'Arial Black', b: false, i: false, warp: 'plain', align: 'center' };
    it.name = 'WordArt';
    return it;
  };

  var mctx = null;
  function ctxM() {
    if (!mctx) mctx = ((typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(8, 8) : document.createElement('canvas')).getContext('2d');
    return mctx;
  }
  function fontCss(wa) { return (wa.i ? 'italic ' : '') + (wa.b ? 'bold ' : '') + F + 'px ' + OP.fontStack(wa.font || 'Arial'); }

  var cache = {};
  /**
   * Glyph placements for a WordArt item: [{ch, m:[a,b,c,d,e,f]}] in item space, at font size F.
   */
  OP.wordArtGlyphs = function (it) {
    var wa = it.wa, key = it.w + '|' + it.h + '|' + JSON.stringify(wa), hit = cache[it.id];
    if (hit && hit.key === key) return hit.val;
    var ctx = ctxM(), css = fontCss(wa), out = [];
    ctx.font = css;
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
    var lines = String(wa.text || '').split('\n').filter(function (l, i, a) { return l.length || a.length === 1; });
    if (!lines.length) lines = [' '];
    var w = Math.max(1, it.w), h = Math.max(1, it.h);
    function advances(line) {
      var chars = Array.from(line), xs = [0];
      for (var i = 1; i <= chars.length; i++) xs.push(ctx.measureText(chars.slice(0, i).join('')).width);
      return { chars: chars, xs: xs, w: xs[xs.length - 1] || 1 };
    }
    if (ARC[wa.warp]) {
      var line = lines.join(' '), ad = advances(line);
      var full = wa.warp === 'circle', down = wa.warp === 'archDown';
      // ellipse the baseline runs along; glyphs sit outside it (arch up) or inside it (arch down)
      var guess = Math.min(h * (full ? 0.22 : 0.4), w * 0.3), fs = guess, rx, ry, len;
      for (var pass = 0; pass < 3; pass++) {
        rx = Math.max(1, w / 2 - fs * (down ? 0.25 : 0.8)); ry = Math.max(1, (full ? h / 2 : h) - fs * (down ? 0.25 : 0.8));
        len = (full ? 2 : 1) * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2) * (full ? 0.97 : 1);
        fs = Math.min(len / ad.w * F, h * (full ? 0.3 : 0.6));
      }
      var k = fs / F, used = ad.w * k, pad = full ? 0 : Math.max(0, (len - used) / 2);
      var cx = w / 2, cy = full ? h / 2 : (down ? 0 : h);
      ad.chars.forEach(function (ch, i) {
        var mid = pad + (ad.xs[i] + ad.xs[i + 1]) / 2 * k, f = mid / len; // 0..1 along the path
        var ang, px, py, rot;
        if (full) { ang = -Math.PI / 2 + f * 2 * Math.PI; px = cx + rx * Math.cos(ang); py = cy + ry * Math.sin(ang); rot = Math.atan2(ry * Math.cos(ang), -rx * Math.sin(ang)); }
        else if (!down) { ang = Math.PI + f * Math.PI; px = cx + rx * Math.cos(ang); py = cy + ry * Math.sin(ang); rot = Math.atan2(ry * Math.cos(ang), -rx * Math.sin(ang)); }
        else { ang = Math.PI - f * Math.PI; px = cx + rx * Math.cos(ang); py = cy + ry * Math.sin(ang); rot = Math.atan2(-ry * Math.cos(ang), rx * Math.sin(ang)); }
        var c = Math.cos(rot), s = Math.sin(rot), half = (ad.xs[i + 1] - ad.xs[i]) / 2 * k;
        var drop = 0;
        out.push({ ch: ch, m: [c * k, s * k, -s * k, c * k, px - c * half - s * drop, py - s * half + c * drop] });
      });
    } else {
      var env = ENV[wa.warp] || ENV.plain, n = lines.length;
      // 'stretch' (older documents): every line fills the width on its own. 'center' / 'left' / 'right' (Office's
      // default, and new WordArt): one horizontal scale from the longest line, so letters match from line to line.
      var align = ALIGNS[wa.align] ? wa.align : 'stretch', shared = align !== 'stretch';
      var ads = lines.map(advances), maxW = Math.max.apply(null, ads.map(function (a) { return a.w; }));
      var metrics = lines.map(function (line) {
        var tm = ctx.measureText(line);
        var asc = tm.actualBoundingBoxAscent > 0 ? tm.actualBoundingBoxAscent : F * 0.72;
        var desc = tm.actualBoundingBoxDescent > 0 ? tm.actualBoundingBoxDescent : 0;
        if (asc + desc < F * 0.3) { asc = F * 0.72; desc = 0; }
        return { asc: asc, desc: desc };
      });
      if (shared) {
        var mA = Math.max.apply(null, metrics.map(function (m) { return m.asc; })), mD = Math.max.apply(null, metrics.map(function (m) { return m.desc; }));
        metrics = metrics.map(function () { return { asc: mA, desc: mD }; });
      }
      lines.forEach(function (line, li) {
        var ad = ads[li], asc = metrics[li].asc, desc = metrics[li].desc;
        var sx = w / (shared ? maxW : ad.w), used = ad.w * sx;
        var ox = align === 'center' ? (w - used) / 2 : align === 'right' ? w - used : 0;
        ad.chars.forEach(function (ch, i) {
          if (ch === ' ') return;
          var u0 = (ox + ad.xs[i] * sx) / w, u1 = (ox + ad.xs[i + 1] * sx) / w, uc = (u0 + u1) / 2;
          var T = env.t(uc), B = env.b(uc), band = (B - T) / n, top = T + band * li;
          var gap = n > 1 ? 0.06 : 0; // breathing room between stacked lines
          var sy = Math.max(0.01, band * (1 - gap) * h / (asc + desc));
          var base = top * h + asc * sy;
          var m0 = (env.t(u0) + env.b(u0)) / 2, m1 = (env.t(u1) + env.b(u1)) / 2;
          var slope = (u1 > u0) ? ((m1 - m0) * h) / ((u1 - u0) * w) : 0; // dy/dx of the mid line
          var adv = (ad.xs[i + 1] - ad.xs[i]) * sx;
          out.push({ ch: ch, m: [sx, slope * sx, 0, sy, ox + ad.xs[i] * sx, base - slope * adv / 2] });
        });
      });
    }
    var val = { glyphs: out, css: css };
    cache[it.id] = { key: key, val: val };
    return val;
  };

  function paintGlyphs(ctx, g, fill, stroke) {
    ctx.font = g.css;
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    g.glyphs.forEach(function (q) {
      ctx.save();
      ctx.transform(q.m[0], q.m[1], q.m[2], q.m[3], q.m[4], q.m[5]);
      if (fill) { ctx.fillStyle = fill; ctx.fillText(q.ch, 0, 0); }
      if (stroke) {
        var k = Math.sqrt(Math.abs(q.m[0] * q.m[3] - q.m[1] * q.m[2])) || 1;
        ctx.strokeStyle = stroke.color; ctx.lineWidth = stroke.width / k; ctx.lineJoin = 'round';
        ctx.strokeText(q.ch, 0, 0);
      }
      ctx.restore();
    });
  }

  /** Draw in item space (origin at the item's top-left). k = device pixels per point. */
  OP.drawWordArt = function (ctx, it, k, fillStyleFor) {
    var g = OP.wordArtGlyphs(it), fill = it.fill, st = it.stroke && it.stroke.width > 0 ? it.stroke : null;
    var sh = it.shadow;
    if (sh) {
      ctx.save();
      ctx.translate(sh.dx, sh.dy);
      paintGlyphs(ctx, g, sh.color || 'rgba(0,0,0,0.4)', null);
      ctx.restore();
    }
    if (fill && fill.type !== 'solid' && fill.type !== 'image') {
      // gradients must not be distorted per glyph: paint a mask, then pour the gradient through it
      var dev = Math.min(k || 1, 4096 / Math.max(it.w, it.h), 4), cw = Math.max(1, Math.ceil(it.w * dev) + 2), ch = Math.max(1, Math.ceil(it.h * dev) + 2);
      var off = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(cw, ch) : document.createElement('canvas');
      off.width = cw; off.height = ch;
      var o = off.getContext('2d');
      o.scale(dev, dev);
      paintGlyphs(o, g, '#000', null);
      o.globalCompositeOperation = 'source-in';
      o.fillStyle = fillStyleFor(o, fill, it.w, it.h) || '#000';
      o.fillRect(-1, -1, it.w + 2, it.h + 2);
      ctx.drawImage(off, 0, 0, cw / dev, ch / dev);
      if (st) paintGlyphs(ctx, g, null, st);
    } else {
      paintGlyphs(ctx, g, fill ? OP.rgba(fill.color || '#000000', fill.opacity) : null, st);
    }
  };

  /** SVG markup in item space. fillRef = 'none', a colour or url(#gradient). */
  OP.wordArtSvg = function (it, fillRef, isGradient, newId) {
    var g = OP.wordArtGlyphs(it), wa = it.wa, r = OP.round, esc = OP.escXml, st = it.stroke && it.stroke.width > 0 ? it.stroke : null;
    var attrs = ' font-family="' + esc(OP.fontStack(wa.font || 'Arial').replace(/"/g, "'")) + '" font-size="' + F + '"' + (wa.b ? ' font-weight="bold"' : '') + (wa.i ? ' font-style="italic"' : '');
    function glyphs(fill, stroke) {
      return g.glyphs.map(function (q) {
        var k = Math.sqrt(Math.abs(q.m[0] * q.m[3] - q.m[1] * q.m[2])) || 1;
        return '<text transform="matrix(' + q.m.map(function (v) { return r(v, 4); }).join(' ') + ')" fill="' + fill + '"' +
          (stroke ? ' stroke="' + esc(stroke.color) + '" stroke-width="' + r(stroke.width / k, 3) + '" stroke-linejoin="round"' : '') + ' xml:space="preserve">' + esc(q.ch) + '</text>';
      }).join('');
    }
    var s = '<g' + attrs + '>';
    if (it.shadow) s += '<g transform="translate(' + r(it.shadow.dx) + ' ' + r(it.shadow.dy) + ')">' + glyphs(esc(it.shadow.color || '#808080'), null) + '</g>';
    if (isGradient) {
      var id = newId();
      s += '<mask id="' + id + '" maskUnits="userSpaceOnUse" x="-10" y="-10" width="' + r(it.w + 20) + '" height="' + r(it.h + 20) + '">' + glyphs('#ffffff', null) + '</mask>' +
        '<rect width="' + r(it.w) + '" height="' + r(it.h) + '" fill="' + fillRef + '" mask="url(#' + id + ')"/>';
      if (st) s += glyphs('none', st);
    } else s += glyphs(fillRef, st);
    return s + '</g>';
  };
})();
