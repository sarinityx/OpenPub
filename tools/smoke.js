// Smoke test: launch the desktop app with a .pub on the command line and report errors.
const path = require('path'), fs = require('fs');
const lib = require('./lib');
(async () => {
  const app = await lib.launchDesktop([process.argv[2] || path.join(lib.PUBS, 'Sample.pub')]);
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.waitForSelector('#modal.open', { timeout: 20000 });
  console.log('dialog:', await page.locator('.dlg header').innerText());
  console.log((await page.locator('.dlg .body').innerText()).slice(0, 400));
  console.log('desktop bridge:', await page.evaluate(() => !!OP.desktop && Object.keys(OP.desktop).join(',')));
  await page.click('.dlg .btn.primary');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(lib.outDir('smoke'), 'd01.png') });
  console.log('items p1:', await page.evaluate(() => OP.app.page().items.map(i => i.type + (i.wa ? ':wa' : '') + (i.next ? ':next' : '')).join(' ')).then(s => s.slice(0, 300)));
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await app.evaluate(({ app }) => { app.exit(0); });
})().catch(e => { console.error('CRASH', e.message); process.exit(1); });
