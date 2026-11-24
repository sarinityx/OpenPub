// After SignPath has signed the installer (release.yml, signing jobs): the signature changes the installer's bytes,
// so its .blockmap and the SHA-512 and size in latest.yml are made again from the signed file, then checked.
//   node tools/release-signed.js DIR [version]        exits 1 on a problem
// DIR holds OpenPub-<version>-win64-setup.exe (signed) and the latest.yml built with the unsigned one.
'use strict';
const fs = require('fs'), path = require('path');
const { verify, readLatestYml } = require('./release-files');

async function refresh(dir, version) {
  version = version || require(path.join(__dirname, '..', 'desktop', 'appsrc', 'package.json')).version;
  const installer = path.join(dir, 'OpenPub-' + version + '-win64-setup.exe'), ymlFile = path.join(dir, 'latest.yml');
  for (const f of [installer, ymlFile]) if (!fs.existsSync(f)) throw new Error('missing: ' + f);
  const text = fs.readFileSync(ymlFile, 'utf8'), old = readLatestYml(text);
  if (!old.sha512) throw new Error('latest.yml has no sha512');
  // the same block map electron-builder writes for this installer (differentialPackage: true, no stored regions)
  const { buildBlockMap } = require('app-builder-lib/out/targets/blockmap/blockmap');
  const info = await buildBlockMap(installer, 'gzip', installer + '.blockmap');
  // only the hash and size change; every other line (version, path, releaseDate) is kept as electron-builder wrote it
  const lines = text.replace(/\r/g, '').split('\n').map((l) => {
    if (/^\s*sha512:/.test(l)) return l.replace(/sha512:.*$/, 'sha512: ' + info.sha512);
    if (/^\s+size:\s*\d+\s*$/.test(l)) return l.replace(/\d+\s*$/, String(info.size));
    return l;
  });
  fs.writeFileSync(ymlFile, lines.join('\n'));
  return Object.assign(verify(dir, version), { before: old.sha512 });
}
module.exports = { refresh };

if (require.main === module) {
  refresh(path.resolve(process.argv[2] || '.'), process.argv[3]).then((r) => {
    r.problems.forEach((p) => console.log('PROBLEM ' + p));
    if (!r.problems.length) console.log('signed installer: new .blockmap; latest.yml now gives SHA-512 ' + r.sha512 + ' and ' + r.size + ' bytes' + (r.before === r.sha512 ? ' (UNCHANGED: was the installer signed?)' : ''));
    process.exit(r.problems.length || r.before === r.sha512 ? 1 : 0);
  }, (e) => { console.error(e.message); process.exit(1); });
}
