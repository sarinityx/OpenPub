// Packages the desktop app into desktop/dist/OpenPub-<platform>-<arch>/, zips it and, for Windows, builds the installer
// and the Microsoft Store package (OpenPub-<version>-x64.msix).
//   node tools/package.mjs            -> current platform, x64
//   node tools/package.mjs win32      -> Windows x64: folder, zip and installer (the installer and the exe icon need Windows)
//   node tools/package.mjs linux --no-zip
//   --no-zip, --no-installer, --no-msix -> skip those steps
//   --version 9.9.9 --out DIR         -> build as another version into another folder (tools/e2e-installer.js uses
//                                        this to make the "next" version it updates to); the repository is not changed
//   --publisher "CN=..., O=..."       -> app-update.yml names the signing certificate: updates must be signed by it
//   --from-folder                     -> Windows only: do not package; zip and build the installer from the folder
//                                        already in DIST (release.yml: after SignPath has signed OpenPub.exe in it)
import { packager } from '@electron/packager';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argValue = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const DESKTOP = path.join(ROOT, 'desktop'), APP = path.join(DESKTOP, 'appsrc');
const DIST = path.resolve(argValue('--out') || path.join(DESKTOP, 'dist'));
const RES = path.join(DESKTOP, 'build'); // Windows icons and the NSIS additions
const args = process.argv.slice(2).filter((a, i, all) => !['--out', '--version', '--publisher'].includes(all[i - 1]));
const platform = args.find((a) => !a.startsWith('-')) || process.platform;
const arch = 'x64';
const zip = !args.includes('--no-zip');
const onWindows = process.platform === 'win32';
const installer = platform === 'win32' && !args.includes('--no-installer');
const msix = platform === 'win32' && !args.includes('--no-msix');
const version = argValue('--version') || require(path.join(APP, 'package.json')).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('--version must look like 1.2.3');
const versionOverride = version !== require(path.join(APP, 'package.json')).version;
const electronVersion = require('electron/package.json').version;
const publisher = argValue('--publisher');
const fromFolder = args.includes('--from-folder');
if (fromFolder && platform !== 'win32') throw new Error('--from-folder is for the Windows build only');
const { updateConfigYml } = require('./update-config.js');

let out;
if (fromFolder) {
  // the folder an earlier run packaged (and SignPath signed): only app-update.yml is written again, to add the
  // publisher. It is outside OpenPub.exe, so rewriting it leaves the signature intact.
  out = path.join(DIST, 'OpenPub-win32-x64');
  for (const f of ['OpenPub.exe', path.join('resources', 'app.asar')]) if (!fs.existsSync(path.join(out, f))) throw new Error('--from-folder: ' + path.join(out, f) + ' is missing');
  fs.writeFileSync(path.join(out, 'resources', 'app-update.yml'), updateConfigYml(publisher));
  console.log('using the packaged folder', path.relative(ROOT, out) + (publisher ? '; updates must be signed by ' + publisher : ''));
} else {
  out = await packageApp();
}

