// Collegamento con il motore di conversione nativo locale.
// Qui: ricerca dell'eseguibile, elenco formati, percorsi di conversione, esecuzione dei lavori, motori opzionali, cartelle monitorate.
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const WIN = process.platform === 'win32';
const CLI_NAMES = WIN ? ['filee-cli.exe'] : ['filee-cli', 'filee'];

function findGhostscript(customDirs = []) {
  const candidates = [
    ...customDirs.map(d => path.join(d, 'engines', 'ghostscript')),
    path.join(__dirname, '..', 'engine', 'filee', 'engines', 'ghostscript'),
    process.resourcesPath ? path.join(process.resourcesPath, 'filee', 'engines', 'ghostscript') : null,
    path.join(process.env.LOCALAPPDATA || '', 'Filee', 'engines', 'ghostscript')
  ].filter(Boolean);
  for (const c of candidates) {
    for (const exe of ['gswin64c.exe', 'gs.exe', 'gswin32c.exe']) {
      const p = path.join(c, exe);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function getGhostscriptPdfArgs(inputFile, outputFile, quality) {
  const q = Math.min(100, Math.max(1, Math.round(+quality || 75)));
  let setting = '/ebook';
  let dpi = 150;
  if (q <= 50) {
    setting = '/screen';
    dpi = Math.max(50, Math.round(50 + (q / 50) * 35));
  } else if (q <= 75) {
    setting = '/ebook';
    dpi = Math.round(90 + ((q - 50) / 25) * 60);
  } else {
    setting = '/printer';
    dpi = Math.round(150 + ((q - 75) / 25) * 150);
  }
  return [
    '-sDEVICE=pdfwrite',
    '-dCompatibilityLevel=1.4',
    '-dPDFSETTINGS=' + setting,
    '-dColorImageDownsampleType=/Bicubic',
    '-dColorImageResolution=' + dpi,
    '-dGrayImageDownsampleType=/Bicubic',
    '-dGrayImageResolution=' + dpi,
    '-dDownsampleColorImages=true',
    '-dDownsampleGrayImages=true',
    '-dAutoFilterColorImages=false',
    '-dColorImageFilter=/DCTEncode',
    '-dJPEGQ=' + q,
    '-dNOPAUSE',
    '-dQUIET',
    '-dBATCH',
    '-sOutputFile=' + outputFile,
    inputFile
  ];
}

function findIn(dir, depth = 3) {
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isFile() && CLI_NAMES.includes(e.name)) return path.join(dir, e.name);
    if (depth > 0) for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) { const r = findIn(path.join(dir, e.name), depth - 1); if (r) return r; }
  } catch { }
  return null;
}
const parseJson = s => { const i = s.indexOf('{'); if (i < 0) return null; try { return JSON.parse(s.slice(i)); } catch { return null; } };

// Categorie del dashboard → categorie di Filee
const GROUPS = {
  immagini: ['image', 'vector'], documenti: ['document', 'spreadsheet', 'presentation', 'text', 'hwp', 'subtitle'], pdf: ['pdf'],
  video: ['video'], audio: ['audio'], archivi: ['archive'], ebook: ['ebook'], dati: ['data', 'geo', 'font'], cad: ['cad', 'model3d']
};
const groupOf = cat => Object.keys(GROUPS).find(g => GROUPS[g].includes(cat)) || 'dati';

class Engine {
  constructor({ dirs = [], userData, settings, snapshotFile }) {
    this.dirs = dirs; this.userData = userData; this.settings = settings; this.snapshotFile = snapshotFile;
    this._cli = undefined; this._formats = null; this._targets = new Map(); this.watchers = new Map(); this.running = new Set();
    this.cacheFile = path.join(userData, 'engine-cache.json');
    try { this._disk = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8')); } catch { this._disk = { targets: {} }; }
  }

  /* ---------- CLI ---------- */
  locate(force) {
    if (this._cli !== undefined && !force) return this._cli;
    let found = null;
    const env = process.env.PEPPEZ_FILEE;
    if (env && fs.existsSync(env)) found = env.endsWith('.js') ? { cmd: process.execPath, prefix: [env], path: env } : { cmd: env, prefix: [], path: env };
    const own = this.settings.get().fileeCli;
    if (!found && own && fs.existsSync(own)) found = { cmd: own, prefix: [], path: own };
    if (!found) for (const d of this.dirs) { const p = findIn(d); if (p) { found = { cmd: p, prefix: [], path: p }; break; } }
    if (!found && WIN) for (const base of [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Filee'), process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Filee')].filter(Boolean)) { const p = findIn(base, 1); if (p) { found = { cmd: p, prefix: [], path: p }; break; } }
    if (!found) for (const d of (process.env.PATH || '').split(path.delimiter)) { for (const n of [...CLI_NAMES, WIN ? 'filee.exe' : 'filee']) { const p = path.join(d, n); try { if (d && fs.statSync(p).isFile()) { found = { cmd: p, prefix: [], path: p }; break; } } catch { } } if (found) break; }
    this._cli = found; return found;
  }
  available() { return !!this.locate(); }

