// Checks a built website (tools/build-site.js output). Used by tools/e2e.js and the Pages workflow.
//   node tools/site-check.js [_site]        exits 1 if a problem is found
// Every internal link and image resolves (anchors too), each page has one <h1>, a title, a description and alt
// text on every image, JSON-LD parses with the fields search engines need, the sitemap lists every indexable
// page, robots.txt points at it, and no retired product name is left.
'use strict';
const fs = require('fs'), path = require('path');

function check(dir) {
  const problems = [], pages = {};
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html'));
  for (const f of files) pages[f] = fs.readFileSync(path.join(dir, f), 'utf8');
  const ids = (html) => new Set(Array.from(html.matchAll(/\sid="([^"]+)"/g), (m) => m[1]));
  const siteUrl = ((pages['index.html'] || '').match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || '';

  for (const f of files) {
    const html = pages[f], where = (m) => problems.push(f + ': ' + m);
    if ((html.match(/<h1[\s>]/g) || []).length !== 1) where('needs exactly one <h1>');
    if (!/<title>[^<]{10,}<\/title>/.test(html)) where('missing or short <title>');
    const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
    if (desc.length < 50 || desc.length > 200) where('meta description should be 50-200 characters (' + desc.length + ')');
    if (!/<html lang="/.test(html)) where('missing lang on <html>');
    if (/\{\{\w+\}\}/.test(html)) where('unreplaced placeholder');
    if (/poster studio/i.test(html)) where('retired name "Poster Studio"');
    for (const m of html.matchAll(/<img\b[^>]*>/g)) {
      const alt = (m[0].match(/\salt="([^"]*)"/) || [])[1];
      if (alt === undefined) where('image without alt: ' + m[0].slice(0, 80));
      else if (!alt && !/class="[^"]*"|width="32"/.test(m[0])) where('empty alt on a content image: ' + m[0].slice(0, 80));
    }
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      let ld = null;
      try { ld = JSON.parse(m[1]); } catch (e) { where('JSON-LD does not parse: ' + e.message); continue; }
      if (ld['@type'] === 'SoftwareApplication') {
        for (const k of ['name', 'operatingSystem', 'applicationCategory', 'softwareVersion', 'downloadUrl']) if (!ld[k]) where('JSON-LD is missing ' + k);
        if (!ld.offers || ld.offers.price !== '0' || !ld.offers.priceCurrency) where('JSON-LD offers must give price 0 and a currency');
        if (ld.aggregateRating || ld.review) where('JSON-LD must not contain ratings or reviews');
      }
    }
    // internal links and images
    for (const m of html.matchAll(/\s(href|src)="([^"]+)"/g)) {
      let u = m[2];
      if (/^(mailto:|#$)/.test(u)) continue;
      if (siteUrl && u.startsWith(siteUrl)) u = u.slice(siteUrl.length) || './';
      if (/^[a-z]+:/i.test(u)) continue; // external
      const [file, anchor] = u.split('#');
      const target = file === '' ? f : file === './' ? 'index.html' : file.replace(/^\.\//, '');
      if (!fs.existsSync(path.join(dir, target))) { where('broken link: ' + m[2]); continue; }
      if (anchor && target.endsWith('.html') && !ids(pages[target] || '').has(anchor)) where('missing anchor: ' + m[2]);
    }
  }
  // sitemap and robots
  const sitemap = fs.existsSync(path.join(dir, 'sitemap.xml')) ? fs.readFileSync(path.join(dir, 'sitemap.xml'), 'utf8') : '';
  if (!sitemap) problems.push('sitemap.xml missing');
  const listed = new Set(Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (m) => m[1].replace(siteUrl, '') || 'index.html'));
  for (const f of files) {
    const noindex = /<meta name="robots" content="noindex">/.test(pages[f]);
    if (!noindex && !listed.has(f)) problems.push('sitemap.xml does not list ' + f);
    if (noindex && listed.has(f)) problems.push('sitemap.xml lists ' + f + ', which is noindex');
  }
  for (const l of listed) if (!files.includes(l)) problems.push('sitemap.xml lists a missing page: ' + l);
  const robots = fs.existsSync(path.join(dir, 'robots.txt')) ? fs.readFileSync(path.join(dir, 'robots.txt'), 'utf8') : '';
  if (!/Sitemap: \S+sitemap\.xml/.test(robots)) problems.push('robots.txt does not point at the sitemap');
  return { pages: files.length, listed: listed.size, problems };
}
module.exports = { check };

if (require.main === module) {
  const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', '_site'));
  const r = check(dir);
  r.problems.forEach((p) => console.log('PROBLEM ' + p));
  console.log(r.problems.length ? r.problems.length + ' problem(s)' : 'site OK: ' + r.pages + ' pages, ' + r.listed + ' in the sitemap');
  process.exit(r.problems.length ? 1 : 0);
}
