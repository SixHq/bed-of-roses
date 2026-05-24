const root = document.querySelector('.presence');
const composer = document.getElementById('composer');
const orb = document.getElementById('orb');
const orbBadge = document.getElementById('orb-badge');
const promptInput = document.getElementById('prompt');
const chipRail = document.getElementById('chip-rail');
const attachButton = document.getElementById('attach');
const thought = document.getElementById('thought');
const thoughtMode = document.getElementById('thought-mode');
const thoughtBody = document.getElementById('thought-body');
const thoughtMeta = document.getElementById('thought-meta');
const thoughtFoot = document.getElementById('thought-foot');
const minimizeButton = document.getElementById('minimize-task');
const stopButton = document.getElementById('stop-task');
const closeButton = document.getElementById('close-thought');
const bubbleResizeZones = [...document.querySelectorAll('[data-bubble-resize]')];
const taskChip = document.getElementById('task-chip');
const taskChipName = document.getElementById('task-chip-name');
const taskChipPct = document.getElementById('task-chip-pct');
const surfacesButton = document.getElementById('surfaces');
const surfaceDrawer = document.getElementById('surface-drawer');
const surfaceList = document.getElementById('surface-list');
const setupButton = document.getElementById('setup');

let currentMode = 'collapsed';
let currentRequestId = null;
let taskMessages = [];
let taskMediaRefs = [];
let activeSayStreamId = null;
let activeSayText = '';
let activeSayItem = null;
let activeThinkingItem = null;
let activeCardItem = null;
let dragState = null;
let idleTimer = null;
let elapsedTimer = null;
let bubbleRenderTimer = null;
let taskStartedAt = null;
let minimizedTask = false;
let lastSurfaceId = null;
let attachedContextItems = [];
let currentAnchor = root?.dataset.anchor || 'bottom-right';
let currentPresenceBounds = null;
let hostPresenceMode = currentMode;
let composerSyncFrame = null;
let presenceResizeInFlight = false;
let renderedMediaUrls = new Set();
const BUBBLE_SIZE_STORAGE_KEY = 'bor.presence.thoughtBubbleSize.v1';
const BUBBLE_MIN_WIDTH = 238;
const BUBBLE_MIN_HEIGHT = 150;
const BUBBLE_ORB_CENTER = 31.25;
let bubbleResizeState = null;
let bubbleResizeFrame = null;
let bubbleUserSize = loadBubbleUserSize();

// ---------- Shortcut iframe lifecycle ----------
//
// Shortcuts are sandboxed iframe cards that render INSIDE the thought bubble.
// They are thread items like any other, but their DOM nodes MUST survive
// `renderBubble()` re-renders (which sets `thoughtBody.innerHTML` from
// scratch on every event). Otherwise every event reloads every iframe.
//
// Strategy: when renderThreadItem encounters a shortcut, it emits a
// placeholder div with `data-shortcut-mount="1"`. After renderBubble() sets
// innerHTML, `hydrateShortcutMounts()` walks the placeholders and either
// (a) moves the cached iframe from `shortcutCache` into the placeholder
// (preserving the iframe's JS state, IPC bridge, scroll position, etc.), or
// (b) mounts a fresh iframe if this is the first time we've seen this id.
//
// Cap: max 5 live shortcuts at once. Older ones demote to a frozen
// "tap to revive" placeholder. When the bubble window is hidden, every
// iframe sets `display: none` to suppress paint/layout work.
const SHORTCUT_MAX_LIVE = 5;
const shortcutCache = new Map(); // id -> { iframe, html, lastSeenAt }

function shortcutThemePrefix() {
  // Pull the active theme's tokens from the bubble's root and inject them as
  // a <style> prefix into each shortcut's srcdoc. The sandbox produces an
  // opaque-null origin, so the bubble's CSS variables are NOT inherited.
  const root = getComputedStyle(document.documentElement);
  const tokens = ['--label', '--label-2', '--label-3', '--accent', '--hairline', '--surface', '--surface-1', '--font-display', '--font-system', '--font-mono'];
  const lines = tokens.map((t) => {
    const v = root.getPropertyValue(t).trim();
    return v ? `  ${t}: ${v};` : '';
  }).filter(Boolean).join('\n');
  return `<style>
:root {
${lines}
}
*, *::before, *::after { box-sizing: border-box; }
/* CRITICAL: html + body must have height:100% for body's overflow:auto to
 * actually scroll. Without height resolved, max-height:100% resolves to 0
 * and tall content just clips invisibly inside the iframe. */
html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  background: transparent;
  color: var(--label);
  font-family: var(--font-system);
  -webkit-font-smoothing: antialiased;
}
body {
  overflow-y: auto;
  overflow-x: hidden;
  /* Subtle theme-aware scrollbar so tall content doesn't paint a chunky
   * native bar that fights the bubble's hairline aesthetic. */
  scrollbar-width: thin;
  scrollbar-color: rgba(220, 210, 255, 0.25) transparent;
}
body::-webkit-scrollbar { width: 8px; }
body::-webkit-scrollbar-track { background: transparent; }
body::-webkit-scrollbar-thumb { background: rgba(220, 210, 255, 0.25); border-radius: 4px; }
body::-webkit-scrollbar-thumb:hover { background: rgba(220, 210, 255, 0.4); }
button:focus-visible, input:focus-visible, select:focus-visible, [tabindex]:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>`;
}

function injectThemePrefix(html) {
  if (typeof html !== 'string') return '';
  const prefix = shortcutThemePrefix();
  // Inject right after <head> if present; otherwise before the doctype/html
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, (m) => `${m}${prefix}`);
  if (/<html\b[^>]*>/i.test(html)) return html.replace(/<html\b[^>]*>/i, (m) => `${m}<head>${prefix}</head>`);
  return `<!doctype html><html><head>${prefix}</head><body>${html}</body></html>`;
}

const bubbleState = {
  mode: 'Thinking',
  subject: '',
  width: 'compact',
  stream: '',
  intent: '',
  card: null,
  activities: [],
  thread: [],
  footer: null,
  done: false,
};

const PRESENCE_CHOICES = [
  {
    id: 'default',
    preset: 'nova',
    color: 'amber',
    vars: {
      '--presence-aura': '196, 168, 240',
      '--presence-face': '#FFD93D',
    },
  },
  {
    id: 'listening',
    preset: 'cipher',
    color: 'aurora',
    vars: {
      '--presence-aura': '143, 229, 197',
      '--presence-face': '#8FE5C5',
    },
  },
  {
    id: 'thinking',
    preset: 'aria',
    color: 'frost',
    vars: {
      '--presence-aura': '160, 203, 240',
      '--presence-face': '#A0CBF0',
    },
  },
  {
    id: 'alert',
    preset: 'echo',
    color: 'ember',
    vars: {
      '--presence-aura': '255, 99, 140',
      '--presence-face': '#FF638C',
    },
  },
];

const TOOL_META = {
  get_ux_ui_strict_guidelines: ['Check guidelines', 'theme + thumbnail spec', '✓'],
  web_search: ['Search the web', 'querying sources', '↗'],
  web_fetch: ['Read the web', 'fetching source', '↗'],
  view_image: ['Read image', 'external image URL', '⌕'],
  create_app: ['Build an app', 'generating surface', '✎'],
  update_app: ['Update an app', 'rewriting surface', '✎'],
  create_shortcut: ['Build a shortcut', 'generating bubble card', '✎'],
  update_shortcut: ['Update a shortcut', 'rewriting bubble card', '✎'],
  launch_shortcut: ['Open shortcut', 'bringing card forward', '↗'],
  delete_shortcut: ['Remove shortcut', 'removing bubble card', '×'],
  launch_app: ['Open app', 'bringing window forward', '↗'],
  suggest_shortcut: ['Suggest shortcut', 'asking the user', '?'],
  read_file: ['Read a file', 'opening local file', '⌕'],
  read_batch: ['Read files', 'opening local files', '⌕'],
  write_file: ['Write a file', 'streaming changes', '✎'],
  write_to_file: ['Write a file', 'streaming changes', '✎'],
  edit_file: ['Edit a file', 'streaming changes', '✎'],
  replace_in_file: ['Edit a file', 'patching content', '✎'],
  execute_command: ['Run a command', 'shell executor', '⌘'],
  screen_capture: ['Read the screen', 'capturing Mac display', '⌕'],
  locate_screen_element: ['Locate UI element', 'computer vision', '⌖'],
  computer_click: ['Click in app', 'macOS accessibility', '⌖'],
  computer_type: ['Type in app', 'focused Mac app', '⌨'],
  computer_key: ['Press shortcut', 'keyboard control', '⌘'],
  open_app: ['Open app', 'macOS launch services', '↗'],
  computer_use: ['Control Mac app', 'computer use loop', '⌖'],
  generate_image: ['Generate image', 'painting canvas', '◐'],
  create_svg: ['Add wallpaper item', 'placing SVG', '✦'],
  set_theme: ['Update theme', 'wallpaper + visual state', '✦'],
  list_surfaces: ['List surfaces', 'apps and widgets', '□'],
  read_surface_data: ['Read surface state', 'state.json', '⌕'],
  mutate_surface_data: ['Update surface state', 'state.json', '✎'],
  attempt_completion: ['All set', 'final note', '✓'],
};

const FILE_EDIT_TAGS = new Set(['write_file', 'write_to_file', 'edit_file', 'replace_in_file']);
const SURFACE_BUILD_TAGS = new Set(['create_app', 'update_app', 'create_shortcut', 'update_shortcut']);
const COMMAND_TAGS = new Set(['execute_command']);
const EDITOR_VISIBLE_LINE_LIMIT = 260;
const TASK_MESSAGE_LIMIT = 28;
const TASK_MEDIA_LIMIT = 6;
const TASK_CONTEXT_IMAGE_LIMIT = 3;
const ATTACHED_CONTEXT_LIMIT = 8;
const THOUGHT_MEDIA_CARD_LIMIT = 5;

function requestId() {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeTheme(id) {
  const theme = String(id || '').trim().toLowerCase();
  const aliases = {
    cartoon: 'cartoon-brutalist',
    brutalist: 'cartoon-brutalist',
    'cartoon-brutalist': 'cartoon-brutalist',
    't-cb': 'cartoon-brutalist',
    earthy: 'warm-earthy',
    warm: 'warm-earthy',
    'warm-earthy': 'warm-earthy',
    'warm-and-earthy': 'warm-earthy',
    't-we': 'warm-earthy',
    neo: 'neo-brutalist',
    'neo-brutalist': 'neo-brutalist',
    neobrutalist: 'neo-brutalist',
    't-nb': 'neo-brutalist',
    y2k: 'y2k-frutiger',
    frutiger: 'y2k-frutiger',
    'frutiger-aero': 'y2k-frutiger',
    'y2k-frutiger': 'y2k-frutiger',
    't-y2k': 'y2k-frutiger',
    riso: 'risograph',
    risograph: 'risograph',
    't-rs': 'risograph',
    crt: 'pixel-crt',
    pixel: 'pixel-crt',
    'pixel-crt': 'pixel-crt',
    't-crt': 'pixel-crt',
    glass: 'liquid-glass',
    liquid: 'liquid-glass',
    'liquid-glass': 'liquid-glass',
    't-lg': 'liquid-glass',
    memphis: 'memphis',
    't-mp': 'memphis',
    solarpunk: 'solarpunk',
    'solar-punk': 'solarpunk',
    't-sp': 'solarpunk',
    cyberpunk: 'cyberpunk',
    'cyber-punk': 'cyberpunk',
    't-cp': 'cyberpunk',
  };
  const normalized = aliases[theme] || theme;
  return [
    'bloom',
    'cartoon-brutalist',
    'warm-earthy',
    'neo-brutalist',
    'y2k-frutiger',
    'liquid-glass',
    'pixel-crt',
    'risograph',
    'memphis',
    'solarpunk',
    'cyberpunk',
  ].includes(normalized) ? normalized : 'bloom';
}

function presenceChoice(config) {
  return PRESENCE_CHOICES.find((choice) => choice.preset === config?.avatarStyle)
    || PRESENCE_CHOICES.find((choice) => choice.color === config?.avatarColor)
    || PRESENCE_CHOICES[0];
}

function applyPresenceConfig(config = {}) {
  const theme = normalizeTheme(config.baseTheme);
  const choice = presenceChoice(config);
  root.dataset.theme = theme;
  root.dataset.presenceState = choice.id;
  root.dataset.preset = choice.preset;
  for (const [key, value] of Object.entries(choice.vars)) {
    root.style.setProperty(key, value);
  }
}

async function hydratePresenceConfig() {
  const config = await window.borHost.getConfig().catch(() => null);
  applyPresenceConfig(config || {});
}

function applyPresenceLayout(layout = {}) {
  if (
    layout.mode &&
    layout.mode !== 'thinking' &&
    layout.mode !== 'minimized' &&
    !minimizedTask &&
    hasVisibleThoughtSession()
  ) {
    window.borHost.setPresenceMode('thinking')
      .then(applyPresenceLayout)
      .catch(() => {});
    return;
  }
  if (layout.anchor) {
    currentAnchor = layout.anchor;
    root.dataset.anchor = layout.anchor;
  }
  if (layout.bounds) currentPresenceBounds = layout.bounds;
  if (layout.mode) {
    hostPresenceMode = layout.mode;
    currentMode = layout.mode;
    root.dataset.mode = layout.mode;
  }
  scheduleComposerSync();
}

function setMode(mode) {
  const alreadyLocal = currentMode === mode;
  currentMode = mode;
  root.dataset.mode = mode;
  if (!alreadyLocal || hostPresenceMode !== mode) {
    window.borHost.setPresenceMode(mode)
      .then(applyPresenceLayout)
      .catch(() => {});
  }
  if (mode === 'expanded') {
    window.setTimeout(() => {
      promptInput.focus();
      resizePrompt();
    }, 100);
  }
}

function setOrbState(state) {
  root.dataset.orbState = state;
}

function pulseComplete() {
  root.dataset.completePulse = 'true';
  window.setTimeout(() => {
    delete root.dataset.completePulse;
  }, 460);
}

function resetIdleTimer() {
  window.clearTimeout(idleTimer);
  if (root.dataset.orbState === 'sleep') setOrbState(currentRequestId ? 'busy' : 'idle');
  idleTimer = window.setTimeout(() => {
    if (!currentRequestId && currentMode === 'collapsed') setOrbState('sleep');
  }, 5 * 60 * 1000);
}

function clampNumber(value, min, max) {
  const next = Number(value);
  if (!Number.isFinite(next)) return min;
  return Math.max(min, Math.min(max, next));
}

function loadBubbleUserSize() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BUBBLE_SIZE_STORAGE_KEY) || 'null');
    if (
      parsed &&
      Number.isFinite(Number(parsed.width)) &&
      Number.isFinite(Number(parsed.height))
    ) {
      return {
        width: Math.round(Number(parsed.width)),
        height: Math.round(Number(parsed.height)),
      };
    }
  } catch {
    // Ignore stale size data.
  }
  return null;
}

function saveBubbleUserSize(size) {
  try {
    if (!size) window.localStorage.removeItem(BUBBLE_SIZE_STORAGE_KEY);
    else window.localStorage.setItem(BUBBLE_SIZE_STORAGE_KEY, JSON.stringify({
      width: Math.round(size.width),
      height: Math.round(size.height),
    }));
  } catch {
    // Bubble resizing is still useful even if storage is unavailable.
  }
}

