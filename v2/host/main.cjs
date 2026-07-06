const { app, BrowserWindow, Menu, globalShortcut, ipcMain, screen, shell, dialog, session, nativeImage } = require('electron');
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const { appendFileSync, watch } = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { syncNativeApps, writeHostControlDiscovery, writeMainAppWrapper } = require('./native-apps.cjs');

const ROOT = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(ROOT, 'os-data');
const ELECTRON_USER_DATA_DIR = path.join(ROOT, '.bed-of-roses', 'v2-electron');
const HOST_STATE_PATH = path.join(DATA_DIR, 'v2-host.json');
const WALLPAPER_DIR = path.join(DATA_DIR, 'v2-wallpaper');
const SERVER_ENTRY = path.join(ROOT, 'server', 'index.js');
const DEFAULT_PORT = Number(process.env.PORT || 7777);
const NODE_EXECUTABLE = process.env.BOR_NODE || process.env.npm_node_execpath || 'node';

// ----- Multi-presence maps --------------------------------------------------
// One Node runtime process + one orb window per presence, keyed by the registry
// presence id (v2/host/presences.cjs). With exactly one presence the host looks
// and behaves identically to the old single-presence build.
const runtimeUrls = new Map();        // presenceId -> 'http://127.0.0.1:PORT'
const runtimeProcesses = new Map();   // presenceId -> ChildProcess
const _claimedPorts = new Set();      // ports handed out this boot (collision guard)
const presenceWindows = new Map();    // presenceId -> BrowserWindow
const onboardingWindows = new Map();  // presenceId -> BrowserWindow
const presenceState = new Map();      // presenceId -> { mode, anchor, captureHideDepth, captureWasVisible }

// Per-presence UI/geometry state, lazily initialised to the legacy defaults.
function getPresenceState(id) {
  let st = presenceState.get(id);
  if (!st) {
    st = { mode: 'collapsed', anchor: 'bottom-right', captureHideDepth: 0, captureWasVisible: false };
    presenceState.set(id, st);
  }
  return st;
}

const {
  readRegistry, migrateToPresences, updatePresence,
  createPresence, deletePresence, getPresence, listPresences,
} = require('./presences.cjs');

let mainAppWindow = null;

// Registry default-presence id, cached after boot so synchronous helpers can
// resolve a presence when an event/sender doesn't tell us which one.
let defaultPresenceId = null;

// Map an IPC event (or any webContents) to the presence that owns its window.
// Falls back to the registry default so calls from detached/early senders still
// route somewhere sane.
function presenceIdForEvent(event) {
  try {
    return BrowserWindow.fromWebContents(event.sender)?.borPresenceId || defaultPresenceId;
  } catch {
    return defaultPresenceId;
  }
}

// A live presence window to anchor host-global UI (dialogs) to: prefer the
// default presence's window, else any live one.
function anyPresenceWindow() {
  const preferred = presenceWindows.get(defaultPresenceId);
  if (preferred && !preferred.isDestroyed()) return preferred;
  for (const win of presenceWindows.values()) {
    if (win && !win.isDestroyed()) return win;
  }
  return null;
}

let allowOnboardingClose = false;
let wallpaperApplyTimer = null;
let presenceHotReloadInstalled = false;
let mediaRequestHeadersInstalled = false;
// Host-global screenshot-capture state. /api/host/presence-capture is a single
// global screenshot operation, so it tracks one depth/visibility pair and
// hides/shows EVERY presence window. This is the one place global capture state
// is intentional (per-presence capture state lives in getPresenceState()).
let captureHideDepth = 0;
let captureWasVisible = false;
let hostControlServer = null;
let hostControlUrl = null;
const hostControlToken = randomUUID();
let helperProcess = null;
let helperUrl = null;
const helperToken = randomUUID();
// Set true in app.on('before-quit') so the exit handler can tell an
// intentional shutdown apart from a crash and skip auto-restart.
let helperShutdownRequested = false;
// Sliding window of recent helper-crash timestamps. We only auto-restart
// if fewer than HELPER_RESTART_MAX_CRASHES have happened inside
// HELPER_RESTART_WINDOW_MS — past that we assume the helper is broken
// and stop retrying so we don't fork-bomb the system.
const helperCrashTimestamps = [];
const HELPER_RESTART_MAX_CRASHES = 3;
const HELPER_RESTART_WINDOW_MS = 60_000;
const HELPER_RESTART_BACKOFF_MS = 800;
const surfaceWindows = new Map();
const widgetPreviewWindows = new Map();
let nativeAppsSyncTimer = null;
let nativeAppsSyncInFlight = false;
let nativeAppsResyncQueued = false;
const NATIVE_APPS_SYNC_INTERVAL_MS = 30_000;
const previewStateRevisions = new Map();
const activeChatControllers = new Map();

const PRESENCE_SIZES = {
  collapsed: { width: 53, height: 53 },
  'collapsed-notification': { width: 278, height: 66 },
  expanded: { width: 520, height: 92 },
  thinking: { width: 604, height: 690 },
  minimized: { width: 188, height: 55 },
};
const PRESENCE_EDGE_FLIP_PX = 240;
const PRESENCE_ORB_CENTER = 31.25;
const PRESENCE_COLLAPSED_ORB_CENTER = 26.25;

app.setName('Bed of Roses');
app.setPath('userData', ELECTRON_USER_DATA_DIR);
const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) app.quit();

function log(message) {
  const line = `[bor-v2] ${message}`;
  console.log(line);
  try {
    appendFileSync('/tmp/bor-v2-host.log', `${new Date().toISOString()} ${line}\n`);
  } catch { /* ignore */ }
}

process.on('uncaughtException', (error) => {
  console.error('[bor-v2] uncaught exception:', error);
  try { appendFileSync('/tmp/bor-v2-host.log', `${new Date().toISOString()} [bor-v2] uncaught exception: ${error?.stack || error}\n`); } catch { /* ignore */ }
});

process.on('unhandledRejection', (reason) => {
  console.error('[bor-v2] unhandled rejection:', reason);
  try { appendFileSync('/tmp/bor-v2-host.log', `${new Date().toISOString()} [bor-v2] unhandled rejection: ${reason?.stack || reason}\n`); } catch { /* ignore */ }
});

function showDockForSetup() {
  if (process.platform !== 'darwin') return;
  try { app.dock.show(); } catch { /* ignore */ }
}

