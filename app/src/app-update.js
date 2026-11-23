/* OpenPub – update checks in the desktop app: the one-time question on first start, the notice when a new version is
 * available, downloaded or ready, and File › Check for updates. The checks run in the desktop shell
 * (desktop/appsrc/updater.js); this module only shows them. Nothing here exists in the browser build. */
var OP = (typeof globalThis.OP !== 'undefined') ? globalThis.OP : (globalThis.OP = {});

(function () {
  'use strict';
  var A = OP.app, $ = A.$, h = A.h;
  var U = OP.desktop && OP.desktop.update;
  var PRIVACY = 'https://sarinityx.github.io/OpenPub/privacy.html';
  var st = null, dismissed = {}; // notices put away with "Not now" or "Later" in this session

  A.updateState = function () { return st; };

  function box() {
    var n = $('updnote');
    if (!n) {
      n = h('div', { id: 'updnote', class: 'updnote', role: 'region', 'aria-label': 'Updates', 'aria-live': 'polite', hidden: true });
      document.body.appendChild(n);
    }
    return n;
  }
  function btn(id, label, fn, primary) { return h('button', { type: 'button', id: id, class: 'btn' + (primary ? ' primary' : ''), text: label, onclick: fn }); }
  function show(title, body, buttons) {
    var n = box();
    n.innerHTML = '';
    n.appendChild(h('p', { class: 'updtitle', text: title }));
    (body || []).forEach(function (b) { if (b) n.appendChild(typeof b === 'string' ? h('p', { text: b }) : b); });
    if (buttons && buttons.length) n.appendChild(h('div', { class: 'updbtns' }, buttons));
    n.hidden = false;
  }
  function hide() { box().hidden = true; }

  function render() {
    if (!st || !st.available) { hide(); return; }
    var v = st.update;
    if (st.ask && !dismissed.ask) {
      show('Check for updates automatically?', [
        h('p', null, ['OpenPub can check GitHub once a day for a new version. It asks before downloading anything and sends nothing about you or your files. ',
          h('a', { href: PRIVACY, target: '_blank', rel: 'noopener', text: 'Privacy' })])
      ], [btn('updYes', 'Yes', function () { answer(true); }, true), btn('updNo', 'No', function () { answer(false); })]);
      return;
    }
    if (st.downloaded && !dismissed['ready:' + st.downloaded]) {
      show('OpenPub ' + st.downloaded + ' is ready to install', ['OpenPub restarts to install it. If you have unsaved changes, you are asked about them first.'], [
        btn('updRestart', 'Restart to update', restart, true),
        btn('updLaterInstall', 'Later', function () { dismissed['ready:' + st.downloaded] = true; hide(); A.toast('OpenPub ' + st.downloaded + ' will be installed when you close OpenPub.'); })]);
      return;
    }
    if (st.downloading) {
      var bar = h('i'); bar.style.width = (st.downloading.percent || 0) + '%';
      show('Downloading OpenPub ' + (st.downloading.version || v) + '…', [h('div', { class: 'progress' }, [bar]), (st.downloading.percent || 0) + '%']);
      return;
    }
    if (v && !dismissed['avail:' + v]) {
      var body = [], buttons = [];
      if (st.mode === 'portable') {
        body.push('This is the portable version: download the new zip from the release page.');
        buttons.push(btn('updPage', 'Release page', function () { U.releasePage(); }, true));
      } else if (!st.canDownload) {
        body.push('OpenPub is installed for everyone on this computer, so an administrator needs to install the update.');
        buttons.push(btn('updPage', 'Release page', function () { U.releasePage(); }, true));
      } else {
        if (st.perMachine) body.push('OpenPub is installed for everyone on this computer: Windows will ask for permission to install the update.');
        buttons.push(btn('updDownload', 'Download', download, true));
        buttons.push(btn('updNotes', 'What\'s new', function () { U.releasePage(); }));
      }
      buttons.push(btn('updLater', 'Not now', function () { dismissed['avail:' + v] = true; hide(); }));
      buttons.push(btn('updSkip', 'Skip this version', function () { U.skip(v).then(set); }));
      show('OpenPub ' + v + ' is available', body, buttons);
      return;
    }
    hide();
  }
  function set(s) { st = s; render(); syncCommands(); }
  function answer(yes) { dismissed.ask = true; U.answer(yes).then(set); if (!yes) A.toast('OpenPub will not check for updates. File › Check for updates works at any time.'); }
  function download() {
    U.download().then(function (r) { if (r && !r.ok && r.message) A.toast(r.message, true); });
  }
  function restart() {
    if (A.modalBusy && A.modalBusy()) { A.toast('Finish the export or print first.', true); return; }
    U.install().then(function (r) { if (r && !r.ok && !r.cancelled && r.message) A.toast(r.message, true); });
  }
  /** The ribbon command only exists where OpenPub updates itself (not in the Store version or from source). */
  function syncCommands() {
    var b = $('rbUpdates');
    if (b) b.hidden = !st || !(st.mode === 'installed' || st.mode === 'portable');
  }

  /** File › Check for updates: checks now, whether or not automatic checks are on (unless the policy is set). */
  A.checkForUpdates = function () {
    if (!U) return;
    var status = h('p', { id: 'updStatus', text: 'Checking for updates…' });
    var body = [status];
    var auto = null;
    if (st && st.available) {
      auto = h('input', { type: 'checkbox', id: 'updAuto' });
      auto.checked = st.auto === true;
      auto.addEventListener('change', function () { dismissed.ask = true; U.setAuto(auto.checked).then(set); });
      body.push(h('label', { for: 'updAuto', class: 'updauto' }, [auto, 'Check for updates automatically (once a day)']));
    }
    A.modal('Check for updates', body, [{ label: 'Close', cls: 'primary' }]);
    U.check().then(function (r) {
      if (!$('updStatus')) return;
      var you = 'You have OpenPub ' + ((st && st.current) || OP.VERSION) + '.';
      if (r.status === 'policy') status.textContent = 'Updates are managed by your organisation.';
      else if (r.status === 'off') status.textContent = 'This copy of OpenPub is updated by the Microsoft Store.';
      else if (r.status === 'none') status.textContent = you + ' It is the latest version.';
      else if (r.status === 'available' || r.status === 'skipped') { status.textContent = you + ' OpenPub ' + r.version + ' is available.'; delete dismissed['avail:' + r.version]; U.state().then(set); }
      else status.textContent = 'OpenPub could not check for updates. ' + (r.message || '');
      if (r.status === 'policy' && auto) auto.closest('label').remove();
    });
  };

  if (!U) return;
  U.onState(set);
  U.state().then(set);
})();
