// Release notes for a draft release, from the "### <version>" section of docs/STATUS.md:
//   node tools/release-notes.js [version] [--rehearsal]  > notes.md
// Exits 1 if STATUS.md has no section for the version, or the section still says "in progress"
// (unless --rehearsal, which marks the notes as a rehearsal that must not be published).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SITE = 'https://sarinityx.github.io/OpenPub/';

function notes(version, rehearsal) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('version must look like 1.2.3, not "' + version + '"');
  const lines = fs.readFileSync(path.join(ROOT, 'docs', 'STATUS.md'), 'utf8').replace(/\r/g, '').split('\n');
  // the "### <version>" heading, matched as plain text (optionally followed by a note such as "(in progress)")
  const head = '### ' + version, at = lines.findIndex((l) => l === head || l.startsWith(head + ' '));
  if (at < 0 && !rehearsal) throw new Error('docs/STATUS.md has no "' + head + '" section');
  if (at >= 0 && /in progress/i.test(lines[at].slice(head.length)) && !rehearsal) throw new Error('docs/STATUS.md still calls ' + version + ' "in progress"');
  let body = '';
  if (at >= 0) {
    let end = lines.findIndex((l, i) => i > at && /^#{2,3} /.test(l));
    if (end < 0) end = lines.length;
    body = lines.slice(at + 1, end).join('\n').trim();
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
