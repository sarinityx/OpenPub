// OpenPub desktop shell: window, native file dialogs, vector PDF, printing and spelling.
'use strict';
const { app, BrowserWindow, dialog, ipcMain, Menu, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const { pureBlackToGray } = require('./pdfblack');

let win = null;
let pendingFile = null;   // file passed on the command line before the window was ready
let pageAsked = false;    // the page has asked for pendingFile, so it is listening for "file:opened"
let closing = false;
let lastDir = null;
const knownPaths = new Set(); // files the user picked in a dialog or opened; only these may be overwritten without asking

const DOC_EXT = /\.(pub|opub|json)$/i;
function fileFromArgv(argv) {
  for (const a of argv.slice(1)) {
    if (a && !a.startsWith('-') && DOC_EXT.test(a)) { try { if (fs.statSync(a).isFile()) return path.resolve(a); } catch (e) { /* not a file */ } }
  }
  return null;
}
function readDoc(p) {
  knownPaths.add(p);
  try { return { name: path.basename(p), path: p, bytes: new Uint8Array(fs.readFileSync(p)) }; }
  catch (e) { return { name: path.basename(p), path: p, error: e.message }; }
}
function startDir() {
  if (lastDir && fs.existsSync(lastDir)) return lastDir;
  try { return app.getPath('documents'); } catch (e) { return os.homedir(); }
}

// the same ID as the installer's Start menu shortcut, so Windows groups the window with it on the taskbar
if (process.platform === 'win32') app.setAppUserModelId('org.openpub.desktop');

// One window. A file double-clicked while OpenPub is open goes to that window, which asks about unsaved changes.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    const f = fileFromArgv(argv);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    if (!f) return;
    if (win && pageAsked) win.webContents.send('file:opened', readDoc(f));
    else { pendingFile = f; knownPaths.add(f); } // still starting: the page asks for it once it is ready
  });
  app.whenReady().then(start);
}
app.on('window-all-closed', () => app.quit());

function start() {
  pendingFile = fileFromArgv(process.argv) || pendingFile;
  if (pendingFile) knownPaths.add(pendingFile);
  const ses = session.defaultSession;
  // the font list ("Add installed fonts") needs this permission; nothing else is granted
  ses.setPermissionRequestHandler((wc, permission, cb) => cb(permission === 'local-fonts'));
  ses.setPermissionCheckHandler((wc, permission) => permission === 'local-fonts');
  try { ses.setSpellCheckerLanguages(['en-AU']); } catch (e) { try { ses.setSpellCheckerLanguages(['en-GB']); } catch (e2) { /* use the system default */ } }

  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 600, show: false, backgroundColor: '#f7f5f0', title: 'OpenPub',
    autoHideMenuBar: true, icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true }
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Window', submenu: [{ role: 'togglefullscreen' }, { role: 'toggleDevTools', accelerator: 'Ctrl+Shift+I' }, { role: 'quit' }] }
  ]));
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'app', 'OpenPub.html'));
  win.once('ready-to-show', () => { win.show(); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault()); // a file dropped outside the page must not replace the app

  // right-click in text: spelling suggestions and clipboard commands
  win.webContents.on('context-menu', (e, params) => {
    if (!params.isEditable) return;
    const items = [];
    (params.dictionarySuggestions || []).slice(0, 6).forEach((s) => items.push({ label: s, click: () => win.webContents.replaceMisspelling(s) }));
    if (params.misspelledWord) {
      if (!items.length) items.push({ label: 'No suggestions', enabled: false });
      items.push({ label: 'Add “' + params.misspelledWord + '” to dictionary', click: () => { win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord); personalAdd(params.misspelledWord); } });
      items.push({ type: 'separator' });
    }
    items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' }, { role: 'selectAll' });
    Menu.buildFromTemplate(items).popup({ window: win });
  });

  // unsaved work: ask before the window closes
  win.on('close', async (e) => {
    if (closing) return;
    e.preventDefault();
    let dirty = false;
    try { dirty = await win.webContents.executeJavaScript('!!(window.OP && OP.app && OP.app.S && OP.app.S.dirty)'); } catch (err) { dirty = false; }
    if (dirty) {
      const r = await dialog.showMessageBox(win, { type: 'question', buttons: ['Save', "Don't save", 'Cancel'], defaultId: 0, cancelId: 2, noLink: true,
        message: 'Save changes before closing?', detail: 'Your changes will be lost if you do not save them.' });
      if (r.response === 2) return;
      if (r.response === 0) {
        let ok = false;
        try { ok = await win.webContents.executeJavaScript('OP.app.saveProject()'); } catch (err) { ok = false; }
        if (!ok) return;
      }
    }
    closing = true;
    win.close();
  });
}

