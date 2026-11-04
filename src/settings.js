// Impostazioni e dati dell'utente (JSON in userData). Nessuna dipendenza da Electron: usabile anche nei test.
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  theme: 'dark',              // dark | light
  outputMode: 'source',       // source = accanto all'originale | folder = cartella scelta
  outputDir: '',
  conflict: 'number',         // number | overwrite | skip
  quality: 90,                // qualità immagini
  keepDates: false,
  hudEnabled: true,           // ruota Shift+trascina
  hudOnlyExplorer: false,     // mostra la ruota trascinando ovunque (Desktop, Esplora risorse, browser, ecc.)
  hudShowResult: true,        // mostra l'esito nella ruota
  openAtLogin: false,
  closeToTray: true,
  fileeCli: '',               // percorso manuale della CLI di Filee (facoltativo)
  firstRunDone: false,        // prima apertura dell'applicazione (mostra motori e guida)
  wheel: { convert: {}, tools: {} }, // personalizzazione ruote: convert[idFormato] = [idDestinazione…], tools[tipo] = [idStrumento…]
  watch: []                   // cartelle monitorate: {id, folder, to, outDir, moveOriginals, enabled}
};

class Store {
  constructor(dir, name, defaults) {
    this.file = path.join(dir, name); this.data = JSON.parse(JSON.stringify(defaults));
    try { fs.mkdirSync(dir, { recursive: true }); Object.assign(this.data, JSON.parse(fs.readFileSync(this.file, 'utf8'))); } catch { }
  }
  save() { try { fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.data, null, 2)); fs.renameSync(this.file + '.tmp', this.file); } catch (e) { console.error('save', e.message); } }
}

class Settings extends Store {
  constructor(dir) { super(dir, 'settings.json', DEFAULTS); }
  get() { return this.data; }
  set(patch) { Object.assign(this.data, patch); this.save(); return this.data; }
}

class History {
  constructor(dir) { this.store = new Store(dir, 'history.json', { items: [] }); }
  list() { return this.store.data.items; }
  add(item) { const l = this.store.data.items; l.unshift(item); if (l.length > 300) l.length = 300; this.store.save(); }
  remove(id) { this.store.data.items = this.store.data.items.filter(i => i.id !== id); this.store.save(); }
  clear() { this.store.data.items = []; this.store.save(); }
}

module.exports = { Settings, History, Store, DEFAULTS };
