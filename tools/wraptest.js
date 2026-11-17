// Renders a wrap + hyphenation + justification scene from the built app and saves a PNG.
const path = require('path'), lib = require('./lib');
(async () => {
  const b = await lib.launchChrome();
  const p = await (await b.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.goto(lib.fileUrl(lib.WEB_APP)); await p.waitForSelector('#modal.open'); await p.keyboard.press('Escape');
  const res = await p.evaluate(() => {
    const A = OP.app, d = OP.newDoc(210 * OP.MM, 148 * OP.MM); A.loadDoc(d);
    const lorem = 'Typography is the arrangement of printed characters so that written language is legible, readable and appealing when displayed. Organisations everywhere produce newsletters, noticeboards and extraordinary programmes for their neighbourhood communities, and a publication deserves considered hyphenation and comfortable justification throughout. ';
    const mk = (x, hy) => { const t = OP.newTextBox(x, 20, 270, 380, [OP.newPara([OP.newRun(lorem + lorem + lorem, { size: 10.5, font: 'Georgia' })], { align: 'justify' })]); t.text.hyph = hy; t.stroke = { color: '#bbbbbb', width: 0.5, dash: 'solid' }; return t; };
    const a = mk(20, false), c = mk(305, true);
    const el = OP.newShape('ellipse', 180, 120, 110, 110); el.fill = { type: 'solid', color: '#d4249b' }; el.stroke = null; el.wrap = { mode: 'tight', dist: 6 };
    const sq = OP.newShape('rect', 470, 60, 90, 70); sq.fill = { type: 'solid', color: '#0a6c96' }; sq.stroke = null; sq.rot = 12; sq.wrap = { mode: 'square', dist: 5 };
    const st = OP.newShape('star5', 300, 250, 90, 90); st.fill = { type: 'solid', color: '#f3d21b' }; st.stroke = null; st.wrap = { mode: 'tight', dist: 4 };
    A.addItems([a, c, el, sq, st]); A.setSel([]);
    OP.reindex(d);
    const la = OP.textCols(d, a, null), lc = OP.textCols(d, c, null);
    const hy = l => l.cols[0].lay.lines.filter(x => x.segs.length && /-$/.test(x.segs[x.segs.length - 1].text)).length;
    const xs = l => l.cols[0].lay.lines.map(x => Math.round(x.x) + ':' + Math.round(x.width)).slice(6, 18).join(' ');
    return { linesA: la.cols[0].lay.lines.length, linesC: lc.cols[0].lay.lines.length, hyA: hy(la), hyC: hy(lc), xsA: xs(la), wrapA: !!OP.wrapProfile(d, a) };
  });
  console.log(JSON.stringify(res)); console.log('errors:', errs.join(' | ') || 'none');
  await p.waitForTimeout(400);
  const box = await p.locator('#stage').boundingBox();
  await p.screenshot({ path: path.join(lib.outDir('wrap'), 'wrap.png'), clip: box });
  await b.close();
})();
