// Builds the website (site/) into a folder ready for GitHub Pages.
//   node tools/build-site.js [--out _site] [--release release.json] [--offline] [--site-url URL]
// Pages in site/pages/ are HTML fragments with a front-matter comment; this adds the shared header and footer,
// metadata (title, description, canonical, Open Graph, JSON-LD), the licence page (LICENSE + docs/THIRD-PARTY.md),
// sitemap.xml and robots.txt.
//
// Download links: GitHub's /releases/latest/download/<name> link only works when the file name is the same in
// every release, and OpenPub's installer name contains the version. So the build reads the latest release from
// the GitHub API and links its actual files; the Pages workflow runs again whenever a release is published.
// Without network access (or with --offline) the links fall back to the latest-release page.
'use strict';
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const REPO = 'sarinityx/OpenPub';
const REPO_URL = 'https://github.com/' + REPO;

function arg(name, fallback) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; }
const OUT = path.resolve(arg('--out', path.join(ROOT, '_site')));
const SITE_URL = (arg('--site-url', process.env.SITE_URL || 'https://sarinityx.github.io/OpenPub/')).replace(/\/?$/, '/');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (iso) => { const d = new Date(iso); return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };

/** The release the download links point at: { version, date, installerUrl, zipUrl, size } */
async function latestRelease() {
  const file = arg('--release');
  let rel = null;
  if (file) rel = JSON.parse(fs.readFileSync(file, 'utf8'));
  else if (!process.argv.includes('--offline')) {
    try {
      const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'openpub-site-build' };
      if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
      const res = await fetch('https://api.github.com/repos/' + REPO + '/releases/latest', { headers });
      if (res.ok) rel = await res.json();
      else console.log('Latest release not available (HTTP ' + res.status + '): download links go to the releases page.');
    } catch (e) { console.log('Latest release not available (' + e.message + '): download links go to the releases page.'); }
  }
  const page = REPO_URL + '/releases/latest';
  if (!rel) return { version: require(path.join(ROOT, 'package.json')).version, date: null, installerUrl: page, zipUrl: page };
  const asset = (re) => (rel.assets || []).find((a) => re.test(a.name));
  const setup = asset(/-setup\.exe$/i), zip = asset(/\.zip$/i);
  return {
    version: String(rel.tag_name || '').replace(/^v/, ''),
    date: rel.published_at || null,
    installerUrl: setup ? setup.browser_download_url : (rel.html_url || page),
    zipUrl: zip ? zip.browser_download_url : (rel.html_url || page)
  };
}

/** Minimal Markdown for docs/THIRD-PARTY.md: headings, paragraphs, pipe tables, `code`, **bold**, [links](url). */
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, u) => '<a href="' + u + '">' + t + '</a>');
}
function markdown(md) {
  const out = [], lines = md.replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length;) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) { const n = Math.min(6, h[1].length + 1); out.push('<h' + n + '>' + inline(h[2]) + '</h' + n + '>'); i++; continue; }
    if (/^\|/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const body = rows.filter((r, k) => k !== 1 || !/^\|[\s:|-]+\|$/.test(r));
      out.push('<table><thead><tr>' + cells(body[0]).map((c) => '<th scope="col">' + inline(c) + '</th>').join('') + '</tr></thead><tbody>' +
        body.slice(1).map((r) => '<tr>' + cells(r).map((c) => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>');
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#|\|)/.test(lines[i])) para.push(lines[i++]);
    out.push('<p>' + inline(para.join(' ')) + '</p>');
  }
  return out.join('\n');
}

const NAV = [['home', '', 'Home'], ['faq', 'faq.html', 'FAQ'], ['privacy', 'privacy.html', 'Privacy'], ['signing', 'code-signing-policy.html', 'Code signing policy'], ['licence', 'licence.html', 'Licence']];

function layout(meta, body, rel, verification) {
  const url = SITE_URL + meta.path, image = SITE_URL + 'img/og.png';
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>' + esc(meta.title) + '</title>',
    '<meta name="description" content="' + esc(meta.description) + '">',
    meta.noindex ? '<meta name="robots" content="noindex">' : '<link rel="canonical" href="' + esc(url) + '">',
    meta.path === '404.html' ? '<base href="' + esc(SITE_URL) + '">' : '',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="OpenPub">',
    '<meta property="og:title" content="' + esc(meta.title) + '">',
    '<meta property="og:description" content="' + esc(meta.description) + '">',
    '<meta property="og:url" content="' + esc(url) + '">',
    '<meta property="og:image" content="' + esc(image) + '">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:image:alt" content="OpenPub: open and edit Microsoft Publisher files">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<link rel="icon" type="image/png" href="icon.png">',
    '<link rel="stylesheet" href="assets/style.css">'
  ];
  if (meta.path === '') {
    Object.keys(verification).forEach((k) => { if (verification[k]) head.push('<meta name="' + esc(k) + '" content="' + esc(verification[k]) + '">'); });
  }
  if (meta.jsonld === 'software') {
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'OpenPub',
      description: meta.description,
      url: SITE_URL,
      image: image,
      screenshot: SITE_URL + 'img/newsletter.png',
      applicationCategory: 'DesignApplication',
      operatingSystem: 'Windows 10, Windows 11',
      softwareVersion: rel.version,
      downloadUrl: rel.installerUrl,
      license: 'https://opensource.org/licenses/MIT',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'AUD' }
    };
    if (rel.date) ld.datePublished = rel.date.slice(0, 10);
    head.push('<script type="application/ld+json">' + JSON.stringify(ld, null, 2).replace(/</g, '\\u003c') + '</script>');
  }
  const nav = NAV.map(([id, href, label]) => '<li><a href="' + (href || './') + '"' + (meta.nav === id ? ' aria-current="page"' : '') + '>' + label + '</a></li>').join('');
  return '<!doctype html>\n<html lang="en-AU">\n<head>\n' + head.filter(Boolean).join('\n') + '\n</head>\n<body>\n' +
    '<a class="skip" href="#main">Skip to content</a>\n' +
    '<header class="site-head"><div class="wrap"><a class="brand" href="./"><img src="icon.png" width="32" height="32" alt=""><span>OpenPub</span></a>' +
    '<nav class="site-nav" aria-label="Main"><ul>' + nav + '<li><a href="' + REPO_URL + '">GitHub</a></li></ul></nav></div></header>\n' +
    '<main id="main">\n' + body.trim() + '\n</main>\n' +
    '<footer class="site-foot"><div class="wrap">' +
    '<ul><li><a href="licence.html">Licence and third-party notices</a></li><li><a href="privacy.html">Privacy</a></li><li><a href="code-signing-policy.html">Code signing policy</a></li><li><a href="' + REPO_URL + '">Source code</a></li></ul>' +
    '<p>OpenPub is free and open-source software under the MIT licence.</p>' +
    '<p>Microsoft Publisher is a trademark of Microsoft Corporation. OpenPub is not affiliated with, endorsed by or sponsored by Microsoft.</p>' +
    '</div></footer>\n</body>\n</html>\n';
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.isDirectory()) copyDir(path.join(from, e.name), path.join(to, e.name));
    else fs.copyFileSync(path.join(from, e.name), path.join(to, e.name));
  }
}

