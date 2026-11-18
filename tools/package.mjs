// Packages the desktop app into desktop/dist/OpenPub-<platform>-<arch>/, zips it and, for Windows, builds the installer.
//   node tools/package.mjs            -> current platform, x64
//   node tools/package.mjs win32      -> Windows x64: folder, zip and installer (the installer and the exe icon need Windows)
//   node tools/package.mjs linux --no-zip
//   --no-zip, --no-installer          -> skip those steps
import { packager } from '@electron/packager';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESKTOP = path.join(ROOT, 'desktop'), APP = path.join(DESKTOP, 'appsrc'), DIST = path.join(DESKTOP, 'dist');
const RES = path.join(DESKTOP, 'build'); // Windows icons and the NSIS additions
const args = process.argv.slice(2);
const platform = args.find((a) => !a.startsWith('-')) || process.platform;
const arch = 'x64';
const zip = !args.includes('--no-zip');
const onWindows = process.platform === 'win32';
const installer = platform === 'win32' && !args.includes('--no-installer');
const version = require(path.join(APP, 'package.json')).version;
const electronVersion = require('electron/package.json').version;

if (!fs.existsSync(path.join(APP, 'node_modules', 'nspell'))) throw new Error('desktop/appsrc/node_modules is missing: run "npm install" in the repository root first');

// 1. rebuild the single-file editor (also writes desktop/appsrc/app/OpenPub.html)
execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build.js')], { stdio: 'inherit' });

// 2. package
const opts = { dir: APP, name: 'OpenPub', platform, arch, electronVersion, asar: true, out: DIST, overwrite: true, quiet: true };
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
fs.mkdirSync(path.join(out, 'examples'), { recursive: true });
for (const f of fs.readdirSync(path.join(DESKTOP, 'examples'))) fs.copyFileSync(path.join(DESKTOP, 'examples', f), path.join(out, 'examples', f));
console.log('packaged', path.relative(ROOT, out));

// 5. zip (zip on Linux/macOS, the tar that ships with Windows 10 and later on Windows)
if (zip) {
  const name = 'OpenPub-' + version + '-' + (platform === 'win32' ? 'win64' : platform + '-' + arch) + '.zip';
  const target = path.join(DIST, name);
  fs.rmSync(target, { force: true });
  try {
    if (process.platform === 'win32') execFileSync('tar.exe', ['-a', '-c', '-f', name, path.basename(out)], { cwd: DIST, stdio: 'inherit' });
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
      win: { icon: path.join(RES, 'icon.ico'), signAndEditExecutable: false },
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
        differentialPackage: false, // no auto-update
        packElevateHelper: false
      }
    }
  });
  for (const f of files.filter((f) => f.endsWith('.exe'))) console.log('installer', path.relative(ROOT, f), (fs.statSync(f).size / 1e6).toFixed(0) + ' MB');
}
