# Third-party material

OpenPub itself is under the MIT licence (`LICENSE`). It includes or uses the following.

| Item | Where | Licence / source |
|---|---|---|
| Electron (includes Chromium) | shipped inside the packaged app | MIT. The packaged app carries Electron's `LICENSE` and `LICENSES.chromium.html`, which lists Chromium's components and their licences |
| nspell | `desktop/appsrc` dependency (spelling checker), shipped | MIT. Its licence file ships inside the app (`resources\app.asar`, `node_modules/nspell`) |
| Australian English Hunspell dictionary | `desktop/appsrc/dict/`, shipped | From SCOWL via the `dictionary-en-au` npm package. Terms in `desktop/appsrc/dict/en-AU-LICENSE.txt`, which ships inside the app |
| British English hyphenation patterns | embedded in `app/src/hyph.js`, shipped | From the TeX hyph-utf8 collection (`hyph-en-gb.tex`), as packaged in `hyphenation.en-gb` by Bram Stein. Copyright (C) 1992, 1996, 2005, 2016 Dominik Wujastyk, Graham Toal. MIT; the notice is in the file's header comment |
| Sample `.pub` files | `test-data/publisher/`, tests only, not shipped | Apache POI test data, Apache License 2.0. See `test-data/README.md` |
| @electron/packager, electron-builder, playwright-core | development dependencies, not shipped | See each package (all MIT). The installer is built with NSIS (zlib/libpng licence) and electron-builder's NSIS scripts (MIT) |
| Ghostscript | not included; called if the user has installed it | AGPL. Never bundled |
