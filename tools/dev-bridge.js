// Ponte di sviluppo/test: serve l'interfaccia in un browser normale e collega window.api agli stessi moduli usati da Electron.
// Uso: PEPPEZ_FILEE=tools/fake-filee.js node tools/dev-bridge.js [porta]
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { Settings, History } = require('../src/settings'), { Engine } = require('../src/engine'), { Queue } = require('../src/queue'), { createApi } = require('../src/api');
const root = path.join(__dirname, '..'), port = +process.argv[2] || 47950;
const userData = process.env.PEPPEZ_DATA || fs.mkdtempSync(path.join(os.tmpdir(), 'peppez-'));
const clients = new Set(), emit = (ch, p) => { const m = `data: ${JSON.stringify({ ch, p })}\n\n`; for (const c of clients) c.write(m); };
const settings = new Settings(userData), history = new History(userData);
const engine = new Engine({ dirs: [path.join(root, 'engine', 'filee')], userData, settings, snapshotFile: path.join(root, 'app', 'formats.snapshot.json') });
const queue = new Queue({ engine, history });
const host = { emit, pickFiles: async () => global.__pick || [], pickFolder: async () => global.__folder || '', openPath: async () => '', showInFolder: () => { } };
const api = createApi({ settings, history, engine, queue, host, version: '1.0.0' });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const shim = `window.api={platform:'win32',call:(n,...a)=>fetch('/api/'+n,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(a)}).then(r=>r.json()),
on:(ch,cb)=>{(window.__ev=window.__ev||[]).push([ch,cb])},pathOf:f=>f.__path||f.name,fileUrl:p=>'/file?p='+encodeURIComponent(p),win:{min(){},max(){},close(){}},hud:null};
const es=new EventSource('/events');es.onmessage=e=>{const {ch,p}=JSON.parse(e.data);(window.__ev||[]).forEach(([c,cb])=>c===ch&&cb(p))};`;
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/events') { res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }); res.write(':ok\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return; }
  if (u.pathname === '/shim.js') { res.writeHead(200, { 'content-type': MIME['.js'] }); return res.end(shim); }
  if (u.pathname.startsWith('/api/')) { let b = ''; for await (const c of req) b += c; try { const r = await api[u.pathname.slice(5)](...JSON.parse(b || '[]')); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(r === undefined ? null : r)); } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); } return; }
  if (u.pathname === '/file') { const p = u.searchParams.get('p'); try { res.writeHead(200, { 'content-type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); } catch { res.writeHead(404); res.end(); } return; }
  if (u.pathname === '/__pick') { global.__pick = JSON.parse(u.searchParams.get('v') || '[]'); global.__folder = u.searchParams.get('f') || ''; res.end('ok'); return; }
  let p = u.pathname === '/' ? '/app/index.html' : u.pathname; if (p.startsWith('/hud/') || p.startsWith('/app/')) { } else p = '/app' + p;
  const f = path.join(root, decodeURIComponent(p)); if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(f.endsWith('index.html') ? String(d).replace('<script src="app.js">', '<script src="/shim.js"></script><script src="app.js">') : d); });
}).listen(port, '127.0.0.1', () => console.log('dev-bridge http://127.0.0.1:' + port));
