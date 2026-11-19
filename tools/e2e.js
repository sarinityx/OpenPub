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
  ok(await page.locator('.dlg header').innerText() === 'OpenPub', 'welcome dialog shown');
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
  ok(await page.evaluate(() => /Spelling marks are off while you type in a box with text wrap/.test(document.getElementById('stmsg').textContent)),
    'the status bar says spelling marks are off while typing in a box with text wrap');
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
  // coloured text keeps its colour through a wrap edit (the hidden editor text is transparent, the runs must not be)
  const wc = await page.evaluate(() => {
    const A = OP.app, d = OP.newDoc(), pg = d.pages[0];
    const box = OP.newTextBox(40, 60, 300, 200, [OP.newPara([OP.newRun('White words on navy, and ', { size: 14, font: 'Arial', color: '#ffffff' }), OP.newRun('red ones.', { size: 14, font: 'Arial', color: '#c0392b' })])]);
    box.fill = { type: 'solid', color: '#14213d' };
    const ob = OP.newShape('rect', 150, 90, 60, 60); ob.wrap = { mode: 'square', dist: 6 };
    pg.items.push(box, ob); A.loadDoc(d); A.setSel([box.id]); A.beginEdit(box);
    return box.id;
  });
  await page.waitForSelector('#ted.wrapedit');
  await page.keyboard.press('Control+End'); await page.keyboard.type(' More');
  await page.waitForTimeout(150);
  const wcLive = await page.evaluate((id) => OP.app.find(id).text.paras[0].runs.map(r => r.color).join(','), wc);
  await page.keyboard.press('Escape');
  const wcEnd = await page.evaluate((id) => OP.app.find(id).text.paras[0].runs.map(r => r.t.trim() + ':' + r.color).join(' | '), wc);
  ok(!/#000000/.test(wcLive) && /White words on navy, and:#ffffff \| red ones\. More:#c0392b/.test(wcEnd), 'text colours survive typing in a box with text wrap: ' + wcEnd);
  await page.evaluate(() => { OP.app.S.dirty = false; });

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
  // keyboard: Enter on a result selects it and keeps focus on it (the tab is rebuilt underneath), Tab reaches the next
  await page.focus('#ckr0'); await page.keyboard.press('Enter');
  const kb1 = await page.evaluate(() => { const a = document.activeElement; return { id: a.id, cur: a.getAttribute('aria-current'), sel: OP.app.S.sel[0], want: a.dataset.id }; });
  await page.keyboard.press('Tab');
  const kb2 = await page.evaluate(() => document.activeElement.id);
  ok(kb1.id === 'ckr0' && kb1.cur === 'true' && kb1.sel === kb1.want && kb2 === 'ckr1', 'Enter on a result selects it, keeps focus there with aria-current, and Tab goes on to the next (' + kb1.id + ' -> ' + kb2 + ')');
  const words = await page.evaluate(() => [document.querySelector('#check .ckres .cklevel').textContent, (document.getElementById('ckFonts') || {}).textContent || '']);
  ok(words[0] === 'Problem' && /Fonts were not checked/.test(words[1]), 'each result says Problem or Note in words, and a skipped font check is reported: ' + words[1]);
  await page.check('#ckCmyk');
  const withCmyk = await page.evaluate(() => [Array.from(document.querySelectorAll('#check .ckres.info')).map(b => b.dataset.kind + ':' + b.querySelector('.cklevel').textContent).join(','), document.getElementById('ckSum').textContent, document.activeElement.id]);
  ok(withCmyk[0] === 'rgb:Note' && /5 problems, 1 note/.test(withCmyk[1]) && withCmyk[2] === 'ckCmyk', 'CMYK output lists the RGB picture as a note, and the checkbox keeps focus: ' + withCmyk[1]);
  await page.uncheck('#ckCmyk');
  const fontRes = await page.evaluate(() => {
    const d = OP.newDoc(); d.pages[0].items.push(OP.newTextBox(40, 40, 200, 40, [OP.newPara([OP.newRun('Hello', { size: 12, font: 'Nowhere Sans' })])]));
    return OP.checkDesign(d, { fonts: ['Arial', 'Georgia'] }).map(r => r.kind + ': ' + r.text);
  });
  ok(fontRes.length === 1 && /^font: .*Nowhere Sans/.test(fontRes[0]), 'a font that is not installed is reported: ' + fontRes[0]);
  await page.evaluate((id) => { const A = OP.app; A.find(id).x += 1; A.commit(); }, seeded.fine);
  await page.evaluate(() => OP.app.dlgExport());
  const offered = await page.evaluate(() => !!document.getElementById('ckOffer') && document.getElementById('modal').classList.contains('open') &&
    /changed since it was last checked/.test(document.getElementById('ckOffer').textContent));
  await page.evaluate(() => OP.app.closeModal(true));
  await page.click('#ckRun');
  await page.evaluate(() => OP.app.dlgExport());
  const notOffered = await page.evaluate(() => !document.getElementById('ckOffer'));
  await page.evaluate(() => OP.app.closeModal(true));
  ok(offered && notOffered, 'Export offers the check when the document changed since it ran, and not right after a check');
  await page.evaluate(() => { const A = OP.app, d = OP.newDoc(); d.pages[0].items.push(OP.newTextBox(40, 40, 200, 40, [OP.newPara([OP.newRun('All good', { size: 12, font: 'Arial' })])])); A.loadDoc(d); A.checkDesign(); });
  const clean = await page.evaluate(() => [document.querySelectorAll('#check .ckres').length, document.getElementById('ckSum').textContent]);
  ok(clean[0] === 0 && clean[1] === 'No problems found.', 'a clean document reports none: ' + clean[1]);
  const failed = await page.evaluate(() => {
    const base = OP.checkDesign; OP.checkDesign = function () { throw new Error('test failure'); };
    try { OP.app.checkDesign(); } finally { OP.checkDesign = base; }
    const s = document.getElementById('ckSum'); return [s.textContent, s.getAttribute('role')];
  });
  ok(failed[0] === 'The check could not finish: test failure' && failed[1] === 'alert', 'a check that fails says so in the tab: ' + failed[0]);
  // side-panel tabs: ARIA tabs pattern, arrows move between tabs and do not nudge the selection
  const tabs0 = await page.evaluate(() => { const A = OP.app, b = A.S.doc.pages[0].items[0]; A.setSel([b.id]); A.showTab('props'); return { x: b.x, id: b.id }; });
  await page.focus('#tabProps'); await page.keyboard.press('ArrowRight');
  const tabs1 = await page.evaluate((t) => ({ focus: document.activeElement.id, tab: OP.app.S.tab, sel: document.getElementById('tabLayers').getAttribute('aria-selected'),
    ti: ['tabProps', 'tabLayers', 'tabCheck'].map(id => document.getElementById(id).tabIndex).join(','), moved: OP.app.find(t.id).x !== t.x }), tabs0);
  await page.keyboard.press('End');
  const tabs2 = await page.evaluate(() => [document.activeElement.id, OP.app.S.tab]);
  ok(tabs1.focus === 'tabLayers' && tabs1.tab === 'layers' && tabs1.sel === 'true' && tabs1.ti === '-1,0,-1' && !tabs1.moved && tabs2[0] === 'tabCheck' && tabs2[1] === 'check',
    'side-panel tabs: Right and End move between tabs (roving tabindex ' + tabs1.ti + '), the selected object does not move');
  await page.evaluate(() => { OP.app.showTab('props'); OP.app.S.dirty = false; });

  // ---- import fidelity (1.2 item 8). Real-world certificate files stay private (test-data/private), so the
  // findings from them are checked here on SampleNewsletter.pub and on small hand-built parser results.
  const nl = await page.evaluate(async (b64) => {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const r = OP.pubToDoc(await OP.parsePub(u), 'nl');
    const items = {}, paras = [];
    r.doc.pages.forEach((p, pi) => p.items.forEach(it => { items[it.id] = { it, pi }; if (it.text) it.text.paras.forEach(pa => paras.push(pa)); }));
    const all = Object.values(items), heads = all.filter(o => o.it.next && !all.some(q => q.it.next === o.it.id));
    const chains = heads.map(h => { const c = []; for (let o = h; o; o = o.it.next ? items[o.it.next] : null) c.push(o); return c; });
    return {
      maxIndent: Math.max(...paras.map(p => Math.abs(p.left))), negLeft: paras.filter(p => p.left < 0).map(p => p.left),
      chains: chains.length, ordered: chains.every(c => c.every((o, i) => i === 0 || (o.pi === c[0].pi && o.it.x > c[i - 1].it.x))),
      headsHoldText: chains.every(c => OP.plainText(c[0].it.text).length > 0 && c.slice(1).every(o => !OP.plainText(o.it.text).length)),
      notes: r.notes
    };
  }, fs.readFileSync(path.join(PUBS, 'SampleNewsletter.pub')).toString('base64'));
  ok(nl.maxIndent < 100 && nl.negLeft.length === 1 && Math.abs(nl.negLeft[0] + 10.8) < 0.1, 'negative left indent read as signed (' + nl.negLeft.join(', ') + ' pt, largest ' + nl.maxIndent + ' pt)');
  ok(nl.chains === 10 && nl.ordered && nl.headsHoldText && !nl.notes.some(n => /wrong order/.test(n)), 'linked boxes chained in the order the file gives (' + nl.chains + ' chains)');
  const fid = await page.evaluate(() => {
    const I = OP.pubInternals, EMU = 12700;
    const out = {};
    const a = I.anchorOf({ 0x2001: 100 * EMU, 0x2003: 300 * EMU }), none = I.anchorOf({});
    out.anchor = !!a && a.ys === 0 && a.ye === 0 && a.xs === 100 * EMU && none === null;
    // a minimal parser result: page 1 on master 2
    function utf16(s) { const b = []; for (const ch of s) { const c = ch.charCodeAt(0); b.push(c & 255, c >> 8); } return new Uint8Array(b); }
    function shape(seq, type, box, v, t, c) { return { seq, type, flags: 0xa00, abs: { xs: box[0] * EMU, ys: box[1] * EMU, xe: (box[0] + box[2]) * EMU, ye: (box[1] + box[3]) * EMU }, fopt: { v: v || {}, c: c || {} }, tert: { v: t || {}, c: {} } }; }
    const pub = {
      warnings: [], widthEmu: 400 * EMU, heightEmu: 300 * EMU, palette: [{ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 102 }, { r: 153, g: 153, b: 51 }], images: [], fonts: ['Arial'], textColors: [], defaultChar: [{}], defaultPara: [{}],
      stories: { 5: { id: 5, paras: [{ runs: [{ text: 'Linked story\r', style: {} }], style: {} }] } },
      shapes: {
        10: { seq: 10, chunkType: 1, textId: null, borderArt: 2 }, 11: { seq: 11, chunkType: 1, textId: null, borderArt: 1 },
        12: { seq: 12, chunkType: 0x20, textId: null }, 13: { seq: 13, chunkType: 1, textId: null }, 14: { seq: 14, chunkType: 1, textId: null },
        15: { seq: 15, chunkType: 1, textId: 5, chainIndex: 1, prevBox: 16 }, 16: { seq: 16, chunkType: 1, textId: 5, nextBox: 15 }
      },
      pages: { 1: { seq: 1, shapes: [10, 11, 12, 14, 15, 16], bgShape: null, isMaster: false, master: 2, dummy: false }, 2: { seq: 2, shapes: [13], bgShape: null, isMaster: true, master: null, dummy: false } },
      pageOrder: [1],
      drawn: [
        { shape: shape(10, 1, [-180, -130, 360, 260], { 0x1C0: 0xffffff, 0x1CB: 36 * EMU, 0x1FF: 0xf000e }, { 0x540: 0xff9966, 0x54B: 36 * EMU }) },
        { shape: shape(11, 1, [-150, -100, 300, 200], { 0x1C0: 0xffffff, 0x1CB: 6 * EMU, 0x1FF: 0xf000e }, { 0x540: 0x08000002, 0x54B: 6 * EMU }) },
        { shape: shape(12, 136, [-100, -80, 200, 60], { 0xC3: 18 << 16 }, null, { 0xC0C0: utf16('Certificate\r\nof\r\nCompletion'), 0xC0C5: utf16('Arial') }) },
        { shape: shape(13, 1, [-50, 20, 100, 20], { 0x181: 0x0000ff, 0x1BF: 0x100010 }) },
        { shape: shape(14, 1, [-50, 20, 100, 20], { 0x181: 0x0000ff, 0x1BF: 0x100010 }) },
        { shape: shape(15, 1, [60, 40, 80, 40]) },
        { shape: shape(16, 1, [-140, 40, 80, 40]) }
      ]
    };
    const r = OP.pubToDoc(pub, 'synthetic'), pg = r.doc.pages[0], byName = (n) => pg.items.filter(it => it.name === n);
    const ba = byName('BorderArt (plain frame)');
    out.borderArt = ba.map(it => [it.stroke.color, it.stroke.width, OP.round(it.x, 1), OP.round(it.w, 1)]);
    out.baNote = r.notes.some(n => /BorderArt/.test(n));
    const wa = pg.items.find(it => it.wa);
    out.waAlign = wa && wa.wa.align;
    const g = OP.wordArtGlyphs(wa).glyphs, o = g.find(q => q.ch === 'o' && q.m[4] > wa.w * 0.3);
    out.sameWidth = g.every(q => Math.abs(q.m[0] - g[0].m[0]) < 1e-9);
    out.ofCentred = !!o && o.m[4] > wa.w * 0.35 && o.m[4] < wa.w * 0.55;
    const stretched = OP.wordArtGlyphs(Object.assign({}, wa, { id: wa.id + 's', wa: Object.assign({}, wa.wa, { align: 'stretch' }) })).glyphs;
    out.stretchDiffers = stretched.some(q => Math.abs(q.m[0] - stretched[0].m[0]) > 1e-6);
    out.dupes = pg.items.filter(it => it.fill && it.fill.color === '#ff0000').length + '+' + r.doc.masters[0].items.length;
    const boxes = pg.items.filter(it => it.text), left = boxes.find(it => it.x < 100), right = boxes.find(it => it.x > 200);
    out.chain = OP.plainText(left.text) === 'Linked story' && left.next === right.id && !OP.plainText(right.text) && !right.next;
    // older documents keep stretched lines; new WordArt is centred
    out.oldDoc = OP.normaliseDoc({ pages: [{ items: [{ type: 'shape', kind: 'rect', x: 0, y: 0, w: 10, h: 10, wa: { text: 'a\nbb' } }] }] }).pages[0].items[0].wa.align;
    out.newWa = OP.newWordArt('x', 0, 0, 10, 10).wa.align;
    return out;
  });
  ok(fid.anchor, 'a missing anchor coordinate is read as 0 (shapes on the page centre line are kept)');
  ok(JSON.stringify(fid.borderArt) === JSON.stringify([['#6699ff', 36, 38, 324], ['#000000', 6, 53, 294]]) && fid.baNote,
    'BorderArt becomes a plain frame inside its edge, in its own colour (scheme colour: black): ' + JSON.stringify(fid.borderArt));
  ok(fid.waAlign === 'center' && fid.sameWidth && fid.ofCentred && fid.stretchDiffers, 'multi-line WordArt: centred, same letter width on every line (' + fid.waAlign + ')');
  ok(fid.dupes === '0+1', 'a page object that repeats a master object exactly is imported once (' + fid.dupes + ')');
  ok(fid.chain, 'linked boxes follow next-box links, not file order');
  ok(fid.oldDoc === 'stretch' && fid.newWa === 'center', 'WordArt alignment: older documents keep stretched lines, new WordArt is centred');
  const thin = await page.evaluate(() => {
    // a 0.25 pt rule at 1 px per point is drawn at least one pixel wide, so it stays dark instead of fading to grey
    const d = OP.newDoc(200, 100), ln = OP.newShape('line', 20, 50.5, 160, 0);
    ln.stroke = { color: '#000000', width: 0.25, dash: 'solid' }; d.pages[0].items.push(ln);
    const c = OP.pageToCanvas(d, d.pages[0], 1), px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let darkest = 255; for (let i = 0; i < px.length; i += 4) darkest = Math.min(darkest, px[i]);
    const svg = OP.pageToSvg(d, d.pages[0]);
    const xml = new DOMParser().parseFromString(svg, 'image/svg+xml');
    return { darkest, svgWidth: (svg.match(/stroke-width="([\d.]+)"/) || [])[1], svgOk: !xml.querySelector('parsererror'), viewBox: xml.documentElement.getAttribute('viewBox') };
  });
  ok(thin.svgOk && thin.viewBox === '0 0 200 100', 'an exported SVG file is well-formed XML (viewBox ' + thin.viewBox + ')');
  ok(thin.darkest < 60 && thin.svgWidth === '0.25', 'a 0.25 pt rule shows dark on screen (darkest ' + thin.darkest + ') and keeps 0.25 pt in vector output');
  await page.evaluate(() => { const A = OP.app, d = OP.newDoc(); const w = OP.newWordArt('Certificate\nof\nCompletion', 40, 40, 300, 120); d.pages[0].items.push(w); A.loadDoc(d); A.setSel([w.id]); A.refreshPanels(); });
  await page.selectOption('#waAlign', 'left');
  ok(await page.evaluate(() => OP.app.selItems()[0].wa.align === 'left'), 'WordArt panel: Lines sets the alignment');

  // ---- print layouts: a preview of the sheets before printing or saving the PDF
  await page.evaluate(() => { const A = OP.app; A.addPage(); A.addPage(); A.dlgSheets('print'); });
  await page.waitForFunction(() => document.querySelector('#shPreview canvas') && /Sheet 1 of 3/.test(document.getElementById('shPvLabel').textContent));
  const pv1 = await page.evaluate(() => { const c = document.querySelector('#shPreview canvas'); return { label: document.getElementById('shPvLabel').textContent, ratio: c.width / c.height }; });
  await page.selectOption('#shLay', 'book');
  await page.waitForFunction(() => /\(front\)/.test(document.getElementById('shPvLabel').textContent));
  await page.click('button[aria-label="Next sheet"]');
  await page.waitForFunction(() => /\(back\)/.test(document.getElementById('shPvLabel').textContent));
  const pv2 = await page.evaluate(() => { const c = document.querySelector('#shPreview canvas'); return { label: document.getElementById('shPvLabel').textContent, ratio: c.width / c.height }; });
  ok(/Sheet 1 of 3, 210 × 297 mm/.test(pv1.label) && Math.abs(pv1.ratio - 210 / 297) < 0.02 && /Sheet 2 of 2, 420 × 297 mm \(back\)/.test(pv2.label) && Math.abs(pv2.ratio - 420 / 297) < 0.02,
    'print layouts preview shows each sheet: ' + pv1.label + ' / booklet ' + pv2.label);
  const pvA11y = await page.evaluate(() => { const c = document.querySelector('#shPreview canvas'); return [c.getAttribute('role'), c.getAttribute('aria-label'), document.getElementById('shPvLabel').getAttribute('aria-live')]; });
  ok(pvA11y[0] === 'img' && /^Preview of sheet 2 of 2, 420 × 297 mm \(back\)$/.test(pvA11y[1]) && pvA11y[2] === 'polite', 'the preview is named for screen readers and its label is announced: ' + pvA11y[1]);
  await page.keyboard.press('Escape');
  await page.evaluate(() => { OP.app.S.dirty = false; });
  await page.evaluate(() => { OP.app.S.dirty = false; });

  // ---- website (site/): build with a fixed release, then links, metadata, sitemap and the download button
  {
    const cp = require('child_process'), siteOut = path.join(OUT, 'site'), relFile = path.join(OUT, 'site-release.json');
    fs.writeFileSync(relFile, JSON.stringify({ tag_name: 'v9.8.7', published_at: '2026-11-19T00:00:00Z', html_url: 'https://github.com/sarinityx/OpenPub/releases/tag/v9.8.7',
      assets: [{ name: 'OpenPub-9.8.7-win64-setup.exe', browser_download_url: 'https://github.com/sarinityx/OpenPub/releases/download/v9.8.7/OpenPub-9.8.7-win64-setup.exe' },
        { name: 'OpenPub-9.8.7-win64.zip', browser_download_url: 'https://github.com/sarinityx/OpenPub/releases/download/v9.8.7/OpenPub-9.8.7-win64.zip' }] }));
    cp.execFileSync(process.execPath, [path.join(lib.ROOT, 'tools', 'build-site.js'), '--out', siteOut, '--release', relFile], { stdio: 'pipe' });
    const sc = require('./site-check').check(siteOut);
    ok(sc.problems.length === 0 && sc.pages >= 6, 'website: ' + sc.pages + ' pages, links, one h1 each, alt text, JSON-LD and sitemap check out' + (sc.problems.length ? ': ' + sc.problems.slice(0, 4).join(' | ') : ''));
    const home = fs.readFileSync(path.join(siteOut, 'index.html'), 'utf8');
    ok(/<a class="button" href="https:\/\/github.com\/sarinityx\/OpenPub\/releases\/download\/v9\.8\.7\/OpenPub-9\.8\.7-win64-setup\.exe">/.test(home) && /Version 9\.8\.7, released 19 November 2026/.test(home) &&
      /href="code-signing-policy\.html"/.test(home) && /href="privacy\.html"/.test(home) && /not affiliated with/.test(home),
      'website home page: download button for the latest installer, version, code signing policy and privacy links, trademark note');
    const sitePage = await ctx.newPage(), siteErrors = [];
    sitePage.on('console', m => { if (m.type() === 'error') siteErrors.push(m.text()); });
    sitePage.on('pageerror', e => siteErrors.push(e.message));
    await sitePage.goto(lib.fileUrl(path.join(siteOut, 'index.html')));
    const look = await sitePage.evaluate(async () => {
      // the gallery images are loading="lazy" and below the fold: load them all before checking
      const imgs = Array.from(document.images);
      imgs.forEach(i => { i.loading = 'eager'; });
      await Promise.all(imgs.map(i => i.decode().catch(() => null)));
      return { css: getComputedStyle(document.querySelector('.button')).borderRadius, broken: imgs.filter(i => !(i.naturalWidth > 0)).map(i => i.getAttribute('src')), n: imgs.length };
    });
    ok(look.css === '8px' && look.n >= 4 && !look.broken.length && siteErrors.length === 0, 'website home page renders with its stylesheet and ' + look.n + ' images, no errors' +
      (look.css !== '8px' ? '; stylesheet not applied (' + look.css + ')' : '') + (look.broken.length ? '; not loaded: ' + look.broken.join(', ') : '') + (siteErrors.length ? '; ' + siteErrors.join(' | ') : ''));
    await sitePage.close();
    // the product is called OpenPub everywhere (decision of 18 November 2026)
    // everything users see: the app, the desktop shell and its read-me, the installer, the website, the README
    // (developer notes such as CLAUDE.md and STATUS.md may mention the retired name to say it is retired)
    const shown = cp.execFileSync('git', ['ls-files', 'app', 'desktop', 'site', 'README.md', 'package.json'], { cwd: lib.ROOT, encoding: 'utf8' }).split('\n')
      .filter(f => /\.(js|mjs|html|css|md|json|txt|nsh)$/.test(f) && !/\/dict\//.test(f));
    const old = shown.filter(f => /poster\s+studio/i.test(fs.readFileSync(path.join(lib.ROOT, f), 'utf8')));
    ok(shown.length > 20 && old.length === 0 && await page.title() !== '' && !/poster studio/i.test(await page.title()), 'no "Poster Studio" in anything users see (' + shown.length + ' files)' + (old.length ? ': ' + old.join(', ') : ''));
  }

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
