/* OpenPub – document model. All lengths are in points (1/72 inch). */
var OP = (typeof globalThis.OP !== 'undefined') ? globalThis.OP : (globalThis.OP = {});

(function () {
  'use strict';
  var MM = OP.MM;

  OP.PAGE_SIZES = [
    { id: 'A6', label: 'A6', w: 105, h: 148 },
    { id: 'A5', label: 'A5', w: 148, h: 210 },
    { id: 'A4', label: 'A4', w: 210, h: 297 },
    { id: 'A3', label: 'A3', w: 297, h: 420 },
    { id: 'A2', label: 'A2', w: 420, h: 594 },
    { id: 'A1', label: 'A1', w: 594, h: 841 },
    { id: 'A0', label: 'A0', w: 841, h: 1189 },
    { id: 'B2', label: 'B2', w: 500, h: 707 },
    { id: 'B1', label: 'B1', w: 707, h: 1000 },
    { id: 'DL', label: 'DL flyer', w: 99, h: 210 },
    { id: 'Letter', label: 'US Letter', w: 215.9, h: 279.4 },
    { id: 'Tabloid', label: 'Tabloid', w: 279.4, h: 431.8 },
    { id: 'BC', label: 'Business card (90 × 55)', w: 90, h: 55 }
  ];

  OP.newPage = function () {
    return { id: OP.uid('p'), bg: '#ffffff', guides: { h: [], v: [] }, items: [], master: null };
  };

  OP.newDoc = function (wPt, hPt) {
    return {
      app: 'OpenPub', version: 1, name: 'Untitled',
      w: wPt || 210 * MM, h: hPt || 297 * MM,
      bleed: 0,
      margins: { l: 10 * MM, t: 10 * MM, r: 10 * MM, b: 10 * MM },
      assets: {},
      masters: [], merge: null,
      pages: [OP.newPage()]
    };
  };

  OP.DEFAULT_RUN = { t: '', font: 'Arial', size: 12, b: false, i: false, u: false, color: '#000000' };
  // optional run fields: s (strikethrough), sp (letter spacing, pt), caps; optional paragraph field: num (numbered list)

  OP.newRun = function (t, o) {
    var r = OP.clone(OP.DEFAULT_RUN);
    r.t = t || '';
    if (o) for (var k in o) r[k] = o[k];
    return r;
  };
  OP.newPara = function (runs, o) {
    var p = { align: 'left', ls: 1, lsPt: null, before: 0, after: 0, indent: 0, left: 0, right: 0, bullet: null, runs: runs || [OP.newRun('')] };
    if (o) for (var k in o) p[k] = o[k];
    return p;
  };
  OP.newText = function (paras) {
    return { paras: paras || [OP.newPara()], valign: 'top', pad: [3, 3, 3, 3], fit: 'none' };
  };

  function base(type, x, y, w, h) {
    return {
      id: OP.uid('i'), type: type, name: '', x: x, y: y, w: w, h: h, rot: 0,
      flipH: false, flipV: false, opacity: 1, locked: false, hidden: false, group: null, shadow: null
    };
  }
  OP.newShape = function (kind, x, y, w, h) {
    var it = base('shape', x, y, w, h);
    it.kind = kind || 'rect';
    it.fill = { type: 'solid', color: '#ffffff' };
    it.stroke = { color: '#000000', width: 1, dash: 'solid' };
    it.arrowStart = false; it.arrowEnd = false;
    it.text = null;
    if (kind === 'line') it.fill = null;
    return it;
  };
  OP.newTextBox = function (x, y, w, h, paras) {
    var it = OP.newShape('rect', x, y, w, h);
    it.fill = null; it.stroke = null;
    it.text = OP.newText(paras);
    return it;
  };
  OP.newImage = function (assetId, x, y, w, h) {
    var it = base('image', x, y, w, h);
    it.asset = assetId;
    it.crop = { l: 0, t: 0, r: 0, b: 0 };
    it.stroke = null;
    return it;
  };

  OP.itemLabel = function (it) {
    if (it.name) return it.name;
    if (it.type === 'image') return 'Picture';
    if (it.type === 'table') return 'Table ' + it.rows.length + ' × ' + it.cols.length;
    if (it.wa) return 'WordArt: ' + String(it.wa.text || '').replace(/\s+/g, ' ').slice(0, 20);
    if (it.text) {
      var s = OP.plainText(it.text).replace(/\s+/g, ' ').trim();
      if (s) return s.length > 28 ? s.slice(0, 28) + '…' : s;
      if (!it.fill && !it.stroke) return 'Text box';
    }
    var d = OP.SHAPE_KINDS && OP.SHAPE_KINDS[it.kind];
    return d ? d.label : 'Shape';
  };

  OP.plainText = function (text) {
    if (!text) return '';
    return text.paras.map(function (p) { return p.runs.map(function (r) { return r.t; }).join(''); }).join('\n');
  };

  /** Add an image (data URL) to the document's asset table, re-using identical entries. */
  OP.addAsset = function (doc, dataUrl, info) {
    for (var k in doc.assets) if (doc.assets[k].src === dataUrl) return k;
    var id = OP.uid('a');
    doc.assets[id] = { src: dataUrl, w: (info && info.w) || 0, h: (info && info.h) || 0, note: (info && info.note) || '' };
    return id;
  };

  /** Drop assets no item refers to (called before saving). */
  OP.pruneAssets = function (doc) {
    var used = {};
    doc.pages.forEach(function (p) {
      p.items.forEach(function (it) {
        if (it.asset) used[it.asset] = true;
        if (it.fill && it.fill.type === 'image') used[it.fill.asset] = true;
      });
    });
    (doc.masters || []).forEach(function (m) { m.items.forEach(function (it) { if (it.asset) used[it.asset] = true; if (it.fill && it.fill.type === 'image') used[it.fill.asset] = true; }); });
    Object.keys(doc.assets).forEach(function (k) { if (!used[k]) delete doc.assets[k]; });
  };

  /** Validate / repair a document loaded from disk so the editor never meets missing fields. */
  OP.normaliseDoc = function (d) {
    if (!d || typeof d !== 'object' || !Array.isArray(d.pages)) throw new Error('This is not an OpenPub project file.');
    var doc = OP.newDoc(+d.w || undefined, +d.h || undefined);
    doc.name = typeof d.name === 'string' ? d.name : 'Untitled';
    doc.bleed = +d.bleed || 0;
    if (d.margins) ['l', 't', 'r', 'b'].forEach(function (k) { if (isFinite(+d.margins[k])) doc.margins[k] = +d.margins[k]; });
    doc.assets = {};
    if (d.assets) Object.keys(d.assets).forEach(function (k) {
      var a = d.assets[k];
      if (a && typeof a.src === 'string' && /^data:image\//.test(a.src)) doc.assets[k] = { src: a.src, w: +a.w || 0, h: +a.h || 0, note: a.note || '' };
    });
    function normPage(p) {
      var pg = OP.newPage();
      if (p.id) pg.id = String(p.id);
      if (typeof p.bg === 'string') pg.bg = p.bg;
      if (p.name) pg.name = String(p.name);
      if (p.master) pg.master = String(p.master);
      if (p.guides) {
        pg.guides.h = (p.guides.h || []).map(Number).filter(isFinite);
        pg.guides.v = (p.guides.v || []).map(Number).filter(isFinite);
      }
      pg.items = (p.items || []).map(normItem).filter(Boolean);
      return pg;
    }
    doc.pages = d.pages.map(normPage);
    doc.masters = Array.isArray(d.masters) ? d.masters.map(normPage) : [];
    if (d.merge && Array.isArray(d.merge.fields) && Array.isArray(d.merge.rows)) {
      doc.merge = { fields: d.merge.fields.map(String), rows: d.merge.rows.map(function (r) { return (r || []).map(String); }), at: 0, preview: false };
    }
    if (!doc.pages.length) doc.pages.push(OP.newPage());
    return doc;
  };

  function normRun(r) {
    var o = OP.newRun(String(r.t === undefined ? '' : r.t), { font: r.font || 'Arial', size: +r.size || 12, b: !!r.b, i: !!r.i, u: !!r.u, color: r.color || '#000000' });
    if (r.s) o.s = true;
    if (r.caps) o.caps = true;
    if (+r.sp) o.sp = +r.sp;
    return o;
  }
  function normText(t) {
    var out = OP.newText((t.paras || []).map(function (p) {
      var runs = (p.runs || []).map(normRun);
      if (!runs.length) runs = [OP.newRun('')];
      var np = OP.newPara(runs, { align: p.align || 'left', ls: +p.ls || 1, lsPt: p.lsPt ? +p.lsPt : null, before: +p.before || 0,
        after: +p.after || 0, indent: +p.indent || 0, left: +p.left || 0, right: +p.right || 0, bullet: p.bullet || null });
      if (p.num) np.num = true;
      return np;
    }));
    if (!out.paras.length) out.paras = [OP.newPara()];
    out.valign = t.valign || 'top';
    if (Array.isArray(t.pad) && t.pad.length === 4) out.pad = t.pad.map(function (v) { return +v || 0; });
    out.fit = t.fit === 'shrink' || t.fit === 'grow' ? t.fit : 'none';
    if (t.hyph) out.hyph = true;
    if (+t.cols > 1) { out.cols = Math.min(8, Math.round(+t.cols)); out.gap = isFinite(+t.gap) ? +t.gap : 12; }
    return out;
  }
  OP.normText = normText;
  function normTable(s) {
    if (!Array.isArray(s.rows) || !Array.isArray(s.cols) || !Array.isArray(s.cells) || !s.rows.length || !s.cols.length) return null;
    var it = OP.newTable(s.rows.length, s.cols.length, 0, 0, 10, 10);
    it.rows = s.rows.map(function (v) { return Math.max(0.01, +v || 1); });
    it.cols = s.cols.map(function (v) { return Math.max(0.01, +v || 1); });
    for (var r = 0; r < it.rows.length; r++) for (var c = 0; c < it.cols.length; c++) {
      var src = s.cells[r] && s.cells[r][c];
      if (src === null) { it.cells[r][c] = null; continue; }
      if (!src) continue;
      var cell = OP.newCell();
      if (src.text && Array.isArray(src.text.paras)) cell.text = normText(src.text);
      cell.fill = typeof src.fill === 'string' ? src.fill : null;
      cell.cs = Math.max(1, Math.min(it.cols.length - c, src.cs | 0 || 1));
      cell.rs = Math.max(1, Math.min(it.rows.length - r, src.rs | 0 || 1));
      it.cells[r][c] = cell;
    }
    if (s.grid) it.grid = { color: s.grid.color || '#000000', width: isFinite(+s.grid.width) ? +s.grid.width : 0.75 };
    return it;
  }
  function normItem(s) {
    if (!s || (s.type !== 'shape' && s.type !== 'image' && s.type !== 'table')) return null;
    var it = s.type === 'image' ? OP.newImage(s.asset, 0, 0, 10, 10) : s.type === 'table' ? normTable(s) : OP.newShape(s.kind, 0, 0, 10, 10);
    if (!it) return null;
    ['x', 'y', 'w', 'h', 'rot', 'opacity'].forEach(function (k) { if (isFinite(+s[k])) it[k] = +s[k]; });
    ['flipH', 'flipV', 'locked', 'hidden', 'arrowStart', 'arrowEnd'].forEach(function (k) { if (k in s) it[k] = !!s[k]; });
    if (s.id) it.id = String(s.id);
    it.name = s.name ? String(s.name) : '';
    it.group = s.group || null;
    it.shadow = s.shadow || null;
    if (s.wrap && (s.wrap.mode === 'square' || s.wrap.mode === 'tight')) it.wrap = { mode: s.wrap.mode, dist: Math.max(0, +s.wrap.dist || 0) };
    if (s.type === 'table') return it;
    if (s.type === 'image') {
      if (s.crop) it.crop = { l: +s.crop.l || 0, t: +s.crop.t || 0, r: +s.crop.r || 0, b: +s.crop.b || 0 };
      it.stroke = s.stroke || null;
      if (s.adj) it.adj = { br: isFinite(+s.adj.br) ? +s.adj.br : 1, ct: isFinite(+s.adj.ct) ? +s.adj.ct : 1, sat: isFinite(+s.adj.sat) ? +s.adj.sat : 1, gray: !!s.adj.gray, sepia: !!s.adj.sepia };
      if (s.mask === 'ellipse' || s.mask === 'round') it.mask = s.mask;
      return it;
    }
    if (s.next) it.next = String(s.next);
    if (s.wa && typeof s.wa === 'object') it.wa = { text: String(s.wa.text || ''), font: String(s.wa.font || 'Arial'), b: !!s.wa.b, i: !!s.wa.i, warp: String(s.wa.warp || 'plain') };
    it.fill = s.fill === undefined ? it.fill : s.fill;
    it.stroke = s.stroke === undefined ? it.stroke : s.stroke;
    if (s.radius !== undefined) it.radius = +s.radius || 0;
    if (s.path) it.path = s.path;
    if (s.text && Array.isArray(s.text.paras)) it.text = normText(s.text);
    return it;
  }
})();
