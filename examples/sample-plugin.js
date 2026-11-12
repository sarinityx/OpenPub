// Sample OpenPub plug-in. Install it from the Plug-ins tab > Plug-ins and content packs.
// A plug-in is one JavaScript file that calls OpenPub.register(details, activate).
OpenPub.register({
  name: 'Sample tools',
  version: '1.0.0',
  author: 'OpenPub',
  description: 'Placeholder text, a word count, a plain-text export and a speech-bubble block.'
}, function (api) {
  var LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ' +
    'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.';

  // A command: appears as a button on the Plug-ins tab.
  api.addCommand({
    label: 'Placeholder text',
    tip: 'Fill the selected text boxes with placeholder text (or add a new box)',
    run: function () {
      var boxes = api.selection().filter(function (it) { return it.text; });
      if (!boxes.length) {
        var doc = api.document(), w = doc.w * 0.6;
        api.insert([api.create.textBox((doc.w - w) / 2, doc.h * 0.3, w, 120, LOREM, { size: 12 })]);
        return;
      }
      boxes.forEach(function (it) { api.setText(it, LOREM); });
      api.commit(); // redraw and make the change undoable
    }
  });

  api.addCommand({
    label: 'Word count',
    tip: 'Count the words in the whole document',
    run: function () {
      var words = 0, boxes = 0;
      api.document().pages.forEach(function (page) {
        page.items.forEach(function (it) {
          var t = api.plainText(it).trim();
          if (t) { boxes++; words += t.split(/\s+/).length; }
        });
      });
      api.alert('Word count', words + ' words in ' + boxes + ' text objects on ' + api.document().pages.length + ' page(s).');
    }
  });

  // An export format: run() receives a copy of the document and returns text or bytes.
  api.addExporter({
    label: 'Text outline',
    extension: 'txt',
    mime: 'text/plain',
    run: function (doc) {
      return doc.pages.map(function (page, i) {
        var lines = page.items.map(function (it) {
          if (!it.text) return '';
          return it.text.paras.map(function (p) { return p.runs.map(function (r) { return r.t; }).join(''); }).join('\n').trim();
        }).filter(Boolean);
        return '=== Page ' + (i + 1) + ' ===\n' + lines.join('\n\n');
      }).join('\n\n');
    }
  });

  // A building block: make(pageWidth) returns items laid out from (0, 0), in points.
  api.addBlock({
    name: 'Speech bubble',
    category: 'Sample plug-in',
    make: function (u) {
      var w = u * 0.4, h = u * 0.22;
      var bubble = api.create.shape('callout', 0, 0, w, h, '#ffffff', { color: '#17384a', width: 2 });
      var words = api.create.textBox(w * 0.08, h * 0.12, w * 0.84, h * 0.5, 'Say it here!', { size: u * 0.04, bold: true, align: 'center' });
      return [bubble, words];
    }
  });
});
