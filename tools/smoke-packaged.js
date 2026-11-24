// Launch the PACKAGED app (asar) and check the parts that depend on packaged paths. Exits 1 if one fails.
// usage: node tools/smoke-packaged.js [path to packaged OpenPub executable] [file.pub]
//   default executable: desktop/dist/OpenPub-win32-x64/OpenPub.exe (npm run package:win)
const path = require('path'), fs = require('fs'), lib = require('./lib');
let failures = 0;
function ok(c, m) { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failures++; }
const exe = process.argv[2] || path.join(lib.ROOT, 'desktop', 'dist', 'OpenPub-win32-x64', 'OpenPub.exe');
(async () => {
  if (!fs.existsSync(exe)) { ok(false, 'packaged app not found: ' + exe + ' (run npm run package:win first)'); process.exit(1); }
  if (process.platform === 'win32') {
    // Windows titles the print dialog "<FileDescription> - Print" (a source run shows "Electron - Print")
    const desc = require('child_process').spawnSync('powershell.exe', ['-NoProfile', '-Command', '(Get-Item -LiteralPath "' + exe + '").VersionInfo.FileDescription'], { encoding: 'utf8' }).stdout.trim();
    ok(desc === 'OpenPub', 'OpenPub.exe describes itself as "' + desc + '", so the print dialog is titled "' + desc + ' - Print"');
  }
  const app = await lib.launchPackaged(exe, [process.argv[3] || path.join(lib.PUBS, 'Sample.pub')]);
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const head = await page.waitForFunction(() => { const h = document.querySelector('.dlg header'); return h && /Imported/.test(h.textContent) ? h.textContent : null; }, null, { timeout: 30000 }).then(h => h.jsonValue()).catch(() => null);
  ok(!!head, 'file from the command line: ' + head);
  if (head) await page.click('.dlg .btn.primary');
  const info = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, name: app.getName(), version: app.getVersion() }));
  ok(info.packaged && info.name === 'OpenPub' && info.version === require(path.join(lib.ROOT, 'desktop', 'appsrc', 'package.json')).version, 'packaged: ' + JSON.stringify(info));
  const tabs = await page.locator('.rb-tab').allInnerTexts();
  ok(tabs.length === 8, 'ribbon tabs: ' + tabs.join(' | '));
  const spell = await page.evaluate(() => OP.desktop.spellCheck(['recieve', 'colour', 'harbour']));
  ok(JSON.stringify(spell) === JSON.stringify(['recieve']), 'spelling dictionary from the asar: ' + JSON.stringify(spell));
  const fonts = await page.evaluate(() => new Promise(r => setTimeout(() => r({ list: document.querySelectorAll('#fontlist option').length, installed: OP.app.installedFonts().length }), 1500)));
  // the list also holds a few common Windows names and the open document's fonts, so it can be a little longer than the installed count
  ok(fonts.list > 25 && fonts.installed > 25, 'installed fonts loaded: ' + fonts.list + ' in the font list, ' + fonts.installed + ' installed names and faces');
  const cm = await page.evaluate(async () => { const d = OP.app.S.doc; const r = await OP.desktop.cmykPdf(OP.sheetsHtml(d, OP.sheetsPlain(d, [0], [-1], { bleed: false, marks: false }))); return r.error ? { error: r.error } : { bytes: r.bytes.length, profile: r.profile, gs: r.version }; });
  if (process.env.OPENPUB_REQUIRE_ALL || !cm.error || !/Ghostscript/i.test(cm.error)) ok(!cm.error && cm.bytes > 1000, 'vector CMYK (pdfblack.js from the asar + Ghostscript): ' + JSON.stringify(cm));
  else console.log('SKIP vector CMYK (Ghostscript not installed): ' + cm.error);
  // the packaged folder (no uninstaller beside the exe) is the portable copy: it asks before any update check
  const upd = await page.evaluate(() => OP.desktop.update.state());
  const asked = await page.evaluate(() => { const n = document.getElementById('updnote'); return !!n && !n.hidden && /Check for updates automatically/.test(n.textContent); });
  ok(upd.mode === 'portable' && upd.ask === true && upd.auto === null && asked, 'update checks: portable copy, asks first, no check made (' + JSON.stringify({ mode: upd.mode, ask: upd.ask, auto: upd.auto }) + ')');
  const net = await page.evaluate(() => performance.getEntriesByType('resource').filter(r => /^https?:/.test(r.name)).map(r => r.name));
  ok(net.length === 0, 'no internet requests' + (net.length ? ': ' + net.join(', ') : ''));
  ok(errors.length === 0, 'no script errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await app.evaluate(({ app }) => app.exit(0));
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('CRASH', e.message.split('\n').slice(0, 6).join('\n')); process.exit(1); });
