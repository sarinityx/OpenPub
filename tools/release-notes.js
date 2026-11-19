// Release notes for a draft release, from the "### <version>" section of docs/STATUS.md:
//   node tools/release-notes.js [version] [--rehearsal]  > notes.md
// Exits 1 if STATUS.md has no section for the version, or the section still says "in progress"
// (unless --rehearsal, which marks the notes as a rehearsal that must not be published).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SITE = 'https://sarinityx.github.io/OpenPub/';

function notes(version, rehearsal) {
  const status = fs.readFileSync(path.join(ROOT, 'docs', 'STATUS.md'), 'utf8').replace(/\r/g, '');
  const re = new RegExp('^### ' + version.replace(/\./g, '\\.') + '\\b(.*)$', 'm');
  const m = status.match(re);
  if (!m && !rehearsal) throw new Error('docs/STATUS.md has no "### ' + version + '" section');
  if (m && /in progress/i.test(m[1]) && !rehearsal) throw new Error('docs/STATUS.md still calls ' + version + ' "in progress"');
  let body = '';
  if (m) {
    const start = m.index + m[0].length, next = status.slice(start).search(/^#{2,3} /m);
    body = status.slice(start, next < 0 ? undefined : start + next).trim();
  }
  const signed = /^\s*publisherName\s*:/m.test(fs.readFileSync(path.join(ROOT, 'tools', 'package.mjs'), 'utf8'));
  return [
    rehearsal ? '> **Rehearsal of the release workflow. Do not publish this draft; delete it.**\n' : '',
    'Windows build of OpenPub ' + version + '.',
    '',
    '## Download',
    '',
    '- `OpenPub-' + version + '-win64-setup.exe`: the installer. Choose "Only for me" (no administrator rights needed) or "Anyone who uses this computer". Silent install: `/S /currentuser` or `/S /allusers`.',
    '- `OpenPub-' + version + '-win64.zip`: the portable version. Unzip anywhere and run `OpenPub.exe`.',
    '- `latest.yml` and the `.blockmap` are for OpenPub\'s update check; you don\'t need to download them.',
    '',
    signed
      ? 'The program and installer are signed: free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).'
      : 'This release is not code-signed, so Windows SmartScreen may warn the first time you run it: choose "More info", then "Run anyway".',
    'How releases are built and signed: [code signing policy](' + SITE + 'code-signing-policy.html). What OpenPub sends over the network: [privacy](' + SITE + 'privacy.html).',
    '',
    '## What\'s new',
    '',
    body || '(No section for this version in docs/STATUS.md yet.)',
    ''
  ].join('\n');
}
module.exports = { notes };

if (require.main === module) {
  const args = process.argv.slice(2), rehearsal = args.includes('--rehearsal');
  const version = args.find((a) => !a.startsWith('--')) || require(path.join(ROOT, 'desktop', 'appsrc', 'package.json')).version;
  try { process.stdout.write(notes(version, rehearsal)); } catch (e) { console.error(e.message); process.exit(1); }
}
