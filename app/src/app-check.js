/* OpenPub – design checker (Review › Check design). OP.checkDesign looks through a document for
 * things that print badly: text that does not fit, low-resolution pictures, objects off the page,
 * missing fonts, empty text boxes and mail-merge fields with no data. The side panel's Check tab
 * lists the results by page; clicking one goes to the object. Before export and print the check
 * is offered when the document has changed since it last ran. It never blocks output. */
var OP = (typeof globalThis.OP !== 'undefined') ? globalThis.OP : (globalThis.OP = {});

(function () {
  'use strict';
  var FIELD = /\{\{\s*([^{}]+?)\s*\}\}/g;
  var RASTER = /^data:image\/(png|jpe?g|gif|webp|bmp)/i;

  /** Every text run of an item, table cells included. */
  function runsOf(it) {
    var out = [];
    function add(t) { if (t && t.paras) t.paras.forEach(function (p) { p.runs.forEach(function (r) { out.push(r); }); }); }
    if (it.type === 'shape' && it.text && !it.wa) add(it.text);
    if (it.type === 'table' && it.cells) it.cells.forEach(function (row) { row.forEach(function (c) { if (c) add(c.text); }); });
    return out;
  }
  function fontsOf(it) {
    var f = {};
    runsOf(it).forEach(function (r) { if (r.font) f[r.font] = true; });
    if (it.wa && it.wa.font) f[it.wa.font] = true;
    return Object.keys(f);
  }

  /** Is this data URL a CMYK JPEG? (Reads the frame header: 4 components means CMYK.) */
  OP.isCmykJpeg = function (src) {
    if (!/^data:image\/jpe?g;base64,/i.test(src || '')) return false;
    var start = src.indexOf(',') + 1, b64 = src.slice(start, start + 87380);
    var bin;
    try { bin = atob(b64.slice(0, b64.length - (b64.length % 4))); } catch (e) { return false; }
    for (var i = 2; i + 9 < bin.length;) {
      if (bin.charCodeAt(i) !== 0xff) { i++; continue; }
      var m = bin.charCodeAt(i + 1);
      if (m === 0xff) { i++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return bin.charCodeAt(i + 9) === 4;
      i += 2 + ((bin.charCodeAt(i + 2) << 8) | bin.charCodeAt(i + 3));
    }
    return false;
  };

  /**
   * Find problems in a document.
   * @param {Object} doc
   * @param {{minPpi?:number, cmyk?:boolean, fonts?:string[]|null}} opts minPpi: lowest picture resolution
   *   (default 150); cmyk: list RGB pictures as information; fonts: installed font names, or null to skip
   * @returns {Array<{page:number, master:?string, where:string, id:string, label:string, kind:string, level:string, text:string}>}
   *   page is the page index, or -1 with master set for an item on a master page
   */
  OP.checkDesign = function (doc, opts) {
    opts = opts || {};
    var minPpi = opts.minPpi || 150, bl = doc.bleed || 0, out = [], fontSet = null, cols = {};
    if (opts.fonts && opts.fonts.length) { fontSet = {}; opts.fonts.forEach(function (f) { fontSet[String(f).toLowerCase()] = true; }); }
    if (doc.merge && doc.merge.fields) doc.merge.fields.forEach(function (f) { cols[f] = true; });
    OP.reindex(doc);
    function scan(pg, where) {
      var env = OP.pageEnv(doc, pg);
      function add(it, kind, text, level) {
        out.push({ page: where.page, master: where.master || null, where: where.name, id: it.id, label: OP.itemLabel(it), kind: kind, level: level || 'problem', text: text });
      }
      pg.items.forEach(function (it) {
        if (it.hidden) return;
        // text that does not fit (a linked story reports on its last box only)
        if (it.type === 'shape' && it.text && !it.wa) {
          var story = OP.storyOf(doc, it), tc = OP.textCols(doc, it, env);
          if (tc && tc.overflow) add(it, 'overflow', story ? 'Text does not fit: this is the last box of its linked chain and it is full.' : 'Text does not fit its box.');
          if (!story && !it.fill && !it.stroke && !OP.plainText(it.text).trim()) add(it, 'empty', 'Empty text box.');
        }
        // pictures: resolution, and colour for CMYK output
        if (it.type === 'image') {
          var a = doc.assets && doc.assets[it.asset];
          if (a && RASTER.test(a.src || '') && a.w && a.h && it.w > 0 && it.h > 0) {
            var c = it.crop || { l: 0, r: 0, t: 0, b: 0 };
            var ppi = Math.round(Math.min(a.w * (1 - c.l - c.r) / (it.w / 72), a.h * (1 - c.t - c.b) / (it.h / 72)));
            if (ppi < minPpi) add(it, 'lowres', 'Picture resolution ' + ppi + ' ppi, below ' + minPpi + ' ppi. It may look soft in print.');
            if (opts.cmyk && !OP.isCmykJpeg(a.src)) add(it, 'rgb', 'RGB picture: it is converted to CMYK on output, so its colours may shift.', 'info');
          }
        }
        // position on the page (with bleed, the bleed area counts as on the page)
        var b = OP.boundsOf([it]), x0 = -bl, y0 = -bl, x1 = doc.w + bl, y1 = doc.h + bl, tol = 0.5;
        if (b.x >= x1 || b.y >= y1 || b.x + b.w <= x0 || b.y + b.h <= y0) add(it, 'offpage', 'Wholly off the page, so it will not print.');
        else if (b.x < x0 - tol || b.y < y0 - tol || b.x + b.w > x1 + tol || b.y + b.h > y1 + tol) {
          add(it, 'offpage', bl ? 'Partly outside the bleed area: that part will be cut off.' : 'Partly off the page: that part will not print.');
        }
        // fonts that are not installed
        if (fontSet) {
          var miss = fontsOf(it).filter(function (f) { return !fontSet[f.toLowerCase()]; });
          if (miss.length) add(it, 'font', 'Font not installed on this computer: ' + miss.join(', ') + '. Another font is drawn instead.');
        }
        // mail-merge fields with no data
        var bad = {};
        runsOf(it).forEach(function (r) {
          String(r.t || '').replace(FIELD, function (all, name) { var k = name.toLowerCase(); if (k !== 'page' && k !== 'pages' && !cols[name]) bad[name] = true; return all; });
        });
        var names = Object.keys(bad);
        if (names.length) {
          add(it, 'field', (doc.merge ? 'Mail-merge field with no matching column in the recipient list: ' : 'Mail-merge field, but no recipient list is loaded: ') +
            names.map(function (n) { return '{{' + n + '}}'; }).join(', ') + '.');
        }
      });
    }
    doc.pages.forEach(function (pg, i) { scan(pg, { page: i, name: 'Page ' + (i + 1) }); });
    (doc.masters || []).forEach(function (m) { scan(m, { page: -1, master: m.id, name: m.name || 'Master page' }); });
    return out;
  };

  // ---------------------------------------------------------------- the Check tab
  var A = OP.app;
  if (!A) return;
  var S = A.S, $ = A.$, h = A.h, ui = A.ui;
  var prefs = { minPpi: 150, cmyk: false };
  S.check = null;
  var tabCheck = $('tabCheck');
  if (tabCheck) tabCheck.addEventListener('click', function () { A.showTab('check'); });

  /** Has the check run on the document as it is now? */
  A.designChecked = function () { return !!(S.check && S.check.doc === S.doc && S.check.at === S.last); };
  /** Run the check and show the results. o.cmyk: list RGB pictures (output will be CMYK). */
  A.checkDesign = function (o) {
    if (A.isEditing()) A.endEdit();
    if (o && 'cmyk' in o) prefs.cmyk = !!o.cmyk;
    // fonts are checked whenever the installed list is known: always on desktop once read, in the browser after Tools › Add installed fonts
    var fonts = A.installedFonts ? A.installedFonts() : [];
    var opts = { minPpi: prefs.minPpi, cmyk: prefs.cmyk, fonts: fonts.length ? fonts : null };
    S.check = { doc: S.doc, at: S.last, opts: opts, results: [], error: null };
    try { S.check.results = OP.checkDesign(S.doc, opts); }
    catch (e) { S.check.error = (e && e.message) || String(e); if (window.console) console.warn('Check design failed:', e); }
    A.showTab('check');
    return S.check.results;
  };
  /** Go to a result's page (or master page) and select its object. */
  A.showCheckResult = function (r) {
    if (r.master) { if (S.master !== r.master) A.editMaster(r.master); }
    else { if (S.master) A.editMaster(null); if (S.pi !== r.page) A.gotoPage(r.page); }
    if (A.find(r.id)) A.setSel([r.id]);
  };

  A.buildCheck = function () {
    var root = $('check');
    if (!root) return;
    var keep = root.scrollTop;
    // the tab is rebuilt after every selection and every rerun: put keyboard focus back where it was
    var act = document.activeElement, focusId = act && act !== root && root.contains(act) ? act.id : null;
    root.innerHTML = '';
    var cur = S.check && S.check.doc === S.doc ? S.check : null;
    var cmyk = h('input', { type: 'checkbox', id: 'ckCmyk' });
    cmyk.checked = prefs.cmyk;
    cmyk.addEventListener('change', function () { prefs.cmyk = cmyk.checked; if (cur) A.checkDesign(); });
    var canFonts = !!(A.installedFonts && A.installedFonts().length);
    root.appendChild(ui.sec('Check design', [
      h('p', { class: 'hint', text: 'Finds text that does not fit, low-resolution pictures, objects off the page, ' + (canFonts ? 'missing fonts, ' : '') +
        'empty text boxes and mail-merge fields with no data.' + (canFonts || OP.desktop ? '' : ' To check fonts too, choose Tools › Add installed fonts to the font list first.') }),
      h('div', { class: 'row wrap' }, [ui.btn(cur ? 'Check again' : 'Check design', function () { A.checkDesign(); }, 'primary', 'ckRun')]),
      ui.row('Pictures at least', [ui.num('ckPpi', prefs.minPpi, { unit: 'ppi', min: 50, max: 1200, step: 25, dec: 0, aria: 'Lowest picture resolution' }, function (v, f) {
        prefs.minPpi = v; if (f && cur) A.checkDesign();
      })], 'ckPpi'),
      h('label', { class: 'chk', for: 'ckCmyk' }, [cmyk, 'Going to a print shop in CMYK (list RGB pictures)'])
    ]));
    function done() {
      root.scrollTop = keep;
      var f = focusId && $(focusId);
      if (f) f.focus({ preventScroll: true });
    }
    if (!cur) { root.scrollTop = 0; done(); return; }
    var sum = [];
    if (cur.at !== S.last) sum.push(h('div', { class: 'note', text: 'The document has changed since this check. Check again to update the list.' }));
    if (cur.error) {
      sum.push(h('p', { class: 'cksum ckerr', id: 'ckSum', role: 'alert', text: 'The check could not finish: ' + cur.error }));
      sum.push(h('p', { class: 'hint', text: 'Nothing in the document was changed. Try Check again; if it fails again, save the project and report the message above.' }));
      root.appendChild(h('div', { class: 'sec' }, sum));
      done(); return;
    }
    var rs = cur.results, probs = rs.filter(function (r) { return r.level !== 'info'; }).length, infos = rs.length - probs;
    sum.push(h('p', { class: 'cksum', id: 'ckSum', text: !rs.length ? 'No problems found.' :
      (probs ? probs + (probs === 1 ? ' problem' : ' problems') : 'No problems') + (infos ? ', ' + infos + (infos === 1 ? ' note' : ' notes') : '') + '. Choose one to go to it.' }));
    if (!cur.opts.fonts) {
      sum.push(h('p', { class: 'hint', id: 'ckFonts', text: OP.desktop ? 'Fonts were not checked: the list of installed fonts had not loaded yet. Check again in a moment.' :
        'Fonts were not checked: the browser has not listed the installed fonts. Choose Tools › Add installed fonts to the font list, then check again.' }));
    }
    root.appendChild(h('div', { class: 'sec' }, sum));
    var groups = [], byWhere = {};
    rs.forEach(function (r) { if (!byWhere[r.where]) { byWhere[r.where] = []; groups.push(r.where); } byWhere[r.where].push(r); });
    var n = 0;
    groups.forEach(function (g) {
      root.appendChild(ui.sec(g, byWhere[g].map(function (r) {
        var on = S.sel.length === 1 && S.sel[0] === r.id && (r.master ? S.master === r.master : (!S.master && S.pi === r.page));
        var info = r.level === 'info';
        return h('button', { type: 'button', id: 'ckr' + (n++), class: 'ckres' + (info ? ' info' : '') + (on ? ' on' : ''), 'aria-current': on ? 'true' : null,
          'data-id': r.id, 'data-kind': r.kind, onclick: function () { A.showCheckResult(r); } }, [
          h('span', { class: 'ckwhat' }, [h('span', { class: 'cklevel', text: info ? 'Note' : 'Problem' }), r.label]),
          h('span', { class: 'ckmsg', text: r.text })]);
      })));
    });
    done();
  };

  // ---------------------------------------------------------------- offered before output
  function offer(isCmyk) {
    if (A.designChecked() || !A.modalOpen()) return;
    var body = document.querySelector('#modal .dlg .body');
    if (!body || $('ckOffer')) return;
    body.insertBefore(h('div', { class: 'note ckoffer', id: 'ckOffer' }, [
      h('span', { text: (S.check && S.check.doc === S.doc ? 'The design has changed since it was last checked.' : 'This design has not been checked yet.') + ' The check finds text that does not fit, low-resolution pictures, objects off the page and more. ' }),
      ui.btn('Check design', function () { var c = isCmyk(); A.closeModal(true); A.checkDesign({ cmyk: c }); }, '', 'ckOfferBtn')
    ]), body.firstChild);
  }
  function outputIsCmyk() { var o = $('shOut'); return !!(o && /cmyk/.test(o.value)); }
  ['dlgExport', 'dlgSheets', 'dlgTile'].forEach(function (name) {
    var base = A[name];
    if (!base) return;
    A[name] = function (mode) {
      var r = base.apply(this, arguments);
      if (!(name === 'dlgSheets' && mode === 'merge' && !S.doc.merge)) offer(outputIsCmyk);
      return r;
    };
  });
  var basePrint = A.printNow;
  if (basePrint) A.printNow = function () {
    if (OP.desktop && OP.desktop.print && !A.designChecked()) A.toast('Tip: Review › Check design finds text that does not fit, low-resolution pictures and more before you print.');
    return basePrint.apply(this, arguments);
  };
})();
