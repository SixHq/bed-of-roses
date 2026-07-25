// Presence registry — the host-level, shared catalog of presences.
//
// Each presence is an isolated BOR instance: its own runtime process, its own
// os-data root (os-data/presences/<id>/), its own port, and its own orb window.
// This module is the single source of truth for "which presences exist". It is
// pure Node (no electron require) so the migration + CRUD logic is unit-testable.
//
// Registry file: os-data/presences.json (host-global, NOT inside any presence).
// Per-presence data roots: os-data/presences/<id>/
//
// SAFETY: deletePresence only ever removes a dir under os-data/presences/.

const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const OS_DATA = path.join(ROOT, 'os-data');
const PRESENCES_DIR = path.join(OS_DATA, 'presences');
const REGISTRY_PATH = path.join(OS_DATA, 'presences.json');

// Legacy single-tenant dirs that get moved into the default presence on first
// multi-presence boot. host.json / wallpaper stay host-global.
const LEGACY_DATA_ENTRIES = [
  'config.json', 'surfaces', 'memory', 'cron', 'notifications',
  'logs', 'images', 'files', 'system-app-layout.json',
];

function newId() {
  return `p-${randomUUID().slice(0, 8)}`;
}

function dataDirFor(id) {
  return path.join(PRESENCES_DIR, id);
}

function emptyRegistry() {
  return { version: 1, defaultId: null, presences: {} };
}

async function readRegistry() {
  try {
    const parsed = JSON.parse(await fs.readFile(REGISTRY_PATH, 'utf8'));
    if (parsed && typeof parsed === 'object' && parsed.presences && typeof parsed.presences === 'object') {
      return { version: 1, defaultId: parsed.defaultId || null, presences: parsed.presences };
    }
  } catch { /* missing/corrupt → empty */ }
  return emptyRegistry();
}

