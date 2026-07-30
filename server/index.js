// Layer 2 — System Bridge
// HTTP server that serves the display shell, proxies LLM calls, and persists
// widgets/config/audit logs to disk. Stdlib only — no npm install required.

import http from 'node:http';
import { readFile, writeFile, mkdir, readdir, stat, rm, appendFile, rename, realpath, lstat, cp } from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import { extname, join, resolve, normalize, relative, basename, dirname, sep, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';

import { handleChatStream, autoBannerThumbnail } from './ai.js';
import { handleGetState, handleSetState, handleSurfaceLlm, handleSurfaceImageGen, handleSurfaceWebSearch, handleSurfaceWebFetch } from './surface-host.js';
import { IMAGES_DIR } from './tools/images.js';
import { logEvent as logSessionEvent } from './memory/sessions.js';
import {
  saveConversation,
  listConversations,
  getConversation,
  deleteConversation,
  clearConversations,
} from './memory/conversations.js';
import * as surfaceRegistry from './memory/surfaces.js';
// Dreams are disabled for now because background consolidation was interrupting
// normal chat streams. Re-enable this import with the scheduler block below.
// import { cancelBackgroundDream, startDreamScheduler } from './memory/dream.js';
import { validateWidgetCode } from './validator.js';
import { ALL_PROVIDERS, getProvider, publicCatalog } from './providers/index.js';
import { USER_DOWNLOADS_DIR, USER_PROFILE_DIR, ensureBrowserDirs, resolveBrowserExecutable } from './runtime/browser.js';
import { getConnectivityStatus, startConnectivityMonitor } from './connectivity.js';
import { detectBrowserUse, invalidateBrowserUseCache } from './runtime/browser-use.js';
import { getBorMcpPath, readBorMcpServerNames } from './runtime/mcp.js';
import {
  listConnectors,
  connectConnector,
  disconnectConnector,
  startConnectorOauth,
  pollConnectorOauth,
  listComposioApps,
  startComposioAppOauth,
  pollComposioAppOauth,
  openConnectorSigninBrowser,
  publicConnectorsProjection,
} from './runtime/connectors.js';
import { CronService } from './cron/service.js';
import {
  addNotification,
  clearNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  removeNotification,
} from './notifications.js';

const PORT = Number(process.env.PORT || 7777);
const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const SHELL_DIR = join(ROOT, 'shell');
// DATA_DIR is the per-presence data root (BOR_DATA_DIR), defaulting to the
// repo's os-data when unset. ROOT stays the source-tree anchor (shell serving,
// reserved-path write guards, exec cwd). Imported from paths.js so every
// module agrees on the same root.
import { DATA_DIR } from './protocol/paths.js';
const WIDGETS_DIR = join(DATA_DIR, 'widgets');
// Phase 1 shortcuts refactor: new storage path. The migration step
// (migrateWidgetsToSurfaces below) populates this on first boot from
// the legacy widgets/ dir. P1B will flip the rest of the file to read
// from SURFACES_DIR; for now WIDGETS_DIR is still the live reference.
const SURFACES_DIR = join(DATA_DIR, 'surfaces');
const SURFACES_MIGRATION_MARKER = join(SURFACES_DIR, '.migrated-from-widgets');
const FILES_DIR = join(DATA_DIR, 'files');
const DEVICE_HOME_DIR = homedir();
const SYSTEM_APP_LAYOUT_PATH = join(DATA_DIR, 'system-app-layout.json');
const CONFIG_PATH = join(DATA_DIR, 'config.json');
const AUDIT_LOG = join(DATA_DIR, 'logs', 'audit.jsonl');
const VALID_WIDGET_SIZES = new Set(['1x1', '2x1', '1x2', '2x2', '2x3', '3x2']);
const DEFAULT_WIDGET_SIZE = '2x1';
const SURFACE_DOC_FILE = 'surface.md';
const SURFACE_STATE_FILE = 'state.json';
const SURFACE_STATE_MAX_BYTES = 256 * 1024;
const DEFAULT_FILE_ROOT = 'device';
const LEGACY_FILE_ROOT = 'bor';
const BOR_DEFAULT_DIRS = ['Desktop', 'Documents', 'Downloads', 'Pictures'];
const DEVICE_PLACE_DIRS = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Movies', 'Music'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * One-time migration from os-data/widgets/ to os-data/surfaces/. Runs on
 * every boot but does real work only on first boot (idempotent via the
 * .migrated-from-widgets marker file inside SURFACES_DIR).
 *
 * Steps:
 *   1. If marker exists with `deletedLegacy:true`, fully done — return.
 *   2. If marker exists with `deletedLegacy:false`, this is the second
 *      boot — delete the legacy widgets/ dir (safety-net retention is
 *      over), bump marker.
 *   3. If no marker and no widgets/ → fresh install. Just create
 *      surfaces/ and write the marker.
 *   4. If no marker and widgets/ exists → first migration: copy each
 *      id-dir, rewrite manifests (kind:widget → kind:shortcut +
 *      presentation:shortcut + bubbleHeight + legacySize; kind:app →
 *      presentation:app), rewrite docPath/statePath strings to point at
 *      surfaces/, copy widget_registry.json → surface_registry.json.
 *      Leave widgets/ in place — it gets deleted on the next boot.
 */
const SIZE_TO_BUBBLE_HEIGHT = { '2x05': 160, '2x1': 240, '2x2': 280, '2x3': 320, '1x2': 320, '3x2': 240 };
async function migrateWidgetsToSurfaces() {
  let marker = null;
  try {
    marker = JSON.parse(await readFile(SURFACES_MIGRATION_MARKER, 'utf8'));
  } catch { /* marker absent — fall through */ }

  if (marker && marker.deletedLegacy) return;

  if (marker && !marker.deletedLegacy) {
    if (existsSync(WIDGETS_DIR)) {
      await rm(WIDGETS_DIR, { recursive: true, force: true });
      console.log('[migrate] removed legacy os-data/widgets/ on second boot');
    }
    await writeFile(SURFACES_MIGRATION_MARKER, JSON.stringify({ ...marker, deletedLegacy: true, deletedLegacyAt: new Date().toISOString() }, null, 2));
    return;
  }

  await mkdir(SURFACES_DIR, { recursive: true });

  if (!existsSync(WIDGETS_DIR)) {
    await writeFile(SURFACES_MIGRATION_MARKER, JSON.stringify({ migratedAt: new Date().toISOString(), reason: 'fresh-install', deletedLegacy: true }, null, 2));
    return;
  }

  const entries = await readdir(WIDGETS_DIR, { withFileTypes: true });
  let migrated = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const srcDir = join(WIDGETS_DIR, id);
    const destDir = join(SURFACES_DIR, id);
    await cp(srcDir, destDir, { recursive: true, force: true });

    const manifestPath = join(destDir, 'manifest.json');
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      const isApp = manifest.kind === 'app';
      manifest.presentation = isApp ? 'app' : 'shortcut';
      if (!isApp) {
        manifest.kind = 'shortcut';
        const size = manifest.size;
        manifest.bubbleHeight = SIZE_TO_BUBBLE_HEIGHT[size] ?? 240;
        if (size) manifest.legacySize = size;
        delete manifest.size;
      }
      if (typeof manifest.docPath === 'string') manifest.docPath = manifest.docPath.replace(/^os-data\/widgets\//, 'os-data/surfaces/');
      if (typeof manifest.statePath === 'string') manifest.statePath = manifest.statePath.replace(/^os-data\/widgets\//, 'os-data/surfaces/');
      if (typeof manifest.htmlPath === 'string') manifest.htmlPath = manifest.htmlPath.replace(/^os-data\/widgets\//, 'os-data/surfaces/');
      manifest.migratedAt = new Date().toISOString();
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      migrated += 1;
    } catch (err) {
      console.warn(`[migrate] could not transform manifest for ${id}: ${err.message}`);
    }
  }

  const legacyRegistry = join(DATA_DIR, 'memory', 'widget_registry.json');
  const newRegistry = join(DATA_DIR, 'memory', 'surface_registry.json');
  if (existsSync(legacyRegistry) && !existsSync(newRegistry)) {
    await cp(legacyRegistry, newRegistry);
  }

  await writeFile(SURFACES_MIGRATION_MARKER, JSON.stringify({
    migratedAt: new Date().toISOString(),
    migratedCount: migrated,
    legacyDir: 'os-data/widgets',
    deletedLegacy: false,
  }, null, 2));
  console.log(`[migrate] copied ${migrated} surface(s) from os-data/widgets/ → os-data/surfaces/. Legacy dir retained until next boot.`);
}
await migrateWidgetsToSurfaces();

await mkdir(SURFACES_DIR, { recursive: true });
await mkdir(FILES_DIR, { recursive: true });
for (const dir of BOR_DEFAULT_DIRS) {
  await mkdir(join(FILES_DIR, dir), { recursive: true });
}
ensureBrowserDirs();
await mkdir(join(DATA_DIR, 'logs'), { recursive: true });
await mkdir(join(DATA_DIR, 'memory', 'sessions'), { recursive: true });
startConnectivityMonitor();

let activeChatStreams = 0;
let cronService = null;
// let lastChatActivityAt = 0;
// const DREAM_CHAT_COOLDOWN_MS = (() => {
//   const value = Number(process.env.BOR_DREAM_CHAT_COOLDOWN_MS);
//   if (Number.isFinite(value) && value >= 0) return Math.round(value);
//   return 5 * 60 * 1000;
// })();

async function audit(entry) {
  await appendFile(AUDIT_LOG, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
}

// Spawn a command, capture output, never throw — for permission probes/opens.
function runFileQuick(file, args, timeoutMs = 9000) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn(file, args, { timeout: timeoutMs });
    } catch (e) {
      resolve({ ok: false, stdout, stderr: e?.message || 'spawn failed', code: -1 });
      return;
    }
    child.stdout?.on('data', (b) => { stdout += b.toString('utf8'); });
    child.stderr?.on('data', (b) => { stderr += b.toString('utf8'); });
    child.on('error', (e) => resolve({ ok: false, stdout, stderr: e?.message || String(e), code: -1 }));
    child.on('close', (code) => resolve({ ok: code === 0, stdout, stderr, code }));
  });
}

