# OpenPub – status

Version 1.2.1, 18 November 2026.

Publisher replacement. Windows desktop app (Electron 45; installer or portable folder, `OpenPub.exe`), built from a single-file editor that also runs in a browser.

## What is built

### 1.3.0 (in progress)
- Website in `site/`, deployed to GitHub Pages (`https://sarinityx.github.io/OpenPub/`): home page with download button, screenshots and known limits; FAQ; privacy page (describes the planned update check exactly, and the `DisableUpdateCheck` policy value); code signing policy (SignPath Foundation requirements: build process, team roles, privacy); licence and third-party notices. Search metadata: title and description around "open and edit Microsoft Publisher files", one `h1` per page, canonical URLs, Open Graph image, `SoftwareApplication` JSON-LD (no ratings), `sitemap.xml`, `robots.txt`. The download links come from the latest release at build time; the site rebuilds when a release is published.
- The product is called OpenPub everywhere; "OpenPub Poster Studio" is retired.
- Update checks (electron-updater 6.8.11, GitHub releases), for installed copies: on first start a non-modal question "Check for updates automatically?"; no request until the answer is yes. Then one check shortly after start and at most once a day. A new version shows a notice with Download, What's new, Not now and Skip this version; after downloading, Restart to update (after the unsaved-changes question, never during an export or print) or Later (installs when OpenPub closes). Downloads are differential (the installer's blockmap) when the previous version's blockmap is available; 1.2.x has none, so the first update to 1.3.0 is a full download. File › Check for updates works at any time; automatic checks fail quietly, a manual check reports the problem. Installed for everyone: an administrator gets Download and Windows asks for permission; a standard user is told an administrator needs to install it and gets the release page. The portable zip asks the same question and checks the same way, but its notice only links the release page: it never downloads or installs. A copy counts as installed only when `Uninstall OpenPub.exe` is beside `OpenPub.exe` and a Windows uninstall entry (HKCU for one user, HKLM for everyone) points at that file; anything else, including a copied install folder, is portable. The Microsoft Store version has no update check. Admin policy: `DisableUpdateCheck` = 1 (`REG_DWORD`) under `HKLM\SOFTWARE\Policies\OpenPub` (all users) or `HKCU\SOFTWARE\Policies\OpenPub` (one user; a standard user can usually write this one, which only turns off their own checks) turns off the question, the checks and the manual command. Update signatures are not checked until the first signed release (no `publisherName` in `app-update.yml`); until then integrity rests on the GitHub account, the repository rules, release immutability and the SHA-512 in `latest.yml`. A signed release's `app-update.yml` names its certificate, and its copies refuse an update not signed with it (checked by the installer test).
- Linux CI (`.github/workflows/linux.yml`, check name `linux`): the browser, desktop and parser tests on `ubuntu-latest` for every push to `main` and every pull request, desktop tests under `xvfb-run`, every inspection tool installed (pikepdf 10.18.2 pinned; Ubuntu's poppler-utils 24 and Ghostscript 10, versions checked). No packaging.
- Release workflow (`.github/workflows/release.yml`, run by hand on `main`): builds and tests exactly as CI (it calls `windows.yml`), checks the release files, and creates a draft release with the installer, its `.blockmap`, `latest.yml` and the portable zip; the notes come from this file. The owner publishes the draft. A `rehearsal` run makes a do-not-publish draft. The installer is now built with `differentialPackage: true` (blockmap for differential updates), which makes it about 10 MB larger (113 MB).
- Microsoft Store package (MSIX), built by `npm run package:win` from the same packaged folder (`OpenPub-<version>-x64.msix`, unsigned: the Store signs it). Manifest `desktop/build/appxmanifest.xml`: `.opub` as OpenPub's own type with its logo, `.pub` offered in Open with (a packaged app never becomes the default by itself), the `OpenPub.exe` command-line alias, Windows 10 1809 or later, English (Australia). Tiles and logos drawn by `tools/make-icons.js` into `desktop/build/appx/`. Identity from `desktop/build/store.json`, which holds placeholder values until the owner adds the Partner Center reservation. In the package (`process.windowsStore`): no update question, check or command, and no own taskbar ID (Windows uses the package's). Settings, the personal dictionary, plug-ins and content packs are kept in the package's own folder and removed when the app is uninstalled, so the installer's keep-settings question has no counterpart (said in the Store listing). `npm run test:msix` (CI, administrator) test-signs a copy with a throwaway certificate, installs it, checks it, uninstalls it and runs the Windows App Certification Kit (10.0.26100 on the CI runner: overall PASS; the optional "Blocked executables" test always flags Electron and does not count). Store listing draft: `docs/store-listing.md`.
- Code signing through SignPath Foundation, prepared and off until the owner sets it up (`docs/SIGNING.md`): when the repository variable `SIGNPATH_ORGANIZATION_ID` is set, the release workflow's `sign` job has SignPath sign `OpenPub.exe`, builds the installer and zip from the signed folder (`package.mjs --from-folder --publisher`), has SignPath sign the installer, then remakes its `.blockmap` and `latest.yml` (`tools/release-signed.js`). Rehearsals use the test-signing policy. The artifact configurations are copied in `.signpath/`. The uninstaller stays unsigned. Also fixed: the release workflow's last step would have failed a real (not rehearsal) release after creating the draft, and run from Git Bash, a local Windows build wrote a tar named `.zip`, the installer test could not unzip it, and the update check treated an administrator as a standard user: Git Bash puts GNU tar and its own `whoami` first on PATH. Windows' `tar.exe`, `reg.exe` and `whoami.exe` are now called by full path.
- Third-party notices: the British English hyphenation patterns are MIT-licensed (hyph-utf8, Dominik Wujastyk and Graham Toal); the notice is now in `app/src/hyph.js`.