function hideDockForPresence() {
  if (process.platform !== 'darwin') return;
  try { app.dock.hide(); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Main BOR app — the persistent management window. Replaces the throwaway shell
// page that used to flash after onboarding. Tabs: edit onboarding details, view
// presence logs, and manage presences (create / delete / inspect).
// ---------------------------------------------------------------------------

function createMainAppWindow() {
  if (mainAppWindow && !mainAppWindow.isDestroyed()) {
    mainAppWindow.show();
    mainAppWindow.focus();
    return mainAppWindow;
  }
  showDockForSetup(); // a normal-chrome window — show the dock while it's open.
  mainAppWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 820,
    minHeight: 560,
    title: 'Bed of Roses',
    show: false,
    backgroundColor: '#050409',
    webPreferences: {
      preload: path.join(__dirname, 'main-app-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainAppWindow.once('ready-to-show', () => { mainAppWindow.show(); mainAppWindow.focus(); });
  mainAppWindow.on('closed', () => {
    mainAppWindow = null;
    // Drop the dock again if no other dock-worthy window remains.
    if (!hasOpenOnboarding()) hideDockForPresence();
  });
  mainAppWindow.loadFile(path.join(__dirname, 'main-app.html'));
  return mainAppWindow;
}

// Push a fresh presence list to the Main app whenever it changes, so its
// Manage Presences tab stays live without polling.
function notifyMainAppPresencesChanged() {
  if (mainAppWindow && !mainAppWindow.isDestroyed()) {
    mainAppWindow.webContents.send('bor:presences-changed');
  }
}

// Compact, serialisable view of a presence for the Main app (no live objects).
function presenceSummary(entry) {
  return {
    id: entry.id,
    nickname: entry.nickname,
    displayName: entry.displayName,
    tagName: entry.tagName,
    createdAtMs: entry.createdAtMs || null,
    onboarded: entry.onboarded === true,
    port: entry.port || null,
    dataDir: entry.dataDir,
    running: runtimeUrls.has(entry.id),
    orbOpen: Boolean(presenceWindows.get(entry.id) && !presenceWindows.get(entry.id).isDestroyed()),
  };
}

// Create a brand-new presence end-to-end: registry entry → runtime → onboarding
// window (so the user sets its name/avatar/provider). Returns the summary.
async function spawnNewPresence({ nickname } = {}) {
  const entry = await createPresence({ nickname: nickname || 'New presence' }, { nowMs: Date.now() });
  log(`presences: created ${entry.id} (${entry.nickname}) — starting runtime + onboarding`);
  try {
    await startRuntime(entry);
  } catch (err) {
    // Runtime failed to come up — roll back so we don't leave a dead presence.
    log(`presences: runtime failed for ${entry.id} (${err.message}); rolling back`);
    await destroyPresence(entry.id).catch(() => {});
    throw new Error(`could not start presence runtime: ${err.message}`);
  }
  // Open onboarding for the NEW presence and force it to the front so it can't
  // get lost behind the Main app / other orbs. A fresh presence is never
  // onboarded yet, so onboarding (name, avatar, provider + API key) always runs
  // here; completion flips onboarded=true and creates its orb.
  const win = createOnboardingWindow(entry);
  if (win && !win.isDestroyed()) {
    try { win.show(); win.focus(); if (typeof win.moveTop === 'function') win.moveTop(); } catch { /* ignore */ }
  }
  notifyMainAppPresencesChanged();
  return presenceSummary(entry);
}

// Tear a presence down fully: kill its runtime, close its windows, drop its
// registry entry + data dir (registry guards the rm to os-data/presences/).
async function destroyPresence(id) {
  const entry = await getPresence(id);
  if (!entry) return { ok: false, error: 'unknown presence' };
  const reg = await readRegistry();
  if (Object.keys(reg.presences).length <= 1) {
    return { ok: false, error: 'cannot delete the last presence' };
  }
  const proc = runtimeProcesses.get(id);
  if (proc) { try { proc.kill('SIGTERM'); } catch { /* ignore */ } }
  runtimeProcesses.delete(id);
  runtimeUrls.delete(id);
  for (const map of [presenceWindows, onboardingWindows]) {
    const win = map.get(id);
    if (win && !win.isDestroyed()) { try { win.close(); } catch { /* ignore */ } }
    map.delete(id);
  }
  presenceState.delete(id);
  await deletePresence(id, { removeData: true });
  _claimedPorts.delete(entry.port);
  // If we just deleted the default presence, repoint defaultPresenceId at a
  // survivor so sender-less routing (host-control, dialogs) still resolves.
  if (defaultPresenceId === id) {
    const reg = await readRegistry();
    defaultPresenceId = reg.defaultId || Object.keys(reg.presences)[0] || null;
  }
  notifyMainAppPresencesChanged();
  return { ok: true };
}

const CONTEXT_TREE_IGNORE = new Set([
  'node_modules', '.git', '.DS_Store', 'dist', 'build', 'out', '.next', '.cache', 'coverage',
  'Library', 'Applications', 'Movies', 'Music', 'Pictures Library.photoslibrary',
  '.Trash', '.ssh', '.gnupg', '.npm', '.config', '.local',
]);

function shouldSkipContextEntry(name) {
  if (CONTEXT_TREE_IGNORE.has(name)) return true;
  if (/^\.env($|\.)/.test(name)) return true;
  return name.startsWith('.') && name !== '.bor' && name !== '.bed-of-roses';
}

function contextFormatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

async function renderContextTree(rootPath, { maxDepth = 3, maxEntries = 220, maxChars = 9000 } = {}) {
  const lines = [`${path.basename(rootPath) || rootPath}/ (${rootPath})`];
  let entriesSeen = 0;
  let skipped = 0;
  let truncated = false;

  async function walk(dir, depth, prefix) {
    if (truncated || depth > maxDepth || entriesSeen >= maxEntries) {
      truncated = true;
      return;
    }
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      lines.push(`${prefix}\\-- (unreadable)`);
      return;
    }
    const visible = entries.filter((entry) => {
      if (shouldSkipContextEntry(entry.name)) {
        skipped += 1;
        return false;
      }
      return true;
    }).sort((a, b) => {
      const ad = a.isDirectory() ? 0 : 1;
      const bd = b.isDirectory() ? 0 : 1;
      return ad - bd || a.name.localeCompare(b.name);
    });

    for (let i = 0; i < visible.length; i += 1) {
      if (entriesSeen >= maxEntries || lines.join('\n').length > maxChars) {
        truncated = true;
        return;
      }
      const entry = visible[i];
      const isLast = i === visible.length - 1;
      const branch = isLast ? '\\-- ' : '|-- ';
      const childPrefix = `${prefix}${isLast ? '    ' : '|   '}`;
      const suffix = entry.isDirectory() ? '/' : entry.isSymbolicLink() ? '@' : '';
      lines.push(`${prefix}${branch}${entry.name}${suffix}`);
      entriesSeen += 1;
      if (entry.isDirectory()) {
        if (depth < maxDepth) await walk(path.join(dir, entry.name), depth + 1, childPrefix);
        else truncated = true;
      }
    }
  }

  await walk(rootPath, 0, '');
  const notes = [];
  if (skipped) notes.push(`${skipped} hidden/heavy entries ignored`);
  if (truncated) notes.push(`truncated at depth ${maxDepth}, ${entriesSeen}/${maxEntries} entries`);
  if (notes.length) lines.push(`... (${notes.join('; ')})`);
  const text = lines.join('\n');
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n... (tree truncated)` : text;
}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.heic', '.heif']);
const IMAGE_MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
};
const IMAGE_CONTEXT_MAX_BYTES = 8 * 1024 * 1024; // 8 MB per attached image
// HEIC/HEIF (iPhone photos) are rejected by Anthropic and OpenAI — only Gemini
// accepts them. Transcode to JPEG at attach time so every provider can see the
// image; macOS ships `sips`, so no extra dependency.
const HEIC_EXTS = new Set(['.heic', '.heif']);
const PDF_CONTEXT_MAX_BYTES = 20 * 1024 * 1024; // 20 MB per attached PDF (stays under Anthropic's 32 MB request limit once base64-inflated)

function execFileAsync(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 30_000, ...opts }, (err, stdout, stderr) => {
      if (err) {
        const detail = (stderr && stderr.toString().trim()) || err.message;
        reject(new Error(detail));
        return;
      }
      resolve(stdout);
    });
  });
}

async function imagePixelDims(filePath) {
  try {
    const stdout = String(await execFileAsync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', filePath]));
    const w = Number((stdout.match(/pixelWidth:\s*(\d+)/) || [])[1]) || 0;
    const h = Number((stdout.match(/pixelHeight:\s*(\d+)/) || [])[1]) || 0;
    return { w, h };
  } catch {
    return { w: 0, h: 0 };
  }
}

// Convert a HEIC/HEIF file to a JPEG buffer. Large photos are downscaled to a
// 2048px long edge (keeps the payload under provider per-image limits); small
// images keep their native size — `sips -Z` upscales, so we only apply it when
// a dimension actually exceeds the cap. Throws if `sips` fails.
async function heicToJpegBuffer(filePath) {
  const out = path.join(app.getPath('temp'), `bor-heic-${randomUUID()}.jpg`);
  try {
    const args = ['-s', 'format', 'jpeg'];
    const { w, h } = await imagePixelDims(filePath);
    if (Math.max(w, h) > 2048) args.push('-Z', '2048');
    args.push(filePath, '--out', out);
    await execFileAsync('sips', args);
    return await fs.readFile(out);
  } finally {
    fs.unlink(out).catch(() => {});
  }
}

async function describeContextPath(filePath) {
  const stat = await fs.stat(filePath);
  if (stat.isDirectory()) {
    return {
      id: `${filePath}:${stat.mtimeMs}`,
      kind: 'folder',
      path: filePath,
      name: path.basename(filePath) || filePath,
      tree: await renderContextTree(filePath),
    };
  }
  const ext = path.extname(filePath).toLowerCase();
  // Images attach as VISION blocks (image_url multimodal content) so the
  // model can actually see them, not as text "use <read_file>" references.
  // Read the bytes, base64-encode, ship as a data URL.
  if (IMAGE_EXTS.has(ext)) {
    if (stat.size > IMAGE_CONTEXT_MAX_BYTES) {
      return {
        id: `${filePath}:${stat.size}:${stat.mtimeMs}`,
        kind: 'image',
        path: filePath,
        name: path.basename(filePath) || filePath,
        bytes: stat.size,
        size: contextFormatBytes(stat.size),
        error: `image is ${contextFormatBytes(stat.size)} (max ${contextFormatBytes(IMAGE_CONTEXT_MAX_BYTES)} for vision context)`,
      };
    }
    try {
      let mime = IMAGE_MIME_BY_EXT[ext] || 'application/octet-stream';
      let buf;
      if (HEIC_EXTS.has(ext)) {
        buf = await heicToJpegBuffer(filePath);
        mime = 'image/jpeg';
      } else {
        buf = await fs.readFile(filePath);
      }
      const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
      return {
        id: `${filePath}:${stat.size}:${stat.mtimeMs}`,
        kind: 'image',
        path: filePath,
        name: path.basename(filePath) || filePath,
        bytes: stat.size,
        size: contextFormatBytes(stat.size),
        mediaType: mime,
        dataUrl,
      };
    } catch (error) {
      return {
        id: `${filePath}:${stat.size}:${stat.mtimeMs}`,
        kind: 'image',
        path: filePath,
        name: path.basename(filePath) || filePath,
        bytes: stat.size,
        size: contextFormatBytes(stat.size),
        error: HEIC_EXTS.has(ext)
          ? `HEIC conversion failed: ${error.message}`
          : `image read failed: ${error.message}`,
      };
    }
  }
  // PDFs attach as native document blocks (Anthropic/OpenAI/Gemini all ingest
  // PDFs directly) so the model reads them without a <read_file> round-trip.
  if (ext === '.pdf') {
    if (stat.size > PDF_CONTEXT_MAX_BYTES) {
      return {
        id: `${filePath}:${stat.size}:${stat.mtimeMs}`,
        kind: 'document',
        path: filePath,
        name: path.basename(filePath) || filePath,
        bytes: stat.size,
        size: contextFormatBytes(stat.size),
        error: `PDF is ${contextFormatBytes(stat.size)} (max ${contextFormatBytes(PDF_CONTEXT_MAX_BYTES)} for inline context)`,
      };
    }
    try {
      const buf = await fs.readFile(filePath);
      const dataUrl = `data:application/pdf;base64,${buf.toString('base64')}`;
      return {
        id: `${filePath}:${stat.size}:${stat.mtimeMs}`,
        kind: 'document',
        path: filePath,
        name: path.basename(filePath) || filePath,
        bytes: stat.size,
        size: contextFormatBytes(stat.size),
        mediaType: 'application/pdf',
        dataUrl,
      };
    } catch (error) {
      return {
        id: `${filePath}:${stat.size}:${stat.mtimeMs}`,
        kind: 'document',
        path: filePath,
        name: path.basename(filePath) || filePath,
        bytes: stat.size,
        size: contextFormatBytes(stat.size),
        error: `PDF read failed: ${error.message}`,
      };
    }
  }
  return {
    id: `${filePath}:${stat.size}:${stat.mtimeMs}`,
    kind: 'file',
    path: filePath,
    name: path.basename(filePath) || filePath,
    bytes: stat.size,
    size: contextFormatBytes(stat.size),
  };
}

async function pickContextItems() {
  const options = {
    title: 'Attach file or folder',
    buttonLabel: 'Attach',
    properties: ['openFile', 'openDirectory', 'multiSelections'],
  };
  const anchorWin = anyPresenceWindow();
  const result = anchorWin
    ? await dialog.showOpenDialog(anchorWin, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths?.length) return { canceled: true, items: [] };
  const items = [];
  for (const filePath of result.filePaths.slice(0, 8)) {
    try {
      items.push(await describeContextPath(filePath));
    } catch (error) {
      items.push({
        id: `${filePath}:error`,
        kind: 'error',
        path: filePath,
        name: path.basename(filePath) || filePath,
        error: error.message,
      });
    }
  }
  return { canceled: false, items };
}

async function readHostState() {
  try {
    return JSON.parse(await fs.readFile(HOST_STATE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

async function writeHostState(patch) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const current = await readHostState();
  await fs.writeFile(HOST_STATE_PATH, JSON.stringify({ ...current, ...patch }, null, 2));
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findFreePort(startPort) {
  for (let port = startPort; port < startPort + 80; port += 1) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free local port found near ${startPort}`);
}

function readControlJson(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function sendControlJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

// Capture hide/restore applies to ALL presence windows — a screen capture is a
// global operation, so every orb must vanish for the screenshot and reappear
// afterward. Depth is tracked with the host-global counter.
function hidePresenceForCapture() {
  if (captureHideDepth === 0) {
    captureWasVisible = false;
    for (const win of presenceWindows.values()) {
      if (win && !win.isDestroyed() && win.isVisible()) {
        captureWasVisible = true;
        try { win.hide(); } catch { /* ignore */ }
      }
    }
  }
  captureHideDepth += 1;
  return { ok: true, hidden: captureWasVisible, depth: captureHideDepth };
}

function restorePresenceAfterCapture() {
  if (captureHideDepth > 0) captureHideDepth -= 1;
  if (captureHideDepth === 0 && captureWasVisible) {
    captureWasVisible = false;
    for (const [id, win] of presenceWindows) {
      if (win && !win.isDestroyed()) bringPresenceForward(id);
    }
  }
  return { ok: true, hidden: false, depth: captureHideDepth };
}

async function startHostControlServer() {
  if (hostControlUrl) return hostControlUrl;
  const port = await findFreePort(Number(process.env.BOR_HOST_CONTROL_PORT || 7797));
  hostControlServer = http.createServer(async (req, res) => {
    try {
      if (req.socket.remoteAddress && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) {
        return sendControlJson(res, 403, { error: 'local only' });
      }
      if (req.headers['x-bor-host-token'] !== hostControlToken) {
        return sendControlJson(res, 401, { error: 'unauthorized' });
      }
      if (req.url === '/api/host/health' && req.method === 'GET') {
        return sendControlJson(res, 200, { ok: true, app: 'Bed of Roses' });
      }
      if (req.url === '/api/host/presence-capture' && req.method === 'POST') {
        const body = await readControlJson(req);
        const result = body?.hidden ? hidePresenceForCapture() : restorePresenceAfterCapture();
        return sendControlJson(res, 200, result);
      }
      // The Swift helper POSTs here when the user clicks an empty area of
      // a widget preview — restoring the legacy registry contract: "the
      // tile/desktop preview shows the <thumbnail> as a live glanceable
      // preview; clicking opens the full <html>."
      if (req.url === '/api/host/open-surface' && req.method === 'POST') {
        const body = await readControlJson(req);
        const surfaceId = String(body?.surfaceId || '').trim();
        if (!surfaceId) return sendControlJson(res, 400, { error: 'surfaceId required' });
        // Route to the requested presence if known, else the default presence.
        const reqId = String(body?.presenceId || '').trim();
        const presenceId = (reqId && runtimeUrls.has(reqId)) ? reqId : defaultPresenceId;
        openSurface(presenceId, surfaceId).catch((err) => log(`open-surface from helper failed: ${err.message}`));
        return sendControlJson(res, 200, { ok: true });
      }
      return sendControlJson(res, 404, { error: 'not found' });
    } catch (error) {
      return sendControlJson(res, 500, { error: error.message || 'host control error' });
    }
  });
  await new Promise((resolve, reject) => {
    hostControlServer.once('error', reject);
    hostControlServer.listen(port, '127.0.0.1', resolve);
  });
  hostControlUrl = `http://127.0.0.1:${port}`;
  process.env.BOR_HOST_CONTROL_URL = hostControlUrl;
  process.env.BOR_HOST_CONTROL_TOKEN = hostControlToken;
  log(`host control ready ${hostControlUrl}`);
  return hostControlUrl;
}

// --- Native app wrappers (~/Applications) ----------------------------------
// Mirror every BOR-created app (kind:'app') as a thin .app bundle so it shows
// in Finder/Applications and Spotlight. Bundles are launch shims that ping the
// host control server to open the surface; see native-apps.cjs.

function resolveElectronBinary() {
  // In `electron v2/host/main.cjs`, process.execPath IS the Electron binary.
  return process.execPath;
}

async function registerWithLaunchServices(paths = []) {
  // Nudge Spotlight/LaunchServices to index freshly-written bundles. Best
  // effort — lsregister isn't guaranteed present and indexing happens anyway,
  // this just makes it immediate.
  if (!paths.length) return;
  const lsregister = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
  await Promise.all(paths.map((p) => new Promise((resolve) => {
    execFile(lsregister, ['-f', p], { timeout: 5000 }, () => resolve());
  })));
}

async function syncNativeAppWrappers({ immediate = false } = {}) {
  // First cut: native-app wrappers mirror the DEFAULT presence only.
  const presenceId = defaultPresenceId;
  if (!presenceId || !runtimeUrls.has(presenceId)) return;
  if (nativeAppsSyncInFlight) { nativeAppsResyncQueued = true; return; }
  nativeAppsSyncInFlight = true;
  try {
    const surfaces = (await fetchJson(presenceId, '/api/surfaces')).surfaces || [];
    const summary = await syncNativeApps({ surfaces, log: (m) => log(m) });
    if (summary.created || summary.updated || summary.pruned || summary.errors) {
      log(`native-apps: ${summary.created} created, ${summary.updated} updated, ${summary.pruned} pruned, ${summary.errors} errors (${summary.total} apps)`);
    }
    if (immediate || summary.created || summary.updated) {
      await registerWithLaunchServices(summary.paths || []).catch(() => {});
    }
  } catch (err) {
    log(`native-apps: sync failed: ${err.message}`);
  } finally {
    nativeAppsSyncInFlight = false;
    if (nativeAppsResyncQueued) {
      nativeAppsResyncQueued = false;
      setTimeout(() => syncNativeAppWrappers().catch(() => {}), 250);
    }
  }
}

async function startNativeAppSync() {
  try {
    await writeHostControlDiscovery({
      hostControlUrl,
      hostControlToken,
      electronPath: resolveElectronBinary(),
      mainScript: path.join(__dirname, 'main.cjs'),
      cwd: ROOT,
    });
  } catch (err) {
    log(`native-apps: could not write host-control discovery: ${err.message}`);
    return;
  }
  // Install/refresh the ~/Applications/Bed of Roses.app host wrapper so the app
  // itself is launchable from Finder/Spotlight. Idempotent; non-fatal.
  await writeMainAppWrapper({ log: (m) => log(m) }).then((p) => {
    if (p) registerWithLaunchServices([p]).catch(() => {});
  }).catch((err) => log(`native-apps: host wrapper failed: ${err.message}`));
  await syncNativeAppWrappers({ immediate: true });
  if (nativeAppsSyncTimer) clearInterval(nativeAppsSyncTimer);
  nativeAppsSyncTimer = setInterval(() => syncNativeAppWrappers().catch(() => {}), NATIVE_APPS_SYNC_INTERVAL_MS);
  if (typeof nativeAppsSyncTimer.unref === 'function') nativeAppsSyncTimer.unref();
}

async function fetchJson(presenceId, pathname, options = {}) {
  const base = runtimeUrls.get(presenceId);
  if (!base) throw new Error(`no runtime for presence ${presenceId}`);
  const res = await fetch(`${base}${pathname}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// Probe a runtime URL. When `expectPresenceId` is given, the responder must
// report that exact presence id — so we never mistake an orphan runtime from a
// prior session, another presence, or Electron's own network helper squatting
// on the port for the runtime we actually want.
async function probeRuntime(url, expectPresenceId = null) {
  try {
    const res = await fetch(`${url}/api/providers`, { signal: AbortSignal.timeout(700) });
    if (!res.ok) return false;
    if (!expectPresenceId) return true;
    const data = await res.json().catch(() => ({}));
    return data.presenceId === expectPresenceId;
  } catch {
    return false;
  }
}

// Spawn (and own) one Node runtime process per presence. Each runtime serves a
// single presence by setting BOR_DATA_DIR to that presence's root, on its own
// port. We deliberately do NOT adopt a runtime already on the port, and we
// ignore BOR_RUNTIME_URL for multi-presence — each presence must own its own
// process so they never share os-data. Returns the runtime URL.
async function startRuntime(entry) {
  // Choose a port: reuse the persisted one if still free AND not already claimed
  // by another presence this boot, else find a fresh one and persist it.
  // `_claimedPorts` guards against two presences booting close together (before
  // either binds) both picking the same port — the OS-level isPortFree check
  // alone can't see a sibling that hasn't listened yet.
  const taken = new Set(_claimedPorts);
  for (const u of runtimeUrls.values()) { try { taken.add(Number(new URL(u).port)); } catch { /* ignore */ } }
  let port = Number.isInteger(entry.port) ? entry.port : null;
  if (port && !taken.has(port) && await isPortFree(port)) {
    // keep persisted port
  } else {
    let candidate = await findFreePort(DEFAULT_PORT);
    while (taken.has(candidate)) candidate = await findFreePort(candidate + 1);
    port = candidate;
    await updatePresence(entry.id, { port }).catch((err) => log(`presences: could not persist port for ${entry.id}: ${err.message}`));
    entry.port = port;
  }
  _claimedPorts.add(port);

  const url = `http://127.0.0.1:${port}`;
  // Use `inherit` for stdout/stderr instead of `pipe` + on('data') forward.
  // The pipe path block-buffers small writes on macOS (~16KB pipe buffer +
  // Node's libuv async write queue), then Electron's main-thread event-loop
  // hiccups (BrowserWindow construction, IPC dispatch) drain the pipe in
  // bursts. The net effect: the runtime's per-chunk `process.stdout.write`
  // calls — paced at 25ms by emitChunkedCardEvents — arrive at the operator
  // terminal in 1-3 large bursts instead of 50 small ones. That makes it
  // LOOK like nothing is streaming even when the SSE side is healthy.
  //
  // `inherit` shares the parent's stdout/stderr file descriptors directly
  // with the child, bypassing libuv buffering on this hop entirely. Writes
  // appear on the terminal at the same cadence the runtime emits them.
  // The trade-off is the loss of the `[bor-runtime]` prefix; we now rely
  // on the runtime's own log prefixes (`[llm]`, `[gemini]`, etc) for source
  // attribution, which is actually clearer.
  //
  // IMPORTANT: always set BOR_DATA_DIR explicitly so a stray inherited value
  // can never make two presences share a data root.
  const proc = spawn(NODE_EXECUTABLE, [SERVER_ENTRY], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      BOR_DATA_DIR: entry.dataDir,
      BOR_HOST_MODE: 'v2',
      BOR_HOST_CONTROL_URL: hostControlUrl || '',
      BOR_HOST_CONTROL_TOKEN: hostControlToken,
      BOR_PRESENCE_ID: entry.id,
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  runtimeProcesses.set(entry.id, proc);
  proc.on('exit', (code, signal) => {
    log(`runtime[${entry.id}] exited (${signal || code})`);
    runtimeProcesses.delete(entry.id);
    runtimeUrls.delete(entry.id);
    _claimedPorts.delete(port);
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    // Verify it's OUR child for THIS presence — not an orphan on the same port.
    if (await probeRuntime(url, entry.id)) {
      runtimeUrls.set(entry.id, url);
      log(`started runtime[${entry.id}] ${url} (data ${entry.dataDir})`);
      return url;
    }
    // If our spawned child already died, stop waiting and fail fast.
    if (proc.exitCode !== null || proc.signalCode) {
      throw new Error(`Runtime for presence ${entry.id} exited during startup (${proc.signalCode || proc.exitCode})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Runtime for presence ${entry.id} did not become ready within 15s`);
}

/**
 * Locate the BedOfRosesHelper binary. In production builds the helper
 * ships as a notarized .app bundle under node_modules/bed-of-roses/bin/
 * (Phase 7 sets that up). In development we run from the SwiftPM build
 * output under swift-helper/.build/release/. Returns null if neither
 * exists — the launcher logs a warning and Electron falls back to its
 * own window code during the migration window.
 */
function resolveHelperBinary() {
  if (process.env.BOR_HELPER_BIN) {
    return process.env.BOR_HELPER_BIN;
  }
  const candidates = [
    // Bundled .app (Phase 7 distribution).
    path.join(ROOT, 'bin', 'BedOfRosesHelper.app', 'Contents', 'MacOS', 'BedOfRosesHelper'),
    path.join(ROOT, 'node_modules', 'bed-of-roses', 'bin', 'BedOfRosesHelper.app', 'Contents', 'MacOS', 'BedOfRosesHelper'),
    // SwiftPM dev output.
    path.join(ROOT, 'swift-helper', '.build', 'release', 'BedOfRosesHelper'),
    path.join(ROOT, 'swift-helper', '.build', 'debug', 'BedOfRosesHelper'),
  ];
  for (const candidate of candidates) {
    try {
      if (require('node:fs').existsSync(candidate)) return candidate;
    } catch { /* ignore */ }
  }
  return null;
}

async function probeHelper(url, token) {
  try {
    const res = await fetch(`${url}/health`, {
      headers: { 'x-bor-host-token': token },
      signal: AbortSignal.timeout(700),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Spawn the Swift helper alongside the runtime. Matches startRuntime()'s
 * shape: find a free port, spawn the binary, pipe stdout/stderr with a
 * [bor-helper] prefix, poll /health until ready. If the binary is missing
 * or fails to start, we log and continue — Electron's existing widget /
 * surface windows still work during the migration phases.
 */
async function startHelper() {
  if (process.platform !== 'darwin') {
    log('helper: non-macOS host; skipping (helper is mac-only)');
    return;
  }
  const binary = resolveHelperBinary();
  if (!binary) {
    log('helper: binary not found; Electron window fallback will be used. Run `npm run helper:build:dev` to build it from source.');
    return;
  }
  const port = await findFreePort(Number(process.env.BOR_HELPER_PORT || 7798));
  helperUrl = `http://127.0.0.1:${port}`;

  helperProcess = spawn(binary, [
    `--bor-helper-token=${helperToken}`,
    `--bor-helper-port=${port}`,
    `--bor-parent-pid=${process.pid}`,
    // Host-global helper points at the default presence's runtime.
    `--bor-runtime-url=${runtimeUrls.get(defaultPresenceId) || ''}`,
    `--bor-host-control-url=${hostControlUrl || ''}`,
    `--bor-host-control-token=${hostControlToken}`,
  ], {
    cwd: ROOT,
    env: { ...process.env, BOR_HELPER_TOKEN: helperToken, BOR_HELPER_URL: helperUrl },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  helperProcess.stdout.on('data', (chunk) => process.stdout.write(`[bor-helper] ${chunk}`));
  helperProcess.stderr.on('data', (chunk) => process.stderr.write(chunk)); // helper already prefixes its own log lines
  helperProcess.on('exit', (code, signal) => {
    log(`helper exited (${signal || code})`);
    helperProcess = null;
    helperUrl = null;
    process.env.BOR_HELPER_URL = '';
    // Auto-restart on unexpected exit — without this, a single helper
    // crash (e.g. the WindowRegistry segfault on surface close) leaves
    // every subsequent <create_widget> producing a file on disk but no
    // visible preview window. SIGTERM during app quit is the only
    // shutdown path we expect, so anything else is treated as a crash.
    if (helperShutdownRequested) return;
    const now = Date.now();
    while (helperCrashTimestamps.length && now - helperCrashTimestamps[0] > HELPER_RESTART_WINDOW_MS) {
      helperCrashTimestamps.shift();
    }
    helperCrashTimestamps.push(now);
    if (helperCrashTimestamps.length > HELPER_RESTART_MAX_CRASHES) {
      log(`helper: ${helperCrashTimestamps.length} crashes in ${HELPER_RESTART_WINDOW_MS / 1000}s — giving up auto-restart. Investigate the helper crash before relaunching.`);
      return;
    }
    log(`helper: scheduling auto-restart in ${HELPER_RESTART_BACKOFF_MS}ms (crash ${helperCrashTimestamps.length}/${HELPER_RESTART_MAX_CRASHES} in window)`);
    setTimeout(() => {
      if (helperShutdownRequested || helperProcess) return;
      startHelper().catch((err) => log(`helper restart failed: ${err.message}`));
    }, HELPER_RESTART_BACKOFF_MS);
  });
  helperProcess.on('error', (err) => {
    log(`helper failed to spawn: ${err.message}`);
    helperProcess = null;
    helperUrl = null;
    process.env.BOR_HELPER_URL = '';
  });

  // Surface helper status in environment so the Node runtime + presence
  // can talk to it directly when Phase 3 wires those paths.
  process.env.BOR_HELPER_URL = helperUrl;
  process.env.BOR_HELPER_TOKEN = helperToken;

  const startedAt = Date.now();
  while (Date.now() - startedAt < 8_000) {
    if (helperProcess && (await probeHelper(helperUrl, helperToken))) {
      log(`started helper ${helperUrl} (pid ${helperProcess.pid})`);
      return;
    }
    if (!helperProcess) {
      log('helper: process died before becoming ready');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  log('helper: did not become ready within 8s; Electron fallback remains in effect');
}

function providerConfigured(config) {
  const providerId = config?.defaultProvider;
  return Boolean(providerId && config?.providers?.[providerId]?.configured);
}

function onboardingComplete(config) {
  return Boolean(
    config?.aiName
    && config?.avatarStyle
    && config?.avatarColor
    && config?.baseTheme
    && providerConfigured(config)
  );
}

async function getPublicConfig(presenceId) {
  return (await fetchJson(presenceId, '/api/config')).config || null;
}

// True if ANY onboarding window is still open — used to decide whether the dock
// should stay visible (onboarding wants a normal dock app; presences hide it).
function hasOpenOnboarding() {
  for (const win of onboardingWindows.values()) {
    if (win && !win.isDestroyed()) return true;
  }
  return false;
}

function createOnboardingWindow(entry) {
  const existing = onboardingWindows.get(entry.id);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return existing;
  }

  showDockForSetup();
  allowOnboardingClose = false;
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 940,
    minHeight: 680,
    title: 'Bed of Roses setup',
    show: false,
    backgroundColor: '#050409',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.borPresenceId = entry.id;
  onboardingWindows.set(entry.id, win);
  // Surface above the always-on-top Main app and onto the current Space (incl.
  // fullscreen) — same treatment as the Main app + presence orb windows.
  // Without this the onboarding window opens BEHIND the screen-saver-level Main
  // app (and on a different Space when fullscreen), so it looks like onboarding
  // never appears and "Finish setup" does nothing.
  try {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setAlwaysOnTop(true, 'screen-saver');
  } catch { /* non-macOS / unsupported */ }
  win.on('close', (event) => {
    if (allowOnboardingClose) return;
    event.preventDefault();
    getPublicConfig(entry.id)
      .then((config) => {
        if (onboardingComplete(config)) {
          allowOnboardingClose = true;
          win.close();
          return;
        }
        log('prevented onboarding close before setup completed');
        win.show();
        win.focus();
      })
      .catch(() => {
        log('prevented onboarding close while setup state was unavailable');
        win.show();
        win.focus();
      });
  });
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    log(`onboarding render process gone: ${details.reason || 'unknown'}`);
  });
  win.webContents.on('did-fail-load', (_event, code, description) => {
    log(`onboarding failed to load: ${code} ${description}`);
  });
  win.on('closed', () => {
    log(`onboarding window closed (${entry.id})`);
    onboardingWindows.delete(entry.id);
  });
  win.loadURL(`${runtimeUrls.get(entry.id)}/?host=v2`);

  const timer = setInterval(async () => {
    if (win.isDestroyed()) {
      clearInterval(timer);
      return;
    }
    try {
      const config = await getPublicConfig(entry.id);
      if (onboardingComplete(config)) {
        clearInterval(timer);
        allowOnboardingClose = true;
        win.close();
        await updatePresence(entry.id, { onboarded: true }).catch(() => {});
        entry.onboarded = true;
        await createPresenceWindow(entry);
        syncWidgetPreviews(entry.id).catch((error) => log(`widget preview sync failed: ${error.message}`));
        if (entry.id === defaultPresenceId) queueWallpaperApply(config);
        // Only hide the dock once no onboarding window remains open.
        if (!hasOpenOnboarding()) hideDockForPresence();
      }
    } catch {
      // Runtime may still be settling.
    }
  }, 1200);

  return win;
}

function presenceSizeForMode(mode) {
  return PRESENCE_SIZES[mode] || PRESENCE_SIZES.collapsed;
}

function orbCenterForMode(mode) {
  return mode === 'collapsed' || mode === 'collapsed-notification' || mode === 'minimized'
    ? PRESENCE_COLLAPSED_ORB_CENTER
    : PRESENCE_ORB_CENTER;
}

function presenceModeForBounds(bounds) {
  if (!bounds || (bounds.width <= 72 && bounds.height <= 72)) return 'collapsed';
  if (bounds.width >= 220 && bounds.width < 340 && bounds.height <= 82) return 'collapsed-notification';
  if (bounds.width >= 580 && bounds.height >= 500) return 'thinking';
  if (bounds.width >= 150 && bounds.width < 260 && bounds.height <= 72) return 'minimized';
  return 'expanded';
}

function displayForPoint(point) {
  const displays = screen.getAllDisplays();
  const display = displays.find(({ workArea }) => (
    point.x >= workArea.x
    && point.x <= workArea.x + workArea.width
    && point.y >= workArea.y
    && point.y <= workArea.y + workArea.height
  ));
  if (display) return display.workArea;
  return screen.getDisplayNearestPoint({ x: Math.round(point.x), y: Math.round(point.y) }).workArea;
}

function fallbackOrbPoint(display = screen.getPrimaryDisplay().workArea) {
  return {
    x: display.x + display.width - PRESENCE_COLLAPSED_ORB_CENTER - 18,
    y: display.y + display.height - PRESENCE_COLLAPSED_ORB_CENTER - 26,
  };
}

function orbPointForBounds(bounds, mode = 'collapsed', anchor = 'bottom-right') {
  if (!bounds) return fallbackOrbPoint();
  if (mode === 'collapsed') {
    return {
      x: bounds.x + PRESENCE_COLLAPSED_ORB_CENTER,
      y: bounds.y + PRESENCE_COLLAPSED_ORB_CENTER,
    };
  }
  const horizontal = anchor.endsWith('right') ? 'right' : 'left';
  const vertical = anchor.startsWith('top') ? 'top' : 'bottom';
  const center = orbCenterForMode(mode);
  return {
    x: horizontal === 'right'
      ? bounds.x + bounds.width - center
      : bounds.x + center,
    y: vertical === 'top'
      ? bounds.y + center
      : bounds.y + bounds.height - center,
  };
}

function anchorForPoint(point, display = displayForPoint(point)) {
  const leftEdge = display.x + PRESENCE_EDGE_FLIP_PX;
  const rightEdge = display.x + display.width - PRESENCE_EDGE_FLIP_PX;
  const topEdge = display.y + PRESENCE_EDGE_FLIP_PX;
  const bottomEdge = display.y + display.height - PRESENCE_EDGE_FLIP_PX;

  const horizontal = point.x <= leftEdge
    ? 'left'
    : point.x >= rightEdge
      ? 'right'
      : point.x < display.x + display.width / 2 ? 'left' : 'right';
  const vertical = point.y <= topEdge
    ? 'top'
    : point.y >= bottomEdge
      ? 'bottom'
      : point.y < display.y + display.height / 2 ? 'top' : 'bottom';

  return `${vertical}-${horizontal}`;
}

function boundsForAnchor(point, size, anchor, display = displayForPoint(point), mode = 'thinking') {
  const horizontal = anchor.endsWith('right') ? 'right' : 'left';
  const vertical = anchor.startsWith('top') ? 'top' : 'bottom';
  const center = orbCenterForMode(mode);
  const x = horizontal === 'right'
    ? point.x - size.width + center
    : point.x - center;
  const y = vertical === 'top'
    ? point.y - center
    : point.y - size.height + center;
  return clampBounds({ ...size, x, y }, display);
}

function presenceLayoutForMode(mode, currentBounds, currentMode = 'collapsed', currentAnchor = 'bottom-right') {
  const size = presenceSizeForMode(mode);
  const sourcePoint = currentBounds
    ? orbPointForBounds(currentBounds, currentMode, currentAnchor)
    : fallbackOrbPoint();
  const display = displayForPoint(sourcePoint);

  if (mode === 'collapsed') {
    const bounds = clampBounds({
      ...size,
      x: sourcePoint.x - PRESENCE_COLLAPSED_ORB_CENTER,
      y: sourcePoint.y - PRESENCE_COLLAPSED_ORB_CENTER,
    }, display);
    return { anchor: anchorForPoint(orbPointForBounds(bounds, 'collapsed'), display), bounds };
  }

  const anchor = anchorForPoint(sourcePoint, display);
  return { anchor, bounds: boundsForAnchor(sourcePoint, size, anchor, display, mode) };
}

function presenceBoundsForMode(mode, currentBounds) {
  return presenceLayoutForMode(mode, currentBounds).bounds;
}

function presenceSizeMatchesMode(bounds, mode) {
  const size = presenceSizeForMode(mode);
  return Math.abs(Number(bounds?.width) - size.width) <= 1
    && Math.abs(Number(bounds?.height) - size.height) <= 1;
}

function clampPresenceBounds(bounds) {
  return clampBounds(bounds);
}

function sendPresenceLayout(id, bounds = null) {
  const win = presenceWindows.get(id);
  if (!win || win.isDestroyed()) return;
  const st = getPresenceState(id);
  win.webContents.send('bor:presence-layout', {
    mode: st.mode,
    anchor: st.anchor,
    bounds: bounds || win.getBounds(),
  });
}

function bringPresenceForward(id, bounds = null) {
  const win = presenceWindows.get(id);
  if (!win || win.isDestroyed()) return;
  if (bounds) win.setBounds(bounds, false);
  win.setOpacity(1);
  // Start click-through: the orb window is a big TRANSPARENT rectangle, so if it
  // captured the whole area it would block clicks to apps underneath (Chrome,
  // etc.). The renderer re-enables capture only while the cursor is actually
  // over the orb/bubble (see bor:set-mouse-ignore + presence.js hit-testing).
  win.setIgnoreMouseEvents(true, { forward: true });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.showInactive();
  if (typeof win.moveTop === 'function') win.moveTop();
}

function runtimeOrigin() {
  // Any valid http origin works for the YouTube Referer hack; use the default
  // presence's runtime when available.
  const url = runtimeUrls.get(defaultPresenceId);
  try {
    return new URL(url || `http://127.0.0.1:${DEFAULT_PORT}`).origin;
  } catch {
    return `http://127.0.0.1:${DEFAULT_PORT}`;
  }
}

function installMediaRequestHeaders() {
  if (mediaRequestHeadersInstalled) return;
  mediaRequestHeadersInstalled = true;
  // The presence window is loaded via loadFile() so its origin is file://.
  // YouTube's embed (youtube-nocookie.com) checks Referer to decide whether
  // to grant the embed, and a missing/file:// Referer triggers a refusal.
  // We force a valid Referer ONLY on the embed HTML/JS/CSS — sub-frames
  // and their scripts. We deliberately do NOT touch headers on the actual
  // video stream requests to googlevideo.com: those are issued by the
  // iframe's own JS and adding an Origin header (which we used to do)
  // triggers a CORS preflight that googlevideo.com isn't configured to
  // answer, causing the player to spin forever on "loading".
  const urls = [
    '*://*.youtube.com/*',
    '*://*.youtube-nocookie.com/*',
    '*://*.ytimg.com/*',
    '*://*.ggpht.com/*',
  ];
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls }, (details, callback) => {
    const headers = { ...details.requestHeaders };
    // Only set Referer on resources that need to look like they came from
    // an HTTP origin — the embed HTML and its immediate scripts/styles.
    // Leave 'media' (the actual video chunks) and 'xhr' (player stats /
    // progressive download negotiation) alone.
    if (details.resourceType !== 'media' && details.resourceType !== 'xhr') {
      headers.Referer = `${runtimeOrigin()}/`;
    }
    callback({ requestHeaders: headers });
  });
}

function installPresenceHotReload() {
  if (presenceHotReloadInstalled) return;
  presenceHotReloadInstalled = true;
  const files = ['presence.html', 'presence.css', 'presence.js', 'preload.cjs']
    .map((file) => path.join(__dirname, file));
  let timer = null;
  for (const file of files) {
    try {
      const watcher = watch(file, () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          log(`hot reloading ${path.basename(file)}`);
          for (const win of presenceWindows.values()) {
            if (win && !win.isDestroyed()) win.webContents.reloadIgnoringCache();
          }
        }, 120);
      });
      if (typeof watcher.unref === 'function') watcher.unref();
    } catch (error) {
      log(`hot reload watch failed for ${path.basename(file)}: ${error.message}`);
    }
  }
}

// Global cursor poll — the drag-drop enabler. The presence window is
// click-through (setIgnoreMouseEvents) and the renderer flips it to capturing
// via forwarded mousemove. Native file drags (e.g. a screenshot dragged from
// Finder) DON'T deliver mousemove, so without this the window stays
// click-through and the drop falls through to whatever is behind it (the
// terminal/desktop). Polling the global cursor works during a drag; we feed
// window-relative coords to the renderer so its existing precise hit-test runs
// and captures the window before the drop lands.
let cursorPollTimer = null;
const cursorInsidePresence = new Map(); // win.id -> bool
function startCursorPoll() {
  if (cursorPollTimer) return;
  cursorPollTimer = setInterval(() => {
    let pt;
    try { pt = screen.getCursorScreenPoint(); } catch { return; }
    for (const win of presenceWindows.values()) {
      if (!win || win.isDestroyed() || !win.isVisible()) continue;
      let b;
      try { b = win.getBounds(); } catch { continue; }
      const inside = pt.x >= b.x && pt.x < b.x + b.width && pt.y >= b.y && pt.y < b.y + b.height;
      const was = cursorInsidePresence.get(win.id) || false;
      if (inside) {
        cursorInsidePresence.set(win.id, true);
        try { win.webContents.send('bor:cursor-poll', { x: pt.x - b.x, y: pt.y - b.y }); } catch { /* window gone */ }
      } else if (was) {
        cursorInsidePresence.set(win.id, false);
        try { win.webContents.send('bor:cursor-poll', null); } catch { /* window gone */ }
      }
    }
  }, 80);
  if (typeof cursorPollTimer.unref === 'function') cursorPollTimer.unref();
}

async function createPresenceWindow(entry) {
  const existing = presenceWindows.get(entry.id);
  if (existing && !existing.isDestroyed()) {
    bringPresenceForward(entry.id);
    return existing;
  }

  const st = getPresenceState(entry.id);
  // Per-presence geometry now lives in the registry entry (bounds/anchor),
  // not in v2-host.json. We always open collapsed.
  const saved = entry.bounds || null;
  st.anchor = entry.anchor || st.anchor;
  st.mode = 'collapsed';
  const initialLayout = presenceLayoutForMode('collapsed', saved, 'collapsed', st.anchor);
  st.anchor = initialLayout.anchor;

  // Cascade new orbs so multiple presences don't perfectly stack — offset each
  // additional orb down-right within its work area before clamping.
  let bounds = initialLayout.bounds;
  if (!saved && presenceWindows.size > 0) {
    const display = displayForPoint({ x: bounds.x, y: bounds.y });
    const offset = 48 * presenceWindows.size;
    bounds = clampBounds({ ...bounds, x: bounds.x - offset, y: bounds.y - offset }, display);
    st.anchor = anchorForPoint(orbPointForBounds(bounds, 'collapsed'), display);
  }

  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    show: false,
    paintWhenInitiallyHidden: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    title: 'Bed of Roses presence',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--bor-runtime-url=${runtimeUrls.get(entry.id)}`, `--bor-presence-id=${entry.id}`],
      // CRITICAL — keep timers (setTimeout / scheduleBubbleRender) running
      // at full rate when the presence orb is not the foreground window.
      // Chromium's default is to throttle setTimeout in non-foreground
      // windows to ~1000ms minimum, which collapses our 25-30ms streaming
      // chunks into one render at the end of the stream. This is the
      // single biggest cause of "the editor card appears all at once
      // instead of streaming live."
      backgroundThrottling: false,
    },
  });
  win.borPresenceId = entry.id;
  const winId = win.id;
  presenceWindows.set(entry.id, win);
  startCursorPoll();
  // Belt-and-suspenders — the webPreferences flag is honored at window
  // creation, but call setBackgroundThrottling explicitly so a future
  // Electron upgrade can't silently re-throttle us.
  try { win.webContents.setBackgroundThrottling(false); } catch { /* not available on older Electron */ }
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, 'presence.html'));
  installPresenceHotReload();
  win.once('ready-to-show', () => {
    bringPresenceForward(entry.id, bounds);
  });
  win.webContents.once('did-finish-load', () => {
    sendPresenceLayout(entry.id, bounds);
    bringPresenceForward(entry.id, bounds);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    log(`presence[${entry.id}] render process gone: ${details.reason || 'unknown'}`);
  });
  win.webContents.on('did-fail-load', (_event, code, description) => {
    log(`presence[${entry.id}] failed to load: ${code} ${description}`);
  });
  win.on('moved', () => {
    if (win.isDestroyed()) return;
    const moved = win.getBounds();
    const state = getPresenceState(entry.id);
    if (state.mode === 'collapsed') {
      state.anchor = anchorForPoint(orbPointForBounds(moved, 'collapsed'));
      sendPresenceLayout(entry.id, moved);
    }
    updatePresence(entry.id, { bounds: moved, anchor: state.anchor }).catch(() => {});
  });
  win.on('closed', () => { presenceWindows.delete(entry.id); cursorInsidePresence.delete(winId); });
  return win;
}

function widgetSizeToBounds(surface) {
  // Full-surface dimensions opened when the user clicks a widget
  // preview. Roughly 2.5–3× the thumbnail dimensions so the widget has
  // room to expand into an interactive view. Mirrors the five canonical
  // thumbnail sizes in widgetPreviewSize / widget-thumbnails.md.
  if (surface.kind === 'app') return { width: 1040, height: 740 };
  const map = {
    '2x05': { width: 600, height: 220 },
    '2x1':  { width: 620, height: 360 },
    '2x3':  { width: 620, height: 520 },
    '1x2':  { width: 380, height: 620 },
    '3x2':  { width: 900, height: 520 },
  };
  return map[surface.size] || map['2x1'];
}

function widgetPreviewSize(surface) {
  const layout = surface?.layout || {};
  const width = Number(layout.width);
  const height = Number(layout.height);
  // Persisted layout from a prior drag wins, with a floor that's still
  // large enough to be legible (the user can drag-resize at any point).
  if (Number.isFinite(width) && Number.isFinite(height) && width >= 120 && height >= 64) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  // The five canonical thumbnail sizes — see
  // design-guideline/widget-thumbnails.md. These are exact pixel
  // dimensions; widgets are designed at these sizes and never at
  // arbitrary in-betweens. Square sizes (1x1, 2x2) are disallowed.
  const map = {
    '2x05': { width: 240, height: 80 },   // Compact banner   — 3:1
    '2x1':  { width: 240, height: 144 },  // Standard banner  — 5:3 (default)
    '2x3':  { width: 240, height: 200 },  // Card             — 6:5
    '1x2':  { width: 144, height: 240 },  // Tall column      — 3:5
    '3x2':  { width: 360, height: 200 },  // Dashboard        — 9:5
  };
  return map[surface?.size] || map['2x1'];
}

function widgetPreviewBounds(surface, index = 0) {
  const display = screen.getPrimaryDisplay().workArea;
  const size = widgetPreviewSize(surface);
  const layout = surface?.layout || {};
  const hasPosition = Number.isFinite(Number(layout.x)) && Number.isFinite(Number(layout.y));
  const gap = 22;
  const x = hasPosition
    ? Number(layout.x)
    : display.x + display.width - size.width - 28 - Math.floor(index / 3) * (size.width + gap);
  const y = hasPosition
    ? Number(layout.y)
    : display.y + 28 + (index % 3) * (size.height + gap);
  return clampBounds({ ...size, x, y }, display);
}

function clampBounds(bounds, display = screen.getDisplayMatching(bounds).workArea) {
  return {
    ...bounds,
    x: Math.max(display.x, Math.min(display.x + display.width - bounds.width, Math.round(bounds.x))),
    y: Math.max(display.y, Math.min(display.y + display.height - bounds.height, Math.round(bounds.y))),
  };
}

async function resolveSurface(presenceId, surfaceOrId) {
  if (surfaceOrId && typeof surfaceOrId === 'object') return surfaceOrId;
  const { surfaces: widgets } = await fetchJson(presenceId, '/api/surfaces');
  return widgets.find((surface) => surface.id === surfaceOrId) || null;
}

async function patchWidgetLayout(presenceId, id, bounds) {
  return fetchJson(presenceId, `/api/surfaces/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      layout: {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      },
    }),
  }).catch(() => null);
}

async function bridgePreviewMessage(presenceId, surfaceId, message) {
  if (!surfaceId) return { error: 'surface id missing' };
  switch (message.type) {
    case 'state-get': {
      const data = await fetchJson(presenceId, `/api/surfaces/${encodeURIComponent(surfaceId)}/state`);
      previewStateRevisions.set(surfaceId, data.revision || null);
      return { state: data.state || {} };
    }
    case 'state-set': {
      const data = await fetchJson(presenceId, `/api/surfaces/${encodeURIComponent(surfaceId)}/state`, {
        method: 'POST',
        body: JSON.stringify({
          __borStateEnvelope: true,
          state: message.state || {},
          baseRevision: previewStateRevisions.get(surfaceId) || null,
        }),
      });
      previewStateRevisions.set(surfaceId, data.revision || null);
      reloadSurfaceViews(surfaceId, { includeSurface: false });
      return { ok: true, bytes: data.bytes };
    }
    case 'llm-request':
      return fetchJson(presenceId, '/api/surface-llm', {
        method: 'POST',
        body: JSON.stringify({
          surfaceId,
          prompt: message.prompt,
          system: message.system,
          images: message.images,
        }),
      });
    case 'web-search':
      return fetchJson(presenceId, '/api/surface-search', {
        method: 'POST',
        body: JSON.stringify({ surfaceId, query: message.query, limit: message.limit }),
      });
    case 'web-fetch':
      return fetchJson(presenceId, '/api/surface-fetch', {
        method: 'POST',
        body: JSON.stringify({ surfaceId, url: message.url }),
      });
    case 'image-generate':
      return fetchJson(presenceId, '/api/surface-image-gen', {
        method: 'POST',
        body: JSON.stringify({ surfaceId, prompt: message.prompt, size: message.size }),
      });
    default:
      return null;
  }
}

function reloadSurfaceViews(surfaceId, { includeSurface = true, includePreview = true } = {}) {
  if (!surfaceId) return;
  if (includeSurface) {
    const surface = surfaceWindows.get(surfaceId);
    if (surface && !surface.isDestroyed()) {
      surface.webContents.reloadIgnoringCache();
    }
  }
  if (includePreview) {
    const preview = widgetPreviewWindows.get(surfaceId);
    if (preview && !preview.isDestroyed()) {
      preview.webContents.reloadIgnoringCache();
    }
  }
}

/**
 * Phase 4: when BOR_USE_SWIFT_PREVIEWS=1 and the helper is reachable,
 * delegate widget-preview window creation to the Swift helper. The helper
 * loads the widget's HTML directly at preview size in a WKWebView (no
 * thumbnail-iframe dance) — same approach Apple's WidgetKit takes: the
 * widget renders itself at whatever size the window is, responsive via
 * CSS media queries. The legacy widget-preview.html / iframe path stays
 * unused but in tree as a rollback option through Phase 5.
 */
async function tryOpenPreviewViaHelper(presenceId, surface, index) {
  if (process.env.BOR_USE_SWIFT_PREVIEWS === '0') return null;
  if (!shouldUseHelper()) return null;
  if (!surface?.id || surface.kind === 'app') return null;
  const runtimeUrl = runtimeUrls.get(presenceId);
  if (!runtimeUrl) return null;
  const bounds = widgetPreviewBounds(surface, index);
  try {
    const res = await fetch(`${helperUrl}/window/open`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bor-host-token': helperToken },
      body: JSON.stringify({
        // Preview windowKey is distinct from the eventual surface so
        // clicking the preview can open a separate larger surface window
        // — they coexist (the preview keeps living on the desktop).
        windowKey: `${surface.id}::preview`,
        surfaceId: surface.id,
        kind: 'widget',
        url: `${runtimeUrl}/widgets/${encodeURIComponent(surface.id)}/widget.html`,
        title: `${surface.name || 'Widget'} preview`,
        bounds: {
          x: Math.round(bounds.x),
          y: Math.round(bounds.y),
          width: Math.round(bounds.width),
          height: Math.round(bounds.height),
        },
      }),
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) {
      log(`helper preview open returned ${res.status}; falling back to Electron`);
      return null;
    }
    log(`opened preview ${surface.id} via Swift helper`);
    return { ok: true, id: surface.id, host: 'swift' };
  } catch (err) {
    log(`helper preview open failed: ${err.message}; falling back to Electron`);
    return null;
  }
}

async function openWidgetPreview(presenceId, surfaceOrId, index = 0) {
  const surface = await resolveSurface(presenceId, surfaceOrId);
  if (!surface?.id || surface.kind === 'app') return null;
  const runtimeUrl = runtimeUrls.get(presenceId);
  if (!runtimeUrl) return null;
  const existing = widgetPreviewWindows.get(surface.id);
  if (existing && !existing.isDestroyed()) {
    existing.webContents.reloadIgnoringCache();
    existing.setAlwaysOnTop(false);
    return existing;
  }

  // Swift-helper cutover gated by flag during Phases 4-5. When flag is on
  // AND helper succeeds, we return a sentinel and skip Electron window
  // creation entirely. When unset/failed we fall through.
  const viaSwift = await tryOpenPreviewViaHelper(presenceId, surface, index);
  if (viaSwift) return viaSwift;

  const bounds = widgetPreviewBounds(surface, index);
  // Widget previews should behave like real macOS desktop widgets — pinned
  // to the main desktop Space, NOT visible inside fullscreen-app Spaces or
  // other Mission Control workspaces.
  //
  // macOS controls this via NSWindow collectionBehavior:
  //   * CanJoinAllSpaces (off here) — if on, window appears on EVERY Space
  //     including the one the user happens to be on. Too aggressive.
  //   * FullScreenAuxiliary (off here) — if on, window appears inside
  //     fullscreen-app auxiliary Spaces. We explicitly don't want this —
  //     the widget should disappear when the user is in fullscreen Chrome
  //     or fullscreen Terminal.
  //
  // With both flags off, macOS treats the window as a "normal" window. If
  // the user is currently on a fullscreen-app Space (which can't host
  // non-fullscreen-aux windows), macOS automatically sends the window to
  // a regular Mission Control Space — typically Space 1 (the home
  // desktop). That's exactly the behavior we want.
  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    focusable: true,
    acceptFirstMouse: true,
    skipTaskbar: true,
    hasShadow: false,
    title: `${surface.name || 'Widget'} preview`,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preview-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--bor-runtime-url=${runtimeUrl}`, `--bor-surface-id=${surface.id}`, `--bor-presence-id=${presenceId}`],
    },
  });
  win.borPresenceId = presenceId;
  widgetPreviewWindows.set(surface.id, win);
  win.setAlwaysOnTop(false);
  // Explicitly pin to a single Space (off = not all-spaces), and don't
  // request fullscreen-aux visibility. macOS will place this on a regular
  // desktop Space — when the user is in a fullscreen app, that means
  // Space 1 (home desktop).
  win.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: false });
  win.once('ready-to-show', () => {
    win.showInactive();
  });
  win.on('moved', () => patchWidgetLayout(presenceId, surface.id, win.getBounds()));
  win.on('closed', () => widgetPreviewWindows.delete(surface.id));
  await win.loadFile(path.join(__dirname, 'widget-preview.html'));
  return win;
}

// --- MCP marketplace window -------------------------------------------------
// One window, reused across opens. Hidden (not destroyed) on close, so the
// catalog the renderer already holds is instantly there on the next open.
let mcpMarketplaceWindow = null;

function openMcpMarketplace(presenceId) {
  if (!presenceId || !runtimeUrls.has(presenceId)) return;
  if (mcpMarketplaceWindow && !mcpMarketplaceWindow.isDestroyed()) {
    mcpMarketplaceWindow.borPresenceId = presenceId; // serve whichever presence asked
    mcpMarketplaceWindow.show();
    mcpMarketplaceWindow.focus();
    mcpMarketplaceWindow.webContents.send('bor:mcp-shown');
    return;
  }
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 560,
    minHeight: 440,
    title: 'MCP Marketplace',
    backgroundColor: '#fbfbfa',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'mcp-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.borPresenceId = presenceId;
  mcpMarketplaceWindow = win;
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  // Hide instead of destroy unless the app is actually quitting.
  win.on('close', (e) => {
    if (helperShutdownRequested) return;
    e.preventDefault();
    win.hide();
  });
  win.on('closed', () => { mcpMarketplaceWindow = null; });
  win.loadFile(path.join(__dirname, 'mcp-marketplace.html'));
}

async function syncWidgetPreviews(presenceId = defaultPresenceId) {
  if (!presenceId || !runtimeUrls.has(presenceId)) return;
  const { surfaces: widgets } = await fetchJson(presenceId, '/api/surfaces');
  const widgetSurfaces = (widgets || []).filter((surface) => surface.kind !== 'app');
  const activeIds = new Set(widgetSurfaces.map((surface) => surface.id));
  for (const [id, win] of widgetPreviewWindows) {
    if (!activeIds.has(id) && !win.isDestroyed()) win.close();
  }
  await Promise.all(widgetSurfaces.map((surface, index) => openWidgetPreview(presenceId, surface, index).catch((error) => {
    log(`widget preview failed for ${surface.id}: ${error.message}`);
  })));
}

/**
 * Phase 3: when BOR_USE_SWIFT_APP_WINDOWS=1 and the helper is reachable,
 * delegate surface creation to the Swift helper. The helper opens an
 * NSWindow at the runtime widget URL, hosts it in a WKWebView, and runs
 * the bridge polyfill so `parent.postMessage(...)` calls hit
 * /api/surface-* on the Node runtime — same contract as surface-preload.cjs.
 *
 * On any failure (helper down, network error, non-2xx response) we return
 * `null` and the caller falls back to the existing Electron BrowserWindow
 * path below.
 */
function shouldUseHelper() {
  // Helper-on-by-default once it's reachable. Users can force the legacy
  // Electron path with BOR_USE_LEGACY_WINDOWS=1 during the migration if
  // they hit something unexpected. The original Phase 3/4 flags
  // (BOR_USE_SWIFT_APP_WINDOWS / BOR_USE_SWIFT_PREVIEWS) still work as
  // explicit overrides — setting either to "0" disables that path.
  if (process.env.BOR_USE_LEGACY_WINDOWS === '1') return false;
  return Boolean(helperUrl);
}

async function tryOpenSurfaceViaHelper(presenceId, surface) {
  if (process.env.BOR_USE_SWIFT_APP_WINDOWS === '0') return null;
  if (!shouldUseHelper()) return null;
  const runtimeUrl = runtimeUrls.get(presenceId);
  if (!runtimeUrl) return null;
  const size = widgetSizeToBounds(surface);
  const layout = surface?.layout || {};
  const display = screen.getPrimaryDisplay().workArea;
  const bounds = {
    x: Number.isFinite(Number(layout.x)) ? Number(layout.x) : Math.round(display.x + (display.width - size.width) / 2),
    y: Number.isFinite(Number(layout.y)) ? Number(layout.y) : Math.round(display.y + (display.height - size.height) / 2),
    width: size.width,
    height: size.height,
  };
  try {
    const res = await fetch(`${helperUrl}/window/open`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bor-host-token': helperToken },
      body: JSON.stringify({
        // Distinct windowKey from the preview so they coexist as separate
        // NSWindows — the preview stays on the desktop, the surface opens
        // as a new larger window. surfaceId stays untouched so bridge
        // calls (state-get/set/etc) still route to the same widget.
        windowKey: `${surface.id}::surface`,
        surfaceId: surface.id,
        kind: surface.kind === 'app' ? 'app' : 'widget',
        url: `${runtimeUrl}/widgets/${encodeURIComponent(surface.id)}/widget.html`,
        title: surface.name || 'Bed of Roses surface',
        bounds,
      }),
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) {
      log(`helper /window/open returned ${res.status}; falling back to Electron`);
      return null;
    }
    log(`opened surface ${surface.id} via Swift helper`);
    await fetchJson(presenceId, '/api/memory/event', {
      method: 'POST',
      body: JSON.stringify({ kind: 'widget.open', id: surface.id, name: surface.name, host: 'v2-swift' }),
    }).catch(() => {});
    return { ok: true, id: surface.id, host: 'swift' };
  } catch (err) {
    log(`helper /window/open failed: ${err.message}; falling back to Electron`);
    return null;
  }
}

async function openSurface(presenceId, surfaceOrId) {
  if (!presenceId) presenceId = defaultPresenceId;
  const runtimeUrl = runtimeUrls.get(presenceId);
  if (!runtimeUrl) throw new Error(`no runtime for presence ${presenceId}`);
  const surface = await resolveSurface(presenceId, surfaceOrId);
  if (!surface?.id) throw new Error('Surface not found');
  const existing = surfaceWindows.get(surface.id);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return { ok: true, id: surface.id };
  }

  // Swift-helper cutover lives behind a flag. When unset (default during
  // Phases 3-5) we fall through to the existing Electron BrowserWindow
  // path so the migration can roll back per-surface or per-session.
  const viaSwift = await tryOpenSurfaceViaHelper(presenceId, surface);
  if (viaSwift) return viaSwift;

  const size = widgetSizeToBounds(surface);
  const win = new BrowserWindow({
    width: size.width,
    height: size.height,
    minWidth: surface.kind === 'app' ? 720 : 260,
    minHeight: surface.kind === 'app' ? 520 : 220,
    title: surface.name || 'Bed of Roses surface',
    show: false,
    backgroundColor: '#050409',
    webPreferences: {
      preload: path.join(__dirname, 'surface-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--bor-runtime-url=${runtimeUrl}`, `--bor-surface-id=${surface.id}`, `--bor-presence-id=${presenceId}`],
    },
  });
  win.borPresenceId = presenceId;
  surfaceWindows.set(surface.id, win);
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => surfaceWindows.delete(surface.id));
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  await win.loadURL(`${runtimeUrl}/widgets/${encodeURIComponent(surface.id)}/widget.html`);
  await fetchJson(presenceId, '/api/memory/event', {
    method: 'POST',
    body: JSON.stringify({ kind: 'widget.open', id: surface.id, name: surface.name, host: 'v2' }),
  }).catch(() => {});
  return { ok: true, id: surface.id };
}

