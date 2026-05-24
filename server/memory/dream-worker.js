// Background dream worker.
//
// Scheduler-triggered dreams run here so consolidation/action LLM calls never
// occupy the main server event loop. The main process can terminate this worker
// whenever an interactive chat starts; undreamed session files stay unmarked
// until a dream completes successfully.

import { appendFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, normalize, resolve } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

import { autoBannerThumbnail } from '../ai.js';
import { validateWidgetCode } from '../validator.js';
import { runDream } from './dream.js';
import { logEvent as logSessionEvent } from './sessions.js';

const ROOT = resolve(workerData?.cwd || process.cwd());

const DATA_DIR = join(ROOT, 'os-data');
const WIDGETS_DIR = join(DATA_DIR, 'widgets');
const CONFIG_PATH = join(DATA_DIR, 'config.json');
const AUDIT_LOG = join(DATA_DIR, 'logs', 'audit.jsonl');
const VALID_WIDGET_SIZES = new Set(['1x1', '2x1', '1x2', '2x2', '2x3', '3x2']);
const SURFACE_DOC_FILE = 'surface.md';
const SURFACE_STATE_FILE = 'state.json';
const SURFACE_STATE_MAX_BYTES = 256 * 1024;

function requestError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function validateSurfaceId(id) {
  const value = String(id || '');
  const safe = normalize(value).replace(/^(\.\.[/\\])+/, '');
  if (safe !== value || !/^(widget|app)-[\w.-]+$/.test(value)) {
    throw requestError('Invalid widget id', 400);
  }
  return safe;
}

function surfaceDocRelPath(id) {
  return `os-data/widgets/${validateSurfaceId(id)}/${SURFACE_DOC_FILE}`;
}

function surfaceStateRelPath(id) {
  return `os-data/widgets/${validateSurfaceId(id)}/${SURFACE_STATE_FILE}`;
}

function surfaceDocAbsPath(id) {
  return join(WIDGETS_DIR, validateSurfaceId(id), SURFACE_DOC_FILE);
}

function surfaceStateAbsPath(id) {
  return join(WIDGETS_DIR, validateSurfaceId(id), SURFACE_STATE_FILE);
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  if (value === undefined) throw requestError('operation value is required', 400);
  return JSON.parse(JSON.stringify(value));
}