async function packageApp() {
  if (!fs.existsSync(path.join(APP, 'node_modules', 'nspell'))) throw new Error('desktop/appsrc/node_modules is missing: run "npm install" in the repository root first');

  // 1. rebuild the single-file editor (also writes desktop/appsrc/app/OpenPub.html)
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build.js')], { stdio: 'inherit' });

  // 2. package
  const opts = { dir: APP, name: 'OpenPub', platform, arch, electronVersion, asar: true, out: DIST, overwrite: true, quiet: true, appVersion: version };
  if (versionOverride) opts.sanitizePackageJson = [(pkg) => { pkg.version = version; return pkg; }];
  if (platform === 'win32') {
    // opub.ico is the icon of files the installer associates with OpenPub (resources\opub.ico)
    opts.extraResource = [path.join(RES, 'opub.ico')];
    opts.win32metadata = { CompanyName: 'OpenPub', FileDescription: 'OpenPub', ProductName: 'OpenPub', InternalName: 'OpenPub', OriginalFilename: 'OpenPub.exe' };
    // setting the exe icon and version details uses rcedit, which needs Wine outside Windows
    if (onWindows) opts.icon = path.join(RES, 'icon.ico');
    else console.log('Not on Windows: OpenPub.exe keeps the default Electron icon and version details.');
  }
  const [out] = await packager(opts);

  // 3. keep only the English locale files (saves about 40 MB)
  const locales = path.join(out, 'locales');
  if (fs.existsSync(locales)) for (const f of fs.readdirSync(locales)) if (!/^en-(US|GB)\.pak$/.test(f)) fs.rmSync(path.join(locales, f));

  // 4. read-me and examples beside the executable
  fs.copyFileSync(path.join(DESKTOP, 'README-win.txt'), path.join(out, 'README.txt'));
  // OpenPub's licence; LICENSE in the folder is Electron's
  fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(out, 'LICENSE-OpenPub.txt'));
  // update checks (desktop/appsrc/updater.js): where electron-updater looks for new versions. electron-builder only
  // writes app-update.yml when it packages the app itself; it skips that for a prepackaged folder, so write it here.
  // Without --publisher (every build except a signed release) update signatures are not checked: tools/update-config.js.
  if (platform === 'win32') fs.writeFileSync(path.join(out, 'resources', 'app-update.yml'), updateConfigYml(publisher));
  fs.mkdirSync(path.join(out, 'examples'), { recursive: true });
  for (const f of fs.readdirSync(path.join(DESKTOP, 'examples'))) fs.copyFileSync(path.join(DESKTOP, 'examples', f), path.join(out, 'examples', f));
  console.log('packaged', path.relative(ROOT, out));
  return out;
}

// 5. zip (zip on Linux/macOS, the tar that ships with Windows 10 and later on Windows)
if (zip) {
  const name = 'OpenPub-' + version + '-' + (platform === 'win32' ? 'win64' : platform + '-' + arch) + '.zip';
  const target = path.join(DIST, name);
  fs.rmSync(target, { force: true });
  try {
    // Windows' own tar (bsdtar) by full path: Git Bash puts GNU tar first on PATH, which ignores -a and writes a tar
    if (process.platform === 'win32') execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-a', '-c', '-f', name, path.basename(out)], { cwd: DIST, stdio: 'inherit' });
    else execFileSync('zip', ['-q', '-r', '-9', name, path.basename(out)], { cwd: DIST, stdio: 'inherit' });
    console.log('zipped', path.relative(ROOT, target), (fs.statSync(target).size / 1e6).toFixed(0) + ' MB');
  } catch (e) {
    console.log('Could not create the zip (' + e.message.split('\n')[0] + '). The packaged folder is complete; zip it by hand if needed.');
  }
}

