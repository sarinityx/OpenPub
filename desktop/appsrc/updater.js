// OpenPub update checks (electron-updater, GitHub releases). The ONLY network requests the desktop app makes,
// and only when the user said yes to them, or chose "Check for updates", and never when the admin policy is set.
//
// Modes: store   (process.windowsStore) – the Store updates the app: no updater, no question, no setting
//        installed (an NSIS install: "Uninstall OpenPub.exe" beside OpenPub.exe) – check, download, install
//        portable  (the zip: no uninstaller beside the exe) – check only; the notice links the release page
//        dev       (running from source) – off
// Policy: DisableUpdateCheck = 1 (REG_DWORD) under HKLM\SOFTWARE\Policies\OpenPub or HKCU\SOFTWARE\Policies\OpenPub
//         turns everything off: no question, no checks, and "Check for updates" says the organisation manages updates.
// Settings (settings.json, "updates"): auto (true / false / null = not asked yet), skip (a version), lastCheck (ms).
//
// Test hooks (environment variables, used by tools/e2e-desktop.js and tools/e2e-installer.js only):
//   OPENPUB_TEST_UPDATE_FEED   generic feed URL instead of GitHub      OPENPUB_TEST_UPDATE_MODE  installed / portable / store
//   OPENPUB_TEST_UPDATE_DELAY  ms before the automatic check (10 s)    OPENPUB_TEST_UPDATE_LOG   file for the updater's log
//   OPENPUB_TEST_UPDATE_POLICY 1 = act as if the policy value is set   OPENPUB_TEST_UPDATE_NOT_ADMIN 1 = act as a standard user
'use strict';
const { app, ipcMain, shell } = require('electron');
const path = require('path'), fs = require('fs');
const { spawnSync } = require('child_process');

const REPO_URL = 'https://github.com/sarinityx/OpenPub';
const DAY = 24 * 60 * 60 * 1000;
const env = process.env;

