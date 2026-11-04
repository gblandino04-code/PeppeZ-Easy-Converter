// Rilevamento globale di Maiusc/Ctrl + trascinamento (libreria uiohook-napi, solo ascolto: non blocca né modifica nulla).
// Logica: pulsante sinistro premuto e spostato oltre la soglia = trascinamento; con Maiusc compare la ruota delle conversioni,
// con Ctrl quella degli strumenti. Al rilascio del pulsante la ruota si chiude (il file lasciato su una fetta parte da solo).
const THRESHOLD = 7;

function startHook({ hud, foreground, settings, log = console.warn }) {
  let uio, Key;
  try { ({ uIOhook: uio, UiohookKey: Key } = require('uiohook-napi')); } catch (e) { log('uiohook-napi non disponibile:', e.message); return { ok: false, error: e.message, stop() { } }; }
  const K = { shift: [Key.Shift, Key.ShiftRight], ctrl: [Key.Ctrl, Key.CtrlRight], esc: Key.Escape, tab: Key.Tab };
  let shift = false, ctrl = false, down = false, dx = 0, dy = 0, dragging = false, allowed = true, cancelled = false, showing = false;
  const mode = () => ctrl ? 'tools' : shift ? 'convert' : null;
  const enabled = () => settings.get().hudEnabled;

  async function consider() {
    if (!dragging || cancelled || !enabled()) return;
    const m = mode(); if (!m) return;
    if (hud.visible) { hud.switchMode(m); return; }
    if (showing) return; showing = true;
    try { if (settings.get().hudOnlyExplorer && !allowed) return; await hud.show(m); } finally { showing = false; }
  }
  uio.on('keydown', e => {
    const c = e.keycode;
    if (K.shift.includes(c)) shift = true; else if (K.ctrl.includes(c)) ctrl = true;
    else if (c === K.esc && hud.visible) { cancelled = true; hud.hide(); return; }
    else if (c === K.tab && hud.visible) { if (!hud.panelOpen) hud.flip(1); return; }
    else return;
    consider();
  });
  uio.on('keyup', e => { const c = e.keycode; if (K.shift.includes(c)) shift = false; else if (K.ctrl.includes(c)) ctrl = false; });
  // con la finestra di impostazioni aperta (qualità / ordine) la ruota non deve reagire a mouse e tasti: si usa solo il pannello
  uio.on('mousedown', e => {
    if (e.button !== 1 || hud.panelOpen) return;
    down = true; dragging = false; cancelled = false; dx = e.x; dy = e.y; allowed = true;
    if (settings.get().hudOnlyExplorer) foreground.isFileManager().then(ok => { allowed = ok; });
  });
  uio.on('mousemove', e => {
    if (!down || hud.panelOpen) return;
    if (!dragging && Math.hypot(e.x - dx, e.y - dy) > THRESHOLD) dragging = true;
    if (dragging) consider();
  });
  uio.on('mouseup', e => { if (e.button !== 1) return; down = false; dragging = false; if (hud.visible && !hud.panelOpen) hud.released(); });
  uio.on('wheel', e => { if (hud.visible && !hud.panelOpen) hud.flip(e.rotation > 0 ? 1 : -1); });
  try { uio.start(); } catch (e) { log('uiohook start:', e.message); return { ok: false, error: e.message, stop() { } }; }
  return { ok: true, stop() { try { uio.stop(); } catch { } } };
}
module.exports = { startHook };
