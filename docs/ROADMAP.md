# OpenPub roadmap after 1.3

From the planning chat, 24 November 2026, with the owner's decisions of the same day (section 5). It replaces Part C (1.4) of the 1.3 brief; Parts A and B of that brief (1.3.0: website, release workflow, auto-update, portable notice, signing, Store build, Linux CI job, release) are unchanged.

Ground rules as in the 1.3 brief: follow `CLAUDE.md` (a new item field goes in the model normalisation, canvas renderer, SVG exporter and undo snapshot); one pull request per numbered item, with checks, and `test` (and `linux`) must pass; UI text in Australian English; confirm current documentation for every library, format and service (items marked "confirm" could not be checked from the planning chat). Sizes are rough guesses.

## 1. Competitor review

Reviewed from their GitHub pages (pubrs also from its source). None was installed or run.

| | Korva | pubrs | Offizin | NiftyDesign |
|---|---|---|---|---|
| What it is | Desktop `.pub` editor | Desktop publisher with `.pub` import | Add-in for Word and Google Docs | Desktop `.pub` editor, early alpha |
| Platforms | Windows, macOS, Linux | Windows (x64, ARM64), macOS, Linux | Word (web, Windows, Mac), Google Docs | Windows x64 |
| Source and price | Closed source; free to open, edit and export PDF; paid "Pro" for editable saves | MIT, free | MIT, free | MIT or Apache-2.0, free |
| Tech | Tauri | Rust, own layout and PDF engine | Plain JavaScript | Rust (DesignCraft) |
| Maturity | Version not stated | 0.2.1; 547 tests; CI on 4 systems | 10 commits, no releases | alpha.4 |
| `.pub` import | Text and pictures; text from legacy files | 2002+: text, pictures, basic shapes, plain tables, colour schemes; 98/2000: text and colours; no WMF/EMF, table borders or merges | None | 2002+: text, pictures, common shapes, table text |
| Signed installers | No (updates are signed) | No | n/a | No |

What stands out:
- **Korva:** free on three systems; an in-browser `.pub` to PDF converter on its website; grayscale, crop marks and page ranges in PDF export; layers and smart guides.
- **pubrs:** PDF/X-4, real spot separations, "Save for a commercial printer"; 26 label and card presets; booklets; 13 templates; drop caps, tab stops with leaders; CSV or XLSX mail merge; 12 BorderArt patterns (CC0); alt text and tagged PDF; a command line and an MCP server; a documented file format.
- **Offizin:** lives in Word and Google Docs; 33 templates, colour and font schemes, business information sets, brand kit, a checker for leftover sample text.
- **NiftyDesign:** honest import (never changes the original, lists import notes in the app and in a report); missing fonts replaced by the closest installed font without a pop-up.

Also likely to be compared: PubKeep (paid, Windows and macOS), Anderly (Publisher 2000 to Microsoft 365, ribbon), LibreOffice (libmspub).

## 2. Where OpenPub stands

Ahead: import fidelity on real files (WMF and EMF drawn; master pages checked on 8 real files; linked boxes, tables, BorderArt colour and width, font-name mapping); a Publisher-style ribbon; plug-ins and content packs; ready for organisations (per-user or per-machine install, silent switches, an update policy, ask-first updates); signing planned (Store and SignPath); MIT and free.

Behind: Windows only; print-shop output needs Ghostscript, no PDF/X or real spot plates; 5 templates; no bulk conversion, command line or AI interface; Publisher 98 and 2000 refused; BorderArt as a plain frame; no drop caps, tab stops, label presets, XLSX merge, business information, grayscale output or alt text; no online viewer.

What OpenPub should be known for, in this order: (1) opens your `.pub` files most faithfully, one at a time or a whole folder; (2) free, signed and ready for organisations; (3) print-shop PDF with nothing else to install; (4) the same on Linux (1.4), later on Mac.

## 3. Build list

### 1.4: switching from Publisher

