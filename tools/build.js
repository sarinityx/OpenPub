// Bundles app/src into a single self-contained HTML file: app/dist/OpenPub.html
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'app', 'src'), DIST = path.join(__dirname, '..', 'app', 'dist');
const ORDER = ['util', 'cfb', 'model', 'geometry', 'wmf', 'emf', 'layout', 'hyph', 'flow', 'wrap', 'table', 'wordart', 'pub', 'pubconv', 'render', 'export',
  'app-core', 'app-input', 'app-text', 'app-panels', 'app-extra', 'app-print', 'app-ribbon', 'app-plugins', 'app-main'];
const js = ORDER.map(m => {
  const s = fs.readFileSync(path.join(SRC, m + '.js'), 'utf8');
  if (/<\/script/i.test(s)) throw new Error(m + '.js contains </script');
  return '// ===== ' + m + '.js\n' + s;
}).join('\n;\n');
const tpl = fs.readFileSync(path.join(SRC, 'index.template.html'), 'utf8');
if (tpl.indexOf('/*__SCRIPTS__*/') < 0) throw new Error('template marker missing');
const html = tpl.replace('/*__SCRIPTS__*/', () => js);
fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, 'OpenPub.html'), html);
console.log('built', path.join(DIST, 'OpenPub.html'), (html.length / 1024).toFixed(0) + ' KB');
// desktop copy: no web-font requests, so the app never touches the network
const desk = path.join(__dirname, '..', 'desktop', 'appsrc', 'app');
if (fs.existsSync(path.dirname(desk))) {
  fs.mkdirSync(desk, { recursive: true });
  const local = html.replace(/<link rel="preconnect"[^>]*>\n?/g, '').replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>\n?/g, '');
  if (/fonts\.googleapis/.test(local)) throw new Error('font link not removed');
  fs.writeFileSync(path.join(desk, 'OpenPub.html'), local);
  console.log('built desktop copy');
}
