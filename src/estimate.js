// Stima della dimensione dopo «Comprimi»: fa una prova vera in una cartella temporanea (con le stesse opzioni
// che userà la conversione) e misura il risultato. Se i file sono tanti, prova i più grandi (max 3) e ne ricava la proporzione.
// Il file originale non viene mai toccato: la prova scrive solo nella cartella temporanea, che poi viene cancellata.
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { findGhostscript, getGhostscriptPdfArgs } = require('./engine');

const MAX_SAMPLES = 3, TIMEOUT = 120000;

class Estimator {
  constructor({ engine, tmp = os.tmpdir() }) { this.engine = engine; this.tmp = tmp; this.cache = new Map(); this.seq = 0; this.current = null; }

  // interrompe la prova in corso (nuova richiesta o pannello chiuso)
  cancel() { this.seq++; if (this.current) { try { this.current.kill(); } catch { } this.current = null; } }

  async estimate({ files = [], preset, to, quality } = {}) {
    this.cancel(); const my = this.seq;
    if (!preset && !to) return { ok: false, error: 'Nessuno strumento' };
    if (!this.engine.available()) return { ok: false, error: 'Motore di conversione non collegato' };
    const items = [];
    for (const f of files) { try { const st = fs.statSync(f); if (st.isFile()) items.push({ file: f, size: st.size, mtime: st.mtimeMs }); } catch { } }
    if (!items.length) return { ok: false, error: 'Nessun file' };
    const original = items.reduce((a, b) => a + b.size, 0);
    const sample = [...items].sort((a, b) => b.size - a.size).slice(0, MAX_SAMPLES);
    let sIn = 0, sOut = 0;
    for (const it of sample) {
      if (my !== this.seq) return { ok: false, cancelled: true };
      const key = [it.file, it.size, it.mtime, preset || to, quality].join('|');
      let out = this.cache.get(key);
      if (out == null) {
        out = await this.trial(it.file, { preset, to, quality }, my);
        if (my !== this.seq) return { ok: false, cancelled: true };
        if (out == null) return { ok: false, error: 'Stima non disponibile' };
        this.cache.set(key, out); if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value);
      }
      sIn += it.size; sOut += out;
    }
    const ratio = sIn ? sOut / sIn : 1;
    return { ok: true, original, estimated: Math.round(original * ratio), ratio, sampled: sample.length, total: items.length, exact: sample.length === items.length };
  }

  // dimensione in byte del risultato di una prova, oppure null se non riuscita o annullata
  async trial(file, { preset, to, quality }, my) {
    let dir = null;
    try {
      dir = fs.mkdtempSync(path.join(this.tmp, 'peppez-est-'));
      if (preset === 'compress-pdf' || (file.toLowerCase().endsWith('.pdf') && preset && preset.includes('compress'))) {
        const gs = findGhostscript(this.engine.dirs);
        if (gs) {
          const testOut = path.join(dir, 'test.pdf');
          const child = cp.spawn(gs, getGhostscriptPdfArgs(file, testOut, quality), { windowsHide: true, stdio: 'ignore' });
          this.current = child;
          const code = await new Promise(res => {
            child.on('error', () => res(-1));
            child.on('close', c => res(c));
          });
          if (this.current === child) this.current = null;
          if (my !== this.seq) return null;
          if (code === 0 && fs.existsSync(testOut)) {
            const st = fs.statSync(testOut);
            return st.size > 0 ? st.size : null;
          }
        }
      }
      const args = ['convert', file, preset ? '--preset' : '--to', preset || to, '-o', dir, '--overwrite', '--json'];
      if (quality != null) args.push('-q', String(Math.min(100, Math.max(1, Math.round(+quality || 75)))));
      const h = this.engine.run(args, { timeout: TIMEOUT }); this.current = h;
      const r = await h.promise; if (this.current === h) this.current = null;
      if (my !== this.seq || r.code === -2) return null;
      let outs = [];
      const i = String(r.out || '').indexOf('{');
      if (i >= 0) { try { const j = JSON.parse(r.out.slice(i)); outs = (j.files || []).flatMap(f => f.outputs || []); } catch { } }
      if (!outs.length) { try { outs = fs.readdirSync(dir).map(n => path.join(dir, n)); } catch { } }
      let total = 0; for (const o of outs) { try { const st = fs.statSync(o); if (st.isFile()) total += st.size; } catch { } }
      return total > 0 ? total : null;
    } catch { return null; }
    finally { if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } } }
  }
}
module.exports = { Estimator };
