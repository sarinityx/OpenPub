/* OpenPub – tables. A table is one item: column and row sizes are stored as weights that are
 * scaled to the item's width and height, cells hold rich text, a fill and optional spans. */
var OP = (typeof globalThis.OP !== 'undefined') ? globalThis.OP : (globalThis.OP = {});

(function () {
  'use strict';

  OP.newCell = function (paras) {
    var t = OP.newText(paras);
    t.pad = [3, 2, 3, 2];
    return { text: t, fill: null, cs: 1, rs: 1 };
  };
  OP.newTable = function (rows, cols, x, y, w, h) {
    var it = {
      id: OP.uid('i'), type: 'table', name: '', x: x, y: y, w: w, h: h, rot: 0, flipH: false, flipV: false,
      opacity: 1, locked: false, hidden: false, group: null, shadow: null,
      cols: [], rows: [], cells: [], grid: { color: '#000000', width: 0.75 }
    };
    for (var c = 0; c < cols; c++) it.cols.push(1);
    for (var r = 0; r < rows; r++) {
      it.rows.push(1);
      var row = [];
      for (c = 0; c < cols; c++) row.push(OP.newCell());
      it.cells.push(row);
    }
    return it;
  };

  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s || 1; }
  /** Grid line positions in item space. */
  OP.tableGeom = function (it) {
    var xs = [0], ys = [0], tw = sum(it.cols), th = sum(it.rows), i;
    for (i = 0; i < it.cols.length; i++) xs.push(xs[i] + it.cols[i] / tw * it.w);
    for (i = 0; i < it.rows.length; i++) ys.push(ys[i] + it.rows[i] / th * it.h);
    return { xs: xs, ys: ys };
  };
  OP.cellRect = function (it, r, c, g) {
    g = g || OP.tableGeom(it);
    var cell = it.cells[r][c] || { cs: 1, rs: 1 };
    var c1 = Math.min(it.cols.length, c + (cell.cs || 1)), r1 = Math.min(it.rows.length, r + (cell.rs || 1));
    return { x: g.xs[c], y: g.ys[r], w: g.xs[c1] - g.xs[c], h: g.ys[r1] - g.ys[r] };
  };
  /** A stand-in item so a cell's text can be laid out and edited like a text box. */
  OP.cellItem = function (it, r, c, g) {
    var rc = OP.cellRect(it, r, c, g), cell = it.cells[r][c];
    return { id: it.id + ':' + r + ':' + c, type: 'shape', kind: 'rect', x: rc.x, y: rc.y, w: rc.w, h: rc.h, text: cell.text };
  };
  /** Cell under a page point: {r, c}, resolving merged cells to their owner. */
  OP.cellAt = function (it, px, py) {
    var p = OP.toLocal(it, px, py), g = OP.tableGeom(it), r = -1, c = -1, i;
    for (i = 0; i < it.cols.length; i++) if (p.x >= g.xs[i] && p.x <= g.xs[i + 1]) { c = i; break; }
    for (i = 0; i < it.rows.length; i++) if (p.y >= g.ys[i] && p.y <= g.ys[i + 1]) { r = i; break; }
    if (r < 0 || c < 0) return null;
    return OP.cellOwner(it, r, c);
  };
  OP.cellOwner = function (it, r, c) {
    if (it.cells[r][c]) return { r: r, c: c };
    for (var rr = r; rr >= 0; rr--) for (var cc = c; cc >= 0; cc--) {
      var k = it.cells[rr][cc];
      if (k && rr + (k.rs || 1) > r && cc + (k.cs || 1) > c) return { r: rr, c: cc };
    }
    return { r: r, c: c };
  };
  OP.eachCell = function (it, fn) {
    for (var r = 0; r < it.rows.length; r++) for (var c = 0; c < it.cols.length; c++) if (it.cells[r] && it.cells[r][c]) fn(it.cells[r][c], r, c);
  };
  OP.tableText = function (it) {
    var out = [];
    OP.eachCell(it, function (cell) { var t = OP.plainText(cell.text); if (t) out.push(t); });
    return out.join(' | ');
  };

  // ---------------------------------------------------------------- structure edits
  function styleLike(cell) {
    var n = OP.newCell();
    if (cell) {
      n.fill = cell.fill;
      var p = cell.text.paras[0], r = p.runs[0];
      n.text.paras = [OP.newPara([OP.newRun('', { font: r.font, size: r.size, b: r.b, i: r.i, color: r.color })], { align: p.align })];
      n.text.valign = cell.text.valign; n.text.pad = cell.text.pad.slice();
    }
    return n;
  }
  function unmergeAll(it) {
    OP.eachCell(it, function (cell) { cell.cs = 1; cell.rs = 1; });
    for (var r = 0; r < it.rows.length; r++) for (var c = 0; c < it.cols.length; c++) if (!it.cells[r][c]) it.cells[r][c] = OP.newCell();
  }
  function hasSpans(it) { var s = false; OP.eachCell(it, function (cell) { if ((cell.cs || 1) > 1 || (cell.rs || 1) > 1) s = true; }); return s; }

  /** Insert a row at index r (0 = top). The table grows taller. */
  OP.tableInsertRow = function (it, r) {
    if (hasSpans(it)) unmergeAll(it);
    var ref = Math.max(0, Math.min(it.rows.length - 1, r > 0 ? r - 1 : 0));
    var th = sum(it.rows), rowH = it.rows[ref] / th * it.h;
    it.cells.splice(r, 0, it.cells[ref].map(styleLike));
    it.rows.splice(r, 0, it.rows[ref]);
    it.h += rowH;
  };
  OP.tableInsertCol = function (it, c) {
    if (hasSpans(it)) unmergeAll(it);
    var ref = Math.max(0, Math.min(it.cols.length - 1, c > 0 ? c - 1 : 0));
    var tw = sum(it.cols), colW = it.cols[ref] / tw * it.w;
    it.cells.forEach(function (row) { row.splice(c, 0, styleLike(row[ref])); });
    it.cols.splice(c, 0, it.cols[ref]);
    it.w += colW;
  };
  OP.tableDeleteRow = function (it, r) {
    if (it.rows.length < 2) return false;
    if (hasSpans(it)) unmergeAll(it);
    var rowH = it.rows[r] / sum(it.rows) * it.h;
    it.cells.splice(r, 1); it.rows.splice(r, 1);
    it.h = Math.max(4, it.h - rowH);
    return true;
  };
  OP.tableDeleteCol = function (it, c) {
    if (it.cols.length < 2) return false;
    if (hasSpans(it)) unmergeAll(it);
    var colW = it.cols[c] / sum(it.cols) * it.w;
    it.cells.forEach(function (row) { row.splice(c, 1); });
    it.cols.splice(c, 1);
    it.w = Math.max(4, it.w - colW);
    return true;
  };
  /** Merge the cell with its right-hand (dir 'r') or lower (dir 'd') neighbour. */
  OP.tableMerge = function (it, r, c, dir) {
    var cell = it.cells[r][c];
    if (!cell) return false;
    var cs = cell.cs || 1, rs = cell.rs || 1, i, other;
    if (dir === 'r') {
      if (c + cs >= it.cols.length) return false;
      for (i = r; i < r + rs; i++) { other = it.cells[i][c + cs]; if (!other || (other.cs || 1) > 1 || (other.rs || 1) > 1 && rs === 1) return false; }
      for (i = r; i < r + rs; i++) { appendText(cell, it.cells[i][c + cs]); it.cells[i][c + cs] = null; }
      cell.cs = cs + 1;
    } else {
      if (r + rs >= it.rows.length) return false;
      for (i = c; i < c + cs; i++) { other = it.cells[r + rs][i]; if (!other || (other.cs || 1) > 1 || (other.rs || 1) > 1) return false; }
      for (i = c; i < c + cs; i++) { appendText(cell, it.cells[r + rs][i]); it.cells[r + rs][i] = null; }
      cell.rs = rs + 1;
    }
    return true;
  };
  function appendText(into, from) {
    if (from && OP.plainText(from.text).trim()) into.text.paras = into.text.paras.concat(from.text.paras);
  }
  OP.tableSplit = function (it, r, c) {
    var cell = it.cells[r][c];
    if (!cell || ((cell.cs || 1) === 1 && (cell.rs || 1) === 1)) return false;
    for (var i = r; i < r + (cell.rs || 1); i++) for (var j = c; j < c + (cell.cs || 1); j++) if (!it.cells[i][j]) it.cells[i][j] = styleLike(cell);
    cell.cs = 1; cell.rs = 1;
    return true;
  };
  /** Grow rows so no cell's text is cut off. Returns true if anything changed. */
  OP.tableFitRows = function (it) {
    var g = OP.tableGeom(it), need = it.rows.map(function (_, r) { return g.ys[r + 1] - g.ys[r]; }), changed = false;
    OP.eachCell(it, function (cell, r, c) {
      if ((cell.rs || 1) > 1) return;
      var hgt = OP.textHeight(OP.cellItem(it, r, c, g));
      if (hgt > need[r] + 0.5) { need[r] = hgt; changed = true; }
    });
    if (!changed) return false;
    it.rows = need.slice();
    it.h = sum(need);
    return true;
  };

  // ---------------------------------------------------------------- drawing
  OP.drawTable = function (ctx, doc, it, opts) {
    var g = OP.tableGeom(it), env = opts && opts.env, skip = opts && opts.skipCell;
    OP.eachCell(it, function (cell, r, c) {
      var rc = OP.cellRect(it, r, c, g);
      if (cell.fill) { ctx.fillStyle = cell.fill; ctx.fillRect(rc.x, rc.y, rc.w, rc.h); }
    });
    OP.eachCell(it, function (cell, r, c) {
      if (skip && skip.id === it.id && skip.r === r && skip.c === c) return;
      var ci = OP.cellItem(it, r, c, g);
      ctx.save();
      ctx.translate(ci.x, ci.y);
      OP.drawTextCols(ctx, null, ci, env);
      ctx.restore();
    });
    var gr = it.grid;
    if (gr && gr.width > 0) {
      ctx.strokeStyle = gr.color; ctx.lineWidth = gr.width; ctx.lineJoin = 'miter';
      ctx.beginPath();
      OP.eachCell(it, function (cell, r, c) { var rc = OP.cellRect(it, r, c, g); ctx.rect(rc.x, rc.y, rc.w, rc.h); });
      ctx.stroke();
    }
  };

  /** SVG for a table in item space. textSvg(item) returns the markup for one cell's text. */
  OP.tableSvg = function (it, textSvg) {
    var g = OP.tableGeom(it), r2 = OP.round, s = '', esc = OP.escXml, d = '';
    OP.eachCell(it, function (cell, r, c) {
      var rc = OP.cellRect(it, r, c, g);
      if (cell.fill) s += '<rect x="' + r2(rc.x) + '" y="' + r2(rc.y) + '" width="' + r2(rc.w) + '" height="' + r2(rc.h) + '" fill="' + esc(cell.fill) + '"/>';
      d += 'M' + r2(rc.x) + ' ' + r2(rc.y) + 'h' + r2(rc.w) + 'v' + r2(rc.h) + 'h' + r2(-rc.w) + 'Z';
    });
    OP.eachCell(it, function (cell, r, c) {
      var ci = OP.cellItem(it, r, c, g);
      s += '<g transform="translate(' + r2(ci.x) + ' ' + r2(ci.y) + ')">' + textSvg(ci) + '</g>';
    });
    if (it.grid && it.grid.width > 0) s += '<path d="' + d + '" fill="none" stroke="' + esc(it.grid.color) + '" stroke-width="' + r2(it.grid.width) + '"/>';
    return s;
  };
})();