(async () => {
  const rel = await latestRelease();
  const vars = {
    version: rel.version,
    releaseDate: rel.date ? longDate(rel.date) : 'recently',
    installerUrl: rel.installerUrl,
    zipUrl: rel.zipUrl,
    releasesUrl: REPO_URL + '/releases',
    repoUrl: REPO_URL
  };
  const verification = JSON.parse(fs.readFileSync(path.join(SITE, 'verification.json'), 'utf8'));
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  copyDir(path.join(SITE, 'assets'), path.join(OUT, 'assets'));
  copyDir(path.join(SITE, 'img'), path.join(OUT, 'img'));
  fs.copyFileSync(path.join(ROOT, 'desktop', 'appsrc', 'icon.png'), path.join(OUT, 'icon.png'));
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

  const pages = fs.readdirSync(path.join(SITE, 'pages')).filter((f) => f.endsWith('.html')).map((f) => {
    const src = fs.readFileSync(path.join(SITE, 'pages', f), 'utf8');
    const m = src.match(/^<!--page\s+(\{[\s\S]*?\})\s*-->/);
    if (!m) throw new Error(f + ': missing the <!--page {...} --> front matter');
    return { meta: JSON.parse(m[1]), body: src.slice(m[0].length) };
  });
  // licence page from LICENSE and docs/THIRD-PARTY.md
  pages.push({
    meta: { path: 'licence.html', title: 'Licence and third-party notices – OpenPub', description: 'OpenPub is free and open-source software under the MIT licence. This page has the licence text and the licences of the third-party material it includes.', nav: 'licence' },
    body: '<div class="wrap page"><h1>Licence and third-party notices</h1>\n<h2 id="licence">OpenPub licence</h2>\n<pre class="licence-text">' +
      esc(fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8').trim()) + '</pre>\n<h2 id="third-party">Third-party notices</h2>\n' +
      markdown(fs.readFileSync(path.join(ROOT, 'docs', 'THIRD-PARTY.md'), 'utf8').replace(/^# .*\n/, '')) + '\n</div>'
  });

  for (const p of pages) {
    const body = p.body.replace(/\{\{(\w+)\}\}/g, (m, k) => { if (!(k in vars)) throw new Error(p.meta.path + ': unknown placeholder ' + m); return esc(vars[k]); });
    fs.writeFileSync(path.join(OUT, p.meta.path || 'index.html'), layout(p.meta, body, rel, verification));
  }
  const today = new Date().toISOString().slice(0, 10);
  const listed = pages.filter((p) => !p.meta.noindex).map((p) => p.meta.path);
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    listed.map((p) => '  <url><loc>' + esc(SITE_URL + p) + '</loc><lastmod>' + today + '</lastmod></url>').join('\n') + '\n</urlset>\n');
  fs.writeFileSync(path.join(OUT, 'robots.txt'), 'User-agent: *\nAllow: /\n\nSitemap: ' + SITE_URL + 'sitemap.xml\n');
  console.log('built ' + path.relative(ROOT, OUT) + ': ' + pages.length + ' pages, OpenPub ' + rel.version + ' (' + (rel.date ? 'from the latest release' : 'no release details') + ')');
})().catch((e) => { console.error(e.message); process.exit(1); });