// ---------------------------------------------------------------- files
ipcMain.handle('file:initial', () => { pageAsked = true; const f = pendingFile; pendingFile = null; return f ? readDoc(f) : null; });
ipcMain.handle('file:open', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Open', defaultPath: startDir(), properties: ['openFile'],
    filters: [{ name: 'Publisher files and OpenPub projects', extensions: ['pub', 'opub'] }, { name: 'Publisher files', extensions: ['pub'] }, { name: 'OpenPub projects', extensions: ['opub', 'json'] }, { name: 'All files', extensions: ['*'] }] });
  if (r.canceled || !r.filePaths.length) return null;
  lastDir = path.dirname(r.filePaths[0]);
  return readDoc(r.filePaths[0]);
});
const FILTERS = { opub: 'OpenPub project', pdf: 'PDF document', png: 'PNG picture', jpg: 'JPEG picture', svg: 'SVG drawing', zip: 'ZIP archive' };
ipcMain.handle('file:save', async (e, o) => {
  try {
    // a path is honoured only if the user chose it in a dialog this session (plug-ins run in the page)
    let target = (o.path && knownPaths.has(o.path)) ? o.path : null;
    if (!target) {
      const ext = (path.extname(o.name || '').slice(1) || 'bin').toLowerCase();
      const r = await dialog.showSaveDialog(win, { title: 'Save', defaultPath: path.join(startDir(), o.name || 'Untitled'),
        filters: [{ name: FILTERS[ext] || ext.toUpperCase() + ' file', extensions: [ext] }] });
      if (r.canceled || !r.filePath) return { cancelled: true };
      target = r.filePath;
    }
    fs.writeFileSync(target, Buffer.from(o.bytes));
    knownPaths.add(target);
    lastDir = path.dirname(target);
    return { path: target, name: path.basename(target) };
  } catch (err) { return { error: 'The file could not be saved: ' + err.message }; }
});

// ---------------------------------------------------------------- PDF and printing
async function withSheetWindow(o, fn) {
  const tmp = path.join(app.getPath('temp'), 'openpub-print-' + process.pid + '-' + Date.now() + '.html');
  fs.writeFileSync(tmp, o.html, 'utf8');
  const w = new BrowserWindow({ show: false, width: 1000, height: 800, webPreferences: { sandbox: true, contextIsolation: true, javascript: true } });
  try {
    await w.loadFile(tmp);
    try { await w.webContents.executeJavaScript('document.fonts.ready.then(function () { return Promise.all(Array.prototype.map.call(document.images, function (i) { return i.decode ? i.decode().catch(function () {}) : null; })); }).then(function () { return true; })'); } catch (e) { /* carry on */ }
    return await fn(w);
  } finally {
    if (!w.isDestroyed()) w.destroy();
    fs.unlink(tmp, () => {});
  }
}
ipcMain.handle('pdf:vector', async (e, o) => {
  try {
    const data = await withSheetWindow(o, (w) => w.webContents.printToPDF({
      printBackground: true, preferCSSPageSize: true, margins: { top: 0, bottom: 0, left: 0, right: 0 },
      pageSize: { width: Math.max(0.5, o.wMm / 25.4), height: Math.max(0.5, o.hMm / 25.4) }
    }));
    return { bytes: new Uint8Array(data) };
  } catch (err) { return { error: 'The PDF could not be made: ' + err.message }; }
});
ipcMain.handle('print', async (e, o) => {
  try {
    return await withSheetWindow(o, (w) => new Promise((resolve) => {
      w.webContents.print({ silent: false, printBackground: true, margins: { marginType: 'none' },
        pageSize: { width: Math.round(o.wMm * 1000), height: Math.round(o.hMm * 1000) } },
      (ok, reason) => resolve(ok ? { ok: true } : (reason && !/cancel/i.test(reason) ? { error: 'Printing failed: ' + reason } : { cancelled: true })));
    }));
  } catch (err) { return { error: 'Printing failed: ' + err.message }; }
});