// Computer-use needs two macOS permissions, both granted to the app that runs
// the CLIs (osascript / screencapture): Accessibility (System Events control)
// and Screen Recording (display capture). This probes their status — and the
// probes themselves trigger the first-run macOS prompts / add the app to the
// Privacy lists. Returns { accessibility, screenRecording }.
async function probeComputerUsePermissions() {
  if (process.platform !== 'darwin') {
    // Be honest off-mac: computer-use is gated off entirely (see
    // registry.js DARWIN_ONLY_TAGS), so nothing is "granted".
    return { supported: false, control: false, screenRecording: false, platform: process.platform, note: 'computer-use is macOS-only' };
  }
  // Control probe: computer_click runs `osascript -> tell System Events to ...`.
  // That needs BOTH Automation (authorization to send Apple events to System
  // Events; failure = -1743) and Accessibility (assistive access; failure =
  // -25211 / "not allowed assistive access"). This single call is the definitive
  // "can I control the Mac?" test; parse the error to say which one is missing.
  const ax = await runFileQuick('osascript', [
    '-e', 'tell application "System Events" to return name of first application process whose frontmost is true',
  ]);
  const axErr = `${ax.stderr}${ax.stdout}`;
  const control = ax.ok;
  let controlNeeds = null;
  if (!ax.ok) {
    if (/-1743|not authorized to send apple events/i.test(axErr)) controlNeeds = 'automation';
    else if (/-25211|assistive|accessibility|not allowed/i.test(axErr)) controlNeeds = 'accessibility';
    else controlNeeds = 'automation';
  }
  // Screen Recording: capture a tiny region; without permission the capture
  // produces no usable file (or errors). Best-effort signal.
  let screenRecording = false;
  const probePng = join(DATA_DIR, 'logs', `.perm-probe-${randomUUID()}.png`);
  try {
    const cap = await runFileQuick('screencapture', ['-x', '-R', '0,0,4,4', '-t', 'png', probePng], 12000);
    if (cap.ok) {
      try { const st = await stat(probePng); screenRecording = st.size > 256; } catch { screenRecording = false; }
    }
  } finally {
    try { await rm(probePng, { force: true }); } catch { /* ignore */ }
  }
  // cliclick (CGEvents) is the primary input path — it needs only Accessibility,
  // not Automation. If present, computer-use no longer requires the Apple-events
  // Automation grant that causes -1743.
  let cliclick = false;
  for (const p of ['/opt/homebrew/bin/cliclick', '/usr/local/bin/cliclick']) {
    const probe = await runFileQuick(p, ['-V'], 4000);
    if (probe.ok) { cliclick = true; break; }
  }
  if (!cliclick) {
    const which = await runFileQuick('which', ['cliclick'], 4000);
    cliclick = which.ok && !!which.stdout.trim();
  }

  return { control, controlNeeds, screenRecording, cliclick, platform: 'darwin' };
}

const MAC_SETTINGS_PANES = {
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  automation: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation',
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
};

function validateSurfaceId(id) {
  const value = String(id || '');
  const safe = normalize(value).replace(/^(\.\.[\/\\])+/, '');
  if (safe !== value || !/^(widget|app)-[\w.-]+$/.test(value)) {
    const err = new Error('Invalid widget id');
    err.statusCode = 400;
    throw err;
  }
  return safe;
}

// Rel-paths handed to the LLM are computed from the absolute SURFACES_DIR so
// they stay correct under a per-presence DATA_DIR. With no BOR_DATA_DIR set
// this yields the legacy `os-data/surfaces/<id>/...`; under a presence root it
// yields `os-data/presences/<id>/surfaces/...`. Either resolves correctly when
// the file handlers resolve against cwd=PROJECT_ROOT (= ROOT).
function surfaceDocRelPath(id) {
  return relative(ROOT, surfaceDocAbsPath(id)).split(sep).join('/');
}

function surfaceStateRelPath(id) {
  return relative(ROOT, surfaceStateAbsPath(id)).split(sep).join('/');
}

function surfaceHtmlRelPath(id) {
  return relative(ROOT, join(SURFACES_DIR, validateSurfaceId(id), 'widget.html')).split(sep).join('/');
}

function surfaceDocAbsPath(id) {
  return join(SURFACES_DIR, validateSurfaceId(id), SURFACE_DOC_FILE);
}

function surfaceStateAbsPath(id) {
  return join(SURFACES_DIR, validateSurfaceId(id), SURFACE_STATE_FILE);
}

function normalizeSurfaceDoc(doc, manifest = {}) {
  const text = String(doc || '').trim();
  return (text || defaultSurfaceDoc(manifest)).trim() + '\n';
}

function jsonPointerTokens(path = '') {
  const pointer = String(path || '').trim();
  if (!pointer) return [];
  if (!pointer.startsWith('/')) throw requestError('state path must be a JSON Pointer such as /entries/0', 400);
  return pointer.slice(1).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
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
  if (!['add', 'replace', 'remove', 'merge'].includes(kind)) {
    throw requestError(`unsupported state operation: ${op.op}`, 400);
  }
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

async function readSurfaceData(id) {
  const safe = validateSurfaceId(id);
  const dir = join(SURFACES_DIR, safe);
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
  if (serialized.length > SURFACE_STATE_MAX_BYTES) {
    throw requestError(`state too large (>${SURFACE_STATE_MAX_BYTES}B)`, 413);
  }
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
This documentation was backfilled for an existing ${kind}. Read this file before making any update, then preserve the current behavior and expand it deliberately.

## Existing Features
- Review \`widget.html\` before changing behavior; this legacy doc may not list every feature yet.
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
- After every update, replace this file with a complete updated document covering features, design rules, state, bridge calls, and changelog.

## Changelog
- ${created}: Initial surface created.
- ${new Date().toISOString()}: Documentation backfilled.
`;
}

async function ensureSurfaceDoc(id, manifest = null) {
  const safe = validateSurfaceId(id);
  const docPath = surfaceDocAbsPath(safe);
  if (!existsSync(docPath)) {
    const dir = join(SURFACES_DIR, safe);
    const m = manifest || JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
    await writeFile(docPath, defaultSurfaceDoc({ ...m, id: safe }), 'utf8');
  }
  return surfaceDocRelPath(safe);
}

/**
 * Build the per-request context that protocol handlers expect. Used by both
 * the /api/chat path AND the dream cycle's action phase, so any new IO bound
 * for the protocol layer only has to be added here once.
 */
function buildHandlerCtx({ lastUserMessage, signal } = {}) {
  const readFiles = new Set();
  const readSurfaceIds = new Set();
  let uxUiStrictGuidelinesRequested = false;
  let uxUiStrictGuidelinesLoaded = false;
  let uxUiStrictGuidelinesTheme = null;
  const normalizeCtxPath = (p) => normalize(resolve(ROOT, String(p || '')));
  return {
    saveWidget, editWidget, deleteWidget, renameWidget,
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
      // Flip the gate open immediately so any subsequent <create_widget>
      // / <create_app> / <update_*> in the SAME pass passes the check.
      // Previously this only set `requested=true` and the actual commit
      // happened at end-of-pass — which broke same-pass sequencing (model
      // emits guidelines + create together → create gets rejected even
      // though guidelines just ran). Models don't reliably honor the
      // "fetch guidelines and then stop" directive, so the gate has to be
      // permissive about ordering within a single pass.
      uxUiStrictGuidelinesRequested = true;
      uxUiStrictGuidelinesLoaded = true;
      uxUiStrictGuidelinesTheme = themeId || uxUiStrictGuidelinesTheme;
    },
    commitUxUiStrictGuidelines() {
      // End-of-pass commit is now a no-op — kept for backward compat with
      // any caller still invoking it. The gate flips open inside
      // markUxUiStrictGuidelinesRequested above.
      uxUiStrictGuidelinesRequested = false;
    },
    hasUxUiStrictGuidelines() {
      return uxUiStrictGuidelinesLoaded;
    },
    uxUiStrictGuidelinesTheme() {
      return uxUiStrictGuidelinesTheme;
    },
    loadConfig, saveConfig, mergeConfig, publicConfig,
    logSessionEvent,
    audit, autoBannerThumbnail,
    cronService,
    addNotification,
    projectRoot: ROOT,
    // Per-presence data root. Handlers that build absolute paths into the
    // presence's os-data (e.g. shortcut.js reading widget.html) must use this,
    // NOT projectRoot — under multi-presence the data lives at
    // os-data/presences/<id>/, while projectRoot stays the source tree.
    dataDir: DATA_DIR,
    lastUserMessage: lastUserMessage || '',
    signal,
  };
}

async function executeCronAgentTurn({ job, runId, signal }) {
  const cfg = await loadConfig();
  if (!cfg) throw new Error('No provider connected');
  const payloadMessage = job?.payload?.message || '';
  const prompt = [
    `[cron:${job.id}] ${job.name}`,
    '',
    'This is a scheduled background run. Execute the task now using the normal BOR tools.',
    'If there is a user-visible outcome, make it clear in <attempt_completion><result>...</result></attempt_completion>.',
    'Use <push_notification> only for additional important alerts; the scheduler will also notify the final result.',
    '',
    payloadMessage,
  ].join('\n');
  const ctx = buildHandlerCtx({
    lastUserMessage: prompt,
    signal,
  });
  const events = [];
  const recorded = await handleChatStream({
    config: cfg,
    messages: [{ role: 'user', content: prompt }],
    widgets: await listWidgets(),
    ctx,
    hostMode: 'v2',
    onEvent: ({ event, payload, ok }) => {
      events.push({ event, ok: ok !== false, payload });
      if (event === 'tool_error') {
        logSessionEvent('cron.tool.error', { jobId: job.id, runId, reason: payload?.reason });
      }
    },
  });
  const lastTaskDone = events.filter((entry) => entry.event === 'task_done').at(-1);
  const failed = events.find((entry) => entry.event === 'tool_error' && entry.ok === false);
  if (failed && !lastTaskDone) {
    throw new Error(failed.payload?.reason || 'scheduled task tool failed');
  }
  if (!String(recorded || '').trim()) {
    const lastSay = events.filter((entry) => entry.event === 'say').at(-1);
    throw new Error(lastSay?.payload?.text || 'scheduled task produced no assistant result');
  }
  return recorded;
}

async function handleCronAction(body = {}, sourceSurfaceId = null) {
  if (!cronService) throw new Error('cron service is not available');
  const action = String(body.action || '').trim().toLowerCase();
  if (!action) throw requestError('action required', 400);
  switch (action) {
    case 'status':
      return await cronService.status();
    case 'list':
      return { jobs: await cronService.list({ includeDisabled: body.includeDisabled === true }) };
    case 'get': {
      const id = String(body.id || body.jobId || '').trim();
      if (!id) throw requestError('id required', 400);
      const job = await cronService.get(id);
      if (!job) throw requestError(`unknown cron job id: ${id}`, 404);
      return { job };
    }
    case 'add': {
      const job = body.job && typeof body.job === 'object' ? body.job : body;
      return {
        job: await cronService.add({
          ...job,
          source: sourceSurfaceId ? 'surface' : (job.source || 'api'),
          sourceSurfaceId: sourceSurfaceId || job.sourceSurfaceId,
        }),
      };
    }
    case 'update': {
      const id = String(body.id || body.jobId || '').trim();
      if (!id) throw requestError('id required', 400);
      const patch = body.patch && typeof body.patch === 'object' ? body.patch : body;
      return { job: await cronService.update(id, patch) };
    }
    case 'remove': {
      const id = String(body.id || body.jobId || '').trim();
      if (!id) throw requestError('id required', 400);
      return await cronService.remove(id);
    }
    case 'run': {
      const id = String(body.id || body.jobId || '').trim();
      if (!id) throw requestError('id required', 400);
      const mode = body.mode === 'due' ? 'due' : 'force';
      return await cronService.run(id, mode);
    }
    default:
      throw requestError(`unknown cron action: ${action}`, 400);
  }
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function messageContentText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return part;
      if (part?.type === 'text') return part.text || '';
      return '';
    }).filter(Boolean).join('\n');
  }
  return String(content || '');
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

