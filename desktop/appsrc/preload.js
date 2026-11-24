// Bridge between the page and the desktop shell. Only these calls are exposed to the page.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('openpubDesktop', {
  platform: process.platform,
  saveFile: (o) => ipcRenderer.invoke('file:save', o),
  openDialog: () => ipcRenderer.invoke('file:open'),
  initialFile: () => ipcRenderer.invoke('file:initial'),
  onOpenFile: (cb) => { ipcRenderer.on('file:opened', (e, f) => cb(f)); },
  vectorPdf: (o) => ipcRenderer.invoke('pdf:vector', o),
  print: (o) => ipcRenderer.invoke('print', o),
  gsStatus: () => ipcRenderer.invoke('gs:status'),
  gsPick: () => ipcRenderer.invoke('gs:pick'),
  iccPick: () => ipcRenderer.invoke('icc:pick'),
  iccClear: () => ipcRenderer.invoke('icc:clear'),
  cmykPdf: (o) => ipcRenderer.invoke('pdf:cmyk', o),
  spellCheck: (words) => ipcRenderer.invoke('spell:check', words),
  spellSuggest: (word) => ipcRenderer.invoke('spell:suggest', word),
  spellAdd: (word) => ipcRenderer.invoke('spell:add', word),
  // update checks (updater.js): state, the first-start answer, the setting, and the notice's buttons
  update: {
    state: () => ipcRenderer.invoke('update:state'),
    onState: (cb) => { ipcRenderer.on('update:state', (e, s) => cb(s)); },
    answer: (yes) => ipcRenderer.invoke('update:answer', !!yes),
    setAuto: (on) => ipcRenderer.invoke('update:set-auto', !!on),
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    skip: (version) => ipcRenderer.invoke('update:skip', String(version || '')),
    releasePage: () => ipcRenderer.invoke('update:release-page')
  }
});