// ---------------------------------------------------------------- CMYK through Ghostscript (not bundled; used when installed)
function settingsPath() { return path.join(app.getPath('userData'), 'settings.json'); }
function readSettings() { try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) || {}; } catch (e) { return {}; } }
function writeSettings(patch) {
  const s = Object.assign(readSettings(), patch);
  try { fs.mkdirSync(path.dirname(settingsPath()), { recursive: true }); fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2), 'utf8'); } catch (e) { /* best effort */ }
  return s;
}
function isFile(p) { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }
function findGhostscript() {
  const set = readSettings();
  if (set.gsPath && isFile(set.gsPath)) return set.gsPath;
  const names = process.platform === 'win32' ? ['gswin64c.exe', 'gswin32c.exe', 'gs.exe'] : ['gs'];
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    for (const n of names) { if (dir && isFile(path.join(dir, n))) return path.join(dir, n); }
  }
  if (process.platform === 'win32') {
    const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramW6432].filter(Boolean);
    for (const root of roots) {
      let versions = [];
      try { versions = fs.readdirSync(path.join(root, 'gs')).sort().reverse(); } catch (e) { versions = []; }
      for (const v of versions) for (const n of names) { const c = path.join(root, 'gs', v, 'bin', n); if (isFile(c)) return c; }
    }
  }
  return null;
}
function gsStatus() {
  const gs = findGhostscript(), set = readSettings();
  let version = '';
  if (gs) { try { version = String(spawnSync(gs, ['--version'], { encoding: 'utf8', timeout: 15000, windowsHide: true }).stdout || '').trim().split(/\s+/)[0]; } catch (e) { version = ''; } }
  const icc = set.iccPath && isFile(set.iccPath) ? set.iccPath : null;
  return { found: !!gs && !!version, path: gs, version: version, icc: icc, iccName: icc ? path.basename(icc) : '' };
}
ipcMain.handle('gs:status', () => gsStatus());
ipcMain.handle('gs:pick', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Locate Ghostscript (gswin64c.exe)', properties: ['openFile'],
    defaultPath: process.platform === 'win32' ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'gs') : '/usr/bin',
    filters: process.platform === 'win32' ? [{ name: 'Ghostscript', extensions: ['exe'] }] : [{ name: 'All files', extensions: ['*'] }] });
  if (!r.canceled && r.filePaths.length) writeSettings({ gsPath: r.filePaths[0] });
  return gsStatus();
});
ipcMain.handle('icc:pick', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Choose a CMYK output profile', properties: ['openFile'],
    defaultPath: process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'spool', 'drivers', 'color') : startDir(),
    filters: [{ name: 'ICC colour profiles', extensions: ['icc', 'icm'] }] });
  if (r.canceled || !r.filePaths.length) return null;
  writeSettings({ iccPath: r.filePaths[0] });
  return gsStatus();
});
ipcMain.handle('icc:clear', () => { writeSettings({ iccPath: null }); return gsStatus(); });
ipcMain.handle('pdf:cmyk', async (e, o) => {
  const st = gsStatus();
  if (!st.found) return { error: 'Ghostscript was not found on this computer.' };
  const stamp = process.pid + '-' + Date.now();
  const src = path.join(app.getPath('temp'), 'openpub-rgb-' + stamp + '.pdf'), out = path.join(app.getPath('temp'), 'openpub-cmyk-' + stamp + '.pdf');
  try {
    const data = await withSheetWindow(o, (w) => w.webContents.printToPDF({
      printBackground: true, preferCSSPageSize: true, margins: { top: 0, bottom: 0, left: 0, right: 0 },
      pageSize: { width: Math.max(0.5, o.wMm / 25.4), height: Math.max(0.5, o.hMm / 25.4) }
    }));
    // pure black is handed to Ghostscript as grey so it stays on the black plate only
    fs.writeFileSync(src, o.keepBlack === false ? data : pureBlackToGray(Buffer.from(data)));
    const args = ['-dSAFER', '-dBATCH', '-dNOPAUSE', '-dQUIET', '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.4',
      '-sColorConversionStrategy=CMYK', '-dProcessColorModel=/DeviceCMYK', '-dOverrideICC=true'];
    if (st.icc) args.push('--permit-file-read=' + st.icc, '-sOutputICCProfile=' + st.icc);
    args.push('-sOutputFile=' + out, src);
    const res = await new Promise((resolve) => {
      let err = '';
      const child = spawn(st.path, args, { windowsHide: true });
      const timer = setTimeout(() => { try { child.kill(); } catch (e2) { /* gone */ } resolve({ code: -1, err: 'Ghostscript took longer than five minutes and was stopped.' }); }, 300000);
      child.stderr.on('data', (d) => { err += d; });
      child.stdout.on('data', (d) => { err += d; });
      child.on('error', (e2) => { clearTimeout(timer); resolve({ code: -1, err: e2.message }); });
      child.on('close', (code) => { clearTimeout(timer); resolve({ code: code, err: err }); });
    });
    if (res.code !== 0 || !isFile(out)) return { error: 'Ghostscript could not convert the PDF' + (res.err ? ': ' + String(res.err).trim().split(/\r?\n/).slice(-3).join(' ') : '.') };
    return { bytes: new Uint8Array(fs.readFileSync(out)), profile: st.iccName || 'Ghostscript default CMYK', version: st.version };
  } catch (err) { return { error: 'The CMYK PDF could not be made: ' + err.message }; } finally {
    fs.unlink(src, () => {}); fs.unlink(out, () => {});
  }
});

