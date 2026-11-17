# Third-party material

| Item | Where | Licence / source |
|---|---|---|
| Electron | dev dependency; shipped inside the packaged app | MIT. The packaged app carries Electron's `LICENSE` and `LICENSES.chromium.html` |
| nspell | `desktop/appsrc` dependency (spell checker) | MIT |
| en-AU Hunspell dictionary | `desktop/appsrc/dict/` | From SCOWL via the `dictionary-en-au` npm package. Terms in `desktop/appsrc/dict/en-AU-LICENSE.txt` |
| British English hyphenation patterns | embedded in `app/src/hyph.js` | TeX hyphenation patterns as packaged in `hyphenation.en-gb`. Licence text not copied into this repository yet: check before any public release |
| Sample `.pub` files | `test-data/publisher/` | Apache POI test data, Apache License 2.0. See `test-data/README.md` |
| @electron/packager, playwright-core | dev dependencies only, not shipped | See each package |
| Ghostscript | not included; called if the user has installed it | AGPL. Do not bundle |

The repository itself has no licence file. `package.json` says `UNLICENSED` (all rights reserved). Choose a licence before making the repository public.
