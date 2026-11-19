// Screenshots for the website (site/img/), taken from the desktop app at a fixed window size so they can be
// regenerated for each release:   npm run site:screenshots   (Windows, after npm run build)
//   newsletter.png    SampleNewsletter.pub opened
//   check.png         the design checker's results for it
//   print-preview.png Print layouts previewing a booklet sheet
//   og.png            1200 x 630 social-media card (Open Graph image)
'use strict';
const path = require('path'), fs = require('fs'), lib = require('./lib');
const OUT = path.join(lib.ROOT, 'site', 'img');
const W = 1440, H = 900;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const app = await lib.launchDesktop([path.join(lib.PUBS, 'SampleNewsletter.pub')]);
  await app.evaluate(({ BrowserWindow }, s) => { const w = BrowserWindow.getAllWindows()[0]; w.setContentSize(s.W, s.H); w.center(); }, { W, H });
  const page = await app.firstWindow();
  await page.waitForFunction(() => { const h = document.querySelector('.dlg header'); return !!h && /Imported/.test(h.textContent); }, null, { timeout: 30000 });
  await page.click('.dlg .btn.primary');
  await page.evaluate(() => { const A = OP.app; A.setTheme('light'); A.S.dirty = false; A.fit(); A.zoomLabel(); A.showTab('props'); });
  await page.waitForTimeout(1500); // pictures and fonts
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('wrote site/img/' + name); };

  await shot('newsletter.png');

  await page.evaluate(() => { const A = OP.app; A.checkDesign(); A.showTab('check'); });
  await page.waitForTimeout(500);
  await shot('check.png');

  await page.evaluate(() => { OP.app.showTab('props'); OP.app.dlgSheets('print'); });
  await page.selectOption('#shLay', 'book');
  await page.waitForTimeout(1200);
  await shot('print-preview.png');
  await page.keyboard.press('Escape');

  // social card: the app screenshot beside the name and tagline
  const shotB64 = fs.readFileSync(path.join(OUT, 'newsletter.png')).toString('base64');
  const icon = fs.readFileSync(path.join(lib.ROOT, 'desktop', 'appsrc', 'icon.png')).toString('base64');
  await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].setContentSize(1200, 630); });
  await page.setContent('<!doctype html><html><body style="margin:0;width:1200px;height:630px;overflow:hidden;font-family:\'Segoe UI\',sans-serif;background:#f7f5f0;color:#1d1c19">' +
    '<div style="position:absolute;left:64px;top:64px;width:500px">' +
    '<div style="display:flex;align-items:center;gap:18px"><img src="data:image/png;base64,' + icon + '" width="84" height="84"><span style="font-size:64px;font-weight:700">OpenPub</span></div>' +
    '<p style="font-size:38px;line-height:1.2;margin:38px 0 0;font-weight:600">Open and edit Microsoft Publisher files</p>' +
    '<p style="font-size:26px;line-height:1.35;margin:22px 0 0;color:#4a4740">Free and open source for Windows. Works offline. Export PDF.</p></div>' +
    '<img src="data:image/png;base64,' + shotB64 + '" style="position:absolute;left:610px;top:90px;width:760px;border-radius:10px;box-shadow:0 8px 40px rgba(0,0,0,.25)">' +
    '<div style="position:absolute;left:0;right:0;bottom:0;height:14px;background:linear-gradient(90deg,#0a6c96 0 60%,#d4249b 60% 100%)"></div>' +
    '</body></html>');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'og.png'), clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log('wrote site/img/og.png');
  await app.evaluate(({ app }) => app.exit(0));
})().catch((e) => { console.error(e); process.exit(1); });