// ---------------------------------------------------------------- spelling (Australian English)
let speller = null;
function personalPath() { return path.join(app.getPath('userData'), 'personal-dictionary.txt'); }
function personalWords() { try { return fs.readFileSync(personalPath(), 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean); } catch (e) { return []; } }
function personalAdd(word) {
  word = String(word || '').trim();
  if (!word) return;
  const all = personalWords();
  if (all.indexOf(word) < 0) { all.push(word); try { fs.mkdirSync(path.dirname(personalPath()), { recursive: true }); fs.writeFileSync(personalPath(), all.join('\n') + '\n', 'utf8'); } catch (e) { /* best effort */ } }
  if (speller) speller.add(word);
}
function getSpeller() {
  if (speller) return speller;
  const nspell = require('nspell');
  const dir = path.join(__dirname, 'dict');
  speller = nspell(fs.readFileSync(path.join(dir, 'en-AU.aff')), fs.readFileSync(path.join(dir, 'en-AU.dic')));
  personalWords().forEach((w) => speller.add(w));
  return speller;
}
function norm(w) { return String(w).replace(/’/g, "'"); }
ipcMain.handle('spell:check', (e, words) => {
  const sp = getSpeller(), bad = [];
  (words || []).forEach((w) => {
    const n = norm(w);
    if (/^[A-Z0-9]+$/.test(n)) return;            // acronyms
    if (sp.correct(n)) return;
    if (/'s$/.test(n) && sp.correct(n.slice(0, -2))) return; // possessives
    bad.push(w);
  });
  return bad;
});
ipcMain.handle('spell:suggest', (e, word) => { try { return getSpeller().suggest(norm(word)).slice(0, 8); } catch (err) { return []; } });
ipcMain.handle('spell:add', (e, word) => { personalAdd(norm(word)); return true; });
