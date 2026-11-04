// Funzioni che la finestra principale può chiamare. Indipendente da Electron: ciò che serve dal sistema arriva da `host`.
const fs = require('fs');
const path = require('path');
const H = require('./hudoptions');

function createApi({ settings, history, engine, queue, host, version }) {
  queue.on('update', j => host.emit('queue:update', j));
  queue.on('reset', () => host.emit('queue:reset', queue.list()));
  queue.on('paused', v => host.emit('queue:paused', v));
  queue.on('done', () => host.emit('history:changed', null));

  const startWatch = r => engine.startWatch(r, (line, which) => {
    if (which !== 'out' || /^Watching /.test(line)) return;
    history.add({ id: 'w' + Date.now() + Math.random().toString(36).slice(2, 6), name: line.replace(/^.*[\\/]/, '').slice(0, 120), from: 'WATCH', to: (r.to || '').toUpperCase(), status: /fail|error|errore/i.test(line) ? 'failed' : 'done', time: Date.now(), outputs: [], source: 'watch' });
    host.emit('history:changed', null);
  });
  const watchState = () => settings.get().watch.map(r => ({ ...r, running: engine.watchers.has(r.id) }));

  const A = {
    async getState() {
      const cli = engine.locate(); const fm = await engine.formats();
      return { settings: settings.get(), version, cliFound: !!cli, cliPath: cli ? cli.path : '', formatsCount: fm.length, platform: process.platform, groups: Object.keys(require('./engine').GROUPS) };
    },
    formats: () => engine.formats(),
    toolsFor: category => (H.TOOLS[H.kindFromCategory(category)] || []).map(([value, label]) => value === '@folder' ? { kind: 'to', value: 'folder', label } : { kind: 'preset', value, label, group: value === 'merge-pdf' }),
    targets: id => engine.targets(id),

    // --- personalizzazione delle ruote (sezione «Personalizza») ---
    // Per un formato: tutte le conversioni possibili (in ordine predefinito), quelle oggi nella ruota e gli strumenti del suo tipo.
    async wheelInfo(formatId) {
      const fm = await engine.formats(), byId = new Map(fm.map(f => [f.id, f])), f = byId.get(formatId); if (!f) return null;
      const kind = H.kindFromCategory(f.category), w = settings.get().wheel || {};
      const p = await H.possibleTargets(engine, [f]), ranked = H.rankTargets(p.ids, kind, byId, f);
      const hasMore = ranked.length > H.MAX_SLICES;
      const max = hasMore ? 7 : Math.min(ranked.length, H.MAX_SLICES);
      const custom = (w.convert || {})[formatId];
      const selected = H.pickConvertIds({ ranked, custom, max });
      const toolList = (H.TOOLS[kind] || []).map(([value, label]) => ({ value, label })), toolCustom = (w.tools || {})[kind];
      return {
        id: f.id, name: f.name, kind, max, totalPossible: ranked.length, hasMore, exact: p.exact,
        possible: ranked.map(id => ({ id, name: byId.get(id).name })), defaults: ranked.slice(0, max), selected, custom: Array.isArray(custom) && custom.length > 0,
        tools: { kind, list: toolList, max: H.MAX_SLICES, defaults: H.pickToolIds({ kind, count: null }), selected: H.pickToolIds({ kind, count: null, custom: toolCustom }), custom: Array.isArray(toolCustom) && toolCustom.length > 0 }
      };
    },
    // type: 'convert' (key = id formato) o 'tools' (key = tipo di file); ids = nuovo elenco in ordine, oppure null per tornare al predefinito
    async setWheel({ type, key, ids, formatId }) {
      if (!['convert', 'tools'].includes(type) || !key) return null;
      const w = settings.get().wheel || {}; w.convert = w.convert || {}; w.tools = w.tools || {};
      if (ids == null) delete w[type][key];
      else {
        let limit = H.MAX_SLICES;
        if (type === 'convert') {
          const fm = await engine.formats(), byId = new Map(fm.map(f => [f.id, f])), f = byId.get(key);
          const p = f ? await H.possibleTargets(engine, [f]) : { ids: [] };
          if (p.ids.length > H.MAX_SLICES) limit = 7;
        }
        w[type][key] = [...new Set((Array.isArray(ids) ? ids : []).filter(x => typeof x === 'string'))].slice(0, limit);
      }
      settings.set({ wheel: w }); host.emit('settings', settings.get());
      return A.wheelInfo(formatId || (type === 'convert' ? key : null));
    },
    async resetWheel() { settings.set({ wheel: { convert: {}, tools: {} } }); host.emit('settings', settings.get()); return true; },
    async fileInfo(paths) {
      const out = [];
      for (const p of paths) { try { const st = fs.statSync(p); if (!st.isFile() && !st.isDirectory()) continue; const f = await engine.formatOfFile(p); out.push({ path: p, name: path.basename(p), size: st.size, dir: st.isDirectory(), formatId: f && f.id, formatName: f && f.name, group: f && f.group, category: f && f.category }); } catch { } }
      return out;
    },
    pickFiles: opts => host.pickFiles(opts || {}),
    pickFolder: () => host.pickFolder(),
    async convert(req) {
      const s = settings.get(); const files = (req.files || []).filter(Boolean);
      if (!files.length) return { ids: [] };
      if (!engine.available()) { host.emit('toast', { kind: 'error', text: 'Motore di conversione non trovato: apri la sezione Motori per collegarlo.' }); return { ids: [], error: 'no-engine' }; }
      const fm = await engine.formats(); const tf = fm.find(f => f.id === req.to);
      const quality = req.quality != null ? req.quality : (tf && tf.group === 'immagini' ? s.quality : undefined);
      const ids = await queue.add({ files, to: req.to, preset: req.preset, label: req.label || (tf && tf.name), quality, outDir: req.outDir, source: req.source || 'app', group: !!req.group });
      return { ids };
    },
    cancel: id => queue.cancel(id), cancelAll: () => queue.cancelAll(), pauseAll: v => queue.setPaused(v),
    queue: () => queue.list(), clearFinished: () => queue.clearFinished(),
    history: () => history.list(), removeHistory: id => { history.remove(id); host.emit('history:changed', null); },
    clearHistory: () => { history.clear(); host.emit('history:changed', null); },
    openPath: p => host.openPath(p), showInFolder: p => host.showInFolder(p),
    async setSettings(patch) { const s = settings.set(patch); if ('fileeCli' in patch) engine.locate(true); host.emit('settings', s); host.applySettings && host.applySettings(s); return s; },
    watchList: () => watchState(),
    async watchAdd(r) { const rule = { id: 'r' + Date.now().toString(36), folder: r.folder, to: r.to, outDir: r.outDir || '', moveOriginals: !!r.moveOriginals, enabled: true }; settings.get().watch.push(rule); settings.save(); startWatch(rule); return watchState(); },
    async watchRemove(id) { engine.stopWatch(id); settings.get().watch = settings.get().watch.filter(r => r.id !== id); settings.save(); return watchState(); },
    async watchToggle(id) { const r = settings.get().watch.find(x => x.id === id); if (!r) return watchState(); r.enabled = !r.enabled; settings.save(); if (r.enabled) startWatch(r); else engine.stopWatch(id); return watchState(); },
    enginesList: () => engine.engines(),
    engineInstall: id => engine.installEngine(id, p => host.emit('engines:progress', p)),
    engineRemove: id => engine.installEngine(id, null, true),
    async locateFilee() { const p = await host.pickFiles({ title: 'Seleziona motore di conversione', filters: [{ name: 'Eseguibile motore', extensions: ['exe', '*'] }], single: true }); if (p && p[0]) return A.setSettings({ fileeCli: p[0] }).then(() => engine.available()); return engine.available(); }
  };
  A.startAllWatchers = () => { for (const r of settings.get().watch) if (r.enabled) startWatch(r); };
  return A;
}

module.exports = { createApi };
