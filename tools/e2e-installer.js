// Windows installer test: installs OpenPub silently, checks what it registered, opens files through it, uninstalls.
//   npm run package:win            (builds desktop/dist/OpenPub-<version>-win64-setup.exe)
//   npm run test:installer
// Per user always; for all users only when run as administrator (CI is). It refuses to run if OpenPub is already
// installed, because uninstalling is part of the test. It never deletes existing settings: removing them
// (--delete-app-data) is only tried on CI, and only when there were none before the test.
const path = require('path'), fs = require('fs'), os = require('os'), cp = require('child_process');
const lib = require('./lib');

let failures = 0, skipped = 0;
function ok(c, m) { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failures++; }
function skip(m) { console.log('SKIP ' + m); skipped++; }
function finish() {
  if (skipped && process.env.OPENPUB_REQUIRE_ALL) ok(false, skipped + ' group(s) skipped, but OPENPUB_REQUIRE_ALL is set');
  console.log((failures ? failures + ' FAILED' : 'ALL PASSED') + (skipped ? ', ' + skipped + ' group(s) skipped' : ''));
  process.exit(failures ? 1 : 0);
}
if (process.platform !== 'win32') { skip('installer test (Windows only)'); finish(); }

const VERSION = require(path.join(lib.ROOT, 'desktop', 'appsrc', 'package.json')).version;
const SETUP = path.join(lib.ROOT, 'desktop', 'dist', 'OpenPub-' + VERSION + '-win64-setup.exe');
const UNINSTALL = 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall';
const APPDATA_DIR = path.join(process.env.APPDATA, 'OpenPub');
const MARKER = path.join(APPDATA_DIR, 'installer-test-marker.txt');
const OUT = lib.outDir('installer');

// ---- registry (reg.exe, no shell quoting)
function reg(args) { try { return cp.execFileSync('reg', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return null; } }
/** Value of root\key\name ('' = the default value), or null if missing. */
function regGet(root, key, name) {
  const out = reg(['query', root + '\\' + key].concat(name ? ['/v', name] : ['/ve']));
  if (!out) return null;
  const line = out.split(/\r?\n/).find((l) => /\sREG_\w+/.test(l));
  if (!line) return null;
  const m = line.match(/^\s*(.*?)\s{4}(REG_\w+)(?:\s{4}(.*))?$/);
  if (!m) return null;
  return !name && m[3] === '(value not set)' ? null : (m[3] || ''); // reg.exe's text for an empty default value
}
function regExists(root, key) { return reg(['query', root + '\\' + key]) !== null; }
/** The uninstall entry whose DisplayName is OpenPub: { key, values } or null. */
function findUninstall(root) {
  const out = reg(['query', root + '\\' + UNINSTALL, '/s', '/f', 'OpenPub', '/d']);
  if (!out) return null;
  const key = out.split(/\r?\n/).find((l) => /^HKEY_/.test(l) && regGet(root, l.replace(/^HKEY_[A-Z_]+\\/, ''), 'DisplayName') === 'OpenPub');
  if (!key) return null;
  const sub = key.replace(/^HKEY_[A-Z_]+\\/, '');
  const values = {};
  for (const n of ['DisplayName', 'DisplayVersion', 'Publisher', 'DisplayIcon', 'UninstallString', 'QuietUninstallString']) values[n] = regGet(root, sub, n);
  return { key: sub, values };
}
function isAdmin() { try { cp.execFileSync('net', ['session'], { stdio: 'ignore' }); return true; } catch (e) { return false; } }
function run(exe, args) { const r = cp.spawnSync(exe, args, { stdio: 'ignore', timeout: 300000 }); return r.status; }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function waitFor(fn, ms) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(500); } return !!fn(); }
/** OpenPub.exe processes started from dir: [{ pid, cmd }] */
function processesIn(dir) {
  const ps = 'Get-CimInstance Win32_Process -Filter "Name=\'OpenPub.exe\'" | ForEach-Object { "$($_.ProcessId)`t$($_.ExecutablePath)`t$($_.CommandLine)" }';
  const out = cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' }).stdout || '';
  return out.split(/\r?\n/).filter(Boolean).map((l) => l.split('\t')).filter((p) => p[1] && p[1].toLowerCase().startsWith(dir.toLowerCase())).map((p) => ({ pid: +p[0], cmd: p[2] || '' }));
}
function killIn(dir) { for (const p of processesIn(dir)) try { process.kill(p.pid); } catch (e) { /* gone */ } }

