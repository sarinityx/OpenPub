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
/**
 * Make sure the poppler tools come first on PATH for this process. Git for Windows ships xpdf's pdftotext and
 * pdfinfo in its ucrt64/bin, and Git Bash puts that folder ahead of poppler. xpdf orders text differently (it mixes
 * WordArt letters with nearby text), so the PDF text checks would fail for reasons that have nothing to do with OpenPub.
 * Returns true when a poppler pdftotext was found; false when only another pdftotext (or none) is installed.
 */
exports.preferPoppler = function () {
  let all = [];
  try {
    all = cp.execSync(process.platform === 'win32' ? 'where pdftotext' : 'which -a pdftotext', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  } catch (e) { return false; }
  const isPoppler = (exe) => {
    const r = cp.spawnSync(exe, ['-v'], { encoding: 'utf8' });
    return /poppler/i.test((r.stdout || '') + (r.stderr || ''));
  };
  const found = all.find(isPoppler);
  if (!found) return false;
  if (found !== all[0]) process.env.PATH = path.dirname(found) + path.delimiter + process.env.PATH;
  return true;
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
// opts.profile reuses a profile folder; opts.env adds environment variables (the update tests' hooks).
exports.launchDesktop = async function (extraArgs, opts) {
  const { _electron } = require('playwright-core');
  opts = opts || {};
  const profile = opts.profile || path.join(os.tmpdir(), 'openpub-test-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7));
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: NOSANDBOX.concat(['--user-data-dir=' + profile, exports.DESKTOP_APP], extraArgs || []),
    env: opts.env ? Object.assign({}, process.env, opts.env) : undefined
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
exports.launchPackaged = function (exe, extraArgs, opts) {
  const { _electron } = require('playwright-core');
  opts = opts || {};
  const profile = opts.profile || path.join(os.tmpdir(), 'openpub-smoke-' + Date.now());
  return _electron.launch({ executablePath: exe, args: NOSANDBOX.concat(['--user-data-dir=' + profile], extraArgs || []),
    env: opts.env ? Object.assign({}, process.env, opts.env) : undefined });
};
