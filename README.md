# OpenPub

A desktop page-layout editor that opens Microsoft Publisher (`.pub`) files. Built because Microsoft retires Publisher in October 2026.

- Opens `.pub` files from Publisher 2002 to 2021 / Microsoft 365. Publisher 98 and 2000 files are rejected.
- Saves projects as `.opub`. It cannot save `.pub`.
- Exports PDF (vector, picture, CMYK), PNG, JPEG and SVG; prints through the system print dialog, with n-up, booklet and tiled poster layouts.
- Tables, linked text boxes, columns, text wrap, hyphenation, WordArt, master pages, mail merge, building blocks, templates, spell check (Australian English), plug-ins and content packs.

Status, test coverage and known limits: [docs/STATUS.md](docs/STATUS.md).

## Run from source

Needs [Node.js](https://nodejs.org) 22.12 or later.

```
npm install
npm start
```

## Build the Windows app

```
npm run package:win
```

Output: `desktop/dist/OpenPub-win32-x64/OpenPub.exe` and `desktop/dist/OpenPub-<version>-win64.zip`. The app is portable (no installer) and unsigned.

## Tests

```
npm run test:web        browser build, needs Google Chrome
npm run test:desktop    desktop app
npm run test:parser     renders every sample .pub to test-out/parser
```

On Linux without a display, run the desktop tests under `xvfb-run -a`. Some PDF checks need poppler-utils, Python 3 with pikepdf, and Ghostscript; they are skipped when those are missing.

## Layout

| Path | Contents |
|---|---|
| `app/src` | Editor and `.pub` parser (plain JavaScript, bundled into one HTML file) |
| `desktop/appsrc` | Electron shell |
| `desktop/examples` | Sample plug-in and content pack, plug-in documentation |
| `tools` | Build, packaging and test scripts |
| `test-data` | Sample `.pub` files |
| `docs` | Status and third-party notices |

## Optional: CMYK output

Vector CMYK PDF needs [Ghostscript](https://ghostscript.com), which is not included (AGPL licence). OpenPub uses it when it is installed.
