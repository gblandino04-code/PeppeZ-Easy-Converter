// Scarica l'ultima versione portabile di Filee (KnifeLemon/Filee, licenza MIT) in engine/filee
const https = require('https'), fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const OUT = path.join(__dirname, '..', 'engine', 'filee');
const get = (url, bin) => new Promise((res, rej) => https.get(url, { headers: { 'User-Agent': 'PeppeZConvert', Accept: 'application/vnd.github+json' } }, r => {
  if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return res(get(r.headers.location, bin));
  if (r.statusCode !== 200) return rej(new Error('HTTP ' + r.statusCode + ' ' + url));
  const c = []; r.on('data', d => c.push(d)); r.on('end', () => res(Buffer.concat(c)));
}).on('error', rej));
const find = d => { if (!fs.existsSync(d)) return null; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { const f = find(p); if (f) return f; } else if (/^filee-cli(\.exe)?$/i.test(e.name)) return p; } };
(async () => {
  const existing = !process.argv.includes('--force') && find(OUT);
  if (existing) { console.log('Filee già presente:', existing); return; }
  console.log('Cerco l\'ultima versione di Filee...');
  const rel = JSON.parse((await get('https://api.github.com/repos/KnifeLemon/Filee/releases/latest')).toString());
  const assets = rel.assets || [];
  const a = assets.find(x => /win.*x64.*portable.*\.zip$/i.test(x.name)) || assets.find(x => /win.*portable.*\.zip$/i.test(x.name)) || assets.find(x => /win.*\.zip$/i.test(x.name));
  if (!a) throw new Error('Nessun pacchetto Windows trovato. Risorse: ' + assets.map(x => x.name).join(', '));
  console.log('Scarico', a.name, '(' + rel.tag_name + ')');
  const zip = path.join(__dirname, '..', 'engine', 'filee.zip');
  fs.mkdirSync(path.dirname(zip), { recursive: true });
  fs.writeFileSync(zip, await get(a.browser_download_url));
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  let r = spawnSync('tar', ['-xf', zip, '-C', OUT], { stdio: 'inherit' });
  if (r.status !== 0) r = spawnSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Force '${zip}' '${OUT}'`], { stdio: 'inherit' });
  fs.rmSync(zip, { force: true });
  const cli = find(OUT);
  if (!cli) throw new Error('filee-cli non trovato dopo l\'estrazione');
  console.log('OK:', cli);
})().catch(e => { console.error('ERRORE:', e.message); process.exit(1); });
