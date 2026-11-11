# OpenPub – source

- `src/` – the editor and the .pub parser (plain JavaScript, no dependencies). `tools/build.js` bundles it into one HTML file.
- `desktop/` – the Electron shell (`main.js`, `preload.js`), the Australian English dictionary and a pre-built `app/OpenPub.html`.

## Build the Windows app yourself (needs Node.js LTS)

Run in `desktop/`:

    npm install
    npm install --save-dev electron @electron/packager
    npx electron-packager . OpenPub --platform=win32 --arch=x64 --asar --out=dist --overwrite

The app appears in `desktop\dist\OpenPub-win32-x64\OpenPub.exe`.
These are the same commands used to produce the supplied build (run on Linux; not re-run on Windows).

## Rebuild the bundled HTML after changing `src/`

`tools/build.js` expects the original folder layout (`app/src`, `desktop/appsrc`); adjust the two paths at the top of the file to `../src` and `../desktop/app`.
