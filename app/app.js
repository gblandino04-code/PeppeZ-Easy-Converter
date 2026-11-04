/* PeppeZ Convert — interfaccia. Parla con il programma tramite window.api (preload in Electron, ponte nei test). */
(() => {
  const api = window.api, $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const call = (n, ...a) => api.call(n, ...a);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
  const GROUPS = [['immagini', 'Immagini'], ['documenti', 'Documenti'], ['pdf', 'PDF'], ['video', 'Video'], ['audio', 'Audio'], ['archivi', 'Archivi'], ['ebook', 'E-book'], ['dati', 'Dati'], ['cad', 'CAD & 3D']];
  const GNAME = Object.fromEntries(GROUPS), icon = g => `assets/icons/cat-${g || 'documenti'}.png`;
  const S = { settings: {}, formats: [], byId: new Map(), history: [], jobs: new Map(), dismissed: new Set(), version: '1.0.0', cli: false, paused: false };

  const fmtBytes = b => b >= 1073741824 ? (b / 1073741824).toFixed(1).replace('.', ',') + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const pad = n => String(n).padStart(2, '0');
  const when = t => { const d = new Date(t), n = new Date(), y = new Date(n - 864e5), hm = pad(d.getHours()) + ':' + pad(d.getMinutes()); return d.toDateString() === n.toDateString() ? 'oggi, ' + hm : d.toDateString() === y.toDateString() ? 'ieri, ' + hm : pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ', ' + hm; };
  const base = p => String(p).replace(/^.*[\\/]/, '');
  const toast = (text, kind = '') => { const t = el(`<div class="toast ${kind}">${esc(text)}</div>`); $('#toasts').append(t); setTimeout(() => t.remove(), 4200); };

  /* ---------- navigazione ---------- */
  function go(page) {
    $$('.page').forEach(p => p.classList.toggle('on', p.id === 'page-' + page));
    $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.page === page));
    ({ history: drawHistory, watch: drawWatch, engines: drawEngines, settings: drawSettings, convert: drawConvert, customize: drawCustomize }[page] || (() => { }))();
    $('.pages').scrollTop = 0;
  }
  $$('#nav button').forEach(b => b.onclick = () => go(b.dataset.page));
  $$('[data-go]').forEach(a => a.onclick = e => { e.preventDefault(); go(a.dataset.go); });
  $('#btnGear').onclick = () => go('settings');
  const applyTheme = () => document.documentElement.dataset.theme = S.settings.theme === 'light' ? 'light' : 'dark';
  $('#btnTheme').onclick = async () => { S.settings = await call('setSettings', { theme: S.settings.theme === 'light' ? 'dark' : 'light' }); applyTheme(); };

  /* ---------- panoramica ---------- */
  function drawHome() {
    $('#heroSub').textContent = `${S.formats.length} formati • Offline • Privato`;
    $('#footCount').textContent = `Oltre ${Math.floor(S.formats.length / 10) * 10} formati supportati`;
    $('#ver').textContent = 'Versione ' + S.version;
    $('#chips').innerHTML = ['jpg', 'png', 'pdf', 'docx', 'mp4', 'mp3', 'zip'].map(f => `<button data-f="${f}">${f.toUpperCase()}</button>`).join('');
    $$('#chips button').forEach(b => b.onclick = e => { e.stopPropagation(); pickAndConvert(b.dataset.f); });
    $('#cats').innerHTML = GROUPS.map(([g, n]) => `<button class="cat" data-g="${g}"><img src="${icon(g)}" alt=""><span>${n}</span><i></i></button>`).join('');
    $$('#cats .cat').forEach(b => b.onclick = () => { go('convert'); selectGroup(b.dataset.g); });
    const QA = [['pdf-compress', 'Comprimi PDF', 'Riduci la dimensione del tuo PDF', { preset: 'compress-pdf', label: 'Comprimi', accept: ['pdf'] }],
      ['img-resize', 'Ridimensiona immagine', 'Dimezza le dimensioni delle tue immagini', { preset: 'half-size', label: 'Dimezza', accept: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tiff', 'heic', 'avif'] }],
      ['archive-extract', 'Estrai archivio', 'Apri ZIP, RAR e altri archivi', { to: 'folder', label: 'Estrai', accept: ['zip', '7z', 'rar', 'tar', 'gz'] }],
      ['to-mp4', 'Converti in MP4', 'Trasforma qualsiasi video in MP4', { to: 'mp4', label: 'MP4', accept: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'wmv', 'flv'] }]];
    $('#qa').innerHTML = QA.map((q, i) => `<button class="qc" data-i="${i}"><img src="assets/icons/qa-${q[0]}.png" alt=""><div><b>${q[1]}</b><small>${q[2]}</small></div><i></i></button>`).join('');
    $$('#qa .qc').forEach(b => b.onclick = async () => { const q = QA[+b.dataset.i][3]; const files = await call('pickFiles', { title: QA[+b.dataset.i][1], filters: [{ name: 'File', extensions: q.accept }, { name: 'Tutti i file', extensions: ['*'] }] }); if (files && files.length) runNow(files, q); });
    drawRecent();
  }
  async function runNow(files, q) { const r = await call('convert', { files, to: q.to, preset: q.preset, label: q.label, group: q.preset === 'merge-pdf' }); if (r && r.ids && r.ids.length) toast(r.ids.length > 1 ? `${r.ids.length} file in coda` : 'File in coda'); }
  function thumbFor(h) {
    const out = h.outputs && h.outputs[0];
    if (h.status === 'done' && out && /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i.test(out)) return `<img class="th" src="${esc(api.fileUrl(out))}" alt="" onerror="this.outerHTML='<img class=&quot;th ic&quot; src=&quot;${icon(h.group)}&quot;>'">`;
    return `<img class="th ic" src="${icon(h.group)}" alt="">`;
  }
  function histState(h) { return h.status === 'done' ? `<b><span class="dot"></span>Completato</b>${when(h.time)}` : h.status === 'skipped' ? `<b>Saltato</b>${when(h.time)}` : h.status === 'cancelled' ? `<b class="err">Annullato</b>${when(h.time)}` : `<b class="err"><span class="dot err"></span>Errore</b>${when(h.time)}`; }
  function drawRecent() {
    const l = S.history.slice(0, 3), box = $('#recent');
    box.innerHTML = l.length ? l.map(h => `<div class="ri" data-id="${h.id}" title="${esc(h.error || '')}">${thumbFor(h)}<div class="tx"><b>${esc(h.name)}</b><small>${esc(h.from)} → ${esc(h.to)}</small></div><div class="st">${histState(h)}</div></div>`).join('') : '<div class="empty">Nessuna conversione ancora.<br>Trascina un file qui a fianco o usa Maiusc + trascina in Esplora risorse.</div>';
    $$('.ri', box).forEach(r => r.onclick = () => { const h = S.history.find(x => x.id === r.dataset.id); if (h && h.outputs && h.outputs[0]) call('showInFolder', h.outputs[0]); });
  }

  /* ---------- ricerca formati ---------- */
  const qi = $('#q'), qres = $('#qres');
  qi.oninput = () => {
    const t = qi.value.trim().toLowerCase(); if (!t) { qres.hidden = true; return; }
    const m = S.formats.filter(f => f.id.includes(t) || f.name.toLowerCase().includes(t) || f.extensions.some(e => e.includes(t))).slice(0, 12);
    qres.innerHTML = m.length ? m.map(f => `<button data-id="${f.id}"><img src="${icon(f.group)}" width="22" alt=""><b>${esc(f.name)}</b><small>${esc(GNAME[f.group] || '')}${f.writable ? '' : ' · solo lettura'}</small></button>`).join('') : '<div class="empty">Nessun formato trovato</div>';
    qres.hidden = false; $$('button', qres).forEach(b => b.onclick = () => { qres.hidden = true; qi.value = ''; go('convert'); selectFormat(b.dataset.id, true); });
  };
  document.addEventListener('click', e => { if (!e.target.closest('.search')) qres.hidden = true; });

  /* ---------- finestra «Converti» ---------- */
  function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }
  async function pickAndConvert(pre) {
    const files = await call('pickFiles', { title: 'Scegli i file da convertire' }); if (files && files.length) openConvert(files, { to: pre });
  }
  $('#pick').onclick = e => { e.preventDefault(); e.stopPropagation(); pickAndConvert(); };
  $('#drop').onclick = () => pickAndConvert();
  async function openConvert(paths, opt = {}) {
    const infos = await call('fileInfo', paths); if (!infos.length) return toast('Nessun file valido', 'error');
    const first = infos.find(i => !i.dir) || infos[0], tg = first.formatId ? await call('targets', first.formatId) : { targets: [] };
    const tools = first.category ? await call('toolsFor', first.category) : [];
    const m = $('#modal'); m.hidden = false;
    const isImg = id => (S.byId.get(id) || {}).group === 'immagini';
    let tab = 'fmt', sel = opt.to && tg.targets.includes(opt.to) ? opt.to : (opt.to && !tg.exact ? opt.to : null), q = S.settings.quality || 90, filter = '';
    const draw = () => {
      const groups = {}; for (const id of tg.targets) { const f = S.byId.get(id); if (!f || (filter && !(f.id.includes(filter) || f.name.toLowerCase().includes(filter)))) continue; (groups[f.group] = groups[f.group] || []).push(f); }
      const total = infos.reduce((a, b) => a + b.size, 0);
      m.innerHTML = `<div class="mc"><h2>${infos.length > 1 ? infos.length + ' file' : esc(first.name)}</h2><div class="muted">${first.formatName ? 'Formato ' + esc(first.formatName) : 'Formato non riconosciuto'} · ${fmtBytes(total)}</div>
      <div class="files">${infos.slice(0, 40).map(i => `<div><span>${esc(i.name)}</span><span>${i.dir ? 'cartella' : fmtBytes(i.size)}</span></div>`).join('')}</div>
      <div class="tabs"><button data-t="fmt" class="${tab === 'fmt' ? 'on' : ''}">Converti in</button><button data-t="tool" class="${tab === 'tool' ? 'on' : ''}">Strumenti</button></div>
      ${tab === 'fmt' ? `<input class="mfilter" id="mf" placeholder="Filtra i formati…" value="${esc(filter)}">${tg.targets.length ? GROUPS.filter(([g]) => groups[g]).map(([g, n]) => `<div class="tgrp"><h4>${n}</h4><div class="tchips">${groups[g].map(f => `<button data-f="${f.id}" class="${sel === f.id ? 'on' : ''}">${esc(f.name)}</button>`).join('')}</div></div>`).join('') || '<p class="muted">Nessun formato corrisponde.</p>' : '<p class="muted">Per questo file non risultano conversioni con i motori installati.</p>'}`
        : (tools.length ? `<div class="tchips">${tools.map((t, i) => `<button data-tool="${i}">${esc(t.label)}</button>`).join('')}</div>` : '<p class="muted">Nessuno strumento per questo tipo di file.</p>')}
      <div class="ft">${tab === 'fmt' && sel && isImg(sel) ? `<label class="q">Qualità <input type="range" min="1" max="100" value="${q}" id="mq"><b id="mqv">${q}</b></label>` : ''}<span class="sp"></span><button class="btn" id="mx">Annulla</button>${tab === 'fmt' ? `<button class="btn primary" id="mgo" ${sel ? '' : 'disabled'}>Converti${sel ? ' in ' + esc((S.byId.get(sel) || { name: sel }).name) : ''}</button>` : ''}</div></div>`;
      $('#mx', m).onclick = closeModal; m.onclick = e => { if (e.target === m) closeModal(); };
      $$('.tabs button', m).forEach(b => b.onclick = () => { tab = b.dataset.t; draw(); });
      $$('[data-f]', m).forEach(b => b.onclick = () => { sel = b.dataset.f; draw(); });
      const mf = $('#mf', m); if (mf) { mf.oninput = () => { filter = mf.value.trim().toLowerCase(); const pos = mf.selectionStart; draw(); const n = $('#mf', m); n.focus(); n.setSelectionRange(pos, pos); }; }
      const mq = $('#mq', m); if (mq) mq.oninput = () => { q = +mq.value; $('#mqv', m).textContent = q; };
      $$('[data-tool]', m).forEach(b => b.onclick = async () => { const t = tools[+b.dataset.tool]; closeModal(); await runNow(infos.map(i => i.path), { to: t.kind === 'to' ? t.value : undefined, preset: t.kind === 'preset' ? t.value : undefined, label: t.label, group: t.group }); });
      const go1 = $('#mgo', m); if (go1) go1.onclick = async () => { closeModal(); const r = await call('convert', { files: infos.map(i => i.path), to: sel, label: (S.byId.get(sel) || {}).name, quality: isImg(sel) ? q : undefined }); if (r && r.ids && r.ids.length) toast(r.ids.length > 1 ? `${r.ids.length} file in coda` : 'File in coda'); };
    };
    draw();
  }
  window.__openConvert = openConvert;

  /* ---------- trascinamento sulla finestra ---------- */
  let dragDepth = 0; const veil = $('#veil');
  addEventListener('dragenter', e => { if ([...(e.dataTransfer.types || [])].includes('Files')) { dragDepth++; veil.classList.add('on'); } });
  addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) veil.classList.remove('on'); });
  addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; veil.classList.remove('on'); const paths = [...e.dataTransfer.files].map(f => api.pathOf(f)).filter(Boolean); if (paths.length) openConvert(paths); });

  /* ---------- coda ---------- */
  const LABEL = { queued: ['wait', 'In attesa'], running: ['', 'In corso'], done: ['ok', 'Completato'], skipped: ['ok', 'Saltato'], failed: ['bad', 'Errore'], cancelled: ['wait', 'Annullato'] };
  function visibleJobs() { const now = Date.now(); return [...S.jobs.values()].filter(j => !S.dismissed.has(j.id) && (['queued', 'running', 'failed'].includes(j.status) || now - (j.finished || 0) < 9000)); }
  function drawQueue() {
    const list = visibleJobs(), box = $('#queue'); box.hidden = !list.length; if (!list.length) return;
    const active = list.filter(j => ['queued', 'running'].includes(j.status)).length;
    $('#qTitle').textContent = `Coda di conversione (${active || list.length})`;
    $('#qlist').innerHTML = list.map(j => { const [c, t] = LABEL[j.status] || ['', j.status]; return `<div class="qr" data-id="${j.id}"><img class="qi" src="${icon(j.toGroup)}" alt=""><div class="qn"><b title="${esc(j.name)}">${esc(j.name)}</b><small>${esc(j.from)} → ${esc(j.toLabel)}${j.size ? ' • ' + fmtBytes(j.size) : ''}${j.error ? ' • ' + esc(j.error) : ''}</small></div><div class="bar ${j.status === 'running' ? 'run' : j.status === 'done' || j.status === 'skipped' ? 'ok' : j.status === 'failed' ? 'bad' : 'wait'}"><i></i></div><div class="pct">${j.status === 'done' || j.status === 'skipped' ? '100%' : j.status === 'running' ? '…' : '—'}</div><div class="state ${c}">${j.status === 'running' ? '<span class="spin"></span>' : ''}${t}</div><button class="qx" title="${['queued', 'running'].includes(j.status) ? 'Annulla' : 'Nascondi'}"><i class="ico-x"></i></button></div>`; }).join('');
    $$('.qr', box).forEach(r => { const id = r.dataset.id; $('.qx', r).onclick = e => { e.stopPropagation(); const j = S.jobs.get(id); if (['queued', 'running'].includes(j.status)) call('cancel', id); else { S.dismissed.add(id); drawQueue(); } }; r.onclick = () => { const j = S.jobs.get(id); if (j.outputs && j.outputs[0]) call('showInFolder', j.outputs[0]); }; });
    $('#qPause').innerHTML = (S.paused ? 'Riprendi tutto <i class="ico-pause play"></i>' : 'Pausa tutto <i class="ico-pause"></i>');
  }
  $('#qPause').onclick = () => call('pauseAll', !S.paused);
  $('#qCancel').onclick = () => { call('cancelAll'); for (const j of S.jobs.values()) if (!['queued', 'running'].includes(j.status)) S.dismissed.add(j.id); };
  setInterval(() => { if (!$('#queue').hidden || S.jobs.size) drawQueue(); }, 3000);

  /* ---------- pagina Converti ---------- */
  let curGroup = 'immagini', curFmt = null;
  function drawConvert() {
    $('#fxGroups').innerHTML = GROUPS.map(([g, n]) => `<button data-g="${g}" class="${g === curGroup ? 'on' : ''}"><img src="${icon(g)}" alt="">${n}</button>`).join('');
    $$('#fxGroups button').forEach(b => b.onclick = () => selectGroup(b.dataset.g)); drawFxGrid();
  }
  function selectGroup(g) { curGroup = g; $('#fxq').value = ''; drawConvert(); }
  function drawFxGrid() {
    const t = $('#fxq').value.trim().toLowerCase();
    const l = S.formats.filter(f => (t ? (f.id.includes(t) || f.name.toLowerCase().includes(t) || f.extensions.some(e => e.includes(t))) : f.group === curGroup));
    $('#fxGrid').innerHTML = l.map(f => `<button data-id="${f.id}" class="${f.id === curFmt ? 'on' : ''}"><b>${esc(f.name)}</b><small>.${esc(f.extensions[0])}${f.writable ? '' : ' · lettura'}</small></button>`).join('') || '<div class="empty">Nessun formato</div>';
    $$('#fxGrid button').forEach(b => b.onclick = () => selectFormat(b.dataset.id));
  }
  $('#fxq').oninput = drawFxGrid;
  async function selectFormat(id, sync) {
    const f = S.byId.get(id); if (!f) return; curFmt = id; if (sync) { curGroup = f.group; drawConvert(); } else drawFxGrid();
    const t = await call('targets', id), side = $('#fxSide');
    side.innerHTML = `<h3>${esc(f.name)}</h3><div class="muted">${esc(GNAME[f.group] || '')} · ${f.extensions.map(e => '.' + esc(e)).join(' ')}</div>${f.writable ? '' : '<div class="chip warn" style="margin-top:8px">solo lettura</div>'}<p class="muted" style="margin:14px 0 0">${t.targets.length ? 'Si converte in:' : 'Nessuna conversione disponibile con i motori installati.'}</p><div class="tchips" id="fxT">${t.targets.map(x => `<button data-x="${x}">${esc((S.byId.get(x) || { name: x }).name)}</button>`).join('')}</div><button class="btn primary" id="fxGo" ${t.targets.length ? '' : 'disabled'}>Scegli file…</button>`;
    let pick = null; $$('#fxT button', side).forEach(b => b.onclick = () => { pick = b.dataset.x; $$('#fxT button', side).forEach(x => x.classList.toggle('on', x === b)); });
    $('#fxGo', side).onclick = async () => { const files = await call('pickFiles', { title: 'Scegli file ' + f.name, filters: [{ name: f.name, extensions: f.extensions }, { name: 'Tutti i file', extensions: ['*'] }] }); if (files && files.length) openConvert(files, { to: pick }); };
  }

  /* ---------- pagina Personalizza ---------- */
  let cuGroup = 'immagini', cuFmt = null;
  const KIND_NAME = { image: 'immagini', video: 'video', audio: 'audio', pdf: 'PDF', doc: 'documenti', archive: 'archivi', ebook: 'e-book', other: 'questo tipo' };
  const cuCustom = id => { const w = (S.settings.wheel || {}).convert || {}; return Array.isArray(w[id]) && w[id].length > 0; };
  function drawCustomize() {
    $('#cuGroups').innerHTML = GROUPS.map(([g, n]) => `<button data-g="${g}" class="${g === cuGroup ? 'on' : ''}"><img src="${icon(g)}" alt="">${n}</button>`).join('');
    $$('#cuGroups button').forEach(b => b.onclick = () => { cuGroup = b.dataset.g; $('#cuq').value = ''; drawCustomize(); });
    drawCuGrid();
  }
  function drawCuGrid() {
    const t = $('#cuq').value.trim().toLowerCase();
    const l = S.formats.filter(f => (t ? (f.id.includes(t) || f.name.toLowerCase().includes(t) || f.extensions.some(e => e.includes(t))) : f.group === cuGroup));
    $('#cuGrid').innerHTML = l.map(f => `<button data-id="${f.id}" class="${f.id === cuFmt ? 'on' : ''}"><b>${esc(f.name)}</b><small>.${esc(f.extensions[0])}${cuCustom(f.id) ? ' · personalizzato' : ''}</small></button>`).join('') || '<div class="empty">Nessun formato</div>';
    $$('#cuGrid button').forEach(b => b.onclick = () => selectCuFormat(b.dataset.id));
  }
  $('#cuq').oninput = drawCuGrid;
  async function selectCuFormat(id) {
    if (!S.byId.has(id)) return; cuFmt = id; drawCuGrid(); renderCu(await call('wheelInfo', id));
  }
  function renderCu(info) {
    const side = $('#cuSide'); if (!info) { side.innerHTML = '<p class="muted">Seleziona un formato.</p>'; return; }
    $('#cuMax').textContent = info.max;
    const f = S.byId.get(info.id) || { name: info.name, extensions: [info.id], group: '' };
    const sel = info.selected.slice(), tsel = info.tools.selected.slice();
    const nameOf = x => (S.byId.get(x) || { name: x }).name, toolName = v => (info.tools.list.find(t => t.value === v) || { label: v }).label;
    // elenco con frecce per decidere l'ordine delle fette (la prima è in alto, poi in senso orario)
    const order = (ids, nm, att) => ids.length < 2 ? '' : `<div class="cuo">${ids.map((x, k) => `<div class="it"><i>${k + 1}</i><span>${esc(nm(x))}</span><button data-${att}u="${k}" ${k ? '' : 'disabled'} title="Sposta su">&#9650;</button><button data-${att}d="${k}" ${k < ids.length - 1 ? '' : 'disabled'} title="Sposta giù">&#9660;</button></div>`).join('')}</div>`;
    const chips = (list, on, att, max) => list.map(x => { const isOn = on.includes(x.id), lock = (!isOn && on.length >= max) || (isOn && on.length === 1); return `<button data-${att}="${esc(x.id)}" class="${isOn ? 'on' : ''}" ${lock ? 'disabled' : ''} ${isOn && on.length === 1 ? 'title="Deve restare almeno una fetta"' : ''}>${esc(x.name)}</button>`; }).join('');
    side.innerHTML = `<h3>${esc(f.name)}</h3><div class="muted">${esc(GNAME[f.group] || '')} · ${f.extensions.map(e => '.' + esc(e)).join(' ')}</div>
      <div class="cu-sec"><div class="cu-h"><h4>Ruota conversioni <kbd>Maiusc</kbd></h4>${info.custom ? '<button class="cu-reset" id="cuRc">Ripristina</button>' : ''}</div>
        <p class="muted cu-n">${sel.length} di ${info.max} fette ${info.hasMore ? ' · 8ª fetta «ALTRO…» riservata all\'elenco completo' : ''} · ${info.custom ? 'personalizzata' : 'predefinita'}</p>
        ${info.hasMore ? `<div class="cu-more-badge">💡 Questo formato supporta <b>${info.totalPossible} conversioni</b>: puoi personalizzare i primi <b>7 spicchi</b>, mentre l'8° spicchio sarà <b>ALTRO…</b> per accedere all'elenco completo.</div>` : ''}
        ${info.possible.length ? `<div class="tchips" id="cuT">${chips(info.possible, sel, 'x', info.max)}</div>${order(sel, nameOf, 'c')}` : '<p class="muted">Nessuna conversione disponibile con i motori installati.</p>'}
        ${info.possible.length && !info.exact ? '<p class="muted cu-n">Elenco indicativo: collega il motore nativo per avere solo le conversioni davvero possibili.</p>' : ''}</div>
      <div class="cu-sec"><div class="cu-h"><h4>Ruota strumenti <kbd>Ctrl</kbd></h4>${info.tools.custom ? '<button class="cu-reset" id="cuRt">Ripristina</button>' : ''}</div>
        ${info.tools.list.length ? `<p class="muted cu-n">Vale per tutti i file di tipo ${esc(KIND_NAME[info.tools.kind] || '')} · ${tsel.length} di ${info.tools.list.length}${info.tools.custom ? ' · personalizzata' : ''}</p><div class="tchips" id="cuTT">${chips(info.tools.list.map(t => ({ id: t.value, name: t.label })), tsel, 't', info.tools.max || 8)}</div>${order(tsel, toolName, 'k')}<p class="muted cu-n">«Unisci» compare solo se trascini 2 o più PDF.</p>` : '<p class="muted">Nessuno strumento per questo tipo di file.</p>'}</div>`;
    const save = async (type, key, ids) => {
      const r = await call('setWheel', { type, key, ids, formatId: info.id });
      const w = S.settings.wheel = S.settings.wheel || { convert: {}, tools: {} }; w.convert = w.convert || {}; w.tools = w.tools || {}; // copia locale subito allineata, senza aspettare l'evento
      if (ids == null) delete w[type][key]; else w[type][key] = ids;
      drawCuGrid(); renderCu(r);
    };
    const move = (ids, k, d) => { const a = ids.slice(); [a[k], a[k + d]] = [a[k + d], a[k]]; return a; };
    const toggle = (ids, x) => ids.includes(x) ? ids.filter(y => y !== x) : [...ids, x];
    $$('#cuT [data-x]', side).forEach(b => b.onclick = () => save('convert', info.id, toggle(sel, b.dataset.x)));
    $$('[data-cu]', side).forEach(b => b.onclick = () => save('convert', info.id, move(sel, +b.dataset.cu, -1)));
    $$('[data-cd]', side).forEach(b => b.onclick = () => save('convert', info.id, move(sel, +b.dataset.cd, 1)));
    $$('#cuTT [data-t]', side).forEach(b => b.onclick = () => save('tools', info.tools.kind, toggle(tsel, b.dataset.t)));
    $$('[data-ku]', side).forEach(b => b.onclick = () => save('tools', info.tools.kind, move(tsel, +b.dataset.ku, -1)));
    $$('[data-kd]', side).forEach(b => b.onclick = () => save('tools', info.tools.kind, move(tsel, +b.dataset.kd, 1)));
    const rc = $('#cuRc', side); if (rc) rc.onclick = () => save('convert', info.id, null);
    const rt = $('#cuRt', side); if (rt) rt.onclick = () => save('tools', info.tools.kind, null);
  }
  $('#cuResetAll').onclick = async () => { if (!confirm('Ripristinare tutte le ruote ai valori predefiniti?')) return; await call('resetWheel'); S.settings.wheel = { convert: {}, tools: {} }; drawCuGrid(); if (cuFmt) renderCu(await call('wheelInfo', cuFmt)); else renderCu(null); toast('Ruote ripristinate', 'ok'); };

  /* ---------- cronologia ---------- */
  function drawHistory() {
    const l = S.history; $('#hList').innerHTML = l.length ? l.map(h => `<div class="row" data-id="${h.id}"><img class="ic" src="${icon(h.group)}" alt=""><div class="tx"><b>${esc(h.name)}</b><small>${esc(h.from)} → ${esc(h.to)} · ${when(h.time)}${h.error ? ' · ' + esc(h.error) : ''}</small></div><span class="chip ${h.status === 'done' ? 'ok' : h.status === 'failed' ? 'bad' : ''}">${h.status === 'done' ? 'Completato' : h.status === 'failed' ? 'Errore' : h.status === 'skipped' ? 'Saltato' : 'Annullato'}</span>${h.outputs && h.outputs[0] ? '<button class="btn" data-a="open">Mostra</button>' : ''}<button class="btn danger" data-a="del">Elimina</button></div>`).join('') : '<div class="empty panel">La cronologia è vuota.</div>';
    $$('#hList .row').forEach(r => { const h = S.history.find(x => x.id === r.dataset.id); r.onclick = e => { const a = e.target.dataset.a; if (a === 'open') call('showInFolder', h.outputs[0]); if (a === 'del') call('removeHistory', h.id); }; });
  }
  $('#hClear').onclick = () => call('clearHistory');

  /* ---------- cartelle monitorate ---------- */
  async function drawWatch() {
    $('#fmtList').innerHTML = S.formats.filter(f => f.writable).map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join('');
    const l = await call('watchList');
    $('#wList').innerHTML = l.length ? l.map(r => `<div class="row" data-id="${r.id}"><img class="ic" src="assets/icons/nav-cartelle.png" style="filter:var(--ico-filter)" alt=""><div class="tx"><b>${esc(r.folder)}</b><small>→ ${esc(r.to.toUpperCase())}${r.moveOriginals ? ' · originali spostati' : ''}</small></div><span class="chip ${r.running ? 'ok' : ''}">${r.running ? 'Attiva' : r.enabled ? 'In avvio' : 'In pausa'}</span><button class="btn" data-a="t">${r.enabled ? 'Pausa' : 'Riprendi'}</button><button class="btn danger" data-a="x">Rimuovi</button></div>`).join('') : '<div class="empty panel">Nessuna cartella monitorata.</div>';
    $$('#wList .row').forEach(r => r.onclick = async e => { const a = e.target.dataset.a; if (a === 't') { await call('watchToggle', r.dataset.id); setTimeout(drawWatch, 400); } if (a === 'x') { await call('watchRemove', r.dataset.id); drawWatch(); } });
  }
  $('#wPick').onclick = async () => { const f = await call('pickFolder'); if (f) $('#wFolder').value = f; };
  $('#wAdd').onclick = async () => {
    const folder = $('#wFolder').value, to = $('#wTo').value.trim().toLowerCase();
    if (!folder) return toast('Scegli una cartella', 'error'); if (!S.byId.has(to) || !S.byId.get(to).writable) return toast('Formato di destinazione non valido', 'error');
    await call('watchAdd', { folder, to, moveOriginals: $('#wMove').checked }); $('#wFolder').value = ''; $('#wTo').value = ''; setTimeout(drawWatch, 500);
  };

  /* ---------- catalogo motori & descrizioni ---------- */
  const ENGINES_INFO = {
    filee: {
      name: 'Motore Nativo Integrato (Core)',
      short: 'Grafica, Immagini, Manipolazione PDF e Testo',
      icon: 'assets/icons/logo-pz.png',
      tags: ['Immagini', 'PDF Multipli', 'Comprimi', 'Unisci', 'Archivi'],
      desc: 'Il cuore fondamentale di PeppeZ Easy Converter. Funziona immediatamente senza dover scaricare componenti esterni: converte oltre 50 formati di immagini, manipola documenti PDF (unione, divisione, rotazione, compressione) e gestisce testi e archivi compressi.',
      features: [
        'Conversione rapida immagini con gestione fedele di compressione e qualità personalizzabile',
        'Elaborazione PDF avanzata: unione documenti con riordino, estrazione immagini, rotazione pagine',
        'Compressione intelligente PDF e immagini con stima peso in MB in tempo reale',
        'Creazione ed estrazione archivi compressi ZIP, TAR e GZ'
      ],
      formatsIn: ['PNG', 'JPG', 'WEBP', 'AVIF', 'HEIC', 'TIFF', 'BMP', 'GIF', 'ICO', 'TGA', 'QOI', 'PPM', 'PSD', 'SVG', 'PDF', 'TXT', 'HTML', 'RTF', 'CSV', 'JSON', 'XML', 'YAML', 'TOML', 'ZIP', 'TAR', 'GZ'],
      formatsOut: ['PNG', 'JPG', 'WEBP', 'AVIF', 'HEIC', 'TIFF', 'BMP', 'GIF', 'ICO', 'TGA', 'QOI', 'PDF', 'TXT', 'RTF', 'HTML', 'CSV', 'JSON', 'XML', 'ZIP'],
      examples: [
        { from: 'PNG / WEBP / HEIC', to: 'JPG / PNG / AVIF', desc: 'Conversione immagini con qualità e risoluzione personalizzabili' },
        { from: 'PDF multipli', to: 'Unico PDF (Unisci)', desc: 'Unione file con ordinamento visivo delle pagine' },
        { from: 'PDF / Foto pesanti', to: 'PDF compresso', desc: 'Riduzione del peso del file con anteprima calcolo MB' },
        { from: 'Archivi ZIP / TAR / GZ', to: 'File estratti', desc: 'Estrazione rapida in cartella' }
      ]
    },
    ffmpeg: {
      name: 'FFmpeg',
      short: 'Video, Audio & Multimediale Universale',
      icon: 'assets/icons/cat-video.png',
      tags: ['Video HD/4K', 'Audio MP3/FLAC', 'Estrai Audio', 'GIF Animate', 'Fotogrammi'],
      desc: 'Il motore multimediale per eccellenza. Sblocca la conversione universale di video e tracce audio in qualsiasi formato esistente, l\'estrazione dell\'audio da video, creazione di fotogrammi e animazioni GIF.',
      features: [
        'Conversione completa di qualsiasi file video tra formati moderni e legacy',
        'Conversione ed estrazione audio ad alta fedeltà con bitrate regolabile',
        'Estrazione traccia audio da qualsiasi video con un clic (es. MP4 → MP3)',
        'Estrazione sequenze di fotogrammi in immagini JPG/PNG e creazione di GIF animate',
        'Codifica avanzata HEVC (H.265), H.264, VP9, AV1 per video super compatti'
      ],
      formatsIn: ['MP4', 'MKV', 'AVI', 'MOV', 'WEBM', 'WMV', 'FLV', '3GP', 'MTS', 'M2TS', 'TS', 'VOB', 'M4V', 'MP3', 'WAV', 'FLAC', 'AAC', 'M4A', 'OGG', 'OPUS', 'WMA', 'AIFF', 'ALAC', 'AC3'],
      formatsOut: ['MP4', 'MKV', 'WEBM', 'AVI', 'MOV', 'GIF', 'MP3', 'WAV', 'FLAC', 'AAC', 'M4A', 'OGG', 'OPUS', 'WMA', 'JPG (fotogrammi)', 'PNG (fotogrammi)'],
      examples: [
        { from: 'MKV / MOV / AVI', to: 'MP4 / WEBM', desc: 'Rende i video compatibili con Smart TV, smartphone e browser' },
        { from: 'Video (MP4 / MKV)', to: 'MP3 / M4A / FLAC', desc: 'Estrae la colonna sonora o l\'audio dal filmato' },
        { from: 'Video breve', to: 'GIF Animata', desc: 'Crea GIF condivisibili su chat e social network' },
        { from: 'WAV / FLAC', to: 'MP3 (alta qualità)', desc: 'Comprime musica preservando fedeltà acustica' }
      ]
    },
    libreoffice: {
      name: 'LibreOffice',
      short: 'Documenti Word, Fogli Excel & Presentazioni PowerPoint',
      icon: 'assets/icons/cat-documenti.png',
      tags: ['Word DOCX', 'Excel XLSX', 'PowerPoint PPTX', 'OpenDocument', 'PDF Perfetto'],
      desc: 'La celebre suite d\'ufficio professionale open source. Converte con precisione millimetrica documenti Microsoft Office e OpenDocument verso PDF e formati intercambiabili, mantenendo intatte tabelle, grafici, formule e impaginazione.',
      features: [
        'Conversione da Word, fogli Excel e slide PowerPoint in PDF perfetto per la stampa o l\'invio',
        'Scambio bi-direzionale tra formati Microsoft (DOCX, XLSX, PPTX) e formati aperti (ODT, ODS, ODP)',
        'Conversione di vecchi formati Office (DOC, XLS, PPT) nei nuovi formati moderni',
        'Preservazione totale di layout, font, grafici vettoriali, note e stili complessi'
      ],
      formatsIn: ['DOCX', 'DOC', 'DOCM', 'DOTX', 'DOTM', 'XLSX', 'XLS', 'XLSM', 'XLTX', 'CSV', 'PPTX', 'PPT', 'PPTM', 'PPSX', 'ODT', 'ODS', 'ODP', 'ODG', 'RTF', 'HWP', 'HWPX', 'WPD'],
      formatsOut: ['PDF', 'DOCX', 'ODT', 'XLSX', 'ODS', 'PPTX', 'ODP', 'RTF', 'TXT', 'HTML', 'PNG (slide)'],
      examples: [
        { from: 'DOCX / DOC / ODT', to: 'PDF', desc: 'Esporta documenti formattati pronti per firma digitale o invio' },
        { from: 'XLSX / XLS / CSV', to: 'PDF / HTML', desc: 'Esporta tabelle e rendiconti in documenti visualizzabili ovunque' },
        { from: 'PPTX / PPT', to: 'PDF / Immagini', desc: 'Distribuisci slide senza rischio di disallineamento font' },
        { from: 'Documento Word', to: 'ODT / RTF / TXT', desc: 'Massima interoperabilità tra programmi di videoscrittura' }
      ]
    },
    pandoc: {
      name: 'Pandoc',
      short: 'Testo Strutturato, Markdown, LaTeX & Documentazione',
      icon: 'assets/icons/cat-dati.png',
      tags: ['Markdown', 'LaTeX', 'Typst', 'Jupyter', 'HTML', 'DocBook'],
      desc: 'Il convertitore universale di documenti e testi. Trasforma codici di formattazione tra decine di linguaggi di markup, documentazione tecnica, tesi universitarie e pubblicazioni scientifiche.',
      features: [
        'Conversione di file Markdown in Word DOCX, PDF, HTML ed EPUB',
        'Conversione di documenti LaTeX, Typst e AsciiDoc per pubblicazioni scientifiche',
        'Esportazione di Jupyter Notebooks (.ipynb) in documenti consultabili',
        'Supporto per note, bibliografie, citazioni, tabelle e blocchi di codice evidenziati'
      ],
      formatsIn: ['MD (Markdown)', 'HTML', 'TEX (LaTeX)', 'TYP (Typst)', 'RST', 'ADOC (AsciiDoc)', 'IPYNB (Jupyter)', 'MEDIAWIKI', 'ORG (Emacs)', 'TEXTILE', 'OPML', 'DOCBOOK'],
      formatsOut: ['DOCX', 'PDF', 'HTML', 'EPUB', 'MD', 'TEX', 'RTF', 'TXT'],
      examples: [
        { from: 'Appunti Markdown (.md)', to: 'Documento Word (.docx)', desc: 'Crea relazioni formattate dai tuoi appunti' },
        { from: 'LaTeX (.tex) / Typst', to: 'PDF / DOCX', desc: 'Compila o converti documenti scientifici e formule' },
        { from: 'Jupyter Notebook (.ipynb)', to: 'PDF / HTML', desc: 'Esporta analisi dati e grafici in report condivisibili' },
        { from: 'Pagina HTML / Wiki', to: 'Markdown / EPUB', desc: 'Archivia e leggi contenuti web offline' }
      ]
    },
    calibre: {
      name: 'Calibre',
      short: 'E-book, Libri Digitali & Fumetti per E-reader',
      icon: 'assets/icons/cat-ebook.png',
      tags: ['Kindle MOBI/AZW3', 'Kobo EPUB', 'Fumetti CBZ/CBR', 'E-reader'],
      desc: 'Il punto di riferimento per gli appassionati di lettura ed e-reader (Kindle, Kobo, Tolino). Converte romanzi, saggi, fumetti e manuali ottimizzando caratteri, impaginazione e sommari.',
      features: [
        'Conversione tra formati Kindle (MOBI, AZW3) e standard aperti (EPUB, KEPUB)',
        'Conversione di libri digitali in PDF con formattazione A4 o tascabile per la stampa',
        'Supporto per archivi fumetti illustrati (CBZ, CBR) verso EPUB e PDF',
        'Generazione e correzione automatica di indice dei capitoli e copertine'
      ],
      formatsIn: ['EPUB', 'MOBI', 'AZW3', 'KEPUB', 'FB2', 'LIT', 'LRF', 'PDB', 'PML', 'RB', 'TCR', 'SNB', 'CBZ', 'CBR', 'CHM'],
      formatsOut: ['EPUB', 'MOBI', 'AZW3', 'PDF', 'TXT', 'HTMLZ'],
      examples: [
        { from: 'EPUB / KEPUB', to: 'MOBI / AZW3 (Kindle)', desc: 'Rende qualsiasi libro digitale leggibile su lettori Kindle' },
        { from: 'MOBI / AZW3', to: 'EPUB (Kobo/App)', desc: 'Apre libri acquistati per Kindle su qualsiasi altro dispositivo' },
        { from: 'E-book (EPUB / MOBI)', to: 'PDF impaginato', desc: 'Stampa capitoli o leggi su PC con numerazione di pagina' },
        { from: 'Fumetto (.cbz / .cbr)', to: 'PDF / EPUB', desc: 'Lettura comoda di manga e graphic novel' }
      ]
    },
    ghostscript: {
      name: 'Ghostscript',
      short: 'PostScript Professionale & PDF Tipografico',
      icon: 'assets/icons/cat-pdf.png',
      tags: ['PostScript PS', 'Vettoriale EPS', 'Alta Definizione', 'Tipografia'],
      desc: 'Interprete standard industriale per la grafica editoriale e tipografica. Consente di gestire file PostScript ed EPS storici o professionali convertendoli in PDF moderni o immagini raster ad alta risoluzione.',
      features: [
        'Conversione di file grafici vettoriali PostScript (.ps, .eps) in PDF ad alta fedeltà',
        'Rasterizzazione di grafica tipografica in immagini TIFF, PNG o JPEG fino a 600 DPI',
        'Ottimizzazione e linearizzazione di file PDF pesanti per la stampa e il web',
        'Riparazione e normalizzazione di documenti PDF difettosi'
      ],
      formatsIn: ['PS (PostScript)', 'EPS', 'PDF vettoriale'],
      formatsOut: ['PDF', 'TIFF (300/600 dpi)', 'PNG', 'JPEG'],
      examples: [
        { from: 'Grafica PostScript (.ps / .eps)', to: 'PDF moderno', desc: 'Visualizza e condividi illustrazioni tipografiche su qualsiasi PC' },
        { from: 'Disegno EPS vettoriale', to: 'PNG / TIFF alta risoluzione', desc: 'Inserisci grafica da stampa in documenti o presentazioni' },
        { from: 'PDF tipografico', to: 'PDF linearizzato compatto', desc: 'Ottimizza la resa per visualizzazione web e stampa' }
      ]
    },
    tesseract: {
      name: 'Tesseract OCR',
      short: 'Riconoscimento Ottico Testo da Immagini e Scansioni',
      icon: 'assets/icons/g-search.png',
      tags: ['OCR', 'PDF Ricercabile', 'Foto → Testo', 'Scansioni'],
      desc: 'Il celebre motore OCR di Google per il riconoscimento ottico dei caratteri. Analizza foto di fogli, scansioni cartacee e PDF privi di testo trasformandoli in documenti con testo ricercabile e selezionabile.',
      features: [
        'Creazione di Searchable PDF: aggiunge un livello di testo invisibile e selezionabile sopra la scansione',
        'Estrazione del testo contenuto in foto, screenshot e immagini scansionate in file TXT',
        'Riconoscimento avanzato del testo in decine di lingue con rilevamento automatico del layout',
        'Rende indicizzabili da Esplora risorse e ricerche desktop i documenti scansionati'
      ],
      formatsIn: ['PDF (scansione/foto)', 'PNG', 'JPG', 'TIFF', 'BMP'],
      formatsOut: ['Searchable PDF (PDF ricercabile)', 'TXT (Testo modificabile)'],
      examples: [
        { from: 'PDF scansionato (immagine)', to: 'Searchable PDF', desc: 'Rendi il documento ricercabile, selezionabile e copiabile' },
        { from: 'Foto di una pagina / scontrino', to: 'Testo TXT', desc: 'Estrai istantaneamente il testo senza doverlo ricopiare a mano' },
        { from: 'Scansione multipagina TIFF', to: 'PDF con testo integrato', desc: 'Archiviazione digitale di faldoni e contratti cartacei' }
      ]
    },
    whisper: {
      name: 'Whisper AI',
      short: 'Trascrizione Vocale e Sottotitoli con Intelligenza Artificiale',
      icon: 'assets/icons/cat-audio.png',
      tags: ['Intelligenza Artificiale', 'Audio → Testo', 'Sottotitoli SRT', 'Sbobinatura'],
      desc: 'Il modello di intelligenza artificiale sviluppato da OpenAI per il riconoscimento vocale. Converte l\'audio parlato di lezioni, interviste, riunioni e filmati in testo scritto e sottotitoli temporizzati.',
      features: [
        'Trascrizione automatica del parlato in testo continuo con punteggiatura e accuratezza elevata',
        'Generazione di file sottotitoli sincronizzati (.srt, .vtt) pronti per video YouTube, film e corsi',
        'Funziona interamente in locale sulla tua CPU/GPU, proteggendo la riservatezza delle registrazioni',
        'Supporta file audio e video di qualsiasi formato e durata'
      ],
      formatsIn: ['MP3', 'WAV', 'M4A', 'FLAC', 'OGG', 'MP4', 'MKV', 'AVI', 'MOV', 'WEBM'],
      formatsOut: ['SRT (Sottotitoli sincronizzati)', 'VTT (Sottotitoli Web)', 'TXT (Trascrizione integrale)'],
      examples: [
        { from: 'Registrazione vocale / intervista', to: 'Trascrizione testo (.txt)', desc: 'Ottieni la sbobinatura automatica in pochi minuti' },
        { from: 'Video con parlato (.mp4 / .mkv)', to: 'Sottotitoli (.srt)', desc: 'Crea sottotitoli a tempo per video, lezioni e reel' }
      ]
    }
  };

  /* ---------- modali di benvenuto e dettagli motore ---------- */
  function showEnginesWelcomeModal(userClicked) {
    const m = $('#modal'); m.hidden = false;
    m.innerHTML = `
      <div class="mc mc-wide">
        <div class="m-welcome-head">
          <img src="assets/icons/logo-pz.png" alt="">
          <h2>Benvenuto in PeppeZ Easy Converter!</h2>
          <p>Tutte le conversioni avvengono <b>interamente in locale sul tuo computer</b>, senza connessione a server esterni e garantendo privacy assoluta.</p>
        </div>
        <div class="m-welcome-grid">
          <div class="m-wcard">
            <b><img src="assets/icons/logo-pz.png" alt=""> Motore Base Pronto</b>
            <p>Il motore nativo integrato converte subito immagini, manipola documenti PDF (comprimi, unisci, ruota) e gestisce testi e archivi.</p>
          </div>
          <div class="m-wcard">
            <b><img src="assets/icons/cat-video.png" alt=""> Video & Audio</b>
            <p>Installa <b>FFmpeg</b> per sbloccare tutti i formati multimediali, estrarre tracce audio ed estrarre sequenze di fotogrammi.</p>
          </div>
          <div class="m-wcard">
            <b><img src="assets/icons/cat-documenti.png" alt=""> Office ad Alta Fedeltà</b>
            <p>Con <b>LibreOffice</b> converti Word, Excel e PowerPoint in PDF impeccabili preservando formattazione, tabelle e grafici.</p>
          </div>
          <div class="m-wcard">
            <b><img src="assets/icons/cat-ebook.png" alt=""> E-book, OCR & AI</b>
            <p>Scarica <b>Calibre</b> per libri Kindle/Kobo, <b>Tesseract</b> per PDF ricercabili e <b>Whisper</b> per trascrizioni vocali.</p>
          </div>
        </div>
        <div class="m-welcome-footer">
          💡 <b>Come funziona:</b> Per ampliare la gamma di conversioni possibili basta cliccare su <b>"Installa"</b> accanto ai motori di tuo interesse: verranno scaricati una sola volta e saranno subito pronti sia nell'app che nella comoda ruota con Maiusc e Ctrl!
        </div>
        <div class="ft" style="margin-top:20px">
          <span class="sp"></span>
          <button class="btn primary" id="mWelcomeOk">Esplora i Motori</button>
        </div>
      </div>`;
    const finish = async () => {
      closeModal();
      if (!userClicked && !S.settings.firstRunDone) {
        S.settings = await call('setSettings', { firstRunDone: true });
      }
    };
    $('#mWelcomeOk', m).onclick = finish;
    m.onclick = e => { if (e.target === m) finish(); };
  }

  function showEngineDetails(id, e) {
    const info = ENGINES_INFO[id] || { name: id, short: '', desc: '', features: [], formatsIn: [], formatsOut: [], examples: [] };
    const isCore = id === 'filee';
    const inst = isCore ? S.cli : (e && ['installed', 'owncopy'].includes(e.status));
    const m = $('#modal'); m.hidden = false;
    const chipsIn = (info.formatsIn || []).map(f => `<span class="m-fchip">${esc(f)}</span>`).join('');
    const chipsOut = (info.formatsOut || []).map(f => `<span class="m-fchip out">${esc(f)}</span>`).join('');
    const exList = (info.examples || []).map(x => `<div class="m-ex-card"><div class="m-ex-flow"><b>${esc(x.from)}</b> <span>→</span> <b>${esc(x.to)}</b></div><small>${esc(x.desc)}</small></div>`).join('');
    const featList = (info.features || []).map(f => `<li>${esc(f)}</li>`).join('');

    m.innerHTML = `
      <div class="mc mc-wide">
        <div class="m-det-head">
          <img src="${info.icon || 'assets/icons/nav-motori.png'}" alt="">
          <div class="m-det-title">
            <h2>${esc(info.name)}</h2>
            <small>${esc(info.short)}</small>
            <div class="m-det-badges">
              <span class="chip ${inst ? 'ok' : 'bad'}">${isCore ? (S.cli ? 'Predefinito · Collegato' : 'Non collegato') : (inst ? (e.outdated ? 'Da aggiornare' : e.status === 'owncopy' ? 'Già sul PC' : 'Installato') : 'Non installato')}</span>
              ${e && e.version ? `<span class="chip">v${esc(e.version)}</span>` : ''}
              ${e && e.downloadSize ? `<span class="chip">Download: ${fmtBytes(e.downloadSize)}</span>` : ''}
              ${e && e.installedSize ? `<span class="chip">Su disco: ${fmtBytes(e.installedSize)}</span>` : ''}
            </div>
          </div>
          <button class="btn" id="mx" style="align-self:flex-start">Chiudi</button>
        </div>
        <div class="m-det-body">
          <p class="m-det-desc">${esc(info.desc)}</p>
          ${featList ? `<div><div class="m-fmts-title" style="margin-bottom:8px">Funzionalità e punti di forza:</div><ul class="m-features">${featList}</ul></div>` : ''}
          <div class="m-fmts-box">
            <div class="m-fmts-title">Formati di partenza accettati (Input):</div>
            <div class="m-chips-cloud">${chipsIn || '<span class="muted">Vari</span>'}</div>
          </div>
          <div class="m-fmts-box">
            <div class="m-fmts-title">Formati di destinazione generabili (Output):</div>
            <div class="m-chips-cloud">${chipsOut || '<span class="muted">Vari</span>'}</div>
          </div>
          ${exList ? `<div><div class="m-fmts-title" style="margin-bottom:8px">Esempi di conversioni popolari abilitate:</div><div class="m-ex-grid">${exList}</div></div>` : ''}
        </div>
        <div class="ft" style="margin-top:20px">
          <span class="sp"></span>
          ${isCore ? '' : `<button class="btn ${inst ? 'danger' : 'primary'}" id="mDetAction" ${(inst && e.status === 'owncopy') || (e && e.downloadable === false) ? 'disabled' : ''}>${inst ? 'Rimuovi motore' : 'Installa questo motore'}</button>`}
          <button class="btn" id="mDetClose">Chiudi</button>
        </div>
      </div>`;
    $('#mx', m).onclick = closeModal;
    $('#mDetClose', m).onclick = closeModal;
    m.onclick = ev => { if (ev.target === m) closeModal(); };
    const act = $('#mDetAction', m);
    if (act) {
      act.onclick = async () => {
        act.disabled = true;
        const res = await call(inst ? 'engineRemove' : 'engineInstall', id);
        toast(res && (res.state === 'installed' || res.state === 'removed' || res.state === 'ok') ? 'Operazione completata' : (res && (res.error || res.reason)) || 'Operazione non riuscita', res && res.error ? 'error' : 'ok');
        closeModal();
        drawEngines();
      };
    }
  }

  /* ---------- motori ---------- */
  async function drawEngines() {
    const st = await call('getState'); S.cli = st.cliFound;
    const core = ENGINES_INFO.filee;
    $('#coreBox').innerHTML = `
      <div class="core-head">
        <img src="assets/icons/logo-pz.png" alt="">
        <div class="core-title">
          <b>${esc(core.name)}</b>
          <small>${esc(core.short)}</small>
        </div>
        <span class="chip ${st.cliFound ? 'ok' : 'bad'}">${st.cliFound ? 'Predefinito · Collegato' : 'Non collegato'}</span>
        <div class="core-actions">
          <button class="btn" id="coreDet">Maggiori dettagli</button>
          ${st.cliFound ? '' : '<button class="btn primary" id="loc">Collega motore…</button>'}
        </div>
      </div>
      <div class="core-desc">${esc(core.desc)}</div>
      <div class="eng-tags">${(core.tags || []).map(t => `<span class="eng-tag">${esc(t)}</span>`).join('')}</div>`;
    $('#coreDet').onclick = () => showEngineDetails('filee');
    const loc = $('#loc'); if (loc) loc.onclick = async () => { await call('locateFilee'); drawEngines(); checkBanner(); };

    const whyBtn = $('#btnEnginesWhy');
    if (whyBtn) whyBtn.onclick = () => showEnginesWelcomeModal(true);

    const r = await call('enginesList'), l = r.engines || [];
    $('#eList').innerHTML = l.length ? l.map(e => {
      const inst = ['installed', 'owncopy'].includes(e.status);
      const info = ENGINES_INFO[e.id] || { name: e.id, short: '', desc: (e.converters || []).join(', '), tags: [] };
      return `
        <div class="eng-card" data-id="${esc(e.id)}">
          <div class="eng-top">
            <img class="ic" src="${info.icon || 'assets/icons/nav-motori.png'}" alt="">
            <div class="eng-info">
              <b>${esc(info.name)} <small style="font-weight:normal;color:var(--muted)">(${esc(e.id)})</small></b>
              <small>${esc(info.short || (e.converters || []).join(', '))}${e.downloadSize ? ' · download ' + fmtBytes(e.downloadSize) : ''}${e.version ? ' · v' + esc(e.version) : ''}</small>
            </div>
            <span class="chip ${inst ? (e.outdated ? 'warn' : 'ok') : ''}">${inst ? (e.outdated ? 'Da aggiornare' : e.status === 'owncopy' ? 'Già sul PC' : 'Installato') : 'Non installato'}</span>
            <div class="eng-actions">
              <button class="btn" data-a="det">Maggiori dettagli</button>
              <button class="btn ${inst ? '' : 'primary'}" data-a="${inst && e.status !== 'owncopy' ? 'rm' : 'in'}" ${(inst && e.status === 'owncopy') || e.downloadable === false ? 'disabled' : ''}>${inst ? 'Rimuovi' : 'Installa'}</button>
            </div>
          </div>
          <div class="eng-desc">${esc(info.desc)}</div>
          <div class="eng-tags">${(info.tags || []).map(t => `<span class="eng-tag">${esc(t)}</span>`).join('')}</div>
          <div class="eng-progress ep"></div>
        </div>`;
    }).join('') : `<div class="empty panel">${esc(r.error || 'Nessun motore disponibile.')}</div>`;

    $$('#eList .eng-card').forEach(row => {
      const e = l.find(x => x.id === row.dataset.id);
      row.onclick = async ev => {
        const a = ev.target.dataset.a; if (!a) return;
        if (a === 'det') { showEngineDetails(row.dataset.id, e); return; }
        ev.target.disabled = true;
        const res = await call(a === 'in' ? 'engineInstall' : 'engineRemove', row.dataset.id);
        toast(res && (res.state === 'installed' || res.state === 'removed' || res.state === 'ok') ? 'Operazione completata' : (res && (res.error || res.reason)) || 'Operazione non riuscita', res && res.error ? 'error' : 'ok');
        drawEngines();
      };
    });
  }
  api.on('engines:progress', p => { const row = $(`#eList .eng-card[data-id="${p.id}"] .ep`); if (row) row.textContent = `${p.stage || ''} ${Math.round((p.fraction || 0) * 100)}%`; });

  /* ---------- impostazioni ---------- */
  function drawSettings() {
    const s = S.settings, box = $('#sForm');
    const sw = (k, label, hint) => `<div class="srow"><div><b>${label}</b><small>${hint || ''}</small></div><input type="checkbox" data-k="${k}" ${s[k] ? 'checked' : ''}></div>`;
    box.innerHTML = `
      <div class="srow"><div><b>Tema</b><small>Aspetto dell'applicazione</small></div><select data-k="theme"><option value="dark" ${s.theme !== 'light' ? 'selected' : ''}>Scuro</option><option value="light" ${s.theme === 'light' ? 'selected' : ''}>Chiaro</option></select></div>
      <div class="srow"><div><b>Dove salvare i file convertiti</b><small>${s.outputMode === 'folder' && s.outputDir ? esc(s.outputDir) : 'Accanto al file originale (l\'originale non viene mai modificato)'}</small></div><select data-k="outputMode"><option value="source" ${s.outputMode !== 'folder' ? 'selected' : ''}>Accanto all'originale</option><option value="folder" ${s.outputMode === 'folder' ? 'selected' : ''}>In una cartella</option></select><button class="btn" id="sDir">Cartella…</button></div>
      <div class="srow"><div><b>Se il file esiste già</b><small>Cosa fare quando il nome è occupato</small></div><select data-k="conflict"><option value="number" ${s.conflict === 'number' ? 'selected' : ''}>Aggiungi un numero</option><option value="overwrite" ${s.conflict === 'overwrite' ? 'selected' : ''}>Sovrascrivi</option><option value="skip" ${s.conflict === 'skip' ? 'selected' : ''}>Salta</option></select></div>
      <div class="srow"><div><b>Qualità immagini</b><small>Per JPG, WEBP, AVIF…</small></div><input type="range" min="1" max="100" data-k="quality" value="${s.quality}"><b id="qv">${s.quality}</b></div>
      ${sw('keepDates', 'Conserva le date originali', 'Il file convertito eredita data di creazione e modifica')}
      ${sw('hudEnabled', 'Ruota Maiusc + trascina', 'Tieni premuto Maiusc mentre trascini un file: attorno al cursore compare la ruota dei formati. Ctrl: strumenti.')}
      ${sw('hudOnlyExplorer', 'Solo da Esplora risorse', 'Evita che la ruota compaia trascinando in altre applicazioni')}
      ${sw('hudShowResult', 'Mostra l\'esito nella ruota', 'Anello di avanzamento e conferma al termine')}
      ${sw('closeToTray', 'Chiudi nell\'area di notifica', 'Chiudendo la finestra il programma resta attivo per la ruota')}
      ${sw('openAtLogin', 'Avvia con Windows', 'Così la ruota è sempre pronta')}`;
    const save = async (k, v) => { S.settings = await call('setSettings', { [k]: v }); applyTheme(); if (k === 'outputMode') drawSettings(); };
    $$('[data-k]', box).forEach(i => i.onchange = () => save(i.dataset.k, i.type === 'checkbox' ? i.checked : i.type === 'range' ? +i.value : i.value));
    const qr = $('[data-k=quality]', box); qr.oninput = () => $('#qv').textContent = qr.value;
    $('#sDir').onclick = async () => { const f = await call('pickFolder'); if (f) { S.settings = await call('setSettings', { outputDir: f, outputMode: 'folder' }); drawSettings(); } };
  }

  /* ---------- avvio ---------- */
  function checkBanner() { $('#engineBanner').hidden = S.cli; }
  $('#bannerFix').onclick = async () => { await call('locateFilee'); const st = await call('getState'); S.cli = st.cliFound; checkBanner(); if (S.cli) toast('Motore nativo collegato', 'ok'); };
  api.on('queue:update', j => { S.jobs.set(j.id, j); drawQueue(); });
  api.on('queue:reset', l => { S.jobs = new Map(l.map(j => [j.id, j])); drawQueue(); });
  api.on('queue:paused', v => { S.paused = v; drawQueue(); });
  api.on('history:changed', async () => { S.history = await call('history'); drawRecent(); if ($('#page-history').classList.contains('on')) drawHistory(); });
  api.on('toast', t => toast(t.text, t.kind));
  api.on('settings', s => { S.settings = s; applyTheme(); });
  api.on('open-files', paths => openConvert(paths));
  (async () => {
    const st = await call('getState'); S.settings = st.settings; S.version = st.version; S.cli = st.cliFound; applyTheme(); checkBanner();
    S.formats = await call('formats'); S.byId = new Map(S.formats.map(f => [f.id, f])); S.history = await call('history');
    for (const j of await call('queue')) S.jobs.set(j.id, j);
    drawHome(); drawQueue(); window.__ready = true;
    if (!S.settings.firstRunDone) {
      go('engines');
      showEnginesWelcomeModal(false);
    }
  })();
})();
