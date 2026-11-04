// Coda di conversione: un lavoro per file (o uno solo per tutti i file con gli strumenti che li uniscono, es. «Unisci PDF»).
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

let SEQ = 0;
class Queue extends EventEmitter {
  constructor({ engine, history, concurrency = 2 }) {
    super(); this.engine = engine; this.history = history; this.concurrency = concurrency;
    this.jobs = []; this.paused = false;
  }
  snap(j) { const { handle, ...r } = j; return r; }
  list() { return this.jobs.slice(-60).map(j => this.snap(j)); }

  async add({ files, to, preset, label, quality, outDir, source = 'app', group = false }) {
    const made = [];
    const sets = group ? [files] : files.map(f => [f]);
    for (const set of sets) {
      let size = 0; try { for (const f of set) size += fs.statSync(f).size; } catch { }
      const fmt = await this.engine.formatOfFile(set[0]).catch(() => null);
      const tfm = to ? (await this.engine.formats()).find(f => f.id === to) : null;
      const job = {
        id: 'j' + Date.now().toString(36) + (++SEQ), files: set, name: set.length > 1 ? set.length + ' file' : path.basename(set[0]), size,
        from: set.length > 1 ? 'PDF' : fmt ? fmt.name.toUpperCase() : (path.extname(set[0]).slice(1) || '?').toUpperCase(),
        to: to || null, preset: preset || null, toLabel: (label || to || preset || '').toUpperCase(), fromGroup: fmt && fmt.group, toGroup: (tfm && tfm.group) || (fmt && fmt.group), quality, outDir, source,
        status: 'queued', outputs: [], error: null, created: Date.now()
      };
      this.jobs.push(job); made.push(job); this.emit('update', this.snap(job));
    }
    this.pump(); return made.map(j => j.id);
  }

  pump() {
    if (this.paused) return;
    let active = this.jobs.filter(j => j.status === 'running').length;
    for (const j of this.jobs) {
      if (active >= this.concurrency) break;
      if (j.status !== 'queued') continue;
      active++; this.start(j);
    }
  }
  start(j) {
    j.status = 'running'; j.started = Date.now(); this.emit('update', this.snap(j));
    const h = this.engine.convert(j); j.handle = h;
    h.promise.then(r => {
      if (j.status === 'cancelled') return;
      Object.assign(j, { status: r.state, outputs: r.outputs || [], error: r.error || null, needsEngines: r.needsEngines, notice: r.notice, finished: Date.now() });
      this.finish(j);
    }).catch(e => { Object.assign(j, { status: 'failed', error: e.message, finished: Date.now() }); this.finish(j); });
  }
  finish(j) {
    j.handle = null;
    this.history.add({ id: j.id, name: j.name, from: j.from, to: j.toLabel, status: j.status, time: j.finished, outputs: j.outputs, error: j.error, source: j.source, input: j.files[0], group: j.toGroup, fromGroup: j.fromGroup });
    this.emit('update', this.snap(j)); this.emit('done', this.snap(j)); this.pump();
  }
  cancel(id) {
    const j = this.jobs.find(x => x.id === id); if (!j || !['queued', 'running'].includes(j.status)) return;
    const was = j.status; j.status = 'cancelled'; j.finished = Date.now(); if (was === 'running' && j.handle) j.handle.kill();
    this.emit('update', this.snap(j)); this.pump();
  }
  cancelAll() { for (const j of [...this.jobs]) this.cancel(j.id); }
  setPaused(v) { this.paused = !!v; this.emit('paused', this.paused); if (!this.paused) this.pump(); }
  clearFinished() { this.jobs = this.jobs.filter(j => ['queued', 'running'].includes(j.status)); this.emit('reset'); }
}

module.exports = { Queue };
