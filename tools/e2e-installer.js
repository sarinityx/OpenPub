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

// ---- updating version N to N+1 through electron-updater, from a local feed (the test hooks in updater.js)
const NEXT = VERSION.replace(/(\d+)$/, (m, p) => String(+p + 1));
let feed = null;
/** Builds N+1 once (into test-out) and serves it with N's blockmap; electron-updater asks for single byte ranges. */
async function startFeed() {
  if (feed) return feed;
  const nextOut = path.join(OUT, 'next');
  fs.rmSync(nextOut, { recursive: true, force: true });
  cp.execFileSync(process.execPath, [path.join(lib.ROOT, 'tools', 'package.mjs'), 'win32', '--no-zip', '--no-msix', '--version', NEXT, '--out', nextOut], { stdio: 'ignore', timeout: 900000 });
  const dir = path.join(OUT, 'feed');
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  for (const f of ['latest.yml', 'OpenPub-' + NEXT + '-win64-setup.exe', 'OpenPub-' + NEXT + '-win64-setup.exe.blockmap']) fs.copyFileSync(path.join(nextOut, f), path.join(dir, f));
  fs.copyFileSync(SETUP + '.blockmap', path.join(dir, path.basename(SETUP) + '.blockmap'));
  const requests = [];
  const server = require('http').createServer((req, res) => {
    requests.push(req.method + ' ' + req.url + (req.headers.range ? ' ' + req.headers.range : ''));
    const f = path.join(dir, path.basename(decodeURIComponent(req.url.split('?')[0])));
    if (!fs.existsSync(f)) { res.statusCode = 404; res.end(); return; }
    const size = fs.statSync(f).size, m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    if (m) {
      const a = +m[1], b = m[2] ? Math.min(+m[2], size - 1) : size - 1;
      res.writeHead(206, { 'Content-Range': 'bytes ' + a + '-' + b + '/' + size, 'Content-Length': b - a + 1, 'Accept-Ranges': 'bytes' });
      fs.createReadStream(f, { start: a, end: b }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Length': size, 'Accept-Ranges': 'bytes' });
      fs.createReadStream(f).pipe(res);
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  feed = { url: 'http://127.0.0.1:' + server.address().port + '/', requests, close: () => server.close() };
  return feed;
}

// ---- the portable zip (1.3 brief, item 4): the same question, setting, policy and check, but the notice only links
// the release page: no download, no install. Detection: no uninstall entry for this folder means portable.
async function checkPortable() {
  const f = await startFeed();
  const zip = path.join(path.dirname(SETUP), 'OpenPub-' + VERSION + '-win64.zip');
  if (!fs.existsSync(zip)) { ok(false, 'portable zip not found: ' + path.relative(lib.ROOT, zip)); return; }
  const dir = path.join(OUT, 'portable');
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  // Windows' own tar (bsdtar reads zips); Git Bash puts GNU tar first on PATH, which cannot
  cp.execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', dir]);
  const exe = path.join(dir, 'OpenPub-win32-x64', 'OpenPub.exe');
  const baseEnv = { OPENPUB_TEST_UPDATE_FEED: f.url, OPENPUB_TEST_UPDATE_DELAY: '500' };
  const fresh = (name) => { const p = path.join(OUT, 'profile-' + name); fs.rmSync(p, { recursive: true, force: true }); return p; };
  async function launch(profile, env, fn) {
    const app = await lib.launchPackaged(exe, [], { profile, env: Object.assign({}, baseEnv, env) });
    const page = await app.firstWindow();
    try {
      await page.waitForFunction(() => window.OP && OP.app && OP.app.updateState && OP.app.updateState(), null, { timeout: 30000 });
      return await fn(page, app);
    } finally { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await waitFor(() => !processesIn(path.dirname(exe)).length, 15000); }
  }
  const note = (page) => page.evaluate(() => { const n = document.getElementById('updnote'); return n && !n.hidden ? n.textContent : ''; });
  const manual = async (page) => { await page.evaluate(() => OP.app.checkForUpdates()); await page.waitForFunction(() => { const s = document.getElementById('updStatus'); return s && !/Checking/.test(s.textContent); }, null, { timeout: 30000 }); return page.evaluate(() => document.getElementById('updStatus').textContent); };

  let n0 = f.requests.length;
  const r = await launch(fresh('portable'), {}, async (page, app) => {
    await app.evaluate(({ shell }) => { global.__opened = []; shell.openExternal = async (u) => { global.__opened.push(u); }; });
    await page.waitForSelector('#updnote:not([hidden]) #updYes', { timeout: 30000 });
    await page.waitForTimeout(1500);
    const out = { state: await page.evaluate(() => OP.desktop.update.state()), before: f.requests.length - n0 };
    await page.click('#updYes');
    await page.waitForSelector('#updnote:not([hidden]) #updPage', { timeout: 60000 });
    out.note = await note(page);
    out.download = await page.evaluate(() => !!document.getElementById('updDownload'));
    await page.click('#updPage');
    await page.waitForTimeout(500);
    out.opened = await app.evaluate(() => global.__opened);
    out.forced = await page.evaluate(() => OP.desktop.update.download());
    return out;
  });
  ok(r.state.mode === 'portable' && r.state.ask === true && !r.state.canDownload && r.before === 0, 'portable zip: detected as portable, asks first, no request before the answer (' + r.state.mode + ', ' + r.before + ')');
  ok(r.note.includes('OpenPub ' + NEXT + ' is available') && /portable/.test(r.note) && !r.download, 'portable zip: the notice says ' + NEXT + ' is available and offers the release page, not Download');
  const releaseUrl = 'https://github.com/sarinityx/OpenPub/releases/tag/v' + NEXT;
  ok(r.opened.length === 1 && r.opened[0] === releaseUrl && r.forced && r.forced.ok === false && !f.requests.slice(n0).some((u) => /setup\.exe/.test(u)), 'portable zip: Release page opens ' + r.opened.join(', ') + '; nothing is downloaded, even if asked');

  // the policy, through the test hook and (where this user may write it) through the real registry value
  n0 = f.requests.length;
  const p1 = await launch(fresh('portable-policy'), { OPENPUB_TEST_UPDATE_POLICY: '1' }, async (pg) => { await pg.waitForTimeout(2000); return { note: await note(pg), status: await manual(pg) }; });
  ok(!p1.note && f.requests.length === n0 && /managed by your organisation/.test(p1.status), 'portable zip with the policy: no question, no request, Check for updates says ' + p1.status);
  const KEY = 'HKCU\\SOFTWARE\\Policies\\OpenPub';
  if (reg(['query', KEY]) !== null) { skip('real policy value: ' + KEY + ' already exists on this computer and is left alone'); return; }
  if (reg(['add', KEY, '/v', 'DisableUpdateCheck', '/t', 'REG_DWORD', '/d', '1', '/f']) === null) { skip('real policy value: this user cannot write ' + KEY + ' (needs administrator rights; CI runs it)'); return; }
  try {
    n0 = f.requests.length;
    const p2 = await launch(fresh('portable-policy-reg'), {}, async (pg) => { await pg.waitForTimeout(2000); return { note: await note(pg), status: await manual(pg), state: await pg.evaluate(() => OP.desktop.update.state()) }; });
    ok(!p2.note && f.requests.length === n0 && p2.state.policy === true && /managed by your organisation/.test(p2.status), 'DisableUpdateCheck = 1 under ' + KEY + ': no question, no request, ' + p2.status);
  } finally { reg(['delete', KEY, '/f']); }
}

/**
 * Signed releases (1.3 brief, item 5): their app-update.yml names the signing certificate (publisherName), and an
 * update not signed with it must not install. N+1 here is unsigned, so with a publisherName written into the
 * installed copy's app-update.yml, the download is refused and N stays installed.
 */
async function checkSignatureRequired(r, env) {
  const yml = path.join(r.dir, 'resources', 'app-update.yml'), original = fs.readFileSync(yml, 'utf8');
  fs.writeFileSync(yml, require('./update-config').updateConfigYml('CN=OpenPub signature test, O=OpenPub'));
  const profile = path.join(OUT, 'profile-signature');
  fs.rmSync(profile, { recursive: true, force: true });
  fs.rmSync(env.OPENPUB_TEST_UPDATE_LOG, { force: true });
  const res = {};
  const app = await lib.launchPackaged(r.exe, [], { profile, env });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('#updnote:not([hidden]) #updYes', { timeout: 30000 });
    await page.click('#updYes');
    await page.waitForSelector('#updnote:not([hidden]) #updDownload', { timeout: 60000 });
    await page.click('#updDownload');
    await page.waitForFunction(() => /not signed by OpenPub/.test(document.getElementById('toasts').textContent), null, { timeout: 180000 });
    res.toast = await page.evaluate(() => document.getElementById('toasts').textContent.trim());
    res.state = await page.evaluate(() => OP.desktop.update.state());
  } catch (e) { res.error = e.message.split('\n')[0]; } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await waitFor(() => !processesIn(r.dir).length, 15000);
    fs.writeFileSync(yml, original);
  }
  const log = fs.existsSync(env.OPENPUB_TEST_UPDATE_LOG) ? fs.readFileSync(env.OPENPUB_TEST_UPDATE_LOG, 'utf8') : '';
  const u = findUninstall(r.root);
  ok(!res.error && res.state && !res.state.downloaded && /not signed by the application owner/.test(log) && u && u.values.DisplayVersion === VERSION,
    r.label + ': with publisherName in app-update.yml, an unsigned ' + NEXT + ' is refused and ' + VERSION + ' stays installed' +
    (res.error ? ' — ' + res.error + '; updater log: ' + log.trim().split('\n').slice(-4).join(' | ') : ' (' + res.toast + ')'));
}

async function checkUpdate(r) {
  const f = await startFeed(), label = r.label;
  const profile = path.join(OUT, 'profile-' + (r.root === 'HKLM' ? 'machine' : 'user'));
  fs.rmSync(profile, { recursive: true, force: true });
  const logFile = path.join(OUT, 'updater-' + (r.root === 'HKLM' ? 'machine' : 'user') + '.log');
  fs.rmSync(logFile, { force: true });
  const env = { OPENPUB_TEST_UPDATE_FEED: f.url, OPENPUB_TEST_UPDATE_DELAY: '500', OPENPUB_TEST_UPDATE_LOG: logFile };
  // An earlier run (the per-user one, same Windows user) leaves its downloaded update in pending\ and the NEW
  // version's blockmap as current.blockmap, which the next differential download would take as the old one.
  // Keep only installer.exe, the copy of the installed version that this run's install just put there.
  const cache = path.join(process.env.LOCALAPPDATA, 'openpub-updater');
  const cleanCache = () => { if (fs.existsSync(cache)) for (const e of fs.readdirSync(cache)) if (e !== 'installer.exe') fs.rmSync(path.join(cache, e), { recursive: true, force: true }); };
  cleanCache();
  if (r.root === 'HKCU') {
    await checkSignatureRequired(r, Object.assign({}, env, { OPENPUB_TEST_UPDATE_LOG: path.join(OUT, 'updater-signature.log') }));
    cleanCache();
    // a copy of the installed folder (uninstaller included) is not the registered install: it counts as portable
    const copy = path.join(OUT, 'copied-install');
    fs.rmSync(copy, { recursive: true, force: true });
    fs.cpSync(r.dir, copy, { recursive: true });
    const ca = await lib.launchPackaged(path.join(copy, 'OpenPub.exe'), [], { profile: path.join(OUT, 'profile-copied') });
    const cpg = await ca.firstWindow();
    await cpg.waitForFunction(() => window.OP && OP.desktop, null, { timeout: 30000 });
    const cs = await cpg.evaluate(() => OP.desktop.update.state());
    await ca.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await waitFor(() => !processesIn(copy).length, 15000);
    ok(cs.mode === 'portable' && !cs.canDownload, 'a copy of the installed folder elsewhere counts as portable (no uninstall entry points at it): ' + cs.mode);
    fs.rmSync(copy, { recursive: true, force: true });
  }
  const before = f.requests.length;
  const app = await lib.launchPackaged(r.exe, [], { profile, env });
  const page = await app.firstWindow();
  let result = {};
  try {
    await page.waitForSelector('#updnote:not([hidden]) #updYes', { timeout: 30000 });
    await page.waitForTimeout(1500);
    result.beforeAnswer = f.requests.length - before;
    result.state = await page.evaluate(() => OP.desktop.update.state());
    // something to keep across the update: a word in the personal dictionary
    await page.evaluate(() => OP.desktop.spellAdd('openpubupdatetestword'));
    await page.click('#updYes');
    await page.waitForSelector('#updnote:not([hidden]) #updDownload', { timeout: 60000 });
    result.offer = await page.evaluate(() => document.getElementById('updnote').textContent);
    await page.click('#updDownload');
    await page.waitForSelector('#updnote:not([hidden]) #updRestart', { timeout: 180000 });
    result.log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
    await page.click('#updRestart');
  } catch (e) { result.error = e.message.split('\n')[0]; }
  // the installer runs silently and starts the new version
  const updated = await waitFor(() => { const u = findUninstall(r.root); return u && u.values.DisplayVersion === NEXT; }, 180000);
  const exeVersion = cp.spawnSync('powershell.exe', ['-NoProfile', '-Command', '(Get-Item -LiteralPath "' + r.exe + '").VersionInfo.ProductVersion'], { encoding: 'utf8' }).stdout.trim();
  const restarted = await waitFor(() => processesIn(r.dir).length > 0, 30000);
  killIn(r.dir);
  await waitFor(() => !processesIn(r.dir).length, 15000);
  const wantMachine = r.root === 'HKLM';
  ok(result.state && result.state.mode === 'installed' && result.state.perMachine === wantMachine && result.state.canDownload,
    label + ': detected as installed ' + (wantMachine ? 'for everyone' : 'for this user') + ' (uninstall entry in ' + r.root + ' points at this folder)' + (result.state ? '' : ': no state'));
  ok(!result.error && result.beforeAnswer === 0 && /OpenPub \d+\.\d+\.\d+ is available/.test(result.offer || ''), label + ': installed ' + VERSION + ' asks first (no request before the answer), then offers ' + NEXT + (result.error ? ' — ' + result.error : ''));
  const differential = /Download block maps/.test(result.log || '') && !/fallback to full download/i.test(result.log || '');
  ok(differential, label + ': the download used the blockmaps (differential download)' + (differential ? '' : '; updater log: ' + (result.log || '(empty)').trim().split('\n').slice(-6).join(' | ')));
  ok(updated && exeVersion.startsWith(NEXT) && restarted, label + ': Restart to update installs ' + NEXT + ' silently and starts it (installed version ' + exeVersion + ')');
  // the new version, with the same profile: settings and personal dictionary kept
  const app2 = await lib.launchPackaged(r.exe, [], { profile });
  const page2 = await app2.firstWindow();
  await page2.waitForFunction(() => window.OP && OP.desktop, null, { timeout: 30000 });
  const after = { version: await app2.evaluate(({ app }) => app.getVersion()), unknown: await page2.evaluate(() => OP.desktop.spellCheck(['openpubupdatetestword'])),
    auto: await page2.evaluate(() => OP.desktop.update.state().then((s) => s.auto)) };
  await app2.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await waitFor(() => !processesIn(r.dir).length, 15000);
  ok(after.version === NEXT && after.unknown.length === 0 && after.auto === true, label + ': ' + NEXT + ' runs and keeps the settings and the personal dictionary (' + JSON.stringify(after) + ')');
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
  // the files a release publishes: installer, .blockmap, latest.yml (SHA-512 and size of this installer), zip
  const rf = require('./release-files').verify(path.dirname(SETUP), VERSION);
  ok(!rf.problems.length, 'release files: ' + rf.files.join(', ') + (rf.problems.length ? '; ' + rf.problems.join('; ') : '; latest.yml matches the installer (' + rf.size + ' bytes)'));
  const notes = require('./release-notes').notes(VERSION, true);
  ok(/OpenPub-[\d.]+-win64-setup\.exe/.test(notes) && /code-signing-policy\.html/.test(notes) && /privacy\.html/.test(notes), 'release notes name the installer and link the code signing policy and privacy page');
  // the portable zip touches no install, so it is checked even where OpenPub is installed
  await checkPortable();
  if (findUninstall('HKCU') || findUninstall('HKLM')) { skip('installer test: OpenPub is already installed on this computer, and the test would uninstall it'); finish(); }
  const hadData = fs.existsSync(APPDATA_DIR);
  fs.mkdirSync(APPDATA_DIR, { recursive: true });
  fs.writeFileSync(MARKER, 'Left by tools/e2e-installer.js to check that uninstalling keeps settings. Safe to delete.');
  try {
    const u = await checkInstall('currentuser');
    await checkUpdate(u);
    await checkUninstall(u, false);
    if (!isAdmin()) skip('per-machine install (needs an administrator prompt; CI runs it)');
    else {
      const m = await checkInstall('allusers');
      await checkUpdate(m);
      const tryDelete = !!process.env.CI && !hadData; // never delete someone's real settings
      await checkUninstall(m, tryDelete);
      if (!tryDelete) console.log('(not trying --delete-app-data: only on CI with no earlier settings)');
    }
  } finally {
    if (feed) feed.close();
    try { fs.rmSync(MARKER, { force: true }); if (!hadData && fs.existsSync(APPDATA_DIR) && !fs.readdirSync(APPDATA_DIR).length) fs.rmdirSync(APPDATA_DIR); } catch (e) { /* leave it */ }
  }
  finish();
})().catch((e) => { console.error('TEST CRASH', e.message.split('\n').slice(0, 8).join('\n')); process.exit(2); });
