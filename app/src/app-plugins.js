/* OpenPub – user content. Content packs (templates, building blocks, colour schemes: data only)
 * and script plug-ins (JavaScript that adds commands, blocks, templates and exporters), plus the
 * built-in templates and the dialogs that manage all of it. */
var OP = (typeof globalThis.OP !== 'undefined') ? globalThis.OP : (globalThis.OP = {});

(function () {
  'use strict';
  var A = OP.app, S = A.S, $ = A.$, h = A.h, MM = OP.MM, ui = A.ui;
  OP.VERSION = '1.2.0';

  // ---------------------------------------------------------------- storage (this computer only)
  function idb() {
    return new Promise(function (resolve, reject) {
      var rq;
      try { rq = indexedDB.open('openpub', 1); } catch (e) { reject(e); return; }
      rq.onupgradeneeded = function () { if (!rq.result.objectStoreNames.contains('kv')) rq.result.createObjectStore('kv'); };
      rq.onsuccess = function () { resolve(rq.result); };
      rq.onerror = function () { reject(rq.error || new Error('no storage')); };
    });
  }
  function kvGet(key) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var rq = db.transaction('kv', 'readonly').objectStore('kv').get(key);
        rq.onsuccess = function () { db.close(); resolve(rq.result); };
        rq.onerror = function () { db.close(); reject(rq.error); };
      });
    }).catch(function () { return undefined; });
  }
  function kvPut(key, value) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(value, key);
        tx.oncomplete = function () { db.close(); resolve(true); };
        tx.onerror = tx.onabort = function () { db.close(); reject(tx.error || new Error('write failed')); };
      });
    }).catch(function () { A.toast('This could not be stored on this computer.', true); return false; });
  }

  var packs = [];      // installed content packs, incl. the user's own ("mine")
  var plugins = [];    // installed plug-ins: {id, fileName, code, enabled, meta, error}
  var scheme = '';     // active colour scheme: "<pack id>/<index>" or ''
  var pluginBlocks = [], pluginTemplates = [];

  // ---------------------------------------------------------------- content packs
  function cleanItems(items, assets) {
    var d = OP.normaliseDoc({ w: 100, h: 100, assets: assets || {}, pages: [{ items: items || [] }] });
    return { items: d.pages[0].items, assets: d.assets };
  }
  /** Validate and normalise a pack read from a file. Throws with a readable message. */
  function cleanPack(raw) {
    if (!raw || typeof raw !== 'object' || !raw.openpubPack) throw new Error('This is not an OpenPub content pack.');
    var p = { id: OP.uid('k'), name: String(raw.name || 'Untitled pack').slice(0, 80), author: String(raw.author || '').slice(0, 80),
      description: String(raw.description || '').slice(0, 300), blocks: [], templates: [], colours: [] };
    (Array.isArray(raw.blocks) ? raw.blocks : []).slice(0, 500).forEach(function (b) {
      var c = cleanItems(b.items, b.assets);
      if (c.items.length) p.blocks.push({ name: String(b.name || 'Block').slice(0, 60), cat: String(b.category || b.cat || p.name).slice(0, 40), items: c.items, assets: c.assets });
    });
    (Array.isArray(raw.templates) ? raw.templates : []).slice(0, 200).forEach(function (t) {
      if (!t || !t.doc || !Array.isArray(t.doc.pages)) return;
      var d = OP.normaliseDoc(t.doc);
      p.templates.push({ name: String(t.name || d.name || 'Template').slice(0, 60), doc: JSON.parse(JSON.stringify(d)) });
    });
    (Array.isArray(raw.colours) ? raw.colours : Array.isArray(raw.colors) ? raw.colors : []).slice(0, 50).forEach(function (c) {
      var list = (c.colours || c.colors || []).filter(function (v) { return /^#[0-9a-f]{6}$/i.test(v); }).slice(0, 24);
      if (list.length) p.colours.push({ name: String(c.name || 'Scheme').slice(0, 40), colours: list });
    });
    if (!p.blocks.length && !p.templates.length && !p.colours.length) throw new Error('The pack contains no templates, building blocks or colour schemes that can be used.');
    return p;
  }
  function mine() {
    var m = packs.filter(function (p) { return p.id === 'mine'; })[0];
    if (!m) { m = { id: 'mine', name: 'My content', author: '', description: 'Templates you saved on this computer.', blocks: [], templates: [], colours: [] }; packs.unshift(m); }
    return m;
  }
  function savePacks() { return kvPut('packs', packs); }

  var BUILTIN_SCHEMES = [
    { name: 'Print basics', colours: ['#000000', '#ffffff', '#00a0d6', '#d4249b', '#f3d21b', '#b3261e', '#1f7a3f', '#625e56'] },
    { name: 'Harbour', colours: ['#0b2a3c', '#0b6e99', '#5fb3d4', '#e8f1f5', '#f2a541', '#d9534f', '#2f3e46', '#ffffff'] },
    { name: 'Bushland', colours: ['#233d2c', '#4f7942', '#a3b18a', '#f1ede2', '#c1440e', '#e9c46a', '#3a2e24', '#ffffff'] },
    { name: 'School fete', colours: ['#e63946', '#f4a261', '#ffd166', '#2a9d8f', '#457b9d', '#6a4c93', '#1d3557', '#ffffff'] }
  ];
  function allSchemes() {
    var out = BUILTIN_SCHEMES.map(function (s, i) { return { key: 'builtin/' + i, name: s.name, colours: s.colours }; });
    packs.forEach(function (p) { p.colours.forEach(function (s, i) { out.push({ key: p.id + '/' + i, name: s.name + ' (' + p.name + ')', colours: s.colours }); }); });
    return out;
  }
  function applyScheme() {
    var dl = $('swatches'), sc = allSchemes().filter(function (s) { return s.key === scheme; })[0];
    if (!dl) return;
    dl.innerHTML = '';
    if (sc) sc.colours.forEach(function (c) { dl.appendChild(h('option', { value: c })); });
    tagColourInputs();
  }
  function tagColourInputs() {
    var on = !!scheme && $('swatches') && $('swatches').children.length;
    Array.prototype.forEach.call(document.querySelectorAll('#props input[type="color"]'), function (inp) {
      if (on) inp.setAttribute('list', 'swatches'); else inp.removeAttribute('list');
    });
  }
  var basePanels = A.refreshPanels;
  A.refreshPanels = function () { basePanels(); tagColourInputs(); };

  A.extraBlockGroups = function (u) {
    var groups = {}, order = [];
    function add(cat, b) { if (!groups[cat]) { groups[cat] = []; order.push(cat); } groups[cat].push(b); }
    packs.forEach(function (p) { p.blocks.forEach(function (b) { add(b.cat || p.name, b); }); });
    pluginBlocks.forEach(function (b) {
      try {
        var c = cleanItems(b.make(u), b.assets);
        if (c.items.length) add(b.category, { name: b.name, items: c.items, assets: c.assets });
      } catch (e) { /* a broken block is left out */ }
    });
    return order.map(function (c) { return { cat: c, blocks: groups[c] }; });
  };

  // ---------------------------------------------------------------- templates
  function tx(x, y, w, hh, str, o) {
    o = o || {};
    var paras = String(str).split('\n').map(function (line) { return OP.newPara([OP.newRun(line, { font: o.font || 'Arial', size: o.size || 12, b: !!o.b, i: !!o.i, color: o.color || '#1b2228' })], { align: o.align || 'left', after: o.after || 0 }); });
    var it = OP.newTextBox(x, y, w, hh, paras);
    it.text.valign = o.valign || 'top';
    return it;
  }
  function sh(kind, x, y, w, hh, fill) { var it = OP.newShape(kind, x, y, w, hh); it.fill = fill ? { type: 'solid', color: fill } : null; it.stroke = null; return it; }
  function mmDoc(wmm, hmm, name, items, more) {
    var d = OP.newDoc(wmm * MM, hmm * MM);
    d.name = name; d.pages[0].items = items;
    if (more) more(d);
    return d;
  }
  var BUILTIN_TEMPLATES = [
    { name: 'Event poster (A3)', make: function () { var W = 297 * MM, H = 420 * MM, m = 18 * MM;
      return mmDoc(297, 420, 'Event poster', [
        sh('rect', 0, 0, W, H * 0.34, '#17384a'),
        tx(m, m * 1.6, W - 2 * m, 70 * MM, 'Community\nopen day', { size: 92, b: true, color: '#ffffff' }),
        sh('rect', m, H * 0.34 - 5 * MM, 60 * MM, 5 * MM, '#d4249b'),
        tx(m, H * 0.38, W - 2 * m, 28 * MM, 'Saturday 14 March, 10 am to 3 pm', { size: 34, b: true }),
        tx(m, H * 0.38 + 30 * MM, W - 2 * m, 60 * MM, 'Riverside Hall, 12 Example Street\nFree entry. Food stalls, live music and activities for children.', { size: 22, after: 6 }),
        sh('roundrect', m, H * 0.62, W - 2 * m, H * 0.24, '#dfe4ea'),
        tx(m, H * 0.62, W - 2 * m, H * 0.24, 'Replace with a picture', { size: 16, align: 'center', valign: 'middle', color: '#53606b' }),
        tx(m, H - m - 16 * MM, W - 2 * m, 16 * MM, 'More information: example.org/openday   |   (02) 5550 0000', { size: 16, color: '#53606b', valign: 'bottom' })
      ]); } },
    { name: 'Flyer with tear-off strips (A4)', make: function () { var W = 210 * MM, H = 297 * MM, m = 14 * MM, n = 8, sw = (W - 2 * m) / n, sH = 52 * MM, items = [
        tx(m, m, W - 2 * m, 34 * MM, 'Guitar lessons', { size: 60, b: true, font: 'Georgia' }),
        sh('rect', m, m + 36 * MM, 40 * MM, 3 * MM, '#0b6e99'),
        tx(m, m + 46 * MM, W - 2 * m, 90 * MM, 'Beginners welcome. One-to-one lessons in your home, evenings and weekends.\n\nFirst lesson free.', { size: 20, after: 6 }),
        tx(m, H - m - sH - 26 * MM, W - 2 * m, 20 * MM, 'Take a number', { size: 18, b: true, align: 'center', valign: 'bottom' })];
      var top = OP.newShape('line', m, H - m - sH, W - 2 * m, 0); top.stroke = { color: '#1b2228', width: 1, dash: 'dash' }; items.push(top);
      for (var i = 0; i < n; i++) {
        var t = tx(m + i * sw + sw / 2 - sH / 2, H - m - sH / 2 - sw / 2, sH, sw, 'Sam\n0400 000 000', { size: 11, align: 'center', valign: 'middle' });
        t.rot = 270; items.push(t);
        if (i) { var l = OP.newShape('line', m + i * sw, H - m - sH, 0, sH); l.stroke = { color: '#1b2228', width: 0.75, dash: 'dash' }; items.push(l); }
      }
      return mmDoc(210, 297, 'Tear-off flyer', items); } },
    { name: 'Newsletter, two pages (A4)', make: function () { var W = 210 * MM, H = 297 * MM, m = 15 * MM, colW = (W - 2 * m - 6 * MM) / 2;
      var story = 'Write your lead story here. The text continues in the second column and then on page two, because these boxes are linked: keep typing and it flows on. ';
      var a = tx(m, 70 * MM, colW, H - 70 * MM - m, new Array(9).join(story), { size: 10.5, font: 'Georgia' }), b = tx(m + colW + 6 * MM, 70 * MM, colW, H - 70 * MM - m, '', { size: 10.5, font: 'Georgia' });
      var c = tx(m, m + 14 * MM, W - 2 * m, H * 0.5, '', { size: 10.5, font: 'Georgia' });
      a.text.paras.forEach(function (p) { p.align = 'justify'; }); a.text.hyph = true; c.text.cols = 2; c.text.gap = 17;
      a.next = b.id; b.next = c.id;
      return mmDoc(210, 297, 'Newsletter', [
        sh('rect', 0, 0, W, 38 * MM, '#17384a'), tx(m, 8 * MM, W - 2 * m, 24 * MM, 'The Riverside News', { size: 44, b: true, color: '#ffffff', font: 'Georgia', valign: 'middle' }),
        tx(m, 42 * MM, W - 2 * m, 8 * MM, 'Issue 1   |   March', { size: 10, color: '#53606b' }),
        tx(m, 52 * MM, W - 2 * m, 16 * MM, 'Headline for the main story', { size: 26, b: true }), a, b
      ], function (d) {
        var p2 = OP.newPage();
        p2.items = [tx(m, m, W - 2 * m, 12 * MM, 'Continued from page 1', { size: 10, i: true, color: '#53606b' }), c,
          sh('rect', m, H * 0.62, W - 2 * m, 0.8 * MM, '#0b6e99'), tx(m, H * 0.64, W - 2 * m, 14 * MM, 'Dates for your diary', { size: 20, b: true }),
          tx(m, H * 0.64 + 16 * MM, W - 2 * m, 60 * MM, 'Add events, opening hours or contact details here.', { size: 11 })];
        d.pages.push(p2);
      }); } },
    { name: 'Business card (90 × 55 mm)', make: function () { var W = 90 * MM, H = 55 * MM;
      return mmDoc(90, 55, 'Business card', [sh('rect', 0, 0, 6 * MM, H, '#0b6e99'),
        tx(12 * MM, 12 * MM, W - 18 * MM, 10 * MM, 'Alex Tan', { size: 17, b: true }), tx(12 * MM, 22 * MM, W - 18 * MM, 6 * MM, 'Graphic designer', { size: 9.5, color: '#53606b' }),
        tx(12 * MM, 34 * MM, W - 18 * MM, 16 * MM, '0400 000 000\nalex@example.com\nexample.com', { size: 8.5 })]); } },
    { name: 'Certificate (A4 landscape)', make: function () { var W = 297 * MM, H = 210 * MM, m = 12 * MM;
      var frame = OP.newShape('rect', m, m, W - 2 * m, H - 2 * m); frame.fill = null; frame.stroke = { color: '#17384a', width: 3, dash: 'solid' };
      var inner = OP.newShape('rect', m + 3 * MM, m + 3 * MM, W - 2 * m - 6 * MM, H - 2 * m - 6 * MM); inner.fill = null; inner.stroke = { color: '#d4249b', width: 0.75, dash: 'solid' };
      var wa = OP.newWordArt('Certificate of Achievement', W * 0.17, 30 * MM, W * 0.66, 34 * MM); wa.wa.font = 'Georgia'; wa.wa.warp = 'canUp'; wa.fill = { type: 'solid', color: '#17384a' };
      return mmDoc(297, 210, 'Certificate', [frame, inner, wa,
        tx(m, 78 * MM, W - 2 * m, 10 * MM, 'presented to', { size: 16, i: true, align: 'center', font: 'Georgia' }),
        tx(m, 92 * MM, W - 2 * m, 24 * MM, 'Recipient name', { size: 44, b: true, align: 'center', font: 'Georgia' }),
        tx(W * 0.2, 124 * MM, W * 0.6, 24 * MM, 'in recognition of outstanding effort and commitment throughout the year', { size: 15, align: 'center', font: 'Georgia' }),
        tx(W * 0.15, 168 * MM, W * 0.3, 12 * MM, 'Date', { size: 11, align: 'center', color: '#53606b' }), tx(W * 0.55, 168 * MM, W * 0.3, 12 * MM, 'Signed', { size: 11, align: 'center', color: '#53606b' })]); } }
  ];
  function templateGroups() {
    var out = [{ cat: 'Built in', items: BUILTIN_TEMPLATES.map(function (t) { return { name: t.name, make: t.make }; }) }];
    packs.forEach(function (p) {
      if (p.templates.length) out.push({ cat: p.name, pack: p, items: p.templates.map(function (t, i) { return { name: t.name, make: function () { return OP.normaliseDoc(JSON.parse(JSON.stringify(t.doc))); }, pack: p, index: i }; }) });
    });
    if (pluginTemplates.length) out.push({ cat: 'From plug-ins', items: pluginTemplates.map(function (t) { return { name: t.name, make: function () { return OP.normaliseDoc(JSON.parse(JSON.stringify(t.make()))); } }; }) });
    return out;
  }
  A.dlgTemplates = function () {
    var body = [];
    templateGroups().forEach(function (g) {
      body.push(h('h3', { text: g.cat, style: 'margin:4px 0 0;font-size:13px' }));
      body.push(h('div', { class: 'tplgrid' }, g.items.map(function (t) {
        var doc = null, holder = h('div', { style: 'height:120px;display:flex;align-items:center;justify-content:center' });
        try { doc = t.make(); } catch (e) { doc = null; }
        if (doc) {
          OP.ensureImages(doc).then(function () {
            try {
              var k = Math.min(132 / doc.w, 116 / doc.h), c = OP.pageToCanvas(doc, doc.pages[0], k * Math.min(2, window.devicePixelRatio || 1));
              c.style.width = Math.round(doc.w * k) + 'px'; c.style.height = Math.round(doc.h * k) + 'px'; c.style.boxShadow = '0 1px 4px var(--shadow)';
              holder.appendChild(c);
            } catch (e) { holder.textContent = 'No preview'; }
          });
        }
        var card = h('button', { type: 'button', class: 'blk', title: 'Start from ' + t.name, disabled: !doc, onclick: function () {
          A.closeModal();
          A.guardUnsaved(function () { var d = t.make(); d.name = t.name.replace(/\s*\(.*\)$/, ''); A.loadDoc(d); A.zoomLabel(); S.filePath = null; A.setTitle(); });
        } }, [holder, h('span', { text: t.name })]);
        if (!t.pack || t.pack.id !== 'mine') return card;
        return h('div', { style: 'position:relative' }, [card, h('button', { type: 'button', class: 'icon-btn', title: 'Delete this template', 'aria-label': 'Delete template ' + t.name,
          style: 'position:absolute;top:2px;right:2px;background:var(--panel)', html: A.icon('trash'), onclick: function () { t.pack.templates.splice(t.index, 1); savePacks().then(A.dlgTemplates); } })]);
      })));
    });
    A.modal('New from template', body, [{ label: 'Cancel' }, { label: 'Blank document…', fn: function () { setTimeout(A.dlgNew, 0); } }], { wide: true });
  };
  A.saveAsTemplate = function () {
    if (A.isEditing()) A.endEdit();
    var name = h('input', { type: 'text', id: 'tplName', maxlength: 60 });
    name.value = S.doc.name;
    A.modal('Save as template', [h('div', { class: 'row' }, [h('label', { text: 'Name', for: 'tplName' }), h('div', { class: 'f' }, [name])]),
      h('p', { class: 'hint', text: 'Templates are kept on this computer and offered under File › From template. Export them as a content pack to share them.' })],
    [{ label: 'Cancel' }, { label: 'Save template', cls: 'primary', fn: function () {
      var doc = JSON.parse(JSON.stringify(A.projectObject()));
      doc.merge = null;
      mine().templates.push({ name: name.value.trim() || 'Template', doc: doc });
      savePacks().then(function (ok) { if (ok) A.toast('Template saved.'); });
    } }]);
  };

  // ---------------------------------------------------------------- script plug-ins
  function makeApi(rec) {
    function guard(fn, what) {
      return function () {
        try {
          var r = fn.apply(null, arguments);
          if (r && typeof r.then === 'function') r.catch(function (e) { A.toast(rec.meta.name + ': ' + what + ' failed: ' + (e && e.message || e), true); });
          return r;
        } catch (e) { A.toast(rec.meta.name + ': ' + what + ' failed: ' + (e && e.message || e), true); }
      };
    }
    var api = {
      version: OP.VERSION,
      units: { mm: MM, pt: 1, inch: 72 },
      /** Add a button to the Plug-ins tab. */
      addCommand: function (c) {
        if (!c || typeof c.run !== 'function' || !c.label) throw new Error('addCommand needs {label, run}');
        A.pluginCommands.push({ label: String(c.label).slice(0, 40), tip: c.tip ? String(c.tip) : '', plugin: rec.id, run: guard(function () { return c.run(api); }, '“' + c.label + '”') });
      },
      /** Add a building block. make(pageWidth) returns the items, laid out from (0, 0). */
      addBlock: function (b) {
        if (!b || typeof b.make !== 'function' || !b.name) throw new Error('addBlock needs {name, make}');
        pluginBlocks.push({ name: String(b.name).slice(0, 60), category: String(b.category || rec.meta.name).slice(0, 40), make: b.make, plugin: rec.id });
      },
      /** Add a template. make() returns a document made with api.create.document(). */
      addTemplate: function (t) {
        if (!t || typeof t.make !== 'function' || !t.name) throw new Error('addTemplate needs {name, make}');
        pluginTemplates.push({ name: String(t.name).slice(0, 60), make: t.make, plugin: rec.id });
      },
      /** Add an export format. run(document) returns text or bytes (or a promise of them). */
      addExporter: function (x) {
        if (!x || typeof x.run !== 'function' || !x.label || !x.extension) throw new Error('addExporter needs {label, extension, run}');
        var ext = String(x.extension).replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'txt';
        A.pluginCommands.push({ label: 'Export: ' + String(x.label).slice(0, 30), tip: 'Export with ' + rec.meta.name, icon: 'rExport', plugin: rec.id, run: guard(async function () {
          var data = await x.run(JSON.parse(JSON.stringify(A.projectObject())));
          if (data === undefined || data === null) return;
          try { await OP.saveFile(OP.safeName(S.doc.name) + '.' + ext, data, x.mime || 'application/octet-stream'); A.toast('Exported.'); }
          catch (e) { if (!(e && e.cancelled)) throw e; }
        }, 'export') });
      },
      document: function () { return S.doc; },
      page: function () { return A.page(); },
      pageIndex: function () { return S.pi; },
      selection: function () { return A.selItems(); },
      create: {
        document: function (wMm, hMm) { return OP.newDoc(wMm * MM, hMm * MM); },
        textBox: function (x, y, w, hh, text, style) {
          style = style || {};
          return OP.newTextBox(x, y, w, hh, String(text === undefined ? '' : text).split('\n').map(function (line) {
            return OP.newPara([OP.newRun(line, { font: style.font || 'Arial', size: style.size || 12, b: !!style.bold, i: !!style.italic, color: style.color || '#000000' })], { align: style.align || 'left' });
          }));
        },
        shape: function (kind, x, y, w, hh, fill, stroke) {
          var it = OP.newShape(OP.SHAPE_KINDS[kind] ? kind : 'rect', x, y, w, hh);
          it.fill = fill ? { type: 'solid', color: fill } : null;
          it.stroke = stroke ? { color: stroke.color || '#000000', width: stroke.width || 1, dash: 'solid' } : null;
          return it;
        },
        table: function (rows, cols, x, y, w, hh) { return OP.newTable(Math.max(1, rows | 0), Math.max(1, cols | 0), x, y, w, hh); },
        wordArt: function (text, x, y, w, hh) { return OP.newWordArt(text, x, y, w, hh); },
        shapeKinds: function () { return Object.keys(OP.SHAPE_KINDS).filter(function (k) { return k !== 'path'; }); }
      },
      /** Put items on the current page, select them and record an undo step. */
      insert: function (items) { var c = cleanItems(items, {}); if (c.items.length) { A.setTool('select'); A.addItems(c.items); } return c.items; },
      /** Call after changing items you got from selection() or page(), so the change is drawn and undoable. */
      commit: function () { OP.reindex(S.doc); A.commit(); A.refreshAll(); },
      plainText: function (item) { return item && item.type === 'table' ? OP.tableText(item) : item && item.wa ? item.wa.text : (item && item.text ? OP.plainText(item.text) : ''); },
      setText: function (item, text) {
        if (!item || !item.text) return false;
        var r = item.text.paras[0].runs[0], p0 = item.text.paras[0];
        item.text.paras = String(text).split('\n').map(function (line) { return OP.newPara([OP.newRun(line, { font: r.font, size: r.size, b: r.b, i: r.i, u: r.u, color: r.color })], { align: p0.align }); });
        return true;
      },
      toast: function (msg) { A.toast(String(msg)); },
      alert: function (title, message) { A.modal(String(title), String(message).split('\n').map(function (l) { return h('p', { text: l }); })); },
      saveFile: function (name, data, mime) { return OP.saveFile(OP.safeName(String(name)), data, mime || 'application/octet-stream'); }
    };
    return api;
  }
  function resetRegistries() { A.pluginCommands.length = 0; pluginBlocks = []; pluginTemplates = []; }
  function runPlugin(rec) {
    rec.error = '';
    if (!rec.meta) rec.meta = { name: rec.fileName, version: '', author: '', description: '' };
    if (!rec.enabled) return; // a switched-off plug-in is not run at all
    var registered = false;
    var host = { version: OP.VERSION, register: function (meta, activate) {
      registered = true;
      meta = meta || {};
      rec.meta = { name: String(meta.name || rec.fileName).slice(0, 60), version: String(meta.version || '').slice(0, 20), author: String(meta.author || '').slice(0, 60), description: String(meta.description || '').slice(0, 300) };
      if (typeof activate === 'function') activate(makeApi(rec));
    } };
    try {
      (new Function('OpenPub', '"use strict";\n' + rec.code + '\n//# sourceURL=openpub-plugin-' + rec.id + '.js'))(host);
      if (!registered) rec.error = 'The file did not call OpenPub.register(...), so it added nothing.';
    } catch (e) {
      rec.error = /unsafe-eval|Content Security Policy|EvalError/i.test(String(e)) ? 'Script plug-ins cannot run in this browser view. They work in the desktop app.' : 'It stopped with an error: ' + (e && e.message || e);
    }
  }
  function reloadPlugins() {
    resetRegistries();
    plugins.forEach(runPlugin);
    if (A.refreshRibbon) A.refreshRibbon();
  }
  function savePlugins() { return kvPut('plugins', plugins.map(function (p) { return { id: p.id, fileName: p.fileName, code: p.code, enabled: p.enabled, meta: p.meta }; })); }
  A.runPluginCommand = function (c) { if (A.isEditing()) A.endEdit(); c.run(); };

  // ---------------------------------------------------------------- manage dialog
  function readFileText(file) { return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(String(fr.result)); }; fr.onerror = function () { rej(new Error('The file could not be read.')); }; fr.readAsText(file); }); }
  /** Install a content pack from JSON text. Returns the pack. */
  A.installPackText = function (text) {
    var raw;
    try { raw = JSON.parse(text); } catch (e) { throw new Error('The file is not valid JSON, so it is not a content pack.'); }
    var p = cleanPack(raw);
    packs.push(p);
    savePacks();
    return p;
  };
  /** Install a plug-in from its source text (after the user has agreed). */
  A.installPluginText = function (fileName, code) {
    var rec = { id: OP.uid('g'), fileName: String(fileName).slice(0, 80), code: String(code), enabled: true };
    plugins.push(rec);
    reloadPlugins();
    savePlugins();
    return rec;
  };
  A.exportPack = async function () {
    var m = mine(), blocks = (A.userBlocks ? A.userBlocks() : []).map(function (b) { return { name: b.name, category: 'My blocks', items: b.items, assets: b.assets || {} }; });
    if (!blocks.length && !m.templates.length) { A.toast('There is nothing to export yet. Save a building block or a template first.'); return; }
    var pack = { openpubPack: 1, name: 'My OpenPub content', author: '', description: 'Building blocks and templates exported from OpenPub.', blocks: blocks, templates: m.templates, colours: [] };
    try { await OP.saveFile('my-content.opubpack', JSON.stringify(pack), 'application/json'); A.toast('Content pack saved.'); }
    catch (e) { if (!(e && e.cancelled)) A.toast(e.message, true); }
  };
  A.dlgPlugins = function () {
    var packFile = h('input', { type: 'file', accept: '.opubpack,.json,application/json', hidden: true });
    packFile.addEventListener('change', function () {
      var f = packFile.files[0]; if (!f) return;
      readFileText(f).then(function (t) { var p = A.installPackText(t); A.toast('Installed “' + p.name + '”: ' + p.templates.length + ' templates, ' + p.blocks.length + ' blocks, ' + p.colours.length + ' colour schemes.'); A.dlgPlugins(); })
        .catch(function (e) { A.toast(e.message, true); });
    });
    var plugFile = h('input', { type: 'file', accept: '.js,text/javascript', hidden: true });
    plugFile.addEventListener('change', function () {
      var f = plugFile.files[0]; if (!f) return;
      readFileText(f).then(function (code) {
        A.modal('Install this plug-in?', [
          h('p', null, [h('b', { text: f.name }), ' (' + Math.ceil(code.length / 1024) + ' KB)']),
          h('div', { class: 'note', text: 'A plug-in is a program. It can read and change the documents you open in OpenPub and can ask to save files. Install only plug-ins from people you trust.' })
        ], [{ label: 'Cancel', fn: function () { setTimeout(A.dlgPlugins, 0); } }, { label: 'Install', cls: 'primary', fn: function () {
          var rec = A.installPluginText(f.name, code);
          if (rec.error) A.toast(rec.meta.name + ': ' + rec.error, true); else A.toast('Installed “' + rec.meta.name + '”. Its commands are on the Plug-ins tab.');
          setTimeout(A.dlgPlugins, 0);
        } }]);
      }).catch(function (e) { A.toast(e.message, true); });
    });
    var plugList = plugins.length ? plugins.map(function (p) {
      var cb = h('input', { type: 'checkbox', 'aria-label': 'Switch ' + p.meta.name + ' on or off' }); cb.checked = !!p.enabled;
      cb.addEventListener('change', function () { p.enabled = cb.checked; reloadPlugins(); savePlugins(); A.dlgPlugins(); });
      return h('div', { class: 'plug' + (p.error ? ' err' : '') }, [cb, h('div', { class: 'meta' }, [
        h('b', { text: p.meta.name + (p.meta.version ? '  ' + p.meta.version : '') }),
        h('span', { text: (p.meta.author ? 'By ' + p.meta.author + '. ' : '') + (p.meta.description || p.fileName) }),
        p.error ? h('span', { style: 'display:block;color:var(--warn)', text: p.error }) : null]),
      ui.btn('Remove', function () { plugins = plugins.filter(function (x) { return x !== p; }); reloadPlugins(); savePlugins(); A.dlgPlugins(); }, 'danger')]);
    }) : [h('p', { class: 'hint', text: 'No plug-ins installed. A plug-in is a .js file that adds commands, building blocks, templates or export formats. The app folder has an example and a guide (PLUGINS.md).' })];
    var shown = packs.filter(function (p) { return p.id !== 'mine' || p.templates.length; });
    var packList = shown.length ? shown.map(function (p) {
      return h('div', { class: 'plug' }, [h('div', { class: 'meta' }, [h('b', { text: p.name }),
        h('span', { text: (p.author ? 'By ' + p.author + '. ' : '') + p.templates.length + ' templates, ' + p.blocks.length + ' building blocks, ' + p.colours.length + ' colour schemes.' + (p.description ? ' ' + p.description : '') })]),
      p.id !== 'mine' ? ui.btn('Remove', function () { packs = packs.filter(function (x) { return x !== p; }); if (scheme.indexOf(p.id + '/') === 0) { scheme = ''; kvPut('scheme', ''); applyScheme(); } savePacks(); A.dlgPlugins(); }, 'danger') : null]);
    }) : [h('p', { class: 'hint', text: 'No content packs installed. A pack is a file of templates, building blocks and colour schemes: data only, safe to share.' })];
    var schemeSel = ui.select('plScheme', scheme, [['', 'None (full colour picker)']].concat(allSchemes().map(function (s) { return [s.key, s.name]; })), function (v) {
      scheme = v; kvPut('scheme', v); applyScheme(); A.refreshPanels();
    }, 'Colour scheme');
    A.modal('Plug-ins and content packs', [
      h('h3', { text: 'Plug-ins', style: 'margin:0;font-size:13px' })].concat(plugList, [
      h('div', { class: 'row' }, [ui.btn('Install a plug-in…', function () { plugFile.click(); })]), plugFile,
      h('h3', { text: 'Content packs', style: 'margin:8px 0 0;font-size:13px' })], packList, [
      h('div', { class: 'row wrap' }, [ui.btn('Install a content pack…', function () { packFile.click(); }), ui.btn('Export my blocks and templates as a pack…', function () { A.exportPack(); })]), packFile,
      h('h3', { text: 'Colour scheme', style: 'margin:8px 0 0;font-size:13px' }),
      h('div', { class: 'row' }, [schemeSel]),
      h('p', { class: 'hint', text: 'With a scheme chosen, colour pickers open on its swatches first. Everything here is stored on this computer only.' })
    ]), null, { wide: true });
  };

  /** Load installed packs and plug-ins. Called once at start-up. */
  A.initPlugins = function () {
    return Promise.all([kvGet('packs'), kvGet('plugins'), kvGet('scheme')]).then(function (r) {
      if (Array.isArray(r[0])) packs = r[0].filter(function (p) { return p && p.id && Array.isArray(p.templates) && Array.isArray(p.blocks) && Array.isArray(p.colours); });
      if (Array.isArray(r[1])) plugins = r[1].filter(function (p) { return p && p.id && typeof p.code === 'string'; });
      scheme = typeof r[2] === 'string' ? r[2] : '';
      reloadPlugins();
      applyScheme();
    });
  };
})();