  run(args, { onLine, timeout = 0 } = {}) {
    const cli = this.locate();
    if (!cli) return { promise: Promise.resolve({ code: -1, out: '', err: 'Motore di conversione nativo non trovato' }), kill() { } };
    const child = spawn(cli.cmd, [...cli.prefix, ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1' } });
    let out = '', err = '', bufO = '', bufE = '', killed = false; this.running.add(child);
    const feed = (chunk, which) => { if (!onLine) return; let b = (which === 'out' ? bufO : bufE) + chunk, i; while ((i = b.indexOf('\n')) >= 0) { const l = b.slice(0, i).trim(); b = b.slice(i + 1); if (l) onLine(l, which); } if (which === 'out') bufO = b; else bufE = b; };
    child.stdout.on('data', d => { out += d; feed(d, 'out'); });
    child.stderr.on('data', d => { err += d; feed(d, 'err'); });
    const t = timeout ? setTimeout(() => { killed = true; child.kill(); }, timeout) : null;
    const promise = new Promise(res => {
      child.on('error', e => { this.running.delete(child); clearTimeout(t); res({ code: -1, out, err: e.message }); });
      child.on('close', code => { this.running.delete(child); clearTimeout(t); res({ code: killed ? -2 : code, out, err, killed }); });
    });
    return { promise, kill: () => { killed = true; try { child.kill(); } catch { } } };
  }
  runWait(args, opts) { return this.run(args, opts).promise; }

  async version() { const r = await this.runWait(['version'], { timeout: 20000 }); return r.code === 0 ? r.out.trim().replace(/^filee\s*/i, '') : null; }

  /* ---------- formati ---------- */
  async formats() {
    if (this._formats) return this._formats;
    let list = null;
    if (this.available()) {
      const r = await this.runWait(['formats', '--json'], { timeout: 30000 });
      const j = r.code === 0 ? parseJson(r.out) : null; if (j && Array.isArray(j.formats)) list = j.formats;
    }
    if (!list) { try { list = JSON.parse(fs.readFileSync(this.snapshotFile, 'utf8')).formats; } catch { list = []; } }
    this._formats = list.map(f => ({ ...f, group: groupOf(f.category) })); this._byExt = null; return this._formats;
  }
  async formatOfFile(file) {
    const fm = await this.formats();
    if (!this._byExt) { this._byExt = []; for (const f of fm) for (const e of f.extensions) this._byExt.push([e.toLowerCase(), f]); this._byExt.sort((a, b) => b[0].length - a[0].length); }
    const n = path.basename(file).toLowerCase();
    for (const [e, f] of this._byExt) if (n.endsWith('.' + e)) return f;
    return null;
  }
  // formati in cui si può convertire <id>; senza CLI: stessa famiglia + alcuni comuni
  async targets(id) {
    if (this._targets.has(id)) return this._targets.get(id);
    let res = this._disk.targets[id] || null;
    if (!res && this.available()) {
      const r = await this.runWait(['formats', id, '--json'], { timeout: 30000 }); const j = r.code === 0 ? parseJson(r.out) : null;
      if (j && Array.isArray(j.targets)) { res = { targets: j.targets, withEngines: j.withEngines || [], exact: true }; this._disk.targets[id] = res; try { fs.writeFileSync(this.cacheFile, JSON.stringify(this._disk)); } catch { } }
    }
    if (!res) {
      const fm = await this.formats(), me = fm.find(f => f.id === id);
      const same = fm.filter(f => f.writable && me && f.category === me.category && f.id !== id).map(f => f.id);
      const common = ['pdf', 'png', 'jpg', 'txt', 'docx', 'mp3', 'mp4', 'zip'].filter(x => x !== id && fm.some(f => f.id === x && f.writable));
      res = { targets: [...new Set([...same, ...common])], withEngines: [], exact: false };
    }
    this._targets.set(id, res); return res;
  }

  /* ---------- conversione ---------- */
  buildConvertArgs(job, s) {
    const a = ['convert', ...job.files];
    if (job.preset) a.push('--preset', job.preset); else a.push('--to', job.to);
    const out = job.outDir || (s.outputMode === 'folder' && s.outputDir ? s.outputDir : '');
    if (out) a.push('-o', out);
    if (job.quality != null) a.push('-q', String(job.quality));
    if (s.conflict === 'overwrite') a.push('--overwrite'); else if (s.conflict === 'skip') a.push('--skip');
    if (s.keepDates) a.push('--keep-dates');
    a.push('--json'); return a;
  }
  // esegue un lavoro; ritorna {state, outputs, error, needsEngines}. job.handle serve per annullare.
  convert(job) {
    const s = this.settings.get();
    if (job.preset === 'compress-pdf' && Array.isArray(job.files) && job.files.length) {
      const gs = findGhostscript(this.dirs);
      if (gs) return this.convertPdfWithGs(job, s, gs);
    }
    const args = this.buildConvertArgs(job, s);
    const h = this.run(args);
    const promise = h.promise.then(r => {
      const j = parseJson(r.out);
      if (r.code === -2) return { state: 'cancelled', outputs: [] };
      if (j && Array.isArray(j.files)) {
        const outputs = j.files.flatMap(f => f.outputs || []), bad = j.files.find(f => f.state === 'failed' || f.state === 'cancelled');
        const sk = j.files.every(f => f.state === 'skipped');
        if (bad) return { state: 'failed', outputs, error: bad.error || 'Conversione non riuscita', needsEngines: bad.needsEngines || [] };
        return { state: sk ? 'skipped' : 'done', outputs, notice: (j.files.find(f => f.notice) || {}).notice };
      }
      const msg = (r.err || r.out || '').split('\n').map(x => x.replace(/^filee:\s*/i, '').trim()).filter(Boolean)[0];
      return { state: 'failed', outputs: [], error: msg || 'Conversione non riuscita (codice ' + r.code + ')' };
    });
    return { promise, kill: h.kill };
  }

  convertPdfWithGs(job, s, gs) {
    let currentChild = null, killed = false;
    const kill = () => { killed = true; if (currentChild) try { currentChild.kill(); } catch { } };
    const promise = (async () => {
      const outputs = [];
      for (const file of job.files) {
        if (killed) return { state: 'cancelled', outputs };
        const dir = job.outDir || (s.outputMode === 'folder' && s.outputDir ? s.outputDir : path.dirname(file));
        const ext = path.extname(file);
        const base = path.basename(file, ext);
        let target = path.join(dir, `${base}_compressed.pdf`);
        if (fs.existsSync(target) && s.conflict !== 'overwrite') {
          if (s.conflict === 'skip') continue;
          let counter = 1;
          while (fs.existsSync(target)) {
            target = path.join(dir, `${base}_compressed (${counter++}).pdf`);
          }
        }
        const args = getGhostscriptPdfArgs(file, target, job.quality);
        const child = spawn(gs, args, { windowsHide: true, stdio: 'ignore' });
        currentChild = child;
        const code = await new Promise(res => {
          child.on('error', () => res(-1));
          child.on('close', c => res(c));
        });
        currentChild = null;
        if (killed) return { state: 'cancelled', outputs };
        if (code === 0 && fs.existsSync(target) && fs.statSync(target).size > 0) {
          outputs.push(target);
        } else {
          return { state: 'failed', outputs, error: 'Compressione PDF non riuscita con Ghostscript' };
        }
      }
      return { state: outputs.length ? 'done' : 'skipped', outputs };
    })();
    return { promise, kill };
  }

  /* ---------- motori opzionali (FFmpeg, LibreOffice, Pandoc…) ---------- */
  async engines() {
    const r = await this.runWait(['engines', '--json'], { timeout: 60000 }); const j = r.code === 0 ? parseJson(r.out) : null;
    return j && j.engines ? j : { engines: [], platform: '', error: this.available() ? 'Elenco non disponibile' : 'Motore di conversione nativo non trovato' };
  }
  installEngine(id, onProgress, remove = false) {
    const h = this.run(['engines', remove ? 'remove' : 'install', id, '--json'], { onLine: (l, w) => { const j = w === 'err' ? parseJson(l) : null; if (j && j.stage && onProgress) onProgress(j); } });
    return h.promise.then(r => parseJson(r.out) || { id, state: r.code === 0 ? 'ok' : 'failed', error: (r.err || '').trim().split('\n').pop() });
  }

  /* ---------- cartelle monitorate ---------- */
  startWatch(rule, onLine) {
    if (!this.available() || this.watchers.has(rule.id)) return false;
    const a = ['watch', rule.folder, '--to', rule.to]; if (rule.outDir) a.push('-o', rule.outDir); if (rule.moveOriginals) a.push('--move-originals');
    const h = this.run(a, { onLine: l => onLine && onLine(l) });
    // la CLI scrive l'andamento su stdout: lo leggo da lì
    this.watchers.set(rule.id, h); h.promise.then(() => this.watchers.delete(rule.id)); return true;
  }
  stopWatch(id) { const h = this.watchers.get(id); if (h) { h.kill(); this.watchers.delete(id); } }
  stopAll() { for (const id of [...this.watchers.keys()]) this.stopWatch(id); for (const c of this.running) { try { c.kill(); } catch { } } }
}

module.exports = { Engine, GROUPS, groupOf, findGhostscript, getGhostscriptPdfArgs };
