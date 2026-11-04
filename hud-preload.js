const { contextBridge, ipcRenderer, webUtils } = require('electron');
const on = (ch, cb) => ipcRenderer.on(ch, (_e, p) => cb(p));
contextBridge.exposeInMainWorld('hud', {
  pathOf: f => webUtils.getPathForFile(f),
  kinds: k => ipcRenderer.send('hud:kinds', k), drop: p => ipcRenderer.send('hud:drop', p), close: () => ipcRenderer.send('hud:close'), hold: () => ipcRenderer.send('hud:hold'), estimate: req => ipcRenderer.invoke('hud:estimate', req),
  onShow: cb => on('hud:show', cb), onOptions: cb => on('hud:options', cb), onFlip: cb => on('hud:flip', cb), onHide: cb => on('hud:hide', cb), onResult: cb => on('hud:result', cb)
});
