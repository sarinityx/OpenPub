// Microsoft Store package test (1.3 brief, item 6): test-signs a copy of desktop/dist/OpenPub-<version>-x64.msix with
// a throwaway certificate, installs it, checks OpenPub inside the package, uninstalls it and removes the certificate.
//   npm run package:win            (builds the MSIX)
//   npm run test:msix              (Windows, as administrator)
// Trusting the throwaway certificate (Local Machine > Trusted People) is needed to install a test-signed package; it
// is removed at the end. On CI that happens by itself; on anyone's own computer the test asks for
// --trust-test-certificate first, and refuses if a package with the same name is already installed.
// The certificate is made here, used once and deleted: it is never shipped. The Store signs the real package.
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os'), crypto = require('crypto');
const lib = require('./lib');
let failures = 0, skipped = 0;
function ok(c, m) { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failures++; }
function skip(m) { console.log('SKIP ' + m); skipped++; }
function finish() {
  if (skipped && process.env.OPENPUB_REQUIRE_ALL) ok(false, skipped + ' check(s) skipped, but OPENPUB_REQUIRE_ALL is set');
  console.log((failures ? failures + ' FAILED' : 'ALL PASSED') + (skipped ? ', ' + skipped + ' skipped' : ''));
  process.exit(failures ? 1 : 0);
}
const VERSION = require(path.join(lib.ROOT, 'desktop', 'appsrc', 'package.json')).version;
const MSIX = path.join(lib.ROOT, 'desktop', 'dist', 'OpenPub-' + VERSION + '-x64.msix');
const STORE = JSON.parse(fs.readFileSync(path.join(lib.ROOT, 'desktop', 'build', 'store.json'), 'utf8'));
const OUT = lib.outDir('msix');
const SYS32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
const ALIAS = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'OpenPub.exe');
// the alias is an app execution link (a reparse point) that stat cannot follow: look at the link itself
function aliasPresent() { try { fs.lstatSync(ALIAS); return true; } catch (e) { return false; } }

/** Windows PowerShell, the script passed encoded (no quoting through the shell); returns trimmed stdout, throws on error. */
function ps(script) {
  const r = cp.spawnSync(path.join(SYS32, 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from("$ErrorActionPreference = 'Stop'\n$ProgressPreference = 'SilentlyContinue'\n" +
      // the Cert: drive comes with this module, and using the drive does not load it
      'Import-Module Microsoft.PowerShell.Security\n' + script, 'utf16le').toString('base64')],
    // without PSModulePath: started from PowerShell 7 (CI's shell), Windows PowerShell would inherit 7's module path,
    // load the wrong security module and have no Cert: drive
    { encoding: 'utf8', windowsHide: true, timeout: 600000, env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== 'PSMODULEPATH')) });
  if (r.status !== 0) {
    // with -EncodedCommand, errors come back as CLIXML: keep the error lines' text
    const err = r.stderr || '', lines = [...err.matchAll(/<S S="Error">([\s\S]*?)<\/S>/g)].map((m) => m[1].replace(/_x000D__x000A_/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim()).filter(Boolean);
    throw new Error((lines.length ? lines.join(' ') : (err || r.stdout || 'PowerShell failed')).trim().slice(0, 600));
  }
  return (r.stdout || '').trim();
}
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'"; // a PowerShell single-quoted string
function isAdmin() { try { cp.execFileSync(path.join(SYS32, 'net.exe'), ['session'], { stdio: 'ignore' }); return true; } catch (e) { return false; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function waitFor(fn, ms) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(500); } return !!(await fn()); }

/** OpenPub started the way Windows starts the Store app: through the package's execution alias, so it runs with the
 *  package identity (AppData redirected, process.windowsStore true). No --user-data-dir: the package's own data is tested. */
function launch(args) {
  const { _electron } = require('playwright-core');
  return _electron.launch({ executablePath: ALIAS, args: args || [] });
}
async function quit(app) { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await sleep(1500); }

