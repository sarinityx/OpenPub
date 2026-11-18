# OpenPub

Desktop page-layout editor (Electron, Windows first) that opens Microsoft Publisher `.pub` files. Replacement for Publisher, which Microsoft retires in October 2026. Current version: 1.2.1.

## Commands

| Task | Command |
|---|---|
| Install (also installs `desktop/appsrc` dependencies) | `npm install` |
| Build the single-file editor | `npm run build` |
| Run the desktop app from source | `npm start` |
| Browser tests (103 checks, needs Google Chrome) | `npm run test:web` |
| Desktop tests (83 checks) | `npm run test:desktop` |
| Render every sample `.pub` to PNG (`test-out/parser`) | `npm run test:parser` |
| Package Windows build, zip and installer into `desktop/dist` | `npm run package:win` |
| Packaged app smoke test (after `package:win`) | `node tools/smoke-packaged.js` |
| Installer test (Windows; installs, checks, uninstalls) | `npm run test:installer` |

- Node 22.12 or later (the packager requires it).
- Linux without a display: prefix desktop tests with `xvfb-run -a`.
- Chrome not found: set `CHROME_PATH` to the Chrome executable.
- Desktop tests print `SKIP` for checks that need tools that are not installed: poppler-utils (`pdfinfo`, `pdffonts`, `pdftotext`, `pdfimages`), Python 3 with `pikepdf`, Ghostscript (on PATH, or on Windows in `Program Files\gs`). With all of them: 83 checks, 0 skipped.
- Windows: the tests call `python3` by name, which the python.org installer does not provide. Use the Microsoft Store Python (`winget install 9PNRBTZXMB4Z`), then `python3 -m pip install pikepdf`. poppler: `winget install oschwartz10612.Poppler`.
- Git for Windows ships xpdf's `pdftotext`/`pdfinfo` in `ucrt64/bin`, which Git Bash puts ahead of poppler on PATH. xpdf orders text differently and breaks the PDF text checks, so the desktop tests move poppler's folder to the front themselves (`preferPoppler` in `tools/lib.js`) and skip the PDF checks if only xpdf is installed.
- The font drop-down checks pick from whatever fonts are installed; no particular font is needed.
- Set `OPENPUB_REQUIRE_ALL=1` to make the desktop tests fail instead of skipping when a tool is missing. CI does.
- CI: `.github/workflows/windows.yml` runs the web, desktop and parser tests on `windows-latest` for pushes to `main` and pull requests, with every tool installed, then packages, runs the packaged smoke test, builds the installer and runs the installer test (per user and per machine). `test-out/` and the installer are uploaded as artifacts.
- Workflow actions are pinned to full commit SHAs with the version in a comment (`@<sha> # v7.0.1`); Dependabot (`.github/dependabot.yml`) proposes updates. Downloads in CI (poppler, Ghostscript) are checked against their published SHA-256.
- The installer test refuses to run if OpenPub is already installed (it uninstalls as part of the test). Without administrator rights it skips the per-machine half.
- Always run `npm run build` before testing by hand; the tests load the built file, not `app/src`.

## Layout

- `app/src/` – editor and `.pub` parser. Plain JavaScript, no framework, no bundler. Every module adds to the global `OP`; app state is `OP.app`.
- `app/src/index.template.html` – page shell and all CSS. `tools/build.js` inlines the modules at `/*__SCRIPTS__*/`.
- `desktop/appsrc/` – Electron shell: `main.js`, `preload.js` (bridge `window.openpubDesktop`, seen by the editor as `OP.desktop`), `pdfblack.js`, `dict/` (en-AU spelling).
- `desktop/examples/` – sample plug-in, sample content pack, `PLUGINS.md` (plug-in API reference). Shipped with the app.
- `desktop/build/` – Windows icons (`icon.ico`, `opub.ico`, drawn by `tools/make-icons.js`) and `installer.nsh` (file types and the keep-settings question for the electron-builder NSIS installer).
- `tools/` – build, packaging and test scripts. `tools/lib.js` holds all paths and launch helpers. `tools/debug/` has parser dump scripts.
- `test-data/publisher/` – sample `.pub` files from Apache POI.
- `docs/STATUS.md` – what is built, what is tested, known limits, backlog.
- Generated, not committed: `app/dist/`, `desktop/appsrc/app/`, `desktop/dist/`, `test-out/`.

## Architecture rules

- Module order is fixed in `tools/build.js` (`ORDER`). A new module must be added there.
  `util, cfb, model, geometry, wmf, emf, layout, hyph, flow, wrap, table, wordart, pub, pubconv, render, export, app-core, app-input, app-text, app-panels, app-extra, app-print, app-ribbon, app-plugins, app-main, app-check`
  `app-check` comes last because it wraps the export and print dialogs defined in `app-main`.
- A new item type or item field must be handled in four places: model normalisation (`normItem` / `normText` in `model.js`), canvas renderer (`render.js`), SVG exporter (`OP.pageToSvg` in `export.js`) and the undo snapshot (`app-core.js`). Missing one gives a feature that draws but does not export, or is lost on undo or reload.
- Geometry is in points everywhere. The UI shows millimetres (`OP.MM`).
- The editor must keep working as a plain web page: guard desktop-only features with `if (OP.desktop)`.
- The desktop app makes no network requests. `tools/build.js` strips the web-font links from the desktop copy; do not add remote resources.
- Electron security: `contextIsolation` and `sandbox` stay on. New native features go through `preload.js` → `ipcMain` handlers. `file:save` only writes to a path the user chose in a dialog this session (`knownPaths` in `main.js`); keep that.
- No `</script` inside any module (the build rejects it).
- `.pub` is read-only: the format is undocumented, so there is no `.pub` writer. Projects save as `.opub` (JSON).
- Ghostscript is AGPL: detect and call an installed copy, never bundle it.
- The app ID `org.openpub.desktop` (in `tools/package.mjs` and `main.js`) must never change: the installer's GUID, upgrades and the taskbar grouping depend on it.

## Conventions

- UI text: Australian English, sentence case, plain words.
- Version number lives in four places; change all of them for a release: `package.json`, `desktop/appsrc/package.json`, `OP.VERSION` in `app/src/app-plugins.js`, first line of `desktop/README-win.txt`.
- Add or extend a check in `tools/e2e-desktop.js` (desktop features) or `tools/e2e.js` (editor features) with every feature or fix. Native dialogs are stubbed at the top of `e2e-desktop.js`.
- The tests pass on Linux and on Windows 11. Shell commands in test scripts must work in both `cmd.exe` and POSIX shells: quote paths with double quotes, not single quotes.