async function checkInstall(mode) {
  const perUser = mode === 'currentuser', root = perUser ? 'HKCU' : 'HKLM', label = perUser ? 'per user' : 'per machine';
  const dir = perUser ? path.join(process.env.LOCALAPPDATA, 'Programs', 'OpenPub') : path.join(process.env.ProgramFiles, 'OpenPub');
  const exe = path.join(dir, 'OpenPub.exe');
  const startMenu = perUser ? path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs')
    : path.join(process.env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  const pubBefore = [regGet('HKCU', 'Software\\Classes\\.pub', ''), regGet('HKLM', 'Software\\Classes\\.pub', '')];

  // install
  const code = run(SETUP, ['/S', '/' + mode]);
  ok(code === 0 && fs.existsSync(exe) && fs.existsSync(path.join(dir, 'resources', 'opub.ico')), label + ': silent install (/S /' + mode + ') puts OpenPub in ' + dir + ' (exit ' + code + ')');
  const info = cp.spawnSync('powershell.exe', ['-NoProfile', '-Command', '(Get-Item -LiteralPath "' + exe + '").VersionInfo | ForEach-Object { $_.FileDescription + "|" + $_.ProductName + "|" + $_.ProductVersion }'], { encoding: 'utf8' }).stdout.trim();
  ok(/^OpenPub\|OpenPub\|/.test(info), label + ': OpenPub.exe describes itself as OpenPub (' + info + ')');
  ok(fs.existsSync(path.join(startMenu, 'OpenPub.lnk')), label + ': Start menu shortcut');
  ok(!fs.existsSync(path.join(perUser ? os.homedir() : process.env.PUBLIC, 'Desktop', 'OpenPub.lnk')), label + ': no desktop shortcut');
  const un = findUninstall(root);
  ok(un && un.values.DisplayVersion === VERSION && /Uninstall OpenPub\.exe/.test(un.values.UninstallString || '') && /\/S\b/.test(un.values.QuietUninstallString || ''),
    label + ': uninstall entry in ' + root + ' (' + (un ? un.values.DisplayName + ' ' + un.values.DisplayVersion : 'missing') + ')');

  // file types
  const C = 'Software\\Classes';
  const cmd = regGet(root, C + '\\OpenPub.Project\\shell\\open\\command', '');
  ok(regGet(root, C + '\\.opub', '') === 'OpenPub.Project' && cmd === '"' + exe + '" "%1"' && regGet(root, C + '\\OpenPub.Project\\DefaultIcon', '') === path.join(dir, 'resources', 'opub.ico') + ',0',
    label + ': .opub is an OpenPub project with its own icon (' + cmd + ')');
  ok(regGet(root, C + '\\.pub\\OpenWithProgids', 'OpenPub.Publisher') === '' && regGet(root, C + '\\OpenPub.Publisher\\shell\\open\\command', '') === '"' + exe + '" "%1"',
    label + ': OpenPub is offered for .pub ("Open with")');
  const pubAfter = [regGet('HKCU', C + '\\.pub', ''), regGet('HKLM', C + '\\.pub', '')];
  ok(JSON.stringify(pubBefore) === JSON.stringify(pubAfter), label + ': the default program for .pub is unchanged (' + JSON.stringify(pubAfter) + ')');
  ok(regGet(root, 'Software\\RegisteredApplications', 'OpenPub') === 'Software\\OpenPub\\Capabilities' && regGet(root, 'Software\\OpenPub\\Capabilities\\FileAssociations', '.pub') === 'OpenPub.Publisher',
    label + ': listed in Settings > Default apps');

  // a .opub opened by Windows starts the installed OpenPub with that file
  const proj = path.join(OUT, 'Association ' + mode + '.opub');
  fs.writeFileSync(proj, JSON.stringify({ name: 'Association test', pages: [{ items: [] }] }));
  killIn(dir);
  cp.spawnSync('cmd.exe', ['/d', '/s', '/c', '"start "" "' + proj + '""'], { stdio: 'ignore', windowsVerbatimArguments: true });
  const opened = await waitFor(() => processesIn(dir).some((p) => p.cmd.indexOf(proj) >= 0), 20000);
  ok(opened, label + ': double-clicking a .opub starts the installed OpenPub with it');
  killIn(dir);
  await waitFor(() => !processesIn(dir).length, 10000);

  // the installed app runs and opens a Publisher file
  const app = await lib.launchPackaged(exe, [path.join(lib.PUBS, 'Sample.pub')]);
  const page = await app.firstWindow();
  const head = await page.waitForFunction(() => { const h = document.querySelector('.dlg header'); return h && /Imported/.test(h.textContent) ? h.textContent : null; }, null, { timeout: 30000 }).then((h) => h.jsonValue()).catch(() => null);
  const ver = await app.evaluate(({ app }) => app.getVersion()).catch(() => null);
  ok(!!head && ver === VERSION, label + ': installed app opens a .pub (' + head + ', version ' + ver + ')');
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await waitFor(() => !processesIn(dir).length, 10000);
  return { dir, exe, root, un, startMenu, label };
}

async function checkUninstall(r, deleteData) {
  const C = 'Software\\Classes';
  const args = ['/S'].concat(r.root === 'HKLM' ? ['/allusers'] : ['/currentuser'], deleteData ? ['--delete-app-data'] : []);
  run(path.join(r.dir, 'Uninstall OpenPub.exe'), args);
  // the uninstaller hands over to a copy of itself, so wait for the result rather than the process
  const gone = await waitFor(() => !findUninstall(r.root) && !fs.existsSync(r.exe), 120000);
  ok(gone && !fs.existsSync(path.join(r.startMenu, 'OpenPub.lnk')), r.label + ': silent uninstall removes the program, shortcut and uninstall entry');
  ok(!regExists(r.root, C + '\\OpenPub.Project') && !regExists(r.root, C + '\\OpenPub.Publisher') && regGet(r.root, C + '\\.opub', '') === null &&
    regGet(r.root, C + '\\.pub\\OpenWithProgids', 'OpenPub.Publisher') === null && regGet(r.root, 'Software\\RegisteredApplications', 'OpenPub') === null && !regExists(r.root, 'Software\\OpenPub'),
    r.label + ': uninstall removes the file types it added');
  if (deleteData) ok(!fs.existsSync(APPDATA_DIR), r.label + ': --delete-app-data removes settings and the personal dictionary');
  else ok(fs.existsSync(MARKER), r.label + ': settings and the personal dictionary are kept');
}

(async () => {
  if (!fs.existsSync(SETUP)) { ok(false, 'installer not found: ' + path.relative(lib.ROOT, SETUP) + ' (run npm run package:win first)'); finish(); }
  if (findUninstall('HKCU') || findUninstall('HKLM')) { skip('installer test: OpenPub is already installed on this computer, and the test would uninstall it'); finish(); }
  const hadData = fs.existsSync(APPDATA_DIR);
  fs.mkdirSync(APPDATA_DIR, { recursive: true });
  fs.writeFileSync(MARKER, 'Left by tools/e2e-installer.js to check that uninstalling keeps settings. Safe to delete.');
  try {
    const u = await checkInstall('currentuser');
    await checkUninstall(u, false);
    if (!isAdmin()) skip('per-machine install (needs an administrator prompt; CI runs it)');
    else {
      const m = await checkInstall('allusers');
      const tryDelete = !!process.env.CI && !hadData; // never delete someone's real settings
      await checkUninstall(m, tryDelete);
      if (!tryDelete) console.log('(not trying --delete-app-data: only on CI with no earlier settings)');
    }
  } finally {
    try { fs.rmSync(MARKER, { force: true }); if (!hadData && fs.existsSync(APPDATA_DIR) && !fs.readdirSync(APPDATA_DIR).length) fs.rmdirSync(APPDATA_DIR); } catch (e) { /* leave it */ }
  }
  finish();
})().catch((e) => { console.error('TEST CRASH', e.message.split('\n').slice(0, 8).join('\n')); process.exit(2); });
