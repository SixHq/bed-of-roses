const { app, BrowserWindow, Menu, globalShortcut, ipcMain, screen, shell, dialog, session } = require('electron');
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const { appendFileSync, watch } = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(ROOT, 'os-data');
const ELECTRON_USER_DATA_DIR = path.join(ROOT, '.bed-of-roses', 'v2-electron');
const HOST_STATE_PATH = path.join(DATA_DIR, 'v2-host.json');
const WALLPAPER_DIR = path.join(DATA_DIR, 'v2-wallpaper');
const SERVER_ENTRY = path.join(ROOT, 'server', 'index.js');
const DEFAULT_PORT = Number(process.env.PORT || 7777);
const NODE_EXECUTABLE = process.env.BOR_NODE || process.env.npm_node_execpath || 'node';

let runtimeUrl = process.env.BOR_RUNTIME_URL || null;
let runtimeProcess = null;
let presenceWindow = null;
let onboardingWindow = null;
let allowOnboardingClose = false;
let wallpaperApplyTimer = null;
let presenceHotReloadInstalled = false;
let mediaRequestHeadersInstalled = false;
let presenceMode = 'collapsed';
let presenceAnchor = 'bottom-right';
let presenceCaptureHideDepth = 0;
let presenceCaptureWasVisible = false;
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
const previewStateRevisions = new Map();
const activeChatControllers = new Map();

