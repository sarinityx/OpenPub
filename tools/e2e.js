// End-to-end test of the built single-file app in headless Chrome.
const fs = require('fs'), path = require('path');
const lib = require('./lib');
const APP = lib.fileUrl(lib.WEB_APP);
const PUBS = lib.PUBS;
const OUT = lib.outDir('web');
let failures = 0;
function round2(n) { return Math.round(n * 100) / 100; }
function ok(cond, msg) { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++; }

(async () => {
  const browser = await lib.launchChrome();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto(APP);
  await page.waitForSelector('#modal.open');
  ok(await page.locator('.dlg header').innerText() === 'OpenPub Poster Studio', 'welcome dialog shown');
  await page.screenshot({ path: path.join(OUT, '01-welcome.png') });

  // ---- open a .pub through the file chooser
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.dlg .btn.primary')]);
  await fc.setFiles(path.join(PUBS, 'SampleNewsletter.pub'));
  await page.waitForFunction(() => document.querySelector('.dlg header') && /Imported/.test(document.querySelector('.dlg header').textContent), null, { timeout: 20000 });
  const report = await page.locator('.dlg .body').innerText();
  ok(/4 pages/.test(report), 'import report: ' + report.split('\n')[0]);
  await page.screenshot({ path: path.join(OUT, '02-import-report.png') });
  await page.click('.dlg .btn.primary');
  await page.waitForTimeout(700);
  ok(await page.evaluate(() => OP.app.S.doc.pages.length) === 4, '4 pages loaded');
  ok(await page.locator('#pagelist .thumb').count() === 4, '4 thumbnails');
  await page.screenshot({ path: path.join(OUT, '03-newsletter.png') });

  // ---- select an item by clicking, move it, undo
  const info = await page.evaluate(() => {
    const A = OP.app, it = A.page().items.find(i => i.text && OP.plainText(i.text).indexOf('Living and Learning') >= 0);
    const c = A.toScreen(it.x + it.w / 2, it.y + it.h / 2), r = document.getElementById('ov').getBoundingClientRect();
    return { id: it.id, x: r.left + c.x, y: r.top + c.y, ix: it.x };
  });
  await page.mouse.click(info.x, info.y);
  ok((await page.evaluate(() => OP.app.S.sel.length)) >= 1, 'click selects an object');
  ok(await page.evaluate(id => OP.app.S.sel.indexOf(id) >= 0, info.id), 'the headline is the selected object');
  await page.mouse.move(info.x, info.y); await page.mouse.down(); await page.mouse.move(info.x + 40, info.y + 25, { steps: 5 }); await page.mouse.up();
  const moved = await page.evaluate(id => OP.app.find(id).x, info.id);
  ok(Math.abs(moved - info.ix) > 5, 'drag moves the object (' + info.ix.toFixed(1) + ' -> ' + moved.toFixed(1) + ')');
  await page.keyboard.press('Control+z');
  ok(Math.abs(await page.evaluate(id => OP.app.find(id).x, info.id) - info.ix) < 0.01, 'undo restores position');

  // ---- edit text in place
  await page.mouse.dblclick(info.x, info.y);
  await page.waitForSelector('#ted');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Edited Headline');
  await page.screenshot({ path: path.join(OUT, '04-editing.png') });
  await page.keyboard.press('Escape');
  ok(await page.evaluate(id => OP.plainText(OP.app.find(id).text), info.id) === 'Edited Headline', 'text edit is written back to the model');
  const fontKept = await page.evaluate(id => OP.app.find(id).text.paras[0].runs[0], info.id);
  ok(fontKept.size > 20, 'edited text kept its size (' + fontKept.size + ' pt, ' + fontKept.font + ')');

  // ---- properties panel present for the selection
  await page.mouse.click(info.x, info.y);
  ok(await page.locator('#props .sec').count() >= 3, 'properties panel shows sections');
  await page.screenshot({ path: path.join(OUT, '05-selected.png') });

  // ---- paragraph spacing and indents: imported values show in the panel
  const OP_MM = 72 / 25.4; // points per millimetre, as OP.MM in the app
  const hang =await page.evaluate(() => {
    const A = OP.app, it = A.page().items.find(i => i.text && i.text.paras.some(p => /Jay Adams/.test(p.runs.map(r => r.t).join(''))));
    A.setSel([it.id]); A.beginEdit(it);
    const div = Array.from(document.getElementById('ted').children).find(d => /Jay Adams/.test(d.textContent));
    const r = document.createRange(); r.setStart(div, 0); r.collapse(true);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    A.refreshTextControls(true);
    const p = it.text.paras.find(p => /Jay Adams/.test(p.runs.map(r => r.t).join('')));
    return { first: +document.getElementById('tIndF').value, left: +document.getElementById('tIndL').value, model: [p.indent, p.left] };
  });
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  ok(Math.abs(hang.first - hang.model[0] / OP_MM) < 0.06 && Math.abs(hang.left - hang.model[1] / OP_MM) < 0.06 && hang.first < 0,
    'imported hanging indent shows in the panel: first line ' + hang.first + ' mm, left ' + hang.left + ' mm');

  // ---- paragraph spacing and indents: set from the panel, check canvas layout, SVG, undo and reload
  const pid = await page.evaluate(() => {
    const A = OP.app, st = { size: 12, font: 'Arial' };
    const it = OP.newTextBox(60, 600, 170, 160, [OP.newPara([OP.newRun('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore', st)]), OP.newPara([OP.newRun('Second paragraph', st)])]);
    A.page().items.push(it); A.commit(); A.setSel([it.id]);
    return it.id;
  });
  for (const [id, v] of [['#tBefore', '12'], ['#tIndL', '10'], ['#tIndR', '5'], ['#tIndF', '-5']]) { await page.fill(id, v); await page.press(id, 'Tab'); }
  await page.selectOption('#tLsMode', 'exact');
  await page.fill('#tLsPt', '18'); await page.press('#tLsPt', 'Tab');
  const ps = await page.evaluate((id) => {
    const it = OP.app.find(id), lay = OP.layoutItemText(it), p0 = lay.lines.filter(l => l.pi === 0);
    const svg = OP.pageToSvg(OP.app.S.doc, OP.app.page()), m = /<text x="([-\d.]+)"[^>]*>Lorem/.exec(svg);
    return { paras: it.text.paras.map(p => [p.before, p.left, p.right, p.indent, p.lsPt]), x0: p0[0].x, x1: p0[1] && p0[1].x, y0: p0[0].y, h0: p0[0].h,
      maxW: Math.max.apply(null, p0.map(l => l.width)), iw: lay.innerW, ox: lay.ox, svgX: m ? +m[1] : null };
  }, pid);
  const MMv = OP_MM;
  ok(ps.paras.every(p => p[0] === 12 && Math.abs(p[1] - 10 * MMv) < 0.01 && Math.abs(p[2] - 5 * MMv) < 0.01 && Math.abs(p[3] + 5 * MMv) < 0.01 && p[4] === 18),
    'panel sets space before, left and right indents, first line and exact line spacing on every paragraph');
  ok(Math.abs(ps.x0 - 5 * MMv) < 0.05 && Math.abs(ps.x1 - 10 * MMv) < 0.05 && Math.abs(ps.y0 - 12) < 0.05 && ps.h0 === 18 && ps.maxW <= ps.iw - 15 * MMv + 0.5,
    'canvas layout follows: first line at ' + ps.x0.toFixed(2) + ' pt, next lines at ' + (ps.x1 || 0).toFixed(2) + ' pt, 12 pt before, 18 pt lines');
  ok(ps.svgX !== null && Math.abs(ps.svgX - (ps.ox + ps.x0)) < 0.05, 'SVG export places the first line at the indented position (x = ' + ps.svgX + ')');
  await page.click('#tbUndo');
  const afterUndo = await page.evaluate((id) => OP.app.find(id).text.paras[0].lsPt, pid);
  await page.click('#tbRedo');
  const afterRedo = await page.evaluate((id) => OP.app.find(id).text.paras[0].lsPt, pid);
  // switching to "Exactly" was its own step (1.2 × 12 pt = 14.4 pt), so one undo goes back to that
  ok(afterUndo === 14.4 && afterRedo === 18, 'undo and redo step one change at a time: 18 -> ' + afterUndo + ' -> ' + afterRedo + ' pt');
  const reload = await page.evaluate((id) => {
    const d = OP.normaliseDoc(JSON.parse(JSON.stringify(OP.app.S.doc)));
    for (const pg of d.pages) for (const it of pg.items) if (it.id === id) return it.text.paras.map(p => [p.before, p.left, p.right, p.indent, p.lsPt]);
    return null;
  }, pid);
  ok(JSON.stringify(reload) === JSON.stringify(ps.paras), 'paragraph spacing and indents survive save and reload');
  await page.evaluate((id) => { const A = OP.app; A.page().items = A.page().items.filter(i => i.id !== id); A.setSel([]); A.commit(); A.refreshAll(); }, pid);

  // ---- text overflow: "Grow box to fit"
  const gid = await page.evaluate(() => {
    const A = OP.app, it = OP.newTextBox(60, 600, 170, 60, [OP.newPara([OP.newRun('Short', { size: 12, font: 'Arial' })])]);
    it.fill = { type: 'solid', color: '#ffffee' }; // a filled box is kept when its text is deleted
    A.page().items.push(it); A.commit(); A.setSel([it.id]);
    return it.id;
  });
  const box = () => page.evaluate((id) => { const it = OP.app.find(id); return { w: it.w, h: it.h, y: it.y, fit: it.text.fit, need: OP.round(OP.textHeight(it), 2) }; }, gid);
  ok(await page.evaluate(() => Array.from(document.querySelectorAll('#tFit option')).some(o => o.value === 'grow')), 'overflow offers "Grow box to fit" for a plain text box');
  await page.selectOption('#tFit', 'grow');
  const g1 = await box();
  ok(g1.fit === 'grow' && g1.h === g1.need && g1.h < 60 && g1.w === 170, 'choosing it fits the box to one line of text: ' + g1.h + ' pt high');
  await page.evaluate((id) => OP.app.beginEdit(OP.app.find(id)), gid);
  await page.waitForSelector('#ted');
  await page.keyboard.press('Control+End');
  for (let i = 1; i <= 4; i++) { await page.keyboard.press('Enter'); await page.keyboard.type('Line ' + i); }
  const g2 = await box();
  ok(g2.h > g1.h * 3 && g2.w === 170 && g2.y === g1.y, 'typing more lines grows the box downward while editing: ' + g1.h + ' -> ' + g2.h + ' pt, same top and width');
  await page.keyboard.press('Escape');
  const g3 = await box();
  ok(g3.h === g3.need && g3.h === g2.h, 'the height is kept when editing ends: ' + g3.h + ' pt');
  await page.click('#tbUndo');
  const gu = await box();
  await page.click('#tbRedo');
  const gr = await box();
  ok(gu.h === g1.h && gr.h === g3.h, 'undo and redo step the text and the height together: ' + gu.h + ' / ' + gr.h + ' pt');
  await page.evaluate((id) => OP.app.beginEdit(OP.app.find(id)), gid);
  await page.waitForSelector('#ted');
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete');
  const gd = await box();
  await page.keyboard.press('Escape');
  const g4 = await box();
  // the emptied paragraph takes the editor's default size, so one line may differ a little from the 12 pt line above
  const oneLine = await page.evaluate((id) => { const it = OP.app.find(id), p = it.text.paras; return p.length === 1 ? OP.round(OP.layoutItemText(it).lines[0].h + it.text.pad[1] + it.text.pad[3], 2) : -1; }, gid);
  ok(g4.h < g3.h && Math.abs(g4.h - oneLine) < 0.05 && Math.abs(gd.h - g4.h) < 0.05 && g4.w === 170, 'deleting the text shrinks it to one line, not below: ' + g3.h + ' -> ' + g4.h + ' pt (one line is ' + oneLine + ' pt)');
  const gload = await page.evaluate((id) => { const d = OP.normaliseDoc(JSON.parse(JSON.stringify(OP.app.S.doc))); for (const pg of d.pages) for (const it of pg.items) if (it.id === id) return it.text.fit; return null; }, gid);
  ok(gload === 'grow', '"Grow box to fit" survives save and reload');
  const linked = await page.evaluate((id) => {
    const A = OP.app; A.page().items = A.page().items.filter(i => i.id !== id); A.commit();
    const pi = A.S.doc.pages.findIndex(pg => pg.items.some(i => i.next)), it = A.S.doc.pages[pi].items.find(i => i.next);
    A.gotoPage(pi); A.setSel([it.id]); A.refreshPanels();
    const opts = Array.from(document.querySelectorAll('#tFit option')).map(o => o.value);
    A.setSel([]); A.gotoPage(0);
    return opts;
  }, gid);
  ok(linked.length === 2 && linked.indexOf('grow') < 0, 'a linked text box is not offered "Grow box to fit": ' + linked.join(', '));

  // ---- format painter (Home › Clipboard, Ctrl+Shift+C / Ctrl+Shift+V)
  await page.click('#rt-home');
  const fp = await page.evaluate(() => {
    const A = OP.app, pg = A.page();
    const src = OP.newTextBox(60, 560, 150, 40, [OP.newPara([OP.newRun('Source', { size: 20, font: 'Georgia', b: true, color: '#aa0000' })], { align: 'center', after: 6 })]);
    Object.assign(src, { fill: { type: 'solid', color: '#ddeeff' }, stroke: { color: '#003366', width: 2, dash: 'solid' }, opacity: 0.8, shadow: { dx: 3, dy: 3, blur: 4, color: '#555555' } });
    const dst = OP.newTextBox(250, 560, 150, 40, [OP.newPara([OP.newRun('Target', { size: 12, font: 'Arial' })])]);
    const s1 = OP.newShape('roundrect', 60, 680, 80, 50); Object.assign(s1, { fill: { type: 'solid', color: '#ff8800' }, stroke: { color: '#222222', width: 3, dash: 'solid' }, radius: 12, shadow: { dx: 2, dy: 2, blur: 3, color: '#333333' } });
    const s2 = OP.newShape('roundrect', 200, 680, 80, 50); s2.radius = 2;
    const s3 = OP.newShape('rect', 340, 680, 80, 50);
    [src, dst, s1, s2, s3].forEach(x => pg.items.push(x)); A.commit(); A.setSel([src.id]);
    return { src: src.id, dst: dst.id, s1: s1.id, s2: s2.id, s3: s3.id };
  });
  const centre = (id) => page.evaluate((id) => { const A = OP.app, it = A.find(id), c = A.toScreen(it.x + it.w / 2, it.y + it.h / 2), r = document.getElementById('ov').getBoundingClientRect(); return { x: r.left + c.x, y: r.top + c.y }; }, id);
  const look = (id) => page.evaluate((id) => { const it = OP.app.find(id), p = it.text && it.text.paras[0], r = p && p.runs[0];
    return { fill: it.fill, stroke: it.stroke, opacity: it.opacity, shadow: it.shadow, radius: it.radius, run: r && { font: r.font, size: r.size, b: !!r.b, color: r.color }, para: p && { align: p.align, after: p.after } }; }, id);
  await page.click('#rbPainter');
  ok(await page.evaluate(() => !!OP.app.S.painter && document.getElementById('rbPainter').classList.contains('on')), 'Format painter button arms the painter');
  const pd = await centre(fp.dst); await page.mouse.click(pd.x, pd.y);
  const [ls, ld] = [await look(fp.src), await look(fp.dst)];
  ok(JSON.stringify(ld.run) === JSON.stringify(ls.run) && JSON.stringify(ld.para) === JSON.stringify(ls.para), 'text box to text box: character and paragraph formatting copied (' + ld.run.font + ' ' + ld.run.size + ' pt bold ' + ld.run.color + ', ' + ld.para.align + ')');
  ok(JSON.stringify([ld.fill, ld.stroke, ld.opacity, ld.shadow]) === JSON.stringify([ls.fill, ls.stroke, ls.opacity, ls.shadow]), 'text box to text box: fill, outline, opacity and shadow copied');
  ok(await page.evaluate(() => !OP.app.S.painter), 'one click applies once, then the painter switches off');
  ok(await page.evaluate((id) => OP.plainText(OP.app.find(id).text) === 'Target', fp.dst), 'the target keeps its own text');
  await page.click('#tbUndo');
  const lu = await look(fp.dst);
  ok(lu.run.font === 'Arial' && lu.run.size === 12 && !lu.run.b && !lu.fill && lu.para.align === 'left', 'one undo reverts one application');
  await page.click('#tbRedo');
  await page.evaluate((id) => OP.app.setSel([id]), fp.s1);
  await page.keyboard.press('Control+Shift+C');
  await page.evaluate((id) => OP.app.setSel([id]), fp.s2);
  await page.keyboard.press('Control+Shift+V');
  const [l1, l2] = [await look(fp.s1), await look(fp.s2)];
  ok(JSON.stringify([l2.fill, l2.stroke, l2.radius, l2.shadow]) === JSON.stringify([l1.fill, l1.stroke, l1.radius, l1.shadow]), 'shape to shape with Ctrl+Shift+C and Ctrl+Shift+V: fill, outline, corner rounding and shadow copied');
  await page.evaluate((id) => OP.app.setSel([id]), fp.s1);
  await page.dblclick('#rbPainter');
  const p3 = await centre(fp.s3), p2 = await centre(fp.dst);
  await page.mouse.click(p3.x, p3.y);
  const stillOn = await page.evaluate(() => !!(OP.app.S.painter && OP.app.S.painter.sticky));
  await page.mouse.click(p2.x, p2.y);
  const [l3, l2b] = [await look(fp.s3), await look(fp.dst)];
  const beforeEsc = await page.evaluate(() => [JSON.stringify(OP.app.S.doc), OP.app.S.undo.length]);
  await page.keyboard.press('Escape');
  const afterEsc = await page.evaluate(() => [JSON.stringify(OP.app.S.doc), OP.app.S.undo.length, !!OP.app.S.painter]);
  ok(stillOn && l3.fill.color === '#ff8800' && l2b.fill.color === '#ff8800', 'double-click keeps the painter on across clicks');
  ok(!afterEsc[2] && afterEsc[0] === beforeEsc[0] && afterEsc[1] === beforeEsc[1], 'Esc switches the painter off with no change');
  await page.evaluate((ids) => { const A = OP.app; A.page().items = A.page().items.filter(i => ids.indexOf(i.id) < 0); A.setSel([]); A.commit(); A.refreshAll(); }, Object.values(fp));

  // ---- add shape + text box with tools
  await page.keyboard.press('Escape');
  await page.keyboard.press('r');
  const before = await page.evaluate(() => OP.app.page().items.length);
  await page.mouse.move(700, 400); await page.mouse.down(); await page.mouse.move(820, 480, { steps: 4 }); await page.mouse.up();
  ok(await page.evaluate(() => OP.app.page().items.length) === before + 1, 'rectangle tool adds a shape');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');

  // ---- layers tab
  await page.click('#tabLayers');
  ok(await page.locator('#layers .layer').count() > 5, 'layers list populated');
  await page.click('#tabProps');

  // ---- page navigation
  await page.locator('#pagelist .thumb').nth(1).click();
  ok(await page.evaluate(() => OP.app.S.pi) === 1, 'thumbnail click changes page');
  await page.locator('#pagelist .thumb').nth(0).click();

  // ---- save project, then reopen it
  const [dl1] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+s')]);
  const projPath = path.join(OUT, dl1.suggestedFilename());
  await dl1.saveAs(projPath);
  ok(/\.opub$/.test(projPath) && fs.statSync(projPath).size > 10000, 'project saved: ' + path.basename(projPath) + ' ' + fs.statSync(projPath).size + ' bytes');

  // ---- export PDF (all pages, 150 dpi, crop marks)
  await page.click('#btnExport');
  await page.selectOption('#xDpi', '150');
  await page.check('#xMarks');
  await page.screenshot({ path: path.join(OUT, '06-export.png') });
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.click('#xGo')]);
  const pdfPath = path.join(OUT, dl2.suggestedFilename());
  await dl2.saveAs(pdfPath);
  ok(fs.readFileSync(pdfPath).slice(0, 5).toString() === '%PDF-', 'PDF exported: ' + fs.statSync(pdfPath).size + ' bytes');
  await page.waitForFunction(() => !document.getElementById('modal').classList.contains('open'));

  // ---- export PNG (current page) and SVG (all pages -> zip)
  await page.click('#btnExport');
  await page.selectOption('#xFmt', 'png'); await page.selectOption('#xPages', 'cur'); await page.selectOption('#xDpi', '96');
  const [dl3] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#xGo')]);
  const pngPath = path.join(OUT, dl3.suggestedFilename()); await dl3.saveAs(pngPath);
  ok(fs.readFileSync(pngPath).slice(1, 4).toString() === 'PNG', 'PNG exported: ' + path.basename(pngPath));
  await page.waitForFunction(() => !document.getElementById('modal').classList.contains('open'));
  await page.click('#btnExport');
  await page.selectOption('#xFmt', 'svg');
  const [dl4] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#xGo')]);
  const zipPath = path.join(OUT, dl4.suggestedFilename()); await dl4.saveAs(zipPath);
  ok(fs.readFileSync(zipPath).slice(0, 2).toString() === 'PK', 'SVG zip exported: ' + path.basename(zipPath));
  await page.waitForFunction(() => !document.getElementById('modal').classList.contains('open'));

  // ---- tiled print
  await page.click('#rt-file'); await page.click('#rbTile');
  await page.fill('#tWidth', '600'); await page.dispatchEvent('#tWidth', 'change');
  const tileInfo = await page.locator('.dlg .hint').last().innerText();
  await page.screenshot({ path: path.join(OUT, '07-tile.png') });
  const [dl5] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), page.click('#tGo')]);
  const tilePath = path.join(OUT, dl5.suggestedFilename()); await dl5.saveAs(tilePath);
  ok(fs.readFileSync(tilePath).slice(0, 5).toString() === '%PDF-', 'tiled PDF exported (' + tileInfo.split('.')[0] + ')');
  await page.waitForFunction(() => !document.getElementById('modal').classList.contains('open'));

  // ---- new document (unsaved guard is skipped because we saved; export does not dirty)
  await page.evaluate(() => { OP.app.S.dirty = false; });
  await page.click('#rt-file'); await page.click('#rbNew');
  await page.selectOption('#nSize', 'A2'); await page.selectOption('#nOrient', 'l');
  await page.click('.dlg .btn.primary');
  const sz = await page.evaluate(() => [OP.round(OP.app.S.doc.w / OP.MM, 0), OP.round(OP.app.S.doc.h / OP.MM, 0)]);
  ok(sz[0] === 594 && sz[1] === 420, 'new A2 landscape document: ' + sz.join(' x '));

  // ---- reopen the saved project
  const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.click('#btnOpen')]);
  await fc2.setFiles(projPath);
  await page.waitForFunction(() => OP.app.S.doc.pages.length === 4, null, { timeout: 15000 });
  ok(await page.evaluate(id => { const it = OP.app.find(id); return it && OP.plainText(it.text); }, info.id) === 'Edited Headline', 'reopened project keeps the edit');

  // ---- insert a picture
  await page.click('#rt-home');
  const [fc3] = await Promise.all([page.waitForEvent('filechooser'), page.click('#tbImage')]);
  await fc3.setFiles(path.join(OUT, path.basename(pngPath)));
  await page.waitForFunction(() => OP.app.selItems().length === 1 && OP.app.selItems()[0].type === 'image', null, { timeout: 15000 });
  ok(true, 'picture inserted and selected');
  await page.screenshot({ path: path.join(OUT, '08-picture.png') });

  // ---- every other sample imports through the UI path without errors
  for (const f of ['SampleBrochure.pub', 'Sample.pub', '51318.pub', '60685.pub', 'Sample4_2010.pub']) {
    await page.evaluate(() => { OP.app.S.dirty = false; });
    const [c] = await Promise.all([page.waitForEvent('filechooser'), page.click('#btnOpen')]);
    await c.setFiles(path.join(PUBS, f));
    await page.waitForFunction(n => document.querySelector('.dlg header') && document.querySelector('.dlg header').textContent.indexOf(n) >= 0, f, { timeout: 20000 });
    ok(/Imported/.test(await page.locator('.dlg header').innerText()), 'imports ' + f);
    await page.click('.dlg .btn.primary');
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, '09-last.png') });

  // ---- ribbon, theme and status-bar zoom
  ok(await page.locator('.rb-tab').count() === 8, 'ribbon has 8 tabs: ' + (await page.locator('.rb-tab').allInnerTexts()).join(', '));
  await page.click('#rt-view'); await page.click('#rbThDark');
  ok(await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'dark' && getComputedStyle(document.body).backgroundColor !== 'rgb(238, 241, 244)'), 'dark theme applied');
  await page.screenshot({ path: path.join(OUT, '10-dark.png') });
  await page.click('#rbThLight');
  ok(await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'light' && localStorage.getItem('openpub.theme') === 'light'), 'light theme applied and remembered');
  const z0 = await page.evaluate(() => OP.app.S.view.zoom); await page.click('#tbZoomIn');
  ok(await page.evaluate(() => OP.app.S.view.zoom) > z0, 'status-bar zoom works');
  await page.keyboard.press('Control+F1');
  ok(await page.evaluate(() => document.getElementById('toolbar').classList.contains('collapsed')), 'Ctrl+F1 hides the ribbon');
  await page.keyboard.press('Control+F1');
  await page.click('#rt-home');
  await page.screenshot({ path: path.join(OUT, '11-light.png') });

  // ---- align and distribute from the ribbon (Home › Align)
  const ALIGN = ['rbAlL', 'rbAlC', 'rbAlR', 'rbAlT', 'rbAlM', 'rbAlB'], DIST = ['rbDistH', 'rbDistV'];
  const disabled = (ids) => page.evaluate((ids) => ids.map(id => document.getElementById(id).disabled), ids);
  const ids3 = await page.evaluate(() => {
    const A = OP.app; A.addPage();
    const s = [OP.newShape('rect', 50, 60, 40, 30), OP.newShape('rect', 200, 100, 60, 20), OP.newShape('rect', 120, 300, 30, 50)];
    s.forEach(x => A.page().items.push(x)); A.commit(); A.setSel([]);
    return s.map(x => x.id);
  });
  const none = await disabled(ALIGN.concat(DIST));
  ok(none.every(Boolean), 'ribbon align and distribute are disabled with nothing selected');
  await page.evaluate((id) => OP.app.setSel([id]), ids3[0]);
  const one = await disabled(ALIGN.concat(DIST));
  ok(one.slice(0, 6).every(d => !d) && one.slice(6).every(Boolean), 'one object: align enabled, distribute disabled');
  await page.click('#rbAlL'); await page.click('#rbAlB');
  const a1 = await page.evaluate((id) => { const it = OP.app.find(id), d = OP.app.S.doc; return { x: it.x, bottom: it.y + it.h, h: d.h }; }, ids3[0]);
  ok(Math.abs(a1.x) < 0.01 && Math.abs(a1.bottom - a1.h) < 0.01, 'one object aligns to the page: left ' + round2(a1.x) + ', bottom ' + round2(a1.bottom) + ' of ' + round2(a1.h) + ' pt');
  await page.evaluate((ids) => OP.app.setSel(ids), ids3);
  ok((await disabled(DIST)).every(d => !d), 'three objects: distribute enabled');
  await page.click('#rbAlT');
  const tops = await page.evaluate((ids) => ids.map(id => OP.app.find(id).y), ids3);
  ok(tops.every(y => Math.abs(y - 100) < 0.01), 'align top lines up three objects at the highest top: ' + tops.map(round2).join(', '));
  await page.click('#rbDistH');
  const gaps = await page.evaluate((ids) => { const s = ids.map(id => OP.app.find(id)).sort((a, b) => a.x - b.x); return [s[1].x - (s[0].x + s[0].w), s[2].x - (s[1].x + s[1].w)]; }, ids3);
  ok(Math.abs(gaps[0] - gaps[1]) < 0.01 && gaps[0] > 0, 'space evenly across gives equal gaps: ' + gaps.map(round2).join(' and ') + ' pt');
  await page.click('#tbUndo');
  const undone = await page.evaluate((ids) => ids.map(id => OP.app.find(id).x), ids3);
  ok(undone[0] === 0 && undone[1] === 200 && undone[2] === 120, 'one undo reverts the spacing: x = ' + undone.map(round2).join(', '));
  // content pack + templates work in the browser build too
  const packInfo = await page.evaluate((txt) => { const p = OP.app.installPackText(txt); return p.templates.length + '/' + p.blocks.length + '/' + p.colours.length; }, fs.readFileSync(path.join(__dirname, '..', 'desktop', 'examples', 'sample-pack.opubpack'), 'utf8'));
  ok(packInfo === '1/2/1', 'content pack installs: templates/blocks/colours = ' + packInfo);
  await page.evaluate(() => { OP.app.S.dirty = false; });
  await page.click('#rt-file'); await page.click('#rbTemplate');
  await page.waitForSelector('.tplgrid');
  ok(await page.locator('.tplgrid .blk').count() >= 6, 'template gallery lists built-in and pack templates');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '12-templates.png') });
  await page.click('.blk:has-text("Newsletter")');
  await page.waitForFunction(() => OP.app.S.doc.name === 'Newsletter, two pages' || OP.app.S.doc.pages.length === 2);
  ok(await page.evaluate(() => { const d = OP.app.S.doc, a = d.pages[0].items.find(i => i.next); const s = OP.storyOf(d, a); return d.pages.length === 2 && s && s.chain.length === 3 && OP.textCols(d, s.chain[2], null).cols.length === 2; }), 'newsletter template: story linked through 3 boxes over 2 pages, last box in 2 columns');

  // ---- text wrap: both sides of an obstacle, narrow sides skipped, master-page obstacles
  const wrapT = await page.evaluate(() => {
    const A = OP.app, d = OP.newDoc(), pg = d.pages[0];
    const words = 'Text flows around the square on both of its sides and reads left before right on each row. ';
    const box = OP.newTextBox(40, 60, 400, 300, [OP.newPara([OP.newRun(words.repeat(8), { size: 12, font: 'Arial' })])]);
    const ob = OP.newShape('rect', 190, 120, 100, 100); ob.fill = { type: 'solid', color: '#3d7ea6' }; ob.wrap = { mode: 'square', dist: 6 };
    pg.items.push(box, ob);
    A.loadDoc(d);
    const tc = OP.textCols(d, box, OP.pageEnv(d, pg)), col = tc.cols[0], pad = box.text.pad[0];
    const obL = ob.x - box.x - pad - 6, obR = ob.x + ob.w - box.x - pad + 6; // obstacle edges in column space, with the wrap distance
    const rows = {};
    col.lay.lines.forEach((l, i) => { (rows[l.y.toFixed(2)] = rows[l.y.toFixed(2)] || []).push({ i, x: l.x, r: l.x + l.width, n: l.segs.length }); });
    const both = Object.values(rows).filter(r => r.length === 2 && r[0].r <= obL + 0.5 && r[1].x >= obR - 0.5 && r[0].i < r[1].i);
    const svg = OP.pageToSvg(d, pg), xs = [...svg.matchAll(/<text x="([-\d.]+)"/g)].map(m => +m[1]);
    // narrow side: move the obstacle so only 30 pt is left on its left
    ob.x = box.x + pad + 30 + 6; A.commit();
    const tc2 = OP.textCols(d, box, OP.pageEnv(d, pg)), obTop = ob.y - box.y - box.text.pad[1], obBot = obTop + ob.h;
    const leftOfNarrow = tc2.cols[0].lay.lines.filter(l => l.y + l.h > obTop && l.y < obBot && l.x < 30).length;
    return { both: both.length, rightSvg: xs.filter(x => x >= col.x + obR - 0.5).length, leftOfNarrow, min: OP.WRAP_MIN_SIDE };
  });
  ok(wrapT.both >= 3, 'text flows on both sides of an obstacle: ' + wrapT.both + ' rows with a line left and a line right, left first');
  ok(wrapT.rightSvg >= 3, 'SVG export places the right-hand lines beyond the obstacle too (' + wrapT.rightSvg + ' words)');
  ok(wrapT.leftOfNarrow === 0, 'a side narrower than ' + wrapT.min + ' pt is left empty');
  const wrapM = await page.evaluate(() => {
    const A = OP.app, d = OP.newDoc(), pg = d.pages[0], m = OP.newPage();
    m.name = 'Master A'; d.masters.push(m);
    const ob = OP.newShape('rect', 40, 100, 160, 120); ob.wrap = { mode: 'square', dist: 6 }; m.items.push(ob);
    const box = OP.newTextBox(40, 60, 400, 300, [OP.newPara([OP.newRun('Page text pushed aside by an object on the master page. '.repeat(10), { size: 12, font: 'Arial' })])]);
    pg.items.push(box);
    A.loadDoc(d);
    const xs = () => OP.textCols(d, box, OP.pageEnv(d, pg)).cols[0].lay.lines.map(l => l.x);
    const without = Math.max(...xs());
    pg.master = m.id; A.commit();
    const withM = xs();
    return { without, pushed: withM.filter(x => x >= 160 - 1).length };
  });
  ok(wrapM.without < 1 && wrapM.pushed >= 3, 'an object on the master page pushes page text aside: ' + wrapM.pushed + ' lines start past it');

  // ---- text wrap while typing: the canvas shows the wrapped text, OpenPub places the caret
  const we = await page.evaluate(() => {
    const A = OP.app, d = OP.newDoc(), pg = d.pages[0];
    const words = 'Typing beside the square keeps the text wrapped on both sides while the box is edited. ';
    const box = OP.newTextBox(40, 60, 400, 300, [OP.newPara([OP.newRun(words.repeat(8), { size: 12, font: 'Arial' })])]);
    const ob = OP.newShape('rect', 190, 120, 100, 100); ob.fill = { type: 'solid', color: '#3d7ea6' }; ob.wrap = { mode: 'square', dist: 6 };
    pg.items.push(box, ob);
    A.loadDoc(d); A.setSel([box.id]); A.beginEdit(box);
    return { id: box.id, obR: ob.x + ob.w + 6 - box.x, pad: box.text.pad[0] };
  });
  await page.waitForSelector('#ted.wrapedit');
  ok(await page.evaluate(() => OP.app.isWrapEditing()), 'editing a box with text wrap switches to live wrap (editor text hidden, canvas draws it)');
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Typed while editing.');
  await page.waitForTimeout(150);
  const live = await page.evaluate((w) => {
    const d = OP.app.S.doc, box = OP.app.find(w.id), lay = OP.textCols(d, box, null).cols[0].lay, rows = {};
    lay.lines.forEach(l => { (rows[l.y.toFixed(2)] = rows[l.y.toFixed(2)] || []).push(l); });
    return { text: OP.plainText(box.text), both: Object.values(rows).filter(r => r.length === 2).length };
  }, we);
  ok(/Typed while editing\.$/.test(live.text) && live.both >= 3, 'typing writes through and the live layout keeps text on both sides: ' + live.both + ' rows');
  // click a little into the first right-hand line of the first row beside the square
  const target = await page.evaluate((w) => {
    const A = OP.app, box = A.find(w.id), tc = OP.textCols(A.S.doc, box, null), col = tc.cols[0], rows = {};
    col.lay.lines.forEach(l => { (rows[l.y.toFixed(2)] = rows[l.y.toFixed(2)] || []).push(l); });
    const row = Object.values(rows).find(r => r.length === 2), right = row[1], mk = right.marks[0];
    const bx = col.x + mk.x + 3, by = col.y + right.y + right.h / 2, s = A.toScreen(box.x + bx, box.y + by), r = document.getElementById('ov').getBoundingClientRect();
    return { x: r.left + s.x, y: r.top + s.y, rowY: col.y + right.y };
  }, we);
  await page.mouse.click(target.x, target.y);
  const c1 = await page.evaluate(() => OP.app.wrapEditState());
  ok(c1 && c1.x >= we.obR - 0.5 && Math.abs(c1.y - target.rowY) < 0.01, 'a click beside the square puts the caret on the right-hand line (x ' + (c1 && c1.x.toFixed(1)) + ' pt)');
  await page.keyboard.press('ArrowDown');
  const c2 = await page.evaluate(() => OP.app.wrapEditState());
  ok(c2 && c2.y > c1.y && c2.x >= we.obR - 0.5, 'Down moves to the next row and stays on the right of the square (y ' + c1.y.toFixed(1) + ' -> ' + (c2 && c2.y.toFixed(1)) + ')');
  await page.keyboard.type('X');
  await page.waitForTimeout(100);
  const typedAt = await page.evaluate((w) => OP.app.find(w.id).text.paras[0].runs.map(r => r.t).join('').indexOf('X'), we);
  ok(typedAt === c2.off, 'a character typed there lands at that place in the text (offset ' + typedAt + ')');
  await page.keyboard.press('Escape');
  const ended = await page.evaluate((w) => ({ on: OP.app.isWrapEditing(), has: !!document.querySelector('#ted'), text: OP.plainText(OP.app.find(w.id).text) }), we);
  await page.click('#tbUndo');
  const weUndone = await page.evaluate((w) => OP.plainText(OP.app.find(w.id).text), we);
  ok(!ended.on && !ended.has && /X/.test(ended.text) && !/Typed while editing|X/.test(weUndone), 'Esc keeps the text; one undo reverts the whole edit');

  // ---- design checker (Review › Check design)
  const seeded = await page.evaluate(() => {
    const A = OP.app, d = OP.newDoc(), pg = d.pages[0], st = { size: 12, font: 'Arial' };
    const c = document.createElement('canvas'); c.width = 100; c.height = 100; c.getContext('2d').fillRect(10, 10, 50, 50);
    const over = OP.newTextBox(40, 40, 100, 20, [OP.newPara([OP.newRun('This sentence is much too long to fit in such a small text box at twelve points.', st)])]);
    const pic = OP.newImage ? OP.newImage(OP.addAsset(d, c.toDataURL('image/png'), { w: 100, h: 100 }), 40, 120, 200, 200) : null;
    const off = OP.newShape('rect', d.w - 40, 400, 80, 40);
    const empty = OP.newTextBox(40, 500, 150, 30, [OP.newPara([OP.newRun('', st)])]);
    const field = OP.newTextBox(40, 560, 200, 30, [OP.newPara([OP.newRun('Dear {{Name}}', st)])]);
    const fine = OP.newTextBox(300, 40, 200, 40, [OP.newPara([OP.newRun('Fits easily', st)])]);
    [over, pic, off, empty, field, fine].forEach(x => pg.items.push(x));
    A.loadDoc(d);
    return { over: over.id, pic: pic && pic.id, off: off.id, empty: empty.id, field: field.id, fine: fine.id };
  });
  await page.click('#rt-review'); await page.click('#rbCheck');
  const found = await page.evaluate(() => Array.from(document.querySelectorAll('#check .ckres')).map(b => [b.dataset.kind, b.dataset.id]));
  const kinds = found.map(f => f[0]).sort().join(',');
  ok(seeded.pic && kinds === 'empty,field,lowres,offpage,overflow', 'seeded document reports exactly its five problems: ' + kinds);
  ok(found.every(f => f[1] !== seeded.fine), 'the text box that fits is not reported');
  let clicked = 0;
  for (let i = 0; i < found.length; i++) {
    await page.locator('#check .ckres').nth(i).click();
    if (await page.evaluate((id) => OP.app.S.sel.length === 1 && OP.app.S.sel[0] === id, found[i][1])) clicked++;
  }
  ok(clicked === found.length, 'clicking each result selects its object (' + clicked + ' of ' + found.length + ')');
  await page.check('#ckCmyk');
  const withCmyk = await page.evaluate(() => [Array.from(document.querySelectorAll('#check .ckres.info')).map(b => b.dataset.kind).join(','), document.getElementById('ckSum').textContent]);
  ok(withCmyk[0] === 'rgb' && /5 problems, 1 note/.test(withCmyk[1]), 'CMYK output lists the RGB picture as a note: ' + withCmyk[1]);
  await page.uncheck('#ckCmyk');
  const fontRes = await page.evaluate(() => {
    const d = OP.newDoc(); d.pages[0].items.push(OP.newTextBox(40, 40, 200, 40, [OP.newPara([OP.newRun('Hello', { size: 12, font: 'Nowhere Sans' })])]));
    return OP.checkDesign(d, { fonts: ['Arial', 'Georgia'] }).map(r => r.kind + ': ' + r.text);
  });
  ok(fontRes.length === 1 && /^font: .*Nowhere Sans/.test(fontRes[0]), 'a font that is not installed is reported: ' + fontRes[0]);
  await page.evaluate((id) => { const A = OP.app; A.find(id).x += 1; A.commit(); }, seeded.fine);
  await page.evaluate(() => OP.app.dlgExport());
  const offered = await page.evaluate(() => !!document.getElementById('ckOffer') && document.getElementById('modal').classList.contains('open'));
  await page.evaluate(() => OP.app.closeModal(true));
  await page.click('#ckRun');
  await page.evaluate(() => OP.app.dlgExport());
  const notOffered = await page.evaluate(() => !document.getElementById('ckOffer'));
  await page.evaluate(() => OP.app.closeModal(true));
  ok(offered && notOffered, 'Export offers the check when the document changed since it ran, and not right after a check');
  await page.evaluate(() => { const A = OP.app, d = OP.newDoc(); d.pages[0].items.push(OP.newTextBox(40, 40, 200, 40, [OP.newPara([OP.newRun('All good', { size: 12, font: 'Arial' })])])); A.loadDoc(d); A.checkDesign(); });
  const clean = await page.evaluate(() => [document.querySelectorAll('#check .ckres').length, document.getElementById('ckSum').textContent]);
  ok(clean[0] === 0 && clean[1] === 'No problems found.', 'a clean document reports none: ' + clean[1]);
  await page.evaluate(() => { OP.app.showTab('props'); OP.app.S.dirty = false; });

  // ---- a bad file gives a readable error, not a crash
  await page.evaluate(() => { OP.app.S.dirty = false; });
  const [c4] = await Promise.all([page.waitForEvent('filechooser'), page.click('#btnOpen')]);
  await c4.setFiles(path.join(PUBS, 'Sample98.pub'));
  await page.waitForFunction(() => document.querySelector('.dlg header') && /could not be opened/.test(document.querySelector('.dlg header').textContent), null, { timeout: 15000 });
  ok(true, 'Publisher 98 file rejected with: ' + (await page.locator('.dlg .body p').first().innerText()));
  await page.keyboard.press('Escape');

  ok(errors.length === 0, 'no script errors' + (errors.length ? ': ' + errors.slice(0, 6).join(' | ') : ''));
  await browser.close();
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
