# OpenPub – status

Version 1.1.1, 12 November 2026.

Publisher replacement. Windows desktop app (Electron 45, portable folder, `OpenPub.exe`), built from a single-file editor that also runs in a browser.

## What is built

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

- 76 desktop end-to-end checks (Electron on Linux, clean profile per run), 37 browser checks, parser run over the sample files: all pass as of this version.
- Packaged (asar) Linux build smoke-tested: file from command line, ribbon, dictionary, fonts, vector CMYK, zero network requests.
- CMYK conversion tested with Ghostscript 9.56 code (a WASM build standing in for a system install) and a FOGRA39 profile.
- Windows: the packaged `.exe` starts and shows the ribbon UI and loads installed fonts (seen in one user screenshot). Nothing else has been checked on Windows.

## Not tested

- The test scripts have never been run on Windows.
- Printing to a real printer, and the Windows print dialog.
- Ghostscript detection on Windows (`Program Files\gs\...\gswin64c.exe`).
- `npm run package:win` run on Windows itself (so far cross-built from Linux), including its zip step.
- Import of master-page objects, multi-column boxes and EMF pictures from real files (no sample has them).

## Known limits

- Cannot save `.pub`. Publisher 98 and 2000 files are rejected.
- Wrap is not shown while typing in a text box; it returns on finishing. Text does not flow on both sides of an obstacle. Master-page items do not act as wrap obstacles.
- Linked boxes are chained in file order on import. Table import keeps one grid style (per-cell borders are lost). WordArt letters are placed individually, not bent.
- Script plug-ins generally cannot run in the browser build (content security policy); content packs can.
- No installer, no file associations, no code signing (Windows SmartScreen warns on first run).

## Backlog

- Installer, `.pub` / `.opub` file associations, code signing.
- Catalogue merge, design checker, spot colours.
- Wrap on both sides of an obstacle; live wrap while typing.
- Per-cell table borders on import; true bent WordArt glyphs.
- Run the test suite on Windows and fix what it finds.
