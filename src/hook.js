// Rilevamento globale di trascinamento file + tasti configurabili (libreria uiohook-napi).
// Supporta sia tocco/pressione del tasto scelto durante il trascinamento, sia pressione preventiva prima del clic.
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
    alt: [Key.Alt, Key.AltRight],
    space: [Key.Space],
    c: [Key.C],
    x: [Key.X],
    z: [Key.Z],
    q: [Key.Q],
    e: [Key.E],
    f: [Key.F],
    v: [Key.V],
    tab: [Key.Tab],
    capslock: [Key.CapsLock],
    esc: Key.Escape
  };

  const getConvKey = () => (settings.get().keybindConvert || 'shift').toLowerCase();
  const getToolsKey = () => (settings.get().keybindTools || 'ctrl').toLowerCase();

  const matchesKey = (code, keyName) => {
    const list = K[keyName] || K.shift;
    return Array.isArray(list) ? list.includes(code) : list === code;
  };

  const pressedKeys = new Set();

  const isKeyActive = (keyName, mouseEvent) => {
    if (keyName === 'shift' && mouseEvent && mouseEvent.shiftKey) return true;
    if (keyName === 'ctrl' && mouseEvent && mouseEvent.ctrlKey) return true;
    if (keyName === 'alt' && mouseEvent && mouseEvent.altKey) return true;
    const list = K[keyName];
    if (!list) return false;
    return Array.isArray(list) ? list.some(k => pressedKeys.has(k)) : pressedKeys.has(list);
  };

  let down = false, dx = 0, dy = 0, dragging = false, cancelled = false;
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
    pressedKeys.add(c);

    const convKey = getConvKey();
    const toolsKey = getToolsKey();
    const isConv = matchesKey(c, convKey);
    const isTools = matchesKey(c, toolsKey);

    if (c === K.esc && hud.visible) {
      cancelled = true;
      requestedMode = null;
      hud.hide();
      return;
    }
    if (c === Key.Tab && hud.visible && convKey !== 'tab' && toolsKey !== 'tab') {
      if (!hud.panelOpen) hud.flip(1);
      return;
    }

    if (!isConv && !isTools) return;

    // Protezione giochi: se è attivo un gioco, ignora la combinazione
    if (!isAllowed()) return;

    const targetMode = isTools ? 'tools' : 'convert';

    // Se la ruota è già aperta, cambia modalità al volo (es. Conversioni <-> Strumenti)
    if (hud.visible && !hud.panelOpen) {
      requestedMode = targetMode;
      hud.switchMode(targetMode);
      return;
    }

    // Se il tasto sinistro del mouse è premuto: apri subito la ruota
    if (down) {
      cancelled = false;
      dragging = true;
      requestedMode = targetMode;
      openWheel(targetMode);
    }
  });

  uio.on('keyup', e => {
    pressedKeys.delete(e.keycode);
    // Nota: non chiudiamo la ruota quando rilasci il tasto.
    // Basta un tocco: la ruota resta aperta durante il trascinamento finché non rilasci il mouse o premi Esc.
  });

  uio.on('mousedown', e => {
    if (e.button !== 1 || hud.panelOpen) return;
    if (!isAllowed()) return;

    down = true;
    dragging = false;
    cancelled = false;
    dx = e.x;
    dy = e.y;

    // Se il tasto configurato era già premuto prima di iniziare a trascinare:
    const convKey = getConvKey();
    const toolsKey = getToolsKey();
    const activeTools = isKeyActive(toolsKey, e);
    const activeConv = isKeyActive(convKey, e);

    if (activeTools) {
      requestedMode = 'tools';
    } else if (activeConv) {
      requestedMode = 'convert';
    } else {
      requestedMode = null;
    }
  });

  uio.on('mousemove', e => {
    if (!down || hud.panelOpen || cancelled) return;

    // Se l'utente è passato a un gioco, chiudi subito la ruota
    if (isGame()) {
      if (hud.visible) hud.hide();
      return;
    }

    // Rileva trascinamento immediato a partire da 2 pixel
    if (!dragging && Math.hypot(e.x - dx, e.y - dy) >= THRESHOLD) {
      dragging = true;
    }

    if (dragging) {
      const convKey = getConvKey();
      const toolsKey = getToolsKey();
      const activeTools = isKeyActive(toolsKey, e);
      const activeConv = isKeyActive(convKey, e);
      const m = activeTools ? 'tools' : activeConv ? 'convert' : requestedMode;

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
    pressedKeys.clear();
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
