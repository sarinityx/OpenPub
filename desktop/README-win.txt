OpenPub 1.2.1 - a page-layout editor that opens Microsoft Publisher (.pub) files
================================================================================

INSTALL
  Two ways, both the same app:

  Installer (OpenPub-<version>-win64-setup.exe)
    Choose "Only for me" (no administrator rights needed) or "Anyone who uses
    this computer". It adds OpenPub to the Start menu and to Settings > Apps,
    opens .opub projects on double-click, and adds OpenPub to "Open with" for
    .pub files. Your default program for .pub files is not changed.
    Uninstall from Settings > Apps; it asks whether to keep your settings and
    personal dictionary (kept unless you say otherwise).
    Silent install, e.g. for IT departments:
      OpenPub-<version>-win64-setup.exe /S /currentuser    (for one user)
      OpenPub-<version>-win64-setup.exe /S /allusers       (all users, as administrator)
    Silent uninstall: "Uninstall OpenPub.exe" /S in the install folder; add
    --delete-app-data to remove settings too.

  Portable folder (OpenPub-<version>-win64.zip)
    Unzip and double-click OpenPub.exe. Nothing is installed; keep the folder
    together (the .exe needs the files beside it). You can move the whole
    folder anywhere and pin OpenPub.exe to the taskbar.

  Windows SmartScreen may warn the first time because the app is not signed.
  Choose "More info" > "Run anyway".

OPEN .PUB FILES BY DOUBLE-CLICK
  Right-click a .pub file > Open with > Choose another app > OpenPub (portable
  version: "Choose an app on your PC" > select OpenPub.exe) > tick "Always".
  If OpenPub is already open, the file opens in that window; you are asked
  first if the open document has unsaved changes.

WHAT IT SAVES
  .pub files are imported and never changed. Your work is saved as an .opub
  project (File > Save project) and exported as PDF, PNG, JPEG or SVG.
  Saving back to .pub is not possible.

PRIVACY
  Files are processed on this computer. The app makes no internet connections,
  except that Windows may download a spelling dictionary for the red underlines
  if the English (Australia) language pack is not installed. The Tools >
  Spelling checker uses a dictionary bundled in the app and works offline.

FONTS
  Every font installed on this computer is in the font list automatically.
  After installing a new font, use View > Reload installed fonts.

PLUG-INS AND CONTENT PACKS
  Plug-ins tab > Plug-ins and content packs. The "examples" folder here has a
  sample plug-in, a sample content pack and PLUGINS.md, which documents both.
  A plug-in is a program: install only plug-ins from people you trust.

CMYK FOR PRINT SHOPS
  File > Print layouts and PDF > Output > "Vector PDF, CMYK" needs Ghostscript,
  which is free (AGPL licence) but is not included with OpenPub. Install it
  from ghostscript.com; OpenPub finds it automatically, or use "Locate
  Ghostscript". Choose the .icc output profile your printer asks for.

HELP
  Help > Shortcuts and tips, and Help > What works and what does not.

LICENCES
  Electron and Chromium: LICENSE and LICENSES.chromium.html in this folder.
  Australian English dictionary (dictionary-en-au) and nspell: see their
  licence files inside resources\app.asar (dict\en-AU-LICENSE.txt).