function applyBubbleUserSize(size = bubbleUserSize) {
  if (!size) {
    thought.classList.remove('is-user-sized');
    thought.style.removeProperty('--bubble-user-width');
    thought.style.removeProperty('--bubble-user-height');
    return;
  }
  const maxWidth = Math.max(BUBBLE_MIN_WIDTH, (window.screen.availWidth || 1200) - 16);
  const maxHeight = Math.max(BUBBLE_MIN_HEIGHT, (window.screen.availHeight || 900) - 90);
  bubbleUserSize = {
    width: clampNumber(size.width, BUBBLE_MIN_WIDTH, maxWidth),
    height: clampNumber(size.height, BUBBLE_MIN_HEIGHT, maxHeight),
  };
  thought.classList.add('is-user-sized');
  thought.style.setProperty('--bubble-user-width', `${bubbleUserSize.width}px`);
  thought.style.setProperty('--bubble-user-height', `${bubbleUserSize.height}px`);
}

function orbPointForPresenceBounds(bounds, anchor = currentAnchor) {
  if (!bounds) return null;
  return {
    x: anchor.endsWith('right') ? bounds.x + bounds.width - BUBBLE_ORB_CENTER : bounds.x + BUBBLE_ORB_CENTER,
    y: anchor.startsWith('top') ? bounds.y + BUBBLE_ORB_CENTER : bounds.y + bounds.height - BUBBLE_ORB_CENTER,
  };
}

function presenceBoundsForBubbleSize(state, size) {
  if (!state?.bounds || !size) return null;
  const widthDelta = Math.round(size.width - state.startWidth);
  const heightDelta = Math.round(size.height - state.startHeight);
  const changesWidth = state.dir.includes('e') || state.dir.includes('w');
  const changesHeight = state.dir.includes('n') || state.dir.includes('s');
  const width = changesWidth ? state.bounds.width + widthDelta : state.bounds.width;
  const height = changesHeight ? state.bounds.height + heightDelta : state.bounds.height;
  const x = state.dir.includes('w') ? state.bounds.x - widthDelta : state.bounds.x;
  const y = state.dir.includes('n') ? state.bounds.y - heightDelta : state.bounds.y;
  return { x, y, width, height };
}

function scheduleBubbleWindowResize(size) {
  if (!bubbleResizeState) return;
  bubbleResizeState.pendingSize = size;
  if (bubbleResizeFrame) return;
  bubbleResizeFrame = window.requestAnimationFrame(() => {
    bubbleResizeFrame = null;
    const state = bubbleResizeState;
    const nextSize = state?.pendingSize;
    const bounds = presenceBoundsForBubbleSize(state, nextSize);
    if (!state || !nextSize || !bounds) return;
    window.borHost.setPresenceBounds(bounds)
      .then(applyPresenceLayout)
      .catch(() => {});
  });
}

function bubbleSizeForPointer(event, state) {
  const dx = event.screenX - state.startScreenX;
  const dy = event.screenY - state.startScreenY;
  const nextWidth = state.dir.includes('e')
    ? state.startWidth + dx
    : state.dir.includes('w')
      ? state.startWidth - dx
      : state.startWidth;
  const nextHeight = state.dir.includes('s')
    ? state.startHeight + dy
    : state.dir.includes('n')
      ? state.startHeight - dy
      : state.startHeight;
  return {
    width: clampNumber(
      nextWidth,
      BUBBLE_MIN_WIDTH,
      state.maxWidth,
    ),
    height: clampNumber(
      nextHeight,
      BUBBLE_MIN_HEIGHT,
      state.maxHeight,
    ),
  };
}

function startBubbleResize(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const rect = thought.getBoundingClientRect();
  const bounds = currentPresenceBounds || {
    x: window.screenX || 0,
    y: window.screenY || 0,
    width: window.innerWidth,
    height: window.innerHeight,
  };
  const anchor = currentAnchor || root.dataset.anchor || 'bottom-right';
  const dir = String(event.currentTarget?.dataset?.bubbleResize || 'se').toLowerCase();
  const startWidth = Math.round(rect.width || bubbleUserSize?.width || 336);
  const startHeight = Math.round(rect.height || bubbleUserSize?.height || 320);
  bubbleResizeState = {
    pointerId: event.pointerId,
    handle: event.currentTarget,
    dir,
    anchor,
    bounds,
    orbPoint: orbPointForPresenceBounds(bounds, anchor),
    widthPadding: Math.max(100, bounds.width - startWidth),
    heightPadding: Math.max(120, bounds.height - startHeight),
    startScreenX: event.screenX,
    startScreenY: event.screenY,
    startWidth,
    startHeight,
    maxWidth: Math.max(BUBBLE_MIN_WIDTH, (window.screen.availWidth || 1200) - Math.max(100, bounds.width - startWidth) - 18),
    maxHeight: Math.max(BUBBLE_MIN_HEIGHT, (window.screen.availHeight || 900) - Math.max(120, bounds.height - startHeight) - 18),
    pendingSize: null,
  };
  root.dataset.bubbleResizing = 'true';
  try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* noop */ }
  window.borHost.getPresenceBounds()
    .then((freshBounds) => {
      if (!freshBounds || bubbleResizeState?.pointerId !== event.pointerId) return;
      bubbleResizeState.bounds = freshBounds;
      bubbleResizeState.orbPoint = orbPointForPresenceBounds(freshBounds, bubbleResizeState.anchor);
      bubbleResizeState.widthPadding = Math.max(100, freshBounds.width - startWidth);
      bubbleResizeState.heightPadding = Math.max(120, freshBounds.height - startHeight);
      bubbleResizeState.maxWidth = Math.max(BUBBLE_MIN_WIDTH, (window.screen.availWidth || 1200) - bubbleResizeState.widthPadding - 18);
      bubbleResizeState.maxHeight = Math.max(BUBBLE_MIN_HEIGHT, (window.screen.availHeight || 900) - bubbleResizeState.heightPadding - 18);
    })
    .catch(() => {});
}

function moveBubbleResize(event) {
  const state = bubbleResizeState;
  if (!state || state.pointerId !== event.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  const nextSize = bubbleSizeForPointer(event, state);
  applyBubbleUserSize(nextSize);
  scheduleBubbleWindowResize(nextSize);
}

function endBubbleResize(event) {
  const state = bubbleResizeState;
  if (!state || state.pointerId !== event.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  try { state.handle?.releasePointerCapture(event.pointerId); } catch { /* noop */ }
  saveBubbleUserSize(bubbleUserSize);
  bubbleResizeState = null;
  delete root.dataset.bubbleResizing;
}

function dragBlocked(target) {
  return Boolean(target.closest('#prompt, .send, .iconbtn, #setup, .surface-row, .bubble, .task-chip, .chip-rail, .context-chip'));
}

function togglePresence() {
  if ((currentMode === 'collapsed' || currentMode === 'minimized') && hasVisibleThoughtSession()) {
    restoreTask();
    return;
  }
  if (currentMode === 'thinking' && hasVisibleThoughtSession()) {
    minimizeThought();
    return;
  }
  if (currentMode === 'collapsed' || currentMode === 'minimized') {
    if (!currentRequestId && !hasThoughtSession()) hideThought();
    minimizedTask = false;
    taskChip.classList.add('hidden');
    setMode('expanded');
    return;
  }
  if (!currentRequestId) hideThought();
  setMode('collapsed');
}

function startDrag(event) {
  if (event.button !== 0 || dragBlocked(event.target)) return;
  event.preventDefault();
  root.dataset.dragging = 'true';
  dragState = {
    pointerId: event.pointerId,
    startX: event.screenX,
    startY: event.screenY,
    bounds: null,
    moved: false,
    startedOnOrb: Boolean(event.target.closest('#orb')),
  };
  try { composer.setPointerCapture(event.pointerId); } catch { /* noop */ }
  window.borHost.getPresenceBounds()
    .then((bounds) => {
      if (dragState?.pointerId === event.pointerId) dragState.bounds = bounds;
    })
    .catch(() => {});
}

composer.addEventListener('pointerdown', startDrag);

composer.addEventListener('pointermove', (event) => {
  if (!dragState || dragState.pointerId !== event.pointerId || !dragState.bounds) return;
  const dx = event.screenX - dragState.startX;
  const dy = event.screenY - dragState.startY;
  if (!dragState.moved && Math.hypot(dx, dy) < 4) return;
  dragState.moved = true;
  event.preventDefault();
  window.borHost.setPresenceBounds({
    x: dragState.bounds.x + dx,
    y: dragState.bounds.y + dy,
  }).catch(() => {});
});

function endDrag(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  const completed = dragState;
  try { composer.releasePointerCapture(event.pointerId); } catch { /* noop */ }
  dragState = null;
  delete root.dataset.dragging;
  if (completed.startedOnOrb && !completed.moved) togglePresence();
}

composer.addEventListener('pointerup', endDrag);
composer.addEventListener('pointercancel', endDrag);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[char]);
}

function shortText(value, max = 72) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function runtimeUrl() {
  return window.borHost?.runtimeUrl || 'http://127.0.0.1:7777';
}

function runtimeOrigin() {
  try {
    return new URL(runtimeUrl()).origin;
  } catch {
    return 'http://127.0.0.1:7777';
  }
}

function withQueryParams(url, params = {}) {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

function localPathToFileUrl(value) {
  const raw = String(value || '').trim();
  if (!raw.startsWith('/')) return raw;
  return `file://${raw.split('/').map((part) => encodeURIComponent(part)).join('/')}`;
}

function resolveMediaUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(https?:|data:|blob:|file:)/i.test(raw)) return raw;
  if (/^\/(?:Users|Volumes|private|tmp)\//.test(raw)) return localPathToFileUrl(raw);
  if (raw.startsWith('/')) return `${runtimeUrl()}${raw}`;
  return raw;
}

function cleanMediaPath(value) {
  return String(value || '').split('?')[0].split('#')[0].toLowerCase();
}

function mediaTypeLooksImage(mediaType = '') {
  return String(mediaType || '').toLowerCase().startsWith('image/');
}

function mediaTypeLooksVideo(mediaType = '') {
  return String(mediaType || '').toLowerCase().startsWith('video/');
}

function isImageMedia(value, mediaType = '') {
  return mediaTypeLooksImage(mediaType) || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(cleanMediaPath(value));
}

function isVideoMedia(value, mediaType = '') {
  return mediaTypeLooksVideo(mediaType) || /\.(mp4|webm|mov|m4v|ogv)$/i.test(cleanMediaPath(value));
}

function mediaTypeForUrl(value) {
  const path = cleanMediaPath(value);
  if (path.endsWith('.mp4')) return 'video/mp4';
  if (path.endsWith('.webm')) return 'video/webm';
  if (path.endsWith('.mov')) return 'video/quicktime';
  if (path.endsWith('.m4v')) return 'video/x-m4v';
  if (path.endsWith('.ogv')) return 'video/ogg';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.gif')) return 'image/gif';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.avif')) return 'image/avif';
  return '';
}

function mediaUrlFromPayload(data = {}) {
  return data?.url || data?.imageUrl || data?.screenshotUrl || data?.path || data?.file || '';
}

