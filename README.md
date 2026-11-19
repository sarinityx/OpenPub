# OpenPub

A desktop page-layout editor that opens Microsoft Publisher (`.pub`) files. Built because Microsoft retired Publisher in October 2026 and the notion of using Word and PowerPoint as alternatives is insane.


- Opens `.pub` files from Publisher 2002 to 2021 / Microsoft 365. Publisher 98 and 2000 files are rejected.
- Saves projects as `.opub`. It cannot save `.pub`.
- Exports PDF (vector, picture, CMYK), PNG, JPEG and SVG; prints through the system print dialog, with n-up, booklet and tiled poster layouts.
- Tables, linked text boxes, columns, text wrap, hyphenation, WordArt, master pages, mail merge, building blocks, templates, spell check (Australian English), plug-ins and content packs.

Website and download: <https://sarinityx.github.io/OpenPub/>. [Code signing policy](https://sarinityx.github.io/OpenPub/code-signing-policy.html) · [Privacy](https://sarinityx.github.io/OpenPub/privacy.html) · [FAQ](https://sarinityx.github.io/OpenPub/faq.html)

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

Output in `desktop/dist/`: the portable folder `OpenPub-win32-x64/`, its zip `OpenPub-<version>-win64.zip`, and the installer `OpenPub-<version>-win64-setup.exe` (built on Windows only; per user or per machine, silent with `/S /currentuser` or `/S /allusers`). Nothing is code-signed.

## Tests

```
npm run test:web        browser build, needs Google Chrome
npm run test:desktop    desktop app
npm run test:parser     renders every sample .pub to test-out/parser
node tools/smoke-packaged.js   checks the packaged app (after package:win)
npm run test:installer  Windows: installs, checks and uninstalls the built installer
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

## Website

The website lives in `site/` (plain HTML and CSS, no scripts or tracking) and is deployed to GitHub Pages by `.github/workflows/pages.yml` whenever it changes on `main` or a release is published.

```
npm run site:check        build into _site/ and check links, metadata and the sitemap
npm run site:screenshots  retake the screenshots in site/img/ from the desktop app (Windows)
```

The download button links the newest release's installer: the build reads the latest release from the GitHub API, because the installer's file name contains the version and GitHub's `releases/latest/download/` links need a fixed name.

## Optional: CMYK output

Vector CMYK PDF needs [Ghostscript](https://ghostscript.com), which is not included (AGPL licence). OpenPub uses it when it is installed.

## Licence

MIT, see [LICENSE](LICENSE). Electron and Chromium, the Australian English dictionary and the Apache POI sample files keep their own licences (listed in `desktop/README-win.txt` and `test-data/README.md`).
