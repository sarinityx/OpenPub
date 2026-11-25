# OpenPub

Desktop page-layout editor (Electron, Windows first) that opens Microsoft Publisher `.pub` files. Replacement for Publisher, which Microsoft retires in October 2026. Current version: 1.2.1.

## Commands

| Task | Command |
|---|---|
| Install (also installs `desktop/appsrc` dependencies) | `npm install` |
| Build the single-file editor | `npm run build` |
| Run the desktop app from source | `npm start` |
| Browser tests (107 checks, needs Google Chrome) | `npm run test:web` |
| Desktop tests (103 checks) | `npm run test:desktop` |
| Render every sample `.pub` to PNG (`test-out/parser`) | `npm run test:parser` |
| Package Windows build, zip and installer into `desktop/dist` | `npm run package:win` |
| Packaged app smoke test (after `package:win`) | `node tools/smoke-packaged.js` |
| Installer test (Windows; installs, checks, uninstalls) | `npm run test:installer` |
| Store package test (Windows, administrator; test-signs, installs, checks, uninstalls the MSIX) | `npm run test:msix` |
| Build and check the website into `_site/` | `npm run site:check` |
| Retake the website screenshots (Windows, desktop app) | `npm run site:screenshots` |

- Node 22.12 or later (the packager requires it).
- Linux without a display: prefix desktop tests with `xvfb-run -a`.
- Chrome not found: set `CHROME_PATH` to the Chrome executable.
- Desktop tests print `SKIP` for checks that need tools that are not installed: poppler-utils (`pdfinfo`, `pdffonts`, `pdftotext`, `pdfimages`), Python 3 with `pikepdf`, Ghostscript (on PATH, or on Windows in `Program Files\gs`). With all of them: 103 checks, 0 skipped.
- Windows: the tests call `python3` by name, which the python.org installer does not provide. Use the Microsoft Store Python (`winget install 9PNRBTZXMB4Z`), then `python3 -m pip install pikepdf`. poppler: `winget install oschwartz10612.Poppler`.
- Git for Windows ships xpdf's `pdftotext`/`pdfinfo` in `ucrt64/bin`, which Git Bash puts ahead of poppler on PATH. xpdf orders text differently and breaks the PDF text checks, so the desktop tests move poppler's folder to the front themselves (`preferPoppler` in `tools/lib.js`) and skip the PDF checks if only xpdf is installed.
- The font drop-down checks pick from whatever fonts are installed; no particular font is needed.
- Set `OPENPUB_REQUIRE_ALL=1` to make the desktop tests fail instead of skipping when a tool is missing. CI does.
- CI: `.github/workflows/windows.yml` runs the web, desktop and parser tests on `windows-latest` for pushes to `main` and pull requests, with every tool installed, then packages, runs the packaged smoke test, builds the installer and runs the installer test (per user and per machine), then the Store package test. `test-out/`, the installer and the unsigned Store package (`OpenPub-store-package`) are uploaded as artifacts. `.github/workflows/linux.yml` (job `linux`) runs the web, desktop (under `xvfb-run`) and parser tests on `ubuntu-latest` with pikepdf pinned and Ubuntu's poppler-utils and Ghostscript version-checked; no packaging.
- Releases: `.github/workflows/release.yml`, started by hand on `main` after the version bump is merged. It runs `windows.yml` as a reusable workflow (same build and tests as CI, with `release: true` to upload the release files), checks them with `tools/release-files.js` (installer, `.blockmap`, `latest.yml` whose SHA-512 and size match the installer, zip) and creates a DRAFT release with notes from `tools/release-notes.js` (the `### <version>` section of `docs/STATUS.md`). Only its publish job has `contents: write`. The owner publishes the draft; publishing creates the tag. Release immutability is on: never publish a rehearsal (the `rehearsal` input makes a do-not-publish draft to delete), fix a broken release with a new version. Code signing (SignPath Foundation, `docs/SIGNING.md`) is off until the repository variable `SIGNPATH_ORGANIZATION_ID` is set; then the `sign` job signs `OpenPub.exe`, rebuilds the installer and zip from the signed folder (`package.mjs --from-folder --publisher`), signs the installer and remakes its blockmap and `latest.yml` (`tools/release-signed.js`). The SignPath action is the one action not from GitHub; keep it SHA-pinned, and it must stay on the repository's allowed-actions list (GitHub refuses the whole run at startup otherwise, even with `sign` skipped). Normal CI keeps `publish: 'never'`.
- Workflow actions are pinned to full commit SHAs with the version in a comment (`@<sha> # v7.0.1`); Dependabot (`.github/dependabot.yml`) proposes updates. Downloads in CI (poppler, Ghostscript) are checked against their published SHA-256.
- The installer test refuses to run if OpenPub is already installed (it uninstalls as part of the test). Without administrator rights it skips the per-machine half.
- Always run `npm run build` before testing by hand; the tests load the built file, not `app/src`.

## Layout

