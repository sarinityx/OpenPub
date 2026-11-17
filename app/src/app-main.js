/* OpenPub – dialogs, opening and saving files, autosave, start-up. */
var OP = (typeof globalThis.OP !== 'undefined') ? globalThis.OP : (globalThis.OP = {});

(function () {
  'use strict';
  var A = OP.app, S = A.S, $ = A.$, h = A.h, MM = OP.MM;

  // ---------------------------------------------------------------- modal dialogs
  var modalBusy = false, modalOnClose = null;
  A.modalOpen = function () { return $('modal').classList.contains('open'); };
  A.closeModal = function (force) {
    if (modalBusy && !force) return;
    var m = $('modal'), fn = modalOnClose;
    modalBusy = false; modalOnClose = null;
    m.classList.remove('open');
    m.innerHTML = '';
    if (fn) fn();
  };
  /**
   * Show a dialog. buttons: [{label, fn, cls, id}] – fn may return false to keep the dialog open.
   * Returns {body, footer, busy(on)}.
   */
  A.modal = function (title, body, buttons, opts) {
    opts = opts || {};
    A.closeModal(true);
    if (S.editing) A.endEdit();
    var m = $('modal');
    var bodyEl = h('div', { class: 'body' }, body);
    var footer = h('footer', null, (buttons || [{ label: 'Close', cls: 'primary' }]).map(function (b) {
      return h('button', { type: 'button', class: 'btn ' + (b.cls || ''), id: b.id || null, text: b.label, onclick: function () {
        if (modalBusy) return;
        var keep = b.fn ? b.fn() : undefined;
        if (keep !== false) A.closeModal();
      } });
    }));
    var dlg = h('div', { class: 'dlg' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [h('header', { text: title }), bodyEl, footer]);
    m.appendChild(dlg);
    m.classList.add('open');
    modalOnClose = opts.onClose || null;
    var first = dlg.querySelector('input:not([type="hidden"]), select, .btn.primary') || dlg.querySelector('button');
    if (first) first.focus();
    return {
      body: bodyEl, footer: footer,
      busy: function (on) {
        modalBusy = !!on;
        Array.prototype.forEach.call(footer.querySelectorAll('button'), function (b) { b.disabled = !!on; });
      }
    };
  };

  // small form helpers for dialogs
  function row(label, kids, forId) { return h('div', { class: 'row' }, [h('label', { text: label, for: forId || null })].concat(kids)); }
  function numField(id, value, unit, min, max, step) {
    var inp = h('input', { type: 'number', id: id, min: min, max: max, step: step || 1 });
    inp.value = value;
    return h('div', { class: 'f' }, [inp, unit ? h('span', { text: unit }) : null]);
  }
  function sel(id, value, options) {
    var s = h('select', { id: id }, options.map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    s.value = value;
    s.style.flex = '1';
    return s;
  }
  function check(id, label, on, disabled) {
    var inp = h('input', { type: 'checkbox', id: id, disabled: !!disabled });
    inp.checked = !!on;
    return h('label', { for: id, style: 'display:flex;align-items:center;gap:7px;flex:1' + (disabled ? ';opacity:.5' : '') }, [inp, label]);
  }
  function val(id, fallback) { var v = parseFloat($(id).value); return isFinite(v) ? v : fallback; }
  function progressBar() { var bar = h('i'); return { el: h('div', { class: 'progress' }, [bar]), set: function (f) { bar.style.width = Math.round(OP.clamp(f, 0, 1) * 100) + '%'; } }; }
  function fail(e) {
    if (e && e.cancelled) { A.toast('Save cancelled.'); return; }
    A.toast((e && e.message) || 'Something went wrong.', true);
  }

  // ---------------------------------------------------------------- project files + autosave
  /** The document as a plain object holding only the pictures that are still in use. */
  function projectObject() {
    var d = S.doc, used = {}, assets = {};
    d.pages.forEach(function (p) {
      p.items.forEach(function (it) {
        if (it.asset) used[it.asset] = true;
        if (it.fill && it.fill.type === 'image') used[it.fill.asset] = true;
      });
    });
    Object.keys(d.assets).forEach(function (k) { if (used[k]) assets[k] = d.assets[k]; });
    (d.masters || []).forEach(function (m) { m.items.forEach(function (it) { if (it.asset && d.assets[it.asset]) assets[it.asset] = d.assets[it.asset]; if (it.fill && it.fill.type === 'image' && d.assets[it.fill.asset]) assets[it.fill.asset] = d.assets[it.fill.asset]; }); });
    var mg = d.merge ? { fields: d.merge.fields, rows: d.merge.rows } : null;
    return { app: 'OpenPub', version: 2, name: d.name, w: d.w, h: d.h, bleed: d.bleed, margins: d.margins, assets: assets, masters: d.masters || [], merge: mg, pages: d.pages };
  }

  /** Save the project. In the desktop app this overwrites the open file; saveAs asks for a new name. */
  A.saveProject = async function (saveAs) {
    if (S.editing) A.endEdit();
    try {
      var json = JSON.stringify(projectObject());
      if (OP.desktop) {
        var res = await OP.desktop.saveFile({ name: OP.safeName(S.doc.name) + '.opub', bytes: new TextEncoder().encode(json), path: (!saveAs && S.filePath) || null });
        if (!res || res.cancelled) { A.toast('Save cancelled.'); return false; }
        if (res.error) throw new Error(res.error);
        S.filePath = res.path;
        var nm = String(res.name || '').replace(/\.opub$/i, '');
        if (nm && nm !== S.doc.name) { S.doc.name = nm; $('docname').value = nm; A.commit(); }
      } else await OP.saveFile(OP.safeName(S.doc.name) + '.opub', json, 'application/json');
      S.dirty = false;
      A.setTitle();
      A.status('Project saved');
      return true;
    } catch (e) { fail(e); return false; }
  };
  A.projectObject = function () { return projectObject(); };
  A.setTitle = function () { document.title = (S.doc ? S.doc.name : 'Untitled') + (S.dirty ? ' •' : '') + ' – OpenPub'; };

  var DB = 'openpub', STORE = 'kv', autosaveTimer = 0;
  function idb() {
    return new Promise(function (resolve, reject) {
      var rq;
      try { rq = indexedDB.open(DB, 1); } catch (e) { reject(e); return; }
      rq.onupgradeneeded = function () { rq.result.createObjectStore(STORE); };
      rq.onsuccess = function () { resolve(rq.result); };
      rq.onerror = function () { reject(rq.error || new Error('no storage')); };
    });
  }
  function idbPut(key, value) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = function () { db.close(); resolve(); };
        tx.onerror = tx.onabort = function () { db.close(); reject(tx.error || new Error('write failed')); };
      });
    });
  }
  function idbGet(key) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var rq = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        rq.onsuccess = function () { db.close(); resolve(rq.result); };
        rq.onerror = function () { db.close(); reject(rq.error); };
      });
    });
  }
  /** Keep a recovery copy in this browser. Best effort: it is not a substitute for Save project. */
  A.autosaveSoon = function () {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(function () {
      var rec;
      try { rec = { when: Date.now(), name: S.doc.name, json: JSON.stringify(projectObject()) }; } catch (e) { return; }
      idbPut('autosave', rec).catch(function () { /* storage unavailable – ignore */ });
    }, 2500);
  };
  function readAutosave() {
    return idbGet('autosave').then(function (rec) { return rec && rec.json ? rec : null; }, function () { return null; });
  }

  // ---------------------------------------------------------------- opening files
  function readBytes(file) {
    if (file.bytes && typeof file.bytes !== 'function') return Promise.resolve(file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes));
    if (file.arrayBuffer) return file.arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(new Uint8Array(fr.result)); };
      fr.onerror = function () { reject(new Error('Could not read ' + file.name)); };
      fr.readAsArrayBuffer(file);
    });
  }
  /** Ask before throwing away unsaved work, then run fn. */
  A.guardUnsaved = function (fn) {
    if (!S.dirty) { fn(); return; }
    A.modal('Unsaved changes', [h('p', { text: '“' + S.doc.name + '” has changes that are not saved to a project file. Opening something else replaces it.' })], [
      { label: 'Cancel' },
      { label: 'Save project first', fn: function () { A.saveProject().then(function () { if (!S.dirty) fn(); }); } },
      { label: 'Discard changes', cls: 'danger', fn: function () { setTimeout(fn, 0); } }
    ]);
  };

  A.openFile = function (file) {
    A.guardUnsaved(function () { openNow(file); });
  };
  async function openNow(file) {
    A.status('Opening ' + file.name + '…');
    try {
      var bytes = await readBytes(file);
      if (OP.isCFB(bytes)) {
        var pub = await OP.parsePub(bytes);
        var r = OP.pubToDoc(pub, file.name.replace(/\.pub$/i, ''), { flow: true });
        A.loadDoc(r.doc);
        A.zoomLabel();
        S.filePath = null;
        S.dirty = true; // imported, not yet saved as a project
        A.setTitle();
        A.autosaveSoon();
        A.status('Imported ' + file.name);
        showImportReport(file.name, r);
        return;
      }
      var text = new TextDecoder('utf-8').decode(bytes), obj;
      try { obj = JSON.parse(text); } catch (e) { throw new Error(file.name + ' is neither a Publisher file nor an OpenPub project.'); }
      A.loadDoc(OP.normaliseDoc(obj));
      A.zoomLabel();
      S.filePath = file.path || null;
      A.setTitle();
      A.status('Opened ' + file.name);
    } catch (e) {
      A.status('');
      A.modal('This file could not be opened', [h('p', { text: (e && e.message) || String(e) }),
        h('p', { class: 'hint', text: 'Supported: Publisher 2002–2021 and Microsoft 365 .pub files, and OpenPub .opub projects.' })]);
    }
  }
  function showImportReport(fileName, r) {
    var d = r.doc, fonts = {};
    d.pages.forEach(function (p) { p.items.forEach(function (it) { if (it.text) it.text.paras.forEach(function (pa) { pa.runs.forEach(function (ru) { fonts[ru.font] = true; }); }); }); });
    var missing = Object.keys(fonts).filter(function (f) {
      try { return document.fonts && document.fonts.check && !document.fonts.check('12px "' + f.replace(/"/g, '') + '"'); } catch (e) { return false; }
    }).sort();
    var body = [h('p', { text: d.pages.length + (d.pages.length === 1 ? ' page, ' : ' pages, ') + r.itemCount + ' objects, ' + OP.round(d.w / MM, 1) + ' × ' + OP.round(d.h / MM, 1) + ' mm.' })];
    if (r.notes.length) body.push(h('p', { text: 'Differences from the original:' }), h('ul', null, r.notes.map(function (n) { return h('li', { text: n }); })));
    if (missing.length) body.push(h('div', { class: 'note', text: 'Fonts not installed on this computer (a substitute is shown, so line breaks may differ): ' + missing.join(', ') }));
    body.push(h('p', { class: 'hint', text: 'The .pub file itself is never changed. Use File › Save project to keep your edits, and Export for PDF, PNG or SVG. Saving back to .pub is not possible.' }));
    A.modal('Imported ' + fileName, body, [{ label: 'Start editing', cls: 'primary' }]);
  }

  // ---------------------------------------------------------------- File › New
  A.dlgNew = function () {
    var opts = OP.PAGE_SIZES.map(function (p) { return [p.id, p.label + '  ' + p.w + ' × ' + p.h + ' mm']; }).concat([['custom', 'Custom size']]);
    var body = [
      row('Size', [sel('nSize', 'A3', opts)], 'nSize'),
      row('Orientation', [sel('nOrient', 'p', [['p', 'Portrait'], ['l', 'Landscape']])], 'nOrient'),
      h('div', { class: 'row', id: 'nCustom', hidden: true }, [h('label', { text: 'Custom' }), numField('nW', 500, 'mm W', 5, 5000), numField('nH', 700, 'mm H', 5, 5000)]),
      row('Bleed', [numField('nBleed', 0, 'mm', 0, 50, 0.5)], 'nBleed'),
      h('p', { class: 'hint', text: 'Use 3 mm bleed if a print shop will trim the poster. Leave 0 for office printers.' })
    ];
    A.modal('New document', body, [{ label: 'Cancel' }, { label: 'Create', cls: 'primary', fn: function () {
      var id = $('nSize').value, p = OP.PAGE_SIZES.filter(function (x) { return x.id === id; })[0];
      var w = p ? p.w : val('nW', 210), hh = p ? p.h : val('nH', 297), land = $('nOrient').value === 'l';
      w = OP.clamp(w, 5, 5000); hh = OP.clamp(hh, 5, 5000);
      if (p && land !== (w > hh)) { var t = w; w = hh; hh = t; }
      var bleed = OP.clamp(val('nBleed', 0), 0, 50);
      A.guardUnsaved(function () {
        var doc = OP.newDoc(w * MM, hh * MM);
        doc.bleed = bleed * MM;
        A.loadDoc(doc); A.zoomLabel();
      });
      return S.dirty ? false : undefined; // guardUnsaved opened its own dialog
    } }]);
    $('nSize').addEventListener('change', function () {
      var custom = $('nSize').value === 'custom';
      $('nCustom').hidden = !custom; $('nOrient').disabled = custom;
    });
  };

  // ---------------------------------------------------------------- File › Export
  A.dlgExport = function () {
    var d = S.doc, many = d.pages.length > 1, hasBleed = d.bleed > 0, vec = !!(OP.desktop && OP.desktop.vectorPdf);
    var prog = progressBar();
    prog.el.hidden = true;
    var info = h('p', { class: 'hint', id: 'xInfo' });
    var body = [
      row('Format', [sel('xFmt', vec ? 'vpdf' : 'pdf', (vec ? [['vpdf', 'PDF, vector (sharp text, fonts embedded)']] : []).concat([['pdf', 'PDF, picture of each page'], ['png', 'PNG picture'], ['jpeg', 'JPEG picture'], ['svg', 'SVG (vector, editable text)']]))], 'xFmt'),
      many ? row('Pages', [sel('xPages', 'all', [['all', 'All ' + d.pages.length + ' pages'], ['cur', 'Current page (' + (S.pi + 1) + ')']])], 'xPages') : null,
      row('Resolution', [sel('xDpi', '300', [['96', '96 dpi – screen'], ['150', '150 dpi – draft'], ['200', '200 dpi'], ['300', '300 dpi – print'], ['600', '600 dpi – fine print']])], 'xDpi'),
      h('div', { class: 'row' }, [h('label', { text: 'Print marks' }), check('xBleed', 'Include bleed', hasBleed, !hasBleed), check('xMarks', 'Crop marks', false)]),
      info, prog.el
    ];
    var dlg = A.modal('Export', body, [{ label: 'Cancel' }, { label: 'Export', cls: 'primary', id: 'xGo', fn: function () { run(); return false; } }]);

    function update() {
      var fmt = $('xFmt').value, dpi = +$('xDpi').value, b = $('xBleed').checked ? d.bleed : 0, msg = '';
      $('xDpi').disabled = fmt === 'svg' || fmt === 'vpdf';
      $('xMarks').disabled = fmt !== 'pdf' && fmt !== 'vpdf';
      if (fmt === 'vpdf') {
        msg = 'Text and shapes stay vector and the fonts are embedded, so the PDF is sharp at any size and its text can be selected. For CMYK, copies per sheet or booklets use File › Print.';
      } else if (fmt === 'pdf') {
        var max = OP.maxDpiFor(d.w + 2 * b);
        msg = 'Each page is stored as a ' + Math.min(dpi, max) + ' dpi picture, so it prints exactly as shown here. Text in the PDF cannot be selected or searched.';
        if (dpi > max) msg += ' This page is too large for ' + dpi + ' dpi in a browser; ' + max + ' dpi is the limit.';
      } else if (fmt === 'svg') {
        msg = 'Vector output with live text. Fonts are referenced by name, not embedded: the computer that opens the SVG needs the same fonts.';
      } else {
        var W = d.w + 2 * b, H = d.h + 2 * b;
        var eff = Math.floor(Math.min(dpi, OP.maxDpiFor(Math.max(W, H)), Math.sqrt(120e6 / (W * H)) * 72));
        msg = Math.round(W / 72 * eff) + ' × ' + Math.round(H / 72 * eff) + ' pixels' + (eff < dpi ? ' (' + eff + ' dpi is the largest this browser can make for this page size).' : '.');
        if (many && (!$('xPages') || $('xPages').value === 'all')) msg += ' All pages are saved together in one ZIP file.';
      }
      if (!hasBleed) msg += ' No bleed is set for this document (Properties › Print set-up).';
      info.textContent = msg;
    }
    ['xFmt', 'xDpi', 'xBleed', 'xPages'].forEach(function (id) { if ($(id)) $(id).addEventListener('change', update); });
    update();

    async function run() {
      var fmt = $('xFmt').value, dpi = +$('xDpi').value, bleed = $('xBleed').checked, marks = $('xMarks').checked;
      var all = many && $('xPages').value === 'all';
      var pages = all ? d.pages.map(function (_, i) { return i; }) : [S.pi];
      var base = OP.safeName(d.name), enc = new TextEncoder();
      dlg.busy(true); prog.el.hidden = false; prog.set(0.02);
      try {
        if (fmt === 'vpdf') {
          prog.set(0.3);
          var vblob = await OP.sheetsVectorPdf(d, OP.sheetsPlain(d, pages, [undefined], { bleed: bleed, marks: marks }));
          await OP.saveFile(base + '.pdf', vblob, 'application/pdf');
        } else if (fmt === 'pdf') {
          var res = await OP.exportPdf(d, { pages: pages, dpi: dpi, bleed: bleed, marks: marks, onProgress: prog.set });
          await OP.saveFile(base + '.pdf', res.blob, 'application/pdf');
        } else {
          var ext = fmt === 'jpeg' ? 'jpg' : fmt, mime = fmt === 'svg' ? 'image/svg+xml' : fmt === 'jpeg' ? 'image/jpeg' : 'image/png', files = [];
          for (var i = 0; i < pages.length; i++) {
            var bytes;
            if (fmt === 'svg') bytes = enc.encode(OP.pageToSvg(d, d.pages[pages[i]], { bleed: bleed }));
            else bytes = (await OP.exportImage(d, pages[i], { dpi: dpi, bleed: bleed, type: fmt })).bytes;
            files.push({ name: base + (d.pages.length > 1 ? '-page' + (pages[i] + 1) : '') + '.' + ext, bytes: bytes });
            prog.set((i + 1) / pages.length);
            await new Promise(function (r) { setTimeout(r, 0); });
          }
          if (files.length === 1) await OP.saveFile(files[0].name, files[0].bytes, mime);
          else await OP.saveFile(base + '-' + ext + '.zip', OP.makeZip(files), 'application/zip');
        }
        A.closeModal(true);
        A.toast('Export finished.');
      } catch (e) {
        dlg.busy(false); prog.el.hidden = true;
        fail(e);
      }
    }
  };

  // ---------------------------------------------------------------- File › Tiled poster print
  var SHEETS = { A4: [210, 297], A3: [297, 420], Letter: [215.9, 279.4] };
  A.dlgTile = function () {
    var d = S.doc, prog = progressBar();
    prog.el.hidden = true;
    var grid = h('div', { class: 'tilegrid' }), info = h('p', { class: 'hint' });
    var body = [
      h('p', { text: 'Print page ' + (S.pi + 1) + ' larger than your printer allows by splitting it over several sheets. Trim along the corner marks and tape the sheets together.' }),
      row('Paper in printer', [sel('tSheet', 'A4', [['A4', 'A4'], ['A3', 'A3'], ['Letter', 'US Letter']]), sel('tOrient', d.w > d.h ? 'l' : 'p', [['p', 'Portrait'], ['l', 'Landscape']])], 'tSheet'),
      row('Poster width', [numField('tWidth', OP.round(d.w / MM, 0), 'mm', 20, 10000, 10)], 'tWidth'),
      row('Sheet margin', [numField('tMargin', 8, 'mm', 0, 40, 1)], 'tMargin'),
      row('Overlap', [numField('tOverlap', 10, 'mm', 0, 50, 1)], 'tOverlap'),
      row('Resolution', [sel('tDpi', '200', [['150', '150 dpi'], ['200', '200 dpi'], ['300', '300 dpi']])], 'tDpi'),
      grid, info, prog.el
    ];
    var dlg = A.modal('Tiled poster print', body, [{ label: 'Cancel' }, { label: 'Make PDF', cls: 'primary', id: 'tGo', fn: function () { run(); return false; } }], { wide: true });

    function options() {
      var s = SHEETS[$('tSheet').value] || SHEETS.A4, width = OP.clamp(val('tWidth', d.w / MM), 20, 10000);
      return {
        page: S.pi, sheetW: s[0] * MM, sheetH: s[1] * MM, landscape: $('tOrient').value === 'l',
        margin: OP.clamp(val('tMargin', 8), 0, 40) * MM, overlap: OP.clamp(val('tOverlap', 10), 0, 50) * MM,
        scale: width * MM / d.w, dpi: +$('tDpi').value
      };
    }
    function update() {
      var o = options(), plan = OP.tilePlan(d, o);
      grid.innerHTML = '';
      $('tGo').disabled = !plan;
      if (!plan) { info.textContent = 'The margins and overlap leave no printable area on the sheet.'; return; }
      var cell = Math.max(10, Math.min(46, Math.floor(420 / plan.cols))), ch = Math.round(cell * plan.sh / plan.sw);
      grid.style.gridTemplateColumns = 'repeat(' + plan.cols + ', ' + cell + 'px)';
      for (var i = 0; i < plan.cols * plan.rows && i < 400; i++) grid.appendChild(h('i', { style: 'height:' + ch + 'px;line-height:' + ch + 'px', text: cell >= 22 ? String(i + 1) : '' }));
      var n = plan.cols * plan.rows;
      info.textContent = n + (n === 1 ? ' sheet' : ' sheets') + ' (' + plan.cols + ' across × ' + plan.rows + ' down). Finished poster: ' + OP.round(plan.pw / MM, 0) + ' × ' + OP.round(plan.ph / MM, 0) +
        ' mm, ' + Math.round(o.scale * 100) + '% of the page size. Print the PDF at 100% / “Actual size”, not “Fit to page”.' + (n > 150 ? ' That is a lot of paper.' : '');
    }
    ['tSheet', 'tOrient', 'tWidth', 'tMargin', 'tOverlap'].forEach(function (id) { $(id).addEventListener('input', update); $(id).addEventListener('change', update); });
    update();

    async function run() {
      var o = options();
      if (!OP.tilePlan(d, o)) return;
      o.onProgress = prog.set;
      dlg.busy(true); prog.el.hidden = false; prog.set(0.02);
      try {
        var res = await OP.exportTiledPdf(d, o);
        await OP.saveFile(OP.safeName(d.name) + '-tiled.pdf', res.blob, 'application/pdf');
        A.closeModal(true);
        A.toast('Tiled PDF finished: ' + res.plan.cols * res.plan.rows + ' sheets.');
      } catch (e) {
        dlg.busy(false); prog.el.hidden = true;
        fail(e);
      }
    }
  };

  // ---------------------------------------------------------------- Help
  function table(rows) {
    return h('table', null, [h('tbody', null, rows.map(function (r) { return h('tr', null, [h('td', null, [h('kbd', { text: r[0] })]), h('td', { text: r[1] })]); }))]);
  }
  A.dlgHelp = function () {
    A.modal('Shortcuts and tips', [
      table([
        ['V  T  R  O  L', 'Select, text box, rectangle, ellipse, line'],
        ['Double-click / Enter', 'Edit the text of the selected box or shape; Esc finishes'],
        ['Shift + click', 'Add to or remove from the selection'],
        ['Shift + drag a corner', 'Resize freely (corners keep proportions by default)'],
        ['Shift + rotate', 'Rotate in 15° steps'],
        ['Alt + drag', 'Switch snapping off for this drag'],
        ['Arrow keys', 'Nudge 0.5 mm; with Shift 5 mm'],
        ['Ctrl+D', 'Duplicate'],
        ['Ctrl+G / Ctrl+Shift+G', 'Group / ungroup'],
        ['Ctrl+] / Ctrl+[', 'Bring forward / send backward; add Shift for front / back'],
        ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
        ['Ctrl + wheel', 'Zoom at the pointer'],
        ['Space + drag, or middle button', 'Pan the page'],
        ['Ctrl+0 / Ctrl+1', 'Fit page / actual size'],
        ['Ctrl+S / Ctrl+O', 'Save project / open'],
        ['Ctrl+F / F7', 'Find and replace / spelling'],
        ['Ctrl+P / Ctrl+Shift+P', 'Print with the system dialog / print layouts and PDF'],
        ['Ctrl+F1', 'Hide or show the ribbon (or double-click a tab)'],
        ['Tab (in a table)', 'Next cell; Shift+Tab goes back']
      ]),
      h('p', { class: 'hint', text: 'Drag from a ruler to make a guide; drag a guide back to the ruler to remove it. Drop pictures or a .pub file anywhere on the page. Paste pictures straight from the clipboard.' })
    ], null, { wide: true });
  };
  A.dlgAbout = function () {
    function list(items) { return h('ul', null, items.map(function (t) { return h('li', { text: t }); })); }
    function head(t) { return h('h3', { text: t, style: 'margin:4px 0 0;font-size:13px' }); }
    A.modal('What works and what does not', [
      h('p', { text: 'OpenPub reads Publisher files with its own parser, on this computer. Nothing is uploaded.' }),
      head('Opens'),
      list(['.pub files from Publisher 2002, 2003, 2007, 2010, 2013, 2016, 2019, 2021 and Microsoft 365',
        'Text boxes with fonts, sizes, bold/italic/underline, colours, alignment, spacing, bullets and columns; linked text boxes stay linked',
        'Tables as tables, WordArt as WordArt, master pages as master pages',
        'Pictures (PNG, JPEG, most WMF and EMF artwork), AutoShapes, lines, fills, gradients, borders, rotation, groups']),
      head('Imported with changes'),
      list(['Linked boxes are chained in the order they are stored in the file, which is usually but not always the reading order',
        'Table cell borders and shading are simplified to one grid style; per-cell colours may be lost',
        'WordArt shapes are matched to the nearest of 22 warps; letters are placed individually rather than bent',
        'Unusual AutoShapes become rectangles; pattern fills become solid colours; EMF+ only pictures show as placeholders']),
      head('Not possible'),
      list(['Saving back to .pub. The format is undocumented; work is saved as an .opub project and exported as PDF, PNG, JPEG or SVG',
        'Publisher 98, 2000 and older files',
        'Catalogue merge and spot-colour separations',
        OP.desktop ? 'Vector CMYK needs Ghostscript installed on this computer (it is not bundled); without it CMYK output is a picture PDF with no colour profile' : 'Vector PDF, printing, the spelling checker and script plug-ins need the desktop app'])
    ], null, { wide: true });
  };

  // ---------------------------------------------------------------- welcome
  function welcome(saved) {
    var body = [
      h('p', { text: 'A page-layout editor for posters, flyers and newsletters that opens Microsoft Publisher files.' }),
      h('p', { class: 'hint', text: 'Files are read in this browser and never uploaded. A .pub file is imported, not modified: save your work as a project and export PDF, PNG or SVG.' })
    ];
    var buttons = [];
    if (saved) {
      var when = new Date(saved.when);
      body.push(h('div', { class: 'note', text: 'Recovered from this browser: “' + saved.name + '”, last changed ' + when.toLocaleString() + '.' }));
      buttons.push({ label: 'Restore “' + (saved.name.length > 22 ? saved.name.slice(0, 22) + '…' : saved.name) + '”', fn: function () {
        try { A.loadDoc(OP.normaliseDoc(JSON.parse(saved.json))); A.zoomLabel(); S.dirty = true; }
        catch (e) { A.toast('The recovered copy could not be read.', true); }
      } });
    }
    buttons.push({ label: 'Blank A3 poster', fn: function () {
      var doc = OP.newDoc(297 * MM, 420 * MM);
      A.loadDoc(doc); A.zoomLabel();
    } });
    buttons.push({ label: 'Open .pub file…', cls: 'primary', fn: function () { $('fileOpen').click(); } });
    A.modal('OpenPub Poster Studio', body, buttons);
  }

  // ---------------------------------------------------------------- start-up
  A.init = function () {
    A.buildMenus();
    A.buildToolbar();
    A.initInput();
    A.loadDoc(OP.newDoc());
    A.resize();
    A.fit();
    A.zoomLabel();

    $('tabProps').addEventListener('click', function () { A.showTab('props'); });
    $('tabLayers').addEventListener('click', function () { A.showTab('layers'); });
    $('btnOpen').addEventListener('click', function () { $('fileOpen').click(); });
    if (OP.desktop) {
      // native dialogs and files handed over by Windows ("Open with", double-click, second launch)
      $('fileOpen').addEventListener('click', function (e) {
        e.preventDefault();
        OP.desktop.openDialog().then(function (f) { if (f && f.bytes) A.openFile(f); });
      });
      OP.desktop.onOpenFile(function (f) { if (f && f.bytes) { A.closeModal(true); A.openFile(f); } });
      document.body.classList.add('desktop');
    }
    $('btnExport').addEventListener('click', function () { A.dlgExport(); });
    $('fileOpen').addEventListener('change', function () {
      var f = this.files && this.files[0];
      this.value = '';
      if (f) A.openFile(f);
    });
    $('fileImage').addEventListener('change', function () {
      var files = Array.prototype.slice.call(this.files || []);
      this.value = '';
      if (files.length) A.insertImageFiles(files);
    });
    var dn = $('docname');
    dn.addEventListener('change', function () {
      var v = dn.value.trim() || 'Untitled';
      dn.value = v;
      if (v !== S.doc.name) { S.doc.name = v; A.commit(); A.setTitle(); }
    });
    dn.addEventListener('keydown', function (e) { if (e.key === 'Enter') dn.blur(); });
    $('modal').addEventListener('pointerdown', function (e) { if (e.target === $('modal')) A.closeModal(); });

    var stage = $('stage'), first = true;
    function onResize() {
      A.resize();
      if (first) { first = false; A.fit(); A.zoomLabel(); }
    }
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(stage);
    else window.addEventListener('resize', onResize);
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', A.themeChanged);
    }
    OP.onImageLoad(function () { A.invalidate(); A.refreshPagesSoon(); });
    if (document.fonts && document.fonts.addEventListener) {
      document.fonts.addEventListener('loadingdone', function () { OP.resetTextMetrics(); A.invalidate(); });
    }
    if (!OP.desktop) window.addEventListener('beforeunload', function (e) { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
    A.setTitle();

    if (OP.desktop) {
      OP.desktop.initialFile().then(function (f) {
        if (f && f.bytes) A.openFile(f); else readAutosave().then(welcome);
      }, function () { readAutosave().then(welcome); });
      A.loadLocalFonts(true); // every installed font is available without asking
    } else readAutosave().then(welcome);
    if (A.initPlugins) A.initPlugins();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', A.init);
  else A.init();
})();
