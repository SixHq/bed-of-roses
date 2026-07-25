// MCP Marketplace renderer. Talks to the Node runtime through the main process
// (window.borMcp, wired in mcp-preload.cjs) so there is no file://→http CORS
// problem and the catalog/install calls are cached server-side. The renderer
// ALSO keeps the fetched catalog in memory, so filtering/searching never
// refetches and reopening the (reused) window is instant.

const els = {
  search: document.getElementById('search'),
  ask: document.getElementById('ask'),
  refresh: document.getElementById('refresh'),
  close: document.getElementById('close'),
  cats: document.getElementById('cats'),
  aiBanner: document.getElementById('ai-banner'),
  grid: document.getElementById('grid'),
  status: document.getElementById('status'),
  toast: document.getElementById('toast'),
};

const state = {
  items: [],
  installed: new Set(),
  category: 'all',
  query: '',
  loadedAt: 0,
  installing: new Set(),
  aiMode: false,
  aiQuery: '',
  aiMatches: [],
  asking: false,
};

const api = window.borMcp || {
  // Standalone fallback (e.g. opened directly in a browser) — degrades to empty.
  getCatalog: async () => ({ items: [], stale: true, error: 'host bridge unavailable' }),
  getInstalled: async () => ({ installed: [] }),
  getTheme: async () => ({ theme: '' }),
  install: async () => ({ ok: false }),
  close: () => {},
};

const THEME_ALIASES = {
  cartoon: 'cartoon-brutalist', brutalist: 'cartoon-brutalist', 'cartoon-brutalist': 'cartoon-brutalist', 't-cb': 'cartoon-brutalist',
  earthy: 'warm-earthy', warm: 'warm-earthy', 'warm-earthy': 'warm-earthy', 'warm-and-earthy': 'warm-earthy', 't-we': 'warm-earthy',
  neo: 'neo-brutalist', 'neo-brutalist': 'neo-brutalist', neobrutalist: 'neo-brutalist', 't-nb': 'neo-brutalist',
  y2k: 'y2k-frutiger', frutiger: 'y2k-frutiger', 'frutiger-aero': 'y2k-frutiger', 'y2k-frutiger': 'y2k-frutiger', 't-y2k': 'y2k-frutiger',
  riso: 'risograph', risograph: 'risograph', 't-rs': 'risograph',
  crt: 'pixel-crt', pixel: 'pixel-crt', 'pixel-crt': 'pixel-crt', 't-crt': 'pixel-crt',
  glass: 'liquid-glass', liquid: 'liquid-glass', 'liquid-glass': 'liquid-glass', 't-lg': 'liquid-glass',
  memphis: 'memphis', 't-mp': 'memphis',
  solarpunk: 'solarpunk', 'solar-punk': 'solarpunk', 't-sp': 'solarpunk',
  cyberpunk: 'cyberpunk', cyber: 'cyberpunk', 't-cp': 'cyberpunk',
};

