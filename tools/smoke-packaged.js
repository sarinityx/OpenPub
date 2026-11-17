// Launch the PACKAGED app (asar) and exercise the parts that depend on packaged paths.
const path = require('path'), lib = require('./lib');
// usage: node tools/smoke-packaged.js <path to packaged OpenPub executable> [file.pub]
(async () => {
  const app = await lib.launchPackaged(process.argv[2], [process.argv[3] || path.join(lib.PUBS, 'Sample.pub')]);
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForFunction(() => { const h = document.querySelector('.dlg header'); return !!h && /Imported/.test(h.textContent); }, null, { timeout: 30000 });
  console.log('opened from argv:', await page.locator('.dlg header').innerText());
  await page.click('.dlg .btn.primary');
  console.log('packaged:', await app.evaluate(({ app }) => app.isPackaged + ' ' + app.getName() + ' ' + app.getVersion()));
  console.log('ribbon tabs:', (await page.locator('.rb-tab').allInnerTexts()).join(' | '));
  console.log('spell (dictionary from asar):', JSON.stringify(await page.evaluate(() => OP.desktop.spellCheck(['recieve', 'colour', 'harbour']))));
  console.log('fonts in list:', await page.evaluate(() => new Promise(r => setTimeout(() => r(document.querySelectorAll('#fontlist option').length), 1500))));
  const cm = await page.evaluate(async () => { const d = OP.app.S.doc; const r = await OP.desktop.cmykPdf(OP.sheetsHtml(d, OP.sheetsPlain(d, [0], [-1], { bleed: false, marks: false }))); return r.error || (r.bytes.length + ' bytes, profile ' + r.profile + ', gs ' + r.version); });
  console.log('vector CMYK (pdfblack.js from asar + Ghostscript):', cm);
  console.log('internet requests:', await page.evaluate(() => performance.getEntriesByType('resource').filter(r => /^https?:/.test(r.name)).length));
  console.log('errors:', errors.length ? errors.join(' | ') : 'none');
  await app.evaluate(({ app }) => app.exit(0));
})().catch(e => { console.error('CRASH', e.message.split('\n').slice(0, 6).join('\n')); process.exit(1); });
