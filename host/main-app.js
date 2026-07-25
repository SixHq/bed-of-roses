// Main BOR app renderer. Talks to main via window.borMainApp (main-app-preload).

const api = window.borMainApp;
let presences = [];
let activeTab = 'presences';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}
function monogram(name) {
  const w = String(name || '').trim().split(/[\s\-_]+/).filter(Boolean);
  if (!w.length) return '?';
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[1][0]).toUpperCase();
}
function fmtDate(ms) {
  if (!ms) return '—';
  try { return new Date(ms).toLocaleString(); } catch { return '—'; }
}

// ---- Tabs ----
document.getElementById('tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  activeTab = tab.dataset.tab;
  for (const b of document.querySelectorAll('.tab')) b.setAttribute('aria-current', String(b === tab));
  for (const p of document.querySelectorAll('.panel')) p.classList.toggle('hidden', p.dataset.panel !== activeTab);
  if (activeTab === 'onboarding') populateOnboardingSelect();
  if (activeTab === 'logs') { populateLogsSelect(); loadLogs(); }
  if (activeTab === 'spend') renderSpend();
});

// ---- Manage presences ----
async function refresh() {
  presences = await api.listPresences().catch(() => []);
  renderGrid();
  const count = presences.length;
  document.getElementById('presence-count').textContent =
    `${count} presence${count === 1 ? '' : 's'} · each fully isolated`;
}

function renderGrid() {
  const grid = document.getElementById('presence-grid');
  if (!presences.length) {
    grid.innerHTML = '<div class="empty">No presences yet.</div>';
    return;
  }
  grid.innerHTML = '';
  for (const p of presences) {
    const card = document.createElement('div');
    card.className = 'card';
    const canDelete = presences.length > 1;
    card.innerHTML = `
      <div class="card-top">
        <span class="card-mono">${esc(monogram(p.nickname || p.displayName))}</span>
        <div>
          <div class="card-title">${esc(p.nickname || p.displayName || 'Untitled')}</div>
          <div class="card-tag">${esc(p.tagName || p.id)}</div>
        </div>
      </div>
      <div class="card-meta">
        <span class="chip ${p.running ? 'on' : 'off'}">${p.running ? 'running' : 'stopped'}</span>
        <span class="chip ${p.onboarded ? 'on' : 'off'}">${p.onboarded ? 'onboarded' : 'setup pending'}</span>
        ${p.orbOpen ? '<span class="chip on">orb open</span>' : ''}
        ${p.port ? `<span class="chip">:${p.port}</span>` : ''}
      </div>
      <div class="dim">created ${esc(fmtDate(p.createdAtMs))}</div>
      <div class="card-actions">
        ${p.onboarded
          ? `<button class="btn" data-act="focus" data-id="${esc(p.id)}">Show orb</button>`
          : `<button class="btn" data-act="setup" data-id="${esc(p.id)}">Finish setup</button>`}
        <button class="btn danger" data-act="delete" data-id="${esc(p.id)}" ${canDelete ? '' : 'disabled title="Cannot delete the last presence"'}>Delete</button>
      </div>`;
    grid.append(card);
  }
}

document.getElementById('presence-grid').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const { act, id } = btn.dataset;
  if (act === 'focus') { await api.focusPresence(id); }
  else if (act === 'setup') { await api.openOnboarding(id); }
  else if (act === 'delete') {
    const p = presences.find((x) => x.id === id);
    if (!confirm(`Delete "${p?.nickname || id}"? This permanently removes its data (memory, surfaces, sessions, notifications).`)) return;
    btn.disabled = true;
    const res = await api.deletePresence(id);
    if (!res?.ok) alert(res?.error || 'Delete failed');
    refresh();
  }
});

// Electron's BrowserWindow has no window.prompt() — it returns null and the
// dialog never shows. Use an inline modal instead.
const modal = document.getElementById('new-modal');
const modalInput = document.getElementById('new-name');
document.getElementById('new-presence').addEventListener('click', () => {
  modalInput.value = 'New presence';
  modal.classList.remove('hidden');
  modalInput.focus();
  modalInput.select();
});
document.getElementById('new-cancel').addEventListener('click', () => modal.classList.add('hidden'));
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
modalInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('new-confirm').click(); }
  if (e.key === 'Escape') modal.classList.add('hidden');
});
document.getElementById('new-confirm').addEventListener('click', async () => {
  const nickname = modalInput.value.trim() || 'New presence';
  const confirm = document.getElementById('new-confirm');
  confirm.disabled = true; confirm.textContent = 'Creating…';
  const res = await api.createPresence(nickname);
  confirm.disabled = false; confirm.textContent = 'Create';
  if (!res?.ok) { alert(res?.error || 'Create failed'); return; }
  modal.classList.add('hidden');
  // Its onboarding window opens automatically; refresh the list.
  refresh();
});

// ---- Onboarding details ----
function fillPresenceSelect(sel, selectedId) {
  sel.innerHTML = '';
  for (const p of presences) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.nickname || p.displayName || p.id;
    if (p.id === selectedId) o.selected = true;
    sel.append(o);
  }
}

async function populateOnboardingSelect() {
  const sel = document.getElementById('onboarding-presence');
  const prev = sel.value;
  fillPresenceSelect(sel, prev || presences[0]?.id);
  await loadOnboardingForm();
}

