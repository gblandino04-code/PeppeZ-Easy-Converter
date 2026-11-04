const { app, BrowserWindow, ipcMain, dialog, shell, screen, Tray, Menu, Notification, nativeImage, session } = require('electron');
const path = require('path');
const fs = require('fs');

const VERSION = require('./package.json').version;
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let win = null, tray = null, hook = { ok: false }, quitting = false, hud = null;
const icon = () => nativeImage.createFromPath(path.join(__dirname, 'app', 'assets', 'icons', 'logo-pz.png'));

function boot() {
  const { Settings, History } = require('./src/settings');
  const { Engine } = require('./src/engine');
  const { Queue } = require('./src/queue');
  const { createApi } = require('./src/api');
  const { Hud } = require('./src/hud');
  const { Foreground } = require('./src/foreground');
  const { startHook } = require('./src/hook');

  const dir = app.getPath('userData');
  const settings = new Settings(dir), history = new History(dir);
  const engine = new Engine({ dirs: [path.join(process.resourcesPath || '', 'filee'), path.join(__dirname, 'engine', 'filee')], userData: dir, settings, snapshotFile: path.join(__dirname, 'app', 'formats.snapshot.json') });
  const queue = new Queue({ engine, history });
  const send = (ch, p) => { if (win && !win.isDestroyed()) win.webContents.send('ev:' + ch, p); };
  const host = {
    emit: send,
    async pickFiles(o) {
      const r = await dialog.showOpenDialog(win, { title: o.title || 'Scegli i file', properties: o.single ? ['openFile'] : ['openFile', 'multiSelections'], filters: o.filters });
      return r.canceled ? [] : r.filePaths;
    },
    async pickFolder() { const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] }); return r.canceled ? null : r.filePaths[0]; },
    openPath: p => shell.openPath(p), showInFolder: p => shell.showItemInFolder(p),
    applySettings(s) {
      if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!s.openAtLogin, args: ['--hidden'] });
      if (s.hudEnabled && !hook.ok) startHooks(); 
      updateThemeOverlay(s.theme);
      updateTray();
    }
  };
  const api = createApi({ settings, history, engine, queue, host, version: VERSION });
  ipcMain.handle('api', async (_e, name, args) => { const f = api[name]; if (!f) throw new Error('API sconosciuta: ' + name); return f(...(args || [])); });

  const foreground = new Foreground();
  hud = new Hud({ BrowserWindow, screen, ipcMain, Notification, engine, queue, settings, root: __dirname });
  function startHooks() { foreground.start(); hook = startHook({ hud, foreground, settings }); send('hook', { ok: hook.ok }); }

  function updateThemeOverlay(theme) {
    if (!win || win.isDestroyed()) return;
    try {
      const isLight = theme === 'light';
      win.setTitleBarOverlay({
        color: isLight ? '#edf2fa' : '#0b0f19',
        symbolColor: isLight ? '#111a30' : '#c9d3e6',
        height: 40
      });
    } catch { }
  }

  function showMain() { if (!win || win.isDestroyed()) createWindow(); if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  function createWindow(hidden) {
    const isLight = settings.get().theme === 'light';
    win = new BrowserWindow({
      width: 1280, height: 800, minWidth: 980, minHeight: 640, show: false,
      backgroundColor: isLight ? '#edf2fa' : '#0b0f19',
      title: 'PeppeZ Easy Converter', icon: icon(),
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: isLight ? '#edf2fa' : '#0b0f19',
        symbolColor: isLight ? '#111a30' : '#c9d3e6',
        height: 40
      },
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, spellcheck: false }
    });
    win.setMenu(null); win.loadFile(path.join(__dirname, 'app', 'index.html'));
    win.once('ready-to-show', () => { if (!hidden) win.show(); });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', e => e.preventDefault());
    win.on('close', e => { if (!quitting && settings.get().closeToTray && tray) { e.preventDefault(); win.hide(); } });
  }
  function updateTray() {
    if (!tray) return;
    const s = settings.get();
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Apri PeppeZ Easy Converter', click: showMain },
      { label: 'Ruota radiale al trascinamento', type: 'checkbox', checked: !!s.hudEnabled, click: m => { settings.set({ hudEnabled: m.checked }); send('settings', settings.get()); } },
      { type: 'separator' }, { label: 'Esci', click: () => { quitting = true; app.quit(); } }
    ]));
  }

  app.whenReady().then(() => {
    // l'app lavora solo in locale: nessuna richiesta di rete esterna
    session.defaultSession.webRequest.onBeforeRequest((d, cb) => cb({ cancel: /^https?:|^wss?:/i.test(d.url) && !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(d.url) }));
    createWindow(process.argv.includes('--hidden'));
    try { tray = new Tray(icon().resize({ width: 20, height: 20 })); tray.setToolTip('PeppeZ Easy Converter'); tray.on('click', showMain); updateTray(); } catch { tray = null; }
    hud.create();
    if (settings.get().hudEnabled) startHooks();
    api.startAllWatchers && api.startAllWatchers();
  });
  app.on('second-instance', (_e, argv) => { showMain(); const files = argv.slice(1).filter(a => !a.startsWith('--') && fs.existsSync(a)); if (files.length) send('open-files', files); });
  app.on('before-quit', () => { quitting = true; try { engine.stopAll(); } catch { } try { hook.stop && hook.stop(); } catch { } try { foreground.stop(); } catch { } });
  app.on('window-all-closed', () => { if (!tray) app.quit(); });
}


boot();
