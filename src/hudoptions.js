// Opzioni della ruota: quali formati / strumenti proporre in base al tipo di file trascinato.
// - Si propongono SOLO conversioni possibili per quel formato (le chiede alla CLI di Filee tramite engine.targets).
// - Le fette sono al massimo MAX_SLICES, per restare leggibili.
// - Se l'utente ha personalizzato la ruota (sezione «Personalizza»), si usa la sua scelta; altrimenti l'ordine predefinito.
const MAX_SLICES = 8;

const PREFERRED = {
  image: ['png', 'jpg', 'webp', 'pdf', 'gif', 'avif', 'ico', 'bmp', 'tiff', 'heic', 'jxl', 'tga'],
  video: ['mp4', 'mkv', 'webm', 'gif', 'mov', 'avi', 'mp3', 'wav', 'm4a', 'flac'],
  audio: ['mp3', 'wav', 'flac', 'm4a', 'ogg', 'opus', 'aac', 'wma', 'aiff'],
  pdf: ['docx', 'png', 'jpg', 'txt', 'html', 'md', 'odt', 'rtf', 'epub', 'tiff', 'webp'],
  doc: ['pdf', 'docx', 'txt', 'html', 'odt', 'md', 'rtf', 'epub', 'xlsx', 'csv', 'pptx'],
  archive: ['zip', '7z', 'tar', 'tar.gz', 'tgz', 'targz', 'tar.xz'],
  ebook: ['epub', 'pdf', 'mobi', 'azw3', 'txt', 'docx', 'html'],
  other: ['jpg', 'png', 'pdf', 'docx', 'mp4', 'mp3', 'zip', 'txt']
};
// formati più comuni in generale: ordinano i candidati quando il tipo non ha un elenco preferito
const POPULAR = ['pdf', 'png', 'jpg', 'webp', 'docx', 'txt', 'html', 'md', 'xlsx', 'csv', 'pptx', 'mp4', 'mp3', 'wav', 'zip', 'epub', 'svg', 'json', 'xml', 'odt'];
const REP = { image: 'jpg', video: 'mp4', audio: 'mp3', pdf: 'pdf', doc: 'docx', archive: 'zip', ebook: 'epub', other: null };
const TOOLS = {
  image: [['compress-image', 'Comprimi'], ['half-size', 'Dimezza'], ['grayscale', 'Grigio'], ['remove-background', 'Senza sfondo']],
  video: [['compress-video', 'Comprimi'], ['extract-audio', 'Estrai audio'], ['extract-frames-jpg', 'Fotogrammi']],
  audio: [['compress-audio', 'Comprimi'], ['extract-audio', 'Estrai audio']],
  pdf: [['compress-pdf', 'Comprimi'], ['merge-pdf', 'Unisci'], ['pdf-split', 'Dividi'], ['pdf-rotate-right', 'Ruota dx'], ['pdf-rotate-left', 'Ruota sx'], ['pdf-long-image', 'Immagine lunga']],
  archive: [['@folder', 'Estrai']]
};
const GROUP_TOOLS = new Set(['merge-pdf']);
// strumenti con una piccola finestra di impostazioni (solo quelle che Filee permette davvero di regolare)
// quality = qualità con anteprima della dimensione finale; order = ordine dei file da unire
const PANELS = { 'compress-image': 'quality', 'compress-pdf': 'quality', 'merge-pdf': 'order' };
const NEEDS_MANY = new Set(['merge-pdf']); // hanno senso solo con 2 o più file

// Tipo MIME (è l'unica cosa che Windows dice del file mentre lo si trascina) → estensione più probabile
const MIME_EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp', 'image/x-ms-bmp': 'bmp',
  'image/tiff': 'tiff', 'image/avif': 'avif', 'image/heic': 'heic', 'image/heif': 'heic', 'image/svg+xml': 'svg', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico', 'image/jxl': 'jxl',
  'video/mp4': 'mp4', 'video/x-matroska': 'mkv', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/x-msvideo': 'avi', 'video/x-ms-wmv': 'wmv', 'video/x-flv': 'flv',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/flac': 'flac', 'audio/x-flac': 'flac', 'audio/ogg': 'ogg', 'audio/opus': 'opus',
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/x-ms-wma': 'wma', 'audio/aiff': 'aiff', 'audio/x-aiff': 'aiff',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx', 'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.oasis.opendocument.text': 'odt', 'application/vnd.oasis.opendocument.spreadsheet': 'ods', 'application/vnd.oasis.opendocument.presentation': 'odp',
  'application/rtf': 'rtf', 'text/rtf': 'rtf', 'text/plain': 'txt', 'text/html': 'html', 'text/markdown': 'md', 'text/csv': 'csv', 'application/json': 'json', 'application/xml': 'xml', 'text/xml': 'xml',
  'application/epub+zip': 'epub', 'application/x-mobipocket-ebook': 'mobi',
  'application/zip': 'zip', 'application/x-zip-compressed': 'zip', 'application/x-7z-compressed': '7z', 'application/x-tar': 'tar', 'application/gzip': 'gz', 'application/x-gzip': 'gz',
  'application/x-rar-compressed': 'rar', 'application/vnd.rar': 'rar'
};
const cleanMime = t => String(t || '').toLowerCase().split(';')[0].trim();
const extFromMime = t => MIME_EXT[cleanMime(t)] || null;