async function loadOnboardingForm() {
  const id = document.getElementById('onboarding-presence').value;
  if (!id) return;
  const p = presences.find((x) => x.id === id);
  document.getElementById('f-nickname').value = p?.nickname || '';
  document.getElementById('f-tagname').value = p?.tagName || '';
  const res = await api.getPresenceConfig(id).catch(() => null);
  const cfg = res?.config || {};
  document.getElementById('f-ainame').value = cfg.aiName || '';
  document.getElementById('f-personality').value = cfg.personality || '';
  document.getElementById('onboarding-status').textContent = '';
}

document.getElementById('onboarding-presence').addEventListener('change', loadOnboardingForm);

document.getElementById('onboarding-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('onboarding-presence').value;
  if (!id) return;
  const status = document.getElementById('onboarding-status');
  status.textContent = 'Saving…'; status.className = 'status';
  // Registry identity (nickname/tag) + config (aiName/personality) are two stores.
  const r1 = await api.updatePresence(id, {
    nickname: document.getElementById('f-nickname').value.trim(),
    tagName: document.getElementById('f-tagname').value.trim(),
  });
  const r2 = await api.updatePresenceConfig(id, {
    aiName: document.getElementById('f-ainame').value.trim(),
    personality: document.getElementById('f-personality').value.trim(),
  });
  if (r1?.ok && r2?.ok) { status.textContent = 'Saved.'; status.className = 'status ok'; }
  else { status.textContent = (r1?.error || r2?.error || 'Save failed'); }
  refresh();
});

document.getElementById('reopen-onboarding').addEventListener('click', async () => {
  const id = document.getElementById('onboarding-presence').value;
  if (id) await api.openOnboarding(id);
});

// ---- Logs ----
async function populateLogsSelect() {
  const sel = document.getElementById('logs-presence');
  fillPresenceSelect(sel, sel.value || presences[0]?.id);
}

document.getElementById('logs-presence').addEventListener('change', loadLogs);
document.getElementById('logs-kind').addEventListener('change', loadLogs);

async function loadLogs() {
  const id = document.getElementById('logs-presence').value;
  const kind = document.getElementById('logs-kind').value;
  const body = document.getElementById('logs-body');
  if (!id) { body.innerHTML = '<div class="empty">Select a presence.</div>'; return; }
  body.innerHTML = '<div class="empty">Loading…</div>';
  const res = await api.getPresenceData(id, kind).catch(() => null);
  if (!res?.ok) { body.innerHTML = `<div class="empty">${esc(res?.error || 'No data')}</div>`; return; }

  if (kind === 'summary') {
    const c = res.counts || {};
    body.innerHTML = `<div class="summary-grid">
      <div class="stat"><div class="n">${c.sessions ?? 0}</div><div class="l">Sessions</div></div>
      <div class="stat"><div class="n">${c.surfaces ?? 0}</div><div class="l">Surfaces</div></div>
      <div class="stat"><div class="n">${c.notifications ?? 0}</div><div class="l">Notifications</div></div>
      <div class="stat"><div class="n">${c.cronJobs ?? 0}</div><div class="l">Cron jobs</div></div>
    </div>`;
    return;
  }

  const entries = res.entries || [];
  if (!entries.length) { body.innerHTML = '<div class="empty">No log entries yet.</div>'; return; }
  body.innerHTML = entries.slice().reverse().map((ev) => {
    const ts = ev.ts ? new Date(ev.ts).toLocaleTimeString() : '';
    const kind = ev.kind || ev.event || ev.raw ? (ev.kind || ev.event || 'raw') : '—';
    const detail = ev.raw || JSON.stringify(Object.fromEntries(Object.entries(ev).filter(([k]) => !['ts', 'kind'].includes(k))));
    return `<div class="log-row"><span class="t">${esc(ts)}</span><span class="k">${esc(kind)}</span><span class="d" title="${esc(detail)}">${esc(detail)}</span></div>`;
  }).join('');
}

// ---- BOR credits & spend ----
// The detailed dashboard (graphs, history, controls) lives in the bor-web app,
// opened in the system browser. Here we just list presences with a deep-link to
// each one's spend view, plus a buy/manage button.
// Local dev (BOR_SIXTH_LOCAL=1) → bor-web on :3000; otherwise the deployed URL.
const WEB_BASE = (window.borMainApp && window.borMainApp.webBase) || 'https://app.bedofroses.os';

function openWeb(pathAndQuery) {
  const url = `${WEB_BASE}${pathAndQuery}`;
  if (api.openExternal) api.openExternal(url);
  else window.open(url, '_blank');
}

document.getElementById('open-credits').addEventListener('click', () => openWeb('/credits'));

function renderSpend() {
  const grid = document.getElementById('spend-grid');
  if (!grid) return;
  if (!presences.length) {
    grid.innerHTML = '<div class="empty">No presences yet.</div>';
    return;
  }
  grid.innerHTML = '';
  for (const p of presences) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-top">
        <span class="card-mono">${esc(monogram(p.nickname || p.displayName))}</span>
        <div>
          <div class="card-title">${esc(p.nickname || p.displayName || 'Untitled')}</div>
          <div class="card-tag">${esc(p.tagName || p.id)}</div>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn" data-act="spend" data-id="${esc(p.id)}">View spend →</button>
      </div>`;
    grid.append(card);
  }
}

document.getElementById('spend-grid')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act="spend"]');
  if (!btn) return;
  openWeb(`/dashboard?presence=${encodeURIComponent(btn.dataset.id)}`);
});

// Live refresh when presences change (create/delete/update from main).
api.onPresencesChanged?.(() => {
  refresh();
  if (activeTab === 'onboarding') populateOnboardingSelect();
  if (activeTab === 'logs') populateLogsSelect();
  if (activeTab === 'spend') renderSpend();
});

refresh();
