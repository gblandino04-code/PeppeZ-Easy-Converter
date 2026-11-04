// Ruota di conversione: compare attorno al cursore mentre si trascina un file con Maiusc (conversioni) o Ctrl (strumenti).
// La finestra è essa stessa il bersaglio del rilascio: il file lasciato su una fetta viene convertito.
(() => {
  const hud = window.hud, svg = document.getElementById('svg'), center = document.getElementById('center'), wheel = document.getElementById('wheel');
  const R = 176, r = 74, PER = 8, NS = 'http://www.w3.org/2000/svg';
  let st = { mode: 'convert', options: [], page: 0, cx: 230, cy: 230, hover: -1, busy: false, kindsSent: false, loading: false };

  const pageItems = () => st.options.slice(st.page * PER, st.page * PER + PER);
  const pages = () => Math.max(1, Math.ceil(st.options.length / PER));
  const pt = (a, rad) => [st.cx + Math.cos(a) * rad, st.cy + Math.sin(a) * rad];
  const arc = (a0, a1) => { const [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R), [x2, y2] = pt(a1, r), [x3, y3] = pt(a0, r), big = a1 - a0 > Math.PI ? 1 : 0; return `M${x0} ${y0}A${R} ${R} 0 ${big} 1 ${x1} ${y1}L${x2} ${y2}A${r} ${r} 0 ${big} 0 ${x3} ${y3}Z`; };
  const node = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };

  function render() {
    svg.innerHTML = '<defs><linearGradient id="hotg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3d93ff"/><stop offset="1" stop-color="#1759e0"/></linearGradient><linearGradient id="moreg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs>';
    const items = pageItems(), n = items.length || 1, step = Math.PI * 2 / n, gap = n > 1 ? 0.035 : 0, start = -Math.PI / 2 - step / 2;
    svg.append(node('circle', { cx: st.cx, cy: st.cy, r: R + 7, class: 'glow' }));
    items.forEach((o, i) => {
      const a0 = start + i * step + gap, a1 = start + (i + 1) * step - gap;
      const isMore = o.kind === 'more';
      svg.append(node('path', { d: arc(a0, a1), class: 'seg' + (isMore ? ' more' : '') + (i === st.hover ? ' hot' : ''), 'data-i': i }));
      const [tx, ty] = pt((a0 + a1) / 2, (R + r) / 2 + 2), t = node('text', { x: tx, y: ty - (o.sub ? 6 : 0), class: 'lab' + (isMore ? ' more' : '') + (i === st.hover ? ' hot' : '') }); t.textContent = o.label; svg.append(t);
      if (o.sub) { const s = node('text', { x: tx, y: ty + 11, class: 'sub' + (isMore ? ' more' : '') }); s.textContent = o.sub; svg.append(s); }
    });
    center.style.left = st.cx + 'px'; center.style.top = st.cy + 'px';
    document.getElementById('cTitle').textContent = st.mode === 'tools' ? 'Strumenti' : 'Converti in';
    document.getElementById('cSub').textContent = st.loading ? 'Leggo il file…' : st.options.length ? 'Rilascia su una fetta' : st.mode === 'tools' ? 'Nessuno strumento per questo file' : 'Nessuna conversione trovata';
    document.getElementById('cDots').innerHTML = pages() > 1 ? Array.from({ length: pages() }, (_, i) => `<i class="${i === st.page ? 'on' : ''}"></i>`).join('') : '';
  }
  function indexAt(x, y) {
    const dx = x - st.cx, dy = y - st.cy, d = Math.hypot(dx, dy), n = pageItems().length;
    if (!n || d < r - 15 || d > R + 35) return -1;
    const step = Math.PI * 2 / n; let a = Math.atan2(dy, dx) + Math.PI / 2 + step / 2; a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return Math.floor(a / step) % n;
  }
  function setHover(i) {
    if (i === st.hover) return; st.hover = i; $$seg();
    if (i >= 0) {
      const o = pageItems()[i];
      if (o) {
        if (o.kind === 'more') {
          document.getElementById('cTitle').textContent = 'Tutti i formati';
          document.getElementById('cSub').textContent = 'Rilascia per aprire l\'elenco completo';
        } else {
          document.getElementById('cTitle').textContent = st.mode === 'tools' ? 'Strumento' : 'Converti in';
          document.getElementById('cSub').textContent = o.label + (o.sub ? ' (' + o.sub + ')' : '');
        }
      }
    } else {
      document.getElementById('cTitle').textContent = st.mode === 'tools' ? 'Strumenti' : 'Converti in';
      document.getElementById('cSub').textContent = st.loading ? 'Leggo il file…' : st.options.length ? 'Rilascia su una fetta' : (st.mode === 'tools' ? 'Nessuno strumento per questo file' : 'Nessuna conversione trovata');
    }
  }
  function $$seg() { [...svg.querySelectorAll('.seg')].forEach((s, k) => s.classList.toggle('hot', k === st.hover)); [...svg.querySelectorAll('.lab')].forEach((s, k) => s.classList.toggle('hot', k === st.hover)); }

  document.addEventListener('dragenter', e => {
    e.preventDefault();
    if (!st.kindsSent && e.dataTransfer && e.dataTransfer.items) { st.kindsSent = true; const it = [...e.dataTransfer.items].filter(i => i.kind === 'file'); hud.kinds({ mimes: it.map(i => i.type), count: it.length }); }
  });
  document.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (!st.busy) setHover(indexAt(e.clientX, e.clientY)); });
  document.addEventListener('dragleave', e => { if (!e.relatedTarget) setHover(-1); });
  document.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation();
    const paths = [...e.dataTransfer.files].map(f => hud.pathOf(f)).filter(Boolean);
    if (!paths.length || st.busy) { hud.close(); return; }
    let i = indexAt(e.clientX, e.clientY);
    if (i < 0 && st.hover >= 0) i = st.hover;
    if (i < 0) {
      if (st.mode === 'convert') {
        const moreOpt = pageItems().find(o => o.kind === 'more') || pageItems()[0];
        if (moreOpt) {
          if (moreOpt.panel === 'more') openPanel(moreOpt, paths);
          else startDrop(paths, moreOpt, {});
          return;
        }
      } else {
        const first = pageItems()[0];
        if (first) {
          if (first.panel) openPanel(first, paths);
          else startDrop(paths, first, {});
          return;
        }
      }
      hud.close();
      return;
    }
    const opt = pageItems()[i];
    if (opt.panel && !(opt.panel === 'order' && paths.length < 2)) { openPanel(opt, paths); return; }
    startDrop(paths, opt, {});
  });
  function startDrop(paths, opt, params) {
    st.busy = true; $$seg();
    document.getElementById('cBusy').hidden = false; document.getElementById('cBusyT').textContent = paths.length > 1 ? paths.length + ' file…' : 'In corso…';
    hud.drop({ paths, option: opt, mode: st.mode, params });
  }
  const fmtBytes = n => n >= 1073741824 ? (n / 1073741824).toFixed(1).replace('.', ',') + ' GB' : n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  // piccola finestra di impostazioni: qualità con anteprima della dimensione (comprimi immagini e PDF), ordine dei file (unisci PDF) o elenco completo (Altro)
  function openPanel(opt, paths) {
    hud.hold(); wheel.classList.remove('on'); const P = document.getElementById('panel'), B = document.getElementById('pBody'); P.hidden = false;
    P.classList.toggle('panel-more', opt.panel === 'more');
    const name = f => f.split(/[\\/]/).pop(); let q = 75, order = paths.slice(), selectedFmt = null, tmr = null, seq = 0;
    document.getElementById('pTitle').textContent = opt.panel === 'order' ? 'Unisci PDF: ordine dei file' : opt.panel === 'more' ? 'Tutte le conversioni possibili' : 'Comprimi: qualità' + (paths.length > 1 ? ' (' + paths.length + ' file)' : '');
    // dimensione stimata: una prova vera di compressione fatta dal programma (non tocca l'originale), rilanciata poco dopo l'ultima modifica
    const estimate = () => {
      const box = B.querySelector('.est'); if (!box) return;
      clearTimeout(tmr); const mine = ++seq;
      box.className = 'est busy'; box.querySelector('b').textContent = 'calcolo…'; box.querySelector('small').textContent = '';
      tmr = setTimeout(async () => {
        let r = null; try { r = await hud.estimate({ files: paths, preset: opt.value, quality: q }); } catch { }
        if (mine !== seq || P.hidden) return;
        const e = B.querySelector('.est'); if (!e || (r && r.cancelled)) return;
        if (!r || !r.ok) { e.className = 'est'; e.querySelector('b').textContent = 'non disponibile'; e.querySelector('small').textContent = (r && r.error) || ''; return; }
        const pct = Math.round((1 - r.ratio) * 100);
        e.className = 'est ' + (pct >= 2 ? 'ok' : 'none');
        e.querySelector('b').textContent = '~' + fmtBytes(r.estimated);
        e.querySelector('small').textContent = 'da ' + fmtBytes(r.original) + (pct >= 2 ? ' · −' + pct + '%' : ' · con questa qualità non si riduce') + (r.exact ? '' : ' · stima su ' + r.sampled + ' file di ' + r.total);
      }, 450);
    };
    const draw = () => {
      if (opt.panel === 'quality') {
        B.innerHTML = `<div class="chips">${[['Forte', 50], ['Media', 75], ['Leggera', 90]].map(([l, v]) => `<button class="chip${q === v ? ' on' : ''}" data-q="${v}">${l} ${v}%</button>`).join('')}</div><div class="val"><span>Qualità</span><b>${q}%</b></div><input type="range" min="10" max="100" value="${q}" id="rg"><div class="hint">Più bassa = file più piccolo.</div><div class="est busy"><span>Dimensione dopo</span><b>calcolo…</b><small></small></div>`;
        B.querySelectorAll('.chip').forEach(b => b.onclick = () => { q = +b.dataset.q; draw(); estimate(); });
        const rg = B.querySelector('#rg');
        rg.oninput = () => {
          q = +rg.value;
          B.querySelector('.val b').textContent = q + '%';
          B.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', +c.dataset.q === q));
        };
        rg.onchange = () => estimate();
        rg.onpointerup = () => estimate();
        rg.onkeyup = () => estimate();
      } else if (opt.panel === 'order') {
        B.innerHTML = '<div class="ord">' + order.map((f, k) => `<div class="it"><i>${k + 1}</i><span title="${f}">${name(f)}</span><button data-u="${k}" ${k ? '' : 'disabled'}>&#9650;</button><button data-d="${k}" ${k < order.length - 1 ? '' : 'disabled'}>&#9660;</button></div>`).join('') + '</div>';
        const mv = (a, b) => { [order[a], order[b]] = [order[b], order[a]]; draw(); };
        B.querySelectorAll('[data-u]').forEach(b => b.onclick = () => mv(+b.dataset.u, +b.dataset.u - 1));
        B.querySelectorAll('[data-d]').forEach(b => b.onclick = () => mv(+b.dataset.d, +b.dataset.d + 1));
      } else if (opt.panel === 'more') {
        const all = opt.allTargets || [];
        B.innerHTML = `
          <div class="more-search"><input type="text" id="mMoreSearch" placeholder="Cerca formato (es. pdf, png, docx)…" autocomplete="off"></div>
          <div class="more-sub">Scorri o filtra tra le <b>${all.length}</b> conversioni disponibili:</div>
          <div class="more-grid" id="mMoreGrid"></div>`;
        const renderMore = (filter = '') => {
          const qStr = filter.trim().toLowerCase();
          const filtered = all.filter(f => !qStr || f.id.includes(qStr) || f.name.toLowerCase().includes(qStr) || f.ext.includes(qStr));
          const grid = B.querySelector('#mMoreGrid'); if (!grid) return;
          grid.innerHTML = filtered.length ? filtered.map(f => `
            <button class="m-fmt-item${selectedFmt === f.id ? ' on' : ''}" data-fid="${f.id}" title="${f.name} (.${f.ext})">
              <b>${f.name}</b><small>.${f.ext}</small>
            </button>`).join('') : '<div style="grid-column:1/-1;text-align:center;padding:24px 0;color:#8ea0c6">Nessun formato trovato</div>';
          grid.querySelectorAll('.m-fmt-item').forEach(btn => {
            btn.onclick = () => {
              selectedFmt = btn.dataset.fid;
              grid.querySelectorAll('.m-fmt-item').forEach(b => b.classList.toggle('on', b.dataset.fid === selectedFmt));
              updateOkBtn();
            };
            btn.ondblclick = () => {
              selectedFmt = btn.dataset.fid;
              document.getElementById('pOk').click();
            };
          });
        };
        const updateOkBtn = () => {
          const okBtn = document.getElementById('pOk');
          if (selectedFmt) {
            const found = all.find(f => f.id === selectedFmt) || { name: selectedFmt.toUpperCase() };
            okBtn.textContent = 'Converti in ' + found.name;
            okBtn.disabled = false;
          } else {
            okBtn.textContent = 'Avvia';
            okBtn.disabled = true;
          }
        };
        renderMore('');
        updateOkBtn();
        const searchInp = B.querySelector('#mMoreSearch');
        if (searchInp) {
          setTimeout(() => searchInp.focus(), 60);
          searchInp.oninput = () => renderMore(searchInp.value);
          searchInp.onkeydown = ev => {
            if (ev.key === 'Enter') {
              const qStr = searchInp.value.trim().toLowerCase();
              const filtered = all.filter(f => !qStr || f.id.includes(qStr) || f.name.toLowerCase().includes(qStr) || f.ext.includes(qStr));
              if (filtered.length && !selectedFmt) { selectedFmt = filtered[0].id; renderMore(searchInp.value); }
              if (selectedFmt) document.getElementById('pOk').click();
            }
          };
        }
      }
    };
    draw();
    if (opt.panel === 'quality') estimate();
    document.getElementById('pCancel').onclick = () => { clearTimeout(tmr); seq++; P.hidden = true; P.classList.remove('panel-more'); hud.close(); };
    document.getElementById('pOk').onclick = () => {
      clearTimeout(tmr); seq++;
      if (opt.panel === 'more') {
        if (!selectedFmt) return;
        const chosen = (opt.allTargets || []).find(t => t.id === selectedFmt) || { id: selectedFmt, name: selectedFmt.toUpperCase() };
        P.hidden = true; P.classList.remove('panel-more'); wheel.classList.add('on');
        startDrop(paths, { id: 'to:' + chosen.id, kind: 'to', value: chosen.id, label: chosen.name.toUpperCase() }, {});
        return;
      }
      P.hidden = true; P.classList.remove('panel-more'); wheel.classList.add('on');
      startDrop(paths, opt, opt.panel === 'order' ? { order } : { quality: q });
    };
  }
  // tastiera nel pannello: Esc annulla, Invio conferma (la finestra prende il focus solo quando il pannello è aperto)
  document.addEventListener('keydown', e => {
    if (document.getElementById('panel').hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); document.getElementById('pCancel').click(); }
    else if (e.key === 'Enter') {
      const okBtn = document.getElementById('pOk');
      if (okBtn && !okBtn.disabled) { e.preventDefault(); okBtn.click(); }
    }
  });
  addEventListener('wheel', e => { if (!st.busy && document.getElementById('panel').hidden) flip(e.deltaY > 0 ? 1 : -1); });

  function flip(dir) { if (st.busy || pages() < 2) return; st.page = (st.page + dir + pages()) % pages(); st.hover = -1; render(); }
  function show(p) {
    st = { mode: p.mode, options: p.options || [], page: 0, cx: p.cx, cy: p.cy, hover: -1, busy: false, kindsSent: false, loading: p.options == null };
    document.getElementById('panel').hidden = true; document.getElementById('panel').classList.remove('panel-more'); document.getElementById('cBusy').hidden = true; document.getElementById('cDone').hidden = true; render(); wheel.classList.add('on');
  }
  hud.onShow(show);
  hud.onOptions(o => { if (st.busy) return; st.loading = false; st.options = o.options; st.mode = o.mode; st.page = 0; st.hover = -1; render(); });
  hud.onFlip(flip);
  hud.onHide(() => { wheel.classList.remove('on'); document.getElementById('panel').hidden = true; document.getElementById('panel').classList.remove('panel-more'); st.busy = false; });
  hud.onResult(r => {
    document.getElementById('cBusy').hidden = true; const d = document.getElementById('cDone'); d.hidden = false;
    d.querySelector('.mark').className = 'mark' + (r.status === 'done' ? '' : ' bad');
    document.getElementById('cDoneT').textContent = r.status === 'done' ? 'Fatto' : 'Errore'; document.getElementById('cDoneS').textContent = r.text || '';
  });
  window.__hudTest = { openPanel, show, flip, setHover, render, state: () => st, indexAt };
})();
