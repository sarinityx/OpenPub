/* OpenPub – text layout. Breaks an item's rich text into positioned lines using canvas text
 * metrics. Layout is always measured in points, so it is identical at every zoom level and DPI. */
var OP = (typeof globalThis.OP !== 'undefined') ? globalThis.OP : (globalThis.OP = {});

(function () {
  'use strict';

  var mctx = null;
  function measureCtx() {
    if (!mctx) {
      var c = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(8, 8) : document.createElement('canvas');
      mctx = c.getContext('2d');
    }
    return mctx;
  }

  var SERIF = /times|serif|georgia|garamond|roman|book|cambria|palatino|century|bodoni|baskerville|minion|didot|rockwell|constantia/i;
  var MONO = /courier|consolas|mono|lucida console/i;
  OP.fontStack = function (name) {
    var generic = MONO.test(name) ? 'monospace' : (SERIF.test(name) && !/sans/i.test(name)) ? 'serif' : 'sans-serif';
    return '"' + String(name).replace(/["\\]/g, '') + '", ' + generic;
  };
  OP.fontCss = function (run, scale) {
    return (run.i ? 'italic ' : '') + (run.b ? 'bold ' : '') + (run.size * (scale || 1)) + 'px ' + OP.fontStack(run.font);
  };

  var metricCache = {};
  function fontMetrics(ctx, css, size) {
    var m = metricCache[css];
    if (m) return m;
    ctx.font = css;
    var tm = ctx.measureText('Hg');
    var asc = tm.fontBoundingBoxAscent, desc = tm.fontBoundingBoxDescent;
    if (!(asc > 0) || !(desc >= 0)) { asc = size * 0.9; desc = size * 0.25; }
    m = metricCache[css] = { asc: asc, desc: desc };
    return m;
  }
  /** Web fonts that finish loading change metrics; the editor calls this to re-measure. */
  OP.resetTextMetrics = function () { metricCache = {}; layoutCache = {}; };

  var TOKEN = /\n|\t| +|[^ \n\t]+/g;
  /** Letter spacing (tracking) for a run; canvas keeps it as separate state from the font. */
  function setSp(ctx, run, scale) {
    if (ctx.letterSpacing === undefined) return;
    var v = (((run && run.sp) || 0) * scale) + 'px';
    if (ctx.letterSpacing !== v) ctx.letterSpacing = v;
  }
  OP.setLetterSpacing = setSp;

  /**
   * Lay out paragraphs in a column of the given width.
   * @returns {{lines:Object[], height:number}} lines carry y (top), base (baseline), h and segments.
   */
  function layoutParas(paras, width, scale) {
    var ctx = measureCtx();
    var lines = [], y = 0;
    paras.forEach(function (p, pi) {
      var left = (p.left || 0) * scale, right = (p.right || 0) * scale, indent = (p.indent || 0) * scale;
      var avail = Math.max(4, width - left - right);
      if (pi > 0 || p.before) y += (p.before || 0) * scale;

      // --- tokens
      var toks = [];
      var hang = 0;
      if (p.bullet) {
        var br = p.runs[0] || OP.DEFAULT_RUN;
        var bcss = OP.fontCss({ font: br.font, size: br.size, b: false, i: false }, scale);
        ctx.font = bcss; setSp(ctx, null, scale);
        var bw = ctx.measureText(p.bullet).width;
        hang = bw + br.size * scale * 0.5;
        toks.push({ type: 'bullet', text: p.bullet, run: br, css: bcss, w: hang, ri: -1, s: 0, e: 0 });
      }
      p.runs.forEach(function (run, ri) {
        if (!run.t) return;
        var css = OP.fontCss(run, scale);
        ctx.font = css; setSp(ctx, run, scale);
        var m, src = run.caps ? run.t.toUpperCase() : run.t; TOKEN.lastIndex = 0;
        while ((m = TOKEN.exec(src))) {
          var t = m[0], type = t === '\n' ? 'br' : t === '\t' ? 'tab' : t.charAt(0) === ' ' ? 'space' : 'word';
          toks.push({ type: type, text: t, run: run, css: css, w: (type === 'br' || type === 'tab') ? 0 : ctx.measureText(t).width, ri: ri, s: m.index, e: m.index + t.length });
        }
      });

      // --- break into lines
      var cur = [], curW = 0, first = true, plines = [];
      function lineAvail() { return avail - (first ? indent : 0) - ((!first && hang) ? hang : 0); }
      function push(hard) {
        plines.push({ toks: cur, first: first, hard: hard });
        cur = []; curW = 0; first = false;
      }
      for (var i = 0; i < toks.length; i++) {
        var t = toks[i];
        if (t.type === 'br') { cur.push(t); push(true); continue; }
        if (t.type === 'tab') {
          var stop = 36 * scale;
          t.w = stop - (curW % stop);
          cur.push(t); curW += t.w; continue;
        }
        if (t.type === 'word' && curW + t.w > lineAvail() + 0.01) {
          if (cur.length && !(cur.length === 1 && cur[0].type === 'bullet')) { push(false); }
          // a single word wider than the column is broken by characters
          if (t.w > lineAvail() + 0.01 && t.text.length > 1) {
            ctx.font = t.css; setSp(ctx, t.run, scale);
            var rest = t.text, start = t.s;
            while (rest.length) {
              var n = rest.length;
              if (ctx.measureText(rest).width > lineAvail() - curW) {
                n = 1;
                while (n < rest.length && ctx.measureText(rest.slice(0, n + 1)).width <= lineAvail() - curW) n++;
              }
              var piece = rest.slice(0, n);
              cur.push({ type: 'word', text: piece, run: t.run, css: t.css, w: ctx.measureText(piece).width, ri: t.ri, s: start, e: start + n });
              curW += cur[cur.length - 1].w;
              rest = rest.slice(n); start += n;
              if (rest.length) push(false);
            }
            continue;
          }
        }
        cur.push(t); curW += t.w;
      }
      if (cur.length || !plines.length) push(true);

      // --- position
      plines.forEach(function (pl, li) {
        var tk = pl.toks.slice();
        // trailing spaces do not take part in alignment
        var end = tk.length;
        while (end > 0 && (tk[end - 1].type === 'space' || tk[end - 1].type === 'br')) end--;
        var textW = 0, k, asc = 0, desc = 0, maxSize = 0;
        for (k = 0; k < end; k++) textW += tk[k].w;
        var measured = tk.length ? tk : [{ run: p.runs[p.runs.length - 1] || OP.DEFAULT_RUN }];
        measured.forEach(function (t) {
          var css = t.css || OP.fontCss(t.run, scale);
          var fm = fontMetrics(ctx, css, t.run.size * scale);
          if (fm.asc > asc) asc = fm.asc;
          if (fm.desc > desc) desc = fm.desc;
          if (t.run.size * scale > maxSize) maxSize = t.run.size * scale;
        });
        var natural = asc + desc;
        var lh = p.lsPt ? p.lsPt * scale : natural * (p.ls || 1);
        var x0 = left + (pl.first ? indent : hang);
        var la = avail - (pl.first ? indent : hang);
        var extra = la - textW, gap = 0;
        if (p.align === 'center') x0 += extra / 2;
        else if (p.align === 'right') x0 += extra;
        else if (p.align === 'justify' && !pl.hard && extra > 0) {
          var spaces = 0;
          for (k = 0; k < end; k++) if (tk[k].type === 'space') spaces++;
          if (spaces) gap = extra / spaces;
        }
        var segs = [], x = x0;
        for (k = 0; k < tk.length; k++) {
          var t = tk[k], w = t.w + ((t.type === 'space' && k < end) ? gap : 0);
          if (t.type === 'word' || t.type === 'bullet' || (t.type === 'space' && (t.run.u || t.run.s) && k < end)) {
            segs.push({ x: x, w: t.type === 'bullet' ? t.w : w, text: t.type === 'space' ? '' : t.text, run: t.run, css: t.css, space: t.type === 'space' });
          }
          x += w;
        }
        var firstTok = null;
        for (k = 0; k < tk.length; k++) if (tk[k].ri >= 0) { firstTok = tk[k]; break; }
        lines.push({
          y: y, h: lh, base: y + (lh - natural) / 2 + asc, segs: segs, pi: pi, li: li,
          ri: firstTok ? firstTok.ri : (li === 0 ? 0 : -1), ci: firstTok ? firstTok.s : 0, width: textW, x: x0
        });
        y += lh;
      });
      y += (p.after || 0) * scale;
    });
    return { lines: lines, height: y };
  }

  OP.layoutParas = layoutParas;
  var layoutCache = {}, cacheCount = 0;

  /**
   * Layout for an item's text box.
   * @returns {{lines, height, ox, oy, innerW, innerH, scale, overflow}} ox/oy = offset of the text block in item space
   */
  OP.layoutItemText = function (it) {
    var tx = it.text;
    if (!tx) return null;
    var key = it.w + '|' + it.h + '|' + JSON.stringify(tx);
    var hit = layoutCache[it.id];
    if (hit && hit.key === key) return hit.val;
    var pad = tx.pad || [0, 0, 0, 0];
    var iw = Math.max(4, it.w - pad[0] - pad[2]), ih = Math.max(0, it.h - pad[1] - pad[3]);
    var scale = 1, lay = layoutParas(tx.paras, iw, 1);
    if (tx.fit === 'shrink' && lay.height > ih + 0.5 && ih > 2) {
      var lo = 0.05, hi = 1;
      for (var i = 0; i < 9; i++) {
        var mid = (lo + hi) / 2;
        if (layoutParas(tx.paras, iw, mid).height <= ih) lo = mid; else hi = mid;
      }
      scale = lo;
      lay = layoutParas(tx.paras, iw, scale);
    }
    var oy = pad[1];
    if (lay.height < ih) {
      if (tx.valign === 'middle') oy += (ih - lay.height) / 2;
      else if (tx.valign === 'bottom') oy += ih - lay.height;
    }
    var val = { lines: lay.lines, height: lay.height, ox: pad[0], oy: oy, innerW: iw, innerH: ih, scale: scale, overflow: lay.height > ih + 1 };
    if (cacheCount++ > 4000) { layoutCache = {}; cacheCount = 0; }
    layoutCache[it.id] = { key: key, val: val };
    return val;
  };

  /** Height the text needs at the item's current width (used by "fit box to text"). */
  OP.textHeight = function (it) {
    if (!it.text) return 0;
    var pad = it.text.pad || [0, 0, 0, 0];
    return layoutParas(it.text.paras, Math.max(4, it.w - pad[0] - pad[2]), 1).height + pad[1] + pad[3];
  };

  /**
   * Split a list of paragraphs so the first part fits a column of (width × height).
   * Used when a Publisher story runs through several linked text boxes.
   * @returns {[Object[], Object[]]} [paragraphs that fit, the remainder]
   */
  OP.splitParasAtHeight = function (paras, width, height) {
    var lay = layoutParas(paras, width, 1);
    var cut = -1;
    for (var i = 0; i < lay.lines.length; i++) {
      if (lay.lines[i].y + lay.lines[i].h > height + 0.5) { cut = i; break; }
    }
    if (cut < 0) return [paras, []];
    if (cut === 0) cut = 1; // always keep at least one line so the flow makes progress
    if (cut >= lay.lines.length) return [paras, []];
    var ln = lay.lines[cut], pi = ln.pi;
    var head = paras.slice(0, pi), tail = paras.slice(pi + 1);
    if (ln.li === 0) return [head, paras.slice(pi)];
    var p = paras[pi], a = OP.clone(p), b = OP.clone(p);
    var ri = ln.ri < 0 ? 0 : ln.ri, ci = ln.ci;
    a.runs = p.runs.slice(0, ri).map(OP.clone);
    b.runs = p.runs.slice(ri + 1).map(OP.clone);
    var r1 = OP.clone(p.runs[ri]), r2 = OP.clone(p.runs[ri]);
    r1.t = p.runs[ri].t.slice(0, ci).replace(/ +$/, '');
    r2.t = p.runs[ri].t.slice(ci);
    if (r1.t.length || !a.runs.length) a.runs.push(r1);
    b.runs.unshift(r2);
    a.after = 0; b.before = 0; b.indent = 0; b.bullet = null;
    return [head.concat([a]), [b].concat(tail)];
  };
})();
