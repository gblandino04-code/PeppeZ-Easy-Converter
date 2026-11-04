const { contextBridge, ipcRenderer, webUtils } = require('electron');
const { pathToFileURL } = require('url');
contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  call: (name, ...args) => ipcRenderer.invoke('api', name, args),
  on: (ch, cb) => ipcRenderer.on('ev:' + ch, (_e, p) => cb(p)),
  pathOf: f => { try { return webUtils.getPathForFile(f); } catch { return ''; } },
  fileUrl: p => pathToFileURL(p).href
});
