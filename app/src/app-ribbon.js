/* OpenPub – the ribbon. Replaces the drop-down menus and the single toolbar with tabs of grouped,
 * labelled commands, a quick-access strip in the title band and zoom controls in the status bar.
 * Also owns the theme switch (match the system, light, dark). */
var OP = (typeof globalThis.OP !== 'undefined') ? globalThis.OP : (globalThis.OP = {});

(function () {
  'use strict';
  var A = OP.app, S = A.S, $ = A.$, h = A.h;

  A.registerIcons({
    rNew: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M12 11v6M9 14h6"/>',
    rTemplate: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M4 8h16M9 8v13"/>',
    rOpen: '<path d="M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 11h18"/>',
    rSave: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
    rSaveAs: '<path d="M5 3h11l3 3v7M5 3v18h7"/><path d="M8 3v5h7V3"/><path d="M15 20l1-3 4-4 2 2-4 4z"/>',
    rExport: '<path d="M12 3v11M8 10l4 4 4-4"/><path d="M4 15v5h16v-5"/>',
    rPrint: '<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="9" rx="1.5"/><path d="M7 14h10v7H7z"/>',
    rSheets: '<rect x="3" y="4" width="8" height="7"/><rect x="13" y="4" width="8" height="7"/><rect x="3" y="13" width="8" height="7"/><rect x="13" y="13" width="8" height="7"/>',
    rTile: '<rect x="3" y="3" width="18" height="18"/><path d="M3 12h18M12 3v18" stroke-dasharray="2 2"/>',
    rPaste: '<rect x="5" y="4" width="14" height="17" rx="1.5"/><path d="M9 4V2.5h6V4M9 10h6M9 14h6"/>',
    rCut: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8 16.5L18 4M16 16.5L6 4"/>',
    rDup: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    rFwd: '<rect x="9" y="9" width="11" height="11" rx="1"/><path d="M15 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h4" stroke-dasharray="2 2"/>',
    rBwd: '<rect x="4" y="4" width="11" height="11" rx="1" stroke-dasharray="2 2"/><rect x="9" y="9" width="11" height="11" rx="1"/>',
    rCentreH: '<path d="M12 3v18"/><rect x="5" y="8" width="14" height="8" rx="1"/>',
    rCentreV: '<path d="M3 12h18"/><rect x="8" y="5" width="8" height="14" rx="1"/>',
    rFind: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/>',
    rSelAll: '<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="3 2"/><rect x="8" y="8" width="8" height="8"/>',
    rPage: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
    rPageSetup: '<path d="M6 3h8l4 4v14H6z"/><path d="M9 12h6M9 16h6M3 7h3M3 17h3"/>',
    rMaster: '<rect x="4" y="3" width="13" height="16" rx="1"/><path d="M8 7h5M7 21h13V7"/>',
    rGuides: '<path d="M3 8h18M3 16h18M8 3v18M16 3v18"/>',
    rSnap: '<path d="M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4z"/><path d="M6 8h4M14 8h4"/>',
    rClear: '<path d="M4 20h16M7 16l9-11 4 3-9 11H7z"/>',
    rOne: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M8 10l2-1v6M14 10.5v0M14 14.5v0M17 9l-0 6" />',
    rMinus: '<path d="M5 12h14"/>',
    rSpell: '<path d="M4 15l4-10 4 10M5.5 11.5h5"/><path d="M14 16l2.5 3L21 12"/>',
    rMerge: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 7l9 6 9-6"/>',
    rField: '<path d="M8 4c-2 0-3 1-3 3v2c0 1.5-1 3-2 3 1 0 2 1.5 2 3v2c0 2 1 3 3 3M16 4c2 0 3 1 3 3v2c0 1.5 1 3 2 3-1 0-2 1.5-2 3v2c0 2-1 3-3 3"/>',
    rPageNum: '<path d="M6 3h8l4 4v14H6z"/><path d="M10 13l2-1v6"/>',
    rFonts: '<path d="M4 19l5-14 5 14M6 14h6"/><path d="M15 19l2.5-7 2.5 7M16 17h3"/>',
    rPlugin: '<path d="M9 3v4M15 3v4"/><path d="M6 7h12v5a6 6 0 0 1-12 0z"/><path d="M12 18v3"/>',
    rHelp: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17v.2"/>',
    rInfo: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.2"/>',
    rUpdate: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4.5h-4.5"/><path d="M12 8v5l3 2"/>',
    rSun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    rMoon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    rAuto: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
    rChevUp: '<path d="M6 15l6-6 6 6"/>',
    rChevDown: '<path d="M6 9l6 6 6-6"/>',
    rTable: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9.5h18M3 14.5h18M9 4v16M15 4v16"/>',
    rWordArt: '<path d="M4 18c3-9 5-12 8-12s5 3 8 12M7.5 13h9"/>',
    rBlocks: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><path d="M17 14v6M14 17h6"/>',
    rTrash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    rUngroup: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
    rCheck: '<path d="M6 3h8l4 4v6"/><path d="M6 3v18h6"/><path d="M14 3v4h4"/><path d="M14 18l2.5 2.5L21 15"/>',
    rPainter: '<rect x="4" y="3" width="14" height="6" rx="1"/><path d="M18 6h2v5h-8v3"/><rect x="10.5" y="14" width="3" height="7" rx="1"/>'
  });

  // ---------------------------------------------------------------- theme
  function readPref(k, fb) { try { return localStorage.getItem(k) || fb; } catch (e) { return fb; } }
  function writePref(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* not kept */ } }
  A.theme = function () { return readPref('openpub.theme', 'system'); };
  /** 'system' follows the operating system; 'light' and 'dark' force one. */
  A.setTheme = function (t) {
    if (t !== 'light' && t !== 'dark') t = 'system';
    writePref('openpub.theme', t);
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    A.themeChanged();
    if (S.doc) { A.refreshPagesSoon(); A.refreshToolbar(); }
  };
  (function applyStored() { var t = A.theme(); if (t !== 'system') document.documentElement.setAttribute('data-theme', t); })();

  // ---------------------------------------------------------------- ribbon contents
  /** Commands that plug-ins add; shown on the Plug-ins tab. */
  A.pluginCommands = [];
  function fileOpen() { $('fileOpen').click(); }
  function toggle(prop, redraw) { return function () { S[prop] = !S[prop]; A.refreshToolbar(); if (redraw) A.invalidateOverlay(); }; }
  function zoomBy(f) { return function () { A.setZoom(S.view.zoom * f); A.zoomLabel(); }; }
  function alignBtn(id, icon, label, how, tip) { return { id: id, icon: icon, label: label, aria: 'Align ' + label.toLowerCase(), tip: tip, fn: function () { A.align(how); } }; }

  // Align buttons need something to move; distribute needs three or more (a group counts as one).
  var ALIGN_IDS = ['rbAlL', 'rbAlC', 'rbAlR', 'rbAlT', 'rbAlM', 'rbAlB'], DIST_IDS = ['rbDistH', 'rbDistV'];
  function refreshAlign() {
    var n = S.doc && A.alignUnits ? A.alignUnits().length : 0;
    ALIGN_IDS.forEach(function (id) { var el = $(id); if (el) el.disabled = n < 1; });
    DIST_IDS.forEach(function (id) { var el = $(id); if (el) el.disabled = n < 3; });
  }
  var basePanels = A.refreshPanels;
  A.refreshPanels = function () { basePanels.apply(this, arguments); refreshAlign(); };

  function tabs() {
    var desk = !!OP.desktop;
    var shapes = { pop: true };
    return [
      { id: 'file', label: 'File', groups: [
        { title: 'New', items: [
          { id: 'rbNew', icon: 'rNew', label: 'Blank document', lg: true, tip: 'Start a new blank document', fn: function () { A.dlgNew(); } },
          { id: 'rbTemplate', icon: 'rTemplate', label: 'From template', lg: true, tip: 'Start from a template: built in, from a content pack, or one you saved', fn: function () { A.dlgTemplates(); } }] },
        { title: 'Open and save', items: [
          { id: 'rbOpen', icon: 'rOpen', label: 'Open', lg: true, tip: 'Open a Publisher file or an OpenPub project (Ctrl+O)', fn: fileOpen },
          { id: 'rbSave', icon: 'rSave', label: 'Save', lg: true, tip: 'Save the project (Ctrl+S)', fn: function () { A.saveProject(); } },
          [desk ? { id: 'rbSaveAs', icon: 'rSaveAs', label: 'Save as', tip: 'Save the project under a new name (Ctrl+Shift+S)', fn: function () { A.saveProject(true); } } : null,
            { id: 'rbSaveTpl', icon: 'rTemplate', label: 'Save as template', tip: 'Keep this document as a template for new documents', fn: function () { A.saveAsTemplate(); } }]] },
        { title: 'Output', items: [
          { id: 'rbExport', icon: 'rExport', label: 'Export', lg: true, tip: 'Export PDF, PNG, JPEG or SVG', fn: function () { A.dlgExport(); } },
          desk ? { id: 'rbPrint', icon: 'rPrint', label: 'Print', lg: true, tip: 'Print with the Windows print dialog (Ctrl+P)', fn: function () { A.printNow(); } } : null,
          [{ id: 'rbSheets', icon: 'rSheets', label: 'Print layouts and PDF', tip: 'Copies per sheet, booklets, CMYK and mail-merge output (Ctrl+Shift+P)', fn: function () { A.dlgSheets('print'); } },
            { id: 'rbTile', icon: 'rTile', label: 'Tiled poster', tip: 'Print a large poster across several sheets', fn: function () { A.dlgTile(); } }]] },
        { title: 'Help', items: [[
          { id: 'rbKeys', icon: 'rHelp', label: 'Shortcuts and tips', fn: function () { A.dlgHelp(); } },
          { id: 'rbAbout', icon: 'rInfo', label: 'What works and what does not', fn: function () { A.dlgAbout(); } },
          desk ? { id: 'rbUpdates', icon: 'rUpdate', label: 'Check for updates', tip: 'Check GitHub for a new version of OpenPub now', fn: function () { A.checkForUpdates(); } } : null]] }] },
      { id: 'home', label: 'Home', groups: [
        { title: 'Clipboard', items: [
          { id: 'rbPaste', icon: 'rPaste', label: 'Paste', lg: true, tip: 'Paste (Ctrl+V)', fn: function () { A.paste(); } },
          [{ id: 'rbCut', icon: 'rCut', label: 'Cut', tip: 'Cut (Ctrl+X)', fn: function () { A.cut(); } },
            { id: 'rbCopy', icon: 'copy', label: 'Copy', tip: 'Copy (Ctrl+C)', fn: function () { A.copy(); } },
            { id: 'rbDup', icon: 'rDup', label: 'Duplicate', tip: 'Duplicate (Ctrl+D)', fn: function () { A.duplicate(); } }],
          { id: 'rbPainter', icon: 'rPainter', label: 'Format painter', lg: true,
            tip: 'Copy formatting from the selected object, then click another object to apply it. Double-click to keep it on until Esc. Keys: Ctrl+Shift+C to copy, Ctrl+Shift+V to apply',
            fn: function () { if (S.painter) A.stopPainter(); else A.startPainter(false); }, dbl: function () { A.startPainter(true); } }] },
        { title: 'Tools', items: [
          { id: 'tbSelect', icon: 'cursor', label: 'Select', lg: true, tip: 'Select and move (V)', fn: function () { A.setTool('select'); } },
          { id: 'tbText', icon: 'text', label: 'Text box', lg: true, tip: 'Text box: drag on the page (T)', fn: function () { A.setTool('text'); } },
          { id: 'tbImage', icon: 'image', label: 'Picture', lg: true, tip: 'Insert pictures from your computer', fn: function () { $('fileImage').click(); } },
          shapes,
          { id: 'tbLine', icon: 'line', label: 'Line', lg: true, tip: 'Line: drag on the page (L)', fn: function () { A.setTool('line'); } }] },
        { title: 'Arrange', items: [
          [{ id: 'rbFront', icon: 'front', label: 'Bring to front', tip: 'Ctrl+Shift+]', fn: function () { A.order('front'); } },
            { id: 'rbFwd', icon: 'rFwd', label: 'Bring forward', tip: 'Ctrl+]', fn: function () { A.order('fwd'); } },
            { id: 'rbBwd', icon: 'rBwd', label: 'Send backward', tip: 'Ctrl+[', fn: function () { A.order('bwd'); } }],
          [{ id: 'rbBack', icon: 'back', label: 'Send to back', tip: 'Ctrl+Shift+[', fn: function () { A.order('back'); } },
            { id: 'rbGroup', icon: 'group', label: 'Group', tip: 'Ctrl+G', fn: function () { A.group(); } },
            { id: 'rbUngroup', icon: 'rUngroup', label: 'Ungroup', tip: 'Ctrl+Shift+G', fn: function () { A.ungroup(); } }],
          [{ id: 'rbLock', icon: 'lock', label: 'Lock or unlock', fn: function () { A.toggleLock(); } },
            { id: 'rbCh', icon: 'rCentreH', label: 'Centre across page', fn: function () { A.centreOnPage('c'); } },
            { id: 'rbCv', icon: 'rCentreV', label: 'Centre down page', fn: function () { A.centreOnPage('m'); } }]] },
        { title: 'Align', items: [
          [alignBtn('rbAlL', 'alL', 'Left', 'l', 'Align left: line up left edges. With one object, move it to the left of the page'),
            alignBtn('rbAlC', 'alC', 'Centre', 'c', 'Align centre: line up centres across. With one object, centre it across the page'),
            alignBtn('rbAlR', 'alR', 'Right', 'r', 'Align right: line up right edges. With one object, move it to the right of the page')],
          [alignBtn('rbAlT', 'alT', 'Top', 't', 'Align top: line up top edges. With one object, move it to the top of the page'),
            alignBtn('rbAlM', 'alM', 'Middle', 'm', 'Align middle: line up middles down. With one object, centre it down the page'),
            alignBtn('rbAlB', 'alB', 'Bottom', 'b', 'Align bottom: line up bottom edges. With one object, move it to the bottom of the page')],
          [{ id: 'rbDistH', icon: 'distH', label: 'Space across', aria: 'Space evenly across', tip: 'Space evenly across: even gaps from left to right (three or more objects)', fn: function () { A.distribute('h'); } },
            { id: 'rbDistV', icon: 'distV', label: 'Space down', aria: 'Space evenly down', tip: 'Space evenly down: even gaps from top to bottom (three or more objects)', fn: function () { A.distribute('v'); } }]] },
        { title: 'Editing', items: [[
          { id: 'rbFind', icon: 'rFind', label: 'Find and replace', tip: 'Ctrl+F', fn: function () { A.dlgFind(); } },
          { id: 'rbSelAll', icon: 'rSelAll', label: 'Select all', tip: 'Ctrl+A', fn: function () { A.selectAll(); } },
          { id: 'rbDelete', icon: 'rTrash', label: 'Delete', tip: 'Del', fn: function () { A.deleteSel(); } }]] }] },
      { id: 'insert', label: 'Insert', groups: [
        { title: 'Pages', items: [
          { id: 'rbPage', icon: 'rPage', label: 'Blank page', lg: true, tip: 'Add a page after this one', fn: function () { A.addPage(); } },
          [{ id: 'rbDupPage', icon: 'rDup', label: 'Duplicate page', fn: function () { A.dupPage(); } }]] },
        { title: 'Tables', items: [{ id: 'tbTable', icon: 'rTable', label: 'Table', lg: true, tip: 'Insert a table', fn: function () { A.dlgTable(); } }] },
        { title: 'Illustrations', items: [
          { id: 'tbImage', icon: 'image', label: 'Picture', lg: true, tip: 'Insert pictures from your computer', fn: function () { $('fileImage').click(); } },
          shapes,
          { id: 'tbLine', icon: 'line', label: 'Line', lg: true, tip: 'Line: drag on the page (L)', fn: function () { A.setTool('line'); } }] },
        { title: 'Text', items: [
          { id: 'tbText', icon: 'text', label: 'Text box', lg: true, tip: 'Text box: drag on the page (T)', fn: function () { A.setTool('text'); } },
          { id: 'tbWordArt', icon: 'rWordArt', label: 'WordArt', lg: true, tip: 'Text bent into a shape', fn: function () { A.insertWordArt(); } },
          [{ id: 'rbPageNum', icon: 'rPageNum', label: 'Page number', tip: 'Insert the page number field', fn: function () { A.insertField('page'); } },
            { id: 'rbFieldIns', icon: 'rField', label: 'Merge field', tip: 'Insert a mail-merge field', fn: function () { A.dlgMerge(); } }]] },
        { title: 'Building blocks', items: [{ id: 'tbBlocks', icon: 'rBlocks', label: 'Building blocks', lg: true, tip: 'Ready-made headings, calendars, coupons and your own saved blocks', fn: function () { A.dlgBlocks(); } }] }] },
      { id: 'design', label: 'Page design', groups: [
        { title: 'Page', items: [{ id: 'rbSetup', icon: 'rPageSetup', label: 'Page setup', lg: true, tip: 'Size, margins, bleed and paper colour', fn: function () { A.setSel([]); A.showTab('props'); } }] },
        { title: 'Master page', items: [{ id: 'rbMaster', icon: 'rMaster', label: 'Edit master page', lg: true, tip: 'Edit what repeats on every page', fn: function () { A.toggleMaster(); } }] },
        { title: 'Layout guides', items: [[
          { id: 'tbGuides', icon: 'rGuides', label: 'Show guides', tip: 'Show guides, margins and bleed', fn: toggle('guides', true) },
          { id: 'tbSnap', icon: 'rSnap', label: 'Snap to guides and objects', tip: 'Hold Alt while dragging to switch off briefly', fn: toggle('snap', false) },
          { id: 'rbClearGuides', icon: 'rClear', label: 'Clear ruler guides', fn: function () { A.page().guides = { h: [], v: [] }; A.commit(); A.invalidateOverlay(); } }]] }] },
      { id: 'mail', label: 'Mailings', groups: [
        { title: 'Mail merge', items: [
          { id: 'rbMerge', icon: 'rMerge', label: 'Recipients and fields', lg: true, tip: 'Load a list and insert fields', fn: function () { A.dlgMerge(); } },
          { id: 'rbMergeOut', icon: 'rExport', label: 'Finish and export', lg: true, tip: 'One copy per record, as PDF or on the printer', fn: function () { A.dlgSheets('merge'); } }] }] },
      { id: 'review', label: 'Review', groups: [
        { title: 'Proofing', items: [
          { id: 'rbSpell', icon: 'rSpell', label: 'Spelling', lg: true, tip: 'Check spelling with the Australian English dictionary (F7)', fn: function () { A.dlgSpell(); } },
          { id: 'rbFind', icon: 'rFind', label: 'Find and replace', lg: true, tip: 'Ctrl+F', fn: function () { A.dlgFind(); } }] },
        { title: 'Design', items: [
          { id: 'rbCheck', icon: 'rCheck', label: 'Check design', lg: true, tip: 'Find text that does not fit, low-resolution pictures, objects off the page and more before you print', fn: function () { A.checkDesign(); } }] }] },
      { id: 'view', label: 'View', groups: [
        { title: 'Zoom', items: [
          { id: 'rbFit', icon: 'fit', label: 'Fit page', lg: true, tip: 'Ctrl+0', fn: function () { A.fit(); A.zoomLabel(); } },
          { id: 'rbOne', icon: 'rOne', label: 'Actual size', lg: true, tip: 'Ctrl+1', fn: function () { A.setZoom(96 / 72); A.zoomLabel(); } },
          [{ id: 'rbZin', icon: 'plus', label: 'Zoom in', fn: zoomBy(1.25) }, { id: 'rbZout', icon: 'rMinus', label: 'Zoom out', fn: zoomBy(0.8) }]] },
        { title: 'Show', items: [[
          { id: 'tbGuides', icon: 'rGuides', label: 'Guides', fn: toggle('guides', true) },
          { id: 'tbSnap', icon: 'rSnap', label: 'Snapping', fn: toggle('snap', false) }]] },
        { title: 'Theme', items: [[
          { id: 'rbThSys', icon: 'rAuto', label: 'Match the system', fn: function () { A.setTheme('system'); } },
          { id: 'rbThLight', icon: 'rSun', label: 'Light', fn: function () { A.setTheme('light'); } },
          { id: 'rbThDark', icon: 'rMoon', label: 'Dark', fn: function () { A.setTheme('dark'); } }]] },
        { title: 'Fonts', items: [[
          { id: 'rbFonts', icon: 'rFonts', label: 'Reload installed fonts', tip: 'Read the fonts installed on this computer into the font list again', fn: function () { A.loadLocalFonts(); } }]] }] },
      { id: 'plugins', label: 'Plug-ins', groups: [
        { title: 'Manage', items: [{ id: 'rbPlugins', icon: 'rPlugin', label: 'Plug-ins and content packs', lg: true, tip: 'Install, switch off or remove plug-ins and content packs', fn: function () { A.dlgPlugins(); } }] },
        { title: 'Commands', hint: 'Commands added by plug-ins appear here.', items: A.pluginCommands.map(function (c, i) {
          return { id: 'rbPc' + i, icon: c.icon || 'rPlugin', label: c.label, lg: true, tip: c.tip || c.label, fn: function () { A.runPluginCommand(c); } };
        }) }] }
    ];
  }

  // ---------------------------------------------------------------- building
  var active = readPref('openpub.ribbonTab', 'home');
  function button(d) {
    var b = h('button', { type: 'button', class: 'rb-btn' + (d.lg ? ' lg' : ''), id: d.id, title: d.tip || d.label, 'aria-label': d.aria || d.label,
      html: A.icon(d.icon) + '<span class="lbl">' + OP.escXml(d.label) + '</span>', onclick: function (e) { A.closeMenus(); d.fn(e); },
      ondblclick: d.dbl ? function (e) { A.closeMenus(); d.dbl(e); } : null });
    return b;
  }
  function shapesButton() {
    var grid = h('div', { class: 'pop-panel', id: 'shapegrid' }, OP.SHAPE_MENU.map(function (k) {
      var d = OP.shapePath({ type: 'shape', kind: k, w: 20, h: 20 });
      return h('button', { type: 'button', class: 'shape-btn', title: OP.SHAPE_KINDS[k].label, 'aria-label': OP.SHAPE_KINDS[k].label,
        html: '<svg viewBox="-2 -2 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>',
        onclick: function () { $('shapepop').classList.remove('open'); A.setTool('shape', k); } });
    }));
    var btn = h('button', { type: 'button', class: 'rb-btn lg', id: 'tbShape', title: 'Shapes: pick one, then drag on the page', 'aria-label': 'Shapes', 'aria-haspopup': 'true',
      html: A.icon('shape') + '<span class="lbl">Shapes</span>', onclick: function (e) {
        e.stopPropagation();
        var pop = $('shapepop'), open = pop.classList.contains('open');
        A.closeMenus();
        if (!open) { var r = btn.getBoundingClientRect(); grid.style.left = Math.max(6, Math.min(r.left, window.innerWidth - 270)) + 'px'; grid.style.top = (r.bottom + 4) + 'px'; pop.classList.add('open'); }
      } });
    return h('div', { class: 'pop', id: 'shapepop' }, [btn, grid]);
  }
  function renderBody() {
    var body = $('rbBody'), def = tabs().filter(function (t) { return t.id === active; })[0];
    body.innerHTML = '';
    if (!def) return;
    body.setAttribute('aria-labelledby', 'rt-' + def.id);
    def.groups.forEach(function (g) {
      var kids = [];
      g.items.forEach(function (it) {
        if (!it) return;
        if (Array.isArray(it)) { var col = it.filter(Boolean).map(button); if (col.length) kids.push(h('div', { class: 'rb-col' }, col)); }
        else if (it.pop) kids.push(shapesButton());
        else kids.push(button(it));
      });
      if (!kids.length && g.hint) kids.push(h('p', { class: 'rb-hint', text: g.hint }));
      if (!kids.length) return;
      body.appendChild(h('div', { class: 'rb-group', role: 'group', 'aria-label': g.title }, [h('div', { class: 'rb-items' }, kids), h('div', { class: 'rb-title', text: g.title })]));
    });
    A.refreshToolbar();
    refreshAlign();
  }
  /** Show a ribbon tab by id ('file', 'home', 'insert', 'design', 'mail', 'review', 'view', 'plugins'). */
  A.ribbonTab = function (id) {
    active = id; writePref('openpub.ribbonTab', id);
    Array.prototype.forEach.call(document.querySelectorAll('.rb-tab'), function (t) {
      var on = t.id === 'rt-' + id;
      t.classList.toggle('on', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1;
    });
    $('toolbar').classList.remove('collapsed');
    renderBody();
  };
  A.refreshRibbon = function () { if ($('rbBody')) renderBody(); };
  function setCollapsed(on) {
    $('toolbar').classList.toggle('collapsed', on);
    writePref('openpub.ribbonCollapsed', on ? '1' : '0');
    var c = $('rbCollapse');
    if (c) { c.innerHTML = A.icon(on ? 'rChevDown' : 'rChevUp'); c.title = on ? 'Show the ribbon (Ctrl+F1)' : 'Hide the ribbon (Ctrl+F1)'; c.setAttribute('aria-label', c.title); }
    setTimeout(function () { A.resize(); }, 0);
  }

  A.buildMenus = function () {
    var m = $('menus');
    if (m) m.hidden = true;
    document.addEventListener('click', function () { A.closeMenus(); });
  };
  A.buildToolbar = function () {
    var tb = $('toolbar'), list = tabs();
    tb.innerHTML = '';
    tb.className = 'ribbon';
    if (!list.some(function (t) { return t.id === active; })) active = 'home';
    var strip = h('div', { class: 'rb-tabs', role: 'tablist', 'aria-label': 'Ribbon' }, list.map(function (t) {
      return h('button', { type: 'button', class: 'rb-tab', id: 'rt-' + t.id, role: 'tab', text: t.label, 'aria-controls': 'rbBody',
        onclick: function () { A.ribbonTab(t.id); }, ondblclick: function () { setCollapsed(!tb.classList.contains('collapsed')); } });
    }));
    strip.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var ids = list.map(function (t) { return t.id; }), i = ids.indexOf(active) + (e.key === 'ArrowRight' ? 1 : -1);
      i = (i + ids.length) % ids.length;
      A.ribbonTab(ids[i]); $('rt-' + ids[i]).focus();
      e.preventDefault();
    });
    strip.appendChild(h('button', { type: 'button', class: 'rb-collapse', id: 'rbCollapse', onclick: function () { setCollapsed(!tb.classList.contains('collapsed')); } }));
    tb.appendChild(strip);
    tb.appendChild(h('div', { class: 'rb-body', id: 'rbBody', role: 'tabpanel' }));

    // quick access: always visible, whatever tab is open
    var qat = $('qat');
    if (qat) {
      qat.innerHTML = '';
      [['qaSave', 'rSave', 'Save (Ctrl+S)', function () { A.saveProject(); }], ['tbUndo', 'undo', 'Undo (Ctrl+Z)', A.undo], ['tbRedo', 'redo', 'Redo (Ctrl+Y)', A.redo]].forEach(function (q) {
        qat.appendChild(h('button', { type: 'button', class: 'qa-btn', id: q[0], title: q[2], 'aria-label': q[2], html: A.icon(q[1]), onclick: q[3] }));
      });
    }
    var zc = $('zoomctl');
    if (zc) {
      zc.innerHTML = '';
      zc.appendChild(h('button', { type: 'button', class: 'qa-btn', id: 'tbZoomOut', title: 'Zoom out', 'aria-label': 'Zoom out', html: A.icon('rMinus'), onclick: zoomBy(0.8) }));
      zc.appendChild(h('span', { id: 'zoomlbl', title: 'Zoom (Ctrl + mouse wheel)' }));
      zc.appendChild(h('button', { type: 'button', class: 'qa-btn', id: 'tbZoomIn', title: 'Zoom in', 'aria-label': 'Zoom in', html: A.icon('plus'), onclick: zoomBy(1.25) }));
      zc.appendChild(h('button', { type: 'button', class: 'qa-btn', id: 'tbFit', title: 'Fit page in window (Ctrl+0)', 'aria-label': 'Fit page', html: A.icon('fit'), onclick: function () { A.fit(); A.zoomLabel(); } }));
    }
    A.ribbonTab(active);
    setCollapsed(readPref('openpub.ribbonCollapsed', '0') === '1');
    A.zoomLabel();
  };

  var baseRefresh = A.refreshToolbar;
  A.refreshToolbar = function () {
    baseRefresh();
    var th = A.theme(), map = { rbThSys: th === 'system', rbThLight: th === 'light', rbThDark: th === 'dark', rbMaster: !!S.master, rbPainter: !!S.painter };
    Object.keys(map).forEach(function (id) { var el = $(id); if (el) { el.classList.toggle('on', map[id]); el.setAttribute('aria-pressed', map[id] ? 'true' : 'false'); } });
    ['tbSelect', 'tbText', 'tbShape', 'tbLine', 'tbSnap', 'tbGuides'].forEach(function (id) { var el = $(id); if (el) el.setAttribute('aria-pressed', el.classList.contains('on') ? 'true' : 'false'); });
  };

  window.addEventListener('keydown', function (e) {
    if (e.key === 'F1' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setCollapsed(!$('toolbar').classList.contains('collapsed')); }
  }, true);
})();