async function atomicWriteFile(path, contents) {
  const tmp = `${path}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await writeFile(tmp, contents, 'utf8');
  await rename(tmp, path);
}

function jsonPointerTokens(path = '') {
  const pointer = String(path || '').trim();
  if (!pointer) return [];
  if (!pointer.startsWith('/')) throw requestError('state path must be a JSON Pointer such as /entries/0', 400);
  return pointer.slice(1).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function nextContainerFor(token) {
  return token === '-' || /^\d+$/.test(token) ? [] : {};
}

function pointerParent(root, tokens, { create = false } = {}) {
  let node = root;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = tokens[i];
    const nextToken = tokens[i + 1];
    if (Array.isArray(node)) {
      if (token === '-') throw requestError('state path cannot use - before the final segment', 400);
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0 || index > node.length) throw requestError(`invalid array index in state path: ${token}`, 400);
      if (node[index] === undefined) {
        if (!create || index !== node.length) throw requestError(`state path does not exist: /${tokens.slice(0, i + 1).join('/')}`, 404);
        node[index] = nextContainerFor(nextToken);
      }
      node = node[index];
    } else if (isPlainObject(node)) {
      if (!(token in node)) {
        if (!create) throw requestError(`state path does not exist: /${tokens.slice(0, i + 1).join('/')}`, 404);
        node[token] = nextContainerFor(nextToken);
      }
      node = node[token];
    } else {
      throw requestError(`state path parent is not a container: /${tokens.slice(0, i + 1).join('/')}`, 400);
    }
  }
  return { parent: node, key: tokens[tokens.length - 1] };
}

function readPointer(root, path = '') {
  const tokens = jsonPointerTokens(path);
  let node = root;
  for (const token of tokens) {
    if (Array.isArray(node)) {
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0 || index >= node.length) throw requestError(`state path does not exist: ${path}`, 404);
      node = node[index];
    } else if (isPlainObject(node)) {
      if (!(token in node)) throw requestError(`state path does not exist: ${path}`, 404);
      node = node[token];
    } else {
      throw requestError(`state path does not exist: ${path}`, 404);
    }
  }
  return node;
}

function deepMerge(target, patch) {
  const base = isPlainObject(target) ? target : {};
  for (const [key, value] of Object.entries(patch || {})) {
    if (isPlainObject(value) && isPlainObject(base[key])) deepMerge(base[key], value);
    else base[key] = cloneJson(value);
  }
  return base;
}

function applyStateOp(state, op) {
  if (!op || typeof op !== 'object') throw requestError('each state operation must be an object', 400);
  const kind = String(op.op || '').trim().toLowerCase();
  const path = String(op.path || '');
  if (!['add', 'replace', 'remove', 'merge'].includes(kind)) throw requestError(`unsupported state operation: ${op.op}`, 400);
  const tokens = jsonPointerTokens(path);
  if (tokens.length > 1 && isPlainObject(state) && Object.keys(state).length && !(tokens[0] in state)) {
    const keys = Object.keys(state).slice(0, 12).join(', ');
    throw requestError(`state root does not contain "${tokens[0]}"; existing keys: ${keys}. Read the surface schema and mutate an existing top-level key instead of inventing a new nested collection.`, 400);
  }

  if (tokens.length === 0) {
    if (kind === 'remove') return {};
    if (kind === 'merge') {
      if (!isPlainObject(op.value)) throw requestError('merge value must be a JSON object', 400);
      return deepMerge(state, op.value);
    }
    if (!isPlainObject(op.value)) throw requestError('root state must remain a JSON object', 400);
    return cloneJson(op.value);
  }

  if (kind === 'merge') {
    if (!isPlainObject(op.value)) throw requestError('merge value must be a JSON object', 400);
    const { parent, key } = pointerParent(state, tokens, { create: true });
    if (Array.isArray(parent)) {
      const index = key === '-' ? parent.length : Number(key);
      if (!Number.isInteger(index) || index < 0 || index > parent.length) throw requestError(`invalid array index in state path: ${key}`, 400);
      if (parent[index] === undefined) parent[index] = {};
      parent[index] = deepMerge(parent[index], op.value);
    } else if (isPlainObject(parent)) {
      parent[key] = deepMerge(parent[key], op.value);
    } else {
      throw requestError('merge parent must be an object or array', 400);
    }
    return state;
  }

  const { parent, key } = pointerParent(state, tokens, { create: kind === 'add' });
  if (Array.isArray(parent)) {
    const index = key === '-' ? parent.length : Number(key);
    if (!Number.isInteger(index) || index < 0 || index > parent.length) throw requestError(`invalid array index in state path: ${key}`, 400);
    if (kind === 'remove') {
      if (index >= parent.length) throw requestError(`state path does not exist: ${path}`, 404);
      parent.splice(index, 1);
    } else if (kind === 'replace') {
      if (index >= parent.length) throw requestError(`state path does not exist: ${path}`, 404);
      parent[index] = cloneJson(op.value);
    } else {
      parent.splice(index, 0, cloneJson(op.value));
    }
    return state;
  }
  if (!isPlainObject(parent)) throw requestError('state path parent must be an object or array', 400);
  if (kind === 'remove') {
    if (!(key in parent)) throw requestError(`state path does not exist: ${path}`, 404);
    delete parent[key];
  } else if (kind === 'replace') {
    if (!(key in parent)) throw requestError(`state path does not exist: ${path}`, 404);
    parent[key] = cloneJson(op.value);
  } else {
    parent[key] = cloneJson(op.value);
  }
  return state;
}

function migrateConfig(cfg) {
  if (!cfg) return cfg;
  if (cfg.providers && typeof cfg.providers === 'object') return cfg;
  const providers = {};
  if (cfg.apiKey && cfg.provider) {
    providers[cfg.provider] = {
      apiKey: cfg.apiKey,
      model: cfg.model || undefined,
    };
  }
  return {
    aiName: cfg.aiName,
    avatarStyle: cfg.avatarStyle,
    avatarColor: cfg.avatarColor,
    avatarHair: cfg.avatarHair,
    avatarGender: cfg.avatarGender,
    baseTheme: cfg.baseTheme || null,
    wallpaper: cfg.wallpaper || null,
    decorations: Array.isArray(cfg.decorations) ? cfg.decorations : [],
    theme: cfg.theme || null,
    personality: cfg.personality,
    defaultProvider: cfg.provider || null,
    providers,
  };
}

async function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return null;
  const raw = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  const migrated = migrateConfig(raw);
  if (migrated && migrated !== raw) await writeFile(CONFIG_PATH, JSON.stringify(migrated, null, 2));
  return migrated;
}

async function saveConfig(cfg) {
  await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

function publicConfig(cfg) {
  if (!cfg) return null;
  const providers = {};
  for (const [id, entry] of Object.entries(cfg.providers || {})) {
    if (!entry) continue;
    providers[id] = {
      configured: Boolean(entry.apiKey) || Boolean(entry.baseUrl),
      hasApiKey: Boolean(entry.apiKey),
      model: entry.model || null,
      baseUrl: entry.baseUrl || null,
    };
  }
  return {
    aiName: cfg.aiName || null,
    avatarStyle: cfg.avatarStyle || null,
    avatarColor: cfg.avatarColor || null,
    avatarHair: cfg.avatarHair || null,
    avatarGender: cfg.avatarGender || null,
    baseTheme: cfg.baseTheme || null,
    wallpaper: cfg.wallpaper || null,
    decorations: Array.isArray(cfg.decorations) ? cfg.decorations : [],
    theme: cfg.theme || null,
    personality: cfg.personality || null,
    defaultProvider: cfg.defaultProvider || null,
    providers,
  };
}

function mergeConfig(existing, body) {
  if (body.reset) {
    return { aiName: null, avatarStyle: null, avatarColor: null, avatarHair: null, avatarGender: null, defaultProvider: null, providers: {}, decorations: [] };
  }
  const ex = existing || { providers: {} };
  const next = {
    ...ex,
    aiName: 'aiName' in body ? body.aiName : ex.aiName,
    avatarStyle: 'avatarStyle' in body ? body.avatarStyle : ex.avatarStyle,
    avatarColor: 'avatarColor' in body ? body.avatarColor : ex.avatarColor,
    avatarHair: 'avatarHair' in body ? body.avatarHair : ex.avatarHair,
    avatarGender: 'avatarGender' in body ? body.avatarGender : ex.avatarGender,
    baseTheme: 'baseTheme' in body ? body.baseTheme : ex.baseTheme,
    wallpaper: 'wallpaper' in body ? body.wallpaper : ex.wallpaper,
    decorations: 'decorations' in body ? body.decorations : ex.decorations,
    theme: 'theme' in body ? body.theme : ex.theme,
    personality: 'personality' in body ? body.personality : ex.personality,
    defaultProvider: 'defaultProvider' in body ? body.defaultProvider : ex.defaultProvider,
    providers: { ...(ex.providers || {}) },
  };
  if (body.providers && typeof body.providers === 'object') {
    for (const [id, entry] of Object.entries(body.providers)) {
      if (entry === null) {
        delete next.providers[id];
        if (next.defaultProvider === id) next.defaultProvider = null;
      } else if (entry && typeof entry === 'object') {
        const prev = next.providers[id] || {};
        next.providers[id] = {
          apiKey: 'apiKey' in entry ? (entry.apiKey || prev.apiKey || null) : prev.apiKey || null,
          model: 'model' in entry ? entry.model : prev.model,
          baseUrl: 'baseUrl' in entry ? entry.baseUrl : prev.baseUrl,
        };
      }
    }
  }
  if (!next.defaultProvider) {
    const firstConfigured = Object.entries(next.providers || {}).find(([, p]) => p && (p.apiKey || p.baseUrl));
    if (firstConfigured) next.defaultProvider = firstConfigured[0];
  }
  return next;
}

async function audit(entry) {
  await mkdir(dirname(AUDIT_LOG), { recursive: true });
  await appendFile(AUDIT_LOG, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
}

function defaultSurfaceDoc(manifest = {}) {
  const kind = manifest.kind === 'app' ? 'app' : 'widget';
  const name = manifest.name || (kind === 'app' ? 'Untitled App' : 'Untitled Widget');
  const id = manifest.id || '<unknown>';
  const created = manifest.createdAt || new Date().toISOString();
  const prompt = String(manifest.sourcePrompt || '').trim();
  return `# ${name}

## Surface
- Kind: ${kind}
- ID: ${id}
- Source prompt: ${prompt || 'Not recorded.'}

## Purpose
This documentation was created by the background dream worker. Preserve the existing behavior and expand it deliberately.

## Existing Features
- Review \`widget.html\` before changing behavior.
- Preserve existing state stored in \`state.json\`.

## Design Guidelines
- Honor the active Bed of Roses theme and the current visual style already present in the surface.
- Preserve responsive behavior, loading states, empty states, and error states unless explicitly redesigning them.

## Data And State
- Persist user data through the widget/app bridge with \`getState\` and \`setState\`.
- The main LLM and dream cycle may perform CRUD on this data through the surface data protocol tools. Keep the state schema stable and additive.
- Do not use browser storage APIs.

## Update Rules
- Fetch and read this document before updating any part of the ${kind}.
- Updates must expand, repair, or improve the existing ${kind}; do not delete features or overwrite style direction unless the user explicitly asks.
- After every update, replace this file with a complete updated document covering features, design rules, state, bridge calls, loading/error states, limitations, and changelog.

## Changelog
- ${created}: Initial surface created.
`;
}