### 1.2.1
- Fixed: typing in a text box with text wrap turned coloured text black (from 1.2.0's wrap-while-typing).
- Design checker: keyboard focus stays put when the results refresh; each result says Problem or Note in words; fonts are checked whenever the installed list is known, and the tab says when they were not; a check that fails says so instead of showing old results; the offer before output says when the design changed since the last check.
- Keyboard and screen readers: the side-panel tabs follow the standard tabs pattern (arrow keys, Home, End); Enter on a focused control presses it without also starting text editing; Space presses a focused button; the print layouts preview is labelled and its sheet number announced.
- Pointer cursor on every usable control, not-allowed on disabled ones.
- While typing in a wrapped box, the caret and selection have a light halo so they show on any fill (system colours in forced-colours mode), and the status bar says why spelling marks are off.
- Tests: the desktop tests use poppler's `pdftotext` even when Git Bash puts xpdf's first on PATH.

### 1.2.0
- Home › Align on the ribbon: left, centre, right, top, middle, bottom, space evenly across and down. With one object it aligns to the page. Buttons are greyed out until there is something to move; spacing needs three or more objects.
- Text panel: space before, line spacing as a multiple or exactly in points, left and right indents, first-line indent (negative for a hanging indent).
- Text overflow "Grow box to fit": the box follows its text downward from the top edge, live while typing, never narrower or wider and never below one line. Not offered for linked boxes or boxes with columns.
- Format painter (Home › Clipboard, Ctrl+Shift+C / Ctrl+Shift+V): copies text formatting (character and paragraph) and object look (fill, outline, shadow, opacity, corner rounding) onto whole objects. One click applies once; double-click keeps it on until Esc. It applies to a whole text box, not to part of its text.
- Design checker (Review › Check design, Check tab): text that does not fit (or the last box of a linked chain), pictures below a set resolution (150 ppi by default), objects partly or wholly off the page or outside the bleed, fonts that are not installed (desktop only), empty text boxes, mail-merge fields with no data, and RGB pictures as notes when the output is CMYK. Results are grouped by page; clicking one goes to the object. Export, Print layouts and Tiled poster offer the check when the document has changed since it last ran; it never blocks output.
- Text wrap on both sides of an obstacle: each row fills the space left of it, then right of it. A side narrower than 36 pt (about 13 mm, `OP.WRAP_MIN_SIDE`) stays empty. Wrap objects on a master page push aside the text of every page that uses that master. The wrap stays visible while typing: in a box that wraps, the canvas draws the text and OpenPub draws the caret and selection; clicks, drags, double-click, Up/Down and Home/End follow the wrapped lines. Spelling underlines are off in such a box while typing.
- Windows installer (`OpenPub-<version>-win64-setup.exe`, electron-builder 26.18 NSIS), beside the portable zip. One installer: "Only for me" (no administrator rights) or "Anyone who uses this computer"; silent with `/S /currentuser` or `/S /allusers`. Start menu shortcut (no desktop shortcut), uninstall entry in Settings > Apps. `.opub` opens in OpenPub with its own document icon; for `.pub` OpenPub is added to "Open with" and Settings > Default apps, and the existing default program (usually Publisher) is left alone. Uninstalling asks whether to remove settings and the personal dictionary (default: keep); silent uninstalls keep them unless `--delete-app-data` is passed. `OpenPub.exe` has its own icon and version details.
- A file double-clicked while OpenPub is open goes to the open window, which asks about unsaved changes first (Cancel keeps the open document). An export or print that is running finishes before the file opens. A file double-clicked while OpenPub is still starting opens once it is ready.
- Import fidelity, checked against 8 real-world certificate templates kept outside the repository (`test-data/private/`) and Publisher's own page thumbnails stored in those files:
  - Shapes with a coordinate on the page's centre line were dropped (Publisher leaves a zero coordinate out of the position record). They are imported now; this restored a missing text box and a missing rule.
  - BorderArt becomes a plain frame in its colour and width, inside the shape's edge, with an import note. Publisher keeps the border pictures in the program, not in the file, so the pattern itself cannot be shown. A border left in its own colours is drawn black, as Publisher's thumbnails show.
  - Multi-line WordArt follows Office's default alignment (centre): one horizontal scale from the longest line, so short lines are no longer stretched to the full width and letters are the same width on every line. The WordArt panel has a Lines setting (Centre, Left, Right, Stretch each line); documents from before 1.2 keep stretched lines.
  - Outlines thinner than one screen pixel (0.25 pt rules) are drawn one pixel wide on screen and in PNG/JPEG export, as Publisher shows them; SVG and PDF keep the real width.
  - A page object that repeats a master-page object exactly is imported once.
  - Linked text boxes are chained in the order the file gives (each box records its previous and next box), not in storage order.
  - Paragraph left and right indents are read as signed: a negative indent had come out as 338,175 pt.
  - One finding did not hold up: a background picture that looked rotated 180° is rotated in the file, and Publisher's own thumbnail shows it rotated, so the import was right.
- Fonts known by an older Windows name: a document may use a face's full name ("Franklin Gothic Demi Cond") where Windows lists the font under a larger family ("Franklin Gothic"). Such a name is now pointed at the installed face (CSS `local()`), on screen and in the vector PDF, print and SVG output; before, the text fell back to another font. The design check counts these names as installed.
- Print layouts (Ctrl+Shift+P) shows a preview of each sheet as it will print or go into the PDF: one page per sheet, several per sheet, booklet order (front and back), crop marks. Ctrl+P still goes straight to the system print dialog: for one page per sheet, the page on screen is the preview. The Windows dialog's own preview pane stays empty ("This app doesn't support print preview"); that pane is not available to Electron apps.
- The print dialog is titled "OpenPub - Print" in the packaged app; Windows takes the name from `OpenPub.exe`'s version details. A source run (`npm start`) shows "Electron - Print" because it runs Electron's own `electron.exe`.
- Font list count: the list holds the installed families, 26 common Windows names and the open document's fonts, so it varies with the document. 232 (packaged smoke test, Sample.pub) against 235 (desktop tests, SampleNewsletter.pub open) was three newsletter fonts, not a missing font.
- Fixed: SVG files exported on their own were not well-formed XML (a stray quote in `viewBox`), so strict SVG readers rejected them.
- Tests: the font drop-down checks use whatever fonts are installed (CI no longer installs the Liberation fonts). CI also runs the packaged smoke test, which now fails on any problem instead of only printing results.

### 1.1.1
- Font drop-down lists every installed font, each shown in its own typeface, with type-to-filter. (The earlier list only showed fonts matching the text already in the box.)

### 1.1
- Ribbon UI: File, Home, Insert, Page design, Mailings, Review, View, Plug-ins. Quick access (save, undo, redo) in the title band, zoom in the status bar, Ctrl+F1 collapses.
- Themes: match system, light, dark; remembered.
- Text wrap around any item: square or tight, with distance. Tight follows shape outlines and picture transparency. Text takes the wider side only.
- Hyphenation per text box (British English patterns; there is no separate Australian set), at most two hyphenated lines in a row. Justified text: spaces may shrink 15%, loose lines get slight letter-spacing.
- All installed fonts load automatically in the desktop app.
- Plug-ins (JavaScript, `OpenPub.register`; see `desktop/examples/PLUGINS.md`): commands, building blocks, templates, exporters. Trust warning on install; switched-off plug-ins are not run.
- Content packs (`.opubpack` JSON): templates, building blocks, colour schemes. Own blocks and templates can be exported as a pack.
- Templates: File › From template (5 built in, plus packs, plug-ins and "Save as template").
- Vector CMYK PDF through an installed Ghostscript (not bundled; AGPL), with a user-chosen ICC output profile. Pure black is rewritten to grey first so it stays on the black plate only.
- Print: Ctrl+P opens the system print dialog; layouts dialog is Ctrl+Shift+P.
- Save-path hardening: the page can only overwrite a file the user chose in a dialog this session.

### 1.0
Tables, linked text boxes, columns, WordArt, EMF pictures, mail merge, building blocks, spell check, master pages, vector PDF, picture CMYK PDF, n-up, booklet, tiled poster printing, find and replace, picture adjustments, extra text styles.

## Tested

- 103 desktop end-to-end checks (Electron, clean profile per run), 107 browser checks, parser run over the sample files: all pass on Windows 11 (the 4 checks added in 1.2 for a second launch with a file have not been run on Linux).
- Installer (`npm run test:installer`, Windows): silent install per user and per machine, files, version details, Start menu shortcut, uninstall entry, registry for `.opub` and `.pub`, the `.pub` default left unchanged, a `.opub` opened through Windows starts the installed app, the installed app imports a `.pub`, silent uninstall removes everything it added and keeps settings (or removes them with `--delete-app-data`). Per user run on Windows 11; per machine runs on CI.
- Windows 11 (17 November 2026): all 76 desktop checks with none skipped, using poppler 25.07, Python 3.13 with pikepdf, and Ghostscript 10.08 found in `Program Files\gs`. The run found one Windows-only test-script bug (single-quoted path), now fixed.
- Packaged (asar) build smoke-tested on Linux and on Windows, and on every CI run (`tools/smoke-packaged.js`): exe version details, file from command line, ribbon, dictionary, fonts, vector CMYK through Ghostscript, zero network requests, no script errors.
- CMYK conversion tested with Ghostscript 9.56 code (a WASM build standing in for a system install) and a FOGRA39 profile, and with Ghostscript 10.08 installed on Windows.
- `npm start` runs the app from source on Windows.
- CI (`.github/workflows/windows.yml`): web, desktop and parser tests on `windows-latest` for every push to `main` and every pull request, with no desktop checks allowed to skip; then packaging, the installer and the installer test. The installer is uploaded as an artifact (kept 3 days).

## Not tested

- Printing to a real printer: the Windows print dialog opens and lists the printer; whether the page prints at the right size and position is not yet reported.
- The installer's own pages (install mode, the keep-settings question on uninstall) by hand; the tests drive it silently.
- Import of multi-column boxes and EMF pictures from real files (no sample or private test file has them). Master-page objects are now covered by the private certificate files.
- Per-cell table borders: the only sample table has none, so where Publisher stores them is not known yet.

## Known limits

- Cannot save `.pub`. Publisher 98 and 2000 files are rejected.
- Table import keeps one grid style (per-cell borders are lost). WordArt letters are placed individually, not bent; WordArt letter- and word-justified alignment are imported as stretched lines.
- Compound outlines (double, thick-thin, thin-thick, triple) are imported as one solid line of the full width.
- BorderArt shows as a plain frame (see above).
- In SampleNewsletter.pub the first lines of one story are cut off at the top of its first box (seen before 1.2 too; not investigated yet).
- Script plug-ins generally cannot run in the browser build (content security policy); content packs can.
- No code signing: Windows SmartScreen warns on first run of the installer and of the portable app.
- A per-machine uninstall removes the settings of the user who runs it (when asked to), not those of other users.

## Backlog

- Still to do for 1.3.0: code signing through SignPath Foundation (prepared and off; switched on after approval, `docs/SIGNING.md`), the Microsoft Store build, the 1.3.0 release.
- After 1.3: see [ROADMAP.md](ROADMAP.md) (24 November 2026). 1.4: bulk conversion and command line, an online viewer on the website, import report and measured fidelity with font substitution, BorderArt patterns, Publisher 98 and 2000 files, Linux packages, small items. 1.5: tab stops and drop caps, styles, hyperlinks, label sheets, templates and brand kit, bent WordArt. 1.6: native PDF writer, PDF/X-4 and spot plates, alt text and tagged PDF, catalogue merge. 1.7: macOS, MCP server.
- Per-cell table borders on import (needs a sample file); compound outlines; multi-column boxes and EMF pictures from real files (need sample files).