(async () => {
  if (process.platform !== 'win32') { skip('the MSIX test runs on Windows only'); finish(); }
  if (!fs.existsSync(MSIX)) { ok(false, 'MSIX not found: ' + path.relative(lib.ROOT, MSIX) + ' (run npm run package:win first)'); finish(); }
  if (!isAdmin()) { skip('the MSIX test needs administrator rights (trusting the test certificate; CI runs it)'); finish(); }
  if (!process.env.CI && !process.argv.includes('--trust-test-certificate')) {
    skip('the MSIX test trusts a throwaway certificate on this computer while it runs; add --trust-test-certificate to allow that'); finish();
  }
  const existing = ps('(Get-AppxPackage -Name ' + q(STORE.identityName) + ' | Select-Object -First 1).PackageFullName');
  if (existing) { skip('a package named ' + STORE.identityName + ' is already installed (' + existing + '); the test would remove it'); finish(); }

  // ---- the manifest inside the unsigned Store package
  const work = path.join(OUT, 'work'); fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
  cp.execFileSync(path.join(SYS32, 'tar.exe'), ['-xf', MSIX, '-C', work, 'AppxManifest.xml']);
  const manifest = fs.readFileSync(path.join(work, 'AppxManifest.xml'), 'utf8');
  ok(manifest.includes('Name="' + STORE.identityName + '"') && manifest.includes('Publisher="' + STORE.publisher + '"') &&
    manifest.includes('Version="' + VERSION + '.0"') && manifest.includes('<PublisherDisplayName>' + STORE.publisherDisplayName + '</PublisherDisplayName>'),
    'manifest: identity from desktop/build/store.json, version ' + VERSION + '.0' + (STORE.placeholder ? ' (placeholder identity)' : ''));
  ok(/<uap:FileTypeAssociation Name="opub">[\s\S]*?<uap:FileType[^>]*>\.opub</.test(manifest) && /<uap:FileTypeAssociation Name="pub">[\s\S]*?<uap:FileType>\.pub</.test(manifest) &&
    /<desktop:ExecutionAlias Alias="OpenPub\.exe" \/>/.test(manifest) && /<rescap:Capability Name="runFullTrust"\/>/.test(manifest),
    'manifest: .opub and .pub file types, the OpenPub.exe command-line alias, full trust');

  // ---- a test-signed copy: throwaway certificate whose subject is the manifest's publisher
  const signed = path.join(OUT, 'OpenPub-test-signed.msix');
  fs.copyFileSync(MSIX, signed);
  const pfx = path.join(OUT, 'test-cert.pfx'), cer = path.join(OUT, 'test-cert.cer'), pass = crypto.randomBytes(18).toString('base64');
  const thumb = ps([
    // one line: PowerShell does not carry a command over to the next line
    '$c = New-SelfSignedCertificate -Type Custom -Subject ' + q(STORE.publisher) + ' -KeyUsage DigitalSignature -FriendlyName ' + q('OpenPub MSIX test (throwaway)') +
      ' -CertStoreLocation Cert:\\CurrentUser\\My -NotAfter (Get-Date).AddDays(1) -TextExtension @(' + q('2.5.29.37={text}1.3.6.1.5.5.7.3.3') + ', ' + q('2.5.29.19={text}') + ')',
    'Export-PfxCertificate -Cert $c -FilePath ' + q(pfx) + ' -Password (ConvertTo-SecureString ' + q(pass) + ' -AsPlainText -Force) | Out-Null',
    'Export-Certificate -Cert $c -FilePath ' + q(cer) + ' | Out-Null',
    'Import-Certificate -FilePath ' + q(cer) + ' -CertStoreLocation Cert:\\LocalMachine\\TrustedPeople | Out-Null',
    '$c.Thumbprint'].join('\n'));
  let pfn = null;
  try {
    const signtool = (await require('app-builder-lib/out/toolsets/windows').getSignToolPath('1.1.0', true)).path;
    const sr = cp.spawnSync(signtool, ['sign', '/fd', 'SHA256', '/f', pfx, '/p', pass, signed], { encoding: 'utf8' });
    ok(sr.status === 0, 'test-signed a copy with a throwaway certificate for ' + STORE.publisher + (sr.status ? ': ' + (sr.stdout + sr.stderr).trim() : ''));

    // ---- install
    let installErr = null;
    try { ps('Add-AppxPackage -Path ' + q(signed)); } catch (e) { installErr = e.message; }
    const info = installErr ? null : JSON.parse(ps('Get-AppxPackage -Name ' + q(STORE.identityName) + ' | Select-Object PackageFamilyName, InstallLocation, Version | ConvertTo-Json'));
    pfn = info && info.PackageFamilyName;
    ok(!!info && info.Version === VERSION + '.0' && aliasPresent(), 'installs: ' + (info ? info.PackageFamilyName + ' ' + info.Version + ', alias ' + (aliasPresent() ? 'present' : 'MISSING') : installErr));
    if (!info) throw new Error('not installed, so nothing inside the package was checked');
    const exts = ps('$p = Get-AppxPackage -Name ' + q(STORE.identityName) + '; (Get-AppxPackageManifest $p).Package.Applications.Application.Extensions.Extension | ForEach-Object { $_.Category + ":" + ($_.FileTypeAssociation.Name) }');
    ok(/windows\.fileTypeAssociation:opub/.test(exts) && /windows\.fileTypeAssociation:pub/.test(exts), 'Windows registered the .opub and .pub file types: ' + exts.replace(/\s+/g, ' '));
    const dataDir = path.join(process.env.LOCALAPPDATA, 'Packages', pfn);

    // ---- first start: a Publisher file from the command line, in the package
    let app = await launch([path.join(lib.PUBS, 'Sample.pub')]);
    let page = await app.firstWindow();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    const head = await page.waitForFunction(() => { const h = document.querySelector('.dlg header'); return h && /Imported/.test(h.textContent) ? h.textContent : null; }, null, { timeout: 30000 }).then((h) => h.jsonValue()).catch(() => null);
    ok(!!head, 'command line: OpenPub.exe Sample.pub opens the file in the Store app: ' + head);
    if (head) await page.click('.dlg .btn.primary');
    const env = await app.evaluate(({ app }) => ({ store: !!process.windowsStore, exe: process.execPath, userData: app.getPath('userData'), version: app.getVersion() }));
    ok(env.store && /\\WindowsApps\\/i.test(env.exe) && env.version === VERSION, 'runs from the package (process.windowsStore): ' + env.exe);
    const upd = await page.evaluate(async () => { const s = await OP.desktop.update.state(); const n = document.getElementById('updnote'), b = document.getElementById('rbUpdates');
      return { mode: s.mode, available: s.available, note: !!n && !n.hidden, cmd: !!b && !b.hidden }; });
    ok(upd.mode === 'store' && !upd.available && !upd.note && !upd.cmd, 'no update question, check or command: the Store updates the app (' + JSON.stringify(upd) + ')');
    const spell = await page.evaluate(() => OP.desktop.spellCheck(['recieve', 'colour']));
    await page.evaluate(() => OP.desktop.spellAdd('openpubmsixtestword'));
    // plug-ins and content packs live in the app's IndexedDB store ('openpub', kv)
    await page.evaluate(() => new Promise((res, rej) => { const r = indexedDB.open('openpub', 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
      r.onsuccess = () => { const tx = r.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put('kept', 'msix-test'); tx.oncomplete = () => { r.result.close(); res(); }; tx.onerror = rej; }; r.onerror = rej; }));
    ok(JSON.stringify(spell) === '["recieve"]', 'spelling dictionary: ' + JSON.stringify(spell));
    const fonts = await page.evaluate(() => new Promise((r) => setTimeout(() => r(OP.app.installedFonts().length), 1500)));
    ok(fonts > 25, 'installed fonts are listed: ' + fonts);
    const pdf = await page.evaluate(async () => { const d = OP.app.S.doc, h = OP.sheetsHtml(d, OP.sheetsPlain(d, [0], [-1], { bleed: false, marks: false }));
      const v = await OP.desktop.vectorPdf(h); const c = await OP.desktop.cmykPdf(h);
      return { vector: v.error || v.bytes.length, cmyk: c.error || c.bytes.length, gs: c.version }; });
    ok(typeof pdf.vector === 'number' && pdf.vector > 1000, 'PDF through the print pipeline (printToPDF): ' + pdf.vector + ' bytes');
    if (typeof pdf.cmyk === 'number' || process.env.OPENPUB_REQUIRE_ALL || !/Ghostscript/i.test(pdf.cmyk)) ok(typeof pdf.cmyk === 'number' && pdf.cmyk > 1000, 'CMYK PDF with the Ghostscript installed under Program Files: ' + JSON.stringify(pdf));
    else skip('CMYK PDF (Ghostscript not installed): ' + pdf.cmyk);

    // ---- a second start with a file goes to the open window (single instance), through the alias as Explorer would
    await page.evaluate(() => { OP.app.S.dirty = true; });
    const second = cp.spawn(ALIAS, [path.join(lib.PUBS, 'Simple.pub')], { stdio: 'ignore' });
    const code = await new Promise((r) => { const t = setTimeout(() => { second.kill(); r('timeout'); }, 30000); second.on('exit', (c) => { clearTimeout(t); r(c); }); });
    const asked = await page.waitForFunction(() => { const h = document.querySelector('#modal.open .dlg header'); return !!h && /Unsaved changes/.test(h.textContent); }, null, { timeout: 20000 }).then(() => true).catch(() => false);
    ok(code === 0 && asked, 'single instance: a second start with a file exits (' + code + ') and the open window asks about unsaved changes');
    ok(errors.length === 0, 'no script errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await quit(app);

    // ---- what the app keeps, and where: redirected into the package's own folder
    const redirected = path.join(dataDir, 'LocalCache', 'Roaming', 'OpenPub');
    const dict = path.join(redirected, 'personal-dictionary.txt');
    ok(fs.existsSync(dict) && /openpubmsixtestword/.test(fs.readFileSync(dict, 'utf8')), 'settings and the personal dictionary are kept in the package\'s folder: ' + path.relative(process.env.LOCALAPPDATA, redirected) + ' (app sees ' + env.userData + ')');
    app = await launch([]);
    page = await app.firstWindow();
    await page.waitForFunction(() => window.OP && OP.desktop, null, { timeout: 30000 });
    const kept = await page.evaluate(async () => ({ unknown: await OP.desktop.spellCheck(['openpubmsixtestword']),
      kv: await new Promise((res) => { const r = indexedDB.open('openpub', 1); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('msix-test'); g.onsuccess = () => { r.result.close(); res(g.result); }; g.onerror = () => res(null); }; r.onerror = () => res(null); }) }));
    ok(kept.unknown.length === 0 && kept.kv === 'kept', 'after a restart: the personal dictionary and the plug-in and pack store are kept (' + JSON.stringify(kept) + ')');
    await quit(app);

    // ---- uninstall: Windows removes the package and its data (so the installer's keep-settings question has no
    // counterpart in the Store app; the FAQ says so)
    ps('Get-AppxPackage -Name ' + q(STORE.identityName) + ' | Remove-AppxPackage');
    pfn = null;
    const gone = await waitFor(() => !fs.existsSync(dataDir) && !ps('(Get-AppxPackage -Name ' + q(STORE.identityName) + ').PackageFullName'), 60000);
    ok(gone && !aliasPresent(), 'uninstall removes the app, its alias and its settings, dictionary and stored plug-ins');

    // ---- Microsoft's local Store certification check (Windows App Certification Kit, in the Windows SDK). It installs
    // and removes the package itself; the report is kept in test-out/msix for the CI artifact.
    const APPCERT = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Windows Kits', '10', 'App Certification Kit', 'appcert.exe');
    if (!fs.existsSync(APPCERT)) skip('Windows App Certification Kit not installed (it comes with the Windows SDK; CI has it)');
    else {
      const report = path.join(OUT, 'wack-report.xml');
      fs.rmSync(report, { force: true });
      cp.spawnSync(APPCERT, ['reset'], { stdio: 'ignore', timeout: 120000 });
      const t0 = Date.now();
      const r = cp.spawnSync(APPCERT, ['test', '-appxpackagepath', signed, '-reportoutputpath', report], { encoding: 'utf8', timeout: 1800000, windowsHide: true });
      const xml = fs.existsSync(report) ? fs.readFileSync(report, 'utf8') : '';
      const overall = (xml.match(/OVERALL_RESULT="(\w+)"/) || [])[1] || 'no report (exit ' + r.status + ': ' + String(r.stdout || r.stderr || '').trim().split('\n').slice(-2).join(' ') + ')';
      // each test: <TEST ... NAME="..." ...> ... <RESULT><![CDATA[FAIL]]></RESULT>
      const failed = [...xml.matchAll(/<TEST\b[^>]*\bNAME="([^"]+)"[\s\S]*?<RESULT><!\[CDATA\[(\w+)\]\]><\/RESULT>/g)].filter((m) => !/^(PASS|NOT_RUN|WARNING)$/i.test(m[2])).map((m) => m[1] + ': ' + m[2]);
      ok(overall === 'PASS', 'Windows App Certification Kit on the test-signed package: ' + overall + ' in ' + Math.round((Date.now() - t0) / 1000) + ' s' + (failed.length ? '; ' + failed.join('; ') : '') + ' (report: test-out/msix/wack-report.xml)');
    }
  } catch (e) {
    ok(false, 'MSIX test stopped: ' + e.message.split('\n').slice(0, 4).join(' '));
  } finally {
    if (pfn) { try { ps('Get-AppxPackage -Name ' + q(STORE.identityName) + ' | Remove-AppxPackage'); } catch (e) { console.log('could not remove the test package: ' + e.message); } }
    try { ps('Get-ChildItem Cert:\\LocalMachine\\TrustedPeople, Cert:\\CurrentUser\\My | Where-Object Thumbprint -eq ' + q(thumb) + ' | Remove-Item'); } catch (e) { console.log('REMOVE THE TEST CERTIFICATE BY HAND (' + thumb + '): ' + e.message); }
    for (const f of [pfx, cer, signed]) fs.rmSync(f, { force: true });
    const left = ps('(Get-ChildItem Cert:\\LocalMachine\\TrustedPeople, Cert:\\CurrentUser\\My | Where-Object Thumbprint -eq ' + q(thumb) + ').Count');
    ok(left === '0', 'the throwaway certificate is removed from Trusted People and the personal store');
  }
  finish();
})().catch((e) => { console.error('TEST CRASH', e.message.split('\n').slice(0, 8).join('\n')); process.exit(2); });