const PRESENCE_SIZES = {
  collapsed: { width: 53, height: 53 },
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
      const buf = await fs.readFile(filePath);
      const mime = IMAGE_MIME_BY_EXT[ext] || 'application/octet-stream';
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
        error: `image read failed: ${error.message}`,
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
  const result = presenceWindow && !presenceWindow.isDestroyed()
    ? await dialog.showOpenDialog(presenceWindow, options)
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

function hidePresenceForCapture() {
  if (presenceCaptureHideDepth === 0) {
    presenceCaptureWasVisible = Boolean(presenceWindow && !presenceWindow.isDestroyed() && presenceWindow.isVisible());
    if (presenceCaptureWasVisible) {
      try { presenceWindow.hide(); } catch { /* ignore */ }
    }
  }
  presenceCaptureHideDepth += 1;
  return { ok: true, hidden: presenceCaptureWasVisible, depth: presenceCaptureHideDepth };
}

function restorePresenceAfterCapture() {
  if (presenceCaptureHideDepth > 0) presenceCaptureHideDepth -= 1;
  if (presenceCaptureHideDepth === 0 && presenceCaptureWasVisible) {
    presenceCaptureWasVisible = false;
    if (presenceWindow && !presenceWindow.isDestroyed()) {
      bringPresenceForward();
    }
  }
  return { ok: true, hidden: false, depth: presenceCaptureHideDepth };
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
        openSurface(surfaceId).catch((err) => log(`open-surface from helper failed: ${err.message}`));
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

async function fetchJson(pathname, options = {}) {
  const res = await fetch(`${runtimeUrl}${pathname}`, {
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

async function probeRuntime(url) {
  try {
    const res = await fetch(`${url}/api/providers`, { signal: AbortSignal.timeout(700) });
    return res.ok;
  } catch {
    return false;
  }
}

async function startRuntime() {
  if (runtimeUrl) {
    if (!(await probeRuntime(runtimeUrl))) {
      throw new Error(`BOR_RUNTIME_URL is not responding: ${runtimeUrl}`);
    }
    log(`using external runtime ${runtimeUrl}`);
    return;
  }

  const defaultRuntimeUrl = `http://127.0.0.1:${DEFAULT_PORT}`;
  if (await probeRuntime(defaultRuntimeUrl)) {
    runtimeUrl = defaultRuntimeUrl;
    log(`using existing runtime ${runtimeUrl}`);
    return;
  }

  const port = await findFreePort(DEFAULT_PORT);
  runtimeUrl = `http://127.0.0.1:${port}`;
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
  runtimeProcess = spawn(NODE_EXECUTABLE, [SERVER_ENTRY], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), BOR_HOST_MODE: 'v2', BOR_HOST_CONTROL_URL: hostControlUrl || '', BOR_HOST_CONTROL_TOKEN: hostControlToken },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  runtimeProcess.on('exit', (code, signal) => {
    log(`runtime exited (${signal || code})`);
    runtimeProcess = null;
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    if (await probeRuntime(runtimeUrl)) {
      log(`started runtime ${runtimeUrl}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Runtime did not become ready within 15s');
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
    `--bor-runtime-url=${runtimeUrl || ''}`,
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
  return Boolean(config?.aiName && providerConfigured(config));
}

async function getPublicConfig() {
  return (await fetchJson('/api/config')).config || null;
}

function createOnboardingWindow() {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.show();
    onboardingWindow.focus();
    return onboardingWindow;
  }

  showDockForSetup();
  allowOnboardingClose = false;
  onboardingWindow = new BrowserWindow({
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
  onboardingWindow.on('close', (event) => {
    if (allowOnboardingClose) return;
    event.preventDefault();
    getPublicConfig()
      .then((config) => {
        if (onboardingComplete(config)) {
          allowOnboardingClose = true;
          onboardingWindow?.close();
          return;
        }
        log('prevented onboarding close before setup completed');
        onboardingWindow?.show();
        onboardingWindow?.focus();
      })
      .catch(() => {
        log('prevented onboarding close while setup state was unavailable');
        onboardingWindow?.show();
        onboardingWindow?.focus();
      });
  });
  onboardingWindow.once('ready-to-show', () => {
    onboardingWindow.show();
    onboardingWindow.focus();
  });
  onboardingWindow.webContents.on('render-process-gone', (_event, details) => {
    log(`onboarding render process gone: ${details.reason || 'unknown'}`);
  });
  onboardingWindow.webContents.on('did-fail-load', (_event, code, description) => {
    log(`onboarding failed to load: ${code} ${description}`);
  });
  onboardingWindow.on('closed', () => {
    log('onboarding window closed');
    onboardingWindow = null;
  });
  onboardingWindow.loadURL(`${runtimeUrl}/?host=v2`);

  const timer = setInterval(async () => {
    if (!onboardingWindow || onboardingWindow.isDestroyed()) {
      clearInterval(timer);
      return;
    }
    try {
      const config = await getPublicConfig();
      if (onboardingComplete(config)) {
        clearInterval(timer);
        allowOnboardingClose = true;
        onboardingWindow.close();
        hideDockForPresence();
        createPresenceWindow();
        syncWidgetPreviews().catch((error) => log(`widget preview sync failed: ${error.message}`));
        queueWallpaperApply(config);
      }
    } catch {
      // Runtime may still be settling.
    }
  }, 1200);

  return onboardingWindow;
}

function presenceSizeForMode(mode) {
  return PRESENCE_SIZES[mode] || PRESENCE_SIZES.collapsed;
}

function orbCenterForMode(mode) {
  return mode === 'collapsed' || mode === 'minimized'
    ? PRESENCE_COLLAPSED_ORB_CENTER
    : PRESENCE_ORB_CENTER;
}

function presenceModeForBounds(bounds) {
  if (!bounds || (bounds.width <= 72 && bounds.height <= 72)) return 'collapsed';
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

function orbPointForBounds(bounds, mode = presenceMode, anchor = presenceAnchor) {
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

function presenceLayoutForMode(mode, currentBounds) {
  const size = presenceSizeForMode(mode);
  const sourcePoint = currentBounds
    ? orbPointForBounds(currentBounds)
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

function clampPresenceBounds(bounds) {
  return clampBounds(bounds);
}

function sendPresenceLayout(bounds = null) {
  if (!presenceWindow || presenceWindow.isDestroyed()) return;
  presenceWindow.webContents.send('bor:presence-layout', {
    mode: presenceMode,
    anchor: presenceAnchor,
    bounds: bounds || presenceWindow.getBounds(),
  });
}

function bringPresenceForward(bounds = null) {
  if (!presenceWindow || presenceWindow.isDestroyed()) return;
  if (bounds) presenceWindow.setBounds(bounds, false);
  presenceWindow.setOpacity(1);
  presenceWindow.setIgnoreMouseEvents(false);
  presenceWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  presenceWindow.setAlwaysOnTop(true, 'screen-saver');
  presenceWindow.showInactive();
  if (typeof presenceWindow.moveTop === 'function') presenceWindow.moveTop();
}

function runtimeOrigin() {
  try {
    return new URL(runtimeUrl || `http://127.0.0.1:${DEFAULT_PORT}`).origin;
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
          if (!presenceWindow || presenceWindow.isDestroyed()) return;
          log(`hot reloading ${path.basename(file)}`);
          presenceWindow.webContents.reloadIgnoringCache();
        }, 120);
      });
      if (typeof watcher.unref === 'function') watcher.unref();
    } catch (error) {
      log(`hot reload watch failed for ${path.basename(file)}: ${error.message}`);
    }
  }
}

async function createPresenceWindow() {
  if (presenceWindow && !presenceWindow.isDestroyed()) {
    bringPresenceForward();
    return presenceWindow;
  }

  const state = await readHostState();
  const saved = state.presenceBounds;
  presenceAnchor = state.presenceAnchor || presenceAnchor;
  presenceMode = state.presenceMode || presenceModeForBounds(saved);
  const initialLayout = presenceLayoutForMode('collapsed', saved || null);
  presenceMode = 'collapsed';
  presenceAnchor = initialLayout.anchor;
  presenceWindow = new BrowserWindow({
    ...initialLayout.bounds,
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
      additionalArguments: [`--bor-runtime-url=${runtimeUrl}`],
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
  // Belt-and-suspenders — the webPreferences flag is honored at window
  // creation, but call setBackgroundThrottling explicitly so a future
  // Electron upgrade can't silently re-throttle us.
  try { presenceWindow.webContents.setBackgroundThrottling(false); } catch { /* not available on older Electron */ }
  presenceWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  presenceWindow.setAlwaysOnTop(true, 'screen-saver');
  presenceWindow.loadFile(path.join(__dirname, 'presence.html'));
  installPresenceHotReload();
  presenceWindow.once('ready-to-show', () => bringPresenceForward(initialLayout.bounds));
  presenceWindow.webContents.once('did-finish-load', () => {
    sendPresenceLayout(initialLayout.bounds);
    bringPresenceForward(initialLayout.bounds);
  });
  presenceWindow.webContents.on('render-process-gone', (_event, details) => {
    log(`presence render process gone: ${details.reason || 'unknown'}`);
  });
  presenceWindow.webContents.on('did-fail-load', (_event, code, description) => {
    log(`presence failed to load: ${code} ${description}`);
  });
  presenceWindow.on('moved', () => {
    if (!presenceWindow || presenceWindow.isDestroyed()) return;
    const bounds = presenceWindow.getBounds();
    if (presenceMode === 'collapsed') {
      presenceAnchor = anchorForPoint(orbPointForBounds(bounds, 'collapsed'));
      sendPresenceLayout(bounds);
    }
    writeHostState({ presenceBounds: bounds, presenceAnchor, presenceMode }).catch(() => {});
  });
  presenceWindow.on('closed', () => { presenceWindow = null; });
  return presenceWindow;
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

async function resolveSurface(surfaceOrId) {
  if (surfaceOrId && typeof surfaceOrId === 'object') return surfaceOrId;
  const { surfaces: widgets } = await fetchJson('/api/surfaces');
  return widgets.find((surface) => surface.id === surfaceOrId) || null;
}

async function patchWidgetLayout(id, bounds) {
  return fetchJson(`/api/surfaces/${encodeURIComponent(id)}`, {
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

async function bridgePreviewMessage(surfaceId, message) {
  if (!surfaceId) return { error: 'surface id missing' };
  switch (message.type) {
    case 'state-get': {
      const data = await fetchJson(`/api/surfaces/${encodeURIComponent(surfaceId)}/state`);
      previewStateRevisions.set(surfaceId, data.revision || null);
      return { state: data.state || {} };
    }
    case 'state-set': {
      const data = await fetchJson(`/api/surfaces/${encodeURIComponent(surfaceId)}/state`, {
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
      return fetchJson('/api/surface-llm', {
        method: 'POST',
        body: JSON.stringify({
          surfaceId,
          prompt: message.prompt,
          system: message.system,
          images: message.images,
        }),
      });
    case 'web-search':
      return fetchJson('/api/surface-search', {
        method: 'POST',
        body: JSON.stringify({ surfaceId, query: message.query, limit: message.limit }),
      });
    case 'web-fetch':
      return fetchJson('/api/surface-fetch', {
        method: 'POST',
        body: JSON.stringify({ surfaceId, url: message.url }),
      });
    case 'image-generate':
      return fetchJson('/api/surface-image-gen', {
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
async function tryOpenPreviewViaHelper(surface, index) {
  if (process.env.BOR_USE_SWIFT_PREVIEWS === '0') return null;
  if (!shouldUseHelper()) return null;
  if (!surface?.id || surface.kind === 'app') return null;
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

async function openWidgetPreview(surfaceOrId, index = 0) {
  const surface = await resolveSurface(surfaceOrId);
  if (!surface?.id || surface.kind === 'app') return null;
  const existing = widgetPreviewWindows.get(surface.id);
  if (existing && !existing.isDestroyed()) {
    existing.webContents.reloadIgnoringCache();
    existing.setAlwaysOnTop(false);
    return existing;
  }

  // Swift-helper cutover gated by flag during Phases 4-5. When flag is on
  // AND helper succeeds, we return a sentinel and skip Electron window
  // creation entirely. When unset/failed we fall through.
  const viaSwift = await tryOpenPreviewViaHelper(surface, index);
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
      additionalArguments: [`--bor-runtime-url=${runtimeUrl}`, `--bor-surface-id=${surface.id}`],
    },
  });
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
  win.on('moved', () => patchWidgetLayout(surface.id, win.getBounds()));
  win.on('closed', () => widgetPreviewWindows.delete(surface.id));
  await win.loadFile(path.join(__dirname, 'widget-preview.html'));
  return win;
}

async function syncWidgetPreviews() {
  const { surfaces: widgets } = await fetchJson('/api/surfaces');
  const widgetSurfaces = (widgets || []).filter((surface) => surface.kind !== 'app');
  const activeIds = new Set(widgetSurfaces.map((surface) => surface.id));
  for (const [id, win] of widgetPreviewWindows) {
    if (!activeIds.has(id) && !win.isDestroyed()) win.close();
  }
  await Promise.all(widgetSurfaces.map((surface, index) => openWidgetPreview(surface, index).catch((error) => {
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

async function tryOpenSurfaceViaHelper(surface) {
  if (process.env.BOR_USE_SWIFT_APP_WINDOWS === '0') return null;
  if (!shouldUseHelper()) return null;
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
    await fetchJson('/api/memory/event', {
      method: 'POST',
      body: JSON.stringify({ kind: 'widget.open', id: surface.id, name: surface.name, host: 'v2-swift' }),
    }).catch(() => {});
    return { ok: true, id: surface.id, host: 'swift' };
  } catch (err) {
    log(`helper /window/open failed: ${err.message}; falling back to Electron`);
    return null;
  }
}

async function openSurface(surfaceOrId) {
  const surface = await resolveSurface(surfaceOrId);
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
  const viaSwift = await tryOpenSurfaceViaHelper(surface);
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
      additionalArguments: [`--bor-runtime-url=${runtimeUrl}`, `--bor-surface-id=${surface.id}`],
    },
  });
  surfaceWindows.set(surface.id, win);
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => surfaceWindows.delete(surface.id));
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  await win.loadURL(`${runtimeUrl}/widgets/${encodeURIComponent(surface.id)}/widget.html`);
  await fetchJson('/api/memory/event', {
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
  for (const [id, active] of activeChatControllers) {
    if (id !== requestId) {
      try { active.abort(new Error('superseded by newer BOR task')); } catch { /* noop */ }
      activeChatControllers.delete(id);
    }
  }
  const controller = new AbortController();
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
          openSurface(parsed.data.manifest).catch((error) => {
            sendChatEvent({ requestId, event: 'surface_error', data: { error: error.message } });
          });
        }
        if ((parsed.event === 'launch_app' || parsed.event === 'launch_widget') && (parsed.data?.manifest || parsed.data?.id)) {
          openSurface(parsed.data.manifest || parsed.data.id).catch((error) => {
            sendChatEvent({ requestId, event: 'surface_error', data: { error: error.message } });
          });
        }
        if (parsed.event === 'update_app' && parsed.data?.manifest?.id) {
          reloadSurfaceViews(parsed.data.manifest.id, { includePreview: false });
        }
        if ((parsed.event === 'create_widget' || parsed.event === 'update_widget') && parsed.data?.manifest) {
          openWidgetPreview(parsed.data.manifest).catch((error) => {
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
  const match = String(value || '').match(/url\((['"]?)(.*?)\1\)/);
  if (!match) return null;
  const raw = match[2];
  if (/^https?:/i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${runtimeUrl}${raw}`;
  return `${runtimeUrl}/${raw}`;
}

function wallpaperHtml(config, width, height) {
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

function installIpcHandlers() {
  ipcMain.handle('bor:get-runtime-url', () => runtimeUrl);
  ipcMain.handle('bor:get-config', () => getPublicConfig());
  ipcMain.handle('bor:get-surface', async (_event, surfaceId) => resolveSurface(surfaceId));
  ipcMain.handle('bor:get-presence-bounds', () => {
    if (!presenceWindow || presenceWindow.isDestroyed()) return null;
    return presenceWindow.getBounds();
  });
  ipcMain.handle('bor:set-presence-bounds', (_event, bounds) => {
    if (!presenceWindow || presenceWindow.isDestroyed()) return { ok: false };
    const current = presenceWindow.getBounds();
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
    const point = orbPointForBounds(next, presenceMode, presenceAnchor);
    const pointDisplay = displayForPoint(point);
    const nextAnchor = anchorForPoint(point, pointDisplay);
    if (nextAnchor !== presenceAnchor) {
      presenceAnchor = nextAnchor;
      if (presenceMode !== 'collapsed') {
        next = boundsForAnchor(point, { width: next.width, height: next.height }, presenceAnchor, pointDisplay, presenceMode);
      }
    }
    presenceWindow.setBounds(next, false);
    sendPresenceLayout(next);
    writeHostState({ presenceBounds: next, presenceAnchor, presenceMode }).catch(() => {});
    return { ok: true, bounds: next, anchor: presenceAnchor, mode: presenceMode };
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
  ipcMain.handle('bor:persist-widget-preview-bounds', async (_event, surfaceId, bounds) => {
    const win = widgetPreviewWindows.get(surfaceId);
    const current = win && !win.isDestroyed() ? win.getBounds() : bounds;
    if (!current) return { ok: false };
    const result = await patchWidgetLayout(surfaceId, current);
    return { ok: Boolean(result), bounds: current };
  });
  ipcMain.handle('bor:preview-bridge', async (_event, surfaceId, message) => bridgePreviewMessage(surfaceId, message));
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
  ipcMain.handle('bor:list-surfaces', async () => (await fetchJson('/api/surfaces')).surfaces || []);
  ipcMain.handle('bor:open-surface', (_event, surfaceOrId) => openSurface(surfaceOrId));
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
        default:
          return { error: `unknown bridge op: ${op}` };
      }
    } catch (err) {
      log(`[shortcut-bridge] ${op} failed for ${surfaceId}: ${err.message}`);
      return { error: err.message };
    }
  });
  /** Open a BOR app full-screen from inside a shortcut iframe. */
  ipcMain.handle('bor:launch-app-from-shortcut', async (_event, appId) => {
    if (!appId || typeof appId !== 'string' || !appId.startsWith('app-')) {
      return { ok: false, error: 'launch-app requires an app-* id' };
    }
    try {
      const surface = await resolveSurface(appId);
      if (!surface) return { ok: false, error: `app ${appId} not found` };
      const win = await openSurface(surface);
      return { ok: !!win, id: appId };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle('bor:open-onboarding', () => {
    createOnboardingWindow();
    return { ok: true };
  });
  ipcMain.handle('bor:presence-mode', (_event, mode) => {
    if (!presenceWindow || presenceWindow.isDestroyed()) return { ok: false };
    if (mode === presenceMode) {
      const bounds = presenceWindow.getBounds();
      return { ok: true, bounds, anchor: presenceAnchor, mode: presenceMode };
    }
    const layout = presenceLayoutForMode(mode, presenceWindow.getBounds());
    presenceMode = mode;
    presenceAnchor = layout.anchor;
    presenceWindow.setBounds(layout.bounds, true);
    sendPresenceLayout(layout.bounds);
    writeHostState({ presenceBounds: layout.bounds, presenceAnchor, presenceMode }).catch(() => {});
    return { ok: true, bounds: layout.bounds, anchor: presenceAnchor, mode: presenceMode };
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
}

async function boot() {
  await startHostControlServer();
  await startRuntime();
  // Helper boot runs AFTER the runtime is up because we pass the runtime
  // URL into the helper. Failure here is non-fatal — Electron's existing
  // widget/surface windows still work, so we just log and continue.
  await startHelper().catch((err) => log(`helper: ${err.message}`));
  installMediaRequestHeaders();
  installIpcHandlers();
  Menu.setApplicationMenu(null);
  globalShortcut.register('CommandOrControl+Option+Space', () => {
    if (!presenceWindow || presenceWindow.isDestroyed()) createPresenceWindow();
    else presenceWindow.webContents.send('bor:toggle-presence');
  });

  const config = await getPublicConfig().catch(() => null);
  if (onboardingComplete(config)) {
    hideDockForPresence();
    await createPresenceWindow();
    await syncWidgetPreviews().catch((error) => log(`widget preview sync failed: ${error.message}`));
    queueWallpaperApply(config);
  } else {
    showDockForSetup();
    createOnboardingWindow();
  }
}

if (singleInstanceLock) {
  app.whenReady().then(boot).catch((error) => {
    console.error('[bor-v2] boot failed:', error);
    app.quit();
  });
}

app.on('second-instance', async () => {
  const config = await getPublicConfig().catch(() => null);
  if (onboardingComplete(config)) {
    hideDockForPresence();
    if (presenceWindow && !presenceWindow.isDestroyed()) bringPresenceForward();
    else createPresenceWindow().catch((error) => log(`presence reopen failed: ${error.message}`));
  } else if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.show();
    onboardingWindow.focus();
  } else {
    showDockForSetup();
    createOnboardingWindow();
  }
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
  if (runtimeProcess) {
    try { runtimeProcess.kill('SIGTERM'); } catch { /* ignore */ }
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

app.on('activate', async () => {
  const config = await getPublicConfig().catch(() => null);
  if (onboardingComplete(config)) {
    hideDockForPresence();
    createPresenceWindow().catch((error) => log(`presence reopen failed: ${error.message}`));
  } else {
    showDockForSetup();
    createOnboardingWindow();
  }
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
  setTimeout(async () => {
    const config = await getPublicConfig().catch(() => null);
    if (onboardingComplete(config)) {
      hideDockForPresence();
      if (!presenceWindow || presenceWindow.isDestroyed()) {
        createPresenceWindow().catch((error) => log(`presence recreate failed: ${error.message}`));
      }
    } else {
      showDockForSetup();
      createOnboardingWindow();
    }
  }, 0);
});
