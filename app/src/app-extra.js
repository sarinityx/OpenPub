/* OpenPub – tables, WordArt, linked text, picture adjustments, master pages, mail merge,
 * building blocks, find and replace and spelling: commands, panels and dialogs. */
var OP = (typeof globalThis.OP !== 'undefined') ? globalThis.OP : (globalThis.OP = {});

(function () {
  'use strict';
  var A = OP.app, S = A.S, $ = A.$, h = A.h, MM = OP.MM, ui = A.ui;
  OP.desktop = (typeof window !== 'undefined' && window.openpubDesktop) || null;

  function centre(w, hh) { var d = S.doc; return { x: (d.w - w) / 2, y: (d.h - hh) / 2 }; }
  function insert(items) { A.setTool('select'); A.addItems(items); A.showTab('props'); }
  function field(id, value, unit, min, max, step) {
    var inp = h('input', { type: 'number', id: id, min: min, max: max, step: step || 1 });
    inp.value = value;
    return h('div', { class: 'f' }, [inp, unit ? h('span', { text: unit }) : null]);
  }
  function rowL(label, kids, forId) { return h('div', { class: 'row' }, [h('label', { text: label, for: forId || null })].concat(kids)); }
  function val(id, fb) { var v = parseFloat($(id).value); return isFinite(v) ? v : fb; }
  function isEditing() { return A.isEditing(); }
  /** Type text at the caret when editing, otherwise drop it on the page as a new text box. */
  function insertTextOrBox(text) {
    if (isEditing()) { document.execCommand('insertText', false, text); return; }
    var d = S.doc, w = d.w * 0.4, hh = Math.max(24, d.w * 0.05), c = centre(w, hh);
    var st = S.lastStyle ? OP.clone(S.lastStyle) : { size: Math.max(12, Math.round(d.w / 34)) };
    insert([OP.newTextBox(c.x, c.y, w, hh, [OP.newPara([OP.newRun(text, st)])])]);
  }

  // ---------------------------------------------------------------- font picker
  // A drop-down that always lists every font (the browser's own datalist only shows names that
  // match what is already in the box). Typing narrows the list; each name is shown in its own font.
  var fp = null;
  var SYMBOL_FONT = /wingdings|webdings|symbol|marlett|mt extra|mdl2|fluent icons|emoji|bookshelf|dingbat|math/i;
  function closeFontPop() {
    if (!fp) return;
    fp.input.setAttribute('aria-expanded', 'false');
    fp.pop.remove(); fp = null;
  }
  A.fontNames = function () { return Array.prototype.map.call($('fontlist').options, function (o) { return o.value; }); };
  A.fontPicker = function (input) {
    input.classList.add('fontfield');
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false'); input.setAttribute('autocomplete', 'off');
    function setIdx(i, centre) {
      if (!fp) return;
      var kids = fp.pop.querySelectorAll('.fontopt');
      if (fp.idx >= 0 && kids[fp.idx]) kids[fp.idx].classList.remove('on');
      fp.idx = Math.max(-1, Math.min(kids.length - 1, i));
      if (fp.idx >= 0 && kids[fp.idx]) { kids[fp.idx].classList.add('on'); kids[fp.idx].scrollIntoView({ block: centre ? 'center' : 'nearest' }); }
    }
    function pick(name) {
      input.value = name; input.dataset.cur = name;
      closeFontPop();
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function open(filter) {
      closeFontPop();
      var all = A.fontNames(), q = (filter || '').toLowerCase();
      var list = q ? all.filter(function (n) { return n.toLowerCase().indexOf(q) >= 0; }) : all;
      if (q) list.sort(function (a, b) { return (a.toLowerCase().indexOf(q) === 0 ? 0 : 1) - (b.toLowerCase().indexOf(q) === 0 ? 0 : 1) || a.localeCompare(b); });
      var pop = h('div', { class: 'fontpop', role: 'listbox', 'aria-label': 'Fonts' });
      list.forEach(function (n) {
        var opt = h('div', { class: 'fontopt', role: 'option', title: n, text: n });
        if (!SYMBOL_FONT.test(n)) opt.style.fontFamily = OP.fontStack(n);
        opt.addEventListener('mousedown', function (e) { e.preventDefault(); pick(n); });
        pop.appendChild(opt);
      });
      if (!list.length) pop.appendChild(h('div', { class: 'fontnone', text: 'No installed font has that name. Press Enter to use it as typed.' }));
      else if (!q) pop.insertBefore(h('div', { class: 'fontnone', text: all.length + ' fonts. Type to narrow the list.' }), pop.firstChild);
      var r = input.getBoundingClientRect(), below = window.innerHeight - r.bottom - 10, above = r.top - 10, up = below < 180 && above > below;
      pop.style.left = Math.max(6, Math.min(r.left, window.innerWidth - 276)) + 'px';
      pop.style.maxHeight = Math.max(120, Math.min(420, up ? above : below)) + 'px';
      if (up) pop.style.bottom = (window.innerHeight - r.top + 3) + 'px'; else pop.style.top = (r.bottom + 3) + 'px';
      document.body.appendChild(pop);
      fp = { input: input, pop: pop, list: list, idx: -1 };
      input.setAttribute('aria-expanded', 'true');
      var cur = list.indexOf(input.dataset.cur || input.value);
      if (!q && cur >= 0) setIdx(cur, true); else if (q && list.length) setIdx(0, false);
    }
    input.addEventListener('focus', function () { input.dataset.cur = input.value; open(''); });
    input.addEventListener('mousedown', function () { if (document.activeElement === input && !fp) open(''); });
    input.addEventListener('input', function () { open(input.value.trim()); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!fp) open(''); else setIdx(fp.idx + (e.key === 'ArrowDown' ? 1 : -1), false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (fp && fp.idx >= 0) pick(fp.list[fp.idx]);
        else if (input.value.trim()) pick(input.value.trim());
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        input.value = input.dataset.cur || input.value;
        closeFontPop(); input.blur();
      }
    });
    input.addEventListener('blur', function () { setTimeout(closeFontPop, 0); });
  };
  document.addEventListener('mousedown', function (e) { if (fp && e.target !== fp.input && !fp.pop.contains(e.target)) closeFontPop(); }, true);
  window.addEventListener('resize', closeFontPop);
  document.addEventListener('scroll', function (e) { if (fp && e.target !== fp.pop) closeFontPop(); }, true);

  // ---------------------------------------------------------------- every text in the document
  /** Calls fn(textObject, where) for each text box, table cell and master text. where = {page, item, master}. */
  function eachText(fn) {
    function scan(pg, pi, master) {
      pg.items.forEach(function (it) {
        if (it.type === 'table') OP.eachCell(it, function (cell) { fn(cell.text, { page: pi, item: it, master: master }); });
        else if (it.text && !it.wa) fn(it.text, { page: pi, item: it, master: master });
      });
    }
    S.doc.pages.forEach(function (p, i) { scan(p, i, null); });
    (S.doc.masters || []).forEach(function (m) { scan(m, -1, m.id); });
  }
  function eachWordArt(fn) {
    S.doc.pages.forEach(function (p, i) { p.items.forEach(function (it) { if (it.wa) fn(it, { page: i, item: it, master: null }); }); });
    (S.doc.masters || []).forEach(function (m) { m.items.forEach(function (it) { if (it.wa) fn(it, { page: -1, item: it, master: m.id }); }); });
  }
  function reveal(where) {
    if (where.master) { S.master = where.master; A.refreshAll(); }
    else if (S.master || where.page !== S.pi) A.gotoPage(where.page);
    A.setSel([where.item.id]);
  }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // ---------------------------------------------------------------- tables
  A.dlgTable = function () {
    A.modal('Insert table', [
      rowL('Rows', [field('tbR', 4, '', 1, 60)], 'tbR'), rowL('Columns', [field('tbC', 3, '', 1, 20)], 'tbC'),
      h('label', { style: 'display:flex;gap:7px;align-items:center' }, [h('input', { type: 'checkbox', id: 'tbH', checked: true }), 'Shaded header row'])
    ], [{ label: 'Cancel' }, { label: 'Insert', cls: 'primary', fn: function () {
      var r = OP.clamp(Math.round(val('tbR', 4)), 1, 60), c = OP.clamp(Math.round(val('tbC', 3)), 1, 20), d = S.doc;
      var size = Math.max(9, Math.round(d.w / 50)), w = d.w * 0.7, rowH = size * 1.9, at = centre(w, rowH * r);
      var tb = OP.newTable(r, c, at.x, at.y, w, rowH * r), head = $('tbH').checked;
      OP.eachCell(tb, function (cell, ri) {
        cell.text.paras = [OP.newPara([OP.newRun('', { size: size, b: head && ri === 0 })])];
        cell.text.valign = 'middle';
        if (head && ri === 0) cell.fill = '#e4e1da';
      });
      setTimeout(function () { insert([tb]); }, 0);
    } }]);
  };
  function tableProps(root, it) {
    var c = (S.cell && S.cell.id === it.id) ? S.cell : null, cell = c ? it.cells[c.r][c.c] : null;
    function act(fn) { return function () { if (it.locked) return; fn(); S.cell = null; A.commit(); A.refreshAll(); }; }
    var r = c ? c.r : it.rows.length - 1, cc = c ? c.c : it.cols.length - 1;
    var rows = [
      h('p', { class: 'hint', text: c ? 'Cell ' + (c.r + 1) + ' × ' + (c.c + 1) + ' is targeted. Double-click to type; Tab moves to the next cell.' : 'Click a cell to target it. Without one, changes apply to the last row/column or every cell.' }),
      h('div', { class: 'row wrap' }, [ui.btn('Row above', act(function () { OP.tableInsertRow(it, r); })), ui.btn('Row below', act(function () { OP.tableInsertRow(it, r + 1); })), ui.btn('Delete row', act(function () { if (!OP.tableDeleteRow(it, r)) A.toast('A table needs at least one row.'); }), 'danger')]),
      h('div', { class: 'row wrap' }, [ui.btn('Column left', act(function () { OP.tableInsertCol(it, cc); })), ui.btn('Column right', act(function () { OP.tableInsertCol(it, cc + 1); })), ui.btn('Delete column', act(function () { if (!OP.tableDeleteCol(it, cc)) A.toast('A table needs at least one column.'); }), 'danger')])
    ];
    if (c) rows.push(h('div', { class: 'row wrap' }, [
      ui.btn('Merge right', act(function () { if (!OP.tableMerge(it, c.r, c.c, 'r')) A.toast('That cell cannot be merged to the right.'); })),
      ui.btn('Merge down', act(function () { if (!OP.tableMerge(it, c.r, c.c, 'd')) A.toast('That cell cannot be merged downwards.'); })),
      (cell && ((cell.cs || 1) > 1 || (cell.rs || 1) > 1)) ? ui.btn('Split', act(function () { OP.tableSplit(it, c.r, c.c); })) : null
    ]));
    var fillOf = cell ? cell.fill : null, anyFill = fillOf;
    if (!cell) OP.eachCell(it, function (k) { anyFill = anyFill || k.fill; });
    function setFill(v, final) { if (cell) cell.fill = v; else OP.eachCell(it, function (k) { k.fill = v; }); ui.live(final); }
    rows.push(ui.row(cell ? 'Cell fill' : 'All cells', [ui.color('tbFill', anyFill || '#ffffff', function (v, f) { setFill(v, f); }, 'Cell fill colour'), ui.btn('No fill', function () { setFill(null, true); A.refreshPanels(); })], 'tbFill'));
    var va = cell ? cell.text.valign : it.cells[0][0] ? it.cells[0][0].text.valign : 'top';
    rows.push(ui.row('Cell text', [ui.seg(['top', 'middle', 'bottom'].map(function (a, i) {
      return { icon: ['vT', 'vM', 'vB'][i], title: ['Top of cell', 'Middle of cell', 'Bottom of cell'][i], on: va === a, fn: function () {
        if (cell) cell.text.valign = a; else OP.eachCell(it, function (k) { k.text.valign = a; });
        ui.live(true); A.refreshPanels();
      } };
    }))]));
    rows.push(ui.row('Grid lines', [ui.color('tbGc', it.grid.color, function (v, f) { it.grid.color = v; ui.live(f); }, 'Grid colour'),
      ui.num('tbGw', it.grid.width, { unit: 'pt', min: 0, max: 20, step: 0.25 }, function (v, f) { it.grid.width = v; ui.live(f); })], 'tbGc'));
    rows.push(h('div', { class: 'row wrap' }, [
      ui.btn('Fit rows to text', function () { OP.tableFitRows(it); ui.live(true); A.refreshAll(); }),
      ui.btn('Equal rows', function () { it.rows = it.rows.map(function () { return 1; }); ui.live(true); }),
      ui.btn('Equal columns', function () { it.cols = it.cols.map(function () { return 1; }); ui.live(true); })
    ]));
    root.appendChild(ui.sec('Table  ' + it.rows.length + ' × ' + it.cols.length, rows));
  }

  // ---------------------------------------------------------------- WordArt
  A.insertWordArt = function () {
    var d = S.doc, w = d.w * 0.6, hh = d.w * 0.16, c = centre(w, hh);
    insert([OP.newWordArt('Your text', c.x, c.y, w, hh)]);
    setTimeout(function () { var f = $('waText'); if (f) { f.focus(); f.select(); } }, 40);
  };
  function wordArtProps(root, it) {
    var wa = it.wa;
    var ta = h('textarea', { id: 'waText', rows: 2, 'aria-label': 'WordArt text', spellcheck: 'false', style: 'width:100%;resize:vertical;border:1px solid var(--line);border-radius:5px;background:var(--field);padding:5px 7px' });
    ta.value = wa.text;
    ta.addEventListener('input', function () { wa.text = ta.value; A.invalidate(); });
    ta.addEventListener('change', function () { wa.text = ta.value; ui.live(true); });
    ta.addEventListener('keydown', function (e) { e.stopPropagation(); });
    var font = h('input', { type: 'text', id: 'waFont', 'aria-label': 'WordArt font', spellcheck: 'false' });
    font.value = wa.font;
    A.fontPicker(font);
    font.addEventListener('change', function () { if (font.value.trim()) { wa.font = font.value.trim(); ui.live(true); A.updateFontList(); } });
    font.addEventListener('focus', function () { font.select(); });
    root.appendChild(ui.sec('WordArt', [
      ta,
      h('div', { class: 'row' }, [h('div', { class: 'f' }, [font]), ui.seg([
        { txt: 'B', title: 'Bold', on: wa.b, fn: function () { wa.b = !wa.b; ui.live(true); A.refreshPanels(); } },
        { txt: '<i>I</i>', title: 'Italic', on: wa.i, fn: function () { wa.i = !wa.i; ui.live(true); A.refreshPanels(); } }])]),
      ui.row('Shape', [ui.select('waWarp', wa.warp, OP.WARPS, function (v) { wa.warp = v; ui.live(true); }, 'WordArt shape')], 'waWarp'),
      h('p', { class: 'hint', text: 'The text stretches to fill its frame. Colour, gradient, outline and shadow are set under Fill and outline.' })
    ]));
  }

  // ---------------------------------------------------------------- picture adjustments
  function pictureProps(root, it) {
    var adj = it.adj || { br: 1, ct: 1, sat: 1, gray: false, sepia: false };
    function set(k, v, final) { it.adj = it.adj || { br: 1, ct: 1, sat: 1, gray: false, sepia: false }; it.adj[k] = v; ui.live(final); }
    function slider(id, label, k) {
      var inp = h('input', { type: 'range', id: id, min: 0, max: 200, step: 1, 'aria-label': label });
      inp.value = Math.round((adj[k] === undefined ? 1 : adj[k]) * 100);
      inp.addEventListener('input', function () { set(k, inp.value / 100, false); });
      inp.addEventListener('change', function () { set(k, inp.value / 100, true); });
      return ui.row(label, [inp], id);
    }
    root.appendChild(ui.sec('Picture adjustments', [
      slider('pjB', 'Brightness', 'br'), slider('pjC', 'Contrast', 'ct'), slider('pjS', 'Saturation', 'sat'),
      ui.row('Tone', [ui.select('pjT', adj.gray ? 'gray' : adj.sepia ? 'sepia' : 'none', [['none', 'Full colour'], ['gray', 'Greyscale'], ['sepia', 'Sepia']], function (v) {
        it.adj = it.adj || { br: 1, ct: 1, sat: 1 }; it.adj.gray = v === 'gray'; it.adj.sepia = v === 'sepia'; ui.live(true);
      }, 'Picture tone')], 'pjT'),
      ui.row('Frame', [ui.select('pjM', it.mask || 'none', [['none', 'Rectangle'], ['round', 'Rounded corners'], ['ellipse', 'Oval']], function (v) {
        if (v === 'none') delete it.mask; else it.mask = v; ui.live(true);
      }, 'Picture frame shape')], 'pjM'),
      h('div', { class: 'row' }, [ui.btn('Reset adjustments', function () { delete it.adj; delete it.mask; ui.live(true); A.refreshPanels(); })])
    ]));
  }

  // ---------------------------------------------------------------- text flow (columns + linked boxes)
  function flowProps(root, it) {
    var tx = it.text, story = OP.storyOf(S.doc, it), ix = OP.docIndex(S.doc);
    var rows = [h('div', { class: 'pair' }, [
      ui.num('tfCols', tx.cols || 1, { pre: 'Columns', min: 1, max: 8, step: 1, dec: 0, aria: 'Columns' }, function (v, f) { v = Math.round(v); if (v > 1) { tx.cols = v; if (tx.gap === undefined) tx.gap = 12; } else { delete tx.cols; } ui.live(f); }),
      ui.num('tfGap', tx.gap === undefined ? 12 : tx.gap, { pre: 'Gap', unit: 'pt', min: 0, max: 200, step: 1, dec: 1, aria: 'Column gap' }, function (v, f) { tx.gap = v; ui.live(f); })
    ])];
    var headText = OP.storyHead(S.doc, it).text;
    rows.push(h('div', { class: 'row' }, [h('label', { style: 'display:flex;gap:7px;align-items:center;flex:1' }, [(function () {
      var cb = h('input', { type: 'checkbox', id: 'tfHyph' }); cb.checked = !!headText.hyph;
      cb.addEventListener('change', function () { if (cb.checked) headText.hyph = true; else delete headText.hyph; ui.live(true); });
      return cb;
    })(), 'Hyphenate words at line ends'])]));
    if (story) {
      var i = story.chain.indexOf(it), prev = story.chain[i - 1], next = story.chain[i + 1];
      rows.push(h('p', { class: 'hint', text: 'Box ' + (i + 1) + ' of ' + story.chain.length + ' in a linked story.' }));
      var go = function (b) { return function () { var pi = ix.pageOf[b.id]; if (pi >= 0 && pi !== S.pi) A.gotoPage(pi); A.setSel([b.id]); }; };
      rows.push(h('div', { class: 'row wrap' }, [prev ? ui.btn('◀ Previous box', go(prev)) : null, next ? ui.btn('Next box ▶', go(next)) : null]));
      rows.push(h('div', { class: 'row wrap' }, [
        ui.btn(next ? 'Break link after this box' : 'Unlink this box', function () { OP.unlinkBox(S.doc, it); A.commit(); A.refreshAll(); }, 'danger'),
        !next ? ui.btn('Continue in another box…', startLink(it)) : null
      ]));
    } else {
      rows.push(h('div', { class: 'row' }, [ui.btn('Continue in another box…', startLink(it))]));
      var over = OP.textCols(S.doc, it, null);
      if (over && over.overflow) rows.push(h('div', { class: 'note', text: 'There is more text than this box can show. Enlarge it, add columns, or continue the text in another box.' }));
    }
    root.appendChild(ui.sec('Text flow', rows));
  }
  function startLink(it) {
    return function () {
      S.linkFrom = it.id;
      $('ov').style.cursor = 'copy';
      A.toast('Click the empty text box the text should continue into. It can be on another page. Esc cancels.');
      A.invalidateOverlay();
    };
  }

  A.extraItemProps = function (root, sel) {
    if (sel.length !== 1) return;
    var it = sel[0];
    if (it.type === 'table') tableProps(root, it);
    else if (it.wa) wordArtProps(root, it);
    else if (it.type === 'image') pictureProps(root, it);
    else if (it.type === 'shape' && it.text && !isEditing()) flowProps(root, it);
    if (!isEditing()) wrapProps(root, it);
  };

  // ---------------------------------------------------------------- text wrap (this item pushes text aside)
  function wrapProps(root, it) {
    var w = it.wrap;
    var rows = [ui.row('Text nearby', [ui.select('wrMode', w ? w.mode : 'none', [['none', 'Runs over or under this'], ['square', 'Wraps around its box'], ['tight', 'Wraps tightly to its outline']], function (v) {
      if (v === 'none') delete it.wrap; else it.wrap = { mode: v, dist: w ? w.dist : 6 };
      OP.reindex(S.doc); ui.live(true); A.refreshPanels();
    }, 'How nearby text treats this object')], 'wrMode')];
    if (w) rows.push(ui.row('Distance', [ui.num('wrDist', OP.round(w.dist / MM, 1), { unit: 'mm', min: 0, max: 50, step: 0.5, dec: 1, aria: 'Wrap distance' }, function (v, f) { it.wrap.dist = v * MM; ui.live(f); })], 'wrDist'));
    if (w) rows.push(h('p', { class: 'hint', text: 'Text in overlapping text boxes on this page flows around this object, on both sides; a side narrower than 13 mm stays empty. On a master page, it pushes aside the text of every page that uses the master. While you type in a box the wrap is hidden; it returns when you finish.' }));
    root.appendChild(ui.sec('Text wrap', rows));
  }

  // ---------------------------------------------------------------- master pages
  A.editMaster = function (id) {
    if (isEditing()) A.endEdit();
    S.master = id || null; S.sel = []; S.cell = null;
    A.refreshAll();
    A.refreshToolbar();
  };
  function newMaster() {
    var d = S.doc, m = OP.newPage();
    m.name = 'Master ' + String.fromCharCode(65 + (d.masters.length % 26));
    d.masters.push(m);
    return m;
  }
  A.extraDocProps = function (root) {
    var d = S.doc, pg = d.pages[S.pi];
    if (S.master) {
      var m = A.page();
      root.appendChild(ui.sec('Master page', [
        h('div', { class: 'note', text: 'You are editing “' + (m.name || 'Master') + '”. Everything here appears behind the content of each page that uses it. Type {{page}} for the page number.' }),
        h('div', { class: 'row wrap' }, [ui.btn('Back to page ' + (S.pi + 1), function () { A.editMaster(null); }, 'primary'), ui.btn('Insert page number', function () { A.insertField('page'); }),
          ui.btn('Delete this master', function () {
            d.pages.forEach(function (p) { if (p.master === m.id) p.master = null; });
            d.masters = d.masters.filter(function (x) { return x !== m; });
            S.master = null; A.commit(); A.refreshAll();
          }, 'danger')])
      ]));
      return;
    }
    var opts = [['', 'None']].concat(d.masters.map(function (x) { return [x.id, x.name || 'Master']; })).concat([['+', 'New master page…']]);
    var rows = [ui.row('This page', [ui.select('mpSel', pg.master || '', opts, function (v) {
      if (v === '+') { var m2 = newMaster(); pg.master = m2.id; A.commit(); A.editMaster(m2.id); return; }
      pg.master = v || null; A.commit(); A.refreshAll();
    }, 'Master page for this page')], 'mpSel')];
    var btns = [];
    if (pg.master) btns.push(ui.btn('Edit master page', function () { A.editMaster(pg.master); }));
    if (pg.master && d.pages.length > 1) btns.push(ui.btn('Use on all pages', function () { d.pages.forEach(function (p) { p.master = pg.master; }); A.commit(); A.refreshAll(); }));
    if (btns.length) rows.push(h('div', { class: 'row wrap' }, btns));
    rows.push(h('p', { class: 'hint', text: 'A master page holds what repeats on every page: headers, footers, page numbers, borders.' }));
    root.appendChild(ui.sec('Master page', rows));
    if (d.merge) root.appendChild(ui.sec('Mail merge', mergeRows()));
  };
  A.insertField = function (name) { insertTextOrBox('{{' + name + '}}'); };
  /** Enter or leave master-page editing; creates a master for this page if it has none. */
  A.toggleMaster = function () {
    if (S.master) { A.editMaster(null); return; }
    var pg = S.doc.pages[S.pi];
    if (!pg.master) { var m = newMaster(); pg.master = m.id; A.commit(); }
    A.editMaster(pg.master);
  };

  // ---------------------------------------------------------------- mail merge
  /** Parse CSV or tab-separated text into rows of strings. */
  OP.parseCsv = function (text) {
    text = String(text).replace(/^﻿/, '');
    var firstLine = text.split(/\r?\n/)[0] || '', delim = firstLine.indexOf('\t') >= 0 ? '\t' : (firstLine.split(';').length > firstLine.split(',').length ? ';' : ',');
    var rows = [], row = [], cur = '', q = false, i, ch;
    for (i = 0; i < text.length; i++) {
      ch = text.charAt(i);
      if (q) {
        if (ch === '"') { if (text.charAt(i + 1) === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"' && cur === '') q = true;
      else if (ch === delim) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text.charAt(i + 1) === '\n') i++;
        row.push(cur); cur = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else cur += ch;
    }
    row.push(cur);
    if (row.length > 1 || row[0] !== '') rows.push(row);
    return rows;
  };
  function setMergeData(text) {
    var rows = OP.parseCsv(text);
    if (rows.length < 2) { A.toast('The data needs a header row with field names and at least one record.', true); return false; }
    var fields = rows[0].map(function (f, i) { return f.trim() || 'Field' + (i + 1); });
    S.doc.merge = { fields: fields, rows: rows.slice(1).map(function (r) { return fields.map(function (_, i) { return r[i] === undefined ? '' : r[i]; }); }), at: 0, preview: true };
    A.commit(); A.refreshAll();
    return true;
  }
  function mergeRows() {
    var mg = S.doc.merge, n = mg.rows.length;
    function step(dv) { return function () { mg.at = (mg.at + dv + n) % n; mg.preview = true; A.invalidate(); A.refreshPagesSoon(); A.refreshPanels(); }; }
    return [
      h('p', { class: 'hint', text: n + (n === 1 ? ' record, ' : ' records, ') + mg.fields.length + ' fields: ' + mg.fields.join(', ') }),
      h('div', { class: 'row' }, [h('label', { style: 'display:flex;gap:7px;align-items:center;flex:1' }, [(function () {
        var cb = h('input', { type: 'checkbox', id: 'mgPrev' }); cb.checked = !!mg.preview;
        cb.addEventListener('change', function () { mg.preview = cb.checked; A.invalidate(); A.refreshPagesSoon(); A.refreshPanels(); });
        return cb;
      })(), 'Preview results'])]),
      mg.preview ? h('div', { class: 'row' }, [ui.btn('◀', step(-1)), h('span', { class: 'num', style: 'flex:1;text-align:center', text: 'Record ' + (mg.at + 1) + ' of ' + n }), ui.btn('▶', step(1))]) : null,
      h('div', { class: 'row wrap' }, [ui.btn('Mail merge…', function () { A.dlgMerge(); }), ui.btn('Export merged…', function () { A.dlgSheets('merge'); }, 'primary')])
    ];
  }
  A.dlgMerge = function () {
    var mg = S.doc.merge;
    var ta = h('textarea', { id: 'mgData', rows: 6, spellcheck: 'false', placeholder: 'Name,Company,City\nAlex Tan,Harbour Print,Sydney\n…', style: 'width:100%;font:12px var(--font-mono);border:1px solid var(--line);border-radius:5px;background:var(--field);padding:6px 8px;white-space:pre' });
    if (mg) ta.value = [mg.fields].concat(mg.rows).map(function (r) { return r.map(function (v) { return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\n');
    var file = h('input', { type: 'file', accept: '.csv,.tsv,.txt,text/csv,text/plain', hidden: true });
    file.addEventListener('change', function () {
      var f = file.files[0]; if (!f) return;
      var fr = new FileReader();
      fr.onload = function () { ta.value = String(fr.result); };
      fr.readAsText(f);
    });
    var body = [
      h('p', { text: 'Print one copy of this publication per record, with fields such as {{Name}} replaced by the data.' }),
      h('p', { class: 'hint', text: 'Paste a list (comma- or tab-separated, first line = field names; copying cells from Excel works), or load a CSV file.' }),
      ta, file,
      h('div', { class: 'row wrap' }, [ui.btn('Load CSV file…', function () { file.click(); }), ui.btn('Use this data', function () { if (setMergeData(ta.value)) A.dlgMerge(); }, 'primary'),
        mg ? ui.btn('Remove data', function () { S.doc.merge = null; A.commit(); A.refreshAll(); A.closeModal(); }, 'danger') : null])
    ];
    if (mg) {
      body.push(h('h3', { text: 'Insert a field', style: 'margin:6px 0 0;font-size:13px' }));
      body.push(h('div', { class: 'row wrap' }, mg.fields.map(function (f) { return ui.btn('{{' + f + '}}', function () { A.closeModal(); A.insertField(f); }); })));
      body.push(h('p', { class: 'hint', text: 'A field is inserted at the cursor while you are typing in a text box, otherwise as a new text box. You can also type {{Field name}} yourself. Give the whole field one format.' }));
    }
    A.modal('Mail merge', body, [{ label: 'Close' }].concat(mg ? [{ label: 'Export merged…', cls: 'primary', fn: function () { setTimeout(function () { A.dlgSheets('merge'); }, 0); } }] : []), { wide: true });
  };

  // ---------------------------------------------------------------- building blocks
  function txt(x, y, w, hh, str, o) {
    o = o || {};
    var paras = String(str).split('\n').map(function (line) { return OP.newPara([OP.newRun(line, { font: o.font || 'Arial', size: o.size || 12, b: !!o.b, i: !!o.i, color: o.color || '#1d1c19' })], { align: o.align || 'left', after: o.after || 0 }); });
    var it = OP.newTextBox(x, y, w, hh, paras);
    it.text.valign = o.valign || 'top';
    if (o.pad !== undefined) it.text.pad = [o.pad, o.pad, o.pad, o.pad];
    if (o.fill) it.fill = { type: 'solid', color: o.fill };
    if (o.stroke) it.stroke = o.stroke;
    return it;
  }
  function shape(kind, x, y, w, hh, fill, stroke) {
    var it = OP.newShape(kind, x, y, w, hh);
    it.fill = fill ? { type: 'solid', color: fill } : null;
    it.stroke = stroke || null;
    return it;
  }
  /** Built-in blocks. make(u) returns items laid out from (0,0); u = page width. */
  var BLOCKS = [
    { name: 'Heading band', cat: 'Headings', make: function (u) { var w = u * 0.9, hh = u * 0.16;
      return [shape('rect', 0, 0, w, hh, '#0a6c96'), txt(0, 0, w, hh, 'Event title here', { size: u * 0.065, b: true, color: '#ffffff', align: 'center', valign: 'middle' })]; } },
    { name: 'Title and strapline', cat: 'Headings', make: function (u) { var w = u * 0.8;
      return [txt(0, 0, w, u * 0.11, 'Big headline', { size: u * 0.08, b: true, font: 'Georgia' }), shape('rect', 0, u * 0.115, w * 0.25, u * 0.008, '#d4249b'), txt(0, u * 0.135, w, u * 0.06, 'A short line that says what this is about', { size: u * 0.032, color: '#625e56' })]; } },
    { name: 'Pull quote', cat: 'Text', make: function (u) { var w = u * 0.5, st = { color: '#0a6c96', width: Math.max(1, u * 0.004), dash: 'solid' };
      var a = OP.newShape('line', 0, 0, w, 0), b = OP.newShape('line', 0, u * 0.2, w, 0); a.stroke = st; b.stroke = OP.clone(st);
      return [a, txt(0, u * 0.01, w, u * 0.18, '“A sentence worth repeating, set large so it catches the eye.”', { size: u * 0.034, i: true, font: 'Georgia', align: 'center', valign: 'middle', color: '#0a6c96' }), b]; } },
    { name: 'Sidebar', cat: 'Text', make: function (u) { var w = u * 0.36, hh = u * 0.5;
      return [shape('rect', 0, 0, w, hh, '#ece9e2'), shape('rect', 0, 0, w, u * 0.012, '#d4249b'),
        txt(0, u * 0.02, w, u * 0.06, 'Did you know?', { size: u * 0.034, b: true, pad: u * 0.02 }), txt(0, u * 0.085, w, hh - u * 0.1, 'Use this panel for background facts, opening hours or a short story that supports the main article.', { size: u * 0.022, pad: u * 0.02 })]; } },
    { name: 'Contact details', cat: 'Text', make: function (u) { var w = u * 0.5;
      return [txt(0, 0, w, u * 0.17, 'Organisation name\n12 Example Street, Sydney NSW 2000\nPhone (02) 5550 0000\nhello@example.org', { size: u * 0.024, after: u * 0.004 })]; } },
    { name: 'Attention burst', cat: 'Accents', make: function (u) { var s = u * 0.26;
      return [shape('star24', 0, 0, s, s, '#f3d21b'), txt(0, 0, s, s, 'NEW!', { size: u * 0.055, b: true, align: 'center', valign: 'middle', color: '#b3261e' })]; } },
    { name: 'Price badge', cat: 'Accents', make: function (u) { var s = u * 0.22;
      return [shape('ellipse', 0, 0, s, s, '#b3261e'), txt(0, 0, s, s, 'only\n$10', { size: u * 0.045, b: true, align: 'center', valign: 'middle', color: '#ffffff' })]; } },
    { name: 'Arrow banner', cat: 'Accents', make: function (u) { var w = u * 0.5, hh = u * 0.12;
      return [shape('homeplate', 0, 0, w, hh, '#0a6c96'), txt(0, 0, w * 0.85, hh, 'This way', { size: u * 0.05, b: true, align: 'center', valign: 'middle', color: '#ffffff' })]; } },
    { name: 'Divider', cat: 'Accents', make: function (u) { var w = u * 0.7, a = OP.newShape('line', 0, u * 0.015, w * 0.45, 0), b = OP.newShape('line', w * 0.55, u * 0.015, w * 0.45, 0);
      a.stroke = { color: '#625e56', width: 1, dash: 'solid' }; b.stroke = OP.clone(a.stroke);
      return [a, shape('diamond', w / 2 - u * 0.015, 0, u * 0.03, u * 0.03, '#d4249b'), b]; } },
    { name: 'Coupon', cat: 'Page parts', make: function (u) { var w = u * 0.45, hh = u * 0.24;
      return [shape('rect', 0, 0, w, hh, '#ffffff', { color: '#1d1c19', width: 1.5, dash: 'dash' }), txt(0, u * 0.02, w, u * 0.07, '20% OFF', { size: u * 0.055, b: true, align: 'center' }),
        txt(0, u * 0.1, w, u * 0.1, 'Bring this coupon with you.\nValid until 31 December.', { size: u * 0.022, align: 'center' }), txt(u * 0.005, -u * 0.022, u * 0.05, u * 0.04, '✂', { size: u * 0.03 })]; } },
    { name: 'Tear-off strips', cat: 'Page parts', make: function (u) { var n = 8, w = u * 0.9, sw = w / n, hh = u * 0.3, out = [], i;
      var top = OP.newShape('line', 0, 0, w, 0); top.stroke = { color: '#1d1c19', width: 1, dash: 'dash' }; out.push(top);
      for (i = 0; i < n; i++) {
        var t = txt(i * sw + sw / 2 - hh / 2, hh / 2 - sw / 2, hh, sw, 'Call Sam\n0400 000 000', { size: u * 0.02, align: 'center', valign: 'middle' });
        t.rot = 270; out.push(t);
        if (i) { var l = OP.newShape('line', i * sw, 0, 0, hh); l.stroke = { color: '#1d1c19', width: 0.75, dash: 'dash' }; out.push(l); }
      }
      return out; } },
    { name: 'Picture with caption', cat: 'Page parts', make: function (u) { var w = u * 0.4, hh = u * 0.3;
      return [shape('rect', 0, 0, w, hh, '#d8d3c8'), txt(0, 0, w, hh, 'Replace with a picture', { size: u * 0.02, align: 'center', valign: 'middle', color: '#625e56' }), txt(0, hh + u * 0.008, w, u * 0.05, 'Caption describing the picture.', { size: u * 0.02, i: true })]; } },
    { name: 'Calendar (this month)', cat: 'Calendars', make: function (u) { return calendar(u, new Date()); } },
    { name: 'Calendar (next month)', cat: 'Calendars', make: function (u) { var d = new Date(); return calendar(u, new Date(d.getFullYear(), d.getMonth() + 1, 1)); } },
    { name: 'Timetable', cat: 'Tables', make: function (u) {
      var w = u * 0.8, size = u * 0.022, tb = OP.newTable(5, 4, 0, 0, w, size * 2.2 * 5), head = ['Time', 'Session', 'Room', 'Host'];
      OP.eachCell(tb, function (cell, r, c) { cell.text.paras = [OP.newPara([OP.newRun(r === 0 ? head[c] : (c === 0 ? (8 + r) + ':00' : ''), { size: size, b: r === 0, color: r === 0 ? '#ffffff' : '#1d1c19' })])]; cell.text.valign = 'middle'; cell.fill = r === 0 ? '#0a6c96' : (r % 2 ? null : '#f0eee9'); });
      tb.grid = { color: '#a8a39a', width: 0.5 };
      return [tb]; } }
  ];
  function calendar(u, date) {
    var y = date.getFullYear(), m = date.getMonth(), first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate();
    var lead = (first.getDay() + 6) % 7, weeks = Math.ceil((lead + days) / 7), w = u * 0.8, size = u * 0.024;
    var title = txt(0, 0, w, u * 0.075, first.toLocaleString('en-AU', { month: 'long', year: 'numeric' }), { size: u * 0.05, b: true, align: 'center' });
    var tb = OP.newTable(weeks + 1, 7, 0, u * 0.085, w, size * 1.8 + weeks * u * 0.085);
    tb.rows = [size * 1.8].concat(new Array(weeks).fill(u * 0.085));
    tb.grid = { color: '#a8a39a', width: 0.5 };
    var names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    OP.eachCell(tb, function (cell, r, c) {
      var n = (r - 1) * 7 + c - lead + 1, label = r === 0 ? names[c] : (n >= 1 && n <= days ? String(n) : '');
      cell.text.paras = [OP.newPara([OP.newRun(label, { size: size, b: r === 0, color: r === 0 ? '#ffffff' : (c >= 5 ? '#b3261e' : '#1d1c19') })], { align: r === 0 ? 'center' : 'right' })];
      cell.text.valign = r === 0 ? 'middle' : 'top';
      cell.fill = r === 0 ? '#1d1c19' : (c >= 5 ? '#f6f1ec' : null);
    });
    return [title, tb];
  }
  A.userBlocks = function () { return userBlocks(); };
  function userBlocks() { try { return JSON.parse(localStorage.getItem('openpub.blocks') || '[]'); } catch (e) { return []; } }
  function saveUserBlocks(list) { try { localStorage.setItem('openpub.blocks', JSON.stringify(list)); return true; } catch (e) { A.toast('The block could not be saved in this browser (it may be too large).', true); return false; } }

  function placeBlock(items, assets) {
    var d = S.doc, map = {};
    if (assets) Object.keys(assets).forEach(function (k) { map[k] = OP.addAsset(d, assets[k].src, assets[k]); });
    var gid = OP.uid('g'), b = OP.boundsOf(items), dx = (d.w - b.w) / 2 - b.x, dy = (d.h - b.h) / 2 - b.y;
    items.forEach(function (it) {
      it.id = OP.uid('i'); delete it.next;
      it.x += dx; it.y += dy;
      if (items.length > 1) it.group = gid;
      if (it.asset && map[it.asset]) it.asset = map[it.asset];
      if (it.fill && it.fill.type === 'image' && map[it.fill.asset]) it.fill.asset = map[it.fill.asset];
    });
    OP.ensureImages(d).then(function () { A.invalidate(); });
    insert(items);
  }
  function thumb(items, assets) {
    var b = OP.boundsOf(items), pad = 6, W = 132, H = 92, k = Math.min((W - pad * 2) / Math.max(1, b.w), (H - pad * 2) / Math.max(1, b.h));
    var dpr = Math.min(2, window.devicePixelRatio || 1), c = h('canvas', { width: W * dpr, height: H * dpr, style: 'width:' + W + 'px;height:' + H + 'px;background:#fff;border-radius:4px' });
    var ctx = c.getContext('2d'), tmp = { assets: assets || {}, pages: [], masters: [], w: b.w, h: b.h };
    function paint() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
      ctx.translate((W - b.w * k) / 2 - b.x * k, (H - b.h * k) / 2 - b.y * k);
      ctx.scale(k, k);
      items.forEach(function (it) { try { OP.drawItem(ctx, tmp, it, { pxPerPt: k * dpr }); } catch (e) { /* skip */ } });
    }
    paint();
    if (assets && Object.keys(assets).length) OP.ensureImages(tmp).then(paint);
    return c;
  }
  A.dlgBlocks = function () {
    var u = S.doc.w, mine = userBlocks(), body = [];
    function card(name, items, assets, onPick, onDelete) {
      var b = h('button', { type: 'button', class: 'blk', title: 'Insert ' + name, onclick: onPick }, [thumb(items, assets), h('span', { text: name })]);
      if (!onDelete) return b;
      return h('div', { style: 'position:relative' }, [b, h('button', { type: 'button', class: 'icon-btn', title: 'Delete this block', 'aria-label': 'Delete block ' + name, style: 'position:absolute;top:2px;right:2px;background:var(--panel)', html: A.icon('trash'), onclick: onDelete })]);
    }
    var cats = [];
    BLOCKS.forEach(function (b) { if (cats.indexOf(b.cat) < 0) cats.push(b.cat); });
    if (mine.length) {
      body.push(h('h3', { text: 'My blocks', style: 'margin:2px 0 0;font-size:13px' }));
      body.push(h('div', { class: 'blkgrid' }, mine.map(function (blk, i) {
        return card(blk.name, OP.clone(blk.items), blk.assets, function () { A.closeModal(); placeBlock(OP.clone(blk.items), blk.assets); },
          function () { var l = userBlocks(); l.splice(i, 1); saveUserBlocks(l); A.dlgBlocks(); });
      })));
    }
    cats.forEach(function (cat) {
      body.push(h('h3', { text: cat, style: 'margin:6px 0 0;font-size:13px' }));
      body.push(h('div', { class: 'blkgrid' }, BLOCKS.filter(function (b) { return b.cat === cat; }).map(function (b) {
        return card(b.name, b.make(u), null, function () { A.closeModal(); placeBlock(b.make(u), null); });
      })));
    });
    // blocks from content packs and plug-ins
    (A.extraBlockGroups ? A.extraBlockGroups(u) : []).forEach(function (g) {
      if (!g.blocks.length) return;
      body.push(h('h3', { text: g.cat, style: 'margin:6px 0 0;font-size:13px' }));
      body.push(h('div', { class: 'blkgrid' }, g.blocks.map(function (b) {
        return card(b.name, OP.clone(b.items), b.assets, function () { A.closeModal(); placeBlock(OP.clone(b.items), b.assets); });
      })));
    });
    var sel = A.selItems();
    A.modal('Building blocks', body, [{ label: 'Close' }].concat(sel.length ? [{ label: 'Save selection as a block…', fn: function () { setTimeout(saveBlockDialog, 0); } }] : []), { wide: true });
  };
  function saveBlockDialog() {
    var sel = A.selItems();
    if (!sel.length) return;
    var name = h('input', { type: 'text', id: 'bkName', maxlength: 40 });
    name.value = OP.itemLabel(sel[0]).slice(0, 40);
    A.modal('Save as building block', [h('div', { class: 'row' }, [h('label', { text: 'Name', for: 'bkName' }), h('div', { class: 'f' }, [name])]),
      h('p', { class: 'hint', text: 'Saved on this computer and offered in every document under My blocks.' })],
    [{ label: 'Cancel' }, { label: 'Save', cls: 'primary', fn: function () {
      var items = OP.clone(sel), assets = {};
      items.forEach(function (it) {
        delete it.next;
        [it.asset, it.fill && it.fill.type === 'image' ? it.fill.asset : null].forEach(function (k) { if (k && S.doc.assets[k]) assets[k] = S.doc.assets[k]; });
      });
      var list = userBlocks();
      list.push({ name: name.value.trim() || 'Block', items: items, assets: assets });
      if (saveUserBlocks(list)) A.toast('Saved to My blocks.');
    } }]);
  }

  // ---------------------------------------------------------------- find and replace
  var findPos = -1;
  A.dlgFind = function () {
    var f = h('input', { type: 'text', id: 'frFind', spellcheck: 'false' }), r = h('input', { type: 'text', id: 'frRep', spellcheck: 'false' });
    var info = h('p', { class: 'hint', text: 'Searches text boxes, tables, WordArt and master pages on every page.' });
    function rx(global) { var q = f.value; if (!q) return null; return new RegExp(escRe(q), (global ? 'g' : '') + ($('frCase').checked ? '' : 'i')); }
    function matches() {
      var re = rx(false), out = [];
      if (!re) return out;
      eachText(function (tx, where) { if (re.test(OP.plainText(tx)) && out.every(function (o) { return o.item !== where.item; })) out.push(where); });
      eachWordArt(function (it, where) { if (re.test(it.wa.text)) out.push(where); });
      return out;
    }
    A.modal('Find and replace', [
      h('div', { class: 'row' }, [h('label', { text: 'Find', for: 'frFind' }), h('div', { class: 'f' }, [f])]),
      h('div', { class: 'row' }, [h('label', { text: 'Replace with', for: 'frRep' }), h('div', { class: 'f' }, [r])]),
      h('label', { style: 'display:flex;gap:7px;align-items:center' }, [h('input', { type: 'checkbox', id: 'frCase' }), 'Match case']), info
    ], [{ label: 'Close' },
      { label: 'Find next', fn: function () {
        var m = matches();
        if (!m.length) { info.textContent = 'No matches.'; return false; }
        findPos = (findPos + 1) % m.length;
        reveal(m[findPos]);
        info.textContent = 'Match ' + (findPos + 1) + ' of ' + m.length + ' objects (selected behind this dialog).';
        return false;
      } },
      { label: 'Replace all', cls: 'primary', fn: function () {
        var re = rx(true), n = 0;
        if (!re) return false;
        var rep = r.value, sub = function (s) { return s.replace(re, function () { n++; return rep; }); };
        eachText(function (tx) { tx.paras.forEach(function (p) { p.runs.forEach(function (run) { run.t = sub(run.t); }); }); });
        eachWordArt(function (it) { it.wa.text = sub(it.wa.text); });
        if (n) { A.commit(); A.refreshAll(); }
        info.textContent = n ? n + ' replacement' + (n === 1 ? '' : 's') + ' made.' : 'No matches. Text with mixed formatting inside the phrase is not matched.';
        return false;
      } }]);
    findPos = -1;
  };

  // ---------------------------------------------------------------- spelling
  var WORD = /[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’]*/g;
  A.dlgSpell = async function () {
    if (!OP.desktop || !OP.desktop.spellCheck) {
      A.modal('Spelling', [h('p', { text: 'The spelling checker is part of the desktop app, which carries an Australian English dictionary. It is not available in the browser version.' })]);
      return;
    }
    if (isEditing()) A.endEdit();
    var words = {}, order = [];
    function take(s) { var m; WORD.lastIndex = 0; while ((m = WORD.exec(s))) { var w = m[0].replace(/[’']+$/, ''); if (w.length > 1 && !/^\d/.test(w) && !words[w]) { words[w] = true; order.push(w); } } }
    eachText(function (tx) { tx.paras.forEach(function (p) { p.runs.forEach(function (r) { if (r.t.indexOf('{{') < 0) take(r.t); }); }); });
    eachWordArt(function (it) { take(it.wa.text); });
    var bad;
    try { bad = await OP.desktop.spellCheck(order); } catch (e) { A.toast('The spelling checker could not start: ' + e.message, true); return; }
    var skip = {}, changed = 0, i = 0;
    function replaceAll(from, to) {
      var re = new RegExp('(^|[^A-Za-zÀ-ÿ])' + escRe(from) + '(?![A-Za-zÀ-ÿ])', 'g');
      eachText(function (tx) { tx.paras.forEach(function (p) { p.runs.forEach(function (r) { r.t = r.t.replace(re, function (all, pre) { changed++; return pre + to; }); }); }); });
      eachWordArt(function (it) { it.wa.text = it.wa.text.replace(re, function (all, pre) { changed++; return pre + to; }); });
    }
    function where(word) {
      var hit = null, re = new RegExp('(^|[^A-Za-zÀ-ÿ])' + escRe(word) + '(?![A-Za-zÀ-ÿ])');
      eachText(function (tx, w) { if (!hit) { var s = OP.plainText(tx), m = re.exec(s); if (m) hit = { w: w, ctx: s.slice(Math.max(0, m.index - 30), m.index + word.length + 30).replace(/\s+/g, ' ') }; } });
      eachWordArt(function (it, w) { if (!hit && re.test(it.wa.text)) hit = { w: w, ctx: it.wa.text }; });
      return hit;
    }
    async function next() {
      while (i < bad.length && skip[bad[i]]) i++;
      if (i >= bad.length) {
        if (changed) { A.commit(); A.refreshAll(); }
        A.modal('Spelling', [h('p', { text: bad.length ? 'Spelling check complete. ' + changed + ' change' + (changed === 1 ? '' : 's') + ' made.' : 'No spelling mistakes found in ' + order.length + ' different words.' })]);
        return;
      }
      var word = bad[i], hit = where(word);
      if (!hit) { i++; return next(); }
      reveal(hit.w);
      var sugg = [];
      try { sugg = await OP.desktop.spellSuggest(word); } catch (e) { sugg = []; }
      var inp = h('input', { type: 'text', id: 'spTo', spellcheck: 'false' });
      inp.value = sugg[0] || word;
      var list = h('div', { class: 'row wrap' }, sugg.slice(0, 8).map(function (s) { return ui.btn(s, function () { inp.value = s; }); }));
      A.modal('Spelling: ' + (i + 1) + ' of ' + bad.length, [
        h('p', null, ['Not in the dictionary: ', h('b', { text: word })]),
        h('p', { class: 'hint', text: '…' + hit.ctx + '…' }),
        h('div', { class: 'row' }, [h('label', { text: 'Change to', for: 'spTo' }), h('div', { class: 'f' }, [inp])]),
        sugg.length ? list : h('p', { class: 'hint', text: 'No suggestions.' })
      ], [
        { label: 'Stop', fn: function () { if (changed) { A.commit(); A.refreshAll(); } } },
        { label: 'Add to dictionary', fn: function () { OP.desktop.spellAdd(word); i++; setTimeout(next, 0); } },
        { label: 'Ignore', fn: function () { i++; setTimeout(next, 0); } },
        { label: 'Change all', cls: 'primary', fn: function () { var to = inp.value.trim(); if (to && to !== word) replaceAll(word, to); i++; setTimeout(next, 0); } }
      ]);
    }
    next();
  };

  // ---------------------------------------------------------------- overlay additions
  A.drawOverlayExtra = function (ctx, sel) {
    var selCol = A.css('--sel');
    if (S.cell && sel.length === 1 && sel[0].id === S.cell.id && sel[0].type === 'table' && !S.editCell) {
      var it = sel[0];
      if (it.cells[S.cell.r] && it.cells[S.cell.r][S.cell.c]) {
        var rc = OP.cellRect(it, S.cell.r, S.cell.c), cx = it.x + it.w / 2, cy = it.y + it.h / 2;
        var pts = [[rc.x, rc.y], [rc.x + rc.w, rc.y], [rc.x + rc.w, rc.y + rc.h], [rc.x, rc.y + rc.h]].map(function (p) {
          var q = OP.rotatePoint(it.x + p[0], it.y + p[1], cx, cy, it.rot || 0); return A.toScreen(q.x, q.y);
        });
        ctx.save();
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); pts.slice(1).forEach(function (p) { ctx.lineTo(p.x, p.y); }); ctx.closePath();
        ctx.fillStyle = 'rgba(10,132,201,0.14)'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = selCol; ctx.stroke();
        ctx.restore();
      }
    }
    // linked stories: mark where text comes from and goes to
    sel.forEach(function (it) {
      if (it.type !== 'shape' || !it.text) return;
      var st = OP.storyOf(S.doc, it);
      if (!st) return;
      var i = st.chain.indexOf(it), c = OP.itemCorners(it).map(function (p) { return A.toScreen(p.x, p.y); });
      ctx.save();
      ctx.font = '600 10px ' + getComputedStyle(document.body).getPropertyValue('--font-mono');
      ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      function badge(x, y, label) { ctx.fillStyle = selCol; ctx.fillRect(x - 15, y - 8, 30, 16); ctx.fillStyle = '#fff'; ctx.fillText(label, x, y + 0.5); }
      if (i > 0) badge(c[0].x + 15, c[0].y - 9, '◀ ' + i);
      if (i < st.chain.length - 1) badge(c[2].x - 15, c[2].y + 9, (i + 2) + ' ▶');
      ctx.restore();
    });
    var banner = S.linkFrom ? 'Click the empty text box the story should continue into   ·   Esc cancels' :
      S.master ? 'Editing master page “' + (A.page().name || 'Master') + '”   ·   click a page thumbnail to go back' :
        (S.doc.merge && S.doc.merge.preview) ? 'Mail merge preview: record ' + (S.doc.merge.at + 1) + ' of ' + S.doc.merge.rows.length : '';
    if (banner) {
      ctx.save();
      ctx.font = '600 12px ' + getComputedStyle(document.body).getPropertyValue('--font-ui');
      var w = ctx.measureText(banner).width + 24;
      ctx.fillStyle = S.linkFrom ? A.css('--accent') : A.css('--margin');
      ctx.fillRect((S.cw - w) / 2, 8, w, 24);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(banner, S.cw / 2, 20.5);
      ctx.restore();
    }
  };

  // ---------------------------------------------------------------- menus + toolbar
  A.extraToolbar = function (tb, tool) {
    A.registerIcons({
      table: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9.5h18M3 14.5h18M9 4v16M15 4v16"/>',
      wordart: '<path d="M4 18c3-9 5-12 8-12s5 3 8 12M7.5 13h9"/>',
      blocks: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><path d="M17 14v6M14 17h6"/>'
    });
    tb.insertBefore(h('div', { class: 'tb-group' }, [
      tool('tbTable', 'table', 'Table', 'Insert a table', function () { A.dlgTable(); }),
      tool('tbWordArt', 'wordart', 'WordArt', 'Insert WordArt: text bent into a shape', function () { A.insertWordArt(); }),
      tool('tbBlocks', 'blocks', 'Blocks', 'Building blocks: ready-made headings, calendars, coupons…', function () { A.dlgBlocks(); })
    ]), tb.children[1] || null);
  };
  A.extraMenus = function (defs) {
    function menu(name) { for (var i = 0; i < defs.length; i++) if (defs[i][0] === name) return defs[i][1]; return null; }
    var file = menu('File'), edit = menu('Edit'), ins = menu('Insert'), view = menu('View');
    var at = 0;
    file.forEach(function (it, i) { if (it && /Tiled/.test(it[0])) at = i + 1; });
    file.splice(at, 0, ['Print, copies per sheet, booklet…', function () { A.dlgSheets('print'); }, 'Ctrl+P']);
    if (OP.desktop) file.splice(4, 0, ['Save project as…', function () { A.saveProject(true); }, 'Ctrl+Shift+S']);
    edit.push(null, ['Find and replace…', function () { A.dlgFind(); }, 'Ctrl+F']);
    ins.splice(2, 0, ['Table…', function () { A.dlgTable(); }], ['WordArt', function () { A.insertWordArt(); }], ['Building block…', function () { A.dlgBlocks(); }]);
    ins.push(null, ['Page number', function () { A.insertField('page'); }], ['Merge field…', function () { A.dlgMerge(); }]);
    view.push(null, ['Edit master page', function () {
      if (S.master) { A.editMaster(null); return; }
      var pg = S.doc.pages[S.pi];
      if (!pg.master) { var m = newMaster(); pg.master = m.id; A.commit(); }
      A.editMaster(pg.master);
    }]);
    defs.splice(defs.length - 1, 0, ['Tools', [
      ['Spelling…', function () { A.dlgSpell(); }, 'F7'], ['Find and replace…', function () { A.dlgFind(); }, 'Ctrl+F'], null,
      ['Mail merge…', function () { A.dlgMerge(); }], ['Building blocks…', function () { A.dlgBlocks(); }], null,
      ['Add installed fonts to the font list', function () { A.loadLocalFonts(); }]
    ]]);
  };

  // page navigation leaves master editing; new pages inherit the current page's master
  var gotoPage = A.gotoPage;
  A.gotoPage = function (i) { S.master = null; S.cell = null; gotoPage(i); };
  var addPage = A.addPage;
  A.addPage = function () {
    S.master = null;
    var m = S.doc.pages[S.pi] ? S.doc.pages[S.pi].master : null;
    addPage();
    if (m && S.doc.pages[S.pi] && !S.doc.pages[S.pi].master) { S.doc.pages[S.pi].master = m; A.commit(); A.refreshAll(); }
  };

  window.addEventListener('keydown', function (e) {
    if (A.modalOpen()) return;
    var mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 'f') { e.preventDefault(); A.dlgFind(); }
    else if (mod && k === 'p') { e.preventDefault(); if (e.shiftKey || !OP.desktop || !A.printNow) A.dlgSheets('print'); else A.printNow(); }
    else if (e.key === 'F7') { e.preventDefault(); A.dlgSpell(); }
    else if (mod && e.shiftKey && k === 's' && OP.desktop) { e.preventDefault(); A.saveProject(true); }
  }, true);
})();
