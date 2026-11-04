#!/usr/bin/env node
// CLI finta con lo stesso contratto di Filee (solo per i test: copia il file cambiando estensione).
const fs = require('fs'), path = require('path');
const snap = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'formats.snapshot.json'), 'utf8')).formats;
const a = process.argv.slice(2), cmd = a[0];
const out = o => console.log(JSON.stringify(o, null, 2));
const delay = +process.env.FAKE_DELAY || 900;
if (cmd === 'version') { console.log('filee 2.2.0-fake'); process.exit(0); }
if (cmd === 'formats') {
  const id = a[1] && !a[1].startsWith('-') ? a[1] : null;
  if (!id) return out({ formats: snap });
  const me = snap.find(f => f.id === id); if (!me) { console.error("filee: unknown format '" + id + "'."); process.exit(2); }
  const same = snap.filter(f => f.writable && f.category === me.category && f.id !== id).map(f => f.id);
  const x = { image: ['pdf'], pdf: ['png', 'jpg', 'txt', 'docx', 'html', 'md', 'odt', 'rtf', 'epub'], document: ['pdf', 'txt', 'html', 'md', 'epub'], video: ['mp3', 'wav', 'gif'], archive: ['folder'] }[me.category] || [];
  return out({ ...me, targets: [...new Set([...same, ...x])].filter(t => t === 'folder' || snap.some(f => f.id === t)), withEngines: [] });
}
if (cmd === 'engines') {
  if (a[1] === 'install' || a[1] === 'remove') { console.error(JSON.stringify({ id: a[2], stage: 'download', component: a[2], fraction: 0.5, bytesDone: 5, bytesTotal: 10 })); return setTimeout(() => out({ id: a[2], state: 'installed', version: '1.0' }), 400); }
  return out({ platform: 'win-x64', engines: [{ id: 'ffmpeg', status: 'notinstalled', downloadable: true, downloadSize: 83000000, installedSize: 210000000, version: '7.1', converters: ['video', 'audio'] }, { id: 'libreoffice', status: 'installed', version: '24.8', downloadable: true, downloadSize: 340000000, installedSize: 900000000, converters: ['document'] }, { id: 'pandoc', status: 'owncopy', fromSystem: true, version: '3.5', downloadable: true, downloadSize: 30000000, installedSize: 120000000, converters: ['text'] }] });
}
if (cmd === 'watch') { console.log('Watching ' + a[1]); setInterval(() => { }, 1e6); return; }
if (cmd === 'convert') {
  const files = [], o = {}; let i = 1;
  for (; i < a.length; i++) { const x = a[i]; if (x.startsWith('-')) { if (['-t', '--to', '-p', '--preset', '-o', '--output', '-q', '--quality', '--sort'].includes(x)) o[x] = a[++i]; else o[x] = true; } else files.push(x); }
  const to = o['--to'] || o['-t'], preset = o['--preset'] || o['-p'], outDir = o['--output'] || o['-o'];
  if (to && !snap.some(f => f.id === to) && to !== 'folder') { console.error("filee: unknown format '" + to + "'. Run 'filee formats' for the list."); process.exit(2); }
  setTimeout(() => {
    const res = files.map(f => {
      if (!fs.existsSync(f)) return { source: f, state: 'failed', outputs: [], error: 'File non trovato' };
      if (path.basename(f).startsWith('broken')) return { source: f, state: 'failed', outputs: [], error: 'Nessun percorso di conversione da ' + path.extname(f).slice(1).toUpperCase() + ' a ' + (to || preset).toUpperCase(), errorKey: 'error.no_route' };
      const ext = to ? (snap.find(s => s.id === to).extensions[0]) : path.extname(f).slice(1) || 'bin';
      const suffix = preset ? '_' + preset : '';
      const dir = outDir || path.dirname(f); fs.mkdirSync(dir, { recursive: true });
      const base = path.basename(f, path.extname(f)) + suffix; let n = 0, p;
      do { p = path.join(dir, base + (n ? ' (' + n + ')' : '') + '.' + ext); n++; } while (fs.existsSync(p) && !o['--overwrite']);
      fs.copyFileSync(f, p); return { source: f, state: 'done', outputs: [p] };
    });
    out({ preset: preset || (to || '').toUpperCase(), target: to || 'same', converted: res.filter(r => r.state === 'done').length, skipped: 0, failed: res.filter(r => r.state === 'failed').length, files: res });
    process.exit(res.some(r => r.state === 'failed') ? 1 : 0);
  }, delay);
  return;
}
console.error("filee: Unknown command '" + cmd + "'."); process.exit(2);