// --- MCP marketplace (Cline's hosted catalog — the same one Sixth uses) ------
const MCP_BASE_URL = process.env.BOR_MCP_MARKETPLACE_URL || 'https://api.cline.bot/v1/mcp';
const MCP_CATALOG_TTL_MS = 60 * 60 * 1000; // server-side cache so the page is instant
let _mcpCatalogCache = { at: 0, items: null };

function normalizeMcpItem(item = {}) {
  return {
    mcpId: item.mcpId || item.id || '',
    name: item.name || item.mcpId || 'Untitled',
    author: item.author || item.authorName || '',
    description: item.description || '',
    githubUrl: item.githubUrl || item.url || '',
    logoUrl: item.logoUrl || '',
    codiconIcon: item.codiconIcon || '',
    category: item.category || 'Other',
    tags: Array.isArray(item.tags) ? item.tags : [],
    requiresApiKey: !!item.requiresApiKey,
    isRecommended: !!item.isRecommended,
    githubStars: Number(item.githubStars || item.stars || 0),
    downloadCount: Number(item.downloadCount || item.downloads || 0),
  };
}

async function fetchJsonWithTimeout(url, opts = {}, ms = 12000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const resp = await fetch(url, { ...opts, signal: ac.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(t);
  }
}

async function getMcpMarketplaceCatalog({ refresh = false } = {}) {
  const now = Date.now();
  if (!refresh && _mcpCatalogCache.items && now - _mcpCatalogCache.at < MCP_CATALOG_TTL_MS) {
    return { items: _mcpCatalogCache.items, cachedAt: _mcpCatalogCache.at, stale: false };
  }
  try {
    const data = await fetchJsonWithTimeout(`${MCP_BASE_URL}/marketplace`, { headers: { Accept: 'application/json' } });
    const raw = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
    const items = raw.map(normalizeMcpItem).filter((i) => i.mcpId);
    _mcpCatalogCache = { at: now, items };
    return { items, cachedAt: now, stale: false };
  } catch (e) {
    // Serve stale cache on a network hiccup so the page never blanks out.
    if (_mcpCatalogCache.items) {
      return { items: _mcpCatalogCache.items, cachedAt: _mcpCatalogCache.at, stale: true, error: e.message };
    }
    return { items: [], cachedAt: 0, stale: true, error: e.message };
  }
}

// Build the LLM install task for one catalog entry (same shape Sixth kicks off),
// pointed at THIS presence's .bor/mcp.json instead of Sixth's settings path.
async function buildMcpInstallTask(mcpId) {
  let details;
  try {
    details = await fetchJsonWithTimeout(`${MCP_BASE_URL}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mcpId }),
    });
  } catch (e) {
    throw new Error(`could not fetch MCP install details: ${e.message}`);
  }
  if (!details || !details.githubUrl) throw new Error('invalid MCP download response (missing githubUrl)');
  const mcpPath = getBorMcpPath();
  const task = [
    `Install the MCP server "${details.name || mcpId}" from ${details.githubUrl}. Rules:`,
    `- This presence's MCP settings file is ${mcpPath}, JSON shaped as { "mcpServers": { "<name>": { ... } } }.`,
    `- FIRST read ${mcpPath} with <read_file> (if it does not exist, treat it as {"mcpServers":{}}) so you never overwrite an existing server.`,
    `- Add the new server under the exact key "${mcpId}".`,
    `- If it must be cloned/built/installed, make a folder under .bor/workspaces/ and run the commands with <execute_command> (git/npm/uv/pip as appropriate for this macOS bash shell).`,
    `- If it needs an API key or config value, wire it through the server's env and tell the user exactly which value to supply and where to get it.`,
    `- After writing ${mcpPath}, confirm the server is registered and, if possible, demonstrate one tool with <use_mcp_tool>.`,
    details.readmeContent ? `\nProject README:\n${String(details.readmeContent).slice(0, 12000)}` : '',
    details.llmsInstallationContent ? `\nInstallation notes:\n${String(details.llmsInstallationContent).slice(0, 8000)}` : '',
  ].filter(Boolean).join('\n');
  return {
    ok: true,
    mcpId,
    name: details.name || mcpId,
    githubUrl: details.githubUrl,
    requiresApiKey: !!details.requiresApiKey,
    configPath: mcpPath,
    task,
  };
}

// Pull the mcpIds the model chose out of its (possibly chatty) reply, validated
// against the real catalog so we never surface an invented id.
function extractMcpIds(text, items) {
  const valid = new Set(items.map((i) => i.mcpId));
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
  let parsed = tryParse(String(text || '').trim());
  if (!parsed) {
    const m = String(text || '').match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (m) parsed = tryParse(m[0]);
  }
  let ids = [];
  if (parsed) {
    const arr = Array.isArray(parsed) ? parsed
      : (Array.isArray(parsed.matches) ? parsed.matches : (Array.isArray(parsed.ids) ? parsed.ids : []));
    ids = arr.map((x) => (typeof x === 'string' ? x : (x && x.id))).filter(Boolean);
  }
  if (!ids.length) ids = [...valid].filter((id) => String(text || '').includes(id)); // fallback scan
  const seen = new Set();
  return ids.filter((id) => valid.has(id) && !seen.has(id) && seen.add(id)).slice(0, 30);
}

// Use the presence's configured provider to rank catalog servers for a need.
async function mcpAskAi(query) {
  const config = await loadConfig();
  const providerId = config?.defaultProvider;
  const provider = providerId ? getProvider(providerId) : null;
  const providerCfg = config?.providers?.[providerId];
  if (!provider || !providerCfg?.apiKey) throw new Error('No AI provider is configured — finish onboarding first.');

  const { items } = await getMcpMarketplaceCatalog({});
  if (!items.length) throw new Error('MCP catalog is unavailable right now.');

  const compact = items.map((i) => ({
    id: i.mcpId,
    name: i.name,
    category: i.category,
    tags: (i.tags || []).slice(0, 6),
    desc: String(i.description || '').slice(0, 160),
  }));
  const system = 'You match MCP (Model Context Protocol) servers to a user need. You are given a JSON array of servers (id, name, category, tags, desc) and the user request. Return ONLY a JSON object {"matches":["<id>", ...]} — the ids of the servers that genuinely satisfy the request, most relevant first, at most 24, and an empty array if none fit. Output JSON only: no prose, no markdown fences.';
  const userMsg = `User need: ${query}\n\nServers (JSON):\n${JSON.stringify(compact)}`;

  let text = '';
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(new Error('AI match timed out')), 30000);
  if (typeof timeout.unref === 'function') timeout.unref();
  try {
    for await (const chunk of provider.stream({
      apiKey: providerCfg.apiKey,
      model: providerCfg.model || provider.defaultModel,
      baseUrl: providerCfg.baseUrl,
      reasoning: providerCfg.reasoning || undefined,
      system,
      messages: [{ role: 'user', content: userMsg }],
      signal: ac.signal,
    })) {
      text += chunk;
      if (text.length > 6000) break;
    }
  } finally {
    clearTimeout(timeout);
  }
  return { query, matches: extractMcpIds(text, items) };
}

function requestError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function readBufferBody(req, maxBytes = 25 * 1024 * 1024) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error(`request too large; max ${maxBytes} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendFile(res, absPath, contentType = 'application/octet-stream', downloadName = null) {
  const headers = {
    'content-type': contentType,
    'x-content-type-options': 'nosniff',
  };
  if (downloadName) {
    headers['content-disposition'] = `attachment; filename="${String(downloadName).replace(/["\r\n]/g, '')}"`;
  }
  res.writeHead(200, headers);
  return createReadStream(absPath).pipe(res);
}

function safeName(name) {
  const value = String(name || '').trim();
  if (!value || value === '.' || value === '..' || /[\/\\]/.test(value)) {
    throw requestError('invalid name');
  }
  return value.slice(0, 180);
}

function fileRoots() {
  return {
    bor: {
      id: 'bor',
      label: 'BOR Home',
      base: FILES_DIR,
      kind: 'bor',
      writable: true,
      pinned: true,
    },
    device: {
      id: 'device',
      label: 'This Device',
      base: DEVICE_HOME_DIR,
      kind: 'device',
      writable: true,
      pinned: false,
    },
  };
}

function getFileRoot(rootId) {
  const normalized = String(rootId || DEFAULT_FILE_ROOT).trim().toLowerCase();
  const aliases = {
    files: 'bor',
    gbor: 'bor',
    home: 'device',
    user: 'device',
    local: 'device',
  };
  const id = aliases[normalized] || normalized;
  const root = fileRoots()[id];
  if (!root) throw requestError(`unknown file root: ${rootId}`);
  return root;
}

function isPathInside(base, target) {
  const rel = relative(base, target);
  return rel === '' || (rel && !rel.startsWith('..') && !isAbsolute(rel));
}

function absoluteFileAddress(absPath) {
  const normalized = normalize(absPath);
  const candidates = Object.values(fileRoots())
    .filter((root) => isPathInside(normalize(root.base), normalized))
    .sort((a, b) => b.base.length - a.base.length);
  const root = candidates[0];
  if (!root) return null;
  const rel = relative(root.base, normalized).split(sep).join('/');
  return { rootId: root.id, subpath: rel ? `/${rel}` : '/' };
}

function parseFileAddress(rawPath, { defaultRootId = DEFAULT_FILE_ROOT } = {}) {
  const text = String(rawPath || '').trim();
  if (!text) return { rootId: defaultRootId, subpath: '/' };

  // Be forgiving about browser/url plumbing that may accidentally prefix a
  // virtual root with one slash, e.g. "/device:" or "/device:/Documents".
  const virtualText = text.replace(/^\/(?=[a-z][a-z0-9_-]*:)/i, '');
  const virtual = virtualText.match(/^([a-z][a-z0-9_-]*):(\/.*)?$/i);
  if (virtual) {
    return {
      rootId: getFileRoot(virtual[1]).id,
      subpath: virtual[2] || '/',
    };
  }

  if (isAbsolute(text)) {
    const mapped = absoluteFileAddress(text);
    if (mapped) return mapped;
    // Backward compatibility: old Files-app paths were bare "/Documents"
    // values scoped to the BOR files home, not host-root paths.
    return { rootId: LEGACY_FILE_ROOT, subpath: text };
  }

  return { rootId: defaultRootId, subpath: `/${text}` };
}

function resolveFilePath(rawPath, opts = {}) {
  const parsed = parseFileAddress(rawPath, opts);
  const root = getFileRoot(parsed.rootId);
  const withoutLeading = String(parsed.subpath || '/').replace(/^[\\/]+/, '');
  const abs = resolve(root.base, normalize(withoutLeading || '.'));
  if (!isPathInside(root.base, abs)) {
    throw requestError(`path escapes ${root.label}`);
  }
  return { abs, root };
}