function parseSseBlock(raw) {
  let event = 'message';
  const dataLines = [];
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    const idx = line.indexOf(':');
    const field = idx === -1 ? line : line.slice(0, idx);
    const value = idx === -1 ? '' : line.slice(idx + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    if (field === 'data') dataLines.push(value);
  }
  if (!dataLines.length) return null;
  let data;
  try { data = JSON.parse(dataLines.join('\n')); } catch { data = { raw: dataLines.join('\n') }; }
  return { event, data };
}

async function streamChatToRenderer(sender, requestId, messages) {
  // Route to the presence that owns the sender window. We do NOT fall back to
  // the default presence here — every orb has its own borPresenceId, and
  // misrouting to another presence's runtime is exactly what made two presences
  // appear to share one sequential stream.
  let presenceId = null;
  try { presenceId = BrowserWindow.fromWebContents(sender)?.borPresenceId || null; } catch { /* none */ }
  if (!presenceId) presenceId = defaultPresenceId;

  let runtimeUrl = runtimeUrls.get(presenceId);
  if (!runtimeUrl) {
    // This presence's own runtime isn't up (crashed, or never started due to a
    // port clash). Self-heal: start ITS runtime — never borrow another's.
    log(`chat: no runtime for ${presenceId}; starting it on demand`);
    try {
      const entry = await getPresence(presenceId);
      if (!entry) throw new Error(`unknown presence ${presenceId}`);
      runtimeUrl = await startRuntime(entry);
    } catch (err) {
      if (sender.isDestroyed && sender.isDestroyed()) return;
      sender.send('bor:chat-event', { requestId, event: 'error', data: { error: `could not start runtime for ${presenceId}: ${err.message}` } });
      return;
    }
  }
  // Supersede only THIS presence's own prior task — never another presence's.
  // Presences run independently and concurrently; aborting across presences was
  // why starting a task on one orb left the other stuck "thinking".
  for (const [id, active] of activeChatControllers) {
    if (id !== requestId && active.presenceId === presenceId) {
      try { active.abort(new Error('superseded by newer BOR task')); } catch { /* noop */ }
      activeChatControllers.delete(id);
    }
  }
  const controller = new AbortController();
  controller.presenceId = presenceId;
  activeChatControllers.set(requestId, controller);
  const sendChatEvent = (payload) => {
    if (activeChatControllers.get(requestId) !== controller) return;
    if (sender.isDestroyed && sender.isDestroyed()) return;
    sender.send('bor:chat-event', payload);
  };
  try {
    const res = await fetch(`${runtimeUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hostMode: 'v2', messages: Array.isArray(messages) ? messages : [] }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => '');
      sendChatEvent({ requestId, event: 'error', data: { error: body || `HTTP ${res.status}` } });
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let sep;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const parsed = parseSseBlock(raw);
        if (!parsed) continue;
        if (activeChatControllers.get(requestId) !== controller) break;
        sendChatEvent({ requestId, ...parsed });
        if (parsed.event === 'create_app' && parsed.data?.manifest) {
          openSurface(presenceId, parsed.data.manifest).catch((error) => {
            sendChatEvent({ requestId, event: 'surface_error', data: { error: error.message } });
          });
        }
        if ((parsed.event === 'launch_app' || parsed.event === 'launch_widget') && (parsed.data?.manifest || parsed.data?.id)) {
          openSurface(presenceId, parsed.data.manifest || parsed.data.id).catch((error) => {
            sendChatEvent({ requestId, event: 'surface_error', data: { error: error.message } });
          });
        }
        if (parsed.event === 'update_app' && parsed.data?.manifest?.id) {
          reloadSurfaceViews(parsed.data.manifest.id, { includePreview: false });
        }
        if ((parsed.event === 'create_widget' || parsed.event === 'update_widget') && parsed.data?.manifest) {
          openWidgetPreview(presenceId, parsed.data.manifest).catch((error) => {
            sendChatEvent({ requestId, event: 'surface_error', data: { error: error.message } });
          });
          if (parsed.event === 'update_widget' && parsed.data.manifest.id) {
            reloadSurfaceViews(parsed.data.manifest.id, { includePreview: false });
          }
        }
        if (parsed.event === 'mutate_surface_data' && parsed.data?.id) {
          reloadSurfaceViews(parsed.data.id);
        }
        if (parsed.event === 'delete_widget' && parsed.data?.id) {
          const preview = widgetPreviewWindows.get(parsed.data.id);
          if (preview && !preview.isDestroyed()) preview.close();
        }
        if (parsed.event === 'set_theme' && parsed.data?.config) queueWallpaperApply(parsed.data.config);
      }
      if (activeChatControllers.get(requestId) !== controller) return;
    }
  } catch (error) {
    if (controller.signal.aborted) {
      sendChatEvent({ requestId, event: 'cancelled', data: { reason: 'cancelled' } });
      return;
    }
    throw error;
  } finally {
    if (activeChatControllers.get(requestId) === controller) activeChatControllers.delete(requestId);
  }
}

function cssUrlToAbsolute(value) {
  // Wallpaper is a host-global, default-presence concern.
  const runtimeUrl = runtimeOrigin();
  const match = String(value || '').match(/url\((['"]?)(.*?)\1\)/);
  if (!match) return null;
  const raw = match[2];
  if (/^https?:/i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${runtimeUrl}${raw}`;
  return `${runtimeUrl}/${raw}`;
}

function wallpaperHtml(config, width, height) {
  const runtimeUrl = runtimeOrigin();
  const wallpaper = config?.wallpaper || 'radial-gradient(circle at 50% 50%, #141021, #050409 72%)';
  const decorations = Array.isArray(config?.decorations) ? config.decorations : [];
  const decor = decorations.map((item) => {
    if (!item?.url) return '';
    const src = item.url.startsWith('http') ? item.url : `${runtimeUrl}${item.url}`;
    const opacity = Number.isFinite(Number(item.opacity)) ? Number(item.opacity) : 0.18;
    const width = item.width || '220px';
    const height = item.height || width;
    const x = item.x || '24px';
    const y = item.y || '24px';
    const anchor = item.anchor || 'bottom-right';
    const style = [
      `width:${width}`,
      `height:${height}`,
      `opacity:${opacity}`,
      `transform:rotate(${item.rotate || '0deg'})`,
      anchor.includes('right') ? `right:${x}` : `left:${x}`,
      anchor.includes('bottom') ? `bottom:${y}` : `top:${y}`,
    ].join(';');
    return `<img src="${src}" style="${style}" />`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:${wallpaper};}
    body:before{content:"";position:fixed;inset:0;background:radial-gradient(circle at 60% 40%,rgba(255,255,255,.06),transparent 34%),radial-gradient(circle at 35% 70%,rgba(0,0,0,.28),transparent 42%);}
    img{position:absolute;object-fit:contain;filter:saturate(.96);}
  </style></head><body>${decor}</body></html>`;
}

function queueWallpaperApply(config) {
  if (process.platform !== 'darwin') return;
  clearTimeout(wallpaperApplyTimer);
  wallpaperApplyTimer = setTimeout(() => {
    applyMacWallpaper(config).catch((error) => log(`wallpaper apply failed: ${error.message}`));
  }, 500);
}

async function applyMacWallpaper(config) {
  const display = screen.getPrimaryDisplay();
  const width = Math.max(1440, Math.round(display.size.width * display.scaleFactor));
  const height = Math.max(900, Math.round(display.size.height * display.scaleFactor));
  await fs.mkdir(WALLPAPER_DIR, { recursive: true });

  const directUrl = cssUrlToAbsolute(config?.wallpaper);
  let wallpaperPath = path.join(WALLPAPER_DIR, 'current.png');
  const hasDecorations = Array.isArray(config?.decorations) && config.decorations.length > 0;
  if (directUrl && !hasDecorations) {
    const res = await fetch(directUrl);
    if (res.ok) {
      const ext = path.extname(new URL(directUrl).pathname) || '.png';
      wallpaperPath = path.join(WALLPAPER_DIR, `current${ext}`);
      await fs.writeFile(wallpaperPath, Buffer.from(await res.arrayBuffer()));
    }
  } else {
    const renderer = new BrowserWindow({
      show: false,
      width,
      height,
      webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false },
    });
    await renderer.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(wallpaperHtml(config, width, height))}`);
    await new Promise((resolve) => setTimeout(resolve, 350));
    const image = await renderer.webContents.capturePage();
    await fs.writeFile(wallpaperPath, image.toPNG());
    renderer.destroy();
  }

  // Phase 5: prefer the Swift helper's NSWorkspace.setDesktopImageURL —
  // it requires NO Apple Events permission grant, while osascript needs
  // Automation access that users frequently haven't granted (and the
  // resulting -1743 failure has been a recurring source of pain).
  // Falls back to osascript if the helper isn't running.
  let appliedVia = null;
  if (helperUrl) {
    try {
      const res = await fetch(`${helperUrl}/wallpaper/apply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-bor-host-token': helperToken },
        body: JSON.stringify({ imagePath: wallpaperPath }),
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) {
        appliedVia = 'helper';
      } else {
        const body = await res.text().catch(() => '');
        log(`helper wallpaper apply returned ${res.status}: ${body}; falling back to osascript`);
      }
    } catch (err) {
      log(`helper wallpaper apply failed: ${err.message}; falling back to osascript`);
    }
  }
  if (!appliedVia) {
    await new Promise((resolve, reject) => {
      const script = `tell application "System Events" to tell every desktop to set picture to POSIX file "${wallpaperPath.replaceAll('"', '\\"')}"`;
      execFile('osascript', ['-e', script], (error) => error ? reject(error) : resolve());
    });
    appliedVia = 'osascript';
  }
  log(`applied macOS wallpaper ${wallpaperPath} via ${appliedVia}`);
}

function playNotificationSound() {
  return new Promise((resolve) => {
    const soundPath = process.env.BOR_NOTIFICATION_SOUND || '/System/Library/Sounds/Glass.aiff';
    execFile('/usr/bin/afplay', [soundPath], { timeout: 3_000 }, (error) => {
      if (!error) return resolve({ ok: true, sound: soundPath });
      execFile('/usr/bin/osascript', ['-e', 'beep 1'], { timeout: 3_000 }, (fallbackError) => {
        resolve({ ok: !fallbackError, sound: fallbackError ? null : 'beep', error: (fallbackError || error)?.message });
      });
    });
  });
}

function installIpcHandlers() {
  // Each handler resolves the caller's presence from its window so every runtime
  // call is scoped to the right BOR instance.
  ipcMain.handle('bor:get-runtime-url', (event) => runtimeUrls.get(presenceIdForEvent(event)) || null);

  // --- MCP marketplace ---
  ipcMain.handle('bor:open-mcp-marketplace', (event) => { openMcpMarketplace(presenceIdForEvent(event)); });
  ipcMain.handle('bor:mcp-get-catalog', (event, opts = {}) =>
    fetchJson(presenceIdForEvent(event), `/api/mcp/marketplace${opts && opts.refresh ? '?refresh=1' : ''}`));
  ipcMain.handle('bor:mcp-get-installed', (event) => fetchJson(presenceIdForEvent(event), '/api/mcp/installed'));
  ipcMain.handle('bor:mcp-get-theme', async (event) => {
    const cfg = await getPublicConfig(presenceIdForEvent(event)).catch(() => ({}));
    return { theme: (cfg && cfg.baseTheme) || '' };
  });
  ipcMain.handle('bor:mcp-ask', (event, query) =>
    fetchJson(presenceIdForEvent(event), '/api/mcp/ask', { method: 'POST', body: JSON.stringify({ query }) }));
  ipcMain.handle('bor:mcp-install', async (event, mcpId) => {
    const presenceId = presenceIdForEvent(event);
    const result = await fetchJson(presenceId, '/api/mcp/install', { method: 'POST', body: JSON.stringify({ mcpId }) });
    // Kick the install off as a chat task in the owning presence (LLM-driven,
    // exactly like Sixth — it reads .bor/mcp.json, writes the server, runs setup).
    if (result && result.task) {
      const pwin = presenceWindows.get(presenceId);
      if (pwin && !pwin.isDestroyed()) {
        pwin.webContents.send('bor:submit-prompt', result.task);
        try { pwin.show(); } catch { /* ignore */ }
      }
    }
    return result;
  });
  ipcMain.handle('bor:mcp-close', () => {
    if (mcpMarketplaceWindow && !mcpMarketplaceWindow.isDestroyed()) mcpMarketplaceWindow.hide();
  });
  ipcMain.handle('bor:get-config', (event) => getPublicConfig(presenceIdForEvent(event)));
  ipcMain.handle('bor:get-surface', async (event, surfaceId) => resolveSurface(presenceIdForEvent(event), surfaceId));
  ipcMain.handle('bor:get-presence-bounds', (event) => {
    const win = presenceWindows.get(presenceIdForEvent(event));
    if (!win || win.isDestroyed()) return null;
    return win.getBounds();
  });
  ipcMain.handle('bor:set-presence-bounds', (event, bounds) => {
    const id = presenceIdForEvent(event);
    const win = presenceWindows.get(id);
    if (!win || win.isDestroyed()) return { ok: false };
    const st = getPresenceState(id);
    const current = win.getBounds();
    const display = screen.getDisplayMatching(current).workArea;
    const requestedWidth = Number.isFinite(Number(bounds?.width))
      ? Math.max(48, Math.min(display.width, Math.round(Number(bounds.width))))
      : current.width;
    const requestedHeight = Number.isFinite(Number(bounds?.height))
      ? Math.max(48, Math.min(display.height, Math.round(Number(bounds.height))))
      : current.height;
    let next = clampPresenceBounds({
      ...current,
      x: Number.isFinite(bounds?.x) ? bounds.x : current.x,
      y: Number.isFinite(bounds?.y) ? bounds.y : current.y,
      width: requestedWidth,
      height: requestedHeight,
    });
    const point = orbPointForBounds(next, st.mode, st.anchor);
    const pointDisplay = displayForPoint(point);
    const nextAnchor = anchorForPoint(point, pointDisplay);
    if (nextAnchor !== st.anchor) {
      st.anchor = nextAnchor;
      if (st.mode !== 'collapsed') {
        next = boundsForAnchor(point, { width: next.width, height: next.height }, st.anchor, pointDisplay, st.mode);
      }
    }
    win.setBounds(next, false);
    sendPresenceLayout(id, next);
    updatePresence(id, { bounds: next, anchor: st.anchor }).catch(() => {});
    return { ok: true, bounds: next, anchor: st.anchor, mode: st.mode };
  });
  ipcMain.handle('bor:get-widget-preview-bounds', (_event, surfaceId) => {
    const win = widgetPreviewWindows.get(surfaceId);
    if (!win || win.isDestroyed()) return null;
    return win.getBounds();
  });
  ipcMain.handle('bor:set-widget-preview-bounds', (_event, surfaceId, bounds) => {
    const win = widgetPreviewWindows.get(surfaceId);
    if (!win || win.isDestroyed()) return { ok: false };
    const current = win.getBounds();
    const next = clampBounds({
      ...current,
      x: Number.isFinite(bounds?.x) ? bounds.x : current.x,
      y: Number.isFinite(bounds?.y) ? bounds.y : current.y,
    });
    win.setBounds(next, false);
    return { ok: true, bounds: next };
  });
  ipcMain.handle('bor:persist-widget-preview-bounds', async (event, surfaceId, bounds) => {
    const win = widgetPreviewWindows.get(surfaceId);
    const presenceId = win?.borPresenceId || presenceIdForEvent(event);
    const current = win && !win.isDestroyed() ? win.getBounds() : bounds;
    if (!current) return { ok: false };
    const result = await patchWidgetLayout(presenceId, surfaceId, current);
    return { ok: Boolean(result), bounds: current };
  });
  ipcMain.handle('bor:preview-bridge', async (event, surfaceId, message) => {
    const win = widgetPreviewWindows.get(surfaceId);
    const presenceId = win?.borPresenceId || presenceIdForEvent(event);
    return bridgePreviewMessage(presenceId, surfaceId, message);
  });
  ipcMain.handle('bor:pick-context-items', () => pickContextItems());
  // Drop-target IPC: the renderer collects absolute paths from native files
  // dropped onto the composer/bubble (via `webUtils.getPathForFile` on the
  // File objects in the drop event) and forwards them here for the same
  // describe-and-attach treatment as the + button.
  ipcMain.handle('bor:describe-context-paths', async (_event, filePaths = []) => {
    const items = [];
    if (!Array.isArray(filePaths)) return { items };
    for (const filePath of filePaths.slice(0, 8)) {
      if (typeof filePath !== 'string' || !filePath) continue;
      try {
        items.push(await describeContextPath(filePath));
      } catch (error) {
        items.push({
          id: `${filePath}:error`,
          kind: 'error',
          path: filePath,
          name: path.basename(filePath) || filePath,
          error: error.message,
        });
      }
    }
    return { items };
  });
  ipcMain.handle('bor:list-surfaces', async (event) => {
    const surfaces = (await fetchJson(presenceIdForEvent(event), '/api/surfaces')).surfaces || [];
    // The App Library was just opened — a good moment to reconcile the
    // ~/Applications wrappers (debounced; in-flight guard prevents pile-up).
    syncNativeAppWrappers().catch(() => {});
    return surfaces;
  });
  ipcMain.handle('bor:open-surface', (event, surfaceOrId) => openSurface(presenceIdForEvent(event), surfaceOrId));
  ipcMain.handle('bor:list-notifications', async (event) => fetchJson(presenceIdForEvent(event), '/api/notifications'));
  ipcMain.handle('bor:notification-action', async (event, payload = {}) => fetchJson(presenceIdForEvent(event), '/api/notifications', {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  }));
  ipcMain.handle('bor:notification-sound', () => playNotificationSound());
  ipcMain.handle('bor:list-conversations', async (event) => fetchJson(presenceIdForEvent(event), '/api/conversations'));
  ipcMain.handle('bor:get-conversation', async (event, id) => fetchJson(presenceIdForEvent(event), `/api/conversations/${encodeURIComponent(String(id || ''))}`));
  ipcMain.handle('bor:save-conversation', async (event, conversation = {}) => fetchJson(presenceIdForEvent(event), '/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ action: 'save', conversation }),
  }));
  ipcMain.handle('bor:conversation-action', async (event, payload = {}) => fetchJson(presenceIdForEvent(event), '/api/conversations', {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  }));
  ipcMain.handle('bor:cron-action', async (event, payload = {}) => fetchJson(presenceIdForEvent(event), '/api/cron', {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  }));
  /**
   * Shortcut iframe bridge. The presence renderer catches postMessage from
   * sandboxed shortcut iframes and invokes this. We proxy to the runtime's
   * /api/surface-* endpoints and return the response shape the iframe's
   * bridge polyfill expects.
   */
  ipcMain.handle('bor:surface-bridge', async (_event, request) => {
    const { surfaceId, op, payload } = request || {};
    if (!surfaceId || typeof surfaceId !== 'string') return { error: 'surfaceId required' };
    if (!op || typeof op !== 'string') return { error: 'op required' };
    try {
      switch (op) {
        case 'state-get': {
          const data = await fetchJson(`/api/surfaces/${encodeURIComponent(surfaceId)}/state`);
          // Notify any open app/preview windows of the same surface that state may have changed.
          // (no-op for state-get since it's read-only — kept for symmetry).
          return data.error ? { error: data.error } : { state: data.state || {} };
        }
        case 'state-set': {
          const data = await fetchJson(`/api/surfaces/${encodeURIComponent(surfaceId)}/state`, {
            method: 'POST',
            body: JSON.stringify({
              __borStateEnvelope: true,
              state: payload?.state || {},
              baseRevision: payload?.baseRevision || null,
            }),
          });
          if (!data.error) reloadSurfaceViews(surfaceId, { includeSurface: true });
          return data.error ? { error: data.error } : { ok: true, bytes: data.bytes };
        }
        case 'llm-request': {
          const data = await fetchJson('/api/surface-llm', {
            method: 'POST',
            body: JSON.stringify({
              surfaceId,
              prompt: payload?.prompt,
              system: payload?.system,
              images: payload?.images,
            }),
          });
          return data.error ? { error: data.error } : { text: data.text, model: data.model, rateLimitRemaining: data.rateLimitRemaining };
        }
        case 'web-search': {
          const data = await fetchJson('/api/surface-search', {
            method: 'POST',
            body: JSON.stringify({ surfaceId, query: payload?.query, limit: payload?.limit }),
          });
          return data.error ? { error: data.error } : { results: data.results, query: data.query };
        }
        case 'web-fetch': {
          const data = await fetchJson('/api/surface-fetch', {
            method: 'POST',
            body: JSON.stringify({ surfaceId, url: payload?.url }),
          });
          return data.error ? { error: data.error } : { url: data.url, title: data.title, text: data.text, truncated: data.truncated };
        }
        case 'image-generate': {
          const data = await fetchJson('/api/surface-image-gen', {
            method: 'POST',
            body: JSON.stringify({ surfaceId, prompt: payload?.prompt, size: payload?.size }),
          });
          return data.error ? { error: data.error } : { url: data.url, model: data.model, mediaType: data.mediaType, bytes: data.bytes };
        }
        case 'cron': {
          const data = await fetchJson('/api/cron', {
            method: 'POST',
            body: JSON.stringify({ ...(payload || {}), surfaceId }),
          });
          return data.error ? { error: data.error } : data;
        }
        case 'notification-push': {
          const data = await fetchJson('/api/notifications', {
            method: 'POST',
            body: JSON.stringify({ ...(payload || {}), action: 'add', source: payload?.source || 'surface', surfaceId }),
          });
          return data.error ? { error: data.error } : data;
        }
        case 'notifications-list': {
          const data = await fetchJson('/api/notifications');
          return data.error ? { error: data.error } : data;
        }
        default:
          return { error: `unknown bridge op: ${op}` };
      }
    } catch (err) {
      log(`[shortcut-bridge] ${op} failed for ${surfaceId}: ${err.message}`);
      return { error: err.message };
    }
  });
  /** Open a BOR app full-screen from inside a shortcut iframe. */
  ipcMain.handle('bor:launch-app-from-shortcut', async (event, appId) => {
    if (!appId || typeof appId !== 'string' || !appId.startsWith('app-')) {
      return { ok: false, error: 'launch-app requires an app-* id' };
    }
    const presenceId = presenceIdForEvent(event);
    try {
      const surface = await resolveSurface(presenceId, appId);
      if (!surface) return { ok: false, error: `app ${appId} not found` };
      const win = await openSurface(presenceId, surface);
      return { ok: !!win, id: appId };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  // Re-open onboarding for the CALLER's presence (parity with the old build —
  // creating brand-new presences is a later phase's Main App job).
  ipcMain.handle('bor:open-onboarding', async (event) => {
    const id = presenceIdForEvent(event);
    const reg = await readRegistry();
    const entry = reg.presences[id];
    if (!entry) return { ok: false, error: `unknown presence ${id}` };
    createOnboardingWindow(entry);
    return { ok: true };
  });
  ipcMain.handle('bor:presence-mode', (event, mode) => {
    const id = presenceIdForEvent(event);
    const win = presenceWindows.get(id);
    if (!win || win.isDestroyed()) return { ok: false };
    const st = getPresenceState(id);
    const current = win.getBounds();
    if (mode === st.mode) {
      if (presenceSizeMatchesMode(current, mode)) {
        return { ok: true, bounds: current, anchor: st.anchor, mode: st.mode };
      }
    }
    const layout = presenceLayoutForMode(mode, current, st.mode, st.anchor);
    st.mode = mode;
    st.anchor = layout.anchor;
    win.setBounds(layout.bounds, false);
    const bounds = win.getBounds();
    sendPresenceLayout(id, bounds);
    updatePresence(id, { bounds, anchor: st.anchor }).catch(() => {});
    return { ok: true, bounds, anchor: st.anchor, mode: st.mode };
  });
  ipcMain.on('bor:chat-start', (event, { requestId, messages }) => {
    streamChatToRenderer(event.sender, requestId, messages).catch((error) => {
      event.sender.send('bor:chat-event', { requestId, event: 'error', data: { error: error.message } });
    });
  });
  ipcMain.on('bor:chat-cancel', (event, { requestId } = {}) => {
    const controller = activeChatControllers.get(requestId);
    if (controller) {
      controller.abort();
      activeChatControllers.delete(requestId);
    } else if (requestId) {
      event.sender.send('bor:chat-event', { requestId, event: 'cancelled', data: { reason: 'cancelled' } });
    }
  });
  ipcMain.on('bor:surface-state-updated', (_event, { surfaceId } = {}) => {
    reloadSurfaceViews(surfaceId, { includeSurface: false });
  });

  // Open a URL in the user's system browser (BOR credits / sign-in flow).
  ipcMain.handle('bor:open-external', (_event, url) => {
    try {
      if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ---- Main BOR app (presence management) ----
  // These are registry-scoped, not sender-scoped: the Main app operates ACROSS
  // presences (the others above are scoped to the caller's own presence).
  ipcMain.handle('bor:presences-list', async () => {
    const list = await listPresences();
    return list.map(presenceSummary);
  });
  ipcMain.handle('bor:presences-create', async (_event, { nickname } = {}) => {
    try { return { ok: true, presence: await spawnNewPresence({ nickname }) }; }
    catch (err) { return { ok: false, error: err.message }; }
  });
  ipcMain.handle('bor:presences-delete', async (_event, { id } = {}) => {
    try { return await destroyPresence(String(id || '')); }
    catch (err) { return { ok: false, error: err.message }; }
  });
  // Update registry-level identity (nickname / displayName / tagName). Config
  // fields (aiName, avatar, provider) go through presence-update-config below.
  ipcMain.handle('bor:presences-update', async (_event, { id, patch } = {}) => {
    try {
      const allowed = {};
      for (const k of ['nickname', 'displayName', 'tagName']) {
        if (patch && typeof patch[k] === 'string') allowed[k] = patch[k];
      }
      const updated = await updatePresence(String(id || ''), allowed);
      notifyMainAppPresencesChanged();
      return { ok: true, presence: presenceSummary(updated) };
    } catch (err) { return { ok: false, error: err.message }; }
  });
  // Read a presence's onboarding/config (public projection — keys masked by the
  // runtime's publicConfig). Routes to that presence's runtime.
  ipcMain.handle('bor:presence-get-config', async (_event, { id } = {}) => {
    try { return { ok: true, config: await getPublicConfig(String(id || '')) }; }
    catch (err) { return { ok: false, error: err.message }; }
  });
  // Patch a presence's config (aiName, persona, theme, avatar, provider). Merge
  // semantics — only the provided fields change.
  ipcMain.handle('bor:presence-update-config', async (_event, { id, patch } = {}) => {
    try {
      const presenceId = String(id || '');
      if (!runtimeUrls.has(presenceId)) return { ok: false, error: 'presence runtime not running' };
      const data = await fetchJson(presenceId, '/api/config', {
        method: 'POST',
        body: JSON.stringify(patch || {}),
      });
      notifyMainAppPresencesChanged();
      return { ok: true, config: data.config || null };
    } catch (err) { return { ok: false, error: err.message }; }
  });
  // Read a presence's accumulated data for the logs tab. Host reads the
  // presence's own data dir directly (no runtime round-trip needed).
  ipcMain.handle('bor:presence-get-data', async (_event, { id, kind = 'sessions' } = {}) => {
    try { return { ok: true, ...(await readPresenceData(String(id || ''), kind)) }; }
    catch (err) { return { ok: false, error: err.message }; }
  });
  ipcMain.handle('bor:open-presence-onboarding', (_event, { id } = {}) => {
    getPresence(String(id || '')).then((entry) => { if (entry) createOnboardingWindow(entry); });
    return { ok: true };
  });
  ipcMain.handle('bor:focus-presence', (_event, { id } = {}) => {
    const win = presenceWindows.get(String(id || ''));
    if (win && !win.isDestroyed()) { bringPresenceForward(String(id || '')); return { ok: true }; }
    return { ok: false, error: 'presence orb not open' };
  });
  // Open the Main BOR app — invoked from a presence orb (settings affordance)
  // or the dock. Idempotent: focuses if already open.
  ipcMain.handle('bor:open-main-app', () => { createMainAppWindow(); return { ok: true }; });
  // Toggle mouse capture for the calling presence orb. The renderer calls this
  // with `ignore:true` when the cursor leaves the visible orb/bubble (so clicks
  // pass through to apps underneath) and `ignore:false` when it enters, so the
  // transparent window never blocks the desktop.
  ipcMain.on('bor:set-mouse-ignore', (event, ignore) => {
    const id = presenceIdForEvent(event);
    const win = presenceWindows.get(id);
    if (!win || win.isDestroyed()) return;
    if (ignore) win.setIgnoreMouseEvents(true, { forward: true });
    else win.setIgnoreMouseEvents(false);
  });
}

// Read a presence's logs/data straight off its data dir for the Main app's logs
// tab. `kind`: 'sessions' (recent session JSONL events) or 'audit' (audit.jsonl
// tail) or 'summary' (counts). Bounded so a huge log can't blow up the IPC.
async function readPresenceData(id, kind) {
  const entry = await getPresence(id);
  if (!entry) throw new Error('unknown presence');
  const dir = entry.dataDir;
  if (kind === 'summary') {
    const counts = { sessions: 0, surfaces: 0, notifications: 0, cronJobs: 0 };
    try { counts.sessions = (await fs.readdir(path.join(dir, 'memory', 'sessions'))).filter((f) => f.endsWith('.jsonl')).length; } catch { /* none */ }
    try { counts.surfaces = (await fs.readdir(path.join(dir, 'surfaces'))).filter((f) => !f.startsWith('.')).length; } catch { /* none */ }
    try {
      const n = JSON.parse(await fs.readFile(path.join(dir, 'notifications', 'notifications.json'), 'utf8'));
      counts.notifications = Array.isArray(n?.notifications) ? n.notifications.length : 0;
    } catch { /* none */ }
    try {
      const j = JSON.parse(await fs.readFile(path.join(dir, 'cron', 'jobs.json'), 'utf8'));
      counts.cronJobs = Array.isArray(j?.jobs) ? j.jobs.length : 0;
    } catch { /* none */ }
    return { counts };
  }
  if (kind === 'audit') {
    try {
      const raw = await fs.readFile(path.join(dir, 'logs', 'audit.jsonl'), 'utf8');
      const lines = raw.trim().split('\n').filter(Boolean).slice(-200);
      return { entries: lines.map((l) => { try { return JSON.parse(l); } catch { return { raw: l }; } }) };
    } catch { return { entries: [] }; }
  }
  // sessions: newest session file's events (most recent activity)
  try {
    const sessionsDir = path.join(dir, 'memory', 'sessions');
    const files = (await fs.readdir(sessionsDir)).filter((f) => f.endsWith('.jsonl')).sort();
    const newest = files.at(-1);
    if (!newest) return { entries: [], file: null };
    const raw = await fs.readFile(path.join(sessionsDir, newest), 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean).slice(-200);
    return { file: newest, entries: lines.map((l) => { try { return JSON.parse(l); } catch { return { raw: l }; } }) };
  } catch { return { entries: [], file: null }; }
}

// Read the legacy single-tenant config directly (pre-migration) just to seed the
// default presence's nickname + onboarded flag for the migration.
async function readLegacyConfig() {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, 'config.json'), 'utf8'));
  } catch {
    return null;
  }
}

async function boot() {
  // Brand the app: show the bloom rose mark in the dock instead of the default
  // Electron logo (the dock icon is the visible one when running in dev).
  try {
    const bloomIcon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'bloom-icon.png'));
    if (!bloomIcon.isEmpty() && process.platform === 'darwin' && app.dock && app.dock.setIcon) {
      app.dock.setIcon(bloomIcon);
    }
  } catch (e) {
    log('[brand] failed to set bloom dock icon:', e?.message || e);
  }

  await startHostControlServer();

  // One-time fold of legacy single-tenant os-data into a default presence. Must
  // run BEFORE any runtime spawns (nothing should read the old paths mid-move).
  const legacy = await readLegacyConfig();
  const defaultName = legacy?.aiName || 'Bed of Roses';
  const onboarded = onboardingComplete(legacy);
  await migrateToPresences({ defaultName, onboarded, nowMs: Date.now(), log });

  const reg = await readRegistry();
  defaultPresenceId = reg.defaultId;

  // Bring up one runtime + one window (orb or onboarding) per presence.
  for (const entry of Object.values(reg.presences)) {
    try {
      await startRuntime(entry);
    } catch (err) {
      log(`failed to start runtime for presence ${entry.id}: ${err.message}`);
      continue;
    }
    if (entry.onboarded) {
      await createPresenceWindow(entry);
    } else {
      createOnboardingWindow(entry);
    }
  }

  // Helper boots AFTER the runtimes are up (it points at the default runtime).
  // Failure here is non-fatal — Electron's own windows still work.
  await startHelper().catch((err) => log(`helper: ${err.message}`));
  installMediaRequestHeaders();
  installIpcHandlers();
  Menu.setApplicationMenu(null);
  globalShortcut.register('CommandOrControl+Option+Space', () => {
    // Toggle every presence orb; if none exist, recreate onboarded ones.
    let any = false;
    for (const [, win] of presenceWindows) {
      if (win && !win.isDestroyed()) {
        any = true;
        win.webContents.send('bor:toggle-presence');
      }
    }
    if (!any) {
      readRegistry().then((r) => {
        for (const entry of Object.values(r.presences)) {
          if (entry.onboarded) createPresenceWindow(entry).catch(() => {});
        }
      }).catch(() => {});
    }
  });

  // First cut: native-app wrappers + wallpaper + widget previews mirror the
  // DEFAULT presence only.
  startNativeAppSync().catch((err) => log(`native-apps: startup sync failed: ${err.message}`));
  if (defaultPresenceId && runtimeUrls.has(defaultPresenceId)) {
    await syncWidgetPreviews(defaultPresenceId).catch((error) => log(`widget preview sync failed: ${error.message}`));
    const defConfig = await getPublicConfig(defaultPresenceId).catch(() => null);
    if (defConfig && onboardingComplete(defConfig)) queueWallpaperApply(defConfig);
  }

  // Dock: hide if any presence is onboarded & shown; show if any onboarding open.
  if (hasOpenOnboarding()) showDockForSetup();
  else hideDockForPresence();

  // `bor onboard`: after normal boot, spin up a fresh presence + its onboarding
  // window. Electron may inject its own argv, so detect by token, not position.
  if (process.argv.includes('onboard')) {
    await spawnNewPresence().catch((err) => log(`onboard: ${err.message}`));
  }
}

if (singleInstanceLock) {
  app.whenReady().then(boot).catch((error) => {
    console.error('[bor-v2] boot failed:', error);
    app.quit();
  });
}

// Re-show every presence (recreating windows/runtimes from the registry as
// needed), and surface onboarding for any presence that still needs it.
async function reviveAllPresences() {
  const reg = await readRegistry();
  defaultPresenceId = defaultPresenceId || reg.defaultId;
  for (const entry of Object.values(reg.presences)) {
    if (!runtimeUrls.has(entry.id)) {
      // Runtime gone (crashed/never started) — try to bring it back.
      await startRuntime(entry).catch((err) => log(`runtime revive failed for ${entry.id}: ${err.message}`));
    }
    if (!runtimeUrls.has(entry.id)) continue;
    if (entry.onboarded) {
      const win = presenceWindows.get(entry.id);
      if (win && !win.isDestroyed()) bringPresenceForward(entry.id);
      else await createPresenceWindow(entry).catch((error) => log(`presence reopen failed (${entry.id}): ${error.message}`));
    } else {
      createOnboardingWindow(entry);
    }
  }
  if (hasOpenOnboarding()) showDockForSetup();
  else hideDockForPresence();
}

app.on('second-instance', () => {
  reviveAllPresences().catch((error) => log(`second-instance revive failed: ${error.message}`));
});

app.on('render-process-gone', (_event, webContents, details) => {
  log(`render process gone (${webContents.getTitle?.() || 'untitled'}): ${details.reason || 'unknown'}`);
});

app.on('child-process-gone', (_event, details) => {
  log(`child process gone (${details.type || 'unknown'}): ${details.reason || 'unknown'}`);
});

app.on('before-quit', () => {
  log('before quit');
  globalShortcut.unregisterAll();
  for (const proc of runtimeProcesses.values()) {
    try { proc.kill('SIGTERM'); } catch { /* ignore */ }
  }
  if (helperProcess) {
    // The helper has its own parent-PID watchdog that would exit it
    // within a second, but signalling explicitly is faster + cleaner.
    helperShutdownRequested = true;
    try { helperProcess.kill('SIGTERM'); } catch { /* ignore */ }
  }
});

app.on('will-quit', () => {
  log('will quit');
});

app.on('quit', (_event, code) => {
  log(`quit (${code})`);
});

app.on('activate', () => {
  reviveAllPresences().catch((error) => log(`activate revive failed: ${error.message}`));
});

app.on('window-all-closed', (event) => {
  // Never quit while a runtime process is still alive — recreate any onboarded
  // presence whose window went missing.
  event.preventDefault();
  setTimeout(async () => {
    const reg = await readRegistry().catch(() => null);
    if (!reg) return;
    for (const entry of Object.values(reg.presences)) {
      if (!entry.onboarded || !runtimeUrls.has(entry.id)) continue;
      const win = presenceWindows.get(entry.id);
      if (!win || win.isDestroyed()) {
        await createPresenceWindow(entry).catch((error) => log(`presence recreate failed (${entry.id}): ${error.message}`));
      }
    }
    if (hasOpenOnboarding()) showDockForSetup();
    else hideDockForPresence();
  }, 0);
});