function kindFromMime(t) {
  t = cleanMime(t);
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  if (t === 'application/pdf') return 'pdf';
  if (t === 'application/epub+zip') return 'ebook';
  if (/zip|7z|tar|gzip|rar|bzip|xz/.test(t)) return 'archive';
  if (/msword|officedocument|opendocument|rtf|^text\//.test(t)) return 'doc';
  return 'other';
}
function kindFromCategory(cat) {
  return ({ image: 'image', vector: 'image', video: 'video', audio: 'audio', pdf: 'pdf', archive: 'archive', ebook: 'ebook' })[cat] || (['document', 'spreadsheet', 'presentation', 'text', 'hwp'].includes(cat) ? 'doc' : 'other');
}
// kinds: elenco dei tipi dei file in trascinamento (da MIME); prevale il primo tipo noto
function pickKind(kinds) { const k = (kinds || []).filter(x => x && x !== 'other'); if (!k.length) return 'other'; return k.every(x => x === k[0]) ? k[0] : 'other'; }

async function formatOfExt(engine, ext) {
  const fm = await engine.formats(); ext = String(ext || '').toLowerCase();
  return fm.find(f => f.id === ext) || fm.find(f => (f.extensions || []).some(e => e.toLowerCase() === ext)) || null;
}

// formati in cui si può davvero convertire (se i file sono di formati diversi: solo quelli comuni a tutti)
async function possibleTargets(engine, srcFormats) {
  const fm = await engine.formats(), byId = new Map(fm.map(f => [f.id, f]));
  let ids = null, exact = true;
  for (const src of srcFormats) {
    const t = await engine.targets(src.id); exact = exact && !!t.exact;
    const ok = new Set(t.targets.filter(id => id !== src.id && byId.has(id) && byId.get(id).writable));
    ids = ids ? ids.filter(id => ok.has(id)) : [...ok];
  }
  return { ids: ids || [], exact };
}
// ordine predefinito: prima i formati preferiti per quel tipo, poi i più comuni, poi quelli della stessa famiglia
function rankTargets(ids, kind, byId, srcFormat) {
  const pref = PREFERRED[kind] || PREFERRED.other;
  const rank = id => { const i = pref.indexOf(id); if (i >= 0) return i; const p = POPULAR.indexOf(id); return p >= 0 ? 100 + p : 1000; };
  const fam = id => (srcFormat && byId.get(id) && byId.get(id).group === srcFormat.group ? 0 : 1);
  return [...ids].sort((a, b) => rank(a) - rank(b) || fam(a) - fam(b) || String(byId.get(a).name).localeCompare(String(byId.get(b).name)));
}
// scelta finale delle fette: personalizzazione (solo le conversioni ancora possibili) oppure predefinito, al massimo limit fette
function pickConvertIds({ ranked, custom, max }) {
  const limit = max != null ? max : (ranked.length > MAX_SLICES ? 7 : MAX_SLICES);
  const ok = new Set(ranked);
  const mine = Array.isArray(custom) ? custom.filter((id, i, a) => ok.has(id) && a.indexOf(id) === i).slice(0, limit) : [];
  return mine.length ? mine : ranked.slice(0, limit);
}
// strumenti disponibili per un tipo; «Unisci» solo con 2 o più file (count = null: non filtrare)
function toolsAvailable(kind, count) { return (TOOLS[kind] || []).filter(([v]) => !(NEEDS_MANY.has(v) && count != null && count < 2)); }
function pickToolIds({ kind, count, custom }) {
  const avail = toolsAvailable(kind, count).map(t => t[0]), ok = new Set(avail);
  const mine = Array.isArray(custom) ? custom.filter((v, i, a) => ok.has(v) && a.indexOf(v) === i).slice(0, MAX_SLICES) : [];
  return mine.length ? mine : avail.slice(0, MAX_SLICES);
}
const toolOption = (kind, v) => {
  const label = (TOOLS[kind].find(t => t[0] === v) || [v, v])[1];
  return v === '@folder'
    ? { id: 'to:folder', kind: 'to', value: 'folder', label, sub: 'in una cartella' }
    : { id: 'preset:' + v, kind: 'preset', value: v, label, sub: PANELS[v] ? 'impostazioni' : '', group: GROUP_TOOLS.has(v), panel: PANELS[v] || null };
};

// exts: estensioni dedotte dal tipo MIME dei file in trascinamento (può essere vuoto), count: quanti file
async function buildOptions({ mode, kind = 'other', exts = [], count = 1, engine, settings }) {
  const fm = await engine.formats(), byId = new Map(fm.map(f => [f.id, f]));
  const wheel = (settings && settings.get().wheel) || {};
  if (mode === 'tools') {
    if (!TOOLS[kind]) return [];
    return pickToolIds({ kind, count, custom: (wheel.tools || {})[kind] }).map(v => toolOption(kind, v));
  }
  let src = [];
  for (const e of exts) { const f = await formatOfExt(engine, e); if (f && !src.includes(f)) src.push(f); }
  if (!src.length && REP[kind]) { const f = byId.get(REP[kind]); if (f) src = [f]; } // tipo noto solo a grandi linee: uso il formato più tipico

  let allTargets = [];
  if (src.length) {
    const p = await possibleTargets(engine, src);
    allTargets = rankTargets(p.ids, kind, byId, src[0]);
  } else {
    allTargets = (PREFERRED[kind] || PREFERRED.other).filter(id => byId.has(id) && byId.get(id).writable);
  }

  // Se ci sono più di 8 formati compatibili: spuntano 7 spicchi + 1 spicchio con scritto ALTRO (apre l'elenco completo)
  if (allTargets.length > MAX_SLICES) {
    const custom = src.length === 1 ? (wheel.convert || {})[src[0].id] : null;
    const top7 = pickConvertIds({ ranked: allTargets, custom, max: 7 });

    const options = top7.map(id => ({
      id: 'to:' + id,
      kind: 'to',
      value: id,
      label: String(byId.get(id).name).toUpperCase(),
      sub: ''
    }));

    options.push({
      id: 'more:formats',
      kind: 'more',
      value: 'more',
      label: 'ALTRO…',
      sub: 'tutti i ' + allTargets.length,
      panel: 'more',
      allTargets: allTargets.map(id => {
        const f = byId.get(id) || {};
        return {
          id,
          name: f.name || id.toUpperCase(),
          ext: (f.extensions || [id])[0],
          group: f.group || ''
        };
      })
    });
    return options;
  }

  // 8 o meno formati compatibili: mostrali tutti direttamente
  const custom = src.length === 1 ? (wheel.convert || {})[src[0].id] : null;
  const ids = pickConvertIds({ ranked: allTargets, custom });
  return ids.map(id => ({ id: 'to:' + id, kind: 'to', value: id, label: String(byId.get(id).name).toUpperCase(), sub: '' }));
}

// Opzioni predefinite immediate mostrate all'apertura istantanea della ruota prima del rilevamento MIME
function defaultWheelOptions(mode) {
  if (mode === 'tools') {
    return [
      { id: 'preset:compress-pdf', kind: 'preset', value: 'compress-pdf', label: 'Comprimi', sub: 'impostazioni', panel: 'quality' },
      { id: 'preset:merge-pdf', kind: 'preset', value: 'merge-pdf', label: 'Unisci', sub: 'impostazioni', panel: 'order' },
      { id: 'preset:pdf-split', kind: 'preset', value: 'pdf-split', label: 'Dividi', sub: '' },
      { id: 'preset:pdf-rotate-right', kind: 'preset', value: 'pdf-rotate-right', label: 'Ruota dx', sub: '' },
      { id: 'preset:pdf-rotate-left', kind: 'preset', value: 'pdf-rotate-left', label: 'Ruota sx', sub: '' },
      { id: 'preset:pdf-long-image', kind: 'preset', value: 'pdf-long-image', label: 'Immagine lunga', sub: '' }
    ];
  }
  return [
    { id: 'to:png', kind: 'to', value: 'png', label: 'PNG', sub: '' },
    { id: 'to:jpg', kind: 'to', value: 'jpg', label: 'JPG', sub: '' },
    { id: 'to:webp', kind: 'to', value: 'webp', label: 'WEBP', sub: '' },
    { id: 'to:pdf', kind: 'to', value: 'pdf', label: 'PDF', sub: '' },
    { id: 'to:avif', kind: 'to', value: 'avif', label: 'AVIF', sub: '' },
    { id: 'to:tiff', kind: 'to', value: 'tiff', label: 'TIFF', sub: '' },
    { id: 'to:ico', kind: 'to', value: 'ico', label: 'ICO', sub: '' },
    { id: 'more:formats', kind: 'more', value: 'more', label: 'ALTRO…', sub: 'tutti i formati', panel: 'more' }
  ];
}

module.exports = {
  MAX_SLICES, PREFERRED, TOOLS, PANELS, REP, GROUP_TOOLS,
  buildOptions, defaultWheelOptions, kindFromMime, kindFromCategory, pickKind, extFromMime, formatOfExt,
  possibleTargets, rankTargets, pickConvertIds, pickToolIds, toolsAvailable
};