function publicFilePath(absPath, root) {
  const r = typeof root === 'string' ? getFileRoot(root) : root;
  const rel = relative(r.base, absPath).split(sep).join('/');
  return rel ? `${r.id}:/${rel}` : `${r.id}:/`;
}

function displayFilePath(absPath, root) {
  const rel = relative(root.base, absPath).split(sep).join('/');
  return rel ? `${root.label} / ${rel}` : root.label;
}

async function assertWithinFileRoot(location, { existing = true, parent = false } = {}) {
  const target = parent ? dirname(location.abs) : location.abs;
  const resolved = existing ? await realpath(target) : resolve(target);
  const root = await realpath(location.root.base);
  if (!isPathInside(root, resolved)) {
    throw requestError(`path escapes ${location.root.label}`);
  }
  return true;
}

async function directoryExists(absPath) {
  try {
    return (await stat(absPath)).isDirectory();
  } catch {
    return false;
  }
}

async function listFilePlaces() {
  const roots = fileRoots();
  const places = [
    {
      id: 'bor-home',
      name: 'BOR Home',
      label: 'BOR Home',
      path: 'bor:/',
      root: roots.bor.id,
      rootLabel: roots.bor.label,
      kind: roots.bor.kind,
      pinned: true,
    },
    {
      id: 'device-home',
      name: 'Home',
      label: basename(DEVICE_HOME_DIR) || 'Home',
      path: 'device:/',
      root: roots.device.id,
      rootLabel: roots.device.label,
      kind: roots.device.kind,
      pinned: false,
    },
  ];

  for (const name of DEVICE_PLACE_DIRS) {
    const abs = join(DEVICE_HOME_DIR, name);
    if (!(await directoryExists(abs))) continue;
    places.push({
      id: `device-${name.toLowerCase()}`,
      name,
      label: name,
      path: publicFilePath(abs, roots.device),
      root: roots.device.id,
      rootLabel: roots.device.label,
      kind: roots.device.kind,
      pinned: false,
    });
  }

  return places;
}

async function fileEntry(absPath, root, dirent = null) {
  const info = dirent ? await lstat(absPath) : await lstat(absPath);
  const kind = info.isDirectory() ? 'dir' : info.isFile() ? 'file' : 'other';
  return {
    name: basename(absPath),
    path: publicFilePath(absPath, root),
    root: root.id,
    kind,
    size: info.isFile() ? info.size : null,
    updatedAt: info.mtime.toISOString(),
  };
}

async function listFiles(rawPath = `${DEFAULT_FILE_ROOT}:/`) {
  const location = resolveFilePath(rawPath || `${DEFAULT_FILE_ROOT}:/`);
  await assertWithinFileRoot(location);
  const s = await stat(location.abs);
  if (!s.isDirectory()) throw requestError('path is not a directory');
  const entries = await readdir(location.abs, { withFileTypes: true });
  const items = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    try {
      items.push(await fileEntry(join(location.abs, entry.name), location.root, entry));
    } catch {
      // Permission races and broken symlinks should not make the directory
      // unreadable in the UI.
    }
  }
  items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return {
    root: location.root.id,
    rootLabel: location.root.label,
    path: publicFilePath(location.abs, location.root),
    displayPath: displayFilePath(location.abs, location.root),
    absolutePath: location.abs,
    writable: location.root.writable,
    places: await listFilePlaces(),
    items,
  };
}

function contentTypeFor(absPath) {
  const ext = extname(absPath).toLowerCase();
  return ({
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
  })[ext] || 'application/octet-stream';
}

function splitMultipart(buffer, boundary) {
  const marker = Buffer.from(`--${boundary}`);
  const parts = [];
  let offset = buffer.indexOf(marker);
  while (offset !== -1) {
    offset += marker.length;
    if (buffer[offset] === 45 && buffer[offset + 1] === 45) break;
    if (buffer[offset] === 13 && buffer[offset + 1] === 10) offset += 2;
    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), offset);
    if (headerEnd === -1) break;
    const next = buffer.indexOf(marker, headerEnd + 4);
    if (next === -1) break;
    const headers = buffer.subarray(offset, headerEnd).toString('latin1');
    let body = buffer.subarray(headerEnd + 4, next);
    if (body.length >= 2 && body[body.length - 2] === 13 && body[body.length - 1] === 10) {
      body = body.subarray(0, body.length - 2);
    }
    parts.push({ headers, body });
    offset = next;
  }
  return parts;
}

function parseMultipartUpload(req, buffer) {
  const contentType = req.headers['content-type'] || '';
  const match = String(contentType).match(/boundary=([^;]+)/i);
  if (!match) throw new Error('multipart boundary missing');
  const fields = {};
  const files = [];
  for (const part of splitMultipart(buffer, match[1].replace(/^"|"$/g, ''))) {
    const disposition = part.headers.match(/content-disposition:\s*form-data;([^\r\n]+)/i)?.[1] || '';
    const name = disposition.match(/name="([^"]+)"/i)?.[1];
    const filename = disposition.match(/filename="([^"]*)"/i)?.[1];
    if (!name) continue;
    if (filename) {
      files.push({ field: name, filename: safeName(filename), buffer: part.body });
    } else {
      fields[name] = part.body.toString('utf8');
    }
  }
  return { fields, files };
}

// --- Config: load, migrate, save, sanitize -------------------------------

/**
 * Migrate the old single-provider shape ({ apiKey, provider, model, ... }) to
 * the new multi-provider shape. Idempotent — runs once and rewrites the file.
 */
function migrateConfig(cfg) {
  if (!cfg) return cfg;
  // New shape already has `providers` object — leave it alone
  if (cfg.providers && typeof cfg.providers === 'object') return cfg;

  // Old shape: top-level apiKey/provider/model. Move into providers[provider].
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
    // Preserve connector entries written by runtime/connectors.js even when a
    // config file predates (or omits) the multi-provider shape.
    connectors: cfg.connectors && typeof cfg.connectors === 'object' ? cfg.connectors : {},
  };
}

async function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return null;
  const raw = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  const migrated = migrateConfig(raw);
  // Persist migration so we don't keep re-doing it
  if (migrated && migrated !== raw) {
    await writeFile(CONFIG_PATH, JSON.stringify(migrated, null, 2));
  }
  return migrated;
}

async function saveConfig(cfg) {
  await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

function sanitizeWidgetLayout(layout, existing = {}) {
  if (!layout || typeof layout !== 'object') return null;
  const x = Number('x' in layout ? layout.x : existing.x);
  const y = Number('y' in layout ? layout.y : existing.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const next = {
    x: Math.max(0, Math.min(10000, Math.round(x))),
    y: Math.max(0, Math.min(10000, Math.round(y))),
  };
  const width = Number('width' in layout ? layout.width : existing.width);
  const height = Number('height' in layout ? layout.height : existing.height);
  if (Number.isFinite(width)) next.width = Math.max(96, Math.min(4000, Math.round(width)));
  if (Number.isFinite(height)) next.height = Math.max(96, Math.min(4000, Math.round(height)));
  return next;
}

/**
 * Public, key-stripped projection of the config that the shell sees. We never
 * leak secrets; the shell only needs to know which providers have keys, what
 * model each is set to, and which one is the default.
 */
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
      reasoning: entry.reasoning || null,
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
    browserInstall: cfg.browserInstall || null,
    defaultProvider: cfg.defaultProvider || null,
    providers,
    // Secret-stripped: per connector only { connected, hasKey booleans, meta,
    // connectedAt } — never the saved field values.
    connectors: publicConnectorsProjection(cfg.connectors),
  };
}

const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
function sanitizeReasoning(value) {
  const v = String(value || '').trim().toLowerCase();
  return REASONING_EFFORTS.includes(v) ? v : null;
}

/**
 * Merge a partial update into the existing config. The shell can submit:
 *   - { aiName, avatarStyle, personality, defaultProvider }  ← top-level
 *   - { providers: { <id>: { apiKey, model, baseUrl } } }    ← per-provider
 *   - { reset: true }                                         ← clear everything
 * For provider updates, we preserve the existing apiKey if the body sends
 * an empty/undefined value, so the shell can update the model without
 * re-pasting the key.
 */
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
    // Pending AI-powered browser-use install, set by onboarding's final pane;
    // the presence clears it after kicking the install task off.
    browserInstall: 'browserInstall' in body ? (body.browserInstall === 'llm' ? 'llm' : null) : ex.browserInstall || null,
    defaultProvider: 'defaultProvider' in body ? body.defaultProvider : ex.defaultProvider,
    providers: { ...(ex.providers || {}) },
    connectors: { ...(ex.connectors || {}) },
  };
  if (body.providers && typeof body.providers === 'object') {
    for (const [id, entry] of Object.entries(body.providers)) {
      if (entry === null) {
        // Explicit deletion
        delete next.providers[id];
        if (next.defaultProvider === id) next.defaultProvider = null;
      } else if (entry && typeof entry === 'object') {
        const prev = next.providers[id] || {};
        next.providers[id] = {
          // Preserve apiKey if not provided
          apiKey: 'apiKey' in entry ? (entry.apiKey || prev.apiKey || null) : prev.apiKey || null,
          model: 'model' in entry ? entry.model : prev.model,
          baseUrl: 'baseUrl' in entry ? entry.baseUrl : prev.baseUrl,
          reasoning: 'reasoning' in entry ? sanitizeReasoning(entry.reasoning) : prev.reasoning || null,
        };
      }
    }
  }
  // Connectors map: same pattern as providers — null deletes, objects merge.
  // Field values overwrite only when non-empty so metadata can be updated
  // without re-pasting the key. (Normal writes go through runtime/connectors.js;
  // this path keeps POST /api/config coherent.)
  if (body.connectors && typeof body.connectors === 'object') {
    for (const [id, entry] of Object.entries(body.connectors)) {
      if (entry === null) {
        // Explicit deletion
        delete next.connectors[id];
      } else if (entry && typeof entry === 'object') {
        const prev = next.connectors[id] || {};
        const prevFields = prev.fields && typeof prev.fields === 'object' ? prev.fields : {};
        const bodyFields = entry.fields && typeof entry.fields === 'object'
          ? Object.fromEntries(
            Object.entries(entry.fields)
              .filter(([, value]) => typeof value === 'string' && value)
              .map(([key, value]) => [key, value]),
          )
          : {};
        next.connectors[id] = {
          fields: { ...prevFields, ...bodyFields },
          connectedAt: entry.connectedAt || prev.connectedAt || new Date().toISOString(),
          meta: entry.meta && typeof entry.meta === 'object' ? entry.meta : (prev.meta || {}),
        };
      }
    }
  }
  // If we just configured the first provider and no default is set, pick it
  if (!next.defaultProvider) {
    const firstConfigured = Object.entries(next.providers || {})
      .find(([, p]) => p && (p.apiKey || p.baseUrl));
    if (firstConfigured) next.defaultProvider = firstConfigured[0];
  }
  return next;
}