// Serialize all registry writes through a single chained promise. Multiple
// startRuntime() calls + orb 'moved' handlers all run in the SAME host process,
// so a shared-pid temp file + interleaved read-modify-write previously clobbered
// each other → corrupt JSON (`}}`) and lost updates (two presences on port 7777).
// The queue guarantees one atomic write completes before the next begins, and a
// unique temp name per write means no two writes ever share a temp path.
let _writeChain = Promise.resolve();
async function writeRegistryNow(registry) {
  await fs.mkdir(OS_DATA, { recursive: true });
  const tmp = `${REGISTRY_PATH}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(registry, null, 2), 'utf8');
  await fs.rename(tmp, REGISTRY_PATH);
  return registry;
}

async function writeRegistry(registry) {
  const run = () => writeRegistryNow(registry);
  _writeChain = _writeChain.then(run, run);
  return _writeChain;
}

/**
 * Atomic read-modify-write under the serialization queue. `fn(reg)` mutates the
 * registry in place (or returns a new one); the whole read→mutate→write runs
 * with no other registry write interleaving, so concurrent create/update/delete
 * calls in the same host process can't lose each other's changes. Returns
 * whatever `fn` returns (after the write lands).
 */
async function mutateRegistry(fn) {
  let result;
  const run = async () => {
    const reg = await readRegistry();
    result = await fn(reg);
    await writeRegistryNow(reg);
    return reg;
  };
  _writeChain = _writeChain.then(run, run);
  await _writeChain;
  return result;
}

function cleanStr(value, fallback = '') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function normalizeEntry(input = {}) {
  const id = cleanStr(input.id) || newId();
  const nickname = cleanStr(input.nickname || input.displayName, 'Bed of Roses').slice(0, 60);
  return {
    id,
    nickname,
    displayName: cleanStr(input.displayName, nickname).slice(0, 60),
    tagName: cleanStr(input.tagName, nickname).slice(0, 40),
    createdAtMs: Number.isFinite(input.createdAtMs) ? input.createdAtMs : null,
    dataDir: dataDirFor(id),
    port: Number.isInteger(input.port) ? input.port : null,
    anchor: cleanStr(input.anchor, 'bottom-right'),
    bounds: input.bounds && typeof input.bounds === 'object' ? input.bounds : null,
    onboarded: input.onboarded === true,
  };
}

/** Ensure the registry exists; returns it. Does NOT migrate (see migrate.cjs caller). */
async function ensureRegistry() {
  if (!existsSync(REGISTRY_PATH)) await writeRegistry(emptyRegistry());
  return readRegistry();
}

async function listPresences() {
  const reg = await readRegistry();
  return Object.values(reg.presences);
}

async function getPresence(id) {
  const reg = await readRegistry();
  return reg.presences[id] || null;
}

/**
 * Create a presence: register it + create its data dir. Does NOT spawn a
 * runtime or window (that's the host's job). `nowMs` passed in so the pure
 * module never calls Date.now() itself.
 */
async function createPresence(input = {}, { nowMs = null } = {}) {
  const entry = normalizeEntry(input);
  if (entry.createdAtMs == null) entry.createdAtMs = nowMs;
  await fs.mkdir(entry.dataDir, { recursive: true });
  return mutateRegistry((reg) => {
    reg.presences[entry.id] = entry;
    if (!reg.defaultId) reg.defaultId = entry.id;
    return entry;
  });
}

async function updatePresence(id, patch = {}) {
  return mutateRegistry((reg) => {
    const existing = reg.presences[id];
    if (!existing) throw new Error(`unknown presence: ${id}`);
    // dataDir is derived, never patchable.
    const { dataDir, id: _ignoreId, ...rest } = patch;
    const merged = { ...existing, ...rest, id, dataDir: dataDirFor(id) };
    reg.presences[id] = merged;
    return merged;
  });
}

/**
 * Delete a presence: remove its registry entry and (optionally) its data dir.
 * Returns the removed entry so the caller can kill its runtime/window first.
 * SAFETY: only rm a path under os-data/presences/.
 */
async function deletePresence(id, { removeData = true } = {}) {
  const entry = await mutateRegistry((reg) => {
    const found = reg.presences[id];
    if (!found) return null;
    delete reg.presences[id];
    if (reg.defaultId === id) reg.defaultId = Object.keys(reg.presences)[0] || null;
    return found;
  });
  if (!entry) return null;
  if (removeData) {
    const target = path.resolve(entry.dataDir || dataDirFor(id));
    if (path.dirname(target) === PRESENCES_DIR && target.startsWith(PRESENCES_DIR + path.sep)) {
      await fs.rm(target, { recursive: true, force: true }).catch(() => {});
    }
  }
  return entry;
}

// Rewrite a surface manifest's doc/state/html rel-paths so they point into the
// presence root (os-data/presences/<id>/surfaces/...) instead of the legacy
// top-level os-data/surfaces/... — keeps LLM-facing paths resolvable.
async function rewriteSurfaceManifestPaths(surfacesDir, presenceId) {
  let entries;
  try { entries = await fs.readdir(surfacesDir, { withFileTypes: true }); }
  catch { return; }
  const prefix = `os-data/presences/${presenceId}/surfaces/`;
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const manifestPath = path.join(surfacesDir, e.name, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    try {
      const m = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      for (const key of ['docPath', 'statePath', 'htmlPath']) {
        if (typeof m[key] === 'string') {
          m[key] = m[key].replace(/^os-data\/(?:surfaces|widgets)\//, prefix);
        }
      }
      await fs.writeFile(manifestPath, JSON.stringify(m, null, 2), 'utf8');
    } catch { /* skip unreadable manifest */ }
  }
}

/**
 * One-time migration: fold the legacy single-tenant os-data into a default
 * presence at os-data/presences/<defaultId>/, and write the registry. Idempotent
 * — the marker is the existence of presences.json (mirrors the
 * migrateWidgetsToSurfaces pattern in server/index.js). Returns the registry.
 *
 * MUST run in the host BEFORE any runtime spawns (nothing should be reading the
 * old paths mid-move).
 *
 * @param {Object} opts
 * @param {string} [opts.defaultName]  aiName from legacy config, for the nickname
 * @param {boolean} [opts.onboarded]   whether legacy config was fully onboarded
 * @param {number} [opts.nowMs]
 * @param {Function} [opts.log]
 */
async function migrateToPresences({ defaultName = 'Bed of Roses', onboarded = false, nowMs = null, log = () => {} } = {}) {
  if (existsSync(REGISTRY_PATH)) return readRegistry();

  await fs.mkdir(PRESENCES_DIR, { recursive: true });
  const id = newId();
  const dataDir = dataDirFor(id);
  await fs.mkdir(dataDir, { recursive: true });

  // Move any legacy top-level data into the default presence root.
  let moved = 0;
  for (const name of LEGACY_DATA_ENTRIES) {
    const src = path.join(OS_DATA, name);
    if (!existsSync(src)) continue;
    const dest = path.join(dataDir, name);
    if (existsSync(dest)) continue; // never clobber
    try {
      await fs.rename(src, dest);
      moved += 1;
    } catch {
      // Cross-device or busy → copy + remove fallback.
      try {
        await fs.cp(src, dest, { recursive: true });
        await fs.rm(src, { recursive: true, force: true });
        moved += 1;
      } catch (err) {
        log(`presences: could not migrate ${name}: ${err.message}`);
      }
    }
  }

  await rewriteSurfaceManifestPaths(path.join(dataDir, 'surfaces'), id);

  const entry = normalizeEntry({ id, nickname: defaultName, displayName: defaultName, tagName: defaultName, createdAtMs: nowMs, onboarded });
  const reg = { version: 1, defaultId: id, presences: { [id]: entry } };
  await writeRegistry(reg);
  log(`presences: migrated legacy os-data → default presence ${id} (${moved} entr${moved === 1 ? 'y' : 'ies'} moved)`);
  return reg;
}

module.exports = {
  readRegistry, writeRegistry, ensureRegistry, migrateToPresences,
  listPresences, getPresence, createPresence, updatePresence, deletePresence,
  rewriteSurfaceManifestPaths,
  newId, dataDirFor,
  _paths: { ROOT, OS_DATA, PRESENCES_DIR, REGISTRY_PATH, LEGACY_DATA_ENTRIES },
};
