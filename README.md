# OpenPub 1.1 – source

- `src/` – the editor and the .pub parser (plain JavaScript, no runtime dependencies). `tools/build.js` bundles it into one HTML file.
- `desktop/` – the Electron shell (`main.js`, `preload.js`, `pdfblack.js`), the Australian English dictionary and a pre-built `app/OpenPub.html`.
- `examples/` – sample plug-in, sample content pack and `PLUGINS.md`.
- `tools/` – build script and the test suites (paths inside them point at the original build machine; adjust before running).

## Module order (see `tools/build.js`)

util, cfb, model, geometry, wmf, emf, layout, hyph, flow, wrap, table, wordart, pub, pubconv, render, export,
app-core, app-input, app-text, app-panels, app-extra, app-print, app-ribbon, app-plugins, app-main

## Build the Windows app yourself (needs Node.js LTS)

Run in `desktop/`:

    npm install
    npm install --save-dev electron @electron/packager
    npx electron-packager . OpenPub --platform=win32 --arch=x64 --asar --out=dist --overwrite

The app appears in `desktop\dist\OpenPub-win32-x64\OpenPub.exe`.
These are the commands used to produce the supplied build (run on Linux; not re-run on Windows).

## Rebuild the bundled HTML after changing `src/`

`tools/build.js` expects the original folder layout (`app/src`, `desktop/appsrc`); adjust the paths at the top of the file to `../src` and `../desktop/app`.

## Third-party pieces

- Electron / Chromium (MIT and others; licence files ship in the app folder)
- nspell (MIT) and dictionary-en-au (see `desktop/dict/en-AU-LICENSE.txt`)
- British English hyphenation patterns from the TeX hyphenation collection, via hyphenation.en-gb
- Ghostscript is NOT included; the app uses a copy installed on the computer if there is one