function stripUrlNoise(value) {
  return String(value || '')
    .trim()
    .replace(/^["'(<\[]+/, '')
    .replace(/[)"'\],.;:!?]+$/g, '');
}

function parseHttpUrl(value) {
  const raw = stripUrlNoise(value);
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function extractUrlsFromText(value = '') {
  const text = String(value || '');
  const found = [];
  const patterns = [
    /\bhttps?:\/\/[^\s<>"'`]+/gi,
    /\bfile:\/\/\/[^\s<>"'`]+/gi,
    /\/api\/images\/[^\s<>"'`)]+/gi,
    /\/(?:Users|Volumes|private|tmp)\/[^\n<>"'`]+?\.(?:png|jpe?g|gif|webp|avif|svg|mp4|webm|mov|m4v|ogv)\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const url = stripUrlNoise(match[0]);
      if (url && !found.includes(url)) found.push(url);
    }
  }
  return found;
}

function youtubeEmbedFor(parsed) {
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  let id = '';
  if (host === 'youtu.be') {
    id = parsed.pathname.split('/').filter(Boolean)[0] || '';
  } else if (host.endsWith('youtube.com') || host === 'youtube-nocookie.com') {
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') id = parsed.searchParams.get('v') || '';
    if (['embed', 'shorts', 'live'].includes(parts[0])) id = parts[1] || '';
  }
  id = id.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id) return null;
  // IMPORTANT: do NOT set enablejsapi / origin / widget_referrer here. The
  // presence window is loaded via Electron's loadFile() so the parent window
  // origin is file://. YouTube's IFrame Player API verifies the parent
  // origin matches the `origin=` query param over postMessage, which a
  // file:// parent will never satisfy — the player refuses to start
  // playback and the user sees an infinite spinner (the thumbnail still
  // loads because it's fetched separately).
  // Using youtube-nocookie.com avoids the cookie-domain checks that some
  // ad blockers / strict referrer policies also trip on.
  return {
    provider: 'youtube',
    kind: 'video',
    embedUrl: withQueryParams(`https://www.youtube-nocookie.com/embed/${id}`, {
      rel: '0',
      playsinline: '1',
      modestbranding: '1',
    }),
    canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
    label: 'YouTube',
  };
}

function tiktokEmbedFor(parsed) {
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  if (!host.endsWith('tiktok.com')) return null;
  const match = parsed.pathname.match(/\/video\/(\d+)/);
  const id = match?.[1] || '';
  return {
    provider: 'tiktok',
    kind: 'social-video',
    embedUrl: id ? `https://www.tiktok.com/embed/v2/${id}` : '',
    canonicalUrl: parsed.href,
    label: 'TikTok',
  };
}

function instagramEmbedFor(parsed) {
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  if (!host.endsWith('instagram.com')) return null;
  const match = parsed.pathname.match(/^\/(reel|reels|p|tv)\/([^/?#]+)/i);
  if (!match) return null;
  const type = match[1].toLowerCase() === 'reels' ? 'reel' : match[1].toLowerCase();
  const id = match[2];
  return {
    provider: 'instagram',
    kind: type === 'p' ? 'social-post' : 'social-video',
    embedUrl: `https://www.instagram.com/${type}/${encodeURIComponent(id)}/embed`,
    canonicalUrl: `https://www.instagram.com/${type}/${encodeURIComponent(id)}/`,
    label: type === 'p' ? 'Instagram' : 'Instagram Reel',
  };
}

function vimeoEmbedFor(parsed) {
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  if (!host.endsWith('vimeo.com')) return null;
  const id = parsed.pathname.split('/').filter(Boolean).find((part) => /^\d+$/.test(part));
  if (!id) return null;
  return {
    provider: 'vimeo',
    kind: 'video',
    embedUrl: `https://player.vimeo.com/video/${id}`,
    canonicalUrl: parsed.href,
    label: 'Vimeo',
  };
}

function prefersDarkScheme() {
  try {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  } catch {
    return false;
  }
}

function tweetEmbedFor(parsed) {
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  if (!host.endsWith('twitter.com') && !host.endsWith('x.com')) return null;
  const m = parsed.pathname.match(/\/status(?:es)?\/(\d+)/i);
  const id = m ? m[1] : '';
  if (!id) return null;
  const theme = prefersDarkScheme() ? 'dark' : 'light';
  const embedUrl = withQueryParams(`https://platform.twitter.com/embed/Tweet.html`, {
    id,
    theme,
    dnt: 'true',
    embedId: `bor-tweet-${id}`,
  });
  return {
    provider: host.endsWith('x.com') ? 'x' : 'twitter',
    kind: 'tweet',
    embedUrl,
    canonicalUrl: parsed.href.replace(/^http:/, 'https:'),
    label: host.endsWith('x.com') ? 'X (Twitter)' : 'Twitter',
  };
}

function embedMediaForUrl(value) {
  const parsed = parseHttpUrl(value);
  if (!parsed) return null;
  return tweetEmbedFor(parsed)
    || youtubeEmbedFor(parsed)
    || tiktokEmbedFor(parsed)
    || instagramEmbedFor(parsed)
    || vimeoEmbedFor(parsed);
}

function mediaCardKey(card = {}) {
  return String(card.canonicalUrl || card.url || card.path || card.embedUrl || '').trim();
}

function mediaCardForUrl(value, fallback = {}) {
  const raw = stripUrlNoise(value);
  if (!raw) return null;
  const embed = embedMediaForUrl(raw);
  if (embed) {
    return {
      type: 'video',
      status: fallback.status || 'done',
      provider: embed.provider,
      kind: embed.kind,
      embedUrl: embed.embedUrl,
      canonicalUrl: embed.canonicalUrl,
      url: embed.canonicalUrl,
      path: raw,
      title: fallback.title || embed.label,
      meta: fallback.meta || raw,
    };
  }
  const mediaType = fallback.mediaType || mediaTypeForUrl(raw);
  if (isVideoMedia(raw, mediaType)) {
    return {
      type: 'video',
      status: fallback.status || 'done',
      provider: 'file',
      kind: 'video',
      url: resolveMediaUrl(raw),
      path: raw,
      title: fallback.title || 'video preview',
      meta: fallback.meta || raw,
      mediaType,
    };
  }
  if (isImageMedia(raw, mediaType) || fallback.type === 'image') {
    return {
      type: 'image',
      status: fallback.status || 'done',
      url: resolveMediaUrl(raw),
      path: raw,
      title: fallback.title || 'image preview',
      meta: fallback.meta || raw,
      kind: fallback.kind || 'image',
      mediaType,
    };
  }
  return null;
}

function collectMediaCandidates(data = {}, fallback = {}) {
  const candidates = [];
  const add = (value, meta = {}) => {
    const raw = stripUrlNoise(value);
    if (!raw) return;
    candidates.push({ raw, meta });
  };

  add(mediaUrlFromPayload(data), {
    title: fallback.title,
    meta: fallback.meta,
    kind: fallback.kind,
    mediaType: data?.mediaType || fallback.mediaType,
    type: fallback.type,
  });
  add(data?.canonicalUrl, fallback);
  add(data?.embedUrl, fallback);
  add(data?.videoUrl, { ...fallback, title: fallback.title || 'video preview' });
  add(data?.thumbnailUrl, { ...fallback, title: fallback.title || 'image preview', type: 'image' });

  if (Array.isArray(data?.results)) {
    data.results.slice(0, 8).forEach((result) => {
      add(result?.url, { title: result?.title || fallback.title, meta: result?.url || fallback.meta });
      extractUrlsFromText(`${result?.title || ''}\n${result?.snippet || ''}\n${result?.description || ''}`).forEach((url) => {
        add(url, { title: result?.title || fallback.title, meta: url });
      });
    });
  }

  if (Array.isArray(data?.media)) {
    data.media.slice(0, 8).forEach((item) => {
      if (typeof item === 'string') add(item, fallback);
      else add(mediaUrlFromPayload(item) || item?.url, { ...fallback, ...item });
    });
  }

  [
    data?.text,
    data?.description,
    data?.stdout,
    data?.stderr,
    data?.output,
    data?.raw,
  ].forEach((text) => {
    extractUrlsFromText(text).forEach((url) => add(url, fallback));
  });

  const cards = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const card = mediaCardForUrl(candidate.raw, { ...fallback, ...candidate.meta });
    const key = card ? mediaCardKey(card) : '';
    if (!card || !key || seen.has(key)) continue;
    seen.add(key);
    cards.push(card);
  }
  return cards;
}

function appendMediaCard(card = {}) {
  const key = mediaCardKey(card);
  if (!key || renderedMediaUrls.has(key)) return false;
  renderedMediaUrls.add(key);
  if (card.type === 'image') {
    rememberTaskMedia({
      url: card.path || card.url,
      title: card.title || card.meta || 'image',
      kind: card.kind || 'image',
      mediaType: card.mediaType,
    });
  }
  setThreadCard(card);
  bubbleState.width = 'wide';
  return true;
}

function appendMediaCardsFromPayload(data = {}, fallback = {}, limit = THOUGHT_MEDIA_CARD_LIMIT) {
  let count = 0;
  for (const card of collectMediaCandidates(data, fallback)) {
    if (count >= limit) break;
    if (appendMediaCard(card)) count += 1;
  }
  return count;
}

function dimensionsLabel(data = {}) {
  const dims = data?.screenshot || data?.dimensions || {};
  const width = dims.width || data?.width;
  const height = dims.height || data?.height;
  return width && height ? `${width} x ${height}` : '';
}

function resetTaskSession() {
  taskMessages = [];
  taskMediaRefs = [];
}

function hasThoughtSession() {
  return Boolean(
    minimizedTask ||
    currentRequestId ||
    bubbleState.thread.length ||
    bubbleState.stream ||
    bubbleState.intent ||
    bubbleState.card ||
    bubbleState.activities.length
  );
}

function hasVisibleThoughtSession() {
  return hasThoughtSession() || !thought.classList.contains('hidden');
}

function compactTaskMessages() {
  if (taskMessages.length <= TASK_MESSAGE_LIMIT) return;
  const first = taskMessages[0]?.role === 'system' ? taskMessages.slice(0, 1) : [];
  const tail = taskMessages.slice(-(TASK_MESSAGE_LIMIT - first.length));
  taskMessages = [...first, ...tail];
}

function rememberTaskMedia({ url = '', title = '', kind = 'image', mediaType = '' } = {}) {
  const raw = String(url || '').trim();
  if (!raw || !isImageMedia(raw)) return;
  const normalized = raw.startsWith('/api/images/') ? raw : resolveMediaUrl(raw);
  taskMediaRefs = taskMediaRefs.filter((item) => item.url !== normalized);
  taskMediaRefs.push({
    url: normalized,
    title: title || raw,
    kind,
    mediaType: mediaType || mediaTypeForUrl(raw),
    at: Date.now(),
  });
  if (taskMediaRefs.length > TASK_MEDIA_LIMIT) taskMediaRefs = taskMediaRefs.slice(-TASK_MEDIA_LIMIT);
}

function attachedContextText(items = []) {
  // Images attach via image_url vision blocks (see userContentForTask), not
  // text — skip them in the text manifest. Errors also skip.
  const valid = items.filter((item) => item && item.path && item.kind !== 'error' && item.kind !== 'image');
  if (!valid.length) return '';
  const blocks = valid.map((item, index) => {
    if (item.kind === 'folder') {
      return [
        `${index + 1}. FOLDER "${item.name}"`,
        `Path: ${item.path}`,
        'Tree:',
        item.tree || '(tree unavailable)',
        'Use <read_file>, <read_file_in_chunks>, <list_files>, or <search_files> on exact paths from this tree when you need file contents.',
      ].join('\n');
    }
    return [
      `${index + 1}. FILE "${item.name}"${item.size ? ` (${item.size})` : ''}`,
      `Path: ${item.path}`,
      'Use <read_file> for normal files. Use <read_file_in_chunks> if the file is large or read_file truncates.',
    ].join('\n');
  });
  return [
    '[Attached context selected by the user]',
    ...blocks,
    '[/Attached context]',
  ].join('\n\n');
}

function attachedContextImageBlocks(items = []) {
  return items
    .filter((item) => item && item.kind === 'image' && item.dataUrl)
    .map((item) => ({
      type: 'image_url',
      url: item.dataUrl,
      mediaType: item.mediaType || mediaTypeForUrl(item.path) || 'image/png',
    }));
}

function taskPromptWithContext(prompt, contextItems = []) {
  const context = attachedContextText(contextItems);
  if (!context) return prompt;
  return [prompt || 'Use the attached context.', '', context].join('\n');
}

function userContentForTask(prompt, contextItems = []) {
  const text = taskPromptWithContext(prompt, contextItems);
  // Images attached via the + button: pass as vision blocks so the model
  // actually sees them. The text manifest skips these (attachedContextText).
  const attachedImageBlocks = attachedContextImageBlocks(contextItems);
  // Continuity: also include recent in-bubble images from this same task.
  const continuityImages = taskMediaRefs
    .filter((item) => item?.url && isImageMedia(item.url))
    .slice(-TASK_CONTEXT_IMAGE_LIMIT)
    .map((item) => ({
      type: 'image_url',
      url: item.url,
      mediaType: item.mediaType || mediaTypeForUrl(item.url),
    }));
  if (!attachedImageBlocks.length && !continuityImages.length) return text;
  const annotations = [];
  if (attachedImageBlocks.length) {
    annotations.push(`[${attachedImageBlocks.length} image attachment${attachedImageBlocks.length === 1 ? '' : 's'} from the user are attached below. Refer to them when answering the request.]`);
  }
  if (continuityImages.length) {
    annotations.push('[Task continuity: recent thought-bubble images from this same task are also attached. Use them when the user refers to the screenshot, image, screen, visual result, "this", "that", or asks what is visible.]');
  }
  return [
    {
      type: 'text',
      text: [text, '', ...annotations].join('\n'),
    },
    ...attachedImageBlocks,
    ...continuityImages,
  ];
}

function appendTaskUserMessage(prompt, contextItems = []) {
  taskMessages.push({ role: 'user', content: userContentForTask(prompt, contextItems) });
  compactTaskMessages();
}

function appendTaskAssistantMessage(recorded) {
  const text = String(recorded || '').trim();
  if (!text) return;
  taskMessages.push({ role: 'assistant', content: text });
  compactTaskMessages();
}

function contextKindLabel(item = {}) {
  if (item.kind === 'folder') return 'folder';
  if (item.kind === 'image') return 'image';
  if (item.kind === 'file') return 'file';
  if (item.kind === 'error') return 'error';
  return 'item';
}

function renderAttachedContext() {
  if (!chipRail) return;
  chipRail.innerHTML = '';
  if (!attachedContextItems.length) {
    chipRail.classList.add('hidden');
    scheduleComposerSync();
    return;
  }
  chipRail.classList.remove('hidden');
  attachedContextItems.forEach((item, index) => {
    const chip = document.createElement('span');
    chip.className = `chip chip-aura context-chip context-${escapeHtml(contextKindLabel(item))}`;
    chip.title = item.path || item.name || 'attached context';
    chip.innerHTML = `
      <span class="context-kind">${escapeHtml(contextKindLabel(item))}</span>
      <span class="context-name">${escapeHtml(item.name || item.path || 'context')}</span>
      ${item.size ? `<span class="context-size">${escapeHtml(item.size)}</span>` : ''}
      <button type="button" class="context-remove" data-context-index="${index}" aria-label="Remove ${escapeHtml(item.name || 'context')}">×</button>
    `;
    chipRail.append(chip);
  });
  scheduleComposerSync();
}

function addAttachedContext(items = []) {
  const next = [...attachedContextItems];
  for (const item of items) {
    if (!item || !item.path) continue;
    // Keep image-with-error items in the chip rail so the user sees the
    // "image too large" message; only drop other-kind errors silently.
    if (item.kind === 'error') continue;
    const existingIndex = next.findIndex((entry) => entry.path === item.path);
    if (existingIndex !== -1) next.splice(existingIndex, 1);
    next.push(item);
  }
  attachedContextItems = next.slice(-ATTACHED_CONTEXT_LIMIT);
  renderAttachedContext();
}

function clearAttachedContext() {
  attachedContextItems = [];
  renderAttachedContext();
}

function normalizeEditorBody(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/^<!\[CDATA\[/, '')
    .replace(/\]\]>$/g, '')
    .replace(/<\/(?:write_file|write_to_file|edit_file|replace_in_file|create_app|update_app|create_shortcut|update_shortcut)[^>]*$/i, '');
}

function extractChildCdata(value, childName) {
  const source = String(value || '');
  const open = new RegExp(`<${childName}\\b[^>]*>\\s*<!\\[CDATA\\[`, 'i');
  const match = open.exec(source);
  if (!match) return '';
  let text = source.slice((match.index || 0) + match[0].length);
  const close = new RegExp(`\\]\\]>\\s*</${childName}>[\\s\\S]*$`, 'i');
  text = text.replace(close, '');
  text = text.replace(new RegExp(`</${childName}[^>]*$`, 'i'), '');
  return text;
}

function normalizeSurfaceCodeBody(value) {
  const raw = normalizeEditorBody(value);
  const html = extractChildCdata(raw, 'html');
  if (html) return html;
  const thumbnail = extractChildCdata(raw, 'thumbnail');
  if (thumbnail) return thumbnail;
  const doc = extractChildCdata(raw, 'doc');
  if (doc) return doc;
  return raw
    .replace(/^<thumbnail\b[^>]*>/i, '')
    .replace(/^<html\b[^>]*>/i, '')
    .replace(/^<doc\b[^>]*>/i, '');
}

function editorBodyFor(card = {}) {
  return SURFACE_BUILD_TAGS.has(card.tag)
    ? normalizeSurfaceCodeBody(card.body)
    : normalizeEditorBody(card.body);
}

function normalizeTerminalText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/^<!\[CDATA\[/, '')
    .replace(/\]\]>$/g, '')
    .replace(/<\/execute_command[^>]*$/i, '');
}

function fileEditTagForEvent(event, data = {}) {
  const fromPayload = String(data?.tag || '').trim();
  if (FILE_EDIT_TAGS.has(fromPayload)) return fromPayload;
  return FILE_EDIT_TAGS.has(event) ? event : null;
}

function editorTitleForTag(tag) {
  if (tag === 'create_app' || tag === 'create_shortcut') return 'building';
  if (tag === 'update_app' || tag === 'update_shortcut') return 'updating';
  if (tag === 'replace_in_file' || tag === 'edit_file') return 'editing';
  return 'writing';
}

function editorStatusFor(card) {
  if (card.status === 'error') return 'failed';
  if (card.status === 'done') return 'saved';
  const text = editorBodyFor(card);
  const lines = text ? text.split('\n').length : 0;
  return lines ? `${lines} lines` : 'streaming';
}

function buildWritePreviewLines(text) {
  const rawLines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const lines = rawLines.length === 1 && rawLines[0] === '' ? [] : rawLines;
  return lines.map((line, index) => ({
    kind: 'add',
    num: index + 1,
    text: line || ' ',
  }));
}

function buildReplacePreviewLines(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let mode = 'context';
  let num = 1;
  for (const line of lines) {
    if (line.startsWith('------- SEARCH')) {
      mode = 'del';
      continue;
    }
    if (line.startsWith('=======')) {
      mode = 'add';
      continue;
    }
    if (line.startsWith('+++++++ REPLACE')) {
      mode = 'context';
      continue;
    }
    if (!line && mode === 'context') continue;
    out.push({
      kind: mode,
      num: num++,
      text: line || ' ',
    });
  }
  return out;
}

function editorAllPreviewLines(card) {
  const text = editorBodyFor(card);
  if (!text) {
    return [
      { kind: 'context', num: 1, text: `${editorTitleForTag(card.tag)} ${card.path || 'file'}...` },
      { kind: 'add', num: 2, text: 'waiting for streamed snippet' },
    ];
  }
  const all = card.tag === 'replace_in_file' || text.includes('------- SEARCH')
    ? buildReplacePreviewLines(text)
    : buildWritePreviewLines(text);
  return all;
}

function editorPreviewFor(card) {
  const text = editorBodyFor(card);
  const all = editorAllPreviewLines(card);
  const statsRows = text ? all : [];
  const stats = {
    added: statsRows.filter((row) => row.kind === 'add').length,
    removed: statsRows.filter((row) => row.kind === 'del').length,
    total: statsRows.length,
    hidden: 0,
  };
  if (all.length <= EDITOR_VISIBLE_LINE_LIMIT) return { rows: all, stats };
  const hidden = all.length - EDITOR_VISIBLE_LINE_LIMIT;
  stats.hidden = hidden;
  return {
    rows: [
      { kind: 'gap', num: '…', text: `${hidden.toLocaleString()} earlier lines omitted from preview` },
      ...all.slice(-EDITOR_VISIBLE_LINE_LIMIT),
    ],
    stats,
  };
}

function ensureEditorCard({ tag = 'write_file', path = '', body = undefined, status = 'running', bytes = 0, applied = null } = {}) {
  const existing = activeCardItem?.card?.type === 'editor' && activeCardItem.card.status !== 'done'
    ? activeCardItem.card
    : null;
  const card = {
    ...(existing || {}),
    type: 'editor',
    tag,
    path: path || existing?.path || '',
    body: body ?? existing?.body ?? '',
    status,
    bytes: bytes || existing?.bytes || 0,
    applied: applied || existing?.applied || null,
  };
  bubbleState.width = 'wide';
  setThreadCard(card);
  return card;
}

function appendEditorDelta(data = {}) {
  const tag = fileEditTagForEvent(data.name, data) || data.name || 'write_file';
  const card = ensureEditorCard({ tag, path: data.attrs?.path, status: 'running' });
  card.body = typeof data.fullText === 'string'
    ? normalizeEditorBody(data.fullText)
    : `${normalizeEditorBody(card.body)}${normalizeEditorBody(data.text)}`;
  card.status = 'running';
  card.tag = tag;
  if (data.attrs?.path) card.path = data.attrs.path;
  return card;
}

function surfaceCodePathFor(tag, attrs = {}) {
  const kind = tag.includes('shortcut') ? 'shortcut' : 'app';
  const action = tag.includes('update') ? 'update' : 'create';
  const name = attrs.name || attrs.id || kind;
  return `${action}:${kind}/${name}`;
}

function appendSurfaceEditorDelta(data = {}) {
  const tag = SURFACE_BUILD_TAGS.has(data.name) ? data.name : 'create_app';
  const path = surfaceCodePathFor(tag, data.attrs || {});
  const card = ensureEditorCard({ tag, path, status: 'running' });
  card.body = typeof data.fullText === 'string'
    ? normalizeEditorBody(data.fullText)
    : `${normalizeEditorBody(card.body)}${normalizeEditorBody(data.text)}`;
  card.status = 'running';
  card.tag = tag;
  card.path = path;
  return card;
}

function completeEditorCard({ tag, path, bytes, applied, status = 'done', reason = '' } = {}) {
  const card = ensureEditorCard({ tag, path, status, bytes, applied });
  card.status = status;
  card.path = path || card.path;
  card.bytes = bytes || card.bytes;
  card.applied = applied || card.applied;
  card.reason = reason;
  return card;
}

function terminalStatusFor(card = {}) {
  if (card.status === 'running') return 'running';
  if (card.status === 'error') return 'failed';
  if (card.signal) return `killed ${card.signal}`;
  if (card.exitCode === 0) return 'exit 0';
  if (card.exitCode !== undefined && card.exitCode !== null) return `exit ${card.exitCode}`;
  return card.status === 'done' ? 'done' : 'queued';
}

function ensureTerminalCard({
  cmd = '',
  cwd = '',
  status = 'running',
  stdout = undefined,
  stderr = undefined,
  exitCode = undefined,
  signal = undefined,
  stdoutTrunc = false,
  stderrTrunc = false,
  reason = '',
} = {}) {
  const existing = activeCardItem?.card?.type === 'terminal' && activeCardItem.card.status !== 'done' && activeCardItem.card.status !== 'error'
    ? activeCardItem.card
    : null;
  const card = {
    ...(existing || {}),
    type: 'terminal',
    cmd: cmd || existing?.cmd || '',
    cwd: cwd || existing?.cwd || '',
    status,
    stdout: stdout ?? existing?.stdout ?? '',
    stderr: stderr ?? existing?.stderr ?? '',
    exitCode: exitCode ?? existing?.exitCode ?? null,
    signal: signal ?? existing?.signal ?? null,
    stdoutTrunc: Boolean(stdoutTrunc || existing?.stdoutTrunc),
    stderrTrunc: Boolean(stderrTrunc || existing?.stderrTrunc),
    reason: reason || existing?.reason || '',
  };
  bubbleState.width = 'wide';
  setThreadCard(card);
  return card;
}

function appendTerminalDelta(data = {}) {
  const card = ensureTerminalCard({
    cmd: typeof data.fullText === 'string' ? normalizeTerminalText(data.fullText) : '',
    cwd: data.attrs?.cwd || '',
    status: 'running',
  });
  card.cmd = typeof data.fullText === 'string'
    ? normalizeTerminalText(data.fullText)
    : `${normalizeTerminalText(card.cmd)}${normalizeTerminalText(data.text)}`;
  card.cwd = data.attrs?.cwd || card.cwd || '';
  card.status = 'running';
  return card;
}

function appendTerminalOutputDelta(data = {}) {
  const card = ensureTerminalCard({
    cmd: data.cmd || '',
    cwd: data.cwd || '',
    status: 'running',
  });
  const text = normalizeTerminalText(data.text || '');
  if (data.stream === 'stderr') {
    card.stderr = `${normalizeTerminalText(card.stderr)}${text}`;
  } else {
    card.stdout = `${normalizeTerminalText(card.stdout)}${text}`;
  }
  card.stdoutTrunc = Boolean(data.stdoutTrunc || card.stdoutTrunc);
  card.stderrTrunc = Boolean(data.stderrTrunc || card.stderrTrunc);
  card.status = 'running';
  return card;
}

function completeTerminalCard(data = {}, status = null) {
  const exitCode = data.exitCode ?? null;
  const nextStatus = status || (data.ok === false || (exitCode !== null && exitCode !== 0) || data.signal ? 'error' : 'done');
  return ensureTerminalCard({
    cmd: data.cmd || '',
    cwd: data.cwd || '',
    status: nextStatus,
    stdout: data.stdout || '',
    stderr: data.stderr || '',
    exitCode,
    signal: data.signal || null,
    stdoutTrunc: data.stdoutTrunc,
    stderrTrunc: data.stderrTrunc,
    reason: data.reason || '',
  });
}

function uniqueId(prefix = 'item') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function appendThreadItem(item) {
  const entry = { id: uniqueId(item.type || 'item'), at: Date.now(), ...item };
  bubbleState.thread.push(entry);
  if (bubbleState.thread.length > 120) bubbleState.thread = bubbleState.thread.slice(-120);
  return entry;
}

function scrollThoughtToBottom() {
  const scrollLiveEditors = () => {
    // Tail-follow the live editor / terminal bodies so newly-streamed lines
    // are always visible. Only do this once per body per render — repeated
    // anchoring with `scrollTop = scrollHeight` was happening in tight
    // succession (rAF + 0/80/240/600ms setTimeouts) and re-running it on
    // every renderBubble caused the previewed code to look "frozen" to the
    // user (the visible window was always the same recent slice; the
    // 1-2 new lines per chunk slid in from the bottom but the eye couldn't
    // catch them because we were stomping the scroll position 8 times per
    // chunk). One pass per render is enough.
    thoughtBody.querySelectorAll('.editor-body[data-live="true"]').forEach((node) => {
      node.scrollTop = node.scrollHeight;
    });
    thoughtBody.querySelectorAll('.terminal-body[data-live="true"]').forEach((node) => {
      node.scrollTop = node.scrollHeight;
    });
  };
  const scroll = () => {
    thoughtBody.scrollTop = thoughtBody.scrollHeight;
  };
  scroll();
  scrollLiveEditors();
  // Outer thought-body still gets a few rAF-deferred scrolls so newly added
  // thread items settle to the bottom of the bubble after layout. The inner
  // editor scroll is done once above and not repeated.
  window.requestAnimationFrame(() => {
    scroll();
    window.requestAnimationFrame(scroll);
  });
  window.setTimeout(scroll, 0);
  window.setTimeout(scroll, 80);
  window.setTimeout(scroll, 240);
  window.setTimeout(scroll, 600);
}

function keepMediaScrollAtBottom() {
  thoughtBody.querySelectorAll('img, video, iframe').forEach((node) => {
    node.addEventListener('load', scrollThoughtToBottom, { once: true });
    node.addEventListener('loadedmetadata', scrollThoughtToBottom, { once: true });
  });
}

function scheduleBubbleRender(delay = 140) {
  if (bubbleRenderTimer) return;
  bubbleRenderTimer = window.setTimeout(() => {
    bubbleRenderTimer = null;
    renderBubble();
  }, delay);
}

function appendUserMessage(text) {
  removeThinkingLine();
  activeSayItem = null;
  activeSayStreamId = null;
  activeSayText = '';
  activeCardItem = null;
  appendThreadItem({ type: 'user', text });
}

function showThinkingLine() {
  if (activeThinkingItem && activeThinkingItem.state === 'running') {
    const id = activeThinkingItem.id;
    bubbleState.thread = bubbleState.thread.filter((item) => item.id !== id);
  }
  activeThinkingItem = appendThreadItem({ type: 'thinking', state: 'running' });
  return activeThinkingItem;
}

function removeThinkingLine() {
  if (!activeThinkingItem) return;
  const id = activeThinkingItem.id;
  bubbleState.thread = bubbleState.thread.filter((item) => item.id !== id);
  activeThinkingItem = null;
}

function findThreadCardItem(type, predicate = () => true) {
  for (let index = bubbleState.thread.length - 1; index >= 0; index -= 1) {
    const item = bubbleState.thread[index];
    if (item?.type !== 'card' || item.card?.type !== type) continue;
    if (predicate(item.card, item)) return item;
  }
  return null;
}

function setThreadCard(card) {
  const existing = findThreadCardItem(card?.type, (candidate) => candidate.status !== 'done' && candidate.status !== 'error');
  if (existing) {
    existing.card = card;
    activeCardItem = existing;
  } else {
    activeCardItem = appendThreadItem({ type: 'card', card });
  }
  bubbleState.card = card;
  return activeCardItem;
}

function appendOrUpdateSay({ text = '', tone = 'warm', streamId = null, append = true, streaming = false }) {
  removeThinkingLine();
  if (streamId && streamId !== activeSayStreamId) {
    activeSayStreamId = streamId;
    activeSayText = '';
    activeSayItem = null;
  }
  if (!activeSayItem || activeSayItem.type !== 'ai' || activeSayItem.done) {
    activeSayItem = appendThreadItem({ type: 'ai', tone, text: '', streaming: true });
  }
  activeSayItem.tone = tone || activeSayItem.tone || 'warm';
  activeSayItem.text = append ? `${activeSayItem.text || ''}${text || ''}` : text;
  activeSayItem.streaming = streaming;
  activeSayItem.done = !streaming;
  activeSayText = activeSayItem.text || '';
  bubbleState.stream = activeSayItem.text || '';
  return activeSayItem;
}

function resetBubbleState() {
  bubbleState.mode = 'Thinking';
  bubbleState.subject = '';
  bubbleState.width = 'wide';
  bubbleState.stream = '';
  bubbleState.intent = '';
  bubbleState.card = null;
  bubbleState.activities = [];
  bubbleState.thread = [];
  bubbleState.footer = null;
  bubbleState.done = false;
  activeSayStreamId = null;
  activeSayText = '';
  activeSayItem = null;
  activeThinkingItem = null;
  activeCardItem = null;
  renderedMediaUrls = new Set();
  minimizedTask = false;
  lastSurfaceId = null;
  currentRequestId = null;
  resetTaskSession();
  stopElapsed();
}

function compactKind(surface) {
  return surface.kind === 'app' ? 'App' : (surface.size || 'Widget');
}

function elapsedText() {
  if (!taskStartedAt) return '0:00';
  const total = Math.max(0, Math.round((Date.now() - taskStartedAt) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function startElapsed() {
  taskStartedAt = Date.now();
  window.clearInterval(elapsedTimer);
  elapsedTimer = window.setInterval(() => {
    if (!thought.classList.contains('hidden')) thoughtMeta.textContent = elapsedText();
  }, 1000);
}

function stopElapsed() {
  window.clearInterval(elapsedTimer);
  elapsedTimer = null;
}

function setBubbleMode(mode, subject = '') {
  bubbleState.mode = mode;
  bubbleState.subject = subject;
}

function activityForTag(name, attrs = {}) {
  const [title, fallbackSub, icon] = TOOL_META[name] || [name.replaceAll('_', ' '), 'tool call', '●'];
  const attrBits = [];
  if (attrs.name) attrBits.push(attrs.name);
  if (attrs.query) attrBits.push(`"${shortText(attrs.query, 42)}"`);
  if (attrs.url) attrBits.push(shortText(attrs.url, 42));
  if (attrs.path) attrBits.push(shortText(attrs.path, 42));
  if (attrs.id) attrBits.push(attrs.id);
  return {
    id: `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    tag: name,
    state: 'running',
    icon,
    title,
    sub: attrBits.join(' · ') || fallbackSub,
    startedAt: Date.now(),
  };
}

function markRunningDone(exceptId = null) {
  for (const row of bubbleState.activities) {
    if (row.id !== exceptId && row.state === 'running') {
      row.state = 'done';
      row.icon = row.icon === '●' ? '✓' : row.icon;
      row.right = elapsedFor(row);
    }
  }
}

function elapsedFor(row) {
  if (!row.startedAt) return '';
  const total = Math.max(1, Math.round((Date.now() - row.startedAt) / 1000));
  return `0:${String(total).padStart(2, '0')}`;
}

function addActivity(name, attrs = {}) {
  removeThinkingLine();
  const row = activityForTag(name, attrs);
  markRunningDone(row.id);
  bubbleState.activities.push(row);
  appendThreadItem({ type: 'activity', row });
  return row;
}

function finishActivity(name, payload = {}) {
  const row = [...bubbleState.activities].reverse().find((item) => item.tag === name && item.state === 'running');
  if (!row) {
    const done = activityForTag(name, payload);
    done.state = 'done';
    done.icon = '✓';
    done.right = 'done';
    bubbleState.activities.push(done);
    appendThreadItem({ type: 'activity', row: done });
    return done;
  }
  row.state = 'done';
  row.icon = '✓';
  row.right = elapsedFor(row);
  if (payload?.path) row.sub = payload.path;
  if (payload?.query) row.sub = `"${shortText(payload.query, 42)}"`;
  if (payload?.url) row.sub = shortText(payload.url, 42);
  return row;
}

function failActivity(name, reason) {
  const row = [...bubbleState.activities].reverse().find((item) => item.tag === name && item.state === 'running');
  if (row) {
    row.state = 'err';
    row.icon = '!';
    row.sub = shortText(reason || row.sub, 72);
    row.right = 'err';
  }
}

function renderMode() {
  const subject = bubbleState.subject ? ` · ${escapeHtml(bubbleState.subject)}` : '';
  thoughtMode.innerHTML = `<em>${escapeHtml(bubbleState.mode)}</em>${subject}`;
}

function renderStream() {
  if (!bubbleState.stream) return '';
  const cursor = currentRequestId && !bubbleState.done ? '<span class="stream-cursor"></span>' : '';
  return `<div class="stream">${escapeHtml(bubbleState.stream)}${cursor}</div>`;
}

function renderIntent() {
  if (!bubbleState.intent || bubbleState.stream) return '';
  return `
    <div class="card intent-card">
      <span class="card-meta">parsed intent</span>
      <div class="stream">${escapeHtml(shortText(bubbleState.intent, 180))}</div>
    </div>
  `;
}

function renderActivities() {
  if (!bubbleState.activities.length) return '';
  return `
    <div class="activity">
      ${bubbleState.activities.map(renderActivityRow).join('')}
    </div>
  `;
}

function renderActivityRow(row) {
  return `
    <div class="row ${escapeHtml(row.state || '')}">
      <div class="icon">${escapeHtml(row.icon || '●')}</div>
      <div class="title"><b>${escapeHtml(row.title)}</b>${row.sub ? `<small>${escapeHtml(row.sub)}</small>` : ''}</div>
      ${row.right ? `<div class="right">${escapeHtml(row.right)}</div>` : ''}
    </div>
  `;
}

function renderCardByType(card) {
  if (!card) return '';
  switch (card.type) {
    case 'build': return renderBuildCard(card);
    case 'editor': return renderEditorCard(card);
    case 'terminal': return renderTerminalCard(card);
    case 'image': return renderImageCard(card);
    case 'web': return renderWebCard(card);
    case 'video': return renderVideoCard(card);
    case 'error': return renderErrorCard(card);
    case 'progress': return renderProgressCard(card);
    default: return '';
  }
}

function renderThreadItem(item) {
  if (item.type === 'user') {
    return `
      <article class="thread-msg user-msg">
        <div class="thread-label">You</div>
        <div class="thread-text">${escapeHtml(item.text)}</div>
      </article>
    `;
  }
  if (item.type === 'ai') {
    const cursor = item.streaming && currentRequestId ? '<span class="stream-cursor"></span>' : '';
    return `
      <article class="thread-msg ai-msg" data-tone="${escapeHtml(item.tone || 'warm')}">
        <div class="thread-label">BOR</div>
        <div class="stream">${escapeHtml(item.text || '')}${cursor}</div>
      </article>
    `;
  }
  if (item.type === 'thinking') {
    return `
      <div class="thread-thinking" aria-label="thinking">
        <span class="aurora-thinking">thinking<span class="thinking-dots"></span></span>
      </div>
    `;
  }
  if (item.type === 'completion') {
    return `
      <div class="thread-completion" data-status="${escapeHtml(item.status || 'complete')}">
        <span class="completion-mark">✓</span>
        <div>
          <b>${escapeHtml(item.title || 'All set')}</b>
          ${item.text ? `<small>${escapeHtml(item.text)}</small>` : ''}
        </div>
      </div>
    `;
  }
  if (item.type === 'activity') {
    return `<div class="thread-tool">${renderActivityRow(item.row || {})}</div>`;
  }
  if (item.type === 'card') {
    const type = item.card?.type ? ` thread-card-${item.card.type}` : '';
    return `<div class="thread-card${escapeHtml(type)}">${renderCardByType(item.card)}</div>`;
  }
  if (item.type === 'shortcut') {
    if (!item.isLive) {
      return `<div class="shortcut-card shortcut-card-frozen" data-shortcut-id="${escapeHtml(item.id)}">
        <div class="shortcut-card-head">
          <span class="shortcut-card-title">${escapeHtml(item.manifest?.name || 'Shortcut')}</span>
          <button class="shortcut-card-action" type="button" data-shortcut-revive="${escapeHtml(item.id)}">Revive</button>
        </div>
        <div class="shortcut-card-frozen-note">Older shortcuts are paused to save memory. Tap Revive to bring this one back live.</div>
      </div>`;
    }
    return `<div class="shortcut-card" data-shortcut-id="${escapeHtml(item.id)}" data-shortcut-mount="1" style="--bor-shortcut-height: ${item.bubbleHeight || 280}px">
      <div class="shortcut-card-head">
        <span class="shortcut-card-title">${escapeHtml(item.manifest?.name || 'Shortcut')}</span>
        <button class="shortcut-card-action" type="button" data-shortcut-close="${escapeHtml(item.id)}" aria-label="Close shortcut">×</button>
      </div>
      <div class="shortcut-card-resize" data-shortcut-resize="${escapeHtml(item.id)}" aria-label="Drag to resize"></div>
    </div>`;
  }
  return '';
}

/**
 * After every renderBubble(), walk the thread for shortcut placeholders and
 * either move the cached iframe DOM node into the placeholder (preserving
 * JS state) or mount a fresh iframe. Then clean up cache entries for
 * shortcuts that have been removed from the thread.
 */
function hydrateShortcutMounts() {
  const placeholders = thoughtBody.querySelectorAll('.shortcut-card[data-shortcut-mount="1"]');
  if (placeholders.length > 0) {
    console.log('[bor:shortcut] hydrating', placeholders.length, 'placeholder(s)');
  }
  for (const placeholder of placeholders) {
    const id = placeholder.dataset.shortcutId;
    if (!id) continue;
    const item = bubbleState.thread.find((it) => it.type === 'shortcut' && it.id === id);
    if (!item) {
      console.warn('[bor:shortcut] no thread item for placeholder', id);
      continue;
    }
    let cached = shortcutCache.get(id);
    if (cached?.iframe && cached.html === item.html) {
      placeholder.appendChild(cached.iframe);
      cached.lastSeenAt = Date.now();
      console.log('[bor:shortcut] reused cached iframe', id);
    } else {
      if (cached?.iframe) cached.iframe.remove();
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-popups');
      iframe.dataset.sid = id;
      iframe.srcdoc = injectThemePrefix(item.html);
      const h = Number(item.bubbleHeight) || 280;
      iframe.style.cssText = `width:100%;height:${h}px;border:0;background:transparent;border-radius:0 0 14px 14px;display:block;`;
      placeholder.appendChild(iframe);
      shortcutCache.set(id, { iframe, html: item.html, lastSeenAt: Date.now() });
      console.log('[bor:shortcut] mounted fresh iframe', id, 'height', h, 'htmlBytes', (item.html || '').length);
    }
    placeholder.removeAttribute('data-shortcut-mount');
  }
  // Evict orphaned cache entries (shortcut removed from thread).
  const liveIds = new Set(
    bubbleState.thread.filter((it) => it.type === 'shortcut' && it.isLive).map((it) => it.id)
  );
  for (const [id, entry] of shortcutCache) {
    if (!liveIds.has(id)) {
      entry.iframe?.remove();
      shortcutCache.delete(id);
    }
  }
}

function appendShortcutToThread(data) {
  const id = String(data?.id || '');
  if (!id) {
    console.warn('[bor:shortcut] appendShortcutToThread skipped — empty id', data);
    return;
  }
  // Drop any earlier instance of the same shortcut (re-creation, re-launch,
  // update_shortcut all converge on a single visible card).
  bubbleState.thread = bubbleState.thread.filter((it) => !(it.type === 'shortcut' && it.id === id));
  const cached = shortcutCache.get(id);
  if (cached?.iframe && cached.html !== (data.html || '')) {
    cached.iframe.remove();
    shortcutCache.delete(id);
  }
  const entry = appendThreadItem({
    type: 'shortcut',
    id,
    manifest: data.manifest || {},
    html: data.html || '',
    state: data.state || {},
    bubbleHeight: data.bubbleHeight || data.manifest?.bubbleHeight || 280,
    isLive: true,
  });
  enforceShortcutCap();
  const liveCount = bubbleState.thread.filter((it) => it.type === 'shortcut' && it.isLive).length;
  console.log('[bor:shortcut] appended to thread', { id, threadLength: bubbleState.thread.length, liveShortcuts: liveCount, htmlBytes: (data.html || '').length });
  return entry;
}

function enforceShortcutCap() {
  const live = bubbleState.thread.filter((it) => it.type === 'shortcut' && it.isLive);
  const excess = live.length - SHORTCUT_MAX_LIVE;
  if (excess <= 0) return;
  for (let i = 0; i < excess; i += 1) {
    live[i].isLive = false;
    const cached = shortcutCache.get(live[i].id);
    if (cached?.iframe) {
      cached.iframe.remove();
      shortcutCache.delete(live[i].id);
    }
  }
}

function removeShortcutFromThread(id) {
  if (!id) return;
  bubbleState.thread = bubbleState.thread.filter((it) => !(it.type === 'shortcut' && it.id === id));
  const cached = shortcutCache.get(id);
  if (cached?.iframe) {
    cached.iframe.remove();
    shortcutCache.delete(id);
  }
}

function reviveShortcut(id) {
  const item = bubbleState.thread.find((it) => it.type === 'shortcut' && it.id === id);
  if (!item) return;
  item.isLive = true;
  enforceShortcutCap();
}

function renderThread() {
  return bubbleState.thread.map(renderThreadItem).filter(Boolean).join('');
}

function renderBuildThumb(name = 'App') {
  const initials = shortText(name, 2).toUpperCase();
  return `
    <svg viewBox="0 0 96 108" width="96" height="108" aria-hidden="true">
      <rect width="96" height="108" fill="#3a2752"></rect>
      <rect x="8" y="14" width="38" height="6" rx="2" fill="#F5F1FF" opacity=".85"></rect>
      <rect x="8" y="26" width="38" height="3" rx="1" fill="#F5F1FF" opacity=".5"></rect>
      <rect x="8" y="32" width="34" height="3" rx="1" fill="#F5F1FF" opacity=".38"></rect>
      <rect x="52" y="14" width="36" height="48" rx="4" fill="#1a0e2a" stroke="rgba(255,255,255,.18)"></rect>
      <text x="70" y="42" font-family="Instrument Serif" font-style="italic" font-size="18" fill="#fff" text-anchor="middle">${escapeHtml(initials)}</text>
      <rect x="8" y="72" width="80" height="28" rx="4" fill="rgba(255,255,255,.06)"></rect>
      <rect x="15" y="82" width="34" height="4" rx="2" fill="#C4A8F0"></rect>
      <rect x="15" y="90" width="54" height="3" rx="1.5" fill="#F5F1FF" opacity=".4"></rect>
    </svg>
  `;
}

function renderBuildCard(card) {
  const manifest = card.manifest || {};
  const name = manifest.name || card.name || 'Surface';
  const kind = manifest.kind === 'app' || card.kind === 'app' ? 'app' : 'widget';
  const done = card.status === 'done';
  const phase = done ? `${kind} · ready` : `${kind} · ${card.phase || 'generating'}`;
  return `
    <div class="card gen-card">
      <div class="gen-thumb">
        ${renderBuildThumb(name)}
        ${done ? '' : '<span class="gen-line"></span>'}
      </div>
      <div class="gen-meta">
        <span class="card-meta">${escapeHtml(phase)}</span>
        <span class="name"><em>${escapeHtml(name)}</em></span>
        <p class="lead">${escapeHtml(card.summary || (done ? 'Pinned to your desktop. The surface is ready to use.' : 'Building the live preview, app HTML, documentation, and state contract.'))}</p>
        <div class="gen-actions">
          ${done ? '<span class="pill pill-ok">live</span>' : '<span class="pill">building</span>'}
        </div>
      </div>
    </div>
  `;
}

function renderEditorCard(card) {
  const path = card.path || 'device:/file.txt';
  const status = card.status || 'running';
  const { rows, stats } = editorPreviewFor(card);
  const statusLabel = status === 'done' ? 'saved' : status === 'error' ? 'failed' : 'streaming';
  const shown = Math.max(0, rows.length - (stats.hidden ? 1 : 0));
  const rangeLabel = stats.total
    ? (stats.hidden ? `showing latest ${shown.toLocaleString()} / ${stats.total.toLocaleString()} loc` : `${stats.total.toLocaleString()} loc`)
    : 'waiting';
  let caretIndex = -1;
  rows.forEach((row, index) => {
    if (row.kind !== 'gap') caretIndex = index;
  });
  return `
    <div class="card editor">
      <div class="editor-head">
        <span class="editor-dot"></span>
        <span class="editor-mode">${escapeHtml(editorTitleForTag(card.tag || 'write_file'))}</span>
        <span class="editor-path">${escapeHtml(path)}</span>
        <span class="editor-tag">${escapeHtml(editorStatusFor(card))}</span>
      </div>
      <div class="editor-body" data-live="${status === 'running' ? 'true' : 'false'}" tabindex="0" aria-label="Streaming file edit preview">
        ${rows.map((row, index) => `
          <div class="ln ${escapeHtml(row.kind || '')}">
            <span class="num">${escapeHtml(row.num)}</span>
            <span class="src">${escapeHtml(row.text)}${status === 'running' && index === caretIndex ? '<span class="caret"></span>' : ''}</span>
          </div>
        `).join('')}
      </div>
      <div class="editor-foot">
        <span class="diff-stat"><span class="add">+${escapeHtml(stats.added)}</span> <span class="rem">-${escapeHtml(stats.removed)}</span></span>
        <span>${escapeHtml(rangeLabel)}</span>
        <span class="${status === 'error' ? 'rem' : 'ok'}">${escapeHtml(card.reason || statusLabel)}</span>
      </div>
    </div>
  `;
}

function renderTerminalCard(card) {
  const status = card.status || 'running';
  const cmd = normalizeTerminalText(card.cmd || '');
  const stdout = normalizeTerminalText(card.stdout || '');
  const stderr = normalizeTerminalText(card.stderr || '');
  const hasOutput = stdout || stderr;
  const exitLabel = terminalStatusFor(card);
  const cwd = card.cwd || 'project root';
  const truncated = card.stdoutTrunc || card.stderrTrunc;
  return `
    <div class="card terminal">
      <div class="terminal-head">
        <span class="terminal-dot"></span>
        <span class="terminal-mode">terminal</span>
        <span class="terminal-cwd">${escapeHtml(cwd)}</span>
        <span class="terminal-tag ${status === 'error' ? 'err' : ''}">${escapeHtml(exitLabel)}</span>
      </div>
      <div class="terminal-body" data-live="${status === 'running' ? 'true' : 'false'}" tabindex="0" aria-label="Terminal command output preview">
        <div class="terminal-command">
          <span class="prompt">$</span>
          <code>${escapeHtml(cmd || 'waiting for command')}${status === 'running' ? '<span class="caret"></span>' : ''}</code>
        </div>
        ${!hasOutput && status === 'running' ? '<div class="terminal-empty">waiting for output</div>' : ''}
        ${stdout ? `
          <section class="terminal-stream stdout">
            <div class="terminal-channel">stdout</div>
            <pre>${escapeHtml(stdout)}</pre>
          </section>
        ` : ''}
        ${stderr ? `
          <section class="terminal-stream stderr">
            <div class="terminal-channel">stderr</div>
            <pre>${escapeHtml(stderr)}</pre>
          </section>
        ` : ''}
        ${!hasOutput && status !== 'running' ? '<div class="terminal-empty">no output</div>' : ''}
      </div>
      <div class="terminal-foot">
        <span>${escapeHtml(exitLabel)}</span>
        <span>${escapeHtml(truncated ? 'output truncated' : (hasOutput ? 'captured output' : 'no output'))}</span>
        <span class="${status === 'error' ? 'rem' : 'ok'}">${escapeHtml(card.reason || (status === 'running' ? 'running' : 'complete'))}</span>
      </div>
    </div>
  `;
}

function renderImageCard(card) {
  const done = card.status === 'done';
  const src = resolveMediaUrl(card.url || card.path || '');
  const label = card.meta || card.title || card.url || card.path || 'image preview';
  const openUrl = card.canonicalUrl || card.path || card.url || '';
  return `
    <div class="card img-card media-card">
      <div class="img-canvas">
        ${src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(label)}" loading="eager">` : (done ? `
          <svg viewBox="0 0 320 180" class="media-placeholder" aria-hidden="true">
            <circle cx="240" cy="60" r="36" fill="#F4B5A0" opacity=".85"></circle>
            <ellipse cx="160" cy="170" rx="200" ry="40" fill="#1a0e2a" opacity=".6"></ellipse>
            <g transform="translate(80 130)"><circle r="14" fill="#F49EBA"></circle><path d="M0 14 L0 30" stroke="#7AAB6E" stroke-width="3"></path></g>
            <g transform="translate(130 140)"><circle r="10" fill="#F4B5A0"></circle><path d="M0 10 L0 22" stroke="#7AAB6E" stroke-width="2"></path></g>
          </svg>
        ` : '<div class="gen-line"></div>')}
      </div>
      <div class="img-caption">
        <span class="mono">${escapeHtml(label || 'generating')}</span>
        <span class="media-actions">
          ${openUrl ? `<a class="media-open" href="${escapeHtml(resolveMediaUrl(openUrl))}" target="_blank" rel="noreferrer">open</a>` : ''}
          <span class="pill ${done ? 'pill-ok' : ''}">${escapeHtml(done ? (card.kind || 'image') : 'loading')}</span>
        </span>
      </div>
    </div>
  `;
}

function renderWebCard(card) {
  const results = Array.isArray(card.results) ? card.results.slice(0, 3) : [];
  if (!results.length) {
    return `
      <div class="card web-card">
        <div class="web-row"><div class="web-fav"></div><div><div class="src">web</div><div class="ttl">Reading search results</div><div class="snip">${escapeHtml(shortText(card.query || 'Fetching sources', 100))}</div></div></div>
      </div>
    `;
  }
  return `
    <div class="card web-card">
      ${results.map((result) => `
        <div class="web-row">
          <div class="web-fav"></div>
          <div>
            <div class="src">${escapeHtml(result.source || safeHost(result.url) || 'web')}</div>
            <div class="ttl">${escapeHtml(shortText(result.title || result.url || 'Source', 64))}</div>
            <div class="snip">${escapeHtml(shortText(result.snippet || result.description || '', 120))}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderVideoCard(card) {
  const src = resolveMediaUrl(card.url || card.path || '');
  const embedSrc = card.embedUrl || '';
  const provider = card.provider || (embedSrc ? 'embed' : 'video');
  const kind = card.kind || (provider === 'file' ? 'video' : provider);
  const label = card.meta || card.title || card.url || card.path || 'video preview';
  const directVideo = Boolean(src && (provider === 'file' || isVideoMedia(card.path || card.url || src, card.mediaType)));
  const fallbackTitle = provider === 'instagram' ? 'Open Instagram media' : provider === 'tiktok' ? 'Open TikTok media' : 'Open media';
  const playable = embedSrc
    ? `<iframe src="${escapeHtml(embedSrc)}" title="${escapeHtml(card.title || provider || 'media player')}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`
    : (directVideo ? `<video src="${escapeHtml(src)}" controls playsinline preload="metadata"></video>` : `
      <div class="social-fallback">
        <div class="vid-play" aria-hidden="true"></div>
        <b>${escapeHtml(fallbackTitle)}</b>
        <small>${escapeHtml(shortText(card.canonicalUrl || card.path || card.url || label, 96))}</small>
      </div>
    `);
  return `
    <div class="card vid-card media-card provider-${escapeHtml(provider)}" data-provider="${escapeHtml(provider)}">
      <div class="vid-canvas">
        ${playable}
      </div>
      <div class="vid-bar"><div></div></div>
      <div class="img-caption">
        <span class="mono">${escapeHtml(label)}</span>
        <span class="media-actions">
          ${(card.canonicalUrl || card.path || card.url) ? `<a class="media-open" href="${escapeHtml(resolveMediaUrl(card.canonicalUrl || card.path || card.url))}" target="_blank" rel="noreferrer">open</a>` : ''}
          <span class="pill">${escapeHtml(kind)}</span>
        </span>
      </div>
    </div>
  `;
}

function renderErrorCard(card) {
  return `
    <div class="card err-card">
      <div class="card-head"><span class="card-title">${escapeHtml(card.title || 'Something went sideways')}</span><span class="pill pill-err">${escapeHtml(card.code || 'err')}</span></div>
      <p class="lead">${escapeHtml(card.message || 'I could not complete that step. You can retry or adjust the request.')}</p>
      ${card.detail ? `<details><summary class="mono">show technical detail</summary><pre class="mono">${escapeHtml(card.detail)}</pre></details>` : ''}
    </div>
  `;
}

function renderProgressCard(card) {
  const progress = Math.max(0, Math.min(100, Math.round((card.progress || 0.62) * 100)));
  return `
    <div class="card">
      <div class="card-head"><span class="card-title">Progress</span><span class="mono">${progress}% · ${escapeHtml(card.eta || '~ 0:48 left')}</span></div>
      <div class="progress"><span style="width:${progress}%"></span></div>
      <div class="mono">checkpoint · ${escapeHtml(card.checkpoint || 'surface.html')} · phase ${escapeHtml(card.phase || '4 of 6')}</div>
    </div>
  `;
}

function renderCard() {
  if (!bubbleState.card) return '';
  return renderCardByType(bubbleState.card);
}

function renderFooter() {
  if (!bubbleState.footer) {
    thoughtFoot.classList.add('hidden');
    thoughtFoot.innerHTML = '';
    return;
  }
  const secondary = bubbleState.footer.secondary || [];
  thoughtFoot.classList.remove('hidden');
  thoughtFoot.innerHTML = `
    ${secondary.map((label) => `<button class="foot-btn" type="button">${escapeHtml(label)}</button>`).join('')}
    <div class="foot-spacer"></div>
    ${bubbleState.footer.danger ? `<button class="foot-btn danger" type="button" data-action="close">${escapeHtml(bubbleState.footer.danger)}</button>` : ''}
    ${bubbleState.footer.primary ? `<button class="foot-btn pri" type="button" data-action="${escapeHtml(bubbleState.footer.action || '')}">${escapeHtml(bubbleState.footer.primary)}</button>` : ''}
  `;
}

function renderBubble() {
  if (bubbleRenderTimer) {
    window.clearTimeout(bubbleRenderTimer);
    bubbleRenderTimer = null;
  }
  thought.classList.remove('compact', 'wide');
  if (bubbleState.width) thought.classList.add(bubbleState.width);
  renderMode();
  thoughtMeta.textContent = bubbleState.done ? 'done' : elapsedText();
  thoughtBody.innerHTML = bubbleState.thread.length
    ? renderThread()
    : [
      renderStream(),
      renderIntent(),
      renderCard(),
      renderActivities(),
    ].filter(Boolean).join('');
  // CRITICAL: hydrate AFTER innerHTML is set. Shortcut iframe DOM nodes are
  // re-attached from `shortcutCache` so their JS state (the live iframe, any
  // pending postMessage replies, scroll position, in-progress AI requests)
  // survives the surrounding renderBubble re-render. Without this hook each
  // event re-mounts every iframe — disastrous for stateful shortcuts.
  hydrateShortcutMounts();
  renderFooter();
  keepMediaScrollAtBottom();
  scrollThoughtToBottom();
}

function ensureThoughtHostMode() {
  if (minimizedTask || thought.classList.contains('hidden') || !hasThoughtSession()) return;
  window.borHost.setPresenceMode('thinking')
    .then(applyPresenceLayout)
    .catch(() => {});
}

function showThought(mode = 'Thinking') {
  setBubbleMode(mode, bubbleState.subject);
  // Respect explicit user minimize. If the user clicked the minimize
  // button or the presence orb to hide the bubble, streaming tokens must
  // NOT pop it back open. Keep updating the chip label + state in the
  // background so a click on the chip / orb restores with current data,
  // but don't touch visibility.
  if (minimizedTask) {
    taskChipName.textContent = bubbleState.subject || bubbleState.mode || 'Task';
    taskChipPct.textContent = bubbleState.done ? 'done' : 'running';
    setOrbState(bubbleState.done || !currentRequestId ? 'idle' : 'busy');
    return;
  }
  thought.classList.remove('hidden');
  taskChip.classList.add('hidden');
  setMode('thinking');
  setOrbState(bubbleState.done || !currentRequestId ? 'idle' : (mode === 'Speaking' ? 'streaming' : 'thinking'));
  renderBubble();
  window.setTimeout(ensureThoughtHostMode, 80);
  window.setTimeout(ensureThoughtHostMode, 260);
}

function appendCompletionMessage(message = '', status = 'complete') {
  const text = shortText(message || '', 180);
  const title = status === 'blocked' ? 'Needs attention' : 'All set';
  const existing = [...bubbleState.thread].reverse().find((item) => item.type === 'completion');
  if (existing) {
    existing.text = text || existing.text;
    existing.status = status || existing.status;
    existing.title = title;
    return existing;
  }
  return appendThreadItem({
    type: 'completion',
    status,
    title,
    text,
  });
}

function showWaitingForModel() {
  if (!currentRequestId || bubbleState.done) return;
  setBubbleMode('Thinking', '');
  showThinkingLine();
  setOrbState('thinking');
}

function hideThought({ reset = false } = {}) {
  thought.classList.add('hidden');
  taskChip.classList.add('hidden');
  if (reset) {
    resetBubbleState();
    thoughtBody.innerHTML = '';
    thoughtFoot.innerHTML = '';
    thoughtFoot.classList.add('hidden');
  }
  if (!currentRequestId) setOrbState('idle');
}

function closeThoughtSession() {
  const request = currentRequestId;
  if (request && typeof window.borHost.cancelChat === 'function') {
    window.borHost.cancelChat(request);
  }
  hideThought({ reset: true });
  setMode('expanded');
  setOrbState('idle');
}

function stopGeneration({ reason = 'Stopped.' } = {}) {
  const request = currentRequestId;
  if (request && typeof window.borHost.cancelChat === 'function') {
    window.borHost.cancelChat(request);
  }
  currentRequestId = null;
  bubbleState.done = true;
  removeThinkingLine();
  markRunningDone();
  if (activeSayItem) {
    activeSayItem.streaming = false;
    activeSayItem.done = true;
  }
  setBubbleMode(reason, bubbleState.subject);
  bubbleState.footer ||= lastSurfaceId
    ? { primary: 'Open', action: 'open-surface', secondary: ['Keep visible', 'View work'] }
    : { secondary: ['Keep visible', 'View work'] };
  stopElapsed();
  setOrbState('idle');
  thought.classList.remove('hidden');
  taskChip.classList.add('hidden');
  renderBubble();
}

function minimizeThought() {
  if (thought.classList.contains('hidden')) return;
  minimizedTask = true;
  thought.classList.add('hidden');
  taskChipName.textContent = bubbleState.subject || bubbleState.mode || 'Task';
  taskChipPct.textContent = bubbleState.done ? 'done' : 'running';
  taskChip.classList.remove('hidden');
  orbBadge.textContent = '1';
  orbBadge.classList.remove('hidden');
  setMode('minimized');
  setOrbState(currentRequestId ? 'busy' : 'idle');
}

function restoreTask() {
  minimizedTask = false;
  taskChip.classList.add('hidden');
  orbBadge.classList.add('hidden');
  thought.classList.remove('hidden');
  setMode('thinking');
  renderBubble();
  window.setTimeout(ensureThoughtHostMode, 80);
}

function startTask(prompt) {
  const contextItems = attachedContextItems.slice();
  const previousRequestId = currentRequestId;
  if (previousRequestId && typeof window.borHost.cancelChat === 'function') {
    window.borHost.cancelChat(previousRequestId);
  }
  if (activeSayItem) {
    activeSayItem.streaming = false;
    activeSayItem.done = true;
  }
  // Submitting a fresh prompt is the user's explicit signal they want to
  // see the bubble again — clear any prior minimize intent so showThought
  // is allowed to open it.
  minimizedTask = false;
  startElapsed();
  currentRequestId = requestId();
  activeSayStreamId = null;
  activeSayText = '';
  activeSayItem = null;
  activeCardItem = null;
  bubbleState.mode = 'Thinking';
  bubbleState.subject = '';
  bubbleState.width = 'wide';
  bubbleState.stream = '';
  bubbleState.intent = prompt;
  bubbleState.card = null;
  bubbleState.activities = [];
  appendUserMessage(prompt);
  appendTaskUserMessage(prompt, contextItems);
  clearAttachedContext();
  showThinkingLine();
  bubbleState.footer = { secondary: ['Minimize'], danger: 'Stop' };
  bubbleState.done = false;
  showThought('Thinking');
  window.borHost.startChat(currentRequestId, taskMessages);
}

function safeHost(url) {
  try { return new URL(url).host; } catch { return ''; }
}

async function refreshSurfaces() {
  const surfaces = await window.borHost.listSurfaces();
  surfaceList.innerHTML = '';
  if (!surfaces.length) {
    surfaceList.innerHTML = '<div class="surface-row"><span>No apps or widgets yet</span><small>empty</small></div>';
    return;
  }
  for (const surface of [...surfaces].reverse()) {
    const button = document.createElement('button');
    button.className = 'surface-row';
    button.type = 'button';
    button.innerHTML = `<span>${escapeHtml(surface.name || 'Untitled')}</span><small>${escapeHtml(compactKind(surface))}</small>`;
    button.addEventListener('click', () => {
      window.borHost.openSurface(surface.id);
      surfaceDrawer.classList.add('hidden');
      if (!currentRequestId) setMode('expanded');
    });
    surfaceList.append(button);
  }
}

function setBuildCard(event, manifest, status = 'running') {
  const isApp = event.includes('app') || manifest?.kind === 'app';
  const name = manifest?.name || (isApp ? 'App' : 'Widget');
  bubbleState.width = 'wide';
  bubbleState.subject = name;
  setThreadCard({
    type: 'build',
    kind: isApp ? 'app' : 'widget',
    status,
    manifest,
    name,
    phase: status === 'done' ? 'ready' : 'writing html',
    summary: isApp
      ? 'A native Mac window is being prepared with its launcher preview and documentation.'
      : 'A live desktop widget preview is being prepared with its full surface.',
  });
  bubbleState.footer = status === 'done'
    ? { primary: 'Open', action: 'open-surface', secondary: ['Keep visible', 'View work'] }
    : { primary: 'Open when ready', secondary: ['Keep building', 'View files'], danger: 'Cancel' };
  if (manifest?.id) lastSurfaceId = manifest.id;
}

function completeSurfaceEditorCard(event, manifest = {}) {
  const item = findThreadCardItem('editor', (card) => SURFACE_BUILD_TAGS.has(card.tag) && card.status !== 'done' && card.status !== 'error');
  if (!item) return null;
  item.card.status = 'done';
  item.card.path = surfaceCodePathFor(event, { name: manifest.name, id: manifest.id });
  item.card.bytes = item.card.bytes || normalizeSurfaceCodeBody(item.card.body).length;
  bubbleState.card = item.card;
  return item.card;
}

function setMediaCardFromPayload(data = {}, fallback = {}) {
  const url = mediaUrlFromPayload(data) || fallback.url || '';
  const dim = dimensionsLabel(data);
  const meta = fallback.meta || [dim, url || fallback.title || 'media preview'].filter(Boolean).join(' · ');
  const cards = collectMediaCandidates({ ...data, url }, { ...fallback, meta });
  if (!cards.length && (data?.screenshot || fallback.type === 'image')) {
    const card = mediaCardForUrl(url, {
      ...fallback,
      type: 'image',
      kind: fallback.kind || (data?.screenshot ? 'screen' : 'image'),
      mediaType: data?.mediaType,
      meta,
    });
    return card ? appendMediaCard(card) : false;
  }
  return cards.length ? appendMediaCard(cards[0]) : false;
}

function handleChatEvent(payload) {
  if (!payload) return;
  // display_shortcut and delete_shortcut are special — they MUST render
  // even if the chat session already cleared currentRequestId. Otherwise
  // a tiny race between the SSE 'done' event and the trailing shortcut
  // event can leave the shortcut iframe stranded out of view.
  const event = payload.event;
  const data = payload.data;
  const alwaysAllow = event === 'display_shortcut' || event === 'delete_shortcut';
  if (!alwaysAllow && payload.requestId !== currentRequestId) return;

  if (event === 'tag_start' && data?.name) {
    if (data.name === 'say' || data.name === 'attempt_completion') return;
    const row = addActivity(data.name, data.attrs || {});
    if (['create_app', 'create_shortcut', 'update_app', 'update_shortcut'].includes(data.name)) {
      setBubbleMode(data.name.includes('shortcut') ? 'Building shortcut' : 'Building app', data.attrs?.name || '');
      bubbleState.width = 'wide';
      // Pre-create the EDITOR card right at tag_start (not a static build
      // card). Previously we created a `type: 'build'` card here which
      // rendered as a decorative SVG with no body — and the user only saw
      // THAT card during the entire HTML stream because the editor card
      // (created later from the first tag_delta) was either pushed below
      // the viewport by auto-scroll or visually subordinate to the bigger
      // build card. Creating the editor card immediately gives us ONE
      // surface that fills in live and grows with each chunk.
      ensureEditorCard({
        tag: data.name,
        path: surfaceCodePathFor(data.name, data.attrs || {}),
        status: 'running',
      });
    } else if (FILE_EDIT_TAGS.has(data.name)) {
      setBubbleMode('Editing', data.attrs?.path || '');
      bubbleState.width = 'wide';
      ensureEditorCard({ tag: data.name, path: data.attrs?.path, status: 'running' });
    } else if (COMMAND_TAGS.has(data.name)) {
      setBubbleMode('Running command', data.attrs?.cwd || '');
      bubbleState.width = 'wide';
      ensureTerminalCard({ cwd: data.attrs?.cwd || '', status: 'running' });
    } else if (data.name === 'generate_image') {
      setBubbleMode('Painting', '');
      setThreadCard({ type: 'image', status: 'running' });
    } else if (data.name === 'screen_capture') {
      setBubbleMode('Reading screen', '');
      setThreadCard({ type: 'image', status: 'running', meta: 'capturing screen', kind: 'screen' });
    } else if (data.name === 'web_search' || data.name === 'web_fetch') {
      setBubbleMode(data.name === 'web_search' ? 'Searching' : 'Reading the web', '');
    } else {
      setBubbleMode(row.title, '');
    }
    showThought(bubbleState.mode);
    return;
  }

  if (event === 'say_delta') {
    appendOrUpdateSay({
      streamId: data.streamId,
      tone: data.tone || 'warm',
      text: data.text || '',
      append: true,
      streaming: true,
    });
    bubbleState.width = 'wide';
    showThought('Speaking');
    return;
  }

  if (event === 'tag_delta' && FILE_EDIT_TAGS.has(data?.name)) {
    appendEditorDelta(data);
    setBubbleMode('Editing', data.attrs?.path || bubbleState.subject || '');
    if (!minimizedTask) {
      thought.classList.remove('hidden');
      taskChip.classList.add('hidden');
      if (currentMode !== 'thinking') setMode('thinking');
    }
    setOrbState(minimizedTask ? 'busy' : 'thinking');
    // Render SYNCHRONOUSLY (no debounce) so every streaming chunk paints
    // before the next event arrives. This mirrors say_delta's path via
    // showThought() at line 2031, which is the reason say bubble streaming
    // visibly works while debounced editor streaming did not. Render still
    // runs when minimized so the bubble has fresh content when restored.
    renderBubble();
    return;
  }

  if (event === 'tag_delta' && SURFACE_BUILD_TAGS.has(data?.name)) {
    appendSurfaceEditorDelta(data);
    setBubbleMode(data.name.includes('shortcut') ? 'Building shortcut' : 'Building app', data.attrs?.name || bubbleState.subject || '');
    if (!minimizedTask) {
      thought.classList.remove('hidden');
      taskChip.classList.add('hidden');
      if (currentMode !== 'thinking') setMode('thinking');
    }
    setOrbState(minimizedTask ? 'busy' : 'thinking');
    renderBubble();
    return;
  }

  if (event === 'tag_delta' && COMMAND_TAGS.has(data?.name)) {
    appendTerminalDelta(data);
    setBubbleMode('Running command', data.attrs?.cwd || bubbleState.subject || '');
    if (!minimizedTask) {
      thought.classList.remove('hidden');
      taskChip.classList.add('hidden');
      if (currentMode !== 'thinking') setMode('thinking');
    }
    setOrbState(minimizedTask ? 'busy' : 'thinking');
    renderBubble();
    return;
  }

  if (event === 'execute_command_delta') {
    appendTerminalOutputDelta(data || {});
    setBubbleMode('Running command', data?.cwd || bubbleState.subject || '');
    if (!minimizedTask) {
      thought.classList.remove('hidden');
      taskChip.classList.add('hidden');
      if (currentMode !== 'thinking') setMode('thinking');
    }
    setOrbState(minimizedTask ? 'busy' : 'thinking');
    scheduleBubbleRender(40);
    return;
  }

  if (event === 'say' && data?.text) {
    appendOrUpdateSay({
      streamId: data.streamId || activeSayStreamId,
      tone: data.tone || 'warm',
      text: data.text,
      append: !activeSayItem,
      streaming: false,
    });
    // Media cards in <say> are now opt-in via the explicit `display_media`
    // tool. Auto-scanning every say for URLs created noise — links from
    // search results, citations, and prose got previewed indiscriminately.
    bubbleState.width = 'wide';
    showThought(data.tone || 'Speaking');
    return;
  }

  if (event === 'display_media') {
    const items = Array.isArray(data?.items) ? data.items : [];
    let appended = 0;
    for (const item of items) {
      if (!item?.url) continue;
      const card = mediaCardForUrl(item.url, {
        title: item.title || data?.title || 'media',
        meta: item.caption || item.url,
      });
      if (card && appendMediaCard(card)) appended += 1;
    }
    if (appended > 0) {
      bubbleState.width = 'wide';
      showThought('Showing media');
      renderBubble();
    }
    return;
  }

  if (event === 'create_app' || event === 'update_app') {
    const manifest = data?.manifest || {};
    finishActivity(event, manifest);
    completeSurfaceEditorCard(event, manifest);
    setBuildCard(event, manifest, 'done');
    setBubbleMode(event.includes('update') ? 'Updated' : `${manifest.name || 'App'} is ready.`, '');
    refreshSurfaces().catch(() => {});
    pulseComplete();
    showThought(bubbleState.mode);
    return;
  }

  if (event === 'display_shortcut') {
    const manifest = data?.manifest || {};
    const id = data?.id || manifest.id;
    console.log('[bor:shortcut] display_shortcut received', { id, name: manifest.name, htmlBytes: (data?.html || '').length, bubbleHeight: data?.bubbleHeight, isUpdate: !!data?.isUpdate });
    if (!id) {
      console.warn('[bor:shortcut] display_shortcut dropped — no id in payload', data);
      return;
    }
    const synthEvent = data?.isUpdate ? 'update_shortcut' : 'create_shortcut';
    finishActivity('create_shortcut', manifest);
    finishActivity('update_shortcut', manifest);
    finishActivity('launch_shortcut', manifest);
    // Close any streaming editor card the user has been watching as the
    // shortcut HTML streamed in.
    completeSurfaceEditorCard(synthEvent, manifest);
    appendShortcutToThread({ ...data, id });
    refreshSurfaces().catch(() => {});
    bubbleState.width = 'wide';
    setBubbleMode(data?.isUpdate ? 'Shortcut updated' : `${manifest.name || 'Shortcut'} is live`, '');
    pulseComplete();
    // Respect minimize intent — render but don't pop the bubble open if
    // the user explicitly hid it. The shortcut is in the thread; when they
    // restore it'll be there. If not minimized, ensure the bubble is shown
    // so the freshly-appended iframe is visible.
    if (!minimizedTask) {
      thought.classList.remove('hidden');
      taskChip.classList.add('hidden');
    }
    renderBubble();
    return;
  }

  if (event === 'delete_shortcut') {
    finishActivity('delete_shortcut', data || {});
    removeShortcutFromThread(data?.id);
    refreshSurfaces().catch(() => {});
    renderBubble();
    return;
  }

  if (event === 'launch_app') {
    finishActivity(event, data || {});
    if (data?.id) lastSurfaceId = data.id;
    setBubbleMode('Opening app.', data?.name || '');
    showWaitingForModel();
    renderBubble();
    return;
  }

  if (event === 'set_theme') {
    finishActivity('set_theme', data || {});
    if (data?.config) applyPresenceConfig(data.config);
    activeCardItem = null;
    bubbleState.card = null;
    if (!activeSayItem) {
      appendOrUpdateSay({
        tone: 'warm',
        text: 'Updated the Mac background and visual state.',
        append: true,
        streaming: false,
      });
    }
    setBubbleMode('Theme updated.', '');
    renderBubble();
    return;
  }

  if (event === 'web_search') {
    finishActivity('web_search', data || {});
    setThreadCard({ type: 'web', query: data?.query, results: data?.results || [] });
    // No auto-media-preview from search results. The model picks the URLs
    // it wants to show and calls `display_media` explicitly.
    bubbleState.width = 'wide';
    renderBubble();
    return;
  }

  if (event === 'web_fetch') {
    finishActivity('web_fetch', data || {});
    // No auto-preview — see web_search.
    showWaitingForModel();
    renderBubble();
    return;
  }

  if (event === 'screen_capture') {
    finishActivity('screen_capture', data || {});
    setMediaCardFromPayload(data || {}, {
      type: 'image',
      title: 'screen capture',
      kind: 'screen',
      meta: [dimensionsLabel(data || {}), data?.url || 'screen capture'].filter(Boolean).join(' · '),
    });
    setBubbleMode('Screen captured.', '');
    showWaitingForModel();
    renderBubble();
    return;
  }

  if (event === 'view_image') {
    finishActivity('view_image', data || {});
    setMediaCardFromPayload(data || {}, {
      type: 'image',
      title: 'external image',
      kind: 'image',
      meta: data?.description ? shortText(data.description, 96) : data?.url || 'external image',
    });
    showWaitingForModel();
    renderBubble();
    return;
  }

  const fileEditTag = fileEditTagForEvent(event, data || {});
  if (fileEditTag) {
    finishActivity(fileEditTag, data || {});
    completeEditorCard({
      tag: fileEditTag,
      path: data?.path,
      bytes: data?.bytes,
      applied: data?.applied,
      status: 'done',
    });
    setBubbleMode(fileEditTag === 'replace_in_file' ? 'Edited' : 'Wrote', data?.path || bubbleState.subject || '');
    showWaitingForModel();
    renderBubble();
    return;
  }

  if (event === 'generate_image') {
    finishActivity('generate_image', data || {});
    setMediaCardFromPayload(data || {}, {
      type: 'image',
      title: 'generated image',
      kind: 'image',
      meta: data?.url || 'image generated',
    });
    setBubbleMode('Painted.', '');
    bubbleState.footer = { primary: 'Use as wallpaper', secondary: ['Save', 'Insert', 'Regenerate'] };
    showWaitingForModel();
    renderBubble();
    return;
  }

  if (event === 'execute_command') {
    finishActivity('execute_command', data || {});
    completeTerminalCard(data || {});
    // No auto-media-preview from command output. If the command produced
    // media URLs the model wants to show (browser-use scraping reels etc),
    // it should call `display_media` next with the URLs it picked.
    setBubbleMode(data?.ok === false ? 'Command failed.' : 'Command finished.', '');
    showWaitingForModel();
    renderBubble();
    return;
  }

  if (event === 'tool_error' || event === 'error' || event === 'surface_error') {
    const tag = data?.tag || data?.name || 'tool';
    const reason = data?.reason || data?.error || 'Something failed.';
    failActivity(tag, reason);
    if (FILE_EDIT_TAGS.has(tag)) {
      completeEditorCard({
        tag,
        path: data?.path,
        status: 'error',
        reason,
      });
    }
    if (COMMAND_TAGS.has(tag)) {
      completeTerminalCard({
        cmd: data?.cmd || activeCardItem?.card?.cmd || '',
        cwd: data?.cwd || activeCardItem?.card?.cwd || '',
        stderr: reason,
        exitCode: data?.exitCode ?? null,
        ok: false,
        reason,
      }, 'error');
    }
    bubbleState.width = 'wide';
    if (!COMMAND_TAGS.has(tag)) {
      setThreadCard({
        type: 'error',
        title: tag === 'tool' ? 'Provider or runtime failed' : `${tag.replaceAll('_', ' ')} failed`,
        message: reason,
        code: event === 'error' ? 'err' : 'tool',
        detail: data?.stack || '',
      });
    }
    bubbleState.footer = { primary: 'Retry', secondary: ['Open settings'], action: 'retry' };
    setBubbleMode('Something went sideways.', '');
    showThought(bubbleState.mode);
    return;
  }

  if (event === 'connectivity') {
    setThreadCard({
      type: 'error',
      title: data?.online ? 'Back online' : "You're offline.",
      message: data?.online ? 'The network is back. I will continue the request.' : (data?.reason || 'I will keep the in-progress work and pick up when the network is back.'),
      code: data?.online ? 'ok' : 'net',
    });
    setBubbleMode(data?.online ? 'Back online.' : "You're offline.", '');
    renderBubble();
    return;
  }

  if (event === 'cancelled') {
    stopGeneration({ reason: 'Stopped.' });
    return;
  }

  if (event === 'task_done') {
    markRunningDone();
    removeThinkingLine();
    if (activeSayItem) {
      activeSayItem.streaming = false;
      activeSayItem.done = true;
    }
    appendCompletionMessage(data?.message || 'All set.', data?.status || 'complete');
    bubbleState.done = true;
    bubbleState.footer ||= lastSurfaceId
      ? { primary: 'Open', action: 'open-surface', secondary: ['Keep visible', 'View work'] }
      : { secondary: ['Keep visible', 'View work'] };
    setBubbleMode(data?.status === 'blocked' ? 'Blocked.' : 'Done.', bubbleState.subject);
    setOrbState('idle');
    pulseComplete();
    showThought(bubbleState.mode);
    return;
  }

  if (event === 'done') {
    markRunningDone();
    appendTaskAssistantMessage(data?.recorded);
    currentRequestId = null;
    bubbleState.done = true;
    removeThinkingLine();
    let hasCompletion = bubbleState.thread.some((item) => item.type === 'completion');
    if (!hasCompletion) {
      appendCompletionMessage('', 'complete');
      hasCompletion = true;
    }
    if (!hasCompletion && !bubbleState.card && !bubbleState.stream) {
      appendOrUpdateSay({ tone: 'warm', text: 'Done.', append: true, streaming: false });
    }
    if (activeSayItem) activeSayItem.streaming = false;
    if (!bubbleState.mode.endsWith('.') && !bubbleState.mode.includes('ready')) setBubbleMode('Done.', bubbleState.subject);
    bubbleState.footer ||= lastSurfaceId
      ? { primary: 'Open', action: 'open-surface', secondary: ['Keep visible', 'View work'] }
      : { secondary: ['Keep visible', 'View work'] };
    stopElapsed();
    setOrbState('idle');
    pulseComplete();
    renderBubble();
    return;
  }

  if (TOOL_META[event]) {
    finishActivity(event, data || {});
    // No generic auto-preview for unmodeled tools. The model uses
    // `display_media` when it wants media on screen.
    showWaitingForModel();
    renderBubble();
  }
}

function cssPx(value, fallback = 0) {
  const next = Number.parseFloat(value);
  return Number.isFinite(next) ? next : fallback;
}

function composerEdgeInset() {
  const style = window.getComputedStyle(composer);
  const anchor = root?.dataset?.anchor || currentAnchor || '';
  const top = cssPx(style.top, NaN);
  const bottom = cssPx(style.bottom, NaN);
  const preferred = anchor.startsWith('top') ? top : bottom;
  const fallback = anchor.startsWith('top') ? bottom : top;
  if (Number.isFinite(preferred) && preferred < 200) return preferred;
  if (Number.isFinite(fallback) && fallback < 200) return fallback;
  if (Number.isFinite(preferred)) return preferred;
  if (Number.isFinite(fallback)) return fallback;
  return 11.25;
}

function updateComposerClearance() {
  const rect = composer.getBoundingClientRect();
  if (!rect.height) return;
  const clearance = Math.ceil(rect.height + composerEdgeInset() + 14);
  root.style.setProperty('--composer-clearance', `${clearance}px`);
}

async function syncExpandedPresenceHeight() {
  if (currentMode !== 'expanded' || hostPresenceMode !== 'expanded' || presenceResizeInFlight) return;
  const rect = composer.getBoundingClientRect();
  if (!rect.height) return;
  const edgeInset = composerEdgeInset();
  const desiredHeight = Math.max(92, Math.min(180, Math.ceil(rect.height + edgeInset * 2 + 6)));
  const bounds = currentPresenceBounds || await window.borHost.getPresenceBounds().catch(() => null);
  if (!bounds || Math.abs(bounds.height - desiredHeight) < 2) return;

  const patch = { height: desiredHeight };
  if (!currentAnchor.startsWith('top')) {
    patch.y = Math.round(bounds.y + bounds.height - desiredHeight);
  }

  presenceResizeInFlight = true;
  let didResize = false;
  try {
    const result = await window.borHost.setPresenceBounds(patch);
    if (result?.ok) {
      didResize = true;
      applyPresenceLayout(result);
    }
  } catch {
    // Presence resizing is best-effort; typing should continue even if the host rejects a resize.
  } finally {
    presenceResizeInFlight = false;
    if (didResize && currentMode === 'expanded') scheduleComposerSync();
  }
}

function scheduleComposerSync() {
  window.cancelAnimationFrame(composerSyncFrame);
  composerSyncFrame = window.requestAnimationFrame(() => {
    updateComposerClearance();
    syncExpandedPresenceHeight();
  });
}

function submitPrompt() {
  const text = promptInput.value.trim();
  if (!text && !attachedContextItems.length) return;
  surfaceDrawer.classList.add('hidden');
  promptInput.value = '';
  resizePrompt();
  startTask(text || 'Use the attached context.');
}

function resizePrompt() {
  if (currentMode === 'collapsed' || currentMode === 'minimized') {
    promptInput.style.height = '';
    promptInput.classList.remove('is-scrollable');
    delete root.dataset.promptMultiline;
    scheduleComposerSync();
    return;
  }
  const inputStyle = window.getComputedStyle(promptInput);
  const maxHeight = cssPx(inputStyle.maxHeight, 84);
  const lineHeight = cssPx(inputStyle.lineHeight, cssPx(inputStyle.fontSize, 11) * 1.38);
  const singleLineHeight = Math.ceil(
    lineHeight + cssPx(inputStyle.paddingTop) + cssPx(inputStyle.paddingBottom),
  );
  promptInput.style.height = 'auto';
  const naturalHeight = Math.ceil(promptInput.scrollHeight);
  const nextHeight = Math.min(Math.max(naturalHeight, singleLineHeight), maxHeight);
  const isMultiline = promptInput.value.includes('\n') || naturalHeight > singleLineHeight + 4;
  const isScrollable = naturalHeight > maxHeight + 1;
  promptInput.style.height = `${nextHeight}px`;
  if (isMultiline) root.dataset.promptMultiline = 'true';
  else delete root.dataset.promptMultiline;
  promptInput.classList.toggle('is-scrollable', isScrollable);
  if (isScrollable) promptInput.scrollTop = promptInput.scrollHeight;
  scheduleComposerSync();
}

composer.addEventListener('submit', (event) => {
  event.preventDefault();
  submitPrompt();
});

promptInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    hideThought();
    setMode('collapsed');
    return;
  }
  if (event.key === 'Enter' && (event.metaKey || !event.shiftKey)) {
    event.preventDefault();
    submitPrompt();
  }
});

promptInput.addEventListener('input', resizePrompt);

if (typeof ResizeObserver === 'function') {
  const composerObserver = new ResizeObserver(scheduleComposerSync);
  composerObserver.observe(composer);
  composerObserver.observe(promptInput);
  if (chipRail) composerObserver.observe(chipRail);
}

promptInput.addEventListener('focus', () => {
  if (currentMode === 'collapsed' || currentMode === 'minimized') setMode('expanded');
  else resizePrompt();
});

if (attachButton) {
  attachButton.addEventListener('click', async () => {
    if (typeof window.borHost.pickContextItems !== 'function') return;
    if (currentMode === 'collapsed' || currentMode === 'minimized') setMode('expanded');
    attachButton.disabled = true;
    try {
      const result = await window.borHost.pickContextItems();
      if (!result?.canceled && Array.isArray(result?.items)) {
        addAttachedContext(result.items);
      }
      promptInput.focus();
    } catch (error) {
      addAttachedContext([{
        kind: 'error',
        name: 'attach failed',
        path: '',
        error: error.message,
      }]);
    } finally {
      attachButton.disabled = false;
    }
  });
}

// ---------- Drag-and-drop attachments ----------
// Drop files, images, or folders from Finder onto the composer or thought
// bubble — they attach the same way as the + button. Native drag-drop on
// Electron exposes File objects whose absolute path we recover via
// webUtils.getPathForFile (exposed through preload as describeDroppedFiles).
let dragDepth = 0;
function isFileDrag(event) {
  if (!event?.dataTransfer) return false;
  const types = Array.from(event.dataTransfer.types || []);
  return types.includes('Files');
}

function setDropTargetActive(active) {
  composer.classList.toggle('drop-target', active);
  thought.classList.toggle('drop-target', active);
}

['composer', 'thought'].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('dragenter', (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragDepth += 1;
    setDropTargetActive(true);
  });
  el.addEventListener('dragover', (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });
  el.addEventListener('dragleave', (event) => {
    if (!isFileDrag(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) setDropTargetActive(false);
  });
  el.addEventListener('drop', async (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragDepth = 0;
    setDropTargetActive(false);
    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.length || typeof window.borHost.describeDroppedFiles !== 'function') return;
    if (currentMode === 'collapsed' || currentMode === 'minimized') setMode('expanded');
    try {
      const result = await window.borHost.describeDroppedFiles(files);
      if (Array.isArray(result?.items) && result.items.length) {
        addAttachedContext(result.items);
        promptInput.focus();
      }
    } catch (error) {
      addAttachedContext([{
        kind: 'error',
        name: 'drop failed',
        path: '',
        error: error.message,
      }]);
    }
  });
});

if (chipRail) {
  chipRail.addEventListener('click', (event) => {
    const button = event.target.closest('[data-context-index]');
    if (!button) return;
    const index = Number(button.dataset.contextIndex);
    if (!Number.isInteger(index)) return;
    attachedContextItems.splice(index, 1);
    renderAttachedContext();
    promptInput.focus();
  });
}

if (surfacesButton) {
  surfacesButton.addEventListener('click', async () => {
    thought.classList.add('hidden');
    taskChip.classList.add('hidden');
    surfaceDrawer.classList.toggle('hidden');
    if (!surfaceDrawer.classList.contains('hidden')) {
      setMode('thinking');
      await refreshSurfaces().catch((error) => {
        surfaceList.innerHTML = `<div class="surface-row"><span>${escapeHtml(error.message)}</span><small>error</small></div>`;
      });
    } else {
      setMode('expanded');
    }
  });
}

setupButton.addEventListener('click', () => {
  window.borHost.openOnboarding();
});

minimizeButton.addEventListener('click', minimizeThought);

stopButton.addEventListener('click', () => {
  stopGeneration({ reason: 'Stopped.' });
});

closeButton.addEventListener('click', () => {
  closeThoughtSession();
});

bubbleResizeZones.forEach((zone) => {
  zone.addEventListener('pointerdown', startBubbleResize);
  zone.addEventListener('pointermove', moveBubbleResize);
  zone.addEventListener('pointerup', endBubbleResize);
  zone.addEventListener('pointercancel', endBubbleResize);
});

taskChip.addEventListener('click', restoreTask);

thoughtFoot.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'open-surface' && lastSurfaceId) {
    window.borHost.openSurface(lastSurfaceId);
    return;
  }
  if (action === 'close') {
    closeThoughtSession();
  }
});

window.addEventListener('mousemove', resetIdleTimer);
window.addEventListener('keydown', resetIdleTimer);

// ---------- Shortcut bridge ----------
//
// Sandboxed shortcut iframes communicate with the host via parent.postMessage
// (same protocol as shell/surface-bridge.js and v2/host/surface-preload.cjs).
// We catch every message here, identify the source iframe by walking the
// live `iframe[data-sid]` set, forward via IPC to main.cjs which proxies to
// /api/surface-* on the runtime, then post the reply back to the iframe.
//
// `launch-app` is the one new bridge op shortcuts get that apps don't —
// shortcuts can call launchApp(appId) to open a full Mac window from inside
// the bubble card.
const SHORTCUT_BRIDGE_OPS = new Set(['state-get', 'state-set', 'llm-request', 'web-search', 'web-fetch', 'image-generate']);

function findShortcutIframe(source) {
  if (!source) return null;
  const frames = thoughtBody.querySelectorAll('iframe[data-sid]');
  for (const frame of frames) {
    if (frame.contentWindow === source) return frame;
  }
  return null;
}

window.addEventListener('message', async (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object' || typeof data.type !== 'string' || !data.requestId) return;
  if (!SHORTCUT_BRIDGE_OPS.has(data.type) && data.type !== 'launch-app') return;
  const iframe = findShortcutIframe(event.source);
  if (!iframe) return; // not a shortcut postMessage — ignore (could be a host-side message)

  const surfaceId = iframe.dataset.sid;
  let response;
  try {
    if (data.type === 'launch-app') {
      const result = await window.borHost.launchAppFromShortcut(String(data.appId || ''));
      response = result?.ok ? { requestId: data.requestId, ok: true, id: result.id } : { requestId: data.requestId, error: result?.error || 'launch failed' };
    } else {
      const payload = { ...data };
      delete payload.requestId;
      delete payload.type;
      const result = await window.borHost.surfaceBridge({ surfaceId, op: data.type, payload });
      response = { requestId: data.requestId, ...(result || {}) };
    }
  } catch (err) {
    response = { requestId: data.requestId, error: err?.message || String(err) };
  }
  try {
    event.source?.postMessage(response, '*');
  } catch (e) {
    console.warn('[shortcut-bridge] reply failed', e?.message || e);
  }
});

// ---------- Shortcut drag-to-resize ----------
//
// Drag the bottom handle (.shortcut-card-resize) to grow or shrink the iframe
// height. Clamped to the same 160-600 range the server uses. After release
// the new height is cached in shortcutCache; the next renderBubble preserves
// it via the --bor-shortcut-height CSS var on the placeholder.
const SHORTCUT_MIN_HEIGHT = 160;
const SHORTCUT_MAX_HEIGHT = 600;
let shortcutResizeState = null;

thoughtBody.addEventListener('pointerdown', (event) => {
  const handle = event.target.closest('[data-shortcut-resize]');
  if (!handle) return;
  const id = handle.dataset.shortcutResize;
  const card = handle.closest('.shortcut-card');
  if (!id || !card) return;
  const item = bubbleState.thread.find((it) => it.type === 'shortcut' && it.id === id);
  if (!item) return;
  event.preventDefault();
  shortcutResizeState = {
    id,
    handle,
    card,
    startY: event.clientY,
    startHeight: Number(item.bubbleHeight) || 280,
    pointerId: event.pointerId,
  };
  handle.setPointerCapture(event.pointerId);
  handle.dataset.resizing = 'true';
  card.dataset.resizing = 'true';
});

window.addEventListener('pointermove', (event) => {
  if (!shortcutResizeState || event.pointerId !== shortcutResizeState.pointerId) return;
  const delta = event.clientY - shortcutResizeState.startY;
  const next = Math.max(SHORTCUT_MIN_HEIGHT, Math.min(SHORTCUT_MAX_HEIGHT, Math.round(shortcutResizeState.startHeight + delta)));
  shortcutResizeState.card.style.setProperty('--bor-shortcut-height', `${next}px`);
});

window.addEventListener('pointerup', (event) => {
  if (!shortcutResizeState || event.pointerId !== shortcutResizeState.pointerId) return;
  const { id, handle, card, startHeight } = shortcutResizeState;
  const computed = parseInt(card.style.getPropertyValue('--bor-shortcut-height'), 10);
  const finalHeight = Number.isFinite(computed) ? computed : startHeight;
  const item = bubbleState.thread.find((it) => it.type === 'shortcut' && it.id === id);
  if (item) item.bubbleHeight = finalHeight;
  // Update the cached iframe's height so subsequent renderBubbles preserve.
  const cached = shortcutCache.get(id);
  if (cached?.iframe) cached.iframe.style.height = `${finalHeight}px`;
  delete handle.dataset.resizing;
  delete card.dataset.resizing;
  try { handle.releasePointerCapture(event.pointerId); } catch { /* ignore */ }
  shortcutResizeState = null;
});

// Shortcut card click handler — close (×) removes the card + iframe; revive
// brings a frozen (out-of-cap) shortcut back live. Delegated on thoughtBody
// so it survives every renderBubble().
thoughtBody.addEventListener('click', (event) => {
  const closeBtn = event.target.closest('[data-shortcut-close]');
  if (closeBtn) {
    event.preventDefault();
    removeShortcutFromThread(closeBtn.dataset.shortcutClose);
    renderBubble();
    return;
  }
  const reviveBtn = event.target.closest('[data-shortcut-revive]');
  if (reviveBtn) {
    event.preventDefault();
    reviveShortcut(reviveBtn.dataset.shortcutRevive);
    renderBubble();
  }
});

window.borHost.onChatEvent(handleChatEvent);
if (typeof window.borHost.onPresenceLayout === 'function') {
  window.borHost.onPresenceLayout(applyPresenceLayout);
}
window.borHost.onTogglePresence(() => {
  if ((currentMode === 'collapsed' || currentMode === 'minimized') && hasVisibleThoughtSession()) {
    restoreTask();
    return;
  }
  if (currentMode === 'thinking' && hasVisibleThoughtSession()) {
    minimizeThought();
    return;
  }
  setMode(currentMode === 'collapsed' || currentMode === 'minimized' ? 'expanded' : 'collapsed');
});

hydratePresenceConfig();
applyBubbleUserSize();
resizePrompt();
resetIdleTimer();
