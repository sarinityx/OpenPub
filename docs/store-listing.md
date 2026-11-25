# Microsoft Store listing (draft)

Draft for Partner Center, from the website's wording. The owner checks it, then pastes it into the Store listing for English (Australia), the package's language (`en-AU` in `tools/package.mjs`). Field limits are as Partner Center showed them when this was written; check them as you paste.

## Product name

OpenPub

(Reserve this name in Partner Center. Never "Publisher" or Microsoft's logos in the name or the pictures.)

## Description

OpenPub opens Microsoft Publisher (.pub) files and lets you edit, print and export them as PDF, entirely on your computer. It is free and open source, and an alternative to Microsoft Publisher, which Microsoft retired in October 2026.

What OpenPub opens and keeps:
- .pub files from Publisher 2002, 2003, 2007, 2010, 2013, 2016, 2019, 2021 and Microsoft 365
- Text boxes with their fonts, colours, spacing, bullets and columns, and linked text boxes in their original order
- Tables, master pages and WordArt
- Pictures (PNG, JPEG, and most WMF and EMF artwork), shapes, lines, gradients, rotation and groups
- Page backgrounds and the colours of the publication's colour scheme
- An import report that says what was changed on the way in

What you can do with it:
- Edit text in place, with spelling in Australian English and British hyphenation
- Move, align and space objects; text wraps around pictures and shapes
- Mail merge from a CSV file or cells pasted from Excel; building blocks and templates
- Check the design before printing: text that doesn't fit, low-resolution pictures, missing fonts
- Export PDF (vector, or CMYK for print shops), PNG, JPEG and SVG
- Print through Windows, or lay out several copies per sheet, booklets and tiled posters
- Save your work as an OpenPub project (.opub)

Everything happens on your computer: no account, no uploads, and no update checks (the Store keeps the app up to date).

Known limits:
- OpenPub cannot save .pub files. The format is undocumented, so your work is saved as an .opub project and exported as PDF or pictures. The original .pub file is never changed.
- Files from Publisher 98 and Publisher 2000 cannot be opened.
- Vector CMYK PDF needs Ghostscript, which is free but installed separately.
- Uninstalling OpenPub from the Store also removes its settings, personal dictionary, plug-ins and content packs. Your .opub projects and exported files stay where you saved them.

## What's new in this version

Use the `### <version>` section of `docs/STATUS.md`, shortened (the same source as the GitHub release notes).

## Product features (one per line)

- Opens Microsoft Publisher .pub files from Publisher 2002 to Microsoft 365
- Keeps tables, master pages, linked text boxes and WordArt
- Edit text in place, with Australian English spelling
- Export PDF (vector or CMYK), PNG, JPEG and SVG
- Print booklets, tiled posters and several copies per sheet
- Mail merge from CSV or Excel cells
- Design checker for text that doesn't fit, low-resolution pictures and missing fonts
- Works offline: no account, no uploads

## Search terms

Partner Center allows up to 7. Keep them descriptive. Using another company's trademark as a search term may be refused, so the owner decides on the second one.

1. pub file
2. Publisher file viewer
3. page layout
4. newsletter editor
5. desktop publishing
6. open pub files
7. brochure editor

## Screenshots (desktop, 1440 × 900)

From `site/img/`, retaken with `npm run site:screenshots`:
1. `newsletter.png`: a newsletter made in Microsoft Publisher, opened in OpenPub
2. `check.png`: the design checker finds problems before you print
3. `print-preview.png`: print layouts shows each sheet before it goes to the printer, here as a booklet

## Other fields

- Category: Productivity
- Price: free
- Privacy policy URL: https://sarinityx.github.io/OpenPub/privacy.html
- Website: https://sarinityx.github.io/OpenPub/
- Support contact: https://github.com/sarinityx/OpenPub/issues
- Copyright: © 2026 Sem (as in `LICENSE`). MIT licence.
- Additional licence terms: https://sarinityx.github.io/OpenPub/licence.html
- Age rating: answer the questionnaire (no user content shared, no purchases, no network features).

## Submitting

1. Put the identity from the reservation (Partner Center › the app › Product identity: package identity name, publisher `CN=…`, publisher display name) in `desktop/build/store.json`, set `"placeholder": false` and merge it.
2. Run the release workflow. Download the `OpenPub-store-package` artifact from the run: `OpenPub-<version>-x64.msix`, unsigned (the Store signs it).
3. In Partner Center, create a submission, upload the package, paste this listing, then submit for certification.
