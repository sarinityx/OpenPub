// Checks the files a release publishes, before they are uploaded:
//   node tools/release-files.js [desktop/dist]        exits 1 on a problem
// OpenPub-<version>-win64-setup.exe, its .blockmap, latest.yml and OpenPub-<version>-win64.zip must all be there for
// the version in desktop/appsrc/package.json, and latest.yml must give the installer's real SHA-512 and size:
// electron-updater refuses a download whose SHA-512 differs from latest.yml.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

/** The fields of electron-builder's latest.yml that matter here (it is simple YAML: scalars and one list). */
function readLatestYml(text) {
  const out = { files: [] };
  let item = null;
  for (const line of text.replace(/\r/g, '').split('\n')) {
    let m = line.match(/^\s+-\s+(\w+):\s*(.*)$/);
    if (m) { item = {}; out.files.push(item); item[m[1]] = unquote(m[2]); continue; }
    m = line.match(/^\s{2,}(\w+):\s*(.*)$/);
    if (m && item) { item[m[1]] = unquote(m[2]); continue; }
    m = line.match(/^(\w+):\s*(.*)$/);
    if (m) { item = null; if (m[2] !== '') out[m[1]] = unquote(m[2]); }
  }
  return out;
}
function unquote(v) { v = v.trim(); return /^'.*'$|^".*"$/.test(v) ? v.slice(1, -1) : v; }
function sha512(file) { return crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64'); }

function verify(dir, version) {
  version = version || require(path.join(__dirname, '..', 'desktop', 'appsrc', 'package.json')).version;
  const problems = [], need = (f) => { const p = path.join(dir, f); if (!fs.existsSync(p) || !fs.statSync(p).size) problems.push('missing or empty: ' + f); return p; };
  const installer = 'OpenPub-' + version + '-win64-setup.exe';
  const files = [installer, installer + '.blockmap', 'latest.yml', 'OpenPub-' + version + '-win64.zip'];
  files.forEach(need);
  if (problems.length) return { problems, files };
  const y = readLatestYml(fs.readFileSync(path.join(dir, 'latest.yml'), 'utf8'));
  const real = { sha512: sha512(path.join(dir, installer)), size: fs.statSync(path.join(dir, installer)).size };
  if (y.version !== version) problems.push('latest.yml version ' + y.version + ', expected ' + version);
  if (y.path !== installer) problems.push('latest.yml path ' + y.path + ', expected ' + installer);
  if (y.sha512 !== real.sha512) problems.push('latest.yml sha512 does not match the installer');
  const f = y.files.find((x) => x.url === installer);
  if (!f) problems.push('latest.yml files list does not name ' + installer);
  else {
    if (f.sha512 !== real.sha512) problems.push('latest.yml files[].sha512 does not match the installer');
    if (+f.size !== real.size) problems.push('latest.yml files[].size ' + f.size + ', installer is ' + real.size + ' bytes');
  }
  return { problems, files, sha512: real.sha512, size: real.size };
}
module.exports = { verify, readLatestYml };

if (require.main === module) {
  const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'desktop', 'dist'));
  const r = verify(dir, process.argv[3]);
  r.problems.forEach((p) => console.log('PROBLEM ' + p));
  if (!r.problems.length) console.log('release files OK: ' + r.files.join(', ') + '; installer ' + r.size + ' bytes, SHA-512 matches latest.yml');
  process.exit(r.problems.length ? 1 : 0);
}
