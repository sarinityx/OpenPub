/* OpenPub – print layouts: one page per sheet, several copies per sheet (n-up), booklets and
 * mail-merge runs, as vector PDF (desktop app) or picture PDF, or sent straight to a printer. */
var OP = (typeof globalThis.OP !== 'undefined') ? globalThis.OP : (globalThis.OP = {});

(function () {
  'use strict';
  var A = OP.app, S = A.S, $ = A.$, h = A.h, MM = OP.MM, ui = A.ui;
  var PAPER = { A5: [148, 210], A4: [210, 297], A3: [297, 420], A2: [420, 594], Letter: [215.9, 279.4], Tabloid: [279.4, 431.8] };

  function cropMarks(x0, y0, x1, y1, off, len) {
    var out = [];
    [[x0, y0, -1, -1], [x1, y0, 1, -1], [x0, y1, -1, 1], [x1, y1, 1, 1]].forEach(function (c) {
      out.push([c[0] + c[2] * off, c[1], c[0] + c[2] * (off + len), c[1]]);
      out.push([c[0], c[1] + c[3] * off, c[0], c[1] + c[3] * (off + len)]);
    });
    return out;
  }

  // ---------------------------------------------------------------- sheet builders
  /** One page per sheet, optionally with bleed and crop marks. recs: record indexes or [undefined]. */
  OP.sheetsPlain = function (doc, pages, recs, o) {
    var b = o.bleed ? doc.bleed : 0, gap = 2 * MM, len = 5 * MM, slug = o.marks ? b + gap + len + MM : b, out = [];
    recs.forEach(function (rec) {
      pages.forEach(function (pi) {
        out.push({ w: doc.w + 2 * slug, h: doc.h + 2 * slug, items: [{ page: pi, rec: rec, x: slug - b, y: slug - b, scale: 1, bleed: b }],
          lines: o.marks ? cropMarks(slug, slug, slug + doc.w, slug + doc.h, b + gap, len) : [] });
      });
    });
    return out;
  };
  /** How many copies of the page fit a sheet. Tries both paper orientations and keeps the better one. */
  OP.nupPlan = function (doc, o) {
    function plan(sw, sh) {
      var aw = sw - 2 * o.margin, ah = sh - 2 * o.margin;
      var cols = Math.floor((aw + o.gap) / (doc.w + o.gap)), rows = Math.floor((ah + o.gap) / (doc.h + o.gap));
      return { sw: sw, sh: sh, cols: Math.max(0, cols), rows: Math.max(0, rows), n: Math.max(0, cols) * Math.max(0, rows) };
    }
    var a = plan(o.sheetW, o.sheetH), b = plan(o.sheetH, o.sheetW);
    return b.n > a.n ? b : a;
  };
  /** Copies of one page tiled over sheets. With records, each position takes the next record. */
  OP.sheetsNup = function (doc, pageIndex, recs, o) {
    var p = OP.nupPlan(doc, o);
    if (!p.n) return [];
    var cells = [], i;
    if (recs.length === 1) for (i = 0; i < p.n * Math.max(1, o.sheets || 1); i++) cells.push(recs[0]);
    else cells = recs.slice();
    var gw = p.cols * doc.w + (p.cols - 1) * o.gap, gh = p.rows * doc.h + (p.rows - 1) * o.gap;
    var ox = (p.sw - gw) / 2, oy = (p.sh - gh) / 2, out = [], sheet = null;
    cells.forEach(function (rec, k) {
      var j = k % p.n;
      if (j === 0) { sheet = { w: p.sw, h: p.sh, items: [], lines: [] }; out.push(sheet); }
      var c = j % p.cols, r = Math.floor(j / p.cols), x = ox + c * (doc.w + o.gap), y = oy + r * (doc.h + o.gap);
      sheet.items.push({ page: pageIndex, rec: rec, x: x, y: y, scale: 1, bleed: 0 });
      if (o.marks) {
        var off = Math.min(1.5 * MM, Math.max(0.5, o.gap / 2 - 0.5)), len = Math.max(1.5 * MM, Math.min(4 * MM, o.margin - off - 1));
        if (o.gap >= 2 * MM || (c === 0 || c === p.cols - 1 || r === 0 || r === p.rows - 1)) {
          cropMarks(x, y, x + doc.w, y + doc.h, off, Math.min(len, o.gap > 0 ? Math.max(1, o.gap / 2 - off) : len)).forEach(function (l) { sheet.lines.push(l); });
        }
      }
    });
    return out;
  };
  /** Saddle-stitch booklet: two pages side by side, ordered so the folded stack reads in sequence. */
  OP.sheetsBooklet = function (doc, rec) {
    var n = doc.pages.length, total = Math.ceil(n / 4) * 4, out = [];
    function side(l, r) {
      var sh = { w: doc.w * 2, h: doc.h, items: [], lines: [] };
      if (l < n) sh.items.push({ page: l, rec: rec, x: 0, y: 0, scale: 1, bleed: 0 });
      if (r < n) sh.items.push({ page: r, rec: rec, x: doc.w, y: 0, scale: 1, bleed: 0 });
      out.push(sh);
    }
    for (var i = 0; i < total / 4; i++) { side(total - 1 - 2 * i, 2 * i); side(2 * i + 1, total - 2 - 2 * i); }
    return out;
  };

  // ---------------------------------------------------------------- output
  function lineSvg(lines) {
    return lines.map(function (l) { return '<line x1="' + OP.round(l[0]) + '" y1="' + OP.round(l[1]) + '" x2="' + OP.round(l[2]) + '" y2="' + OP.round(l[3]) + '" stroke="#000000" stroke-width="0.3"/>'; }).join('');
  }
  /** A complete HTML document with one vector page per sheet; pictures are stored once and re-used. */
  OP.sheetsHtml = function (doc, sheets) {
    var used = {}, n = 0, w = sheets[0].w, hh = sheets[0].h;
    function imageRef(asset) { if (!doc.assets[asset]) return null; if (!used[asset]) used[asset] = 'opimg' + (n++); return used[asset]; }
    var pages = sheets.map(function (sh, si) {
      var inner = sh.items.map(function (it, ii) {
        var page = doc.pages[it.page];
        return OP.pageToSvg(doc, page, { bleed: it.bleed > 0, embed: { x: it.x, y: it.y, scale: it.scale }, idPrefix: 's' + si + 'i' + ii + '_', imageRef: imageRef, env: OP.pageEnv(doc, page, it.rec) });
      }).join('');
      return '<div class="s"><svg xmlns="http://www.w3.org/2000/svg" width="' + OP.round(sh.w / MM, 3) + 'mm" height="' + OP.round(sh.h / MM, 3) + 'mm" viewBox="0 0 ' + OP.round(sh.w) + ' ' + OP.round(sh.h) + '">' + inner + lineSvg(sh.lines) + '</svg></div>';
    });
    var defs = Object.keys(used).map(function (k) { return '<image id="' + used[k] + '" width="1" height="1" preserveAspectRatio="none" href="' + doc.assets[k].src + '"/>'; }).join('');
    var wmm = OP.round(w / MM, 3), hmm = OP.round(hh / MM, 3);
    return { wMm: wmm, hMm: hmm, html: '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + OP.escXml(doc.name) + '</title><style>@page{size:' + wmm + 'mm ' + hmm + 'mm;margin:0}' +
      'html,body{margin:0;padding:0;background:#fff}.s{width:' + wmm + 'mm;height:' + hmm + 'mm;overflow:hidden;page-break-after:always;break-after:page}.s:last-child{page-break-after:auto;break-after:auto}svg{display:block}</style></head><body>' +
      (defs ? '<svg width="0" height="0" style="position:absolute"><defs>' + defs + '</defs></svg>' : '') + pages.join('') + '</body></html>' };
  };
  /** Picture PDF of sheets (used in the browser, and for n-up / booklet when vector output is not wanted). */
  OP.sheetsRasterPdf = async function (doc, sheets, dpi, onProgress) {
    await OP.ensureImages(doc);
    var pdf = new OP.PdfWriter();
    for (var i = 0; i < sheets.length; i++) {
      var sh = sheets[i], k = Math.min(dpi, OP.maxDpiFor(Math.max(sh.w, sh.h)), Math.sqrt(100e6 / (sh.w * sh.h)) * 72) / 72;
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(sh.w * k)); c.height = Math.max(1, Math.round(sh.h * k));
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
      sh.items.forEach(function (it) {
        var page = doc.pages[it.page], b = it.bleed || 0, s = k * it.scale;
        ctx.save();
        ctx.setTransform(s, 0, 0, s, (it.x + b * it.scale) * k, (it.y + b * it.scale) * k);
        ctx.beginPath(); ctx.rect(-b, -b, doc.w + 2 * b, doc.h + 2 * b); ctx.clip();
        OP.renderPage(ctx, doc, page, { bleed: b, pxPerPt: s, env: OP.pageEnv(doc, page, it.rec) });
        ctx.restore();
      });
      var blob = await new Promise(function (res, rej) { c.toBlob(function (bl) { if (bl) res(bl); else rej(new Error('The sheet is too large to render at this resolution.')); }, 'image/jpeg', 0.92); });
      var bytes = new Uint8Array(await blob.arrayBuffer());
      pdf.addPage({ mw: sh.w, mh: sh.h, images: [{ bytes: bytes, pw: c.width, ph: c.height, x: 0, y: 0, w: sh.w, h: sh.h }], lines: sh.lines });
      c.width = c.height = 1;
      if (onProgress) onProgress((i + 1) / sheets.length);
      await new Promise(function (r) { setTimeout(r, 0); });
    }
    return pdf.finish(doc.name);
  };
  /** Vector PDF bytes through the desktop app's print engine. */
  OP.sheetsVectorPdf = async function (doc, sheets) {
    if (!OP.desktop || !OP.desktop.vectorPdf) throw new Error('Vector PDF needs the desktop app.');
    var built = OP.sheetsHtml(doc, sheets);
    var res = await OP.desktop.vectorPdf(built);
    if (!res || res.error) throw new Error((res && res.error) || 'The PDF could not be made.');
    return new Blob([res.bytes], { type: 'application/pdf' });
  };

  // ---------------------------------------------------------------- dialog
  function rowL(label, kids, forId) { return h('div', { class: 'row' }, [h('label', { text: label, for: forId || null })].concat(kids)); }
  function sel(id, value, options) { var s = h('select', { id: id }, options.map(function (o) { return h('option', { value: o[0], text: o[1] }); })); s.value = value; s.style.flex = '1'; return s; }
  function field(id, value, unit, min, max, step) { var inp = h('input', { type: 'number', id: id, min: min, max: max, step: step || 1 }); inp.value = value; return h('div', { class: 'f' }, [inp, unit ? h('span', { text: unit }) : null]); }
  function check(id, label, on) { var inp = h('input', { type: 'checkbox', id: id }); inp.checked = !!on; return h('label', { for: id, style: 'display:flex;align-items:center;gap:7px;flex:1' }, [inp, label]); }
  function num(id, fb) { var v = parseFloat($(id).value); return isFinite(v) ? v : fb; }

  /** mode: 'print' (general) or 'merge' (start with all records selected). */
  A.dlgSheets = function (mode) {
    if (A.isEditing()) A.endEdit();
    var d = S.doc, mg = d.merge, desk = !!(OP.desktop && OP.desktop.vectorPdf), many = d.pages.length > 1;
    if (mode === 'merge' && !mg) { A.dlgMerge(); return; }
    var info = h('p', { class: 'hint' }), bar = h('i'), prog = h('div', { class: 'progress', hidden: true }, [bar]);
    var body = [
      rowL('Layout', [sel('shLay', 'one', [['one', 'One page per sheet'], ['nup', 'Several copies per sheet (cards, labels, flyers)'], ['book', 'Booklet (two pages per sheet, folded)']])], 'shLay'),
      many ? rowL('Pages', [sel('shPages', 'all', [['all', 'All ' + d.pages.length + ' pages'], ['cur', 'Current page (' + (S.pi + 1) + ')']])], 'shPages') : null,
      mg ? rowL('Mail merge', [sel('shRec', mode === 'merge' ? 'all' : 'none', [['none', 'No merge (fields as typed)'], ['cur', 'Record ' + (mg.at + 1) + ' only'], ['all', 'All ' + mg.rows.length + ' records']])], 'shRec') : null,
      h('div', { id: 'shNup', hidden: true, style: 'display:flex;flex-direction:column;gap:7px' }, [
        rowL('Paper', [sel('shPaper', 'A4', Object.keys(PAPER).map(function (k) { return [k, k + '  ' + PAPER[k][0] + ' × ' + PAPER[k][1] + ' mm']; }))], 'shPaper'),
        rowL('Sheet margin', [field('shMargin', 10, 'mm', 0, 50)], 'shMargin'),
        rowL('Gap between', [field('shGap', 0, 'mm', 0, 50)], 'shGap'),
        rowL('Sheets', [field('shCount', 1, '', 1, 500)], 'shCount')
      ]),
      h('div', { class: 'row' }, [h('label', { text: 'Print marks' }), check('shBleed', 'Include bleed', d.bleed > 0), check('shMarks', 'Crop marks', false)]),
      rowL('Output', [sel('shOut', desk ? 'vector' : 'raster', (desk ? [['vector', 'Vector PDF (sharp, selectable text, fonts embedded)'], ['vcmyk', 'Vector PDF, CMYK (needs Ghostscript)']] : []).concat([['raster', 'Picture PDF, RGB'], ['cmyk', 'Picture PDF, CMYK']]))], 'shOut'),
      h('div', { id: 'shGs', hidden: true, style: 'display:flex;flex-direction:column;gap:7px' }, [
        h('div', { class: 'note', id: 'shGsInfo', text: 'Looking for Ghostscript…' }),
        h('div', { class: 'row wrap' }, [
          ui.btn('Locate Ghostscript…', function () { OP.desktop.gsPick().then(function (st) { gs = st; update(); }); }),
          ui.btn('Choose output profile…', function () { OP.desktop.iccPick().then(function (st) { if (st) { gs = st; update(); } }); }),
          ui.btn('Use Ghostscript\'s default CMYK', function () { OP.desktop.iccClear().then(function (st) { gs = st; update(); }); })])
      ]),
      rowL('Resolution', [sel('shDpi', '300', [['150', '150 dpi'], ['200', '200 dpi'], ['300', '300 dpi'], ['600', '600 dpi']])], 'shDpi'),
      info, prog
    ];
    var buttons = [{ label: 'Cancel' }];
    if (OP.desktop && OP.desktop.print) buttons.push({ label: 'Print…', id: 'shPrint', fn: function () { run(true); return false; } });
    buttons.push({ label: 'Save PDF…', cls: 'primary', id: 'shGo', fn: function () { run(false); return false; } });
    var dlg = A.modal(mode === 'merge' ? 'Export mail merge' : 'Print layouts and PDF', body, buttons, { wide: true });
    var gs = null;
    if (desk && OP.desktop.gsStatus) OP.desktop.gsStatus().then(function (st) { gs = st; if ($('shOut')) update(); }, function () { gs = { found: false }; });

    function recs() {
      var v = mg && $('shRec') ? $('shRec').value : 'none';
      if (v === 'all') return mg.rows.map(function (_, i) { return i; });
      if (v === 'cur') return [mg.at];
      return [-1];
    }
    function pagesSel() { return (many && $('shPages').value === 'all') ? d.pages.map(function (_, i) { return i; }) : [S.pi]; }
    function nupOpts() {
      var p = PAPER[$('shPaper').value] || PAPER.A4;
      return { sheetW: p[0] * MM, sheetH: p[1] * MM, margin: OP.clamp(num('shMargin', 10), 0, 50) * MM, gap: OP.clamp(num('shGap', 0), 0, 50) * MM, marks: $('shMarks').checked, sheets: OP.clamp(Math.round(num('shCount', 1)), 1, 500) };
    }
    function build() {
      var lay = $('shLay').value, rs = recs();
      if (lay === 'nup') return OP.sheetsNup(d, S.pi, rs, nupOpts());
      if (lay === 'book') { var out = []; rs.forEach(function (r) { out = out.concat(OP.sheetsBooklet(d, r)); }); return out; }
      return OP.sheetsPlain(d, pagesSel(), rs, { bleed: $('shBleed').checked, marks: $('shMarks').checked });
    }
    function update() {
      var lay = $('shLay').value, out = $('shOut').value, rs = recs(), msg = '';
      $('shNup').hidden = lay !== 'nup';
      if ($('shPages')) $('shPages').disabled = lay !== 'one';
      $('shBleed').disabled = lay !== 'one' || !(d.bleed > 0);
      $('shMarks').disabled = lay === 'book';
      $('shDpi').disabled = out === 'vector' || out === 'vcmyk';
      $('shGs').hidden = out !== 'vcmyk';
      if (out === 'vcmyk') {
        $('shGsInfo').textContent = !gs ? 'Looking for Ghostscript…' : gs.found
          ? 'Ghostscript ' + (gs.version || '') + ' found. Output profile: ' + (gs.iccName || 'Ghostscript default CMYK') + '. Ask your printer which profile they want (for example a FOGRA or GRACoL profile) and choose its .icc file.'
          : 'Ghostscript is not installed on this computer, or was not found. Install it from ghostscript.com (it is free under the AGPL and is not bundled with OpenPub), then choose Locate Ghostscript.';
      }
      if ($('shCount')) $('shCount').disabled = rs.length > 1;
      var ok = true;
      if (lay === 'nup') {
        var p = OP.nupPlan(d, nupOpts());
        if (!p.n) { msg = 'The page (' + OP.round(d.w / MM, 0) + ' × ' + OP.round(d.h / MM, 0) + ' mm) does not fit on that paper with these margins. Choose larger paper or a smaller page size.'; ok = false; }
        else msg = p.n + ' per sheet (' + p.cols + ' across × ' + p.rows + ' down, paper ' + (p.sw > p.sh ? 'landscape' : 'portrait') + ') of page ' + (S.pi + 1) + '.' + (rs.length > 1 ? ' One position per record: ' + Math.ceil(rs.length / p.n) + ' sheets.' : '');
      } else if (lay === 'book') {
        var total = Math.ceil(d.pages.length / 4) * 4;
        msg = 'Sheet size ' + OP.round(d.w * 2 / MM, 0) + ' × ' + OP.round(d.h / MM, 0) + ' mm, ' + total / 2 + ' sides. Print double-sided, flipping on the short edge, then fold and staple.' + (total !== d.pages.length ? ' ' + (total - d.pages.length) + ' blank page(s) are added to make a multiple of four.' : '') + ' Scale to your paper in the printer dialog if needed.';
      } else {
        var cnt = pagesSel().length * rs.length;
        msg = cnt + (cnt === 1 ? ' sheet.' : ' sheets.');
      }
      if (out === 'cmyk') msg += ' CMYK is a plain conversion without a colour profile: pure black text prints on the black plate only, but colours are not proofed. Ask your printer whether they prefer RGB.' + (lay !== 'one' ? ' CMYK output is only available with “One page per sheet”.' : '');
      if (out === 'vcmyk') msg += ' Everything stays vector and is converted to CMYK. Pure black text and lines stay on the black plate only; every other colour is converted with the output profile. Ask your printer for a proof before a large run.';
      if (out === 'vector') msg += ' Pictures keep their original pixels; shadows and picture adjustments are flattened to images by the PDF engine.';
      info.textContent = msg;
      $('shGo').disabled = !ok || (out === 'cmyk' && lay !== 'one') || (out === 'vcmyk' && !(gs && gs.found));
      if ($('shPrint')) $('shPrint').disabled = !ok;
    }
    ['shLay', 'shPages', 'shRec', 'shPaper', 'shMargin', 'shGap', 'shCount', 'shBleed', 'shMarks', 'shOut', 'shDpi'].forEach(function (id) {
      if ($(id)) { $(id).addEventListener('change', update); $(id).addEventListener('input', update); }
    });
    update();

    async function run(toPrinter) {
      var out = $('shOut').value, dpi = +$('shDpi').value, lay = $('shLay').value, sheets = build();
      if (!sheets.length) return;
      if (sheets.length > 2000) { A.toast('That would be ' + sheets.length + ' sheets. Export fewer records at a time.', true); return; }
      function setP(f) { bar.style.width = Math.round(OP.clamp(f, 0, 1) * 100) + '%'; }
      dlg.busy(true); prog.hidden = false; setP(0.03);
      try {
        await OP.ensureImages(d);
        var base = OP.safeName(d.name) + (lay === 'nup' ? '-sheet' : lay === 'book' ? '-booklet' : '') + (recs().length > 1 ? '-merged' : '');
        if (toPrinter) {
          var res = await OP.desktop.print(OP.sheetsHtml(d, sheets));
          if (res && res.error) throw new Error(res.error);
          A.closeModal(true);
          A.toast(res && res.cancelled ? 'Printing cancelled.' : 'Sent to the printer.');
          return;
        }
        var blob;
        if (out === 'vector') { setP(0.3); blob = await OP.sheetsVectorPdf(d, sheets); }
        else if (out === 'vcmyk') {
          setP(0.3);
          var cres = await OP.desktop.cmykPdf(OP.sheetsHtml(d, sheets));
          if (!cres || cres.error) throw new Error((cres && cres.error) || 'The CMYK PDF could not be made.');
          blob = new Blob([cres.bytes], { type: 'application/pdf' });
          base += '-cmyk';
        }
        else if (lay === 'one') {
          var rs = recs();
          blob = (await OP.exportPdf(d, { pages: pagesSel(), dpi: dpi, bleed: $('shBleed').checked, marks: $('shMarks').checked, cmyk: out === 'cmyk', records: rs, onProgress: setP })).blob;
        } else blob = await OP.sheetsRasterPdf(d, sheets, dpi, setP);
        await OP.saveFile(base + '.pdf', blob, 'application/pdf');
        A.closeModal(true);
        A.toast('PDF saved: ' + sheets.length + (sheets.length === 1 ? ' sheet.' : ' sheets.'));
      } catch (e) {
        dlg.busy(false); prog.hidden = true;
        if (e && e.cancelled) A.toast('Save cancelled.'); else A.toast((e && e.message) || 'The PDF could not be made.', true);
      }
    }
  };
  /** Print straight away with the system print dialog: every page, one per sheet. */
  A.printNow = async function () {
    if (!OP.desktop || !OP.desktop.print) { A.dlgSheets('print'); return; }
    if (A.isEditing()) A.endEdit();
    var d = S.doc;
    try {
      await OP.ensureImages(d);
      A.status('Opening the print dialog…');
      var res = await OP.desktop.print(OP.sheetsHtml(d, OP.sheetsPlain(d, d.pages.map(function (_, i) { return i; }), [undefined], { bleed: false, marks: false })));
      A.status('');
      if (res && res.error) A.toast(res.error, true);
      else A.toast(res && res.cancelled ? 'Printing cancelled.' : 'Sent to the printer.');
    } catch (e) { A.status(''); A.toast((e && e.message) || 'Printing failed.', true); }
  };
})();