// --- System apps ----------------------------------------------------------

const SYSTEM_APPS = [
  {
    id: 'files',
    name: 'Files',
    icon: 'folder',
    size: '2x2',
    system: true,
    appType: 'files',
    thumbnail: '<!DOCTYPE html><html><head><style>body{margin:0;height:100%;padding:16px;box-sizing:border-box;background:transparent;color:#F5F1FF;font-family:Geist,system-ui;display:flex;flex-direction:column;justify-content:space-between}.label{font:10px Geist Mono,monospace;letter-spacing:.18em;color:rgba(245,241,255,.5);text-transform:uppercase}.folder{height:86px;border:1px solid rgba(245,241,255,.28);border-radius:12px;background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,.04));position:relative}.folder:before{content:"";position:absolute;left:12px;top:-16px;width:70px;height:24px;border:1px solid rgba(245,241,255,.28);border-bottom:0;border-radius:10px 10px 0 0;background:rgba(255,255,255,.10)}.title{font-family:Instrument Serif,Georgia,serif;font-style:italic;font-size:34px}</style></head><body><div class="label">/ DEVICE</div><div class="folder"></div><div class="title">Files</div></body></html>',
  },
  {
    id: 'browser',
    name: 'Browser',
    icon: 'globe',
    size: '2x1',
    system: true,
    appType: 'browser',
    thumbnail: '<!DOCTYPE html><html><head><style>body{margin:0;height:100%;padding:14px;box-sizing:border-box;background:transparent;color:#F5F1FF;font-family:Geist,system-ui;display:flex;flex-direction:column;justify-content:space-between}.bar{height:28px;border:1px solid rgba(245,241,255,.24);border-radius:999px;display:flex;align-items:center;padding:0 10px;color:rgba(245,241,255,.62);font:10px Geist Mono,monospace}.globe{align-self:flex-end;width:56px;height:56px;border:1px solid rgba(245,241,255,.34);border-radius:50%;box-shadow:inset 0 0 0 12px rgba(255,255,255,.04)}.title{font-family:Instrument Serif,Georgia,serif;font-style:italic;font-size:28px}</style></head><body><div class="bar">https://</div><div class="globe"></div><div class="title">Browser</div></body></html>',
  },
];

async function readSystemAppLayouts() {
  if (!existsSync(SYSTEM_APP_LAYOUT_PATH)) return {};
  try {
    const j = JSON.parse(await readFile(SYSTEM_APP_LAYOUT_PATH, 'utf8'));
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}

async function writeSystemAppLayouts(layouts) {
  await writeFile(SYSTEM_APP_LAYOUT_PATH, JSON.stringify(layouts, null, 2));
}

async function listSystemApps() {
  const layouts = await readSystemAppLayouts();
  return SYSTEM_APPS.map((app) => ({
    ...app,
    layout: sanitizeWidgetLayout(layouts[app.id]?.layout || layouts[app.id]) || null,
    size: VALID_WIDGET_SIZES.has(layouts[app.id]?.size) ? layouts[app.id].size : app.size,
  }));
}

async function updateSystemApp(id, patch) {
  const app = SYSTEM_APPS.find((entry) => entry.id === id);
  if (!app) {
    const err = new Error('System app not found');
    err.statusCode = 404;
    throw err;
  }
  const layouts = await readSystemAppLayouts();
  const previous = layouts[id] || {};
  const next = { ...previous };
  if (VALID_WIDGET_SIZES.has(patch.size)) next.size = patch.size;
  if (patch.layout) {
    const layout = sanitizeWidgetLayout(patch.layout, previous.layout || previous);
    if (layout) next.layout = layout;
  }
  layouts[id] = next;
  await writeSystemAppLayouts(layouts);
  return (await listSystemApps()).find((entry) => entry.id === id);
}

let browserProcess = null;
let browserLastLaunch = null;
let browserLastUrl = null;

function browserStatusPayload() {
  const resolved = resolveBrowserExecutable({ userFacing: true });
  const running = Boolean(browserProcess && browserProcess.exitCode == null && !browserProcess.killed);
  return {
    available: Boolean(resolved.ok),
    running,
    executablePath: resolved.ok ? resolved.executablePath : null,
    source: resolved.source,
    profilePath: USER_PROFILE_DIR,
    downloadsPath: USER_DOWNLOADS_DIR,
    lastLaunchAt: browserLastLaunch,
    lastUrl: browserLastUrl,
    error: resolved.ok ? null : resolved.error,
  };
}

function normalizeBrowserUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return 'https://www.google.com';
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) return `https://${raw}`;
  return `https://www.google.com/search?q=${encodeURIComponent(raw)}`;
}

function launchBrowser(url) {
  const resolved = resolveBrowserExecutable({ userFacing: true });
  if (!resolved.ok) {
    const err = new Error(resolved.error);
    err.statusCode = 503;
    throw err;
  }
  ensureBrowserDirs();
  const targetUrl = normalizeBrowserUrl(url);
  const args = [
    `--user-data-dir=${USER_PROFILE_DIR}`,
    `--download-default-directory=${USER_DOWNLOADS_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--new-window',
    targetUrl,
  ];
  browserProcess = spawn(resolved.executablePath, args, {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
  });
  browserProcess.unref();
  browserLastLaunch = new Date().toISOString();
  browserLastUrl = targetUrl;
  return browserStatusPayload();
}

async function closeBrowser() {
  if (browserProcess && browserProcess.exitCode == null && !browserProcess.killed) {
    try {
      if (process.platform === 'win32') browserProcess.kill('SIGTERM');
      else process.kill(-browserProcess.pid, 'SIGTERM');
    } catch {
      try { browserProcess.kill('SIGTERM'); } catch { /* ignore */ }
    }
  }
  browserProcess = null;
  return browserStatusPayload();
}

// --- Widgets -------------------------------------------------------------

async function listWidgets() {
  const out = [];
  const entries = await readdir(SURFACES_DIR, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const manifestPath = join(SURFACES_DIR, e.name, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      manifest.id = manifest.id || e.name;
      // Backfill missing thumbnails with a designed auto-banner so legacy
      // widgets don't render as a giant lone emoji on a void. We attach in
      // memory only — the on-disk manifest stays whatever it was.
      if (!manifest.thumbnail) {
        manifest.thumbnail = autoBannerThumbnail({
          name: manifest.name,
          icon: manifest.icon,
          size: manifest.size,
        });
      }
      manifest.docPath = await ensureSurfaceDoc(manifest.id || e.name, manifest);
      manifest.statePath = surfaceStateRelPath(manifest.id || e.name);
      manifest.htmlPath = surfaceHtmlRelPath(manifest.id || e.name);
      out.push(manifest);
    } catch { /* ignore corrupted widget */ }
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  return out;
}

async function saveWidget({ name, icon, thumbnail, size, html, sourcePrompt, kind = 'widget', doc, bubbleHeight }) {
  const validation = validateWidgetCode(html);
  if (!validation.ok) {
    const err = new Error(`Widget code rejected: ${validation.reason}`);
    err.statusCode = 400;
    throw err;
  }

  // Kind discriminator: 'app' (full-screen Mac window) or 'shortcut' (bubble
  // iframe card). Legacy 'widget' is accepted by the legacy no-op shim only
  // and migrates to 'shortcut' on load. IDs use the historical prefix
  // (widget- / app-) so existing references in conversation memory keep
  // resolving; the presentation field is the new behaviour switch.
  const surfaceKind = kind === 'app' ? 'app' : 'shortcut';
  const idPrefix = surfaceKind === 'app' ? 'app' : 'widget';
  const id = `${idPrefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const dir = join(SURFACES_DIR, id);
  await mkdir(dir, { recursive: true });

  const manifest = {
    id,
    kind: surfaceKind,
    presentation: surfaceKind,
    name: name || (surfaceKind === 'app' ? 'Untitled App' : 'Untitled Shortcut'),
    icon: icon || 'shapes',
    thumbnail: thumbnail || null,  // inline SVG / inline HTML / image URL; null → auto banner
    sourcePrompt: sourcePrompt || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 0,
  };
  if (surfaceKind === 'app') {
    manifest.size = '1x1';
  } else {
    const clamped = Number(bubbleHeight);
    manifest.bubbleHeight = Number.isFinite(clamped) ? Math.max(160, Math.min(600, Math.round(clamped))) : 280;
  }
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
  await rm(join(SURFACES_DIR, id), { recursive: true, force: true });
}

async function renameWidget(id, name) {
  validateSurfaceId(id);
  const manifestPath = join(SURFACES_DIR, id, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error('Widget not found');
  const m = JSON.parse(await readFile(manifestPath, 'utf8'));
  m.name = (name || '').slice(0, 30) || m.name;
  m.docPath = await ensureSurfaceDoc(id, m);
  m.statePath = surfaceStateRelPath(id);
  m.updatedAt = new Date().toISOString();
  await writeFile(manifestPath, JSON.stringify(m, null, 2));
  return m;
}

/**
 * Mutate an existing widget in place. Any subset of name/icon/thumbnail/
 * size/html may be passed; missing fields are preserved. New HTML is
 * validated before it touches disk; if it fails, nothing is changed.
 * Returns the updated manifest.
 */
async function editWidget(id, patch) {
  validateSurfaceId(id);
  const dir = join(SURFACES_DIR, id);
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    const err = new Error('Widget not found');
    err.statusCode = 404;
    throw err;
  }
  const m = JSON.parse(await readFile(manifestPath, 'utf8'));

  if (patch.html) {
    const validation = validateWidgetCode(patch.html);
    if (!validation.ok) {
      const err = new Error(`Widget code rejected: ${validation.reason}`);
      err.statusCode = 400;
      throw err;
    }
    await writeFile(join(dir, 'widget.html'), patch.html);
  }

  if (patch.name)      m.name = String(patch.name).slice(0, 40);
  if (patch.icon)      m.icon = String(patch.icon);
  if ('thumbnail' in patch) m.thumbnail = patch.thumbnail || null;
  if (m.kind === 'app') m.size = '1x1';
  else if (patch.size && VALID_WIDGET_SIZES.has(patch.size)) m.size = patch.size;
  if ('bubbleHeight' in patch && m.kind !== 'app') {
    const val = Number(patch.bubbleHeight);
    if (Number.isFinite(val)) m.bubbleHeight = Math.max(160, Math.min(600, Math.round(val)));
  }
  if (patch.layout) {
    const layout = sanitizeWidgetLayout(patch.layout, m.layout);
    if (layout) m.layout = m.kind === 'app' ? { x: layout.x, y: layout.y } : layout;
  }
  if ('doc' in patch) {
    await writeFile(join(dir, SURFACE_DOC_FILE), normalizeSurfaceDoc(patch.doc, { ...m, id }), 'utf8');
  } else {
    await ensureSurfaceDoc(id, m);
  }
  m.docPath = surfaceDocRelPath(id);
  m.statePath = surfaceStateRelPath(id);
  m.updatedAt = new Date().toISOString();

  await writeFile(manifestPath, JSON.stringify(m, null, 2));
  return m;
}

// (Tool dispatch lives in server/protocol/handlers/* — see registry.js.)

// --- Static + widget host -----------------------------------------------

async function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const requested = normalize(join(SHELL_DIR, urlPath));
  if (!requested.startsWith(SHELL_DIR)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  if (!existsSync(requested)) {
    res.writeHead(404); return res.end('Not found');
  }
  const s = await stat(requested);
  if (s.isDirectory()) {
    res.writeHead(404); return res.end('Not found');
  }

  const ext = extname(requested).toLowerCase();
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  createReadStream(requested).pipe(res);
}

async function serveWidgetFile(req, res) {
  const match = req.url.match(/^\/widgets\/([^/]+)\/widget\.html$/);
  if (!match) { res.writeHead(404); return res.end(); }
  const id = match[1];
  const path = join(SURFACES_DIR, id, 'widget.html');
  if (!existsSync(path)) { res.writeHead(404); return res.end(); }

  const html = await readFile(path, 'utf8');
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store, max-age=0',
    'content-security-policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src * data: blob:",
      "connect-src 'self' https:",
      "frame-ancestors 'self'",
    ].join('; '),
    'x-content-type-options': 'nosniff',
  });
  res.end(html);
}

