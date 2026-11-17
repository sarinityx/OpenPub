/* OpenPub – text flow: fields ({{page}}, mail-merge fields), numbered lists, multi-column
 * boxes and stories that run through a chain of linked text boxes (also across pages). */
var OP = (typeof globalThis.OP !== 'undefined') ? globalThis.OP : (globalThis.OP = {});

(function () {
  'use strict';

  // ---------------------------------------------------------------- fields
  var FIELD = /\{\{\s*([^{}]+?)\s*\}\}/g;
  /** Replace {{page}}, {{pages}} and merge fields. Unknown fields are left as typed. */
  OP.resolveText = function (t, env) {
    if (!env || t.indexOf('{{') < 0) return t;
    return t.replace(FIELD, function (all, name) {
      var k = name.toLowerCase();
      if (k === 'page') return env.page ? String(env.page) : '#';
      if (k === 'pages') return env.pages ? String(env.pages) : '#';
      if (env.rec && Object.prototype.hasOwnProperty.call(env.rec, name)) return String(env.rec[name]);
      return all;
    });
  };
  OP.envSig = function (env) { return env ? (env.page || 0) + '/' + (env.pages || 0) + '/' + (env.rec ? env.recIndex : '-') : ''; };

  /**
   * Paragraphs ready for layout: fields resolved and numbered lists given their numbers.
   * Returns the same array when there is nothing to do.
   */
  OP.prepParas = function (paras, env) {
    var need = false, i, j;
    for (i = 0; i < paras.length && !need; i++) {
      if (paras[i].num) need = true;
      else for (j = 0; j < paras[i].runs.length; j++) if (paras[i].runs[j].t.indexOf('{{') >= 0) { need = true; break; }
    }
    if (!need) return paras;
    var n = 0;
    return paras.map(function (p) {
      var q = {}, k;
      for (k in p) q[k] = p[k];
      if (p.num) { n++; q.bullet = n + '.'; } else n = 0;
      q.runs = p.runs.map(function (r) {
        if (r.t.indexOf('{{') < 0) return r;
        var c = {};
        for (var kk in r) c[kk] = r[kk];
        c.t = OP.resolveText(r.t, env);
        return c;
      });
      return q;
    });
  };

  // ---------------------------------------------------------------- story index
  var indexes = new WeakMap();
  /** Rebuild the id -> item map and the link map of a document. Cheap; called before every render. */
  OP.reindex = function (doc) {
    var map = {}, prev = {}, pageOf = {}, linked = false, wraps = {};
    function scan(pg, pi) {
      pg.items.forEach(function (it) {
        map[it.id] = it; pageOf[it.id] = pi;
        if (it.next) linked = true;
        if (it.wrap && pi >= 0) (wraps[pi] = wraps[pi] || []).push(it); // obstacles text wraps around
      });
    }
    doc.pages.forEach(scan);
    (doc.masters || []).forEach(function (m) { scan(m, -1); });
    if (linked) Object.keys(map).forEach(function (id) {
      var nx = map[id].next;
      if (nx && map[nx] && map[nx].type === 'shape' && !prev[nx] && nx !== id) prev[nx] = id;
    });
    var ix = { map: map, prev: prev, pageOf: pageOf, linked: linked, wraps: wraps };
    indexes.set(doc, ix);
    return ix;
  };
  function indexOf(doc, id) {
    var ix = indexes.get(doc);
    if (!ix || (id && !ix.map[id])) ix = OP.reindex(doc);
    return ix;
  }
  OP.docIndex = function (doc) { return indexOf(doc, null); };

  /** The chain an item belongs to: {head, chain:[items]}; null for an ordinary box. */
  OP.storyOf = function (doc, it) {
    var ix = indexOf(doc, it.id);
    if (!ix.linked || (!it.next && !ix.prev[it.id])) return null;
    var head = it, guard = 0;
    while (ix.prev[head.id] && ix.map[ix.prev[head.id]] && guard++ < 500) head = ix.map[ix.prev[head.id]];
    var chain = [head], seen = {}, cur = head;
    seen[head.id] = true;
    while (cur.next && ix.map[cur.next] && !seen[cur.next] && ix.prev[cur.next] === cur.id) {
      cur = ix.map[cur.next]; seen[cur.id] = true; chain.push(cur);
    }
    return chain.length > 1 ? { head: head, chain: chain } : null;
  };
  /** The item whose text an item shows (itself, or the first box of its story). */
  OP.storyHead = function (doc, it) { var s = OP.storyOf(doc, it); return s ? s.head : it; };

  /** Can this box use "Grow box to fit"? Text boxes only: not WordArt, not in a linked chain, not in columns. */
  OP.canGrow = function (doc, it) {
    return !!(it && it.type === 'shape' && it.text && !it.wa && !(it.text.cols > 1) && !it.next && !(doc && OP.storyOf(doc, it)));
  };
  /**
   * "Grow box to fit": make the box exactly as tall as its text, growing or shrinking downward from
   * its top edge. The width never changes. text overrides the box's own text (used while editing).
   * @returns {boolean} true if the height changed
   */
  OP.growToFit = function (doc, it, text) {
    if (!it || !it.text || it.text.fit !== 'grow' || !OP.canGrow(doc, it)) return false;
    var probe = text ? { w: it.w, text: { pad: it.text.pad, hyph: it.text.hyph, paras: text.paras } } : it;
    var h = OP.round(OP.textHeight(probe), 2);
    if (!(h > 0) || Math.abs(h - it.h) < 0.01) return false;
    it.h = h;
    return true;
  };
  /** Apply "Grow box to fit" to every box in the document that uses it. */
  OP.growAll = function (doc) {
    var changed = false;
    (doc.pages || []).concat(doc.masters || []).forEach(function (pg) {
      (pg.items || []).forEach(function (it) { if (it.text && it.text.fit === 'grow' && OP.growToFit(doc, it)) changed = true; });
    });
    return changed;
  };

  // ---------------------------------------------------------------- frames
  function boxFrames(b) {
    var tx = b.text || {}, pad = tx.pad || [3, 3, 3, 3];
    var n = Math.max(1, Math.min(8, tx.cols | 0 || 1)), gap = tx.gap === undefined ? 12 : tx.gap;
    var iw = Math.max(4, b.w - pad[0] - pad[2]), ih = Math.max(4, b.h - pad[1] - pad[3]);
    var cw = Math.max(4, (iw - gap * (n - 1)) / n), out = [];
    for (var i = 0; i < n; i++) out.push({ box: b, x: pad[0] + i * (cw + gap), y: pad[1], w: cw, h: ih });
    return out;
  }

  var flowCache = {}, flowCount = 0;
  /**
   * Columns of text for one item: [{x, y, w, h, lay}] in item space, plus an overflow flag.
   * Handles plain boxes, multi-column boxes and linked chains. env carries field values.
   */
  OP.textCols = function (doc, it, env) {
    if (!it.text) return null;
    var story = doc ? OP.storyOf(doc, it) : null;
    var ncols = Math.max(1, it.text.cols | 0 || 1);
    var head = story ? story.head : it;
    if (!head.text) return null;
    var paras = OP.prepParas(head.text.paras, env);
    var wrapOf = {}, anyWrap = false;
    if (doc && OP.wrapProfile) (story ? story.chain : [it]).forEach(function (b) { var wp = OP.wrapProfile(doc, b); if (wp) { wrapOf[b.id] = wp; anyWrap = true; } });
    if (!story && ncols === 1 && !anyWrap) {
      var src = it;
      if (paras !== it.text.paras) {
        src = { id: it.id + '~' + OP.envSig(env), w: it.w, h: it.h, text: { paras: paras, pad: it.text.pad, valign: it.text.valign, fit: it.text.fit } };
      }
      var lay = OP.layoutItemText(src);
      return { cols: [{ x: lay.ox, y: lay.oy, w: lay.innerW, h: lay.innerH, lay: lay }], overflow: lay.overflow, scale: lay.scale };
    }
    var boxes = story ? story.chain : [it], frames = [], geo = '';
    boxes.forEach(function (b) {
      boxFrames(b).forEach(function (f) { frames.push(f); geo += f.w.toFixed(2) + 'x' + f.h.toFixed(2) + ';'; });
      geo += (b.text ? b.text.valign : '') + '|' + (wrapOf[b.id] ? wrapOf[b.id].sig : '') + '|';
    });
    var hyph = !!head.text.hyph;
    var key = geo + (hyph ? 'H' : '') + JSON.stringify(paras), ck = head.id + '~' + OP.envSig(env), hit = flowCache[ck];
    if (!hit || hit.key !== key) {
      var rem = paras, byBox = {}, overflow = false;
      frames.forEach(function (f, i) {
        var mine = rem, wp = wrapOf[f.box.id], opt = { hyph: hyph };
        if (wp) opt.avail = function (y, h) { return wp.avail(f.x, f.y, f.w, y, h); };
        if (i < frames.length - 1) {
          if (rem.length) { var parts = OP.splitParasAtHeight(rem, f.w, f.h, opt); mine = parts[0]; rem = parts[1]; }
        } else rem = [];
        var l = mine.length ? OP.layoutParas(mine, f.w, 1, opt) : { lines: [], height: 0 };
        var oy = 0, single = boxFrames(f.box).length === 1, va = f.box.text ? f.box.text.valign : 'top';
        if (single && !wp && l.height < f.h) oy = va === 'middle' ? (f.h - l.height) / 2 : va === 'bottom' ? f.h - l.height : 0;
        if (i === frames.length - 1 && l.height > f.h + 1) overflow = true;
        (byBox[f.box.id] = byBox[f.box.id] || []).push({ x: f.x, y: f.y + oy, w: f.w, h: f.h, lay: { lines: l.lines, height: l.height, scale: 1 } });
      });
      hit = flowCache[ck] = { key: key, byBox: byBox, overflow: overflow };
      if (flowCount++ > 600) { flowCache = {}; flowCount = 0; flowCache[ck] = hit; }
    }
    var last = boxes[boxes.length - 1];
    return { cols: hit.byBox[it.id] || [], overflow: hit.overflow && it.id === last.id, scale: 1 };
  };

  /** Join a box to the end of another box's story. Returns an error message or ''. */
  OP.linkBoxes = function (doc, from, to) {
    OP.reindex(doc);
    if (from.id === to.id) return 'A text box cannot be linked to itself.';
    if (to.type !== 'shape' || OP.isOpen(to) || to.wa) return 'Only text boxes and shapes can continue a story.';
    var ix = OP.docIndex(doc);
    if (ix.prev[to.id] || to.next) return 'That box is already part of a linked story.';
    if (to.text && OP.plainText(to.text).trim().length) return 'The box to continue into must be empty.';
    if (from.next) return 'This box already continues into another box. Break that link first.';
    var st = OP.storyOf(doc, from), probe = st ? st.chain : [from];
    if (probe.some(function (b) { return b.id === to.id; })) return 'Those boxes are already linked.';
    if (!from.text) from.text = OP.newText();
    if (!to.text) { to.text = OP.newText(); to.text.pad = from.text.pad.slice(); }
    to.text.paras = [OP.newPara()];
    from.next = to.id;
    OP.reindex(doc);
    return '';
  };
  /** Break the link after a box. The text stays with the first part of the chain. */
  OP.unlinkBox = function (doc, it) {
    if (it.next) { delete it.next; OP.reindex(doc); return true; }
    var ix = OP.reindex(doc), p = ix.prev[it.id];
    if (p && ix.map[p]) { delete ix.map[p].next; OP.reindex(doc); return true; }
    return false;
  };
})();