- `app/src/` – editor and `.pub` parser. Plain JavaScript, no framework, no bundler. Every module adds to the global `OP`; app state is `OP.app`.
- `app/src/index.template.html` – page shell and all CSS. `tools/build.js` inlines the modules at `/*__SCRIPTS__*/`.
- `desktop/appsrc/` – Electron shell: `main.js`, `preload.js` (bridge `window.openpubDesktop`, seen by the editor as `OP.desktop`), `updater.js` (update checks, electron-updater), `pdfblack.js`, `dict/` (en-AU spelling).
- `desktop/examples/` – sample plug-in, sample content pack, `PLUGINS.md` (plug-in API reference). Shipped with the app.
- `desktop/build/` – Windows icons (`icon.ico`, `opub.ico`, drawn by `tools/make-icons.js`) and `installer.nsh` (file types and the keep-settings question for the electron-builder NSIS installer). The Microsoft Store package (MSIX): `appxmanifest.xml` (manifest template: file types, command-line alias; no `--` inside its XML comments), `store.json` (Partner Center identity; `placeholder: true` until the owner adds the reserved values), `appx/` (tiles and logos, also drawn by `make-icons.js`).
- `tools/` – build, packaging and test scripts. `tools/lib.js` holds all paths and launch helpers. `tools/debug/` has parser dump scripts.
- `test-data/publisher/` – sample `.pub` files from Apache POI.
- `.signpath/artifact-configurations/` – copies of the SignPath artifact configurations (`app`, `installer`); keep them the same as SignPath's.
- `docs/STATUS.md` – what is built, what is tested, known limits, backlog. `docs/ROADMAP.md` – the plan after 1.3 (1.4 to 1.7) and the competitor review. `docs/THIRD-PARTY.md` – third-party licences (also the website's licence page).
- `site/` – the website: `pages/*.html` (fragments with a `<!--page {...} -->` front matter), `assets/style.css`, `img/` (screenshots from `tools/site-screenshots.js`), `verification.json` (search engine verification tags). `tools/build-site.js` adds layout, metadata, JSON-LD, the latest release's download links, `sitemap.xml` and `robots.txt`; `tools/site-check.js` checks the result. `.github/workflows/pages.yml` deploys it to GitHub Pages. No scripts, tracking or remote fonts on the site.
- Generated, not committed: `app/dist/`, `desktop/appsrc/app/`, `desktop/dist/`, `test-out/`, `_site/`.

## Architecture rules

- Module order is fixed in `tools/build.js` (`ORDER`). A new module must be added there.
  `util, cfb, model, geometry, wmf, emf, layout, hyph, flow, wrap, table, wordart, pub, pubconv, render, export, app-core, app-input, app-text, app-panels, app-extra, app-print, app-ribbon, app-plugins, app-main, app-check, app-update`
  `app-check` comes after `app-main` because it wraps the export and print dialogs defined there; `app-update` (the update question and notice, desktop only) is last.
- A new item type or item field must be handled in four places: model normalisation (`normItem` / `normText` in `model.js`), canvas renderer (`render.js`), SVG exporter (`OP.pageToSvg` in `export.js`) and the undo snapshot (`app-core.js`). Missing one gives a feature that draws but does not export, or is lost on undo or reload.
- Geometry is in points everywhere. The UI shows millimetres (`OP.MM`).
- The editor must keep working as a plain web page: guard desktop-only features with `if (OP.desktop)`.
- Network: the desktop app makes no network requests, except update checks to GitHub (`desktop/appsrc/updater.js`), and only when the user has said yes to them on first start or chooses Check for updates, never when the admin policy turns them off (`DisableUpdateCheck` = 1, `REG_DWORD`, under `HKLM` or `HKCU\SOFTWARE\Policies\OpenPub`). Opening a hyperlink in the user's browser is not a request by the app. `tools/build.js` strips the web-font links from the desktop copy; do not add remote resources. Update this rule, the privacy page (`site/pages/privacy.html`) and `desktop/README-win.txt` together.
- Updates: electron-updater (GitHub provider) for NSIS installs only. `tools/package.mjs` writes `resources/app-update.yml` (electron-builder skips it for a prepackaged folder). Modes: installed (`Uninstall OpenPub.exe` beside the exe and a Windows uninstall entry pointing at it; HKLM means installed for everyone) downloads and installs; portable (anything else: the zip, a copied folder) only shows a notice with the release page; Store (`process.windowsStore`) and source runs have no updater. Signature checking stays off (no `publisherName` in `app-update.yml`, written by `tools/update-config.js`) until the first signed release; from then on every release must be signed, or installed copies refuse the update. Test hooks are `OPENPUB_TEST_UPDATE_*` environment variables, listed at the top of `updater.js`.
- Electron security: `contextIsolation` and `sandbox` stay on. New native features go through `preload.js` → `ipcMain` handlers. `file:save` only writes to a path the user chose in a dialog this session (`knownPaths` in `main.js`); keep that.
- No `</script` inside any module (the build rejects it).
- `.pub` is read-only: the format is undocumented, so there is no `.pub` writer. Projects save as `.opub` (JSON).
- Ghostscript is AGPL: detect and call an installed copy, never bundle it.
- The app ID `org.openpub.desktop` (in `tools/package.mjs` and `main.js`) must never change: the installer's GUID, upgrades and the taskbar grouping depend on it.

## Conventions

- UI text: Australian English, sentence case, plain words.
- The product is called "OpenPub" everywhere ("OpenPub Poster Studio" is retired). Say it opens Microsoft Publisher files or is an alternative to Microsoft Publisher; never use "Publisher" as part of OpenPub's name or Microsoft's logos.
- Version number lives in four places; change all of them for a release: `package.json`, `desktop/appsrc/package.json`, `OP.VERSION` in `app/src/app-plugins.js`, first line of `desktop/README-win.txt`.
- Add or extend a check in `tools/e2e-desktop.js` (desktop features) or `tools/e2e.js` (editor features) with every feature or fix. Native dialogs are stubbed at the top of `e2e-desktop.js`.
- The tests pass on Linux and on Windows 11. Shell commands in test scripts must work in both `cmd.exe` and POSIX shells: quote paths with double quotes, not single quotes.
