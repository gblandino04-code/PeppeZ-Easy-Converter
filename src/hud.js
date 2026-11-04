// Gestione della ruota: finestra trasparente sempre in primo piano che compare sotto il cursore durante un trascinamento.
const path = require('path');
const { buildOptions, defaultWheelOptions, kindFromMime, extFromMime, pickKind } = require('./hudoptions');
const { Estimator } = require('./estimate');

const SIZE = 460;

// Dove mettere la ruota: centrata perfettamente sul cursore, contenuta nell'area utile dello schermo
function placeWheel(p, area, size = SIZE) {
  let cx = Math.round(p.x), cy = Math.round(p.y);
  const half = Math.round(size / 2);
  if (cx < area.x + half) cx = area.x + half;
  if (cx > area.x + area.width - half) cx = area.x + area.width - half;
  if (cy < area.y + half) cy = area.y + half;
  if (cy > area.y + area.height - half) cy = area.y + area.height - half;

  let x = Math.round(cx - half);
  let y = Math.round(cy - half);
  return { x, y, width: size, height: size, cx: half, cy: half };
}

class Hud {
  constructor({ BrowserWindow, screen, ipcMain, Notification, engine, queue, settings, root }) {
    Object.assign(this, { BrowserWindow, screen, ipcMain, Notification, engine, queue, settings, root });
    this.visible = false; this.mode = 'convert'; this.kind = 'other'; this.exts = []; this.count = 1; this.pending = null; this.hideTimer = null; this.kindsTimer = null; this.token = 0;
    this.panelOpen = false; // finestra di impostazioni (qualità / ordine) aperta: la ruota deve restare ferma e ricevere clic e tastiera
    this.win = null; this.bound = false; this.estimator = new Estimator({ engine });
  }
  create() {
    const win = this.win = new this.BrowserWindow({
      width: SIZE, height: SIZE, show: false, frame: false, transparent: true, resizable: false, movable: false, skipTaskbar: true, alwaysOnTop: true,
      focusable: false, hasShadow: false, fullscreenable: false, backgroundColor: '#00000000',
      webPreferences: { preload: path.join(this.root, 'hud-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: false }
    });
    win.setAlwaysOnTop(true, 'screen-saver'); win.setIgnoreMouseEvents(false);
    win.loadFile(path.join(this.root, 'hud', 'hud.html'));
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    if (this.bound) return; this.bound = true;
    const ipc = this.ipcMain;
    ipc.on('hud:kinds', async (_e, info) => {
      if (!this.visible) return;
      const i = Array.isArray(info) ? { mimes: info, count: info.length } : (info || {}), mimes = i.mimes || [];
      this.kind = pickKind(mimes.map(kindFromMime));
      const exts = mimes.map(extFromMime); this.exts = exts.length && exts.every(Boolean) ? [...new Set(exts)] : []; // un solo tipo sconosciuto: ripiego sul tipo generico
      this.count = i.count || mimes.length || 1; this.gotKinds = true;
      await this.sendOptions();
    });
    ipc.on('hud:close', () => this.hide());
    ipc.on('hud:hold', () => this.holdPanel());
    ipc.on('hud:drop', (_e, p) => this.onDrop(p));
    ipc.handle('hud:estimate', (_e, req) => this.estimator.estimate(req || {}));
  }
  async optionsFor(mode, kind) { try { return await buildOptions({ mode, kind, exts: this.exts, count: this.count, engine: this.engine, settings: this.settings }); } catch { return []; } }
  async sendOptions() {
    const options = await this.optionsFor(this.mode, this.kind);
    if (this.visible && this.win && !this.win.isDestroyed()) this.win.webContents.send('hud:options', { mode: this.mode, options });
  }
  // la ruota è una finestra che non prende il focus (così non disturba il trascinamento); per usare il pannello serve invece che lo prenda
  setInteractive(on) {
    const w = this.win; if (!w || w.isDestroyed()) return;
    try { w.setFocusable(on); if (on) { w.setAlwaysOnTop(true, 'screen-saver'); w.show(); w.focus(); } } catch { }
  }
  holdPanel() {
    this.pending = true; this.panelOpen = true; clearTimeout(this.hideTimer); clearTimeout(this.kindsTimer);
    this.hideTimer = setTimeout(() => { this.pending = null; this.hide(); }, 60000);
    this.setInteractive(true);
  }
  async show(mode) {
    if (!this.win || this.win.isDestroyed()) this.create();
    clearTimeout(this.hideTimer); clearTimeout(this.kindsTimer);
    this.mode = mode; this.kind = 'other'; this.exts = []; this.count = 1; this.gotKinds = false; this.panelOpen = false; this.token++;
    const p = this.screen.getCursorScreenPoint(), d = this.screen.getDisplayNearestPoint(p).workArea, w = placeWheel(p, d);
    this.win.setBounds({ x: w.x, y: w.y, width: SIZE, height: SIZE });
    this.visible = true; this.pending = null;
    // Opzioni predefinite immediate per mostrare subito le fette senza alcun ritardo
    const initialOptions = defaultWheelOptions(mode);
    this.win.webContents.send('hud:show', { mode, cx: w.cx, cy: w.cy, options: initialOptions });
    this.win.showInactive(); this.win.setAlwaysOnTop(true, 'screen-saver');
    this.kindsTimer = setTimeout(() => { if (this.visible && !this.gotKinds) this.sendOptions(); }, 300);
  }
  async switchMode(mode) { if (!this.visible || mode === this.mode) return; this.mode = mode; await this.sendOptions(); }
  flip(dir) { if (this.visible && this.win) this.win.webContents.send('hud:flip', dir); }
  hide() {
    clearTimeout(this.hideTimer); clearTimeout(this.kindsTimer); this.visible = false; this.panelOpen = false;
    try { this.estimator.cancel(); } catch { }
    this.setInteractive(false);
    if (this.win && !this.win.isDestroyed()) { this.win.webContents.send('hud:hide'); setTimeout(() => { if (!this.visible && this.win && !this.win.isDestroyed()) this.win.hide(); }, 160); }
  }
  // tasto del mouse rilasciato: lascio al rilascio sulla ruota il tempo di arrivare, poi chiudo se non è partito nulla
  released() { if (!this.visible || this.panelOpen) return; clearTimeout(this.hideTimer); this.hideTimer = setTimeout(() => { if (!this.pending && !this.panelOpen) this.hide(); }, 450); }

  async onDrop({ paths, option, mode, params }) {
    params = params || {};
    this.panelOpen = false; try { this.estimator.cancel(); } catch { } this.setInteractive(false);
    if (Array.isArray(params.order) && params.order.length === paths.length) paths = params.order;
    if (!option || !paths || !paths.length) return this.hide();
    clearTimeout(this.hideTimer); this.pending = true;
    if (!this.engine.available()) { this.result('failed', 'Motore non collegato'); return; }
    const req = { files: paths, source: 'hud', label: option.label };
    if (option.kind === 'preset') { req.preset = option.value; req.group = !!option.group; } else req.to = option.value;
    const fm = await this.engine.formats(); const tf = fm.find(f => f.id === req.to);
    if (params.quality != null) req.quality = Math.min(100, Math.max(1, +params.quality || 75)); else if (tf && tf.group === 'immagini') req.quality = this.settings.get().quality;
    const ids = await this.queue.add({ files: req.files, to: req.to, preset: req.preset, label: req.label, quality: req.quality, source: 'hud', group: req.group });
    const waiting = new Set(ids), res = [];
    const on = j => {
      if (!waiting.has(j.id) || !['done', 'failed', 'skipped', 'cancelled'].includes(j.status)) return;
      waiting.delete(j.id); res.push(j);
      if (!waiting.size) { this.queue.off('done', on); this.finishDrop(res); }
    };
    this.queue.on('done', on);
  }
  finishDrop(res) {
    const bad = res.filter(j => j.status !== 'done' && j.status !== 'skipped'), ok = res.length - bad.length;
    const text = bad.length ? (bad[0].error || 'Conversione non riuscita') : res.length > 1 ? ok + ' file convertiti' : path.basename((res[0].outputs || [])[0] || res[0].name);
    if (this.settings.get().hudShowResult) this.result(bad.length ? 'failed' : 'done', text);
    else this.hide();
    if (bad.length && this.Notification && this.Notification.isSupported()) new this.Notification({ title: 'PeppeZ Easy Converter', body: text }).show();
  }
  result(status, text) {
    this.pending = true;
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send('hud:result', { status, text: String(text || '').slice(0, 80) });
    clearTimeout(this.hideTimer); this.hideTimer = setTimeout(() => { this.pending = null; this.hide(); }, status === 'done' ? 1500 : 2800);
  }
}

module.exports = { Hud, SIZE, placeWheel };
