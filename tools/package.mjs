// Packages the desktop app into desktop/dist/OpenPub-<platform>-<arch>/ and zips it.
//   node tools/package.mjs            -> current platform, x64
//   node tools/package.mjs win32      -> Windows x64 (can be cross-built from Linux or macOS)
//   node tools/package.mjs linux --no-zip
import { packager } from '@electron/packager';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESKTOP = path.join(ROOT, 'desktop'), APP = path.join(DESKTOP, 'appsrc'), DIST = path.join(DESKTOP, 'dist');
const args = process.argv.slice(2);
const platform = args.find((a) => !a.startsWith('-')) || process.platform;
const arch = 'x64';
const zip = !args.includes('--no-zip');
const version = require(path.join(APP, 'package.json')).version;
const electronVersion = require('electron/package.json').version;

if (!fs.existsSync(path.join(APP, 'node_modules', 'nspell'))) throw new Error('desktop/appsrc/node_modules is missing: run "npm install" in the repository root first');

// 1. rebuild the single-file editor (also writes desktop/appsrc/app/OpenPub.html)
execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build.js')], { stdio: 'inherit' });

// 2. package
const [out] = await packager({ dir: APP, name: 'OpenPub', platform, arch, electronVersion, asar: true, out: DIST, overwrite: true, quiet: true });

// 3. keep only the English locale files (saves about 40 MB)
const locales = path.join(out, 'locales');
if (fs.existsSync(locales)) for (const f of fs.readdirSync(locales)) if (!/^en-(US|GB)\.pak$/.test(f)) fs.rmSync(path.join(locales, f));

// 4. read-me and examples beside the executable
fs.copyFileSync(path.join(DESKTOP, 'README-win.txt'), path.join(out, 'README.txt'));
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
