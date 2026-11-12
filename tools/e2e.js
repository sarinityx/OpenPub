// End-to-end test of the built single-file app in headless Chrome.
const fs = require('fs'), path = require('path');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const APP = 'file://' + path.join(__dirname, '..', 'app', 'dist', 'OpenPub.html');
const PUBS = path.join(__dirname, '..', 'ref', 'poi', 'test-data', 'publisher');
const OUT = path.join(__dirname, '..', 'e2e-out');
fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
function ok(cond, msg) { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++; }

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
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
