// resources/app-update.yml: where electron-updater (desktop/appsrc/updater.js) looks for new versions. Written by
// tools/package.mjs, because electron-builder skips it for a prepackaged folder; also used by the tests.
//
// publisher: the subject of the certificate the releases are signed with, as a full distinguished name
// ("CN=..., O=..., C=..."). With it, electron-updater installs an update only if Windows says the installer's
// signature is valid AND the signer's subject has every one of these values. Without it (unsigned releases up to the
// first signed one), signatures are not checked. Once a release has it, every later release must be signed.
'use strict';

function updateConfigYml(publisher) {
  const lines = ['owner: sarinityx', 'repo: OpenPub', 'provider: github', 'updaterCacheDirName: openpub-updater'];
  // a JSON string is a valid YAML double-quoted string
  if (publisher) lines.push('publisherName:', '  - ' + JSON.stringify(String(publisher)));
  return lines.join('\n') + '\n';
}

module.exports = { updateConfigYml };