// 6. Windows installer (electron-builder NSIS, built from the packaged folder above).
// One installer: the user picks "Only for me" (no admin rights) or "Anyone who uses this computer".
// Silent: OpenPub-<version>-win64-setup.exe /S /currentuser   or   /S /allusers (run as administrator).
// File types and the keep-settings question on uninstall are in desktop/build/installer.nsh.
if (installer && !onWindows) console.log('Not on Windows: skipping the installer.');
if (installer && onWindows) {
  const { build, Platform, Arch } = (await import('electron-builder')).default;
  const files = await build({
    projectDir: ROOT,
    prepackaged: out,
    targets: Platform.WINDOWS.createTarget('nsis', Arch.x64),
    publish: 'never',
    config: {
      appId: 'org.openpub.desktop', // never change: the installer's GUID is derived from it
      productName: 'OpenPub',
      electronVersion,
      directories: { app: APP, output: DIST, buildResources: RES },
      extraMetadata: versionOverride ? { version } : undefined,
      // verifyUpdateCodeSignature only shapes the app-update.yml electron-builder would write, which it skips for a
      // prepackaged folder: OpenPub's own app-update.yml carries publisherName (--publisher). It is set explicitly
      // because electron-builder 27 requires it without a publisherName. signAndEditExecutable: false also keeps
      // electron-builder from touching OpenPub.exe, which may already be signed (--from-folder).
      win: { icon: path.join(RES, 'icon.ico'), signAndEditExecutable: false, verifyUpdateCodeSignature: false },
      nsis: {
        oneClick: false,
        perMachine: false, // show the "Only for me" / "Anyone who uses this computer" page
        selectPerMachineByDefault: false,
        allowElevation: true,
        allowToChangeInstallationDirectory: false,
        createDesktopShortcut: false,
        createStartMenuShortcut: true,
        shortcutName: 'OpenPub',
        uninstallDisplayName: 'OpenPub',
        installerIcon: path.join(RES, 'icon.ico'),
        uninstallerIcon: path.join(RES, 'icon.ico'),
        include: path.join(RES, 'installer.nsh'),
        artifactName: 'OpenPub-${version}-win64-setup.${ext}',
        differentialPackage: true, // writes the installer's .blockmap: electron-updater downloads only changed blocks
        // per-machine updates need no elevate.exe: the silent update run of the installer asks Windows for
        // administrator rights itself (UAC), and electron-updater falls back to running it elevated on EACCES
        packElevateHelper: false
      }
    }
  });
  for (const f of files.filter((f) => f.endsWith('.exe'))) console.log('installer', path.relative(ROOT, f), (fs.statSync(f).size / 1e6).toFixed(0) + ' MB');
}

// 7. Microsoft Store package (MSIX, 1.3 brief item 6), from the same packaged folder. Unsigned: the Store signs it
// when it is published; tools/e2e-msix.js test-signs a copy with a throwaway certificate to install it.
// The identity comes from the Partner Center reservation (desktop/build/store.json); the manifest, with the file types
// and the command-line alias, is desktop/build/appxmanifest.xml; tiles and logos are desktop/build/appx/ (make-icons.js).
// In the package, process.windowsStore is true: no update checks (updater.js) and no own taskbar ID (main.js).
if (msix && !onWindows) console.log('Not on Windows: skipping the MSIX.');
if (msix && onWindows) {
  const store = JSON.parse(fs.readFileSync(path.join(RES, 'store.json'), 'utf8'));
  const { build, Platform, Arch } = (await import('electron-builder')).default;
  const files = await build({
    projectDir: ROOT,
    prepackaged: out,
    targets: Platform.WINDOWS.createTarget('appx', Arch.x64),
    publish: 'never',
    config: {
      appId: 'org.openpub.desktop',
      productName: 'OpenPub',
      electronVersion,
      directories: { app: APP, output: DIST, buildResources: RES },
      extraMetadata: versionOverride ? { version } : undefined,
      toolsets: { winCodeSign: '1.1.0' }, // makeappx and makepri from the Windows SDK 10.0.26100 (the default is from 2017)
      win: { signAndEditExecutable: false },
      appx: {
        identityName: store.identityName,
        publisher: store.publisher,
        publisherDisplayName: store.publisherDisplayName,
        applicationId: 'OpenPub',
        displayName: 'OpenPub',
        backgroundColor: 'transparent',
        languages: ['en-AU'],
        minVersion: '10.0.17763.0', // Windows 10 1809, the oldest the Store still offers apps to
        maxVersionTested: '10.0.26100.0', // Windows 11 24H2
        customManifestPath: 'appxmanifest.xml',
        artifactName: 'OpenPub-${version}-x64.msix'
      }
    }
  });
  for (const f of files.filter((f) => f.endsWith('.msix'))) console.log('msix', path.relative(ROOT, f), (fs.statSync(f).size / 1e6).toFixed(0) + ' MB' + (store.placeholder ? ' (placeholder identity in desktop/build/store.json: for testing, not for the Store)' : ''));
}
