// Draws the Windows icons into desktop/build/ (committed; rerun only when the artwork changes):
//   icon.ico  the app (OpenPub.exe, shortcuts, installer)
//   opub.ico  an OpenPub project or Publisher file opened with OpenPub
// Each .ico holds 16–64 px as 32-bit bitmaps and 256 px as PNG. Needs Google Chrome (see tools/lib.js).
//   appx/     the Microsoft Store package's tiles and logos (tools/package.mjs --msix): the app artwork, and the
//             document artwork as the logo of the file types (opubfile.*). Sizes and names follow the MSIX asset rules:
//             targetsize-N for the taskbar, Start and File Explorer, altform-unplated without the tile colour behind.
const fs = require('fs'), path = require('path'), lib = require('./lib');

const OUT = path.join(lib.ROOT, 'desktop', 'build');
const SIZES = [16, 20, 24, 32, 40, 48, 64, 256];
const INK = '#1d1c19', PAPER = '#f7f5f0', BLUE = '#0a6c96', MAGENTA = '#d4249b', FOLD = '#e2ded3';

// 256-unit artwork drawn for a target size in pixels: the outline stays at least 1.5 px wide, and at 24 px and below
// there are fewer, thicker text lines so the icon stays legible.
function appSvg(px) {
  const small = px <= 24, sw = small ? 20 : Math.max(6, 384 / px), inset = 8 + sw / 2;
  const lines = small ? [118, 150, 182].map((y) => `<rect x="136" y="${y}" width="69" height="20"/>`) : [116, 140, 164, 188].map((y) => `<rect x="136" y="${y}" width="69" height="11"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
<rect x="${inset}" y="${inset}" width="${256 - 2 * inset - 2}" height="${256 - 2 * inset - 2}" rx="36" fill="${PAPER}" stroke="${INK}" stroke-width="${sw}"/>
<rect x="52" y="48" width="153" height="${small ? 52 : 49}" fill="${BLUE}"/>
<rect x="52" y="${small ? 118 : 112}" width="69" height="${small ? 84 : 97}" fill="${MAGENTA}"/>
<g fill="${INK}">${lines.join('')}</g></svg>`;
}
function docSvg(px) {
  const small = px <= 24, sw = small ? 18 : Math.max(8, 384 / px);
  const lines = small ? [128, 168].map((y) => `<rect x="132" y="${y}" width="58" height="22"/>`) : [124, 146, 168, 190].map((y) => `<rect x="132" y="${y}" width="56" height="10"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
<path d="M44 ${8 + sw / 2} H166 L${216 - sw / 2} ${58} V${248 - sw / 2} H44 Z" fill="${PAPER}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"/>
<path d="M166 ${8 + sw / 2} V58 H${216 - sw / 2} Z" fill="${FOLD}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"/>
<rect x="68" y="${small ? 74 : 76}" width="${small ? 122 : 120}" height="${small ? 36 : 32}" fill="${BLUE}"/>
<rect x="68" y="${small ? 128 : 124}" width="${small ? 50 : 52}" height="${small ? 90 : 96}" fill="${MAGENTA}"/>
<g fill="${INK}">${lines.join('')}</g></svg>`;
}

function bmpEntry(s, rgba) {
  const maskRow = Math.ceil(s / 32) * 4, head = Buffer.alloc(40), px = Buffer.alloc(s * s * 4), mask = Buffer.alloc(maskRow * s);
  head.writeUInt32LE(40, 0); head.writeInt32LE(s, 4); head.writeInt32LE(s * 2, 8); head.writeUInt16LE(1, 12); head.writeUInt16LE(32, 14);
  head.writeUInt32LE(px.length + mask.length, 20);
  for (let y = 0; y < s; y++) {
    const row = s - 1 - y; // bottom-up
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4, o = (row * s + x) * 4;
      px[o] = rgba[i + 2]; px[o + 1] = rgba[i + 1]; px[o + 2] = rgba[i]; px[o + 3] = rgba[i + 3];
      if (rgba[i + 3] === 0) mask[row * maskRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return Buffer.concat([head, px, mask]);
}
function ico(images) {
  const dir = Buffer.alloc(6 + 16 * images.length);
  dir.writeUInt16LE(1, 2); dir.writeUInt16LE(images.length, 4);
  let offset = dir.length;
  images.forEach((im, k) => {
    const e = 6 + 16 * k;
    dir[e] = im.s >= 256 ? 0 : im.s; dir[e + 1] = im.s >= 256 ? 0 : im.s;
    dir.writeUInt16LE(1, e + 4); dir.writeUInt16LE(32, e + 6);
    dir.writeUInt32LE(im.data.length, e + 8); dir.writeUInt32LE(offset, e + 12);
    offset += im.data.length;
  });
  return Buffer.concat([dir].concat(images.map((im) => im.data)));
}

(async () => {
  const browser = await lib.launchChrome();
  const page = await browser.newPage();
  async function render(svg, s) {
    return page.evaluate(async ({ svg, s }) => {
      const im = new Image(); im.src = 'data:image/svg+xml;base64,' + btoa(svg); await im.decode();
      const c = document.createElement('canvas'); c.width = c.height = s;
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, s, s);
      return { rgba: Array.from(x.getImageData(0, 0, s, s).data), png: c.toDataURL('image/png').split(',')[1] };
    }, { svg, s });
  }
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, art] of [['icon.ico', appSvg], ['opub.ico', docSvg]]) {
    const images = [];
    for (const s of SIZES) {
      const r = await render(art(s), s);
      images.push({ s, data: s >= 256 ? Buffer.from(r.png, 'base64') : bmpEntry(s, Uint8Array.from(r.rgba)) });
    }
    fs.writeFileSync(path.join(OUT, name), ico(images));
    console.log('wrote', path.relative(lib.ROOT, path.join(OUT, name)), SIZES.join(', ') + ' px');
  }
  // the Store package's assets: art drawn into a box of the given size, centred on a transparent w x h canvas
  async function png(svg, w, h, box) {
    return Buffer.from(await page.evaluate(async ({ svg, w, h, box }) => {
      const im = new Image(); im.src = 'data:image/svg+xml;base64,' + btoa(svg); await im.decode();
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(im, (w - box) / 2, (h - box) / 2, box, box);
      return c.toDataURL('image/png').split(',')[1];
    }, { svg, w, h, box }), 'base64');
  }
  const APPX = path.join(OUT, 'appx');
  fs.rmSync(APPX, { recursive: true, force: true }); fs.mkdirSync(APPX, { recursive: true });
  const assets = [['StoreLogo.png', appSvg, 50, 50, 50], ['Square44x44Logo.png', appSvg, 44, 44, 44],
    ['Square150x150Logo.png', appSvg, 150, 150, 96], ['Wide310x150Logo.png', appSvg, 310, 150, 96], ['opubfile.png', docSvg, 44, 44, 44]];
  for (const s of [16, 24, 32, 48, 256]) {
    assets.push(['Square44x44Logo.targetsize-' + s + '.png', appSvg, s, s, s], ['Square44x44Logo.targetsize-' + s + '_altform-unplated.png', appSvg, s, s, s],
      ['opubfile.targetsize-' + s + '.png', docSvg, s, s, s]);
  }
  for (const [name, art, w, h, box] of assets) fs.writeFileSync(path.join(APPX, name), await png(art(box), w, h, box));
  console.log('wrote', assets.length, 'files in', path.relative(lib.ROOT, APPX));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