function normalizeSurfaceDoc(doc, manifest = {}) {
  const text = String(doc || '').trim();
  return (text || defaultSurfaceDoc(manifest)).trim() + '\n';
}

async function ensureSurfaceDoc(id, manifest = null) {
  const safe = validateSurfaceId(id);
  const docPath = surfaceDocAbsPath(safe);
  if (!existsSync(docPath)) {
    const dir = join(WIDGETS_DIR, safe);
    const m = manifest || JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
    await writeFile(docPath, defaultSurfaceDoc({ ...m, id: safe }), 'utf8');
  }
  return surfaceDocRelPath(safe);
}

async function listWidgets() {
  const out = [];
  const entries = await readdir(WIDGETS_DIR, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const manifestPath = join(WIDGETS_DIR, e.name, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      manifest.id = manifest.id || e.name;
      if (!manifest.thumbnail) {
        manifest.thumbnail = autoBannerThumbnail({
          name: manifest.name,
          icon: manifest.icon,
          size: manifest.size,
        });
      }
      manifest.docPath = await ensureSurfaceDoc(manifest.id || e.name, manifest);
      manifest.statePath = surfaceStateRelPath(manifest.id || e.name);
      out.push(manifest);
    } catch {
      // Ignore corrupted surfaces.
    }
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  return out;
}

async function saveWidget({ name, icon, thumbnail, size, html, sourcePrompt, kind = 'widget', doc }) {
  const validation = validateWidgetCode(html);
  if (!validation.ok) throw requestError(`Widget code rejected: ${validation.reason}`, 400);

  const surfaceKind = kind === 'app' ? 'app' : 'widget';
  const id = `${surfaceKind}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const dir = join(WIDGETS_DIR, id);
  await mkdir(dir, { recursive: true });

  const manifest = {
    id,
    kind: surfaceKind,
    name: name || (surfaceKind === 'app' ? 'Untitled App' : 'Untitled Widget'),
    icon: icon || 'shapes',
    thumbnail: thumbnail || null,
    size: surfaceKind === 'app' ? '1x1' : (VALID_WIDGET_SIZES.has(size) ? size : '2x2'),
    sourcePrompt: sourcePrompt || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 0,
  };
  manifest.docPath = surfaceDocRelPath(id);
  manifest.statePath = surfaceStateRelPath(id);

  await writeFile(join(dir, 'widget.html'), html);
  await writeFile(join(dir, SURFACE_DOC_FILE), normalizeSurfaceDoc(doc, manifest), 'utf8');
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await writeFile(join(dir, SURFACE_STATE_FILE), '{}');
  return manifest;
}

async function deleteWidget(id) {
  validateSurfaceId(id);
  await rm(join(WIDGETS_DIR, id), { recursive: true, force: true });
}

async function renameWidget(id, name) {
  validateSurfaceId(id);
  const manifestPath = join(WIDGETS_DIR, id, 'manifest.json');
  if (!existsSync(manifestPath)) throw requestError('Widget not found', 404);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.name = (name || '').slice(0, 30) || manifest.name;
  manifest.docPath = await ensureSurfaceDoc(id, manifest);
  manifest.statePath = surfaceStateRelPath(id);
  manifest.updatedAt = new Date().toISOString();
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  return manifest;
}

async function editWidget(id, patch) {
  validateSurfaceId(id);
  const dir = join(WIDGETS_DIR, id);
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) throw requestError('Widget not found', 404);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  if (patch.html) {
    const validation = validateWidgetCode(patch.html);
    if (!validation.ok) throw requestError(`Widget code rejected: ${validation.reason}`, 400);
    await writeFile(join(dir, 'widget.html'), patch.html);
  }
  if (patch.name) manifest.name = String(patch.name).slice(0, 40);
  if (patch.icon) manifest.icon = String(patch.icon);
  if ('thumbnail' in patch) manifest.thumbnail = patch.thumbnail || null;
  if (manifest.kind === 'app') manifest.size = '1x1';
  else if (patch.size && VALID_WIDGET_SIZES.has(patch.size)) manifest.size = patch.size;
  if ('doc' in patch) await writeFile(join(dir, SURFACE_DOC_FILE), normalizeSurfaceDoc(patch.doc, { ...manifest, id }), 'utf8');
  else await ensureSurfaceDoc(id, manifest);
  manifest.docPath = surfaceDocRelPath(id);
  manifest.statePath = surfaceStateRelPath(id);
  manifest.updatedAt = new Date().toISOString();
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  return manifest;
}

async function readSurfaceData(id) {
  const safe = validateSurfaceId(id);
  const dir = join(WIDGETS_DIR, safe);
  if (!existsSync(dir)) throw requestError('Widget not found', 404);
  const path = surfaceStateAbsPath(safe);
  if (!existsSync(path)) return {};
  const raw = await readFile(path, 'utf8');
  if (!raw.trim()) return {};
  const state = JSON.parse(raw);
  return isPlainObject(state) ? state : {};
}

async function writeSurfaceData(id, state) {
  const safe = validateSurfaceId(id);
  if (!isPlainObject(state)) throw requestError('surface state root must be a JSON object', 400);
  const serialized = JSON.stringify(state);
  if (serialized.length > SURFACE_STATE_MAX_BYTES) throw requestError(`state too large (>${SURFACE_STATE_MAX_BYTES}B)`, 413);
  await atomicWriteFile(surfaceStateAbsPath(safe), serialized);
  return { bytes: serialized.length };
}

async function mutateSurfaceData(id, operations) {
  const ops = Array.isArray(operations) ? operations : [operations];
  if (ops.length === 0) throw requestError('at least one state operation is required', 400);
  if (ops.length > 50) throw requestError('too many state operations; max 50', 400);
  let state = cloneJson(await readSurfaceData(id));
  for (const op of ops) state = applyStateOp(state, op);
  const saved = await writeSurfaceData(id, state);
  return { state, bytes: saved.bytes, opCount: ops.length };
}

function buildWorkerCtx({ lastUserMessage } = {}) {
  const readFiles = new Set();
  const readSurfaceIds = new Set();
  let uxUiStrictGuidelinesRequested = false;
  let uxUiStrictGuidelinesLoaded = false;
  let uxUiStrictGuidelinesTheme = null;
  const normalizeCtxPath = (p) => normalize(resolve(ROOT, String(p || '')));

  return {
    saveWidget,
    editWidget,
    deleteWidget,
    renameWidget,
    listSurfaces: listWidgets,
    readSurfaceData,
    async readSurfaceDataPath(id, path = '') {
      return readPointer(await readSurfaceData(id), path);
    },
    mutateSurfaceData,
    markSurfaceDataRead(id) {
      readSurfaceIds.add(validateSurfaceId(id));
    },
    hasReadSurfaceData(id) {
      try { return readSurfaceIds.has(validateSurfaceId(id)); } catch { return false; }
    },
    surfaceDocPath: surfaceDocRelPath,
    surfaceStatePath: surfaceStateRelPath,
    ensureSurfaceDoc,
    markReadFile(absPath) {
      readFiles.add(normalize(String(absPath || '')));
    },
    hasReadFile(path) {
      const raw = String(path || '');
      return readFiles.has(normalize(raw)) || readFiles.has(normalizeCtxPath(raw));
    },
    markUxUiStrictGuidelinesRequested({ themeId } = {}) {
      // Same-pass gate (see server/index.js for full rationale): the gate
      // flips open immediately so create/update tags emitted in the same
      // pass as the guidelines fetch succeed.
      uxUiStrictGuidelinesRequested = true;
      uxUiStrictGuidelinesLoaded = true;
      uxUiStrictGuidelinesTheme = themeId || uxUiStrictGuidelinesTheme;
    },
    commitUxUiStrictGuidelines() {
      uxUiStrictGuidelinesRequested = false;
    },
    hasUxUiStrictGuidelines() {
      return uxUiStrictGuidelinesLoaded;
    },
    uxUiStrictGuidelinesTheme() {
      return uxUiStrictGuidelinesTheme;
    },
    loadConfig,
    saveConfig,
    mergeConfig,
    publicConfig,
    logSessionEvent,
    audit,
    autoBannerThumbnail,
    projectRoot: ROOT,
    lastUserMessage: lastUserMessage || '',
  };
}

async function main() {
  try {
    const result = await runDream({
      loadConfig,
      reason: workerData?.reason || 'background',
      ctxBuilder: workerData?.enableActions ? () => buildWorkerCtx({ lastUserMessage: '[dream-worker]' }) : null,
    });
    parentPort?.postMessage({ type: 'result', result });
  } catch (error) {
    parentPort?.postMessage({ type: 'error', reason: error.message || String(error) });
  }
}

main();