async function applyTheme() {
  try {
    const { theme } = await api.getTheme();
    const norm = THEME_ALIASES[String(theme || '').trim().toLowerCase()];
    if (norm) document.documentElement.dataset.theme = norm;
    else delete document.documentElement.dataset.theme; // default (dark violet)
  } catch { /* keep default */ }
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function compact(n) {
  const v = Number(n) || 0;
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return String(v);
}

function prettyCategory(c) {
  return String(c || 'other').replace(/[-_]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

let toastTimer = null;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { els.toast.hidden = true; }, 3200);
}

function isInstalled(item) {
  return state.installed.has(item.mcpId) || state.installed.has(item.name);
}

function matches(item) {
  if (state.category === 'installed' && !isInstalled(item)) return false;
  if (state.category !== 'all' && state.category !== 'installed' && item.category !== state.category) return false;
  const q = state.query;
  if (!q) return true;
  const hay = `${item.name} ${item.author} ${item.description} ${item.category} ${(item.tags || []).join(' ')}`.toLowerCase();
  return hay.includes(q);
}

function renderCats() {
  const counts = new Map();
  for (const it of state.items) counts.set(it.category, (counts.get(it.category) || 0) + 1);
  const cats = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const installedCount = state.items.filter(isInstalled).length;
  const chips = [
    { key: 'all', label: 'All', count: state.items.length },
    { key: 'installed', label: 'Installed', count: installedCount },
    ...cats.map(([key, count]) => ({ key, label: prettyCategory(key), count })),
  ];
  els.cats.innerHTML = chips.map((c) => `
    <button class="mkt-chip${c.key === state.category ? ' is-active' : ''}" data-cat="${escapeHtml(c.key)}" type="button">
      ${escapeHtml(c.label)}<span class="count">${c.count}</span>
    </button>`).join('');
}

function cardHtml(item) {
  const installed = isInstalled(item);
  const installing = state.installing.has(item.mcpId);
  const logo = item.logoUrl
    ? `<img src="${escapeHtml(item.logoUrl)}" alt="" loading="lazy" onerror="this.remove()">`
    : escapeHtml((item.name || '?').trim().charAt(0).toUpperCase() || '◆');
  const tags = (item.tags || []).slice(0, 4)
    .map((t) => `<span class="mkt-tag">${escapeHtml(t)}</span>`).join('');
  const btn = installed
    ? `<button class="mkt-install is-installed" disabled>Installed</button>`
    : `<button class="mkt-install" data-install="${escapeHtml(item.mcpId)}"${installing ? ' disabled' : ''}>${installing ? 'Installing…' : 'Install'}</button>`;
  return `
    <article class="mkt-card">
      <div class="mkt-card-top">
        <div class="mkt-logo">${logo}</div>
        <div class="mkt-card-head">
          <div class="mkt-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
          ${item.author ? `<div class="mkt-author">${escapeHtml(item.author)}</div>` : ''}
        </div>
      </div>
      ${item.description ? `<p class="mkt-desc">${escapeHtml(item.description)}</p>` : ''}
      ${tags ? `<div class="mkt-tags">${tags}</div>` : ''}
      <div class="mkt-card-foot">
        ${item.githubStars ? `<span class="mkt-metric" title="GitHub stars">★ ${compact(item.githubStars)}</span>` : ''}
        ${item.downloadCount ? `<span class="mkt-metric" title="Downloads">↓ ${compact(item.downloadCount)}</span>` : ''}
        ${item.requiresApiKey ? `<span class="mkt-key" title="Requires an API key">key</span>` : ''}
        ${btn}
      </div>
    </article>`;
}

function renderGrid() {
  // AI mode: show exactly the servers the model chose, in its ranked order.
  if (state.aiMode) {
    const byId = new Map(state.items.map((i) => [i.mcpId, i]));
    const list = state.aiMatches.map((id) => byId.get(id)).filter(Boolean);
    els.grid.innerHTML = list.length
      ? list.map(cardHtml).join('')
      : `<div class="mkt-empty">The AI didn't find a server for “${escapeHtml(state.aiQuery)}”. Try rephrasing, or browse by category.</div>`;
    return;
  }
  const filtered = state.items.filter(matches);
  if (!filtered.length) {
    els.grid.innerHTML = `<div class="mkt-empty">${state.items.length ? 'No servers match your search.' : 'No servers in the catalog.'}</div>`;
    return;
  }
  // Recommended + popular first, stable otherwise.
  filtered.sort((a, b) => (Number(b.isRecommended) - Number(a.isRecommended)) || (b.githubStars - a.githubStars));
  els.grid.innerHTML = filtered.map(cardHtml).join('');
}

function renderAiBanner() {
  if (state.asking) {
    els.aiBanner.hidden = false;
    els.aiBanner.innerHTML = `<span class="mkt-ai-spark spin">✦</span> Asking AI to find servers for “${escapeHtml(els.search.value.trim())}”…`;
    return;
  }
  if (state.aiMode) {
    const n = state.aiMatches.length;
    els.aiBanner.hidden = false;
    els.aiBanner.innerHTML = `<span class="mkt-ai-spark">✦</span> AI picks for “${escapeHtml(state.aiQuery)}” — ${n} server${n === 1 ? '' : 's'} <button class="mkt-ai-clear" type="button" data-ai-clear>Clear</button>`;
    return;
  }
  els.aiBanner.hidden = true;
  els.aiBanner.innerHTML = '';
}

async function runAsk() {
  const query = els.search.value.trim();
  if (!query) { els.search.focus(); toast('Describe what you need, then Ask AI.'); return; }
  if (state.asking) return;
  state.asking = true;
  els.ask.disabled = true;
  els.ask.classList.add('is-busy');
  renderAiBanner();
  showSkeletons();
  try {
    const res = await api.ask(query);
    state.aiMode = true;
    state.aiQuery = query;
    state.aiMatches = Array.isArray(res.matches) ? res.matches : [];
  } catch (e) {
    state.aiMode = false;
    toast(`AI match failed: ${e.message}`);
  } finally {
    state.asking = false;
    els.ask.disabled = false;
    els.ask.classList.remove('is-busy');
  }
  renderAiBanner();
  renderGrid();
}

function clearAi() {
  state.aiMode = false;
  state.aiQuery = '';
  state.aiMatches = [];
  renderAiBanner();
  renderGrid();
}

function renderStatus(stale, error) {
  const n = state.items.length;
  if (error && !n) { els.status.textContent = `Couldn't load catalog — ${error}`; return; }
  const when = state.loadedAt ? new Date(state.loadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  els.status.textContent = `${n} servers${stale ? ' · offline cache' : ''}${when ? ' · updated ' + when : ''}`;
}

function showSkeletons() {
  els.grid.innerHTML = Array.from({ length: 8 }, () => '<div class="mkt-skeleton"></div>').join('');
}

async function load({ refresh = false } = {}) {
  if (!state.items.length || refresh) showSkeletons();
  const [cat, inst] = await Promise.all([
    api.getCatalog({ refresh }).catch((e) => ({ items: [], stale: true, error: e.message })),
    api.getInstalled().catch(() => ({ installed: [] })),
  ]);
  state.items = Array.isArray(cat.items) ? cat.items : [];
  state.installed = new Set(inst.installed || []);
  state.loadedAt = cat.cachedAt || Date.now();
  renderCats();
  renderGrid();
  renderStatus(cat.stale, cat.error);
}

async function refreshInstalledOnly() {
  const inst = await api.getInstalled().catch(() => ({ installed: [] }));
  state.installed = new Set(inst.installed || []);
  renderCats();
  renderGrid();
}

// --- events ---
els.search.addEventListener('input', () => {
  state.query = els.search.value.trim().toLowerCase();
  if (state.aiMode) { state.aiMode = false; state.aiMatches = []; state.aiQuery = ''; renderAiBanner(); }
  renderGrid();
});
els.search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); runAsk(); }
});
els.ask.addEventListener('click', runAsk);
els.aiBanner.addEventListener('click', (e) => { if (e.target.closest('[data-ai-clear]')) clearAi(); });
els.cats.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-cat]');
  if (!chip) return;
  state.category = chip.dataset.cat;
  if (state.aiMode) { state.aiMode = false; state.aiMatches = []; state.aiQuery = ''; renderAiBanner(); }
  renderCats();
  renderGrid();
});
els.grid.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-install]');
  if (!btn) return;
  const mcpId = btn.dataset.install;
  if (state.installing.has(mcpId)) return;
  state.installing.add(mcpId);
  renderGrid();
  try {
    const res = await api.install(mcpId);
    if (res && res.ok !== false) {
      toast(`Installing “${res.name || mcpId}” — follow along in the chat.`);
      // The install runs as a chat task; close so the user sees the presence.
      window.setTimeout(() => api.close(), 900);
    } else {
      toast(`Couldn't start install: ${(res && res.error) || 'unknown error'}`);
      state.installing.delete(mcpId);
      renderGrid();
    }
  } catch (err) {
    toast(`Install failed: ${err.message}`);
    state.installing.delete(mcpId);
    renderGrid();
  }
});
els.refresh.addEventListener('click', () => load({ refresh: true }));
els.close.addEventListener('click', () => api.close());
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') api.close();
  if ((e.metaKey || e.ctrlKey) && e.key === 'f') { e.preventDefault(); els.search.focus(); }
});

// When the reused window is shown again, re-apply the theme (the user may have
// changed it) and refresh installed badges (a server may have finished
// installing while it was hidden) without refetching the catalog.
if (api.onShown) api.onShown(() => { applyTheme(); refreshInstalledOnly(); });

applyTheme();
load();
