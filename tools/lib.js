// Shared paths and launch helpers for the build and test scripts. No machine-specific paths:
// everything is resolved from the repository root or from environment variables.
const path = require('path'), fs = require('fs'), os = require('os'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const LINUX = process.platform === 'linux';

exports.ROOT = ROOT;
exports.SRC = path.join(ROOT, 'app', 'src');
exports.WEB_APP = path.join(ROOT, 'app', 'dist', 'OpenPub.html');
exports.DESKTOP_APP = path.join(ROOT, 'desktop', 'appsrc');
exports.EXAMPLES = path.join(ROOT, 'desktop', 'examples');
exports.PUBS = path.join(ROOT, 'test-data', 'publisher');

// fresh output folder under test-out/ (ignored by git)
exports.outDir = function (name) {
  const d = path.join(ROOT, 'test-out', name);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
  return d;
};
exports.tmpPath = function (name) { return path.join(os.tmpdir(), name); };
exports.fileUrl = function (p) { return require('url').pathToFileURL(p).href; };

// is a command-line tool on PATH?
exports.have = function (cmd) {
  try { cp.execSync((process.platform === 'win32' ? 'where ' : 'command -v ') + cmd, { stdio: 'ignore' }); return true; } catch (e) { return false; }
};
exports.sh = function (cmd) {
  try { return cp.execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return 'ERR ' + (e.stderr || e.message); }
};

// Chrome sandbox cannot start as root in a container; only relax it on Linux.
const NOSANDBOX = LINUX ? ['--no-sandbox'] : [];
exports.NOSANDBOX = NOSANDBOX;

// Headless Chrome for the browser tests: the installed Google Chrome, or CHROME_PATH if set.
exports.launchChrome = function () {
  const { chromium } = require('playwright-core');
  const o = { args: NOSANDBOX };
  if (process.env.CHROME_PATH) o.executablePath = process.env.CHROME_PATH; else o.channel = 'chrome';
  return chromium.launch(o);
};

// Electron from node_modules running the unpackaged desktop app with a clean profile (app.profile).
exports.launchDesktop = async function (extraArgs) {
  const { _electron } = require('playwright-core');
  const profile = path.join(os.tmpdir(), 'openpub-test-' + Date.now());
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: NOSANDBOX.concat(['--user-data-dir=' + profile, exports.DESKTOP_APP], extraArgs || [])
  });
  app.profile = profile;
  return app;
};
// Start the unpackaged app a second time with the same profile, as Windows does when a file is double-clicked
// while OpenPub is open. Resolves with the exit code ('timeout' if it is still running after 20 s).
exports.secondInstance = function (profile, extraArgs) {
  const { spawn } = require('child_process');
  const child = spawn(require('electron'), NOSANDBOX.concat(['--user-data-dir=' + profile, exports.DESKTOP_APP], extraArgs || []), { stdio: 'ignore' });
  return new Promise((resolve) => {
    const t = setTimeout(() => { child.kill(); resolve('timeout'); }, 20000);
    child.on('exit', (code) => { clearTimeout(t); resolve(code); });
  });
};
// A packaged build (path to the executable).
exports.launchPackaged = function (exe, extraArgs) {
  const { _electron } = require('playwright-core');
  const profile = path.join(os.tmpdir(), 'openpub-smoke-' + Date.now());
  return _electron.launch({ executablePath: exe, args: NOSANDBOX.concat(['--user-data-dir=' + profile], extraArgs || []) });
};
