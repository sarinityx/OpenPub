# OpenPub plug-ins and content packs

OpenPub can be extended in two ways. Both are installed from the **Plug-ins** tab > **Plug-ins and content packs**, and both are stored on the computer they are installed on.

| | Content pack | Plug-in |
|---|---|---|
| File | `.opubpack` (JSON) | `.js` |
| Contains | Templates, building blocks, colour schemes | A program |
| Risk | Data only; safe to share | Can read and change open documents and ask to save files. Install only from people you trust |
| Works in the browser version | Yes | Usually not (blocked by the browser's security policy); works in the desktop app |

## Content packs

A pack is one JSON file:

```json
{
  "openpubPack": 1,
  "name": "My pack",
  "author": "Me",
  "description": "What is in it",
  "colours":   [ { "name": "Scheme", "colours": ["#17384a", "#0b6e99"] } ],
  "blocks":    [ { "name": "Sale tag", "category": "Shop", "items": [ ... ], "assets": { } } ],
  "templates": [ { "name": "Notice (A4)", "doc": { ... } } ]
}
```

- `items` use the same format as items inside an `.opub` project. Positions and sizes are in points (1 pt = 1/72 inch; 1 mm = 2.8346 pt). Blocks are laid out from (0, 0).
- `doc` is a whole `.opub` project. An easy way to make one: build it in OpenPub, save the project, and paste the file's contents in as `doc`.
- The quickest way to make a pack is **Export my blocks and templates as a pack**: it writes your saved building blocks and templates to a `.opubpack` you can hand to someone else.
- `sample-pack.opubpack` in this folder is a working example.

Limits: 500 blocks, 200 templates and 50 colour schemes per pack. Unknown fields are ignored and every item is validated when the pack is installed.

## Plug-ins

A plug-in is one JavaScript file that calls `OpenPub.register(details, activate)`:

```js
OpenPub.register({ name: 'My tools', version: '1.0.0', author: 'Me', description: 'What it does' }, function (api) {
  api.addCommand({
    label: 'Stamp date',
    tip: 'Add today\'s date to the page',
    run: function () {
      var doc = api.document();
      api.insert([api.create.textBox(40, 40, 200, 24, new Date().toLocaleDateString('en-AU'), { size: 12 })]);
    }
  });
});
```

`sample-plugin.js` in this folder shows a command, an export format and a building block.

### What `api` offers

**Adding things**

| Call | Result |
|---|---|
| `api.addCommand({ label, tip, run })` | A button on the Plug-ins tab |
| `api.addBlock({ name, category, make(pageWidth) })` | A building block; `make` returns items laid out from (0, 0) |
| `api.addTemplate({ name, make() })` | A template under File > From template; `make` returns a document |
| `api.addExporter({ label, extension, mime, run(doc) })` | An "Export: label" button; `run` gets a copy of the document and returns a string or `Uint8Array` (or a promise of one) |

**Reading the document**

| Call | Result |
|---|---|
| `api.document()` | The open document: `{ name, w, h, bleed, pages: [{ items: [...] }], masters, assets }` (live) |
| `api.page()` / `api.pageIndex()` | The page being edited and its index |
| `api.selection()` | The selected items (live) |
| `api.plainText(item)` | The text of a text box, table or WordArt |

**Changing the document**

| Call | Result |
|---|---|
| `api.create.textBox(x, y, w, h, text, { font, size, bold, italic, color, align })` | A text box (not yet on the page) |
| `api.create.shape(kind, x, y, w, h, fillColour, { color, width })` | A shape; `api.create.shapeKinds()` lists the kinds |
| `api.create.table(rows, cols, x, y, w, h)` | A table |
| `api.create.wordArt(text, x, y, w, h)` | WordArt |
| `api.create.document(widthMm, heightMm)` | A new document, for templates |
| `api.insert(items)` | Puts items on the current page, selects them, records one undo step |
| `api.setText(item, text)` | Replaces a text box's text, keeping its first style |
| `api.commit()` | Call after changing live items yourself: redraws and records one undo step |

**Other**

| Call | Result |
|---|---|
| `api.toast(message)` / `api.alert(title, message)` | Messages to the user |
| `api.saveFile(name, data, mime)` | Opens the Save dialog; the user chooses where the file goes |
| `api.units.mm` | Points per millimetre (2.8346) |
| `api.version` | The OpenPub version |

### Rules worth knowing

- All coordinates and sizes are in points. Multiply millimetres by `api.units.mm`.
- If `run` throws an error, OpenPub shows it as a message. Changes the plug-in made before the error remain in the document, so make all your changes first and call `api.commit()` last.
- A plug-in that is switched off is not run at all.
- Plug-ins cannot read or write files on their own. Saving always goes through the Save dialog.
- The `api` is the supported surface. Anything else inside the app may change between versions.