// --- HTTP -----------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, 'http://localhost');
    const url = req.url.split('?')[0];

    // --- Provider catalog (no secrets) ---
    if (url === '/api/providers' && req.method === 'GET') {
      // Echo the presence id this runtime serves so the v2 host can verify it
      // reached the RIGHT runtime (not an orphan from a prior session or
      // Electron's own network helper squatting on the port).
      return sendJson(res, 200, { providers: publicCatalog(), presenceId: process.env.BOR_PRESENCE_ID || null });
    }

    // browser-use detection — used by the onboarding install step and any
    // future settings UI. `?refresh=1` bypasses the 60s cache so users
    // re-checking after running `pipx install browser-use` see the new state.
    if (url.startsWith('/api/browser-use/status') && req.method === 'GET') {
      const refresh = /[?&]refresh=1\b/.test(url);
      if (refresh) invalidateBrowserUseCache();
      const status = await detectBrowserUse({ forceRefresh: refresh });
      return sendJson(res, 200, status);
    }

    // --- Config ---
    if (url === '/api/config' && req.method === 'GET') {
      return sendJson(res, 200, { config: publicConfig(await loadConfig()) });
    }

    if (url === '/api/config' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const existing = await loadConfig();
      const next = mergeConfig(existing, body);
      await saveConfig(next);
      const fields = Object.keys(body);
      // Don't leak provider ids of newly-set keys; just count
      await audit({ kind: 'config.update', fields });
      return sendJson(res, 200, { config: publicConfig(next) });
    }

    // --- Connectors (onboarding: "Connect Bed of Roses to your daily life") ---
    if (url === '/api/connectors' && req.method === 'GET') {
      const refresh = parsedUrl.searchParams.get('refresh') === '1';
      return sendJson(res, 200, { connectors: await listConnectors({ refresh }) });
    }

    if (url === '/api/connectors/browser/signin' && req.method === 'POST') {
      const result = await openConnectorSigninBrowser();
      await audit({ kind: 'connector.signin-browser', ok: result.ok });
      return sendJson(res, 200, result);
    }

    // Dynamic Composio app catalog + per-slug OAuth. Connected apps persist
    // as `composio_<slug>` connectors and reuse the generic connector routes
    // below for status + DELETE.
    if (url === '/api/connectors/composio/apps' && req.method === 'GET') {
      return sendJson(res, 200, await listComposioApps());
    }

    {
      const appOauthStart = url.match(/^\/api\/connectors\/composio\/apps\/([\w-]+)\/oauth\/start$/);
      if (appOauthStart && req.method === 'POST') {
        const slug = appOauthStart[1].toLowerCase();
        const result = await startComposioAppOauth(slug);
        await audit({ kind: 'connector.oauth.start', id: `composio_${slug}`, ok: result.ok });
        const { statusCode, ...payload } = result;
        return sendJson(res, statusCode || 200, payload);
      }

      const appOauthStatus = url.match(/^\/api\/connectors\/composio\/apps\/([\w-]+)\/oauth\/status$/);
      if (appOauthStatus && req.method === 'GET') {
        const slug = appOauthStatus[1].toLowerCase();
        const result = await pollComposioAppOauth(slug, parsedUrl.searchParams.get('pollToken') || '');
        if (result.justConnected) await audit({ kind: 'connector.connect', id: `composio_${slug}`, method: 'oauth' });
        return sendJson(res, 200, { status: result.status, detail: result.detail });
      }
    }

    {
      const oauthStart = url.match(/^\/api\/connectors\/([\w-]+)\/oauth\/start$/);
      if (oauthStart && req.method === 'POST') {
        const id = oauthStart[1];
        const result = await startConnectorOauth(id);
        await audit({ kind: 'connector.oauth.start', id, ok: result.ok });
        const { statusCode, ...payload } = result;
        return sendJson(res, statusCode || 200, payload);
      }

      const oauthStatus = url.match(/^\/api\/connectors\/([\w-]+)\/oauth\/status$/);
      if (oauthStatus && req.method === 'GET') {
        const id = oauthStatus[1];
        const result = await pollConnectorOauth(id, parsedUrl.searchParams.get('pollToken') || '');
        if (result.justConnected) await audit({ kind: 'connector.connect', id, method: 'oauth' });
        return sendJson(res, 200, { status: result.status, detail: result.detail });
      }

      const connectorMatch = url.match(/^\/api\/connectors\/([\w-]+)$/);
      if (connectorMatch && req.method === 'POST') {
        const id = connectorMatch[1];
        const body = await readJsonBody(req).catch(() => ({}));
        const result = await connectConnector(id, body.fields || {});
        if (result.ok) await audit({ kind: 'connector.connect', id });
        const { statusCode, ...payload } = result;
        return sendJson(res, statusCode || 200, payload);
      }
      if (connectorMatch && req.method === 'DELETE') {
        const id = connectorMatch[1];
        const result = await disconnectConnector(id);
        if (result.ok) await audit({ kind: 'connector.disconnect', id });
        const { statusCode, ...payload } = result;
        return sendJson(res, statusCode || 200, payload);
      }
    }

    // --- Notifications ---
    if (url === '/api/notifications' && req.method === 'GET') {
      return sendJson(res, 200, await listNotifications());
    }

    if (url === '/api/notifications' && req.method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}));
      const action = String(body.action || 'add').trim().toLowerCase();
      let result;
      if (action === 'add') {
        result = { notification: await addNotification(body.notification || body) };
      } else if (action === 'mark-read') {
        result = await markNotificationRead(String(body.id || ''));
      } else if (action === 'mark-all-read') {
        result = await markAllNotificationsRead();
      } else if (action === 'remove') {
        result = await removeNotification(String(body.id || ''));
      } else if (action === 'clear') {
        result = await clearNotifications();
      } else {
        throw requestError(`unknown notification action: ${action}`, 400);
      }
      return sendJson(res, 200, result);
    }

    // --- Conversation history ---
    if (url === '/api/conversations' && req.method === 'GET') {
      return sendJson(res, 200, await listConversations());
    }

    if (url === '/api/conversations' && req.method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}));
      const action = String(body.action || 'save').trim().toLowerCase();
      let result;
      if (action === 'save') {
        result = await saveConversation(body.conversation || body);
      } else if (action === 'delete') {
        result = await deleteConversation(String(body.id || ''));
      } else if (action === 'clear') {
        result = await clearConversations();
      } else {
        throw requestError(`unknown conversation action: ${action}`, 400);
      }
      return sendJson(res, 200, result);
    }

    {
      const convMatch = url.match(/^\/api\/conversations\/([^/]+)$/);
      if (convMatch && req.method === 'GET') {
        const record = await getConversation(decodeURIComponent(convMatch[1]));
        if (!record) return sendJson(res, 404, { error: 'conversation not found' });
        return sendJson(res, 200, record);
      }
    }

    // --- Cron jobs ---
    if (url === '/api/cron' && req.method === 'GET') {
      return sendJson(res, 200, {
        status: await cronService.status(),
        jobs: await cronService.list({ includeDisabled: parsedUrl.searchParams.get('includeDisabled') === 'true' }),
      });
    }

    if (url === '/api/cron' && req.method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}));
      const result = await handleCronAction(body, body.surfaceId || null);
      await audit({ kind: 'cron.action', action: body.action || 'unknown' });
      return sendJson(res, 200, result);
    }

    // --- MCP marketplace (same catalog Sixth uses: Cline's marketplace API) ---
    if (url === '/api/mcp/marketplace' && req.method === 'GET') {
      const refresh = parsedUrl.searchParams.get('refresh') === '1';
      return sendJson(res, 200, await getMcpMarketplaceCatalog({ refresh }));
    }

    if (url === '/api/mcp/installed' && req.method === 'GET') {
      return sendJson(res, 200, { installed: await readBorMcpServerNames(), configPath: getBorMcpPath() });
    }

    if (url === '/api/mcp/install' && req.method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}));
      const mcpId = String(body.mcpId || '').trim();
      if (!mcpId) return sendJson(res, 400, { error: 'mcpId required' });
      try {
        const result = await buildMcpInstallTask(mcpId);
        await audit({ kind: 'mcp.install.requested', mcpId });
        return sendJson(res, 200, result);
      } catch (e) {
        return sendJson(res, 502, { error: e.message });
      }
    }

    // Natural-language MCP finder: the user describes a need, the configured
    // provider picks matching servers from the catalog.
    if (url === '/api/mcp/ask' && req.method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}));
      const query = String(body.query || '').trim();
      if (!query) return sendJson(res, 400, { error: 'query required' });
      try {
        const result = await mcpAskAi(query);
        await audit({ kind: 'mcp.ask', query: query.slice(0, 200), matches: result.matches.length });
        return sendJson(res, 200, result);
      } catch (e) {
        return sendJson(res, 502, { error: e.message });
      }
    }

    // --- System apps ---
    if (url === '/api/system-apps' && req.method === 'GET') {
      return sendJson(res, 200, { apps: await listSystemApps() });
    }

    // --- Computer-use macOS permissions (onboarding) ---
    if (url === '/api/system/permissions' && req.method === 'GET') {
      // Probing also triggers the first-run macOS permission prompts.
      return sendJson(res, 200, await probeComputerUsePermissions());
    }
    if (url === '/api/system/permissions/open' && req.method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}));
      const target = MAC_SETTINGS_PANES[body?.pane];
      if (!target) return sendJson(res, 400, { error: 'pane must be "accessibility" or "screen"' });
      if (process.platform === 'darwin') {
        await new Promise((r) => {
          try { spawn('open', [target], { stdio: 'ignore' }).on('close', r).on('error', r); }
          catch { r(); }
        });
      }
      await audit({ kind: 'system.permissions.open', pane: body.pane });
      return sendJson(res, 200, { ok: true });
    }

    if (url.match(/^\/api\/system-apps\/[^/]+$/) && req.method === 'PATCH') {
      const id = url.split('/').pop();
      const body = await readJsonBody(req).catch(() => ({}));
      const patch = {};
      if (VALID_WIDGET_SIZES.has(body?.size)) patch.size = body.size;
      const layout = sanitizeWidgetLayout(body?.layout);
      if (layout) patch.layout = layout;
      if (Object.keys(patch).length === 0) return sendJson(res, 400, { error: 'size or layout required' });
      const app = await updateSystemApp(id, patch);
      await audit({ kind: 'system_app.layout.update', id, fields: Object.keys(patch) });
      return sendJson(res, 200, { app });
    }

    // --- Files app ---
    if (url === '/api/files' && req.method === 'GET') {
      const result = await listFiles(parsedUrl.searchParams.get('path') || `${DEFAULT_FILE_ROOT}:/`);
      return sendJson(res, 200, result);
    }

    if (url === '/api/files/raw' && req.method === 'GET') {
      const location = resolveFilePath(parsedUrl.searchParams.get('path') || `${DEFAULT_FILE_ROOT}:/`);
      await assertWithinFileRoot(location);
      const s = await stat(location.abs);
      if (!s.isFile()) return sendJson(res, 400, { error: 'path is not a file' });
      return sendFile(res, location.abs, contentTypeFor(location.abs), parsedUrl.searchParams.get('download') ? basename(location.abs) : null);
    }

    if (url === '/api/files/folder' && req.method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}));
      const parent = resolveFilePath(body.path || `${DEFAULT_FILE_ROOT}:/`);
      await assertWithinFileRoot(parent);
      const dir = { ...parent, abs: join(parent.abs, safeName(body.name)) };
      await assertWithinFileRoot(dir, { existing: false, parent: true });
      await mkdir(dir.abs);
      await audit({ kind: 'files.folder.create', root: dir.root.id, path: dir.abs });
      return sendJson(res, 200, { ok: true, entry: await fileEntry(dir.abs, dir.root) });
    }

    if (url === '/api/files/rename' && req.method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}));
      const from = resolveFilePath(body.path);
      await assertWithinFileRoot(from);
      const to = { ...from, abs: join(dirname(from.abs), safeName(body.name)) };
      await assertWithinFileRoot(to, { existing: false, parent: true });
      await rename(from.abs, to.abs);
      await audit({ kind: 'files.rename', root: from.root.id, from: from.abs, to: to.abs });
      return sendJson(res, 200, { ok: true, entry: await fileEntry(to.abs, to.root) });
    }

    if (url === '/api/files/move' && req.method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}));
      const from = resolveFilePath(body.from);
      await assertWithinFileRoot(from);
      const fromRoot = await realpath(from.root.base);
      const fromReal = await realpath(from.abs);
      if (fromReal === fromRoot) return sendJson(res, 400, { error: `cannot move ${from.root.label}` });
      let to = resolveFilePath(body.to, { defaultRootId: from.root.id });
      if (existsSync(to.abs) && (await stat(to.abs)).isDirectory()) to = { ...to, abs: join(to.abs, basename(from.abs)) };
      await assertWithinFileRoot(to, { existing: false, parent: true });
      await rename(from.abs, to.abs);
      await audit({ kind: 'files.move', fromRoot: from.root.id, toRoot: to.root.id, from: from.abs, to: to.abs });
      return sendJson(res, 200, { ok: true, entry: await fileEntry(to.abs, to.root) });
    }

    if (url === '/api/files' && req.method === 'DELETE') {
      const location = resolveFilePath(parsedUrl.searchParams.get('path') || '');
      const root = await realpath(location.root.base);
      const target = await realpath(location.abs);
      if (target === root) return sendJson(res, 400, { error: `cannot delete ${location.root.label}` });
      await assertWithinFileRoot(location);
      await rm(location.abs, { recursive: true, force: false });
      await audit({ kind: 'files.delete', root: location.root.id, path: location.abs });
      return sendJson(res, 200, { ok: true });
    }

    if (url === '/api/files/upload' && req.method === 'POST') {
      const buffer = await readBufferBody(req);
      const upload = parseMultipartUpload(req, buffer);
      const targetDir = resolveFilePath(upload.fields.path || `${DEFAULT_FILE_ROOT}:/`);
      await assertWithinFileRoot(targetDir);
      const written = [];
      for (const file of upload.files) {
        const dest = { ...targetDir, abs: join(targetDir.abs, file.filename) };
        await assertWithinFileRoot(dest, { existing: false, parent: true });
        await writeFile(dest.abs, file.buffer);
        written.push(await fileEntry(dest.abs, dest.root));
      }
      await audit({ kind: 'files.upload', root: targetDir.root.id, path: targetDir.abs, count: written.length });
      return sendJson(res, 200, { ok: true, files: written });
    }

    // --- Browser app ---
    if (url === '/api/browser/status' && req.method === 'GET') {
      return sendJson(res, 200, browserStatusPayload());
    }

    if (url === '/api/browser/open' && req.method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}));
      const status = launchBrowser(body.url);
      await audit({ kind: 'browser.open', url: status.lastUrl, executablePath: status.executablePath });
      return sendJson(res, 200, status);
    }

    if (url === '/api/browser/close' && req.method === 'POST') {
      const status = await closeBrowser();
      await audit({ kind: 'browser.close' });
      return sendJson(res, 200, status);
    }

    if (url === '/api/browser/reset-profile' && req.method === 'POST') {
      await closeBrowser();
      await rm(USER_PROFILE_DIR, { recursive: true, force: true });
      ensureBrowserDirs();
      await audit({ kind: 'browser.profile.reset', path: USER_PROFILE_DIR });
      return sendJson(res, 200, browserStatusPayload());
    }

    // --- Connectivity ---
    if (url === '/api/connectivity' && req.method === 'GET') {
      return sendJson(res, 200, getConnectivityStatus());
    }

    // --- Legacy widget endpoint shims (return 410 Gone with redirect hint).
    // Kept for one release so any in-flight cached iframe doesn't 404 silently.
    // The new surface bridges (shell/surface-bridge.js, surface-preload.cjs,
    // RuntimeClient.swift) all post to /api/surface-* directly. ---
    {
      const legacyMatch = (
        url === '/api/widgets' ||
        url === '/api/widget-llm' ||
        url === '/api/widget-search' ||
        url === '/api/widget-fetch' ||
        url === '/api/widget-image-gen' ||
        /^\/api\/widgets\/[^/]+(\/state)?$/.test(url)
      );
      if (legacyMatch) {
        const replacement = url.replace('/api/widgets', '/api/surfaces').replace('/api/widget-', '/api/surface-');
        res.setHeader('location', replacement);
        return sendJson(res, 410, { error: 'widget primitive replaced by shortcuts', use: replacement });
      }
    }

    // --- Surfaces (apps + shortcuts) ---
    if (url === '/api/surfaces' && req.method === 'GET') {
      return sendJson(res, 200, { surfaces: await listWidgets() });
    }

    if (url.match(/^\/api\/surfaces\/[^/]+$/) && req.method === 'PATCH') {
      const id = url.split('/').pop();
      const body = await readJsonBody(req).catch(() => ({}));
      const patch = {};
      if (VALID_WIDGET_SIZES.has(body?.size)) patch.size = body.size;
      const requestedLayout = body?.layout || (('x' in (body || {})) || ('y' in (body || {})) ? { x: body.x, y: body.y } : null);
      const layout = sanitizeWidgetLayout(requestedLayout);
      if (layout) patch.layout = layout;
      if (Object.keys(patch).length === 0) {
        return sendJson(res, 400, { error: 'size or layout required' });
      }
      const manifest = await editWidget(id, patch);
      await audit({ kind: 'surface.layout.update', id, fields: Object.keys(patch) });
      return sendJson(res, 200, { manifest });
    }

    if (url.match(/^\/api\/surfaces\/[^/]+$/) && req.method === 'DELETE') {
      const id = url.split('/').pop();
      await deleteWidget(id);
      await audit({ kind: 'surface.delete', id });
      return sendJson(res, 200, { ok: true });
    }

    // --- Surface host bridge: state read/write ----------------------------
    // Shortcuts/apps call these via parent.postMessage; the host listener in
    // shell/surface-bridge.js (classic shell) or host/presence.js
    // (Mac companion) translates messages into these HTTP calls.
    {
      const m = url.match(/^\/api\/surfaces\/([^/]+)\/state$/);
      if (m && req.method === 'GET') {
        const r = await handleGetState({ surfacesDir: SURFACES_DIR, surfaceId: m[1] });
        return sendJson(res, r.status, r.body);
      }
      if (m && req.method === 'POST') {
        const body = await readJsonBody(req).catch(() => null);
        const r = await handleSetState({ surfacesDir: SURFACES_DIR, surfaceId: m[1], body });
        if (r.status === 200) {
          await audit({ kind: 'surface.state.set', id: m[1], bytes: r.body.bytes });
          logSessionEvent('surface.state.set', { id: m[1], bytes: r.body.bytes });
        }
        return sendJson(res, r.status, r.body);
      }
    }

    // --- Memory event sink: client-driven events go here -------------------
    // Today only `surface.open` from the shell when the user opens a tile.
    if (url === '/api/memory/event' && req.method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}));
      const kind = String(body?.kind || '').slice(0, 60);
      if (!kind) return sendJson(res, 400, { error: 'kind required' });
      const { kind: _, ...rest } = body;
      logSessionEvent(kind, rest);
      // surface.open / widget.open ALSO bumps the registry counter so the LLM sees usage.
      if ((kind === 'surface.open' || kind === 'widget.open') && rest?.id) {
        try { await surfaceRegistry.bumpUse(rest.id, { name: rest.name }); } catch { /* ignore */ }
      }
      return sendJson(res, 200, { ok: true });
    }

    // --- Surface host bridge: LLM proxy ------------------------------------
    if (url === '/api/surface-llm' && req.method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}));
      const cfg = await loadConfig();
      const surfaceId = body.surfaceId || body.widgetId;
      const r = await handleSurfaceLlm({ config: cfg, surfaceId, prompt: body.prompt, system: body.system, images: body.images });
      if (r.status === 200) {
        await audit({ kind: 'surface.llm', id: surfaceId, model: r.body.model, chars: r.body.text?.length || 0 });
        logSessionEvent('surface.llm', { id: surfaceId, model: r.body.model, chars: r.body.text?.length || 0 });
      } else if (r.status === 429) {
        await audit({ kind: 'surface.llm.refused', id: surfaceId, reason: r.body.error });
        logSessionEvent('surface.llm.refused', { id: surfaceId, reason: r.body.error });
      }
      return sendJson(res, r.status, r.body);
    }

    // --- Surface host bridge: web search / fetch ---------------------------
    if (url === '/api/surface-search' && req.method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}));
      const surfaceId = body.surfaceId || body.widgetId;
      const r = await handleSurfaceWebSearch({ surfaceId, query: body.query, limit: body.limit });
      if (r.status === 200) {
        await audit({ kind: 'surface.search', id: surfaceId, query: body.query, results: r.body.results.length });
      }
      return sendJson(res, r.status, r.body);
    }
    if (url === '/api/surface-fetch' && req.method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}));
      const surfaceId = body.surfaceId || body.widgetId;
      const r = await handleSurfaceWebFetch({ surfaceId, url: body.url });
      if (r.status === 200) {
        await audit({ kind: 'surface.fetch', id: surfaceId, url: body.url, bytes: r.body.text?.length || 0 });
      }
      return sendJson(res, r.status, r.body);
    }

    // --- Surface host bridge: image generation -----------------------------
    if (url === '/api/surface-image-gen' && req.method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}));
      const cfg = await loadConfig();
      const surfaceId = body.surfaceId || body.widgetId;
      const r = await handleSurfaceImageGen({ config: cfg, surfaceId, prompt: body.prompt, size: body.size });
      if (r.status === 200) {
        await audit({ kind: 'surface.image.generate', id: surfaceId, url: r.body.url, model: r.body.model, bytes: r.body.bytes });
        logSessionEvent('surface.image.generate', { id: surfaceId, url: r.body.url });
      }
      return sendJson(res, r.status, r.body);
    }

    // --- Image serving ----------------------------------------------------
    // Static file serve from os-data/images/. Tightly scoped — only files
    // directly under IMAGES_DIR, no traversal, no nested dirs.
    if (url.startsWith('/api/images/') && req.method === 'GET') {
      const fname = url.slice('/api/images/'.length).split('?')[0];
      if (!fname || /[\/\\]|\.\./.test(fname)) {
        res.writeHead(400); return res.end('bad path');
      }
      const abs = join(IMAGES_DIR, fname);
      if (!existsSync(abs)) { res.writeHead(404); return res.end('not found'); }
      const ext = extname(abs).toLowerCase();
      const ct = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' })[ext] || 'application/octet-stream';
      res.writeHead(200, { 'content-type': ct, 'cache-control': 'public, max-age=31536000, immutable' });
      return createReadStream(abs).pipe(res);
    }

    // --- Chat (SSE stream) ---
    //
    // The LLM emits a stream of XML tags. The protocol parser splits them out
    // as they arrive, the executor dispatches each to its handler, and we
    // forward the result as one SSE event per block. Connection stays open
    // until the LLM finishes (we emit a final `done` event).
    // Explicit user-stop notification from the host. The /api/chat abort
    // itself arrives as a socket close (indistinguishable from a connection
    // drop), so the host calls this first for USER stops only. Audit-only —
    // the interrupted marker lives in the conversation history the presence
    // sends with the next turn.
    if (url === '/api/chat/interrupted' && req.method === 'POST') {
      await readJsonBody(req).catch(() => ({}));
      logSessionEvent('chat.interrupted', {});
      await audit({ kind: 'chat.interrupted' });
      return sendJson(res, 200, { ok: true });
    }

    if (url === '/api/chat' && req.method === 'POST') {
      const connectivity = getConnectivityStatus();
      if (connectivity.online === false) {
        return sendJson(res, 503, {
          error: 'Internet connection is down. I will keep checking and you can send again when it is back.',
          offline: true,
          connectivity,
        });
      }
      const cfg = await loadConfig();
      const providerId = cfg?.defaultProvider;
      const provider = providerId ? getProvider(providerId) : null;
      if (!cfg || !provider) {
        return sendJson(res, 400, { error: 'No provider connected' });
      }
      const pCfg = cfg.providers?.[providerId];
      const hasAuth = pCfg && (pCfg.apiKey || (provider.id === 'openai-compatible' && pCfg.baseUrl));
      if (!hasAuth) {
        return sendJson(res, 400, { error: `${provider.label} is not configured` });
      }

      const body = await readJsonBody(req);
      const lastUserMessage = messageContentText(body.messages?.at(-1)?.content || '');
      const hostMode = body.hostMode === 'v2' ? 'v2' : undefined;

      // Session log: record the user's prompt at the top of the turn. A turn
      // whose message is exactly the resume marker is logged as a resume, not
      // as user prose.
      if (lastUserMessage) {
        if (lastUserMessage.trim() === '<task_resumed_by_user/>') {
          logSessionEvent('chat.resumed', {});
          await audit({ kind: 'chat.resumed' });
        } else {
          logSessionEvent('user.message', { text: lastUserMessage.slice(0, 2000) });
        }
      }

      // Open the SSE response.
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      // Disable Nagle's algorithm — every res.write should hit the wire
      // immediately so token-level streaming is actually token-level on the
      // client side, not coalesced into 40–200ms buckets.
      try { res.socket?.setNoDelay?.(true); } catch { /* ignore */ }
      // Initial padding so proxies/browsers flush the headers immediately.
      res.write(': ok\n\n');
      const requestAbort = new AbortController();
      let chatResponseFinished = false;
      res.on('close', () => {
        if (!chatResponseFinished && !requestAbort.signal.aborted) {
          requestAbort.abort(new Error('chat client disconnected'));
        }
      });

      const sendEvent = (event, payload, ok = true) => {
        if (requestAbort.signal.aborted || res.destroyed || res.writableEnded) return;
        try {
          res.write(`event: ${event}\n`);
          res.write(`data: ${JSON.stringify({ ok, ...payload })}\n\n`);
        } catch (e) { console.error('[sse-write]', e.message); }
      };

      // Build the per-request handler context — every protocol handler reads
      // from this. Keeps the protocol layer free of imports from index.js.
      const ctx = buildHandlerCtx({ lastUserMessage, signal: requestAbort.signal });
      // Dreams are disabled for now; there should be no background dream worker
      // to cancel during normal chat.
      // cancelBackgroundDream('interactive chat started');
      activeChatStreams += 1;
      // lastChatActivityAt = Date.now();

      try {
        // Chat path: legacy XML streaming through `server/ai.js`. The
        // earlier native-tool-calling harness rewrite (`server/llm/`) was
        // reverted — the original "model halts mid-task" bug it was built
        // to solve was actually a MAX_PASSES=10 cap in `server/ai.js`, not
        // an architectural problem. See feedback_check_caps_before_rewriting
        // in auto-memory.
        const onEvent = ({ event, payload, ok }) => {
          if (event === 'done') return;
          sendEvent(event, payload || {}, ok !== false);
          if (event && event !== 'tag_start' && event !== 'tag_delta' && event !== 'execute_command_delta' && event !== 'done' && event !== 'tool_error') {
            logSessionEvent('tag.exec', {
              name: event,
              ok: ok !== false,
              id: payload?.manifest?.id || payload?.id || null,
            });
          } else if (event === 'tool_error') {
            logSessionEvent('tag.exec', { name: payload?.tag || '?', ok: false, reason: payload?.reason });
          }
        };
        const widgetsForTurn = await listWidgets();
        const recordedAssistantTurn = await handleChatStream({
          config: cfg,
          messages: body.messages || [],
          widgets: widgetsForTurn,
          ctx,
          hostMode,
          onEvent,
        });
        // Echo the recorded assistant turn back so the client can persist it
        // verbatim into its conversation history. Embedded in the `done`
        // event so the client gets it after all per-block events.
        if (!requestAbort.signal.aborted) sendEvent('done', { recorded: recordedAssistantTurn || '' });
      } catch (err) {
        if (requestAbort.signal.aborted) return;
        // Surface fetch / stream errors as an apologetic <say>.
        const causeChain = [];
        let c = err;
        while (c && causeChain.length < 5) {
          causeChain.push(c.message || String(c));
          c = c.cause;
        }
        const reason = causeChain.join(' ← ');
        console.error(`[chat] ${providerId} failed:`, reason);
        await audit({ kind: 'chat.error', provider: providerId, reason });
        sendEvent('say', { tone: 'apologetic', text: `${provider.label} returned an error: ${err.message}` });
        sendEvent('done', { recorded: '' });
      } finally {
        chatResponseFinished = true;
        activeChatStreams = Math.max(0, activeChatStreams - 1);
        // lastChatActivityAt = Date.now();
        try { res.end(); } catch { /* ignore */ }
      }
      return;
    }

    // --- Widget host pages (with stricter CSP) ---
    if (url.startsWith('/widgets/')) {
      return await serveWidgetFile(req, res);
    }

    // --- Static shell ---
    if (req.method === 'GET') return await serveStatic(req, res);

    res.writeHead(404); res.end('Not found');
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('[server]', err);
    sendJson(res, status, { error: err.message || 'Internal error' });
  }
});