1. **Bulk conversion and command line** (medium). `OpenPub.exe --convert <files or folder> --to pdf|png|opub [--out <folder>] [--report <file.csv>] [--recurse]`; no editor window; never changes or overwrites originals (skips existing output unless `--overwrite`); a CSV report (result, pages, import notes) and a non-zero exit code if any file failed; optional Explorer command "Convert to PDF with OpenPub"; works from the portable zip. Done when a folder with the samples and the 8 private files converts in one run, 98/2000 and damaged files are reported rather than crashing, and the report and exit code are tested.
2. **Online viewer on the website** (medium; approved). Opens a `.pub` in the browser with OpenPub's editor build, entirely on the visitor's computer, no uploads or analytics; view pages, export PDF and PNG, "Download OpenPub to edit"; search phrases "open pub file online", "pub to pdf". Done when it opens the samples offline after loading, a test confirms no request leaves the page after load, and it links to the privacy page.
3. **Import report, measured fidelity and font substitution** (medium). The import report as a panel whose notes select their objects and can be saved as text; a CI fidelity score per sample (text recall, objects placed, pictures placed) against a stored result, failing any pull request that lowers it, with the numbers on the site; metric-compatible substitutes for missing fonts (Carlito for Calibri, Caladea for Cambria, Liberation Sans for Arial, Liberation Serif for Times New Roman; confirm each), reported in the import report and design checker; never bundle Microsoft fonts; bundle Carlito and Caladea only if their licences allow (confirm).
4. **BorderArt patterns** (medium). Draw BorderArt as patterns matched to the pattern number `pub.js` already reads, using pubrs's 12 CC0 patterns plus new original ones (recorded in `docs/THIRD-PARTY.md`); never Microsoft's artwork; keep the plain frame and note where nothing is close; also selectable in the editor (Format › Border); canvas, SVG and PDF match. Done when the 4 certificate files with BorderArt show a pattern and picking or removing it works with undo.
5. **Publisher 98 and 2000 files** (medium; confirm). Import pages, text and colours with a note that pictures and shapes are not imported; study pubrs's parser (MIT) and credit it if code is ported. Done when `Sample98.pub` and `Sample2000.pub` open with their text and the website's limits and FAQ are updated.
6. **Linux packages** (medium; Linux before macOS). AppImage and `.deb` (x64) from the same packaged app in the Linux CI job; `.opub` as its own MIME type with icon, `.pub` (`application/x-mspublisher`) as an available handler only; desktop entry and icons. Check fonts, spelling, printing, vector PDF, Ghostscript on PATH, command-line files, single instance, plug-ins. Update checks with the same ask-first rules; confirm which formats electron-updater updates (AppImage expected; confirm `.deb`), others get the release-page notice; a system-wide policy file with the same `DisableUpdateCheck` meaning (for example `/etc/openpub/policy.json`; confirm the convention); update the network rule, privacy page and README together. Release workflow: Linux files with SHA-256 checksums plus the updater's Linux metadata if needed (confirm). Website: Linux downloads, tested distributions, limits, JSON-LD operating systems, FAQ for the policy file. Not signed; Flathub later. Done when CI builds both, installs the `.deb` on a clean Ubuntu runner, runs the packaged smoke test under `xvfb-run` against the installed copy and the AppImage, registers the file types, and passes the AppImage update flow against a local feed.
7. **Small items.** Grayscale option for PDF export and Print layouts; XLSX as a mail-merge source (`DecompressionStream('deflate-raw')`; confirm; shared strings and dates); `docs/FILE-FORMAT.md` for the versioned `.opub` format; ADMX and ADML templates for `DisableUpdateCheck` and a deployment page (Intune Win32 app, Group Policy, silent switches).

### 1.5: everyday Publisher features

8. **Tab stops with leaders, and drop caps** (medium). Model, layout, panel, dialogs, `.pub` import where readable. Done when dot-leader tabs and a 3-line drop cap render alike on canvas, SVG and PDF and survive save, reload and undo.
9. **Named paragraph and character styles** (large; 1.3 brief item 10, unchanged).
10. **Hyperlinks** (medium; 1.3 brief item 11, unchanged).
11. **Label and card sheets** (medium). About 25 presets (A4 labels, Avery-style US Letter labels, business cards, postcards) from public specification sheets, product numbers only as names with a trademark line; connected to mail merge and n-up. Done when 30 address labels merge onto one sheet and print in the right positions in PDF.
12. **Templates, business information and brand kit** (large). Claude Code drafts, the owner reviews each before release (review list in `docs/STATUS.md`: drafted, reviewed, changes asked for; a preview image on each pull request; ship only reviewed ones). About 30 original templates (flyers, posters, brochures, newsletters, cards, certificates, menus, calendars, labels, letterhead, business cards), never Microsoft's; business information sets; font schemes; a brand kit as a content pack; the design checker finds leftover sample text.
13. **Properly bent WordArt** (large; 1.3 brief item 14, unchanged).

### 1.6: print shop

14. **Native vector PDF writer** (large; spike approved). PDF from OpenPub's own model instead of `printToPDF` and Ghostscript, embedding installed fonts' data. Spike first: measure text placement and font embedding against the current vector PDF on the samples and certificates, and report to the owner before building the full writer. The spike changes no shipped code and can run alongside 1.4. Keep Ghostscript as a fallback until the new writer matches.
15. **PDF/X-4, real spot colour plates and "Save for a commercial printer".** Replaces the 1.3 brief's item 12: swatches print as real separations; PDF/X-4 with output intent and bleed; a package zip with the PDF, pictures and font list. ICC profile: pubrs's generic CMYK profile ("Use freely"; confirm) or the user's own.
16. **Alt text and tagged PDF**, with a design checker warning for missing alt text.
17. **Catalogue merge** (1.3 brief item 13, unchanged).

### 1.7: macOS and automation

18. **macOS build** (after Linux; confirm with the owner first). Apple silicon and Intel, notarisation, file types, fonts, printing, Ghostscript under Homebrew paths. Needs an Apple Developer Program membership (about US$99 a year; confirm) and a macOS CI runner.
19. **MCP server for AI assistants.** Open, create, edit, export and convert through tools, reusing item 1's command-line engine; local only, no network.

## 4. Deliberately not copied

Paid features (OpenPub stays free); living inside Word or Google Docs; Microsoft's templates, BorderArt or fonts.

## 5. Owner decisions (24 November 2026)

1. Linux first: Linux packages in 1.4 (item 6), macOS in 1.7 (item 18) after confirming the fee and Mac testing.
2. Native PDF writer (item 14): spike approved; report before building the full writer.
3. Online viewer (item 2): approved.
4. Templates (item 12): Claude Code drafts, the owner reviews each before release.
5. The competitor list is complete with the four projects above.

Not planned: saving `.pub` files.
