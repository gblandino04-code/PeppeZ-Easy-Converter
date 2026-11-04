// Rilevamento globale di Maiusc/Ctrl + trascinamento (libreria uiohook-napi).
// Quando trascini un file con il tasto sinistro, basta premere o toccare Maiusc (conversioni) o Ctrl (strumenti)
// in qualsiasi momento per far comparire all'istante la ruota sotto il cursore.
const THRESHOLD = 4;

function startHook({ hud, foreground, settings, log = console.warn }) {
  let uio, Key;
  try { ({ uIOhook: uio, UiohookKey: Key } = require('uiohook-napi')); } catch (e) { log('uiohook-napi non disponibile:', e.message); return { ok: false, error: e.message, stop() { } }; }
  const K = { shift: [Key.Shift, Key.ShiftRight], ctrl: [Key.Ctrl, Key.CtrlRight], esc: Key.Escape, tab: Key.Tab };
  let shift = false, ctrl = false, down = false, dx = 0, dy = 0, dragging = false, allowed = true, cancelled = false, showing = false;
  let requestedMode = null;
  const currentMode = () => ctrl ? 'tools' : shift ? 'convert' : null;
  const enabled = () => settings.get().hudEnabled;

  async function openWheel(m) {
    if (!m || cancelled || !enabled()) return;
    if (hud.visible) {
      if (hud.mode !== m) hud.switchMode(m);
      return;
    }
    if (showing) return;
    showing = true;
    try {
      if (settings.get().hudOnlyExplorer && !allowed) return;
      await hud.show(m);
    } finally {
      showing = false;
    }
  }

  uio.on('keydown', e => {
    const c = e.keycode;
    const isShift = K.shift.includes(c);
    const isCtrl = K.ctrl.includes(c);

    if (isShift) shift = true;
    else if (isCtrl) ctrl = true;
    else if (c === K.esc && hud.visible) {
      cancelled = true;
      requestedMode = null;
      hud.hide();
      return;
    }
    else if (c === K.tab && hud.visible) {
      if (!hud.panelOpen) hud.flip(1);
      return;
    }
    else return;

    if (!isShift && !isCtrl) return;
    const targetMode = isCtrl ? 'tools' : 'convert';

    // Se la ruota è già aperta, cambia modalità al volo (Maiusc <-> Ctrl)
    if (hud.visible && !hud.panelOpen) {
      requestedMode = targetMode;
      hud.switchMode(targetMode);
      return;
    }

    // Se il tasto sinistro del mouse è premuto (trascinamento in corso o appena iniziato)
    if (down) {
      cancelled = false;
      dragging = true;
      requestedMode = targetMode;
      openWheel(targetMode);
    }
  });

  uio.on('keyup', e => {
    const c = e.keycode;
    if (K.shift.includes(c)) shift = false;
    else if (K.ctrl.includes(c)) ctrl = false;
    // Non azzeriamo requestedMode qui: la ruota resta aperta finché non rilasci il mouse o premi Esc!
  });

  uio.on('mousedown', e => {
    if (e.button !== 1 || hud.panelOpen) return;
    down = true;
    dragging = false;
    cancelled = false;
    requestedMode = null;
    dx = e.x;
    dy = e.y;
    allowed = true;
    if (settings.get().hudOnlyExplorer && foreground) {
      foreground.isFileManager().then(ok => { allowed = ok; });
    }
  });

  uio.on('mousemove', e => {
    if (!down || hud.panelOpen) return;
    if (!dragging && Math.hypot(e.x - dx, e.y - dy) >= THRESHOLD) {
      dragging = true;
    }
    if (dragging) {
      // Se era già stato richiesto un modo (es. Shift/Ctrl premuto) o se uno dei tasti è tenuto premuto
      const m = requestedMode || currentMode();
      if (m && !hud.visible) {
        requestedMode = m;
        openWheel(m);
      }
    }
  });

  uio.on('mouseup', e => {
    if (e.button !== 1) return;
    down = false;
    dragging = false;
    requestedMode = null;
    shift = false;
    ctrl = false;
    if (hud.visible && !hud.panelOpen) {
      hud.released();
    }
  });

  uio.on('wheel', e => {
    if (hud.visible && !hud.panelOpen) {
      hud.flip(e.rotation > 0 ? 1 : -1);
    }
  });

  try { uio.start(); } catch (e) { log('uiohook start:', e.message); return { ok: false, error: e.message, stop() { } }; }
  return { ok: true, stop() { try { uio.stop(); } catch { } } };
}

module.exports = { startHook };