// When the runtime is spawned as a child process by the v2 Electron host,
// `process.stdout` is a non-TTY pipe. Node's default is to write to pipes
// asynchronously via libuv, which means tightly-spaced `process.stdout.write`
// calls (e.g. the per-chunk widget HTML emissions during `<create_widget>`
// streaming in `server/ai.js`) get queued in libuv and can coalesce into a
// few large reads at the parent side — especially when the Electron main
// thread is busy (creating a BrowserWindow for the widget preview, applying
// a wallpaper, etc.). That collapses the visible streaming on the terminal
// log and indirectly suggests to operators that the SSE side is also batched.
//
// Switching the stdout handle to blocking mode makes each write synchronous,
// so a 600-byte chunk reaches the parent pipe before the next `setTimeout`
// resumes. It's safe here because the writes are small and infrequent; the
// runtime isn't dumping multi-megabyte logs.
try { process.stdout._handle?.setBlocking?.(true); } catch { /* not all builds expose this */ }
try { process.stderr._handle?.setBlocking?.(true); } catch { /* not all builds expose this */ }

cronService = new CronService({
  executeAgentTurn: executeCronAgentTurn,
  log: console,
});

server.listen(PORT, () => {
  console.log(`🌹 Bed of Roses — http://localhost:${PORT}`);
  console.log(`   Providers: ${ALL_PROVIDERS.map((p) => p.label).join(', ')}`);
  console.log('   Dreams: disabled');
  cronService.start().catch((err) => console.error('[cron] failed to start:', err.message));
  // Dreams are disabled for now because they were interrupting normal chat.
  // To re-enable, restore the dream import at the top of this file and
  // uncomment this scheduler block.
  //
  // startDreamScheduler({
  //   loadConfig,
  //   buildCtx: () => buildHandlerCtx({ lastUserMessage: '[dream]' }),
  //   shouldSkip: () => {
  //     if (activeChatStreams > 0) return 'active chat stream';
  //     const sinceChat = lastChatActivityAt ? Date.now() - lastChatActivityAt : Infinity;
  //     if (sinceChat < DREAM_CHAT_COOLDOWN_MS) {
  //       return `chat cooldown (${Math.ceil((DREAM_CHAT_COOLDOWN_MS - sinceChat) / 1000)}s left)`;
  //     }
  //     return false;
  //   },
  // });
});
