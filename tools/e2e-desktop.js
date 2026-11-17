// End-to-end test of the desktop app (Electron) covering the new features.
const path = require('path'), fs = require('fs'), cp = require('child_process');
const lib = require('./lib');
const PUBS = lib.PUBS, OUT = lib.outDir('desktop');
// Optional inspection tools. Checks that need a missing one are reported as SKIP, not FAIL.
const POPPLER = lib.have('pdfinfo') && lib.have('pdffonts') && lib.have('pdftotext') && lib.have('pdfimages');
const PIKEPDF = lib.have('python3') && !/^ERR/.test(lib.sh('python3 -c "import pikepdf"'));
let skipped = 0;
function need(avail, what, label, fn) { if (avail) return fn(); console.log('SKIP ' + label + ' (needs ' + what + ')'); skipped++; }
function isPdf(f) { return fs.existsSync(f) && fs.readFileSync(f).subarray(0, 5).toString('latin1') === '%PDF-'; }
let failures = 0;
function ok(c, m) { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failures++; }
const sh = lib.sh;

(async () => {
  const app = await lib.launchDesktop([path.join(PUBS, 'Sample.pub')]);
  // native dialogs cannot be clicked from a test: answer them from here
  await app.evaluate(({ dialog }, dir) => {
    global.__next = null;
    dialog.showSaveDialog = async (w, o) => ({ canceled: false, filePath: dir + '/' + String(o.defaultPath).split(/[\\/]/).pop() });
    dialog.showOpenDialog = async () => ({ canceled: !global.__next, filePaths: global.__next ? [global.__next] : [] });
    dialog.showMessageBox = async () => ({ response: 1 });
  }, OUT);
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const tab = async (id) => { await page.click('#rt-' + id); };
  const closeDlg = async () => { await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.getElementById('modal').classList.contains('open')); };
  const scr = (id) => ev((id) => { const A = OP.app, it = A.find(id), c = A.toScreen(it.x + it.w / 2, it.y + it.h / 2), r = document.getElementById('ov').getBoundingClientRect(); return { x: r.left + c.x, y: r.top + c.y }; }, id);
  const openFile = async (f) => { await app.evaluate((_, f) => { global.__next = f; }, f); await ev(() => { OP.app.S.dirty = false; }); await page.click('#btnOpen'); };

  // ---- 1. launched with a .pub on the command line
  await page.waitForFunction(() => document.querySelector('.dlg header') && /Imported Sample\.pub/.test(document.querySelector('.dlg header').textContent), null, { timeout: 20000 });
  ok(true, 'file from the command line is imported');
  await page.click('.dlg .btn.primary');
  ok(await ev(() => document.title.indexOf('Sample') === 0), 'window title shows the document: ' + await ev(() => document.title));

  // ---- 2. imported table is a real table; edit a cell
  await page.locator('#pagelist .thumb').nth(1).click();
  const tb = await ev(() => { const t = OP.app.page().items.find(i => i.type === 'table'); return t ? { id: t.id, rows: t.rows.length, cols: t.cols.length, first: OP.plainText(t.cells[0][0].text) } : null; });
  ok(tb && tb.rows === 3 && tb.cols === 2, 'imported table: ' + JSON.stringify(tb));
  const cellPt = await ev((id) => { const A = OP.app, it = A.find(id), rc = OP.cellRect(it, 1, 1), c = A.toScreen(it.x + rc.x + rc.w / 2, it.y + rc.y + rc.h / 2), r = document.getElementById('ov').getBoundingClientRect(); return { x: r.left + c.x, y: r.top + c.y }; }, tb.id);
  await page.mouse.dblclick(cellPt.x, cellPt.y);
  await page.waitForSelector('#ted');
  await page.keyboard.press('Control+a'); await page.keyboard.type('Edited cell');
  await page.keyboard.press('Tab'); // moves to the next cell
  await page.waitForSelector('#ted');
  ok(await ev(() => OP.app.S.editCell && OP.app.S.editCell.r === 2 && OP.app.S.editCell.c === 0), 'Tab moves to the next cell');
  await page.keyboard.press('Escape');
  ok(await ev((id) => OP.plainText(OP.app.find(id).cells[1][1].text), tb.id) === 'Edited cell', 'cell text edited in place');
  // row / column commands
  await ev((id) => { OP.app.setSel([id]); OP.app.S.cell = { id: id, r: 1, c: 0 }; OP.app.refreshPanels(); }, tb.id);
  await page.click('button:has-text("Row below")');
  await ev((id) => { OP.app.setSel([id]); OP.app.S.cell = { id: id, r: 0, c: 1 }; OP.app.refreshPanels(); }, tb.id);
  await page.click('button:has-text("Column right")');
  ok(await ev((id) => { const t = OP.app.find(id); return t.rows.length === 4 && t.cols.length === 3 && t.cells.length === 4 && t.cells.every(r => r.length === 3); }, tb.id), 'row and column inserted (4 × 3)');
  await ev((id) => { OP.app.setSel([id]); OP.app.S.cell = { id: id, r: 0, c: 0 }; OP.app.refreshPanels(); }, tb.id);
  await page.click('button:has-text("Merge right")');
  ok(await ev((id) => { const t = OP.app.find(id); return t.cells[0][0].cs === 2 && t.cells[0][1] === null; }, tb.id), 'cells merged');
  await page.keyboard.press('Control+z');
  ok(await ev((id) => OP.app.find(id).cells[0][0].cs === 1, tb.id), 'undo restores the merge');
  await page.screenshot({ path: path.join(OUT, '01-table.png') });

  // ---- 3. insert a new table from the toolbar
  await ev(() => OP.app.setSel([]));
  await tab('insert');
  await page.click('#tbTable'); await page.fill('#tbR', '3'); await page.fill('#tbC', '4'); await page.click('.dlg .btn.primary');
  await page.waitForFunction(() => OP.app.selItems().length === 1 && OP.app.selItems()[0].type === 'table');
  ok(await ev(() => { const t = OP.app.selItems()[0]; return t.rows.length === 3 && t.cols.length === 4 && t.cells[0][0].fill; }), 'Insert table dialog creates a 3 × 4 table with a shaded header');

  // ---- 4. WordArt
  await tab('insert');
  await page.click('#tbWordArt');
  await page.waitForSelector('#waText');
  await page.fill('#waText', 'GRAND OPENING');
  await page.selectOption('#waWarp', 'archUp');
  const wa = await ev(() => { const it = OP.app.selItems()[0]; return { id: it.id, warp: it.wa.warp, text: it.wa.text, n: OP.wordArtGlyphs(it).glyphs.length }; });
  ok(wa.warp === 'archUp' && wa.text === 'GRAND OPENING' && wa.n === 13, 'WordArt created and warped: ' + JSON.stringify(wa));
  await ev(() => { const it = OP.app.selItems()[0]; it.fill = { type: 'linear', angle: 0, stops: [[0, '#d4249b'], [1, '#0a6c96']] }; it.stroke = { color: '#000000', width: 1, dash: 'solid' }; OP.app.commit(); OP.app.invalidate(); });
  for (const w of ['wave', 'inflate', 'circle', 'slantUp', 'archDown']) { await page.selectOption('#waWarp', w); await page.waitForTimeout(60); }
  await page.selectOption('#waWarp', 'wave');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '02-wordart.png') });

  // ---- 5. linked text boxes + columns
  await openFile(path.join(PUBS, 'SampleNewsletter.pub'));
  await page.waitForFunction(() => document.querySelector('.dlg header') && /SampleNewsletter/.test(document.querySelector('.dlg header').textContent), null, { timeout: 20000 });
  await page.click('.dlg .btn.primary');
  const chains = await ev(() => { const seen = {}, out = []; OP.app.S.doc.pages.forEach(p => p.items.forEach(it => { const s = OP.storyOf(OP.app.S.doc, it); if (s && !seen[s.head.id]) { seen[s.head.id] = 1; out.push(s.chain.length); } })); return out; });
  ok(chains.length >= 5 && chains.every(n => n >= 2), 'imported stories stay linked: chain lengths ' + chains.join(','));
  ok(await ev(() => OP.app.S.doc.pages[0].items.some(i => i.wa && i.wa.text === 'Liberty')), 'WordArt imported as WordArt');
  // make two boxes and link them through the UI
  const ids = await ev(() => {
    const A = OP.app, d = A.S.doc; A.addPage();
    const long = Array.from({ length: 60 }, (_, i) => 'Sentence number ' + (i + 1) + ' of the story.').join(' ');
    const a = OP.newTextBox(40, 60, 200, 120, [OP.newPara([OP.newRun(long, { size: 11 })])]), b = OP.newTextBox(300, 60, 200, 300, [OP.newPara([OP.newRun('', { size: 11 })])]);
    b.stroke = { color: '#888888', width: 0.5, dash: 'solid' }; a.stroke = OP.clone(b.stroke);
    A.addItems([a, b]); A.setSel([a.id]);
    return { a: a.id, b: b.id };
  });
  ok(await ev((id) => OP.textCols(OP.app.S.doc, OP.app.find(id), null).overflow, ids.a), 'overflow detected before linking');
  await page.click('button:has-text("Continue in another box")');
  const pb = await scr(ids.b);
  await page.mouse.click(pb.x, pb.y);
  const linked = await ev((ids) => { const A = OP.app, s = OP.storyOf(A.S.doc, A.find(ids.a)), cb = OP.textCols(A.S.doc, A.find(ids.b), null); return { chain: s ? s.chain.length : 0, linesB: cb.cols[0].lay.lines.length, linesA: OP.textCols(A.S.doc, A.find(ids.a), null).cols[0].lay.lines.length }; }, ids);
  ok(linked.chain === 2 && linked.linesB > 3 && linked.linesA > 3, 'boxes linked through the UI; text flows on: ' + JSON.stringify(linked));
  await ev((id) => { const it = OP.app.find(id); it.text.cols = 2; it.text.gap = 10; OP.app.commit(); OP.app.invalidate(); }, ids.b);
  ok(await ev((id) => OP.textCols(OP.app.S.doc, OP.app.find(id), null).cols.length === 2, ids.b), 'two columns inside the linked box');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '03-linked.png') });
  // editing a continuation box edits the story from its head
  const pa = await scr(ids.b);
  await page.mouse.dblclick(pa.x, pa.y);
  await page.waitForSelector('#ted');
  ok(await ev((ids) => OP.app.S.editing === ids.a, ids), 'double-clicking a continuation box edits the story from its first box');
  await page.keyboard.press('Escape');
  // deleting the head hands the text on
  await ev((id) => { OP.app.setSel([id]); OP.app.deleteSel(); }, ids.a);
  ok(await ev((id) => OP.plainText(OP.app.find(id).text).indexOf('Sentence number 1 ') === 0, ids.b), 'deleting the first box keeps the story in the next box');

  // ---- 6. master page with page number
  await ev(() => { const A = OP.app; A.gotoPage(0); });
  await tab('design'); await page.click('#rbMaster');
  ok(await ev(() => !!OP.app.S.master), 'master editing mode entered');
  await ev(() => { const A = OP.app, d = A.S.doc; A.addItems([OP.newTextBox(d.w / 2 - 60, d.h - 40, 120, 20, [OP.newPara([OP.newRun('Page {{page}} of {{pages}}', { size: 10 })], { align: 'center' })])]); });
  await page.locator('#pagelist .thumb').nth(0).click();
  ok(await ev(() => !OP.app.S.master && OP.app.S.pi === 0), 'page thumbnail leaves master editing');
  await ev(() => OP.app.setSel([]));
  await page.click('button:has-text("Use on all pages")');
  ok(await ev(() => OP.app.S.doc.pages.every(p => p.master === OP.app.S.doc.masters[0].id)), 'master applied to all pages');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '03b-master.png') });
  const svg3 = await ev(() => OP.pageToSvg(OP.app.S.doc, OP.app.S.doc.pages[2], {}));
  ok(/>Page<\/text>/.test(svg3) && />3<\/text>/.test(svg3) && />5<\/text>/.test(svg3), 'page number field resolves on page 3 (of 5)');

  // ---- 7. building blocks
  await tab('insert');
  await page.click('#tbBlocks');
  await page.waitForSelector('.blkgrid');
  const nBlocks = await page.locator('.blk').count();
  await page.screenshot({ path: path.join(OUT, '04-blocks.png') });
  await page.click('.blk:has-text("Calendar (this month)")');
  await page.waitForFunction(() => OP.app.selItems().some(i => i.type === 'table'));
  ok(nBlocks >= 15 && await ev(() => { const t = OP.app.selItems().find(i => i.type === 'table'); return t.cols.length === 7 && OP.plainText(t.cells[0][0].text) === 'Mon'; }), nBlocks + ' building blocks; calendar inserted as a 7-column table');
  // save selection as user block
  await page.click('#tbBlocks'); await page.click('button:has-text("Save selection as a block")');
  await page.fill('#bkName', 'My calendar'); await page.click('.dlg .btn.primary');
  await page.click('#tbBlocks');
  ok(await page.locator('.blk:has-text("My calendar")').count() >= 1, 'selection saved as a user block');
  await closeDlg();

  // ---- 8. find and replace
  await page.keyboard.press('Control+f');
  await page.fill('#frFind', 'Liberty'); await page.fill('#frRep', 'Freedom');
  await page.click('button:has-text("Replace all")');
  ok(await ev(() => OP.app.S.doc.pages[0].items.some(i => i.wa && i.wa.text === 'Freedom')), 'find and replace reaches WordArt: ' + await page.locator('.dlg .hint').last().innerText());
  await closeDlg();

  // ---- 9. spelling
  await ev(() => { const A = OP.app; A.gotoPage(0); A.addItems([OP.newTextBox(30, 30, 300, 40, [OP.newPara([OP.newRun('We recieve the colour organise tomorow.', { size: 12 })])])]); });
  const bad = await ev(() => OP.desktop.spellCheck(['recieve', 'colour', 'organise', 'color', 'tomorow', 'the', 'NASA', "Sam's"]));
  ok(bad.indexOf('recieve') >= 0 && bad.indexOf('tomorow') >= 0 && bad.indexOf('colour') < 0 && bad.indexOf('organise') < 0 && bad.indexOf('the') < 0, 'Australian dictionary: flagged ' + JSON.stringify(bad));
  const sugg = await ev(() => OP.desktop.spellSuggest('recieve'));
  ok(sugg.indexOf('receive') >= 0, 'suggestions for "recieve": ' + sugg.slice(0, 4).join(', '));
  await page.keyboard.press('F7');
  await page.waitForFunction(() => document.querySelector('.dlg header') && /Spelling/.test(document.querySelector('.dlg header').textContent), null, { timeout: 30000 });
  // step through until our word shows up, changing it
  let fixed = false;
  for (let i = 0; i < 80; i++) {
    const head = await page.locator('.dlg header').innerText();
    if (!/of/.test(head)) break;
    const word = await page.locator('.dlg .body b').innerText();
    if (word === 'recieve') { await page.fill('#spTo', 'receive'); await page.click('button:has-text("Change all")'); fixed = true; }
    else await page.click('button:has-text("Ignore")');
    await page.waitForTimeout(40);
    await page.waitForSelector('.dlg header');
  }
  await page.screenshot({ path: path.join(OUT, '05-spell-done.png') });
  if (await ev(() => OP.app.modalOpen())) await closeDlg();
  ok(fixed && await ev(() => OP.app.S.doc.pages[0].items.some(i => i.text && /We receive the colour/.test(OP.plainText(i.text)))), 'spelling dialog corrected the word in the document');

  // ---- 10. vector PDF of the whole document
  await page.click('#btnExport');
  ok(await ev(() => document.getElementById('xFmt').value === 'vpdf'), 'vector PDF is the default export format in the desktop app');
  await page.check('#xMarks');
  await page.click('#xGo');
  await page.waitForFunction(() => !document.getElementById('modal').classList.contains('open'), null, { timeout: 120000 });
  const vpdf = path.join(OUT, 'SampleNewsletter.pdf');
  ok(isPdf(vpdf), 'vector PDF written');
  need(POPPLER, 'poppler-utils', 'vector PDF pages, fonts and text', () => {
  const info = sh('pdfinfo "' + vpdf + '"'), fonts = sh('pdffonts "' + vpdf + '"'), text = sh('pdftotext -f 1 -l 1 "' + vpdf + '" -');
  ok(/Pages:\s+5/.test(info), 'vector PDF has 5 pages; size ' + (info.match(/Page size:.*/) || [''])[0]);
  ok(/yes\s+yes|TrueType|Type 3|CID/.test(fonts) && fonts.split('\n').length > 3, 'fonts are embedded (' + (fonts.split('\n').length - 3) + ' font entries)');
  ok(/Striving to Achieve/.test(text) && /Freedom/.test(text), 'PDF text is real, selectable text');
  sh('pdftoppm -r 60 -png -f 1 -l 1 "' + vpdf + '" ' + path.join(OUT, 'vpdf'));
  sh('pdftoppm -r 60 -png -f 5 -l 5 "' + vpdf + '" ' + path.join(OUT, 'vpdf'));
  });

  // ---- 11. mail merge on a business card, n-up on A4, vector
  await ev(() => {
    const A = OP.app; A.S.dirty = false;
    const d = OP.newDoc(90 * OP.MM, 55 * OP.MM); d.name = 'Cards';
    A.loadDoc(d);
    const t = OP.newTextBox(10, 30, 230, 80, [OP.newPara([OP.newRun('{{Name}}', { size: 16, b: true })]), OP.newPara([OP.newRun('{{Role}}, {{City}}', { size: 10 })])]);
    const r = OP.newShape('rect', 0, 0, d.w, 14); r.fill = { type: 'solid', color: '#0a6c96' }; r.stroke = null;
    A.addItems([r, t]);
  });
  await tab('mail'); await page.click('#rbMerge');
  await page.fill('#mgData', 'Name,Role,City\nAlex Tan,Designer,Sydney\n"Brooke, Lee",Printer,Perth\nCasey Wu,Editor,Hobart\nDana Roy,Writer,Darwin\nEli Fox,Manager,Cairns\nFay Hill,Owner,Geelong\nGus Park,Clerk,Albany\nHana Sato,Artist,Broome\nIan Cole,Driver,Mackay\nJo Reid,Chef,Bendigo\nKim Vo,Nurse,Dubbo\nLee Ng,Pilot,Orange');
  await page.click('button:has-text("Use this data")');
  await page.waitForFunction(() => OP.app.S.doc.merge && OP.app.S.doc.merge.rows.length === 12);
  ok(await ev(() => OP.app.S.doc.merge.rows[1][0] === 'Brooke, Lee' && OP.app.S.doc.merge.fields.join() === 'Name,Role,City'), 'merge data parsed (12 records, quoted comma kept)');
  await closeDlg();
  const prevSvg = await ev(() => OP.pageToSvg(OP.app.S.doc, OP.app.page(), {}));
  ok(/>Alex<\/text>/.test(prevSvg) && />Designer,<\/text>/.test(prevSvg), 'preview shows record 1 instead of the field names');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '06-merge.png') });
  await page.keyboard.press('Control+Shift+P');
  await page.selectOption('#shLay', 'nup'); await page.selectOption('#shRec', 'all'); await page.check('#shMarks'); await page.fill('#shGap', '4'); await page.dispatchEvent('#shGap', 'change');
  const nupInfo = await page.locator('.dlg .hint').last().innerText();
  await page.screenshot({ path: path.join(OUT, '07-nup.png') });
  await page.click('#shGo');
  await page.waitForFunction(() => !document.getElementById('modal').classList.contains('open'), null, { timeout: 120000 });
  const cards = path.join(OUT, 'Cards-sheet-merged.pdf');
  ok(isPdf(cards), 'n-up merge PDF written');
  need(POPPLER, 'poppler-utils', 'n-up merge sheet count and record text', () => {
  const ci = sh('pdfinfo "' + cards + '"'), ct = sh('pdftotext "' + cards + '" -');
  ok(/Pages:\s+2/.test(ci) && /59[45]\.?\d* x 84[12]/.test(ci), 'n-up merge: ' + nupInfo.split('.')[0] + ' -> ' + (ci.match(/Pages:.*/) || [''])[0] + ', ' + (ci.match(/Page size:.*/) || [''])[0]);
  ok(['Alex Tan', 'Brooke, Lee', 'Lee Ng', 'Hobart'].every(s => ct.indexOf(s) >= 0) && ct.indexOf('{{') < 0, 'every record appears on the sheets, no unresolved fields');
  sh('pdftoppm -r 50 -png -f 1 -l 1 "' + cards + '" ' + path.join(OUT, 'cards'));
  });

  // ---- 12. CMYK picture PDF
  await page.keyboard.press('Control+Shift+P');
  await page.selectOption('#shOut', 'cmyk'); await page.selectOption('#shRec', 'cur'); await page.selectOption('#shDpi', '150');
  await ev(() => { OP.app.S.doc.name = 'CardsCMYK'; });
  await page.click('#shGo');
  await page.waitForFunction(() => !document.getElementById('modal').classList.contains('open'), null, { timeout: 120000 });
  ok(isPdf(path.join(OUT, 'CardsCMYK.pdf')), 'CMYK picture PDF written');
  need(POPPLER, 'poppler-utils', 'CMYK picture PDF colour space', () => {
  const cm = sh('pdfimages -list "' + path.join(OUT, 'CardsCMYK.pdf') + '"');
  ok(/cmyk/.test(cm), 'CMYK PDF contains a DeviceCMYK image: ' + (cm.split('\n')[2] || '').replace(/\s+/g, ' ').trim());
  sh('pdftoppm -r 80 -png "' + path.join(OUT, 'CardsCMYK.pdf') + '" ' + path.join(OUT, 'cmyk'));
  });

  // ---- 13. booklet
  await openFile(path.join(PUBS, 'SampleNewsletter.pub'));
  await page.waitForFunction(() => document.querySelector('.dlg header') && /SampleNewsletter/.test(document.querySelector('.dlg header').textContent), null, { timeout: 20000 });
  await page.click('.dlg .btn.primary');
  await page.keyboard.press('Control+Shift+P');
  await page.selectOption('#shLay', 'book');
  await page.click('#shGo');
  await page.waitForFunction(() => !document.getElementById('modal').classList.contains('open'), null, { timeout: 120000 });
  ok(isPdf(path.join(OUT, 'SampleNewsletter-booklet.pdf')), 'booklet PDF written');
  need(POPPLER, 'poppler-utils', 'booklet sheet count and size', () => {
  const bk = sh('pdfinfo "' + path.join(OUT, 'SampleNewsletter-booklet.pdf') + '"');
  ok(/Pages:\s+2/.test(bk) && /119[01]\.?\d* x 84[12]/.test(bk), 'booklet: 4 pages on 2 spreads, ' + (bk.match(/Page size:.*/) || [''])[0]);
  });
  const order = await ev(() => OP.sheetsBooklet(OP.app.S.doc, -1).map(s => s.items.map(i => i.page + 1).join('+')).join(' | '));
  ok(order === '4+1 | 2+3', 'booklet page order: ' + order);

  // ---- 14. picture adjustments
  const img = await ev(() => { const A = OP.app; A.gotoPage(0); const it = A.page().items.find(i => i.type === 'image'); A.setSel([it.id]); return it.id; });
  await page.selectOption('#pjT', 'gray'); await page.selectOption('#pjM', 'ellipse');
  ok(await ev((id) => { const it = OP.app.find(id); return it.adj.gray && it.mask === 'ellipse' && OP.adjFilter(it.adj) === 'grayscale(1)'; }, img), 'picture adjustments: greyscale + oval frame');

  // ---- 15. text styles: strikethrough, caps, spacing, numbered list
  await ev(() => { OP.app.S.doc.name = 'RoundTripSrc'; });
  const tid = await ev(() => { const A = OP.app; const t = OP.newTextBox(40, 200, 300, 80, [OP.newPara([OP.newRun('first', { size: 12 })]), OP.newPara([OP.newRun('second', { size: 12 })])]); A.addItems([t]); return t.id; });
  await page.click('#tS'); await page.click('#tCaps'); await page.click('#tNum');
  await page.fill('#tSp', '2'); await page.dispatchEvent('#tSp', 'change');
  const ts = await ev((id) => { const it = OP.app.find(id), r = it.text.paras[0].runs[0]; return { s: r.s, caps: r.caps, sp: r.sp, num: it.text.paras.every(p => p.num), bullets: OP.prepParas(it.text.paras, null).map(p => p.bullet).join(' ') }; }, tid);
  ok(ts.s && ts.caps && ts.sp === 2 && ts.num && ts.bullets === '1. 2.', 'strikethrough, capitals, letter spacing, numbered list: ' + JSON.stringify(ts));
  // the same styles survive in-place editing
  const tp = await scr(tid);
  await page.mouse.dblclick(tp.x, tp.y); await page.waitForSelector('#ted'); await page.keyboard.press('End'); await page.keyboard.type('!'); await page.keyboard.press('Escape');
  const ts2 = await ev((id) => { const it = OP.app.find(id), r = it.text.paras[0].runs[0]; return { t: OP.plainText(it.text), s: !!r.s, caps: !!r.caps, sp: r.sp, num: it.text.paras.every(p => p.num) }; }, tid);
  ok(/!/.test(ts2.t) && ts2.s && ts2.caps && ts2.sp === 2 && ts2.num, 'styles survive a round trip through the text editor: ' + JSON.stringify(ts2));

  // ---- 15b. installed fonts are loaded without asking
  const nFonts = await ev(() => document.querySelectorAll('#fontlist option').length);
  ok(nFonts > 25, 'installed fonts loaded automatically: ' + nFonts + ' families in the font list');

  // the font drop-down lists every font, whatever is already in the box
  await ev((id) => OP.app.setSel([id]), tid);
  await page.click('#tFont');
  await page.waitForSelector('.fontpop');
  const fl = await ev(() => { const o = Array.from(document.querySelectorAll('.fontpop .fontopt')).map(e => e.textContent); return { n: o.length, cur: document.getElementById('tFont').value, nonMatching: o.filter(x => x.toLowerCase().indexOf(document.getElementById('tFont').value.toLowerCase()) < 0).length, on: (document.querySelector('.fontopt.on') || {}).textContent }; });
  ok(fl.n === nFonts && fl.nonMatching > 20 && fl.on === fl.cur, 'font drop-down shows all ' + fl.n + ' fonts with “' + fl.cur + '” in the box (' + fl.nonMatching + ' of them do not contain that name)');
  await page.screenshot({ path: path.join(OUT, '08a-fonts.png') });
  await page.keyboard.type('liberation s');
  const flt = await ev(() => Array.from(document.querySelectorAll('.fontpop .fontopt')).map(e => e.textContent));
  ok(flt.length >= 2 && flt.length < 12 && flt.every(x => /liberation s/i.test(x)), 'typing narrows the list: ' + flt.join(', '));
  await page.locator('.fontpop .fontopt', { hasText: /^Liberation Serif$/ }).click();
  ok(await ev((id) => OP.app.find(id).text.paras.every(p => p.runs.every(r => r.font === 'Liberation Serif')), tid) && await ev(() => !document.querySelector('.fontpop')), 'picking a font applies it and closes the list');
  await page.click('#tFont'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  const kb = await ev((id) => OP.app.find(id).text.paras[0].runs[0].font, tid);
  ok(kb !== 'Liberation Serif' && kb.length > 0, 'keyboard: arrow down + Enter picks the next font (' + kb + ')');

  // ---- 15c. text wrap + hyphenation through the UI
  const wr = await ev(() => {
    const A = OP.app; A.addPage();
    const lorem = 'Organisations everywhere produce newsletters and extraordinary programmes for their neighbourhood communities, and a publication deserves considered hyphenation throughout. ';
    const t = OP.newTextBox(40, 60, 260, 330, [OP.newPara([OP.newRun(lorem + lorem + lorem + lorem, { size: 11 })], { align: 'justify' })]);
    const c = OP.newShape('ellipse', 200, 140, 120, 120); c.fill = { type: 'solid', color: '#d4249b' }; c.stroke = null;
    A.addItems([t, c]); A.setSel([c.id]);
    return { t: t.id, c: c.id, before: OP.textCols(A.S.doc, t, null).cols[0].lay.lines.length };
  });
  await page.selectOption('#wrMode', 'tight');
  const wr2 = await ev((w) => { const A = OP.app, lay = OP.textCols(A.S.doc, A.find(w.t), null).cols[0].lay; return { lines: lay.lines.length, narrow: lay.lines.filter(l => l.width < 150 && l.segs.length > 1).length }; }, wr);
  ok(wr2.lines > wr.before && wr2.narrow >= 4, 'tight wrap narrows lines beside the oval: ' + wr.before + ' -> ' + wr2.lines + ' lines, ' + wr2.narrow + ' shortened');
  await ev((w) => OP.app.setSel([w.t]), wr);
  await page.check('#tfHyph');
  const hy = await ev((w) => { const A = OP.app, lay = OP.textCols(A.S.doc, A.find(w.t), null).cols[0].lay; return lay.lines.filter(l => l.segs.length && /-$/.test(l.segs[l.segs.length - 1].text)).length; }, wr);
  ok(hy >= 2 && await ev((w) => OP.app.find(w.t).text.hyph === true, wr), 'hyphenation switch adds hyphenated line ends: ' + hy);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '08-wrap.png') });
  const wsvg = await ev(() => OP.pageToSvg(OP.app.S.doc, OP.app.page(), {}));
  ok(/-<\/text>/.test(wsvg), 'hyphens reach the vector output');

  // ---- 15d. plug-in installed through the dialog
  await tab('plugins'); await page.click('#rbPlugins');
  await page.locator('.dlg input[type=file][accept^=".js,"]').setInputFiles(path.join(lib.EXAMPLES, 'sample-plugin.js'));
  await page.waitForFunction(() => { const h = document.querySelector('.dlg header'); return !!h && /Install this plug-in/.test(h.textContent); });
  ok(/program/.test(await page.locator('.dlg .note').innerText()), 'installing a plug-in shows a trust warning first');
  await page.click('.dlg .btn.primary');
  await page.waitForFunction(() => { const h = document.querySelector('.dlg header'); return !!h && /Plug-ins and content packs/.test(h.textContent); });
  ok(await page.locator('.plug:has-text("Sample tools")').count() === 1, 'plug-in listed after install');
  await closeDlg();
  await tab('plugins');
  const cmds = await page.locator('#rbBody .rb-btn').allInnerTexts();
  ok(['Placeholder text', 'Word count', 'Export: Text outline'].every(c => cmds.indexOf(c) >= 0), 'plug-in commands on the ribbon: ' + cmds.join(', '));
  await ev(() => OP.app.setSel([]));
  const nBefore = await ev(() => OP.app.page().items.length);
  await page.click('#rbBody .rb-btn:has-text("Placeholder text")');
  ok(await ev(() => OP.app.page().items.length) === nBefore + 1 && await ev(() => /Lorem ipsum/.test(OP.plainText(OP.app.selItems()[0].text))), 'plug-in command inserts a text box');
  await page.keyboard.press('Control+z');
  ok(await ev(() => OP.app.page().items.length) === nBefore, 'plug-in change is one undo step');
  await page.click('#rbBody .rb-btn:has-text("Export: Text outline")');
  await page.waitForFunction(() => /Exported/.test(document.getElementById('toasts').textContent), null, { timeout: 10000 });
  const outline = fs.readFileSync(path.join(OUT, 'RoundTripSrc.txt'), 'utf8');
  ok(/=== Page 1 ===/.test(outline) && /Striving to Achieve/.test(outline), 'plug-in exporter wrote a file through the save dialog');
  await tab('insert'); await page.click('#tbBlocks');
  ok(await page.locator('.blk:has-text("Speech bubble")').count() === 1, 'plug-in building block appears in the gallery');
  await closeDlg();
  // switched off: commands disappear and the code is not run
  await tab('plugins'); await page.click('#rbPlugins');
  await page.locator('.plug:has-text("Sample tools") input[type=checkbox]').uncheck();
  await page.waitForTimeout(150); await closeDlg(); await tab('plugins');
  ok((await page.locator('#rbBody .rb-btn').allInnerTexts()).indexOf('Word count') < 0, 'switched-off plug-in adds nothing');
  // a broken plug-in is reported, not fatal
  const broken = await ev(() => { const r = OP.app.installPluginText('broken.js', 'this is not javascript('); return r.error; });
  ok(/error/i.test(broken), 'broken plug-in is contained: ' + broken.slice(0, 60));

  // ---- 15e. content pack through the dialog; colour scheme
  await page.click('#rbPlugins');
  await page.locator('.dlg input[type=file][accept^=".opubpack"]').setInputFiles(path.join(lib.EXAMPLES, 'sample-pack.opubpack'));
  await page.waitForFunction(() => { const b = document.querySelector('.dlg .body'); return !!b && document.querySelectorAll('.plug').length > 0 && /Sample pack/.test(b.textContent); });
  ok(true, 'content pack installed from a file');
  const key = await ev(() => Array.from(document.querySelectorAll('#plScheme option')).map(o => o.value + '=' + o.textContent).filter(s => /Sample scheme/.test(s))[0]);
  await page.selectOption('#plScheme', key.split('=')[0]);
  await closeDlg();
  await ev(() => { const A = OP.app; const s = A.page().items.find(i => i.type === 'shape' && i.fill); A.setSel([s.id]); });
  ok(await ev(() => { const i = document.querySelector('#props input[type=color]'); return i && i.getAttribute('list') === 'swatches' && document.querySelectorAll('#swatches option').length === 6; }), 'colour scheme swatches attached to the colour pickers');
  await tab('insert'); await page.click('#tbBlocks');
  ok(await page.locator('.blk:has-text("Sale tag")').count() === 1, 'pack building blocks appear in the gallery');
  await closeDlg();

  // ---- 15f. vector CMYK through Ghostscript (skipped when no Ghostscript is installed)
  const gst = await ev(() => OP.desktop.gsStatus());
  await need(gst.found, 'Ghostscript', 'vector CMYK PDF through Ghostscript', async () => {
  ok(/^\d+\.\d+/.test(gst.version), 'Ghostscript detected: version ' + gst.version);
  await page.keyboard.press('Control+Shift+P');
  await page.selectOption('#shOut', 'vcmyk'); await page.selectOption('#shPages', 'cur');
  await page.waitForFunction(() => /found/.test(document.getElementById('shGsInfo').textContent));
  await page.screenshot({ path: path.join(OUT, '09-cmyk.png') });
  await page.click('#shGo');
  await page.waitForFunction(() => !document.getElementById('modal').classList.contains('open'), null, { timeout: 180000 });
  const vc = path.join(OUT, 'RoundTripSrc-cmyk.pdf');
  ok(isPdf(vc), 'vector CMYK PDF written');
  need(PIKEPDF, 'python3 + pikepdf', 'vector CMYK fill operators', () => {
  const py = sh("python3 -c \"import pikepdf,re,sys; pdf=pikepdf.open(sys.argv[1]); pg=pdf.pages[0]; cs=pg.Contents if isinstance(pg.Contents, pikepdf.Array) else [pg.Contents]; d=b' '.join(c.read_bytes() for c in cs); print(len(re.findall(rb'[0-9.]\\s+rg\\s',d)), len(re.findall(rb'[0-9.]\\s+k\\s',d)), len(re.findall(rb'[\\s]0 g\\s',d)))\" '" + vc + "'").trim();
  const [nrg, nk, ng] = py.split(' ').map(Number);
  ok(nrg === 0 && nk > 0 && ng > 0, 'vector CMYK PDF: ' + nrg + ' RGB fills, ' + nk + ' CMYK fills, ' + ng + ' black-plate-only fills');
  });
  need(POPPLER, 'poppler-utils', 'CMYK PDF fonts and text', () => {
  ok(/yes\s+yes/.test(sh('pdffonts "' + vc + '"')) && /Organisations|Organ/.test(sh('pdftotext "' + vc + '" -')), 'CMYK PDF keeps embedded fonts and live text');
  });
  });

  // ---- 15g. the page cannot write to a path the user did not choose
  const evil = lib.tmpPath('openpub-evil.txt'); fs.rmSync(evil, { force: true });
  const sneaky = await ev((p) => OP.desktop.saveFile({ name: 'asked.txt', path: p, bytes: new TextEncoder().encode('x') }), evil);
  ok(!fs.existsSync(evil) && /asked\.txt$/.test(sneaky.path), 'unapproved save path is ignored and goes through the Save dialog: ' + sneaky.path);

  // ---- 16. save project, reopen, everything persisted
  await ev(() => { OP.app.S.doc.name = 'RoundTrip'; OP.app.gotoPage(0); });
  ok(await ev(() => OP.app.saveProject()), 'project saved through the native save path');
  const proj = path.join(OUT, 'RoundTrip.opub');
  const before = await ev(() => { const d = OP.app.S.doc; return { pages: d.pages.length, masters: d.masters.length, links: d.pages.reduce((n, p) => n + p.items.filter(i => i.next).length, 0), wa: d.pages.reduce((n, p) => n + p.items.filter(i => i.wa).length, 0), adj: d.pages[0].items.filter(i => i.adj).length }; });
  ok(await ev(() => OP.app.S.filePath && /RoundTrip\.opub$/.test(OP.app.S.filePath) && !OP.app.S.dirty), 'file path remembered, document marked clean');
  await openFile(path.join(PUBS, 'Simple.pub'));
  await page.waitForFunction(() => document.querySelector('.dlg header') && /Simple/.test(document.querySelector('.dlg header').textContent), null, { timeout: 20000 });
  await page.click('.dlg .btn.primary');
  await openFile(proj);
  await page.waitForFunction(() => OP.app.S.doc.name === 'RoundTrip', null, { timeout: 20000 });
  const after = await ev(() => { const d = OP.app.S.doc; return { pages: d.pages.length, masters: d.masters.length, links: d.pages.reduce((n, p) => n + p.items.filter(i => i.next).length, 0), wa: d.pages.reduce((n, p) => n + p.items.filter(i => i.wa).length, 0), adj: d.pages[0].items.filter(i => i.adj).length }; });
  ok(JSON.stringify(before) === JSON.stringify(after), 'reopened project keeps pages, masters, links, WordArt, adjustments: ' + JSON.stringify(after));

  // ---- 17. table project round trip
  await openFile(path.join(PUBS, 'Sample.pub'));
  await page.waitForFunction(() => document.querySelector('.dlg header') && /Sample\.pub/.test(document.querySelector('.dlg header').textContent), null, { timeout: 20000 });
  await page.click('.dlg .btn.primary');
  const rt = await ev(() => { const d = OP.app.S.doc, j = JSON.parse(JSON.stringify(d)), n = OP.normaliseDoc(j); const t = n.pages[1].items.find(i => i.type === 'table'); return t ? OP.plainText(t.cells[2][1].text) : null; });
  ok(rt === 'Bottom Right', 'tables survive save/load normalisation: "' + rt + '"');

  // ---- 18. unsaved-changes prompt on close ("Don't save" answered by the stub)
  await ev(() => { OP.app.S.dirty = true; });
  ok(errors.length === 0, 'no script errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  const closed = new Promise(r => app.on('close', r));
  await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].close(); });
  const res = await Promise.race([closed.then(() => 'closed'), new Promise(r => setTimeout(() => r('timeout'), 8000))]);
  ok(res === 'closed', 'window closes after the unsaved-changes prompt');
  if (res !== 'closed') await app.evaluate(({ app }) => app.exit(0));
  console.log((failures ? failures + ' FAILED' : 'ALL PASSED') + (skipped ? ', ' + skipped + ' group(s) skipped' : ''));
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e.message.split('\n').slice(0, 12).join('\n')); process.exit(2); });
