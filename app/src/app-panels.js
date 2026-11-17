/* OpenPub – toolbar, menus, properties panel, layers and page list. */
var OP = (typeof globalThis.OP !== 'undefined') ? globalThis.OP : (globalThis.OP = {});

(function () {
  'use strict';
  var A = OP.app, S = A.S, $ = A.$, MM = OP.MM;

  // ---------------------------------------------------------------- tiny DOM helpers
  function h(tag, attrs, kids) {
    var el = document.createElement(tag), k;
    if (attrs) for (k in attrs) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'html') el.innerHTML = attrs[k];
      else if (k === 'text') el.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] !== null && attrs[k] !== undefined) el.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  A.h = h;
  function sec(title, rows) { return h('div', { class: 'sec' }, [title ? h('h3', { text: title }) : null].concat(rows)); }
  function row(label, kids, forId) { return h('div', { class: 'row' }, [label ? h('label', { text: label, for: forId || null }) : null].concat(kids)); }
  /** Number field. cb(value, final): final is false while typing, true when the edit is done. */
  function num(id, value, o, cb) {
    o = o || {};
    var inp = h('input', { type: 'number', id: id, step: o.step || 1, min: o.min === undefined ? null : o.min, max: o.max === undefined ? null : o.max, 'aria-label': o.aria || o.pre || id });
    inp.value = OP.round(value, o.dec === undefined ? 2 : o.dec);
    function fire(final) {
      var v = parseFloat(inp.value);
      if (!isFinite(v)) return;
      if (o.min !== undefined) v = Math.max(o.min, v);
      if (o.max !== undefined) v = Math.min(o.max, v);
      cb(v, final);
    }
    inp.addEventListener('input', function () { fire(false); });
    inp.addEventListener('change', function () { fire(true); });
    return h('div', { class: 'f' }, [o.pre ? h('span', { class: 'pre', text: o.pre }) : null, inp, o.unit ? h('span', { text: o.unit }) : null]);
  }
  function color(id, value, cb, aria) {
    var inp = h('input', { type: 'color', id: id, 'aria-label': aria || 'Colour' });
    inp.value = /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#000000';
    inp.addEventListener('input', function () { cb(inp.value, false); });
    inp.addEventListener('change', function () { cb(inp.value, true); });
    return inp;
  }
  function select(id, value, options, cb, aria) {
    var s = h('select', { id: id, 'aria-label': aria || id }, options.map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    s.value = value;
    s.addEventListener('change', function () { cb(s.value); });
    return s;
  }
  function seg(buttons) {
    return h('div', { class: 'seg' }, buttons.map(function (b) {
      var el = h('button', { type: 'button', id: b.id || null, title: b.title, 'aria-label': b.title, class: (b.on ? 'on ' : '') + (b.txt ? 'txt' : ''), html: b.txt ? b.txt : A.icon(b.icon) });
      // keep focus (and the text selection) where it is
      el.addEventListener('mousedown', function (e) { e.preventDefault(); });
      el.addEventListener('click', b.fn);
      return el;
    }));
  }
  function btn(label, fn, cls, id) { return h('button', { type: 'button', class: 'btn ' + (cls || ''), id: id || null, text: label, onclick: fn }); }

  function live(final) { A.invalidate(); if (final) { A.commit(); A.status(); } }
  function each(fn) { A.selItems().forEach(function (it) { if (!it.locked) fn(it); }); }
  A.ui = { sec: sec, row: row, num: num, color: color, select: select, seg: seg, btn: btn, live: live, each: each };

  // ---------------------------------------------------------------- toolbar
  var SHAPE_ICON_CACHE = {};
  function shapeIcon(kind) {
    if (!SHAPE_ICON_CACHE[kind]) {
      var d = OP.shapePath({ type: 'shape', kind: kind, w: 20, h: 20 });
      SHAPE_ICON_CACHE[kind] = '<svg viewBox="-2 -2 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
    }
    return SHAPE_ICON_CACHE[kind];
  }
  A.buildToolbar = function () {
    var tb = $('toolbar');
    tb.innerHTML = '';
    function tool(id, icon, label, title, fn) {
      return h('button', { type: 'button', class: 'tool', id: id, title: title, 'aria-label': title, html: A.icon(icon) + (label ? '<span class="lbl">' + label + '</span>' : ''), onclick: fn });
    }
    var grid = h('div', { class: 'pop-panel', id: 'shapegrid' }, OP.SHAPE_MENU.map(function (k) {
      return h('button', { type: 'button', class: 'shape-btn', title: OP.SHAPE_KINDS[k].label, 'aria-label': OP.SHAPE_KINDS[k].label, html: shapeIcon(k),
        onclick: function () { $('shapepop').classList.remove('open'); A.setTool('shape', k); } });
    }));
    var pop = h('div', { class: 'pop', id: 'shapepop' }, [
      tool('tbShape', 'shape', 'Shape', 'Shapes: pick one, then drag on the page', function (e) { e.stopPropagation(); A.closeMenus(); $('shapepop').classList.toggle('open'); }),
      grid
    ]);
    tb.appendChild(h('div', { class: 'tb-group' }, [
      tool('tbSelect', 'cursor', 'Select', 'Select and move (V)', function () { A.setTool('select'); }),
      tool('tbText', 'text', 'Text', 'Text box: drag on the page (T)', function () { A.setTool('text'); }),
      tool('tbImage', 'image', 'Picture', 'Insert pictures from your computer', function () { $('fileImage').click(); }),
      pop,
      tool('tbLine', 'line', 'Line', 'Line: drag on the page (L)', function () { A.setTool('line'); })
    ]));
    tb.appendChild(h('div', { class: 'tb-group' }, [
      tool('tbUndo', 'undo', '', 'Undo (Ctrl+Z)', A.undo),
      tool('tbRedo', 'redo', '', 'Redo (Ctrl+Y)', A.redo)
    ]));
    tb.appendChild(h('div', { class: 'tb-group' }, [
      tool('tbZoomOut', 'minus', '', 'Zoom out', function () { A.setZoom(S.view.zoom / 1.25); A.zoomLabel(); }),
      h('span', { id: 'zoomlbl', title: 'Zoom (Ctrl + mouse wheel)' }),
      tool('tbZoomIn', 'plus', '', 'Zoom in', function () { A.setZoom(S.view.zoom * 1.25); A.zoomLabel(); }),
      tool('tbFit', 'fit', 'Fit', 'Fit page in window (Ctrl+0)', function () { A.fit(); A.zoomLabel(); })
    ]));
    tb.appendChild(h('div', { class: 'tb-group' }, [
      h('button', { type: 'button', class: 'tool', id: 'tbSnap', title: 'Snap to guides, margins and other objects (hold Alt to switch off while dragging)', html: '<span class="lbl" style="display:inline">Snap</span>', onclick: function () { S.snap = !S.snap; A.refreshToolbar(); } }),
      h('button', { type: 'button', class: 'tool', id: 'tbGuides', title: 'Show guides, margins and bleed', html: '<span class="lbl" style="display:inline">Guides</span>', onclick: function () { S.guides = !S.guides; A.refreshToolbar(); A.invalidateOverlay(); } })
    ]));
    if (A.extraToolbar) A.extraToolbar(tb, tool);
    A.refreshToolbar();
    A.zoomLabel();
  };
  A.refreshToolbar = function () {
    var map = { tbSelect: S.tool === 'select', tbText: S.tool === 'text', tbShape: S.tool === 'shape', tbLine: S.tool === 'line', tbSnap: S.snap, tbGuides: S.guides };
    Object.keys(map).forEach(function (id) { var el = $(id); if (el) el.classList.toggle('on', !!map[id]); });
    A.updateUndoButtons();
  };
  A.zoomLabel = function () { var z = $('zoomlbl'); if (z) z.textContent = Math.round(S.view.zoom * 72 / 96 * 100) + '%'; };

  // ---------------------------------------------------------------- menus
  A.buildMenus = function () {
    var defs = [
      ['File', [
        ['New…', function () { A.dlgNew(); }], ['Open .pub or project…', function () { $('fileOpen').click(); }, 'Ctrl+O'], null,
        ['Save project', function () { A.saveProject(); }, 'Ctrl+S'], ['Export PDF, PNG, SVG…', function () { A.dlgExport(); }],
        ['Tiled poster print…', function () { A.dlgTile(); }], null, ['Page setup…', function () { A.setSel([]); A.showTab('props'); }]
      ]],
      ['Edit', [
        ['Undo', A.undo, 'Ctrl+Z'], ['Redo', A.redo, 'Ctrl+Y'], null, ['Cut', function () { A.cut(); }, 'Ctrl+X'], ['Copy', function () { A.copy(); }, 'Ctrl+C'],
        ['Paste', function () { A.paste(); }, 'Ctrl+V'], ['Duplicate', function () { A.duplicate(); }, 'Ctrl+D'], ['Delete', function () { A.deleteSel(); }, 'Del'], null,
        ['Select all', function () { A.selectAll(); }, 'Ctrl+A']
      ]],
      ['Insert', [
        ['Text box', function () { A.setTool('text'); }, 'T'], ['Picture…', function () { $('fileImage').click(); }], ['Rectangle', function () { A.setTool('shape', 'rect'); }, 'R'],
        ['Ellipse', function () { A.setTool('shape', 'ellipse'); }, 'O'], ['Line', function () { A.setTool('line'); }, 'L'], null,
        ['Page', function () { A.addPage(); }], ['Duplicate page', function () { A.dupPage(); }]
      ]],
      ['Arrange', [
        ['Bring to front', function () { A.order('front'); }, 'Ctrl+Shift+]'], ['Bring forward', function () { A.order('fwd'); }, 'Ctrl+]'],
        ['Send backward', function () { A.order('bwd'); }, 'Ctrl+['], ['Send to back', function () { A.order('back'); }, 'Ctrl+Shift+['], null,
        ['Group', function () { A.group(); }, 'Ctrl+G'], ['Ungroup', function () { A.ungroup(); }, 'Ctrl+Shift+G'], ['Lock / unlock', function () { A.toggleLock(); }], null,
        ['Centre on page horizontally', function () { centreOnPage('c'); }], ['Centre on page vertically', function () { centreOnPage('m'); }]
      ]],
      ['View', [
        ['Fit page', function () { A.fit(); A.zoomLabel(); }, 'Ctrl+0'], ['Actual size (100%)', function () { A.setZoom(96 / 72); A.zoomLabel(); }, 'Ctrl+1'],
        ['Zoom in', function () { A.setZoom(S.view.zoom * 1.25); A.zoomLabel(); }, 'Ctrl++'], ['Zoom out', function () { A.setZoom(S.view.zoom / 1.25); A.zoomLabel(); }, 'Ctrl+-'], null,
        ['Show / hide guides', function () { S.guides = !S.guides; A.refreshToolbar(); A.invalidateOverlay(); }], ['Snapping on / off', function () { S.snap = !S.snap; A.refreshToolbar(); }],
        ['Clear ruler guides on this page', function () { A.page().guides = { h: [], v: [] }; A.commit(); A.invalidateOverlay(); }]
      ]],
      ['Help', [['Shortcuts and tips', function () { A.dlgHelp(); }], ['What works and what does not', function () { A.dlgAbout(); }]]]
    ];
    if (A.extraMenus) A.extraMenus(defs);
    var root = $('menus');
    root.innerHTML = '';
    defs.forEach(function (m) {
      var list = h('div', { class: 'menu-list', role: 'menu' }, m[1].map(function (it) {
        if (!it) return h('hr');
        return h('button', { type: 'button', role: 'menuitem', onclick: function () { A.closeMenus(); it[1](); } }, [h('span', { text: it[0] }), it[2] ? h('kbd', { text: it[2] }) : null]);
      }));
      var wrap = h('div', { class: 'menu' }, [h('button', { type: 'button', text: m[0], 'aria-haspopup': 'true', onclick: function (e) {
        e.stopPropagation();
        var open = wrap.classList.contains('open');
        A.closeMenus();
        if (!open) wrap.classList.add('open');
      }, onmouseenter: function () { if (document.querySelector('.menu.open') && !wrap.classList.contains('open')) { A.closeMenus(); wrap.classList.add('open'); } } }), list]);
      root.appendChild(wrap);
    });
    document.addEventListener('click', function () { A.closeMenus(); });
  };
  A.closeMenus = function () {
    Array.prototype.forEach.call(document.querySelectorAll('.menu.open, .pop.open'), function (m) { m.classList.remove('open'); });
  };
  A.centreOnPage = function (how) { centreOnPage(how); };
  function centreOnPage(how) {
    var items = A.selItems().filter(function (it) { return !it.locked; });
    if (!items.length) return;
    var b = OP.boundsOf(items), dx = how === 'c' ? S.doc.w / 2 - (b.x + b.w / 2) : 0, dy = how === 'm' ? S.doc.h / 2 - (b.y + b.h / 2) : 0;
    items.forEach(function (it) { it.x += dx; it.y += dy; });
    A.commit(); A.refreshAll();
  }

  // ---------------------------------------------------------------- properties
  A.showTab = function (t) {
    S.tab = t;
    [['tabProps', 'props'], ['tabLayers', 'layers'], ['tabCheck', 'check']].forEach(function (p) {
      var tab = $(p[0]), pane = $(p[1]);
      if (tab) { tab.classList.toggle('on', t === p[1]); tab.setAttribute('aria-selected', t === p[1] ? 'true' : 'false'); }
      if (pane) pane.hidden = t !== p[1];
    });
    A.refreshPanels();
  };

  A.refreshPanels = function () {
    if (!S.doc) return;
    if (S.tab === 'layers') { buildLayers(); return; }
    if (S.tab === 'check') { if (A.buildCheck) A.buildCheck(); return; }
    var root = $('props'), keep = root.scrollTop;
    root.innerHTML = '';
    var sel = A.selItems();
    if (!sel.length) buildDocProps(root);
    else buildItemProps(root, sel);
    root.scrollTop = keep;
  };

  function buildDocProps(root) {
    var d = S.doc, pg = A.page();
    var preset = 'custom';
    OP.PAGE_SIZES.forEach(function (p) {
      var w = p.w * MM, hh = p.h * MM;
      if ((Math.abs(d.w - w) < 0.6 && Math.abs(d.h - hh) < 0.6) || (Math.abs(d.w - hh) < 0.6 && Math.abs(d.h - w) < 0.6)) preset = p.id;
    });
    function setSize(w, hh, final) { d.w = Math.max(10, w); d.h = Math.max(10, hh); live(final); if (final) { A.fit(); A.zoomLabel(); A.refreshAll(); } }
    root.appendChild(sec('Page size', [
      row('Preset', [select('pSize', preset, OP.PAGE_SIZES.map(function (p) { return [p.id, p.label + '  ' + p.w + ' × ' + p.h]; }).concat([['custom', 'Custom']]), function (v) {
        var p = OP.PAGE_SIZES.filter(function (x) { return x.id === v; })[0];
        if (!p) return;
        var land = d.w > d.h;
        setSize((land ? p.h : p.w) * MM, (land ? p.w : p.h) * MM, true);
      }, 'Page size preset')], 'pSize'),
      h('div', { class: 'pair' }, [
        num('pW', d.w / MM, { pre: 'W', unit: 'mm', min: 5, max: 5000, dec: 1 }, function (v, f) { setSize(v * MM, d.h, f); }),
        num('pH', d.h / MM, { pre: 'H', unit: 'mm', min: 5, max: 5000, dec: 1 }, function (v, f) { setSize(d.w, v * MM, f); })
      ]),
      row('', [btn(d.w > d.h ? 'Make portrait' : 'Make landscape', function () { setSize(d.h, d.w, true); }, '', 'pOrient')]),
      h('p', { class: 'hint', text: 'Changing the size does not move or scale objects.' })
    ]));
    root.appendChild(sec('Print set-up', [
      row('Bleed', [num('pBleed', d.bleed / MM, { unit: 'mm', min: 0, max: 50, step: 0.5, dec: 1 }, function (v, f) { d.bleed = v * MM; live(f); })], 'pBleed'),
      h('p', { class: 'hint', text: 'Extend backgrounds to the red dashed line so nothing white shows after trimming. Print shops usually ask for 3 mm.' }),
      row('Margins', [num('pMargin', d.margins.l / MM, { unit: 'mm', min: 0, max: 500, step: 1, dec: 1 }, function (v, f) { d.margins = { l: v * MM, t: v * MM, r: v * MM, b: v * MM }; live(f); A.invalidateOverlay(); })], 'pMargin'),
      h('p', { class: 'hint', text: 'Margins are guides only (magenta). Objects snap to them.' })
    ]));
    root.appendChild(sec('This page', [
      row('Paper', [color('pBg', pg.bg, function (v, f) { pg.bg = v; live(f); }, 'Page background colour'), btn('White', function () { pg.bg = '#ffffff'; live(true); A.refreshPanels(); })], 'pBg'),
      row('Guides', [h('span', { class: 'hint', text: (pg.guides.h.length + pg.guides.v.length) + ' ruler guides' }), pg.guides.h.length + pg.guides.v.length ? btn('Clear', function () { pg.guides = { h: [], v: [] }; A.commit(); A.refreshAll(); }) : null])
    ]));
    if (A.extraDocProps) A.extraDocProps(root);
    root.appendChild(h('div', { class: 'sec' }, [h('p', { class: 'hint', text: 'Nothing selected. Click an object to edit it, drag from a ruler to add a guide, or drop a .pub file on the page to import it.' })]));
  }

  function buildItemProps(root, sel) {
    var it = sel[0], single = sel.length === 1;
    var shapes = sel.filter(function (x) { return x.type === 'shape'; }), images = sel.filter(function (x) { return x.type === 'image'; });
    var texts = shapes.filter(function (x) { return x.text && !x.wa; }), tables = sel.filter(function (x) { return x.type === 'table'; });
    var locked = sel.some(function (x) { return x.locked; }), grouped = sel.some(function (x) { return x.group; });

    // ---- arrange
    root.appendChild(sec(single ? OP.itemLabel(it) : sel.length + ' objects', [
      h('div', { class: 'row wrap' }, [
        seg([{ icon: 'alL', title: single ? 'Align to page left' : 'Align left edges', fn: function () { A.align('l'); } }, { icon: 'alC', title: 'Centre horizontally', fn: function () { A.align('c'); } }, { icon: 'alR', title: single ? 'Align to page right' : 'Align right edges', fn: function () { A.align('r'); } }]),
        seg([{ icon: 'alT', title: single ? 'Align to page top' : 'Align top edges', fn: function () { A.align('t'); } }, { icon: 'alM', title: 'Centre vertically', fn: function () { A.align('m'); } }, { icon: 'alB', title: single ? 'Align to page bottom' : 'Align bottom edges', fn: function () { A.align('b'); } }]),
        sel.length > 2 ? seg([{ icon: 'distH', title: 'Space evenly across', fn: function () { A.distribute('h'); } }, { icon: 'distV', title: 'Space evenly down', fn: function () { A.distribute('v'); } }]) : null
      ]),
      h('div', { class: 'row wrap' }, [
        seg([{ icon: 'front', title: 'Bring to front', fn: function () { A.order('front'); } }, { icon: 'up', title: 'Bring forward', fn: function () { A.order('fwd'); } }, { icon: 'down', title: 'Send backward', fn: function () { A.order('bwd'); } }, { icon: 'back', title: 'Send to back', fn: function () { A.order('back'); } }]),
        seg([sel.length > 1 ? { icon: 'group', title: 'Group (Ctrl+G)', fn: function () { A.group(); } } : null, grouped ? { icon: 'ungroup', title: 'Ungroup', fn: function () { A.ungroup(); } } : null,
          { icon: locked ? 'lock' : 'unlock', title: locked ? 'Unlock' : 'Lock position', on: locked, fn: function () { A.toggleLock(); } },
          { icon: 'copy', title: 'Duplicate (Ctrl+D)', fn: function () { A.duplicate(); } }, { icon: 'trash', title: 'Delete', fn: function () { A.deleteSel(); } }].filter(Boolean))
      ])
    ]));

    // ---- geometry
    if (single) {
      var geo = [h('div', { class: 'pair' }, [
        num('gX', it.x / MM, { pre: 'X', unit: 'mm', dec: 1, step: 1 }, function (v, f) { it.x = v * MM; live(f); }),
        num('gY', it.y / MM, { pre: 'Y', unit: 'mm', dec: 1, step: 1 }, function (v, f) { it.y = v * MM; live(f); }),
        num('gW', it.w / MM, { pre: 'W', unit: 'mm', dec: 1, step: 1, min: 0 }, function (v, f) { it.w = Math.max(OP.isLine(it) ? 0 : 0.5, v * MM); live(f); }),
        num('gH', it.h / MM, { pre: 'H', unit: 'mm', dec: 1, step: 1, min: 0 }, function (v, f) { it.h = Math.max(OP.isLine(it) ? 0 : 0.5, v * MM); live(f); })
      ])];
      geo.push(h('div', { class: 'row' }, [
        num('gRot', it.rot || 0, { pre: '∠', unit: '°', dec: 1, step: 1, aria: 'Rotation' }, function (v, f) { it.rot = ((v % 360) + 360) % 360; live(f); }),
        seg([{ icon: 'flipH', title: 'Flip horizontally', on: it.flipH, fn: function () { it.flipH = !it.flipH; live(true); A.refreshPanels(); } }, { icon: 'flipV', title: 'Flip vertically', on: it.flipV, fn: function () { it.flipV = !it.flipV; live(true); A.refreshPanels(); } }])
      ]));
      root.appendChild(sec('Position and size', geo));
    }
    root.appendChild(sec(null, [row('Opacity', [num('gOp', (it.opacity === undefined ? 1 : it.opacity) * 100, { unit: '%', min: 0, max: 100, step: 5, dec: 0 }, function (v, f) { each(function (x) { x.opacity = v / 100; }); live(f); })], 'gOp')]));

    // ---- text
    if (texts.length || tables.length || A.isEditing()) buildTextProps(root, texts.length ? texts[0] : it, texts);
    else if (single && it.type === 'shape' && !OP.isOpen(it) && !it.wa) {
      root.appendChild(h('div', { class: 'sec' }, [btn('Add text to this shape', function () { A.beginEdit(it); })]));
    }

    // ---- fill & outline
    if (shapes.length) {
      var s0 = shapes[0], fill = s0.fill, ft = !fill ? 'none' : fill.type;
      var fillRows = [];
      if (!OP.isOpen(s0)) {
        var opts = [['none', 'No fill'], ['solid', 'Solid colour'], ['linear', 'Gradient'], ['radial', 'Radial gradient']];
        if (ft === 'image') opts.push(['image', 'Picture']);
        var ctl = [select('fType', ft, opts, function (v) {
          shapes.forEach(function (x) {
            if (x.locked || OP.isOpen(x)) return;
            var c1 = x.fill && x.fill.color ? x.fill.color : (x.fill && x.fill.stops ? x.fill.stops[0][1] : '#3d7ea6');
            if (v === 'none') x.fill = null;
            else if (v === 'solid') x.fill = { type: 'solid', color: c1 };
            else if (v === 'linear') x.fill = { type: 'linear', angle: 0, stops: [[0, c1], [1, '#ffffff']] };
            else if (v === 'radial') x.fill = { type: 'radial', stops: [[0, '#ffffff'], [1, c1]] };
          });
          live(true); A.refreshPanels();
        }, 'Fill type')];
        if (ft === 'solid') ctl.push(color('fCol', fill.color, function (v, f) { shapes.forEach(function (x) { if (x.fill && x.fill.type === 'solid' && !x.locked) x.fill.color = v; }); live(f); }, 'Fill colour'));
        fillRows.push(row('Fill', ctl, 'fType'));
        if (ft === 'linear' || ft === 'radial') {
          var last = fill.stops.length - 1;
          fillRows.push(row('Colours', [
            color('fC1', fill.stops[0][1], function (v, f) { shapes.forEach(function (x) { if (x.fill && x.fill.stops && !x.locked) x.fill.stops[0][1] = v; }); live(f); }, 'First gradient colour'),
            color('fC2', fill.stops[last][1], function (v, f) { shapes.forEach(function (x) { if (x.fill && x.fill.stops && !x.locked) x.fill.stops[x.fill.stops.length - 1][1] = v; }); live(f); }, 'Last gradient colour'),
            ft === 'linear' ? num('fAng', fill.angle || 0, { unit: '°', step: 15, dec: 0, aria: 'Gradient angle' }, function (v, f) { shapes.forEach(function (x) { if (x.fill && x.fill.type === 'linear' && !x.locked) x.fill.angle = ((v % 360) + 360) % 360; }); live(f); }) : null
          ], 'fC1'));
        }
      }
      var st = s0.stroke;
      var sctl = [select('sType', st ? (st.dash || 'solid') : 'none', [['none', 'No outline'], ['solid', 'Solid'], ['dash', 'Dashed'], ['dot', 'Dotted'], ['dashdot', 'Dash-dot'], ['longdash', 'Long dash']], function (v) {
        shapes.forEach(function (x) {
          if (x.locked) return;
          if (v === 'none') x.stroke = OP.isLine(x) ? x.stroke : null;
          else if (!x.stroke) x.stroke = { color: '#000000', width: 1, dash: v };
          else x.stroke.dash = v;
        });
        live(true); A.refreshPanels();
      }, 'Outline style')];
      if (st) sctl.push(color('sCol', st.color, function (v, f) { shapes.forEach(function (x) { if (x.stroke && !x.locked) x.stroke.color = v; }); live(f); }, 'Outline colour'));
      fillRows.push(row(OP.isLine(s0) ? 'Line' : 'Outline', sctl, 'sType'));
      if (st) fillRows.push(row('Weight', [num('sW', st.width, { unit: 'pt', min: 0.1, max: 200, step: 0.5 }, function (v, f) { shapes.forEach(function (x) { if (x.stroke && !x.locked) x.stroke.width = v; }); live(f); })], 'sW'));
      if (s0.kind === 'roundrect') {
        fillRows.push(row('Corners', [num('sRad', (s0.radius === undefined ? Math.min(s0.w, s0.h) * 0.167 : s0.radius) / MM, { unit: 'mm', min: 0, step: 1, dec: 1 }, function (v, f) { shapes.forEach(function (x) { if (x.kind === 'roundrect' && !x.locked) x.radius = v * MM; }); live(f); })], 'sRad'));
      }
      if (OP.isLine(s0)) {
        fillRows.push(row('Arrows', [seg([
          { txt: '◀', title: 'Arrowhead at start', on: s0.arrowStart, fn: function () { shapes.forEach(function (x) { if (OP.isLine(x)) x.arrowStart = !s0.arrowStart; }); live(true); A.refreshPanels(); } },
          { txt: '▶', title: 'Arrowhead at end', on: s0.arrowEnd, fn: function () { var v = !s0.arrowEnd; shapes.forEach(function (x) { if (OP.isLine(x)) x.arrowEnd = v; }); live(true); A.refreshPanels(); } }
        ])]));
      }
      if (single && s0.kind !== 'line' && s0.kind !== 'path' && !s0.wa) {
        fillRows.push(row('Shape', [select('sKind', s0.kind, OP.SHAPE_MENU.map(function (k) { return [k, OP.SHAPE_KINDS[k].label]; }), function (v) { s0.kind = v; live(true); A.refreshPanels(); }, 'Shape type')], 'sKind'));
      }
      root.appendChild(sec('Fill and outline', fillRows));
    }

    // ---- picture
    if (images.length && single) {
      var asset = S.doc.assets[it.asset];
      var rows = [h('div', { class: 'row wrap' }, [
        btn('Replace picture…', function () { A.pickReplace(it); }),
        asset && asset.w ? btn('Original proportions', function () {
          var cw = asset.w * (1 - it.crop.l - it.crop.r), chh = asset.h * (1 - it.crop.t - it.crop.b);
          it.h = it.w * chh / cw; live(true); A.refreshPanels();
        }) : null
      ])];
      rows.push(h('h3', { text: 'Crop (percent trimmed from each side)' }));
      var crop = function (k, pre) {
        return num('c' + k, it.crop[k] * 100, { pre: pre, unit: '%', min: 0, max: 90, step: 1, dec: 0, aria: 'Crop ' + pre }, function (v, f) {
          var other = { l: 'r', r: 'l', t: 'b', b: 't' }[k];
          it.crop[k] = Math.min(v / 100, 0.95 - it.crop[other]); live(f);
        });
      };
      rows.push(h('div', { class: 'pair' }, [crop('l', 'L'), crop('r', 'R'), crop('t', 'T'), crop('b', 'B')]));
      if (asset && asset.w && !/svg/.test(OP.dataUrlMime(asset.src))) {
        var ppi = Math.round(asset.w * (1 - it.crop.l - it.crop.r) / (it.w / 72));
        rows.push(h('p', { class: ppi < 150 ? 'note' : 'hint', text: 'Effective resolution at this size: ' + ppi + ' ppi' + (ppi < 150 ? '. This may look soft in print; 150 ppi or more is safer for posters, 300 for small print.' : '.') }));
      }
      var ist = it.stroke;
      rows.push(row('Border', [select('iB', ist ? 'on' : 'none', [['none', 'None'], ['on', 'Solid']], function (v) { it.stroke = v === 'on' ? { color: '#000000', width: 1, dash: 'solid' } : null; live(true); A.refreshPanels(); }, 'Picture border'),
        ist ? color('iBc', ist.color, function (v, f) { it.stroke.color = v; live(f); }, 'Border colour') : null,
        ist ? num('iBw', ist.width, { unit: 'pt', min: 0.1, max: 100, step: 0.5 }, function (v, f) { it.stroke.width = v; live(f); }) : null], 'iB'));
      root.appendChild(sec('Picture', rows));
    }

    // ---- shadow
    var sh = it.shadow;
    var shRows = [row('Shadow', [select('shOn', sh ? 'on' : 'off', [['off', 'None'], ['on', 'Drop shadow']], function (v) {
      each(function (x) { x.shadow = v === 'on' ? { dx: 3, dy: 3, blur: 4, color: '#555555' } : null; });
      live(true); A.refreshPanels();
    }, 'Shadow'), sh ? color('shCol', sh.color, function (v, f) { each(function (x) { if (x.shadow) x.shadow.color = v; }); live(f); }, 'Shadow colour') : null], 'shOn')];
    if (sh) shRows.push(h('div', { class: 'pair' }, [
      num('shX', sh.dx, { pre: 'X', unit: 'pt', step: 1, dec: 1, aria: 'Shadow offset X' }, function (v, f) { each(function (x) { if (x.shadow) x.shadow.dx = v; }); live(f); }),
      num('shY', sh.dy, { pre: 'Y', unit: 'pt', step: 1, dec: 1, aria: 'Shadow offset Y' }, function (v, f) { each(function (x) { if (x.shadow) x.shadow.dy = v; }); live(f); }),
      num('shB', sh.blur || 0, { pre: 'Blur', unit: 'pt', min: 0, step: 1, dec: 1, aria: 'Shadow blur' }, function (v, f) { each(function (x) { if (x.shadow) x.shadow.blur = v; }); live(f); })
    ]));
    root.appendChild(sec(null, shRows));
    if (A.extraItemProps) A.extraItemProps(root, sel);
  }

  function buildTextProps(root, it, texts) {
    var st = A.textState() || OP.DEFAULT_RUN, tx = it.text;
    var font = h('input', { type: 'text', id: 'tFont', 'aria-label': 'Font', spellcheck: 'false' });
    font.value = st.font;
    if (A.fontPicker) A.fontPicker(font);
    font.addEventListener('change', function () { if (font.value.trim()) { A.applyRunStyle({ font: font.value.trim() }); A.refreshTextControls(); } });
    font.addEventListener('focus', function () { font.select(); });
    var rows = [
      h('div', { class: 'row' }, [h('div', { class: 'f' }, [font]), h('div', { style: 'flex:0 0 78px;display:flex' }, [num('tSize', st.size, { unit: 'pt', min: 1, max: 2000, step: 1, dec: 1, aria: 'Font size' }, function (v, f) { if (f || !A.isEditing()) A.applyRunStyle({ size: v }, f); })])]),
      h('div', { class: 'row wrap' }, [
        seg([{ id: 'tB', txt: 'B', title: 'Bold (Ctrl+B)', on: st.b, fn: function () { A.applyRunStyle({ b: 'toggle' }); A.refreshTextControls(); } },
          { id: 'tI', txt: '<i>I</i>', title: 'Italic (Ctrl+I)', on: st.i, fn: function () { A.applyRunStyle({ i: 'toggle' }); A.refreshTextControls(); } },
          { id: 'tU', txt: '<u>U</u>', title: 'Underline (Ctrl+U)', on: st.u, fn: function () { A.applyRunStyle({ u: 'toggle' }); A.refreshTextControls(); } }]),
        color('tCol', st.color, function (v, f) { if (f || !A.isEditing()) A.applyRunStyle({ color: v }, f); }, 'Text colour'),
        seg([{ id: 'tBul', icon: 'bullet', title: 'Bulleted list', on: st.bullet, fn: function () { A.applyParaStyle({ bullet: 'toggle' }); A.refreshTextControls(); } },
          { id: 'tNum', txt: '1.', title: 'Numbered list', on: st.num, fn: function () { A.applyParaStyle({ num: 'toggle' }); A.refreshTextControls(); } }])
      ]),
      h('div', { class: 'row' }, [
        seg([{ id: 'tS', txt: '<s>S</s>', title: 'Strikethrough', on: st.s, fn: function () { A.applyRunStyle({ s: 'toggle' }); A.refreshTextControls(); } },
          { id: 'tCaps', txt: '<span style="font-size:11px">AA</span>', title: 'All capitals', on: st.caps, fn: function () { A.applyRunStyle({ caps: 'toggle' }); A.refreshTextControls(); } }]),
        num('tSp', st.sp || 0, { pre: 'Spacing', unit: 'pt', min: -20, max: 200, step: 0.5, dec: 1, aria: 'Letter spacing' }, function (v, f) { if (f || !A.isEditing()) A.applyRunStyle({ sp: v }, f); })
      ]),
      h('div', { class: 'row wrap' }, [
        seg(['left', 'center', 'right', 'justify'].map(function (a, i) {
          return { id: 'tA' + i, icon: ['tL', 'tC', 'tR', 'tJ'][i], title: ['Align left', 'Centre', 'Align right', 'Justify'][i], on: st.align === a, fn: function () { A.applyParaStyle({ align: a }); A.refreshTextControls(); } };
        })),
        seg(['top', 'middle', 'bottom'].map(function (a, i) {
          return { id: 'tV' + i, icon: ['vT', 'vM', 'vB'][i], title: ['Top of box', 'Middle of box', 'Bottom of box'][i], on: tx && tx.valign === a, fn: function () {
            (texts.length ? texts : [it]).forEach(function (x) { if (x.text) x.text.valign = a; });
            if (A.isEditing()) A.setEditorBox(it); else live(true);
            A.refreshTextControls(true);
          } };
        }))
      ]),
      h('div', { class: 'pair' }, [
        num('tBefore', st.before || 0, { pre: 'Before', unit: 'pt', min: 0, max: 500, step: 1, dec: 1, aria: 'Space before paragraph' }, function (v, f) { A.applyParaStyle({ before: v }, f); }),
        num('tAfter', st.after || 0, { pre: 'After', unit: 'pt', min: 0, max: 500, step: 1, dec: 1, aria: 'Space after paragraph' }, function (v, f) { A.applyParaStyle({ after: v }, f); })
      ]),
      row('Lines', [
        select('tLsMode', st.lsPt ? 'exact' : 'mult', [['mult', 'Multiple'], ['exact', 'Exactly']], function (v) {
          if (v === 'exact') A.applyParaStyle({ lsPt: OP.round((st.size || 12) * 1.2 * (st.ls || 1), 1) });
          else A.applyParaStyle({ ls: 1 });
          A.refreshTextControls(true);
        }, 'Line spacing type'),
        st.lsPt ? num('tLsPt', st.lsPt, { unit: 'pt', min: 1, max: 1000, step: 0.5, dec: 1, aria: 'Line spacing in points' }, function (v, f) { A.applyParaStyle({ lsPt: v }, f); })
          : num('tLs', st.ls || 1, { unit: '×', min: 0.5, max: 5, step: 0.05, dec: 2, aria: 'Line spacing' }, function (v, f) { A.applyParaStyle({ ls: v }, f); })
      ], 'tLsMode'),
      h('h3', { text: 'Indents' }),
      h('div', { class: 'pair' }, [
        num('tIndL', (st.left || 0) / MM, { pre: 'Left', unit: 'mm', min: 0, max: 500, step: 1, dec: 1, aria: 'Left indent' }, function (v, f) { A.applyParaStyle({ left: v * MM }, f); }),
        num('tIndR', (st.right || 0) / MM, { pre: 'Right', unit: 'mm', min: 0, max: 500, step: 1, dec: 1, aria: 'Right indent' }, function (v, f) { A.applyParaStyle({ right: v * MM }, f); })
      ]),
      row('First line', [
        num('tIndF', (st.indent || 0) / MM, { unit: 'mm', min: -500, max: 500, step: 1, dec: 1, aria: 'First-line indent (negative for a hanging indent)' }, function (v, f) { A.applyParaStyle({ indent: v * MM }, f); })
      ], 'tIndF')
    ];
    if (tx) {
      rows.push(row('Inset', [num('tPad', tx.pad[0], { unit: 'pt', min: 0, max: 500, step: 1, dec: 1, aria: 'Text inset' }, function (v, f) {
        (texts.length ? texts : [it]).forEach(function (x) { if (x.text) x.text.pad = [v, v, v, v]; });
        if (A.isEditing()) A.setEditorBox(it); else live(f);
      })], 'tPad'));
      var fits = [['none', 'Clip to box'], ['shrink', 'Shrink text to fit']];
      if (OP.canGrow(S.doc, it) || tx.fit === 'grow') fits.push(['grow', 'Grow box to fit']);
      rows.push(row('Overflow', [select('tFit', tx.fit || 'none', fits, function (v) {
        (texts.length ? texts : [it]).forEach(function (x) { if (x.text) x.text.fit = v; });
        live(true);
        if (v === 'grow' && !A.isEditing()) A.refreshPanels(); // the box height has just changed
      }, 'When text does not fit')], 'tFit'));
      if (!A.isEditing()) rows.push(h('div', { class: 'row wrap' }, [
        btn('Edit text', function () { A.beginEdit(it); }),
        btn('Fit box height to text', function () { (texts.length ? texts : [it]).forEach(function (x) { if (x.text && !x.locked) x.h = OP.round(OP.textHeight(x), 2); }); live(true); A.refreshPanels(); })
      ]));
      else rows.push(h('p', { class: 'hint', text: 'Highlight words to format just those; with nothing highlighted the whole box changes. Press Esc or click outside to finish.' }));
    }
    root.appendChild(sec('Text', rows));
  }
  /** Update the pressed state of text buttons without rebuilding the panel (keeps focus). */
  A.refreshTextControls = function (full) {
    if (full === true || !A.isEditing()) { A.refreshPanels(); return; }
    var st = A.textState();
    if (!st) return;
    var set = function (id, on) { var el = $(id); if (el) el.classList.toggle('on', !!on); };
    set('tB', st.b); set('tI', st.i); set('tU', st.u); set('tBul', st.bullet); set('tNum', st.num); set('tS', st.s); set('tCaps', st.caps);
    ['left', 'center', 'right', 'justify'].forEach(function (a, i) { set('tA' + i, st.align === a); });
    // the caret moved between "multiple" and "exactly" paragraphs: the line field itself changes
    var mode = $('tLsMode');
    if (mode && mode.value !== (st.lsPt ? 'exact' : 'mult')) { A.refreshPanels(); return; }
    var f = $('tFont'), sz = $('tSize'), c = $('tCol');
    if (f && document.activeElement !== f) f.value = st.font;
    if (sz && document.activeElement !== sz) sz.value = st.size;
    if (c && document.activeElement !== c) c.value = st.color;
    var put = function (id, v, dec) { var el = $(id); if (el && document.activeElement !== el) el.value = OP.round(v, dec); };
    put('tLs', st.ls || 1, 2); put('tLsPt', st.lsPt || 0, 1);
    put('tBefore', st.before || 0, 1); put('tAfter', st.after || 0, 1);
    put('tIndL', (st.left || 0) / MM, 1); put('tIndR', (st.right || 0) / MM, 1); put('tIndF', (st.indent || 0) / MM, 1);
  };

  A.pickReplace = function (it) {
    var inp = h('input', { type: 'file', accept: 'image/*' });
    inp.addEventListener('change', function () { if (inp.files[0]) A.replaceImage(it, inp.files[0]); });
    inp.click();
  };

  // ---------------------------------------------------------------- layers
  function buildLayers() {
    var root = $('layers'), pg = A.page();
    root.innerHTML = '';
    if (!pg.items.length) { root.appendChild(h('p', { class: 'hint', style: 'padding-top:10px', text: 'This page is empty. Objects appear here with the front-most at the top.' })); return; }
    for (var i = pg.items.length - 1; i >= 0; i--) (function (it) {
      var on = S.sel.indexOf(it.id) >= 0;
      var name = h('button', { type: 'button', class: 'name' + (it.hidden ? ' dim' : ''), text: OP.itemLabel(it) + (it.group ? '  ·  grouped' : ''), title: 'Click to select, double-click to rename',
        onclick: function (e) { A.setSel(e.shiftKey ? S.sel.concat([it.id]) : [it.id]); },
        ondblclick: function () {
          var inp = h('input', { type: 'text', class: 'name', 'aria-label': 'Object name' });
          inp.value = it.name || OP.itemLabel(it);
          name.replaceWith(inp); inp.focus(); inp.select();
          var done = function () { it.name = inp.value.trim().slice(0, 60); A.commit(); A.refreshPanels(); };
          inp.addEventListener('blur', done);
          inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') inp.blur(); e.stopPropagation(); });
        } });
      root.appendChild(h('div', { class: 'layer' + (on ? ' on' : '') }, [
        h('span', { class: 'kind', html: A.icon(it.type === 'image' ? 'image' : (it.text || it.wa || it.type === 'table') ? 'text' : OP.isLine(it) ? 'line' : 'shape') }),
        name,
        h('button', { type: 'button', class: 'icon-btn' + (it.hidden ? '' : ' dim'), title: it.hidden ? 'Show' : 'Hide', 'aria-label': it.hidden ? 'Show' : 'Hide', html: A.icon(it.hidden ? 'eyeoff' : 'eye'),
          onclick: function () { it.hidden = !it.hidden; A.commit(); A.refreshAll(); } }),
        h('button', { type: 'button', class: 'icon-btn' + (it.locked ? '' : ' dim'), title: it.locked ? 'Unlock' : 'Lock', 'aria-label': it.locked ? 'Unlock' : 'Lock', html: A.icon(it.locked ? 'lock' : 'unlock'),
          onclick: function () { it.locked = !it.locked; A.commit(); A.refreshAll(); } })
      ]));
    })(pg.items[i]);
  }

  // ---------------------------------------------------------------- pages
  var pagesTimer = 0;
  A.refreshPagesSoon = function () { clearTimeout(pagesTimer); pagesTimer = setTimeout(A.refreshPages, 350); };
  A.refreshPages = function () {
    clearTimeout(pagesTimer);
    if (!S.doc) return;
    var list = $('pagelist'), d = S.doc;
    list.innerHTML = '';
    d.pages.forEach(function (pg, i) {
      var k = 104 / Math.max(d.w, d.h * 0.75), dpr = Math.min(2, window.devicePixelRatio || 1);
      var c = OP.pageToCanvas(d, pg, k * dpr);
      c.style.width = Math.round(d.w * k) + 'px'; c.style.height = Math.round(d.h * k) + 'px';
      list.appendChild(h('button', { type: 'button', class: 'thumb' + (i === S.pi ? ' on' : ''), title: 'Page ' + (i + 1), onclick: function () { A.gotoPage(i); } }, [c, h('span', { text: String(i + 1) })]));
    });
    var bt = $('pagebtns');
    bt.innerHTML = '';
    [['plus', 'Add a page after this one', A.addPage], ['copy', 'Duplicate this page', A.dupPage], ['up', 'Move page earlier', function () { A.movePage(-1); }],
      ['down', 'Move page later', function () { A.movePage(1); }], ['trash', 'Delete this page', A.delPage]].forEach(function (b) {
      bt.appendChild(h('button', { type: 'button', class: 'icon-btn', title: b[1], 'aria-label': b[1], html: A.icon(b[0]), onclick: b[2] }));
    });
  };
  A.gotoPage = function (i) {
    if (S.editing) A.endEdit();
    S.pi = OP.clamp(i, 0, S.doc.pages.length - 1); S.sel = [];
    A.refreshAll();
  };
  A.addPage = function () {
    if (S.editing) A.endEdit();
    S.doc.pages.splice(S.pi + 1, 0, OP.newPage()); S.pi++; S.sel = [];
    A.commit(); A.refreshAll();
  };
  A.dupPage = function () {
    if (S.editing) A.endEdit();
    var c = OP.clone(A.page()), gmap = {};
    c.id = OP.uid('p');
    c.items.forEach(function (it) { it.id = OP.uid('i'); if (it.group) { gmap[it.group] = gmap[it.group] || OP.uid('g'); it.group = gmap[it.group]; } });
    S.doc.pages.splice(S.pi + 1, 0, c); S.pi++; S.sel = [];
    A.commit(); A.refreshAll();
  };
  A.delPage = function () {
    if (S.editing) A.endEdit();
    if (S.doc.pages.length < 2) { A.toast('A document needs at least one page.'); return; }
    S.doc.pages.splice(S.pi, 1); S.pi = Math.min(S.pi, S.doc.pages.length - 1); S.sel = [];
    A.commit(); A.refreshAll();
    A.toast('Page deleted. Ctrl+Z brings it back.');
  };
  A.movePage = function (dir) {
    var j = S.pi + dir, p = S.doc.pages;
    if (j < 0 || j >= p.length) return;
    var t = p[S.pi]; p[S.pi] = p[j]; p[j] = t; S.pi = j;
    A.commit(); A.refreshAll();
  };

  // ---------------------------------------------------------------- fonts
  var COMMON_FONTS = ['Arial', 'Arial Black', 'Bahnschrift', 'Calibri', 'Cambria', 'Candara', 'Century Gothic', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel',
    'Courier New', 'Franklin Gothic Medium', 'Garamond', 'Georgia', 'Gill Sans MT', 'Impact', 'Lucida Sans Unicode', 'Palatino Linotype', 'Rockwell', 'Segoe UI',
    'Segoe UI Black', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'];
  var localFonts = [], localFaces = [], aliased = {};
  /**
   * Fonts installed on this computer, once they have been read (empty until then): family names plus each
   * face's full name, because documents often use the older Windows names ("Arial Black", "Franklin Gothic Demi Cond")
   * that the font list files under a larger family ("Arial", "Franklin Gothic").
   */
  A.installedFonts = function () {
    var seen = {};
    localFonts.forEach(function (n) { seen[n] = true; });
    localFaces.forEach(function (f) { if (f.fullName) seen[f.fullName] = true; });
    return Object.keys(seen);
  };
  var probe = null;
  function renders(name) {
    // a font renders when text in it measures differently from both fallbacks
    probe = probe || document.createElement('canvas').getContext('2d');
    var t = 'Hamburgefonstiv WMQ 0123', q = '"' + name.replace(/"/g, '') + '"', w = function (f) { probe.font = '40px ' + f; return probe.measureText(t).width; };
    return Math.abs(w(q + ', monospace') - w('monospace')) > 0.5 || Math.abs(w(q + ', serif') - w('serif')) > 0.5;
  }
  /**
   * Some installed fonts do not draw under the name a document uses (Chrome matches family names, and
   * "Franklin Gothic Demi Cond" is a face of "Franklin Gothic"). Point such names at the installed face with
   * @font-face local(), which matches full and PostScript names.
   */
  A.aliasFonts = function (names) {
    if (!localFaces.length) return 0;
    var byName = {}, css = '', n = 0;
    localFaces.forEach(function (f) {
      if (f.fullName) byName[f.fullName.toLowerCase()] = f;
      if (f.postscriptName) byName[f.postscriptName.toLowerCase().replace(/-/g, ' ')] = byName[f.postscriptName.toLowerCase().replace(/-/g, ' ')] || f;
    });
    names.forEach(function (name) {
      var key = String(name || '').toLowerCase(), f = byName[key];
      if (!f || aliased[key] || renders(name)) return;
      aliased[key] = true; n++;
      var src = 'local("' + f.fullName.replace(/"/g, '') + '")' + (f.postscriptName ? ', local("' + f.postscriptName.replace(/"/g, '') + '")' : '');
      css += '@font-face { font-family: "' + String(name).replace(/"/g, '') + '"; src: ' + src + '; }\n';
    });
    if (css) document.head.appendChild(h('style', { 'data-font-alias': '', text: css }));
    return n;
  };
  /** The alias rules, for output that is drawn elsewhere (vector PDF and print HTML, SVG files). */
  OP.fontAliasCss = function () {
    return Array.prototype.map.call(document.querySelectorAll('style[data-font-alias]'), function (s) { return s.textContent; }).join('');
  };
  function docFonts() {
    var names = {};
    S.doc.pages.concat(S.doc.masters || []).forEach(function (p) { p.items.forEach(function (it) {
      if (it.text) it.text.paras.forEach(function (pa) { pa.runs.forEach(function (r) { names[r.font] = true; }); });
      if (it.wa && it.wa.font) names[it.wa.font] = true;
    }); });
    return Object.keys(names);
  }
  A.updateFontList = function () {
    var names = {}, dl = $('fontlist'), used = docFonts();
    COMMON_FONTS.concat(localFonts, used).forEach(function (n) { names[n] = true; });
    dl.innerHTML = '';
    Object.keys(names).sort().forEach(function (n) { dl.appendChild(h('option', { value: n })); });
    A.aliasFonts(used);
  };
  /** Chrome and Edge can list installed fonts after the user allows it. */
  /** Read the fonts installed on this computer into the font list. quiet = no messages (start-up). */
  A.loadLocalFonts = async function (quiet) {
    if (!window.queryLocalFonts) { if (!quiet) A.toast('This browser cannot list installed fonts. Type the font name instead.'); return 0; }
    try {
      var fonts = await window.queryLocalFonts(), seen = {};
      fonts.forEach(function (f) { seen[f.family] = true; });
      localFonts = Object.keys(seen);
      localFaces = fonts.map(function (f) { return { family: f.family, fullName: f.fullName, postscriptName: f.postscriptName }; });
      A.updateFontList();
      if (!quiet) A.toast(localFonts.length + ' installed font families added to the font list.');
      return localFonts.length;
    } catch (e) { if (!quiet) A.toast('Installed fonts could not be listed: ' + e.message, true); return 0; }
  };
})();