function regDword(root, key, name) {
  if (process.platform !== 'win32') return null;
  const r = spawnSync('reg', ['query', root + '\\' + key, '/v', name], { encoding: 'utf8', windowsHide: true });
  const m = r.status === 0 && (r.stdout || '').match(/REG_DWORD\s+0x([0-9a-f]+)/i);
  return m ? parseInt(m[1], 16) : null;
}
/** The admin policy, read fresh each time (an administrator may set it while OpenPub runs). */
function policyOff() {
  if (env.OPENPUB_TEST_UPDATE_POLICY === '1') return true;
  return regDword('HKLM', 'SOFTWARE\\Policies\\OpenPub', 'DisableUpdateCheck') === 1 ||
    regDword('HKCU', 'SOFTWARE\\Policies\\OpenPub', 'DisableUpdateCheck') === 1;
}
function detectMode() {
  if (process.windowsStore) return 'store';
  if (/^(installed|portable|store)$/.test(env.OPENPUB_TEST_UPDATE_MODE || '')) return env.OPENPUB_TEST_UPDATE_MODE;
  if (!app.isPackaged) return 'dev';
  return fs.existsSync(path.join(path.dirname(process.execPath), 'Uninstall OpenPub.exe')) ? 'installed' : 'portable';
}
/** An install for everyone (HKLM) rather than for this user: updating it needs administrator rights. */
function isPerMachine() {
  if (env.OPENPUB_TEST_UPDATE_MODE) return env.OPENPUB_TEST_UPDATE_PER_MACHINE === '1';
  const pf = [env.ProgramFiles, env.ProgramW6432].filter(Boolean).map((p) => p.toLowerCase() + path.sep);
  if (pf.some((p) => process.execPath.toLowerCase().startsWith(p))) return true;
  const r = spawnSync('reg', ['query', 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', '/s', '/f', path.dirname(process.execPath), '/d'], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 && /InstallLocation/i.test(r.stdout || '');
}
/** A member of the Administrators group (Windows asks for permission), even if this process is not elevated. */
function isAdmin() {
  if (env.OPENPUB_TEST_UPDATE_NOT_ADMIN === '1') return false;
  const r = spawnSync('whoami', ['/groups', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 && /"S-1-5-32-544"/.test(r.stdout || '');
}

module.exports = function setupUpdater(o) {
  // o: { getWin, readSettings, writeSettings, isBusy, readyToQuit }
  const mode = detectMode();
  const updating = mode === 'installed' || mode === 'portable';
  const settings = () => Object.assign({ auto: null, skip: null, lastCheck: 0 }, (o.readSettings().updates) || {});
  const save = (patch) => o.writeSettings({ updates: Object.assign(settings(), patch) });
  const perMachine = mode === 'installed' ? isPerMachine() : false;
  const admin = perMachine ? isAdmin() : true;
  let updater = null, available = null, downloading = null, downloaded = null, timer = null;

  const log = [];
  const logger = {};
  ['info', 'warn', 'error', 'debug'].forEach((level) => {
    logger[level] = (m) => {
      const line = new Date().toISOString() + ' ' + level + ' ' + (m && m.stack ? m.stack : String(m));
      log.push(line); if (log.length > 200) log.shift();
      if (env.OPENPUB_TEST_UPDATE_LOG) { try { fs.appendFileSync(env.OPENPUB_TEST_UPDATE_LOG, line + '\n'); } catch (e) { /* test log only */ } }
    };
  });

  function getUpdater() {
    if (updater) return updater;
    updater = require('electron-updater').autoUpdater;
    updater.logger = logger;
    updater.autoDownload = false;          // ask first
    updater.autoInstallOnAppQuit = true;   // "Later": a downloaded update installs when OpenPub closes
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    if (env.OPENPUB_TEST_UPDATE_FEED) {
      updater.forceDevUpdateConfig = true;
      // the tests' local server answers one byte range per request (GitHub answers several)
      updater.setFeedURL({ provider: 'generic', url: env.OPENPUB_TEST_UPDATE_FEED, useMultipleRangeRequest: false });
    }
    updater.on('download-progress', (p) => { downloading = { version: downloading && downloading.version, percent: Math.round(p.percent || 0) }; send(); });
    updater.on('update-downloaded', (info) => { downloading = null; downloaded = info.version; send(); });
    return updater;
  }

  function state() {
    const s = settings(), off = updating && policyOff();
    return {
      mode, policy: off, available: updating && !off,
      auto: s.auto, ask: updating && !off && s.auto === null,
      current: app.getVersion(),
      update: available, skipped: s.skip,
      canDownload: mode === 'installed' && (!perMachine || admin),
      perMachine, admin,
      downloading, downloaded,
      releaseUrl: available ? REPO_URL + '/releases/tag/v' + available : REPO_URL + '/releases/latest'
    };
  }
  function send() { const w = o.getWin(); if (w && !w.isDestroyed()) w.webContents.send('update:state', state()); }

  /** One check. quiet: automatic (errors are not shown, a skipped version is not offered). */
  async function check(quiet) {
    if (!updating || policyOff()) return { status: policyOff() ? 'policy' : 'off' };
    save({ lastCheck: Date.now() });
    try {
      const r = await getUpdater().checkForUpdates();
      const v = r && r.updateInfo && r.updateInfo.version;
      if (!r || !r.isUpdateAvailable || !v) { available = null; send(); return { status: 'none', current: app.getVersion() }; }
      if (quiet && settings().skip === v) return { status: 'skipped', version: v };
      available = v; send();
      return { status: 'available', version: v };
    } catch (e) {
      logger.warn('update check failed: ' + (e && e.message));
      return { status: 'error', message: quiet ? null : friendly(e) };
    }
  }
  function friendly(e) {
    const m = String((e && e.message) || e || '');
    if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|net::|getaddrinfo|socket/i.test(m)) return 'OpenPub could not reach GitHub. Check your internet connection and try again.';
    return 'The check did not finish: ' + m.split('\n')[0].slice(0, 200);
  }

  /** Automatic checks: once shortly after start (never delaying it), then at most once a day. */
  function schedule() {
    clearTimeout(timer);
    const s = settings();
    if (!updating || s.auto !== true || policyOff()) return;
    const delay = env.OPENPUB_TEST_UPDATE_DELAY ? +env.OPENPUB_TEST_UPDATE_DELAY : 10000;
    const due = Math.max(delay, (s.lastCheck || 0) + DAY - Date.now());
    timer = setTimeout(async () => { await check(true); schedule(); }, Math.min(due, DAY));
  }

  ipcMain.handle('update:state', () => state());
  ipcMain.handle('update:answer', (e, yes) => { if (!updating || policyOff()) return state(); save({ auto: !!yes }); schedule(); return state(); });
  ipcMain.handle('update:set-auto', (e, on) => { if (!updating || policyOff()) return state(); save({ auto: !!on }); schedule(); return state(); });
  ipcMain.handle('update:check', () => check(false));
  ipcMain.handle('update:skip', (e, v) => { save({ skip: String(v || available || '') || null }); available = null; send(); return state(); });
  ipcMain.handle('update:download', async () => {
    const s = state();
    if (!s.update || !s.canDownload || policyOff()) return { ok: false };
    downloading = { version: s.update, percent: 0 }; send();
    try { await getUpdater().downloadUpdate(); return { ok: true }; }
    catch (e) { downloading = null; logger.error(e); send(); return { ok: false, message: friendly(e) }; }
  });
  ipcMain.handle('update:release-page', () => { shell.openExternal(state().releaseUrl); return true; });
  ipcMain.handle('update:install', async () => {
    if (!downloaded) return { ok: false, message: 'No update has been downloaded.' };
    if (o.isBusy()) return { ok: false, message: 'Finish the export or print first.' };
    // the unsaved-changes prompt comes first; if the user cancels, nothing happens. quitAndInstall then closes
    // OpenPub itself (closing the window first would quit before it, and the update would not restart the app).
    const ok = await o.readyToQuit();
    if (!ok) return { ok: false, cancelled: true };
    setImmediate(() => getUpdater().quitAndInstall(true, true)); // silent install, then start the new version
    return { ok: true };
  });

  schedule();
  return { state, mode };
};
