// Rilevamento globale di Maiusc/Ctrl + trascinamento (libreria uiohook-napi).
// Supporta sia tocco/pressione di Shift o Ctrl durante il trascinamento, sia pressione preventiva prima del clic.
// Include protezione attiva: non si attiva MAI nei giochi o applicazioni a schermo intero.
const THRESHOLD = 2; // soglia minima di 2 pixel: massima reattività e apertura istantanea

function startHook({ hud, foreground, settings, log = console.warn }) {
  let uio, Key;
  try {
    ({ uIOhook: uio, UiohookKey: Key } = require('uiohook-napi'));
  } catch (e) {
    log('uiohook-napi non disponibile:', e.message);
    return { ok: false, error: e.message, stop() { } };
  }

  const K = {
    shift: [Key.Shift, Key.ShiftRight],
    ctrl: [Key.Ctrl, Key.CtrlRight],
    esc: Key.Escape,
    tab: Key.Tab
  };

  let shift = false, ctrl = false, down = false, dx = 0, dy = 0, dragging = false, cancelled = false;
  let requestedMode = null;

  const enabled = () => settings.get().hudEnabled;

  function isGame() {
    return foreground && typeof foreground.isGameActive === 'function' && foreground.isGameActive();
  }

  function isAllowed() {
    if (isGame()) return false;
    if (settings.get().hudOnlyExplorer && foreground && typeof foreground.isFileManagerActive === 'function') {
      return foreground.isFileManagerActive();
    }
    return true;
  }

  function openWheel(m) {
    if (!m || cancelled || !enabled() || !isAllowed()) return;
    if (hud.visible) {
      if (hud.mode !== m) hud.switchMode(m);
      return;
    }
    hud.show(m);
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
    } else if (c === K.tab && hud.visible) {
      if (!hud.panelOpen) hud.flip(1);
      return;
    } else {
      return;
    }

    // Protezione giochi: se e attivo un gioco, ignora la combinazione
    if (!isAllowed()) return;

    const targetMode = isCtrl ? 'tools' : 'convert';

    // Se la ruota e gia aperta, cambia modalita al volo (Maiusc <-> Ctrl)
    if (hud.visible && !hud.panelOpen) {
      requestedMode = targetMode;
      hud.switchMode(targetMode);
      return;
    }

    // Se il tasto sinistro del mouse e premuto: apri subito la ruota
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
    // Nota: non chiudiamo la ruota quando rilasci Shift o Ctrl.
    // Basta un tocco: la ruota resta aperta durante il trascinamento finche non rilasci il mouse o premi Esc.
  });

  uio.on('mousedown', e => {
    if (e.button !== 1 || hud.panelOpen) return;
    if (!isAllowed()) return;

    down = true;
    dragging = false;
    cancelled = false;
    dx = e.x;
    dy = e.y;

    // Se Shift o Ctrl erano gia premuti prima di iniziare a trascinare:
    const activeCtrl = e.ctrlKey || ctrl;
    const activeShift = e.shiftKey || shift;
    if (activeCtrl) {
      requestedMode = 'tools';
    } else if (activeShift) {
      requestedMode = 'convert';
    } else {
      requestedMode = null;
    }
  });

  uio.on('mousemove', e => {
    if (!down || hud.panelOpen || cancelled) return;

    // Se l'utente e passato a un gioco, chiudi subito la ruota
    if (isGame()) {
      if (hud.visible) hud.hide();
      return;
    }

    // Rileva trascinamento immediato a partire da 2 pixel
    if (!dragging && Math.hypot(e.x - dx, e.y - dy) >= THRESHOLD) {
      dragging = true;
    }

    if (dragging) {
      const activeCtrl = e.ctrlKey || ctrl;
      const activeShift = e.shiftKey || shift;
      const m = activeCtrl ? 'tools' : activeShift ? 'convert' : requestedMode;

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

  try {
    uio.start();
  } catch (e) {
    log('uiohook start:', e.message);
    return { ok: false, error: e.message, stop() { } };
  }

  return {
    ok: true,
    stop() {
      try { uio.stop(); } catch { }
    }
  };
}

module.exports = { startHook };
