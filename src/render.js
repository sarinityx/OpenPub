/* OpenPub – canvas renderer. One code path draws the screen, thumbnails, PNG and PDF output. */
var OP = (typeof globalThis.OP !== 'undefined') ? globalThis.OP : (globalThis.OP = {});

(function () {
  'use strict';

  // ---------------------------------------------------------------- image cache
  var cache = {}; // asset id -> {img, ok, failed, src}
  var listeners = [];
  OP.onImageLoad = function (fn) { listeners.push(fn); };

  OP.getImage = function (doc, assetId) {
    var a = assetId && doc.assets[assetId];
    if (!a) return null;
    var c = cache[assetId];
    if (c && c.src === a.src) return c;
    c = cache[assetId] = { img: new Image(), ok: false, failed: false, src: a.src, promise: null };
    c.promise = new Promise(function (resolve) {
      c.img.onload = function () {
        c.ok = true;
        if (c.img.naturalWidth) { a.w = a.w || c.img.naturalWidth; a.h = a.h || c.img.naturalHeight; }
        resolve(c);
        listeners.forEach(function (fn) { fn(assetId); });
      };
      c.img.onerror = function () { c.failed = true; resolve(c); listeners.forEach(function (fn) { fn(assetId); }); };
    });
    c.img.src = a.src;
    return c;
  };

  /** Resolve once every picture used by the document has finished loading (or failed). */
  OP.ensureImages = function (doc) {
    var jobs = [];
    Object.keys(doc.assets).forEach(function (k) { var c = OP.getImage(doc, k); if (c && c.promise) jobs.push(c.promise); });
    return Promise.all(jobs);
  };

  // ---------------------------------------------------------------- paint helpers
  function rgba(hex, alpha) {
    if (alpha === undefined || alpha >= 1) return hex;
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return hex;
    return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + alpha + ')';
  }
  OP.rgba = rgba;

  /** Endpoints of a linear gradient across a w×h box. angle 0 = top to bottom, clockwise positive. */
  OP.gradientLine = function (w, h, angle) {
    var a = (angle || 0) * Math.PI / 180;
    var dx = -Math.sin(a), dy = Math.cos(a);
    var half = (Math.abs(dx) * w + Math.abs(dy) * h) / 2;
    return { x0: w / 2 - dx * half, y0: h / 2 - dy * half, x1: w / 2 + dx * half, y1: h / 2 + dy * half };
  };

  function fillStyle(ctx, fill, w, h) {
    if (!fill) return null;
    if (fill.type === 'solid') return rgba(fill.color, fill.opacity);
    if (fill.type === 'linear' || fill.type === 'radial') {
      var g;
      if (fill.type === 'linear') {
        var l = OP.gradientLine(w, h, fill.angle);
        g = ctx.createLinearGradient(l.x0, l.y0, l.x1, l.y1);
      } else {
        g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2);
      }
      (fill.stops || []).forEach(function (s) { try { g.addColorStop(OP.clamp(s[0], 0, 1), s[1]); } catch (e) { /* bad colour */ } });
      return g;
    }
    return null;
  }

  function placeholder(ctx, w, h, label) {
    ctx.save();
    ctx.fillStyle = '#e9e7e2';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#a8a39a';
    ctx.lineWidth = Math.max(0.5, Math.min(w, h) / 200);
    ctx.strokeRect(0, 0, w, h);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, h); ctx.moveTo(w, 0); ctx.lineTo(0, h); ctx.stroke();
    var fs = Math.max(5, Math.min(11, w / 14));
    if (label && w > 40 && h > 16) {
      ctx.font = fs + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var tw = ctx.measureText(label).width;
      ctx.fillStyle = '#e9e7e2';
      ctx.fillRect(w / 2 - tw / 2 - 3, h / 2 - fs * 0.7, tw + 6, fs * 1.4);
      ctx.fillStyle = '#6b665e';
      ctx.fillText(label, w / 2, h / 2);
    }
    ctx.restore();
  }

  function drawCropped(ctx, c, crop, w, h) {
    var iw = c.img.naturalWidth || 1, ih = c.img.naturalHeight || 1;
    crop = crop || { l: 0, t: 0, r: 0, b: 0 };
    var sx = crop.l * iw, sy = crop.t * ih, sw = Math.max(1, (1 - crop.l - crop.r) * iw), sh = Math.max(1, (1 - crop.t - crop.b) * ih);
    try { ctx.drawImage(c.img, sx, sy, sw, sh, 0, 0, w, h); } catch (e) { placeholder(ctx, w, h, 'Picture'); }
  }

  /** Draw an item's text (all its columns) in item space. doc may be null for stand-in items. */
  function drawTextCols(ctx, doc, it, env) {
    var tc = OP.textCols(doc, it, env);
    if (!tc || !tc.cols.length) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, it.w, it.h);
    ctx.clip();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    var lastCss = null;
    tc.cols.forEach(function (col) {
      var lay = col.lay, scale = lay.scale || 1;
      lay.lines.forEach(function (ln) {
        if (col.y + ln.y > it.h) return;
        ln.segs.forEach(function (s) {
          if (s.css !== lastCss) { ctx.font = s.css; lastCss = s.css; }
          OP.setLetterSpacing(ctx, s.run, scale);
          ctx.fillStyle = s.run.color || '#000000';
          var x = col.x + s.x, y = col.y + ln.base;
          if (s.text) ctx.fillText(s.text, x, y);
          if (s.run.u || s.run.s) {
            var sz = s.run.size * scale;
            if (s.run.u) ctx.fillRect(x, y + sz * 0.1, s.w, Math.max(0.5, sz / 16));
            if (s.run.s) ctx.fillRect(x, y - sz * 0.3, s.w, Math.max(0.5, sz / 16));
          }
        });
      });
    });
    OP.setLetterSpacing(ctx, null, 1);
    ctx.restore();
  }
  OP.drawTextCols = drawTextCols;
  OP.fillStyleFor = fillStyle;

  /** CSS filter string for a picture's adjustments, or '' when there are none. */
  OP.adjFilter = function (adj) {
    if (!adj) return '';
    var f = '';
    if (adj.br !== undefined && adj.br !== 1) f += 'brightness(' + adj.br + ') ';
    if (adj.ct !== undefined && adj.ct !== 1) f += 'contrast(' + adj.ct + ') ';
    if (adj.sat !== undefined && adj.sat !== 1) f += 'saturate(' + adj.sat + ') ';
    if (adj.gray) f += 'grayscale(1) ';
    if (adj.sepia) f += 'sepia(1) ';
    return f.trim();
  };
  /** Outline used to mask a picture ('ellipse', 'round') as path data, or null. */
  OP.maskPath = function (it) {
    if (it.mask === 'ellipse') return OP.shapePath({ type: 'shape', kind: 'ellipse', w: it.w, h: it.h });
    if (it.mask === 'round') return OP.shapePath({ type: 'shape', kind: 'roundrect', w: it.w, h: it.h });
    return null;
  };

  /**
   * Draw one item. The context must already map 1 unit to 1 point with the page origin at (0,0).
   * opts.pxPerPt is needed for shadows (canvas shadow offsets ignore the transform).
   */
  OP.drawItem = function (ctx, doc, it, opts) {
    if (it.hidden && !(opts && opts.showHidden)) return;
    var w = it.w, h = it.h, cx = it.x + w / 2, cy = it.y + h / 2;
    var k = (opts && opts.pxPerPt) || 1;
    ctx.save();
    ctx.globalAlpha *= (it.opacity === undefined ? 1 : it.opacity);
    ctx.translate(cx, cy);
    if (it.rot) ctx.rotate(it.rot * Math.PI / 180);
    ctx.save();
    ctx.scale(it.flipH ? -1 : 1, it.flipV ? -1 : 1);
    ctx.translate(-w / 2, -h / 2);

    if (it.type === 'table') {
      OP.drawTable(ctx, doc, it, opts);
      ctx.restore(); ctx.restore();
      return;
    }
    if (it.wa) {
      OP.drawWordArt(ctx, it, k, fillStyle);
      ctx.restore(); ctx.restore();
      return;
    }
    var mp = it.type === 'image' ? OP.maskPath(it) : null;
    var d = mp || OP.shapePath(it), path = new Path2D(d);
    var sh = it.shadow;
    function shadowOn() {
      if (!sh) return;
      ctx.shadowColor = sh.color || 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = (sh.blur || 0) * k;
      ctx.shadowOffsetX = sh.dx * k; ctx.shadowOffsetY = sh.dy * k;
    }
    function shadowOff() { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; }

    if (it.type === 'image') {
      var c = OP.getImage(doc, it.asset);
      if (sh) { shadowOn(); ctx.fillStyle = '#ffffff'; ctx.fill(path); shadowOff(); }
      if (c && c.ok) {
        var flt = OP.adjFilter(it.adj);
        ctx.save();
        if (mp) ctx.clip(path);
        if (flt) ctx.filter = flt;
        drawCropped(ctx, c, it.crop, w, h);
        ctx.restore();
      } else placeholder(ctx, w, h, c && !c.failed ? 'Loading…' : (it.asset ? 'Picture cannot be shown' : 'Unsupported picture'));
    } else {
      var open = OP.isOpen(it);
      var fill = open ? null : it.fill;
      if (fill) {
        if (fill.type === 'image') {
          var fc = OP.getImage(doc, fill.asset);
          if (fc && fc.ok) {
            ctx.save(); ctx.clip(path);
            ctx.drawImage(fc.img, 0, 0, w, h);
            ctx.restore();
          }
        } else {
          var fs = fillStyle(ctx, fill, w, h);
          if (fs) { shadowOn(); ctx.fillStyle = fs; ctx.fill(path); shadowOff(); }
        }
      }
    }
    var st = it.stroke;
    if (st && st.width > 0) {
      if (sh && (it.type === 'shape' && !it.fill)) shadowOn();
      ctx.strokeStyle = st.color;
      ctx.lineWidth = st.width;
      ctx.lineJoin = 'miter'; ctx.miterLimit = 8;
      ctx.setLineDash(OP.dashArray(st));
      ctx.stroke(path);
      ctx.setLineDash([]);
      var ad = OP.arrowPath(it);
      if (ad) { ctx.fillStyle = st.color; ctx.fill(new Path2D(ad)); }
      shadowOff();
    }
    ctx.restore(); // flips off: text is never mirrored
    if (it.type === 'shape' && it.text && !(opts && opts.skipTextOf && (opts.skipTextOf === it.id || (doc && OP.storyHead(doc, it).id === opts.skipTextOf)))) {
      ctx.translate(-w / 2, -h / 2);
      drawTextCols(ctx, doc, it, opts && opts.env);
    }
    ctx.restore();
  };

  /**
   * Draw a whole page (background + items). Clipping is the caller's choice: the editor shows
   * objects hanging off the page, exports clip to the bleed box.
   */
  OP.renderPage = function (ctx, doc, page, opts) {
    opts = opts || {};
    var b = opts.bleed || 0;
    if (!opts.noBackground) {
      ctx.fillStyle = page.bg || '#ffffff';
      ctx.fillRect(-b, -b, doc.w + 2 * b, doc.h + 2 * b);
    }
    OP.reindex(doc);
    if (!opts.env) opts = Object.assign({}, opts, { env: OP.pageEnv(doc, page) });
    var m = OP.masterOf(doc, page), i;
    if (m && !opts.noMaster) for (i = 0; i < m.items.length; i++) OP.drawItem(ctx, doc, m.items[i], opts);
    for (i = 0; i < page.items.length; i++) OP.drawItem(ctx, doc, page.items[i], opts);
  };

  /** The master page a page uses, or null. A master itself has none. */
  OP.masterOf = function (doc, page) {
    if (!page || !page.master || !doc.masters) return null;
    for (var i = 0; i < doc.masters.length; i++) if (doc.masters[i].id === page.master) return doc.masters[i];
    return null;
  };
  /** Field values for a page: its number, the page count and the mail-merge record being previewed. */
  OP.pageEnv = function (doc, page, recIndex) {
    var idx = doc.pages.indexOf(page), mg = doc.merge, ri = recIndex === undefined ? (mg && mg.preview ? mg.at || 0 : -1) : recIndex, rec = null;
    if (mg && ri >= 0 && mg.rows && mg.rows[ri]) {
      rec = {};
      mg.fields.forEach(function (f, i) { rec[f] = mg.rows[ri][i] === undefined ? '' : mg.rows[ri][i]; });
    }
    return { page: idx >= 0 ? idx + 1 : 0, pages: doc.pages.length, rec: rec, recIndex: ri };
  };

  /** Render a page into a new canvas at the given scale (px per pt). */
  OP.pageToCanvas = function (doc, page, pxPerPt, opts) {
    opts = opts || {};
    var b = opts.bleed || 0;
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round((doc.w + 2 * b) * pxPerPt));
    c.height = Math.max(1, Math.round((doc.h + 2 * b) * pxPerPt));
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.setTransform(pxPerPt, 0, 0, pxPerPt, b * pxPerPt, b * pxPerPt);
    ctx.beginPath(); ctx.rect(-b, -b, doc.w + 2 * b, doc.h + 2 * b); ctx.clip();
    OP.renderPage(ctx, doc, page, { bleed: b, pxPerPt: pxPerPt, env: opts.env });
    return c;
  };
})();
