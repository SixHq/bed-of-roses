// Bed of Roses — display shell controller (v0.3)
// Four-pane onboarding (welcome → name → presence → connect), memoji-engine
// avatar on the homepage and live preview cards in the presence picker.

import {
  MemojiRenderer,
  PRESET_NAMES,
  PRESET_LABELS,
  COLORS,
  COLOR_NAMES,
} from '/memoji.js';
import { AmbientField } from '/ambient.js';
import { parseSay, speaker } from '/speak.js';
import { runChatTurn } from '/protocol-client.js';
import { applyBaseTheme, publicThemeList, DEFAULT_THEME } from '/themes/index.js';
import { installBridge } from '/widget-bridge.js';

const $ = (id) => document.getElementById(id);
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  config: null,
  systemApps: [],
  widgets: [],
  filesPath: '/',
  filesSelection: null,
  messages: [],
  pending: false,
  avatarStyle: 'nova',
  avatarColor: 'lilac',
  baseTheme: DEFAULT_THEME,   // active base theme id (bloom / cartoon-brutalist / …)
  decorations: [],
  avatarRenderer: null,
  orbRenderer: null,
  presencePreviews: [],   // { card, renderer }
  providerCatalog: [],     // [{id, label, description, models, signupUrl, ...}]
  expandedProvider: null,  // id of currently-expanded drawer in connect pane
};

// Convert "#RRGGBB" → "r,g,b" for CSS rgba(var(--…)) interpolation
function hexToRgbStr(hex) {
  const h = (hex || '#FFFFFF').replace('#', '');
  const m = h.match(/^([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (!m) return '255,255,255';
  return `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}`;
}

function applyAvatarColorVar(colorName) {
  const c = COLORS[colorName] || COLORS.pearl;
  document.documentElement.style.setProperty('--avatar-color-rgb', hexToRgbStr(c.hex));
}

function applyWallpaper(value) {
  // value is a CSS color or gradient string from the AI's set_wallpaper tool.
  // Empty/null clears it.
  document.documentElement.style.setProperty('--wallpaper', value || 'transparent');
}

const DECORATION_ANCHORS = new Set([
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'center-left',
  'center-right',
  'center',
]);
const DECORATION_DEFAULT_OFFSET = 28;
const DECORATION_DEFAULT_SIZE = 220;
const DECORATION_GAP = 24;
const DECORATION_EDGE = 12;

function normalizeDecorationAnchor(anchor) {
  const value = String(anchor || 'bottom-right').trim();
  return DECORATION_ANCHORS.has(value) ? value : 'bottom-right';
}

function cssLengthToPx(value, fallback, axis = 'x') {
  const text = String(value ?? '').trim();
  const number = Number.parseFloat(text);
  if (!Number.isFinite(number)) return fallback;
  if (/^-?\d+(\.\d+)?px$/i.test(text) || /^-?\d+(\.\d+)?$/.test(text)) return number;
  if (/vw$/i.test(text)) return (window.innerWidth * number) / 100;
  if (/vh$/i.test(text)) return (window.innerHeight * number) / 100;
  if (/%$/.test(text)) return ((axis === 'y' ? window.innerHeight : window.innerWidth) * number) / 100;
  if (/rem$/i.test(text)) {
    const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return number * rootFontSize;
  }
  return number;
}

function decorationBox(decoration, x, y) {
  const anchor = normalizeDecorationAnchor(decoration.anchor);
  const width = Math.max(1, cssLengthToPx(decoration.width, DECORATION_DEFAULT_SIZE, 'x'));
  const height = Math.max(1, cssLengthToPx(decoration.height, DECORATION_DEFAULT_SIZE, 'y'));
  let left;
  let top;

  if (anchor.includes('left')) {
    left = x;
  } else if (anchor.includes('right')) {
    left = window.innerWidth - x - width;
  } else {
    left = (window.innerWidth - width) / 2 + x - DECORATION_DEFAULT_OFFSET;
  }

  if (anchor.includes('top')) {
    top = y;
  } else if (anchor.includes('bottom')) {
    top = window.innerHeight - y - height;
  } else {
    top = (window.innerHeight - height) / 2 + y - DECORATION_DEFAULT_OFFSET;
  }

  return { left, top, right: left + width, bottom: top + height, width, height };
}

function boxesOverlap(a, b) {
  return (
    a.left < b.right + DECORATION_GAP &&
    b.left < a.right + DECORATION_GAP &&
    a.top < b.bottom + DECORATION_GAP &&
    b.top < a.bottom + DECORATION_GAP
  );
}

function boxInsideViewport(box) {
  return (
    box.left >= DECORATION_EDGE &&
    box.top >= DECORATION_EDGE &&
    box.right <= window.innerWidth - DECORATION_EDGE &&
    box.bottom <= window.innerHeight - DECORATION_EDGE
  );
}

function boxInsideHorizontalViewport(box) {
  return box.left >= DECORATION_EDGE && box.right <= window.innerWidth - DECORATION_EDGE;
}

function boxInsideVerticalViewport(box) {
  return box.top >= DECORATION_EDGE && box.bottom <= window.innerHeight - DECORATION_EDGE;
}

function nextDecorationX(anchor, hit, currentX) {
  if (anchor.includes('right')) {
    return Math.max(currentX + DECORATION_GAP, Math.ceil(window.innerWidth - hit.left + DECORATION_GAP));
  }
  return Math.max(currentX + DECORATION_GAP, Math.ceil(hit.right + DECORATION_GAP));
}

function layoutDecorations(decorations) {
  if (!window.innerWidth || !window.innerHeight) return decorations;
  const placed = [];
  return decorations.map((decoration) => {
    const anchor = normalizeDecorationAnchor(decoration.anchor);
    const result = { ...decoration, anchor };
    const width = Math.max(1, cssLengthToPx(result.width, DECORATION_DEFAULT_SIZE, 'x'));
    const height = Math.max(1, cssLengthToPx(result.height, DECORATION_DEFAULT_SIZE, 'y'));
    const baseX = cssLengthToPx(result.x, DECORATION_DEFAULT_OFFSET, 'x');
    let x = baseX;
    let y = cssLengthToPx(result.y, DECORATION_DEFAULT_OFFSET, 'y');

    for (let attempt = 0; attempt < 80; attempt += 1) {
      const box = decorationBox(result, x, y);
      const hit = placed.find((placedBox) => boxesOverlap(box, placedBox));
      if (!hit && boxInsideViewport(box)) break;

      x = hit ? nextDecorationX(anchor, hit, x) : x + width + DECORATION_GAP;
      const shifted = decorationBox(result, x, y);
      if (!boxInsideHorizontalViewport(shifted)) {
        x = baseX;
        y += height + DECORATION_GAP;
      }
      if (!boxInsideVerticalViewport(decorationBox(result, x, y))) break;
    }

    result.x = `${Math.round(x)}px`;
    result.y = `${Math.round(y)}px`;
    placed.push(decorationBox(result, x, y));
    return result;
  });
}

function renderDecorations(decorations = state.decorations) {
  const layer = $('decor-layer');
  if (!layer) return;
  layer.innerHTML = '';
  const active = (Array.isArray(decorations) ? decorations : [])
    .filter((d) => d && d.type === 'svg' && d.url && (!d.themeId || d.themeId === state.baseTheme))
    .sort((a, b) => (a.z || 0) - (b.z || 0));

  for (const d of layoutDecorations(active)) {
    const el = document.createElement('div');
    el.className = 'home-decoration';
    el.dataset.drift = d.drift || 'none';
    el.style.width = d.width || '220px';
    el.style.height = d.height || '220px';
    el.style.opacity = `${d.opacity ?? 1}`;
    el.style.mixBlendMode = d.blend || 'normal';
    el.style.setProperty('--decor-rotate', d.rotate || '0deg');
    // z only orders SVGs inside the background layer; the layer itself stays
    // behind widgets, home chrome, and opened app modals.
    el.style.zIndex = `${100 + (Number(d.z) || 0)}`;

    const anchor = d.anchor || 'bottom-right';
    if (anchor.includes('top')) el.style.top = d.y || '28px';
    if (anchor.includes('bottom')) el.style.bottom = d.y || '28px';
    if (anchor.includes('left')) el.style.left = d.x || '28px';
    if (anchor.includes('right')) el.style.right = d.x || '28px';
    if (anchor === 'center') {
      el.style.left = '50%';
      el.style.top = '50%';
      el.style.transform = `translate(calc(-50% + ${d.x || '28px'} - 28px), calc(-50% + ${d.y || '28px'} - 28px)) rotate(${d.rotate || '0deg'})`;
    } else if (anchor === 'center-left') {
      el.style.left = d.x || '28px';
      el.style.top = '50%';
      el.style.transform = `translateY(-50%) rotate(${d.rotate || '0deg'})`;
    } else if (anchor === 'center-right') {
      el.style.right = d.x || '28px';
      el.style.top = '50%';
      el.style.transform = `translateY(-50%) rotate(${d.rotate || '0deg'})`;
    }

    const img = document.createElement('img');
    img.src = d.url;
    img.alt = '';
    img.loading = 'lazy';
    el.appendChild(img);
    layer.appendChild(el);
  }
}

let decorationResizeTimer = null;
window.addEventListener('resize', () => {
  window.clearTimeout(decorationResizeTimer);
  decorationResizeTimer = window.setTimeout(() => renderDecorations(), 120);
});

/**
 * Dynamically load a Google Font family if it isn't already loaded. Cached
 * by family name — calling twice for the same family is a no-op.
 */
const _loadedFonts = new Set();
function loadGoogleFont(family) {
  if (!family || _loadedFonts.has(family)) return;
  _loadedFonts.add(family);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap`;
  document.head.appendChild(link);
}

/**
 * Apply a theme snapshot (palette / fonts / atmosphere) to the live shell.
 * Each field is optional — only what's present overrides the defaults.
 * Called on boot AND after every set_theme tool dispatch.
 */
function applyTheme(theme) {
  if (!theme) return;
  const root = document.documentElement;

  if (theme.palette) {
    const map = {
      canvas: '--canvas',
      surface1: '--surface-1',
      surface2: '--surface-2',
      surface3: '--surface-3',
      bloom: '--bloom',
    };
    for (const [k, varName] of Object.entries(map)) {
      if (theme.palette[k]) root.style.setProperty(varName, theme.palette[k]);
    }
  }

  if (theme.fonts) {
    if (theme.fonts.display) {
      loadGoogleFont(theme.fonts.display);
      root.style.setProperty('--font-display', `"${theme.fonts.display}", "Instrument Serif", "Cormorant Garamond", Georgia, serif`);
    }
    if (theme.fonts.system) {
      loadGoogleFont(theme.fonts.system);
      root.style.setProperty('--font-system', `"${theme.fonts.system}", "Geist", -apple-system, "Helvetica Neue", system-ui, sans-serif`);
    }
    if (theme.fonts.mono) {
      loadGoogleFont(theme.fonts.mono);
      root.style.setProperty('--font-mono', `"${theme.fonts.mono}", "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace`);
    }
  }

  if (typeof theme.atmosphere === 'string') {
    if (theme.atmosphere === 'none') {
      root.style.setProperty('--atmosphere', 'var(--canvas)');
    } else if (theme.atmosphere !== 'default') {
      root.style.setProperty('--atmosphere', theme.atmosphere);
    }
  }

  // accent is mirrored to avatarColor by the server, so applyConfigSnapshot
  // picks it up on the avatar-color path — no separate handling here.
}

/**
 * Apply a fresh public-config snapshot to the running shell. Called after
 * every tool execution so the OS hot-reflects what the AI changed.
 */
function applyConfigSnapshot(cfg) {
  if (!cfg) return;
  state.config = cfg;
  if (cfg.baseTheme && cfg.baseTheme !== state.baseTheme) {
    state.baseTheme = cfg.baseTheme;
    applyBaseTheme(cfg.baseTheme);
    renderDecorations();
  }
  if (cfg.avatarStyle && cfg.avatarStyle !== state.avatarStyle) {
    state.avatarStyle = cfg.avatarStyle;
    state.avatarRenderer?.setPreset(cfg.avatarStyle);
    state.orbRenderer?.setPreset(cfg.avatarStyle);
    for (const p of state.presencePreviews) p.renderer.setPreset(cfg.avatarStyle);
  }
  if (cfg.avatarColor && cfg.avatarColor !== state.avatarColor) {
    state.avatarColor = cfg.avatarColor;
    applyAvatarColorVar(cfg.avatarColor);
    pushColorToAmbient(cfg.avatarColor);
    state.avatarRenderer?.setColor(cfg.avatarColor);
    state.orbRenderer?.setColor(cfg.avatarColor);
    for (const p of state.presencePreviews) p.renderer.setColor(cfg.avatarColor);
  }
  if ('wallpaper' in cfg) {
    applyWallpaper(cfg.wallpaper);
  }
  if ('decorations' in cfg) {
    state.decorations = Array.isArray(cfg.decorations) ? cfg.decorations : [];
    renderDecorations(state.decorations);
  }
  if ('theme' in cfg) {
    applyTheme(cfg.theme);
  }
  if (cfg.aiName && desktopItems().length === 0) {
    // Refresh greeting if the AI just renamed itself on an empty desktop
    showGreeting(cfg.aiName);
  }
}

let ambient = null;
function initAmbient() {
  if (ambient) return ambient;
  const canvas = $('ambient-bg');
  if (!canvas) return null;
  ambient = new AmbientField(canvas, { count: 140 });
  ambient.start();
  return ambient;
}

function pushColorToAmbient(colorName) {
  const c = COLORS[colorName] || COLORS.pearl;
  const rgbStr = hexToRgbStr(c.hex);
  const rgb = rgbStr.split(',').map((n) => parseInt(n, 10));
  ambient?.setColor(rgb);
}

// Single global mousemove → fans out to ambient + every active renderer +
// every tiltable card. One rAF per move event, eased per-card based on its
// distance from the cursor in viewport space.
const TILTABLE_SELECTOR = '.presence-card, .provider-card';

function initParallax() {
  let raf = 0;
  let mouseX = 0, mouseY = 0;
  let absMouseX = 0, absMouseY = 0;

  const flush = () => {
    raf = 0;
    ambient?.setParallax(mouseX, mouseY);
    state.avatarRenderer?.setParallax(mouseX, mouseY);
    for (const p of state.presencePreviews) p.renderer.setParallax(mouseX, mouseY);

    // Per-card 3D tilt based on cursor distance from each card's center
    const cards = document.querySelectorAll(TILTABLE_SELECTOR);
    cards.forEach((card) => {
      const rect = card.getBoundingClientRect();
      if (rect.width === 0) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (absMouseX - cx) / (rect.width / 2);   // -1 .. 1
      const dy = (absMouseY - cy) / (rect.height / 2);  // -1 .. 1
      const cdx = Math.max(-1.5, Math.min(1.5, dx));
      const cdy = Math.max(-1.5, Math.min(1.5, dy));
      // Rotate around X by Y-distance, around Y by negative X-distance
      const rotX = (cdy * -8).toFixed(2);
      const rotY = (cdx * 10).toFixed(2);
      card.style.setProperty('--tilt-x', `${rotX}deg`);
      card.style.setProperty('--tilt-y', `${rotY}deg`);
    });
  };

  window.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = (e.clientY / window.innerHeight) * 2 - 1;
    absMouseX = e.clientX;
    absMouseY = e.clientY;
    if (!raf) raf = requestAnimationFrame(flush);
  });
  window.addEventListener('mouseleave', () => {
    mouseX = 0; mouseY = 0;
    document.querySelectorAll(TILTABLE_SELECTOR).forEach((card) => {
      card.style.setProperty('--tilt-x', '0deg');
      card.style.setProperty('--tilt-y', '0deg');
    });
    if (!raf) raf = requestAnimationFrame(flush);
  });
}

// --- Provider marks (abstract monochrome glyphs) --------------------------
// Inspired by each provider's brand language but kept geometric/abstract so
// they read as a family in the tile grid.
const PROVIDER_MARKS = {
  anthropic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/>
  </svg>`,
  openai: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/>
    <circle cx="12" cy="12" r="3" fill="currentColor"/>
  </svg>`,
  gemini: `<svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C12 7 13 11 22 12C13 13 12 17 12 22C12 17 11 13 2 12C11 11 12 7 12 2Z"/>
  </svg>`,
  'openai-compatible': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <circle cx="6" cy="6" r="2.4" fill="currentColor"/>
    <circle cx="18" cy="6" r="2.4" fill="currentColor"/>
    <circle cx="12" cy="18" r="2.4" fill="currentColor"/>
    <line x1="6" y1="6" x2="18" y2="6"/>
    <line x1="6" y1="6" x2="12" y2="18"/>
    <line x1="18" y1="6" x2="12" y2="18"/>
  </svg>`,
};

const ICON_CHEVRON = `<svg class="provider-chevron" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <path d="M4 6l4 4 4-4"/>
</svg>`;

// --- Screen transitions ----------------------------------------------------
function show(screenId) {
  for (const id of ['splash', 'onboarding', 'home']) {
    $(id).classList.toggle('hidden', id !== screenId);
  }
  $('decor-layer')?.classList.toggle('hidden', screenId !== 'home');
  // HUD is loud during onboarding, dimmed in the dashboard
  const hud = $('hud');
  if (hud) {
    hud.classList.toggle('dimmed', screenId === 'home');
    hud.classList.toggle('hidden', screenId === 'splash');
  }
}

// --- HUD helpers ----------------------------------------------------------
const PANE_STAGE_LABELS = {
  welcome:  'INIT · GREETING',
  name:     'INIT · IDENTITY',
  presence: 'INIT · MORPHOGENESIS',
  connect:  'INIT · COGNITION',
};
function setHudStage(paneName) {
  const el = $('hud-stage');
  if (el && PANE_STAGE_LABELS[paneName]) el.textContent = PANE_STAGE_LABELS[paneName];
}
function startHudClock() {
  const el = $('hud-time');
  if (!el) return;
  const tick = () => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    el.textContent = `${hh}:${mm}:${ss}`;
  };
  tick();
  setInterval(tick, 1000);
}

// --- Onboarding pane router ------------------------------------------------
const PANES = ['welcome', 'name', 'theme', 'presence', 'connect'];
let currentPaneIdx = 0;

function gotoPane(idx) {
  if (idx < 0 || idx >= PANES.length) return;
  const next = PANES[idx];

  for (const el of qsa('.pane')) {
    const isNext = el.dataset.pane === next;
    if (isNext) {
      el.classList.remove('exiting');
      el.classList.add('active');
    } else if (el.classList.contains('active')) {
      el.classList.remove('active');
      el.classList.add('exiting');
    }
  }
  currentPaneIdx = idx;
  $('progress').style.width = `${((idx + 1) / PANES.length) * 100}%`;

  // Lazy-mount presence previews on first arrival; pause when leaving
  if (next === 'presence') startPresencePreviews();
  else stopPresencePreviews();

  // Re-trigger headline reveal on each pane entry
  const nextPane = qs(`.pane[data-pane="${next}"]`);
  const headline = nextPane?.querySelector('.headline');
  if (headline) revealHeadline(headline);
  setHudStage(next);

  setTimeout(() => {
    const firstInput = nextPane?.querySelector('input, .btn-primary');
    firstInput?.focus({ preventScroll: true });
  }, 380);
}

// Split a headline into per-character spans with staggered fade-in.
// Idempotent — keeps the original text on the element so we can re-trigger.
function revealHeadline(el) {
  if (!el) return;
  const text = el.dataset.text || el.textContent;
  if (!el.dataset.text) el.dataset.text = text;
  el.innerHTML = '';
  // 32ms stagger feels deliberate without being slow. Whole reveal completes
  // in ~520ms + N*32ms — for "Welcome." (8 chars) that's ~775ms total.
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ') {
      el.appendChild(document.createTextNode(' '));
      continue;
    }
    const span = document.createElement('span');
    span.className = 'reveal-char';
    span.textContent = ch;
    span.style.animationDelay = `${i * 32}ms`;
    el.appendChild(span);
  }
}

// --- Avatar (home) ---------------------------------------------------------
function ensureAvatarRenderer() {
  if (state.avatarRenderer) return state.avatarRenderer;
  const canvas = $('avatar-canvas');
  state.avatarRenderer = new MemojiRenderer(canvas, {
    preset: state.avatarStyle || 'nova',
    color: state.avatarColor || 'lilac',
    fpsCap: 60,
  });
  state.avatarRenderer.start();
  return state.avatarRenderer;
}

function ensureOrbRenderer() {
  if (state.orbRenderer) return state.orbRenderer;
  const canvas = $('chat-send-canvas');
  if (!canvas) return null;
  state.orbRenderer = new MemojiRenderer(canvas, {
    preset: state.avatarStyle || 'nova',
    color: state.avatarColor || 'lilac',
    fpsCap: 60,
  });
  state.orbRenderer.start();
  return state.orbRenderer;
}

function setAvatarPreset(name) {
  state.avatarStyle = name;
  if (state.avatarRenderer) state.avatarRenderer.setPreset(name);
  if (state.orbRenderer) state.orbRenderer.setPreset(name);
}

let avatarResetTimer = null;
let personaVisualState = 'idle';
let personaSpeaking = false;

function applyPersonaVisualState(next) {
  personaVisualState = next;

  const avatar = $('avatar');
  if (avatar) avatar.dataset.state = next;

  const orb = $('chat-form');
  if (orb) {
    orb.dataset.activity = next;
    orb.classList.toggle('generating', next === 'thinking' || next === 'building');
  }

  if (!personaSpeaking) {
    state.avatarRenderer?.setState(next);
    state.orbRenderer?.setState(next);
  }
}

function setAvatarState(next, holdMs) {
  applyPersonaVisualState(next);
  if (avatarResetTimer) clearTimeout(avatarResetTimer);
  if (holdMs) {
    avatarResetTimer = setTimeout(() => {
      applyPersonaVisualState('idle');
    }, holdMs);
  }
}

function setPersonaSpeaking(on) {
  personaSpeaking = !!on;
  $('chat-form')?.classList.toggle('speaking', personaSpeaking);
  $('avatar')?.classList.toggle('speaking', personaSpeaking);

  const next = personaSpeaking ? 'speaking' : personaVisualState;
  state.avatarRenderer?.setState(next);
  state.orbRenderer?.setState(next);
}

function setXmlGenerating(on, tagName = '') {
  const orb = $('chat-form');
  if (!orb) return;
  orb.classList.toggle('xml-generating', !!on);
  if (on && tagName) orb.dataset.xmlTag = tagName;
  else delete orb.dataset.xmlTag;
}

function setAvatarLayout(populated) {
  const av = $('avatar');
  av.classList.toggle('avatar-center', !populated);
  av.classList.toggle('avatar-corner', populated);
  av.classList.toggle('avatar-hidden', populated);
  av.setAttribute('aria-hidden', populated ? 'true' : 'false');
  av.tabIndex = populated ? -1 : 0;
}

// --- Presence picker -------------------------------------------------------
function buildPresenceCards() {
  const grid = $('presence-grid');
  if (!grid) return;
  grid.innerHTML = '';
  state.presencePreviews = [];

  PRESET_NAMES.forEach((name) => {
    const meta = PRESET_LABELS[name];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'presence-card';
    card.dataset.preset = name;
    if (name === state.avatarStyle) card.classList.add('selected');

    const wrap = document.createElement('div');
    wrap.className = 'presence-canvas-wrap';
    // Canvas renderer — abstract presence (particles / curves / rings)
    const canvas = document.createElement('canvas');
    canvas.className = 'presence-preview-canvas';
    wrap.appendChild(canvas);

    const labelEl = document.createElement('span');
    labelEl.className = 'presence-card-label';
    labelEl.textContent = meta.name;
    const subEl = document.createElement('span');
    subEl.className = 'presence-card-sub';
    subEl.textContent = meta.description;

    card.append(wrap, labelEl, subEl);
    grid.append(card);

    const renderer = new MemojiRenderer(canvas, {
      preset: name,
      color: state.avatarColor,
      fpsCap: 30,
    });
    state.presencePreviews.push({ card, renderer, name });

    card.addEventListener('click', () => {
      qsa('.presence-card', grid).forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      setAvatarPreset(name);
    });
  });
}

function buildColorPicker() {
  const root = $('color-picker');
  if (!root) return;
  root.innerHTML = '';

  COLOR_NAMES.forEach((name) => {
    const meta = COLORS[name];
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'color-swatch';
    swatch.dataset.color = name;
    swatch.style.setProperty('--swatch', meta.hex);
    swatch.title = meta.label;
    swatch.setAttribute('aria-label', meta.label);
    if (name === state.avatarColor) swatch.classList.add('selected');

    swatch.addEventListener('click', () => {
      qsa('.color-swatch', root).forEach((s) => s.classList.remove('selected'));
      swatch.classList.add('selected');
      setAvatarColor(name);
    });

    root.appendChild(swatch);
  });
}

function setAvatarColor(name) {
  if (!COLORS[name]) return;
  state.avatarColor = name;
  applyAvatarColorVar(name);
  pushColorToAmbient(name);
  for (const p of state.presencePreviews) p.renderer.setColor(name);
  state.avatarRenderer?.setColor(name);
  state.orbRenderer?.setColor(name);
}

function startPresencePreviews() {
  for (const p of state.presencePreviews) p.renderer.start();
}
function stopPresencePreviews() {
  for (const p of state.presencePreviews) p.renderer.stop();
}

// --- Chat log --------------------------------------------------------------
function appendBubble(role, text) {
  const log = $('chat-log');
  const bubble = document.createElement('div');
  bubble.className = `bubble ${role}`;
  bubble.textContent = text;
  log.appendChild(bubble);
  while (log.children.length > 6) log.removeChild(log.firstChild);
  setTimeout(() => bubble.classList.add('fade'), 12000);
  setTimeout(() => bubble.remove(), 13000);
}

// --- Greeting --------------------------------------------------------------
function showGreeting(name) {
  const g = $('greeting');
  if (desktopItems().length > 0) { g.classList.remove('visible'); return; }
  g.textContent = `I'm ${name}. Tell me what you need.`;
  requestAnimationFrame(() => g.classList.add('visible'));
}
function dismissGreeting() {
  $('greeting').classList.remove('visible');
}

// --- Widget rendering ------------------------------------------------------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Feather-style line glyphs for the client-side fallback. Mirrors the
// server's GLYPH_LIB (kept small here — the server is the primary path; this
// only fires when /api/widgets responded before backfill, or for never-saved
// data). Rendered with currentColor so the tile tints them.
const CLIENT_GLYPHS = {
  shapes: '<path d="M5 21h14M12 3l4 7H8z"/><circle cx="6" cy="16" r="3"/><rect x="14" y="13" width="6" height="6" rx="1"/>',
  plane:  '<path d="M3 13l3 1 3-3 7 6 2-1-4-9 5-3-1-2-13 6-4-2-1 1 3 4-2 2z"/>',
  clock:  '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check:  '<path d="M9 11l3 3 8-8"/><path d="M20 12v5a3 3 0 01-3 3H7a3 3 0 01-3-3V7a3 3 0 013-3h7"/>',
  music:  '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/>',
  bolt:   '<path d="M13 2L3 14h7l-1 8 10-12h-7z"/>',
};
function pickClientGlyph(w) {
  const n = String(w?.name || '').toLowerCase();
  if (/(flight|plane|travel|trip)/.test(n)) return 'plane';
  if (/(clock|timer|stopwatch|calendar|schedule)/.test(n)) return 'clock';
  if (/(todo|task|check|done)/.test(n)) return 'check';
  if (/(music|song|track|audio)/.test(n)) return 'music';
  if (/(search|find|lookup)/.test(n)) return 'search';
  if (/(quick|launch|spark|fast)/.test(n)) return 'bolt';
  return 'shapes';
}

// Build the inner thumbnail markup for a tile. Format priority:
//   1. Inline SVG (starts with `<svg`)            → drawn directly
//   2. Inline HTML doc (starts with `<!doctype`/`<html`/multi-tag) →
//                                                    sandboxed srcdoc iframe
//   3. HTTPS image URL                              → <img>
//   4. Vector-glyph fallback (Feather-style line icon, NEVER emoji)
function buildTileThumbnail(w) {
  const t = typeof w.thumbnail === 'string' ? w.thumbnail.trim() : '';
  if (t.startsWith('<svg') || /^<svg\b/i.test(t)) {
    const svg = t.replace(/^<svg\b/i, '<svg class="tile-svg"');
    return `<div class="tile-thumb">${svg}</div>`;
  }
  // Inline HTML preview: sandboxed iframe, scripts allowed but no same-origin
  // so it can't reach our window. Strict CSP applied via the tile-preview
  // host endpoint? For now, srcdoc with sandbox.
  if (/^<!doctype\s+html|^<html\b|<body\b/i.test(t)) {
    return `<div class="tile-thumb"><iframe class="tile-thumb-html" sandbox="allow-scripts" srcdoc="${escapeAttr(t)}" loading="lazy" title="${escapeAttr(w.name || 'Widget preview')}"></iframe></div>`;
  }
  if (/^https:\/\//i.test(t)) {
    return `<div class="tile-thumb"><div class="tile-thumb-img"><img src="${escapeAttr(t)}" alt="" loading="lazy" /></div></div>`;
  }
  const path = CLIENT_GLYPHS[pickClientGlyph(w)] || CLIENT_GLYPHS.shapes;
  return `<div class="tile-thumb"><svg class="tile-glyph-fallback" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg></div>`;
}

const WIDGET_CELL = 96;
const WIDGET_GAP = 12;
const WIDGET_UNIT = WIDGET_CELL + WIDGET_GAP;
const WIDGET_LAYOUT_KEY = 'bor.widget-layout.v1';
const WIDGET_SIZES = {
  '1x1': { cols: 1, rows: 1 },
  '2x1': { cols: 2, rows: 1 },
  '1x2': { cols: 1, rows: 2 },
  '2x2': { cols: 2, rows: 2 },
  '2x3': { cols: 2, rows: 3 },
  '3x2': { cols: 3, rows: 2 },
};

function desktopItems() {
  return [...state.systemApps, ...state.widgets];
}

function normalizeWidgetSize(size) {
  return WIDGET_SIZES[size] ? size : '2x2';
}

function widgetSizePx(size) {
  const def = WIDGET_SIZES[normalizeWidgetSize(size)];
  const fallback = {
    width: def.cols * WIDGET_CELL + (def.cols - 1) * WIDGET_GAP,
    height: def.rows * WIDGET_CELL + (def.rows - 1) * WIDGET_GAP,
  };
  return fallback;
}

function widgetLayoutSizePx(size, layout = null) {
  const fallback = widgetSizePx(size);
  const bounds = getDesktopBounds();
  const maxWidth = Math.max(WIDGET_CELL, bounds.right - bounds.left);
  const maxHeight = Math.max(WIDGET_CELL, bounds.bottom - bounds.top);
  const width = Number(layout?.width);
  const height = Number(layout?.height);
  return {
    width: Math.round(Math.max(WIDGET_CELL, Math.min(maxWidth, Number.isFinite(width) ? width : fallback.width))),
    height: Math.round(Math.max(WIDGET_CELL, Math.min(maxHeight, Number.isFinite(height) ? height : fallback.height))),
  };
}

function getDesktopBounds() {
  const mobile = window.innerWidth <= 600;
  return {
    left: mobile ? 16 : 44,
    top: mobile ? 76 : 88,
    right: Math.max(180, window.innerWidth - (mobile ? 16 : 28)),
    bottom: Math.max(220, window.innerHeight - (mobile ? 84 : 132)),
  };
}

function clampWidgetLayout(layout, size) {
  const dims = widgetLayoutSizePx(size, layout);
  const bounds = getDesktopBounds();
  const next = {
    x: Math.round(Math.max(bounds.left, Math.min(bounds.right - dims.width, Number(layout?.x) || bounds.left))),
    y: Math.round(Math.max(bounds.top, Math.min(bounds.bottom - dims.height, Number(layout?.y) || bounds.top))),
  };
  if (Number.isFinite(Number(layout?.width))) next.width = dims.width;
  if (Number.isFinite(Number(layout?.height))) next.height = dims.height;
  return next;
}

function snapWidgetLayout(layout, size) {
  const bounds = getDesktopBounds();
  const snapped = {
    ...layout,
    x: bounds.left + Math.round((Number(layout?.x) - bounds.left) / WIDGET_UNIT) * WIDGET_UNIT,
    y: bounds.top + Math.round((Number(layout?.y) - bounds.top) / WIDGET_UNIT) * WIDGET_UNIT,
  };
  return clampWidgetLayout(snapped, size);
}

function widgetBox(widget, layout = widget.layout, size = widget.size) {
  const pos = clampWidgetLayout(layout, size);
  const dims = widgetLayoutSizePx(size, pos);
  return {
    id: widget.id,
    left: pos.x,
    top: pos.y,
    right: pos.x + dims.width,
    bottom: pos.y + dims.height,
    width: dims.width,
    height: dims.height,
  };
}

function widgetBoxesOverlap(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function findFreeWidgetLayout(size, excludeIds = new Set(), layout = null) {
  const dims = widgetLayoutSizePx(size, layout);
  const bounds = getDesktopBounds();
  const occupied = desktopItems()
    .filter((w) => w?.layout && !excludeIds.has(w.id))
    .map((w) => widgetBox(w));

  for (let y = bounds.top; y <= bounds.bottom - dims.height; y += WIDGET_UNIT) {
    for (let x = bounds.left; x <= bounds.right - dims.width; x += WIDGET_UNIT) {
      const candidate = { left: x, top: y, right: x + dims.width, bottom: y + dims.height };
      if (!occupied.some((box) => widgetBoxesOverlap(candidate, box))) return { x, y };
    }
  }
  return clampWidgetLayout({ x: bounds.left, y: bounds.top }, size);
}

function loadLocalWidgetLayout(id) {
  try {
    const all = JSON.parse(localStorage.getItem(WIDGET_LAYOUT_KEY) || '{}');
    const layout = all?.[id];
    if (layout && Number.isFinite(Number(layout.x)) && Number.isFinite(Number(layout.y))) return layout;
  } catch {}
  return null;
}

function saveLocalWidgetLayout(id, layout) {
  try {
    const all = JSON.parse(localStorage.getItem(WIDGET_LAYOUT_KEY) || '{}');
    all[id] = layout;
    localStorage.setItem(WIDGET_LAYOUT_KEY, JSON.stringify(all));
  } catch {}
}

async function patchWidgetManifest(id, patch) {
  const system = state.systemApps.find((app) => app.id === id);
  const url = system ? `/api/system-apps/${encodeURIComponent(id)}` : `/api/widgets/${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => ({}));
  const next = body.manifest || body.app;
  if (next) {
    const collection = system ? state.systemApps : state.widgets;
    const idx = collection.findIndex((item) => item.id === id);
    if (idx >= 0) {
      Object.assign(collection[idx], next);
      return collection[idx];
    }
    return next;
  }
  return null;
}

function applyTileGeometry(tile, widget) {
  const size = normalizeWidgetSize(widget.size);
  const layout = clampWidgetLayout(widget.layout, size);
  const dims = widgetLayoutSizePx(size, layout);
  tile.dataset.size = size;
  tile.style.left = `${layout.x}px`;
  tile.style.top = `${layout.y}px`;
  tile.style.width = `${dims.width}px`;
  tile.style.height = `${dims.height}px`;
}

function ensureWidgetLayouts({ persistMissing = true } = {}) {
  for (const widget of desktopItems()) {
    widget.size = normalizeWidgetSize(widget.size);
    const local = loadLocalWidgetLayout(widget.id);
    const existing = widget.layout || local;
    if (existing && Number.isFinite(Number(existing.x)) && Number.isFinite(Number(existing.y))) {
      widget.layout = clampWidgetLayout(existing, widget.size);
    } else {
      widget.layout = findFreeWidgetLayout(widget.size);
      if (persistMissing) {
        patchWidgetManifest(widget.id, { layout: widget.layout, size: widget.size }).catch(() => {});
      }
    }
    saveLocalWidgetLayout(widget.id, widget.layout);
  }
}

function nearestWidgetSize(width, height) {
  let best = '2x2';
  let bestScore = Infinity;
  for (const [size, def] of Object.entries(WIDGET_SIZES)) {
    const dims = {
      width: def.cols * WIDGET_CELL + (def.cols - 1) * WIDGET_GAP,
      height: def.rows * WIDGET_CELL + (def.rows - 1) * WIDGET_GAP,
    };
    const score = Math.abs(width - dims.width) + Math.abs(height - dims.height);
    if (score < bestScore) {
      best = size;
      bestScore = score;
    }
  }
  return best;
}

function findSwapTarget(tile, pointerX, pointerY, draggedId) {
  const direct = qsa('.tile', $('grid'))
    .filter((candidate) => candidate !== tile && candidate.dataset.id !== draggedId)
    .find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return pointerX >= rect.left && pointerX <= rect.right && pointerY >= rect.top && pointerY <= rect.bottom;
    });
  if (direct) return direct;

  const draggedRect = tile.getBoundingClientRect();
  let best = null;
  let bestArea = 0;
  for (const candidate of qsa('.tile', $('grid'))) {
    if (candidate === tile || candidate.dataset.id === draggedId) continue;
    const rect = candidate.getBoundingClientRect();
    const x = Math.max(0, Math.min(draggedRect.right, rect.right) - Math.max(draggedRect.left, rect.left));
    const y = Math.max(0, Math.min(draggedRect.bottom, rect.bottom) - Math.max(draggedRect.top, rect.top));
    const area = x * y;
    if (area > bestArea) {
      best = candidate;
      bestArea = area;
    }
  }
  return bestArea > 1200 ? best : null;
}

function clearSwapTarget() {
  qsa('.tile.swap-target', $('grid')).forEach((tile) => tile.classList.remove('swap-target'));
}

function pushOverlappingWidgets(sourceId) {
  const moved = [];
  const protectedIds = new Set([sourceId]);
  const items = desktopItems();
  for (let pass = 0; pass < items.length; pass += 1) {
    const protectedBoxes = desktopItems()
      .filter((widget) => protectedIds.has(widget.id))
      .map((widget) => widgetBox(widget));
    const hit = desktopItems().find((widget) => {
      if (protectedIds.has(widget.id)) return false;
      const box = widgetBox(widget);
      return protectedBoxes.some((protectedBox) => widgetBoxesOverlap(box, protectedBox));
    });
    if (!hit) break;
    hit.layout = {
      ...hit.layout,
      ...findFreeWidgetLayout(hit.size, new Set([hit.id]), hit.layout),
    };
    moved.push(hit);
    protectedIds.add(hit.id);
  }
  return moved;
}

function wireTileDrag(tile, widget) {
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  let moved = false;
  let activeSwap = null;

  const finish = async (e) => {
    if (pointerId == null || e.pointerId !== pointerId) return;
    try { tile.releasePointerCapture(pointerId); } catch {}
    pointerId = null;
    tile.classList.remove('dragging');
    clearSwapTarget();

    if (!moved) return;
    tile.dataset.suppressClick = '1';
    window.setTimeout(() => { tile.dataset.suppressClick = '0'; }, 0);

    const targetWidget = activeSwap ? desktopItems().find((w) => w.id === activeSwap.dataset.id) : null;
    if (targetWidget) {
      const draggedLayout = { ...widget.layout };
      widget.layout = clampWidgetLayout(targetWidget.layout, widget.size);
      targetWidget.layout = clampWidgetLayout(draggedLayout, targetWidget.size);
      applyTileGeometry(tile, widget);
      applyTileGeometry(activeSwap, targetWidget);
      saveLocalWidgetLayout(widget.id, widget.layout);
      saveLocalWidgetLayout(targetWidget.id, targetWidget.layout);
      await Promise.all([
        patchWidgetManifest(widget.id, { layout: widget.layout, size: widget.size }),
        patchWidgetManifest(targetWidget.id, { layout: targetWidget.layout, size: targetWidget.size }),
      ]);
      return;
    }

    widget.layout = snapWidgetLayout({
      x: startLeft + e.clientX - startX,
      y: startTop + e.clientY - startY,
      width: widget.layout?.width,
      height: widget.layout?.height,
    }, widget.size);
    applyTileGeometry(tile, widget);
    saveLocalWidgetLayout(widget.id, widget.layout);
    await patchWidgetManifest(widget.id, { layout: widget.layout, size: widget.size });
  };

  tile.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.tile-delete, .tile-resize-handle')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = Number.parseFloat(tile.style.left) || 0;
    startTop = Number.parseFloat(tile.style.top) || 0;
    moved = false;
    activeSwap = null;
    tile.setPointerCapture(pointerId);
  });

  tile.addEventListener('pointermove', (e) => {
    if (pointerId == null || e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < 5) return;
    moved = true;
    tile.classList.add('dragging');
    const next = clampWidgetLayout({ x: startLeft + dx, y: startTop + dy }, widget.size);
    tile.style.left = `${next.x}px`;
    tile.style.top = `${next.y}px`;

    const target = findSwapTarget(tile, e.clientX, e.clientY, widget.id);
    if (target !== activeSwap) {
      clearSwapTarget();
      activeSwap = target;
      activeSwap?.classList.add('swap-target');
    }
  });

  tile.addEventListener('pointerup', finish);
  tile.addEventListener('pointercancel', finish);
}

function wireTileResize(tile, widget) {
  const handle = tile.querySelector('.tile-resize-handle');
  if (!handle) return;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let startWidth = 0;
  let startHeight = 0;
  let startLayout = null;
  let moved = false;

  const finish = async (e) => {
    if (pointerId == null || e.pointerId !== pointerId) return;
    try { handle.releasePointerCapture(pointerId); } catch {}
    pointerId = null;
    tile.classList.remove('resizing');
    if (!moved) return;
    widget.layout = clampWidgetLayout(widget.layout, widget.size);
    const pushed = pushOverlappingWidgets(widget.id);
    applyTileGeometry(tile, widget);
    for (const movedWidget of pushed) {
      const movedTile = qsa('.tile', $('grid')).find((candidate) => candidate.dataset.id === movedWidget.id);
      if (movedTile) applyTileGeometry(movedTile, movedWidget);
      saveLocalWidgetLayout(movedWidget.id, movedWidget.layout);
    }
    saveLocalWidgetLayout(widget.id, widget.layout);
    await Promise.all([
      patchWidgetManifest(widget.id, { layout: widget.layout, size: widget.size }),
      ...pushed.map((movedWidget) => patchWidgetManifest(movedWidget.id, { layout: movedWidget.layout, size: movedWidget.size })),
    ]);
  };

  handle.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    const rect = tile.getBoundingClientRect();
    startWidth = rect.width;
    startHeight = rect.height;
    startLayout = { ...(widget.layout || {}) };
    moved = false;
    tile.classList.add('resizing');
    handle.setPointerCapture(pointerId);
  });

  handle.addEventListener('pointermove', (e) => {
    if (pointerId == null || e.pointerId !== pointerId) return;
    const bounds = getDesktopBounds();
    const maxWidth = Math.max(WIDGET_CELL, bounds.right - Number(startLayout?.x || widget.layout?.x || bounds.left));
    const maxHeight = Math.max(WIDGET_CELL, bounds.bottom - Number(startLayout?.y || widget.layout?.y || bounds.top));
    const width = Math.max(WIDGET_CELL, Math.min(maxWidth, startWidth + e.clientX - startX));
    const height = Math.max(WIDGET_CELL, Math.min(maxHeight, startHeight + e.clientY - startY));
    const nextSize = nearestWidgetSize(width, height);
    moved = true;
    widget.size = nextSize;
    widget.layout = clampWidgetLayout({
      ...(startLayout || widget.layout || {}),
      width,
      height,
    }, widget.size);
    applyTileGeometry(tile, widget);
  });

  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
}

function renderWidgets() {
  const grid = $('grid');
  grid.innerHTML = '';
  ensureWidgetLayouts();

  for (const w of desktopItems()) {
    const tile = document.createElement('article');
    tile.className = `tile${w.system ? ' system-tile' : ''}`;
    tile.dataset.id = w.id;
    if (w.system) tile.dataset.systemApp = w.appType || w.id;
    applyTileGeometry(tile, w);

    tile.innerHTML = `
      ${buildTileThumbnail(w)}
      <span class="tile-name">${escapeHtml(w.name || 'Widget')}</span>
      ${w.system ? '' : `<button class="tile-delete" type="button" aria-label="Delete widget">
        <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M3 3l6 6M9 3l-6 6"></path>
        </svg>
      </button>`}
      <button class="tile-resize-handle" type="button" aria-label="Resize widget" title="Resize"></button>
    `;

    tile.addEventListener('click', (e) => {
      if (tile.dataset.suppressClick === '1') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.target.closest('.tile-delete')) {
        e.stopPropagation();
        deleteWidget(w.id);
      } else if (e.target.closest('.tile-resize-handle')) {
        e.stopPropagation();
      } else if (w.system) {
        openSystemApp(w);
      } else {
        openWidgetModal(w);
      }
    });

    wireTileDrag(tile, w);
    wireTileResize(tile, w);
    grid.appendChild(tile);
  }

  setAvatarLayout(desktopItems().length > 0);
  if (desktopItems().length === 0 && state.config?.aiName) showGreeting(state.config.aiName);
  else dismissGreeting();
}

let widgetResizeTimer = null;
function refreshWidgetGeometry() {
  ensureWidgetLayouts({ persistMissing: false });
  for (const tile of qsa('.tile', $('grid'))) {
    const widget = desktopItems().find((w) => w.id === tile.dataset.id);
    if (widget) applyTileGeometry(tile, widget);
  }
}
window.addEventListener('resize', () => {
  window.clearTimeout(widgetResizeTimer);
  widgetResizeTimer = window.setTimeout(refreshWidgetGeometry, 120);
});

// --- Widget modal ----------------------------------------------------------
let modalCurrent = null;
function openWidgetModal(widget) {
  modalCurrent = widget;
  $('modal-title').textContent = widget.name;
  const iframe = $('modal-iframe');
  // Register the iframe with the host bridge BEFORE setting src so the
  // listener accepts postMessages as soon as the widget mounts.
  installBridge(iframe, widget.id);
  iframe.src = `/widgets/${widget.id}/widget.html`;
  $('widget-modal').classList.remove('hidden');
  // Memory: log the open event so the LLM sees usage on the next turn.
  // Fire-and-forget; the user doesn't need to wait on this.
  fetch('/api/memory/event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'widget.open', id: widget.id, name: widget.name }),
  }).catch(() => {});
}
function closeWidgetModal() {
  $('widget-modal').classList.add('hidden');
  const iframe = $('modal-iframe');
  iframe.removeAttribute('data-wid');
  iframe.src = 'about:blank';
  modalCurrent = null;
}

async function deleteWidget(id) {
  const ok = confirm('Delete this widget?');
  if (!ok) return;
  await fetch(`/api/widgets/${encodeURIComponent(id)}`, { method: 'DELETE' });
  state.widgets = state.widgets.filter((w) => w.id !== id);
  renderWidgets();
  if (modalCurrent?.id === id) closeWidgetModal();
}

// --- System apps -----------------------------------------------------------
function closeSystemModal() {
  $('system-modal')?.classList.add('hidden');
  $('system-actions').innerHTML = '';
  $('system-body').innerHTML = '';
}

function openSystemApp(app) {
  $('system-title').textContent = app.name || 'App';
  $('system-actions').innerHTML = '';
  $('system-body').innerHTML = '';
  $('system-modal').classList.remove('hidden');
  if (app.appType === 'browser') renderBrowserApp();
  else renderFilesApp(state.filesPath || '/');
}

function fileParent(path) {
  const clean = String(path || '/').replace(/\/+$/g, '') || '/';
  if (clean === '/') return '/';
  const parts = clean.split('/').filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join('/')}` : '/';
}

function fileName(path) {
  return String(path || '/').split('/').filter(Boolean).pop() || 'Files';
}

function fileExt(path) {
  const name = fileName(path).toLowerCase();
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1) : '';
}

function fileRawUrl(path, download = false) {
  return `/api/files/raw?path=${encodeURIComponent(path)}${download ? '&download=1' : ''}`;
}

async function renderFilesApp(path = '/') {
  state.filesPath = path;
  const body = $('system-body');
  body.innerHTML = '<div class="system-loading">Loading files...</div>';
  let data;
  try {
    const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
    data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unable to list files');
  } catch (err) {
    body.innerHTML = `<div class="system-error">${escapeHtml(err.message)}</div>`;
    return;
  }

  state.filesSelection = null;
  body.innerHTML = `
    <div class="files-app">
      <aside class="files-sidebar">
        ${['Desktop', 'Documents', 'Downloads', 'Pictures'].map((name) => `
          <button class="files-place" type="button" data-path="/${name}">${escapeHtml(name)}</button>
        `).join('')}
      </aside>
      <section class="files-main">
        <div class="files-toolbar">
          <button class="files-nav" type="button" data-up="1" ${path === '/' ? 'disabled' : ''}>Up</button>
          <div class="files-path">${escapeHtml(data.path || '/')}</div>
          <button class="files-action" type="button" data-act="folder">New Folder</button>
          <button class="files-action" type="button" data-act="upload">Upload</button>
          <button class="files-action" type="button" data-act="rename" disabled>Rename</button>
          <button class="files-action" type="button" data-act="move" disabled>Move</button>
          <button class="files-action" type="button" data-act="download" disabled>Download</button>
          <button class="files-action danger" type="button" data-act="delete" disabled>Delete</button>
          <input class="files-upload-input" type="file" multiple />
        </div>
        <div class="files-content">
          <div class="files-list">
            ${(data.items || []).map((entry) => `
              <button class="file-row" type="button" data-path="${escapeAttr(entry.path)}" data-kind="${escapeAttr(entry.kind)}">
                <span class="file-icon">${entry.kind === 'dir' ? 'DIR' : 'FILE'}</span>
                <span class="file-name">${escapeHtml(entry.name)}</span>
                <span class="file-meta">${entry.kind === 'file' && entry.size != null ? `${Math.round(entry.size / 1024)} KB` : ''}</span>
              </button>
            `).join('') || '<div class="files-empty">No files</div>'}
          </div>
          <div class="files-preview" id="files-preview">
            <div class="files-preview-empty">Select a file</div>
          </div>
        </div>
      </section>
    </div>
  `;

  qsa('.files-place', body).forEach((button) => {
    button.addEventListener('click', () => renderFilesApp(button.dataset.path));
  });
  qs('[data-up="1"]', body)?.addEventListener('click', () => renderFilesApp(fileParent(state.filesPath)));

  const setActions = () => {
    const selected = state.filesSelection;
    qsa('[data-act="rename"], [data-act="move"], [data-act="delete"]', body).forEach((button) => { button.disabled = !selected; });
    qs('[data-act="download"]', body).disabled = !selected || selected.kind !== 'file';
  };

  qsa('.file-row', body).forEach((row) => {
    row.addEventListener('click', () => {
      qsa('.file-row.selected', body).forEach((el) => el.classList.remove('selected'));
      row.classList.add('selected');
      state.filesSelection = { path: row.dataset.path, kind: row.dataset.kind };
      setActions();
      renderFilePreview(state.filesSelection);
    });
    row.addEventListener('dblclick', () => {
      if (row.dataset.kind === 'dir') renderFilesApp(row.dataset.path);
    });
  });

  qs('[data-act="folder"]', body)?.addEventListener('click', async () => {
    const name = prompt('Folder name');
    if (!name) return;
    await fetch('/api/files/folder', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: state.filesPath, name }),
    });
    renderFilesApp(state.filesPath);
  });

  const uploadInput = qs('.files-upload-input', body);
  qs('[data-act="upload"]', body)?.addEventListener('click', () => uploadInput.click());
  uploadInput?.addEventListener('change', async () => {
    const fd = new FormData();
    fd.append('path', state.filesPath);
    for (const file of uploadInput.files || []) fd.append('file', file, file.name);
    await fetch('/api/files/upload', { method: 'POST', body: fd });
    uploadInput.value = '';
    renderFilesApp(state.filesPath);
  });

  qs('[data-act="rename"]', body)?.addEventListener('click', async () => {
    if (!state.filesSelection) return;
    const name = prompt('New name', fileName(state.filesSelection.path));
    if (!name) return;
    await fetch('/api/files/rename', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: state.filesSelection.path, name }),
    });
    renderFilesApp(state.filesPath);
  });

  qs('[data-act="move"]', body)?.addEventListener('click', async () => {
    if (!state.filesSelection) return;
    const to = prompt('Move to folder path', state.filesPath);
    if (!to) return;
    await fetch('/api/files/move', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from: state.filesSelection.path, to }),
    });
    renderFilesApp(state.filesPath);
  });

  qs('[data-act="download"]', body)?.addEventListener('click', () => {
    if (state.filesSelection?.kind === 'file') window.location.href = fileRawUrl(state.filesSelection.path, true);
  });

  qs('[data-act="delete"]', body)?.addEventListener('click', async () => {
    if (!state.filesSelection) return;
    if (!confirm(`Delete ${fileName(state.filesSelection.path)}?`)) return;
    await fetch(`/api/files?path=${encodeURIComponent(state.filesSelection.path)}`, { method: 'DELETE' });
    renderFilesApp(state.filesPath);
  });
}

async function renderFilePreview(selection) {
  const preview = $('files-preview');
  if (!preview || !selection) return;
  if (selection.kind === 'dir') {
    preview.innerHTML = `
      <div class="files-preview-card">
        <div class="files-preview-kind">Folder</div>
        <div class="files-preview-name">${escapeHtml(fileName(selection.path))}</div>
        <button class="files-action" type="button">Open</button>
      </div>
    `;
    qs('button', preview).addEventListener('click', () => renderFilesApp(selection.path));
    return;
  }
  const ext = fileExt(selection.path);
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
    preview.innerHTML = `<img class="files-preview-image" src="${escapeAttr(fileRawUrl(selection.path))}" alt="" />`;
    return;
  }
  if (ext === 'pdf') {
    preview.innerHTML = `<iframe class="files-preview-frame" src="${escapeAttr(fileRawUrl(selection.path))}" title="${escapeAttr(fileName(selection.path))}"></iframe>`;
    return;
  }
  if (['txt', 'md', 'json', 'csv', 'js', 'css', 'html'].includes(ext)) {
    preview.innerHTML = '<pre class="files-preview-text">Loading...</pre>';
    const res = await fetch(fileRawUrl(selection.path));
    const text = await res.text();
    qs('.files-preview-text', preview).textContent = text.slice(0, 120000);
    return;
  }
  preview.innerHTML = `
    <div class="files-preview-card">
      <div class="files-preview-kind">File</div>
      <div class="files-preview-name">${escapeHtml(fileName(selection.path))}</div>
      <a class="files-download-link" href="${escapeAttr(fileRawUrl(selection.path, true))}">Download</a>
    </div>
  `;
}

async function renderBrowserApp() {
  const body = $('system-body');
  body.innerHTML = '<div class="system-loading">Checking browser...</div>';

  const loadStatus = async () => {
    const res = await fetch('/api/browser/status');
    return await res.json();
  };
  const draw = (status) => {
    body.innerHTML = `
      <div class="browser-app">
        <form class="browser-launch">
          <input class="browser-url" type="text" placeholder="Search or enter URL" value="${escapeAttr(status.lastUrl || '')}" />
          <button class="btn btn-primary" type="submit">Open</button>
        </form>
        <div class="browser-status ${status.available ? 'ready' : 'error'}">
          <span>${status.available ? 'Ready' : 'Unavailable'}</span>
          <strong>${escapeHtml(status.executablePath || status.error || 'No browser found')}</strong>
        </div>
        <div class="browser-details">
          <div><span>Profile</span><code>${escapeHtml(status.profilePath || '')}</code></div>
          <div><span>Downloads</span><code>${escapeHtml(status.downloadsPath || '')}</code></div>
          <div><span>State</span><code>${status.running ? 'running' : 'not tracked'}</code></div>
        </div>
        <div class="browser-actions">
          <button class="btn btn-secondary" type="button" data-browser-act="close">Close tracked browser</button>
          <button class="btn btn-secondary" type="button" data-browser-act="reset">Reset browser profile</button>
        </div>
      </div>
    `;
    qs('.browser-launch', body).addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = qs('.browser-url', body).value.trim();
      const res = await fetch('/api/browser/open', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      draw(await res.json());
    });
    qs('[data-browser-act="close"]', body).addEventListener('click', async () => {
      const res = await fetch('/api/browser/close', { method: 'POST' });
      draw(await res.json());
    });
    qs('[data-browser-act="reset"]', body).addEventListener('click', async () => {
      if (!confirm('Reset the BOR browser profile?')) return;
      const res = await fetch('/api/browser/reset-profile', { method: 'POST' });
      draw(await res.json());
    });
  };
  draw(await loadStatus());
}

// --- Chat ------------------------------------------------------------------

/**
 * Voice a single <say> SSE event. Each call queues an utterance with the
 * supplied tone/decibels/rate/pitch — the speaker engine handles per-tone
 * presets and inter-utterance coalescing.
 */
function speakOne({ tone = 'warm', text, decibels, rate, pitch }) {
  if (typeof text !== 'string' || !text.trim()) return;
  appendBubble('ai', text); // accessibility/debug — log stays display:none
  if (typeof window === 'undefined' || !window.speechSynthesis || !speaker.enabled) return;
  setPersonaSpeaking(true);
  speaker.speak(
    [{ kind: 'spoken', text: text.trim(), tone, volume: typeof decibels === 'number' ? Math.max(0.05, Math.min(1, (decibels - 20) / 70)) : null, rate, pitch }],
    { onAllDone: () => setPersonaSpeaking(false) },
  );
}

async function refetchWidgets() {
  const [appRes, wRes] = await Promise.all([
    fetch('/api/system-apps'),
    fetch('/api/widgets'),
  ]);
  const apps = await appRes.json();
  const w = await wRes.json();
  state.systemApps = apps.apps || [];
  state.widgets = w.widgets || [];
  renderWidgets();
}

async function sendChat(text) {
  if (state.pending || !text.trim()) return;
  state.pending = true;
  $('chat-form')?.classList.add('pending');
  setXmlGenerating(false);
  $('chat-input').disabled = true;
  $('chat-send').disabled = true;

  appendBubble('user', text);
  state.messages.push({ role: 'user', content: text });
  dismissGreeting();
  setAvatarState('thinking');
  speaker.cancel(); // hush any prior utterance the moment the user speaks
  setPersonaSpeaking(false);

  try {
    const { recorded } = await runChatTurn({
      messages: state.messages,
      handlers: {
        // Streamed-tag hint — show "building" if the partial tag is a widget op.
        tag_start: ({ name }) => {
          setXmlGenerating(true, name);
          if (name === 'create_widget' || name === 'update_widget') {
            setAvatarState('building');
          } else {
            setAvatarState('thinking');
          }
        },

        // Voice
        say: (p) => speakOne(p),

        // Widgets
        create_widget: ({ manifest }) => {
          if (!manifest) return;
          state.widgets.push(manifest);
          renderWidgets();
          setAvatarState('success', 1200);
        },
        update_widget: () => { refetchWidgets(); setAvatarState('success', 1000); },
        delete_widget: () => { refetchWidgets(); },

        // Theme / system
        set_theme: ({ config }) => { if (config) applyConfigSnapshot(config); },
        reset_chat: () => { state.messages = []; $('chat-log').innerHTML = ''; },

        // Filesystem / shell — reflect in the chat log so the user sees what ran.
        read_file: ({ path, bytes, truncated }) => appendBubble('system', `read ${path} (${bytes}B${truncated ? ', truncated' : ''})`),
        write_file: ({ path, bytes }) => appendBubble('system', `wrote ${path} (${bytes}B)`),
        delete_file: ({ path }) => appendBubble('system', `deleted ${path}`),
        list_files: ({ path, count }) => appendBubble('system', `listed ${path} (${count})`),
        execute_command: ({ cmd, exitCode, stdout, stderr }) => {
          const head = `$ ${cmd}  [exit ${exitCode ?? 'killed'}]`;
          appendBubble('system', head);
          if (stdout?.trim()) appendBubble('system', stdout.trim().slice(0, 800));
          if (stderr?.trim()) appendBubble('system', `stderr: ${stderr.trim().slice(0, 400)}`);
        },

        // Errors
        tool_error: ({ tag, reason }) => {
          setAvatarState('error', 1800);
          appendBubble('system', `${tag}: ${reason}`);
        },

        done: () => {
          setXmlGenerating(false);
          setAvatarState('idle');
        },
      },
    });

    // Persist the assistant's recorded turn (XML tags + tool_results) so the
    // next user message sees a structured history of what actually happened.
    if (recorded) state.messages.push({ role: 'assistant', content: recorded });
  } catch (err) {
    console.error(err);
    setAvatarState('error', 2200);
    appendBubble('system', err.message);
  } finally {
    state.pending = false;
    $('chat-form')?.classList.remove('pending', 'generating', 'xml-generating');
    setXmlGenerating(false);
    $('chat-input').disabled = false;
    $('chat-send').disabled = false;
    if ($('chat-form').dataset.state === 'expanded') $('chat-input').focus();
  }
}

// --- Provider drawer rendering --------------------------------------------
function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function isConnected(cfg) {
  if (!cfg?.providers) return false;
  return Object.values(cfg.providers).some((p) => p?.configured);
}

function showOnboardingError(msg) {
  const el = $('onboarding-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}
function clearOnboardingError() {
  $('onboarding-error').classList.add('hidden');
}

function drawerHtml(prov, status) {
  const isCompat = prov.id === 'openai-compatible';
  const presets = prov.presets || [];
  const connected = !!status?.configured;

  const parts = [];

  if (prov.id === 'openai') {
    parts.push(`
      <div class="provider-auth-choice" role="group" aria-label="OpenAI connection type">
        <div class="provider-auth-option selected">
          <span class="provider-auth-title">API key</span>
          <span class="provider-auth-sub">Supported for this OS</span>
        </div>
        <button type="button" class="provider-auth-option unavailable" data-act="chatgpt-subscription" aria-disabled="true">
          <span class="provider-auth-title">ChatGPT subscription</span>
          <span class="provider-auth-sub">Not available for API billing</span>
        </button>
      </div>
      <p class="drawer-hint">To mirror ChatGPT behavior, use an OpenAI API key and choose a ChatGPT model such as ChatGPT latest in the model menu.</p>
    `);
  }

  if (isCompat && presets.length) {
    parts.push(`
      <div class="field">
        <span class="field-label">Quick presets</span>
        <div class="preset-row">
          ${presets.map((p) => `<button type="button" class="preset-chip" data-preset='${escapeAttr(JSON.stringify(p))}'>${escapeHtml(p.name)}</button>`).join('')}
        </div>
      </div>
    `);
  }

  if (prov.needsBaseUrl) {
    parts.push(`
      <div class="field">
        <label class="field-label">Base URL</label>
        <input class="field-input" type="text" data-field="baseUrl" value="${escapeAttr(status?.baseUrl || '')}" placeholder="https://api.example.com/v1" autocomplete="off" spellcheck="false" />
      </div>
    `);
  }

  const hasModelDropdown = prov.models.length > 0;
  const hasModelInput = isCompat;
  const showModel = hasModelDropdown || hasModelInput;

  if (showModel) {
    parts.push(`
      <div class="provider-fields-row">
        <div class="field">
          <label class="field-label">API key</label>
          <input class="field-input" type="password" data-field="apiKey" placeholder="${status?.hasApiKey ? '••••••••' : escapeAttr(prov.keyHint || '')}" autocomplete="off" spellcheck="false" />
        </div>
        <div class="field">
          <label class="field-label">Model</label>
          ${hasModelDropdown
            ? `<select class="field-select" data-field="model">
                ${prov.models.map((m) => {
                  const selected = (status?.model === m.id) || (!status?.model && m.id === prov.defaultModel);
                  const label = m.note ? `${m.label} — ${m.note}` : m.label;
                  return `<option value="${escapeAttr(m.id)}" ${selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
                }).join('')}
              </select>`
            : `<input class="field-input" type="text" data-field="model" value="${escapeAttr(status?.model || '')}" placeholder="e.g. llama-3.3-70b" autocomplete="off" spellcheck="false" />`}
        </div>
      </div>
    `);
  } else {
    parts.push(`
      <div class="field">
        <label class="field-label">API key</label>
        <input class="field-input" type="password" data-field="apiKey" placeholder="${status?.hasApiKey ? '••••••••' : escapeAttr(prov.keyHint || '')}" autocomplete="off" spellcheck="false" />
      </div>
    `);
  }

  if (prov.id === 'openai') {
    parts.push(`<p class="drawer-hint">ChatGPT Free, Plus, Pro, Business, and Enterprise plans are billed separately from API usage. This connection needs API Platform billing.</p>`);
  } else if (prov.id === 'openai-compatible') {
    parts.push(`<p class="drawer-hint">Works with anything that speaks the OpenAI Chat Completions schema. Local servers (Ollama, LM Studio) usually need no key.</p>`);
  }

  const isDefault = state.config?.defaultProvider === prov.id;
  const actions = [];
  actions.push(`<a class="signup-link" href="${escapeAttr(prov.signupUrl)}" target="_blank" rel="noopener">${prov.id === 'openai' ? 'Create API key' : 'Get a key'}</a>`);
  if (prov.id === 'openai') {
    actions.push(`<a class="signup-link" href="https://platform.openai.com/account/billing/overview" target="_blank" rel="noopener">API billing</a>`);
  }
  actions.push(`<span class="spacer"></span>`);
  if (connected && !isDefault) {
    actions.push(`<button type="button" class="btn btn-secondary" data-act="default">Make default</button>`);
  }
  if (connected) {
    actions.push(`<button type="button" class="btn btn-secondary" data-act="remove">Remove</button>`);
  }
  actions.push(`<button type="button" class="btn btn-primary" data-act="save">${connected ? 'Update' : 'Connect'}</button>`);

  parts.push(`<div class="drawer-actions">${actions.join('')}</div>`);

  return parts.join('');
}

function renderProviderGrid() {
  const grid = $('provider-grid');
  if (!grid) return;
  grid.innerHTML = '';

  for (const prov of state.providerCatalog) {
    const status = state.config?.providers?.[prov.id];
    const connected = !!status?.configured;
    const isDefault = state.config?.defaultProvider === prov.id;

    const card = document.createElement('div');
    card.className = 'provider-card';
    card.dataset.providerId = prov.id;
    if (connected) card.classList.add('connected');
    if (state.expandedProvider === prov.id) card.classList.add('expanded');

    const statusLabel = connected
      ? (status.model ? `Connected · ${escapeHtml(status.model)}` : 'Connected')
      : 'Not connected';

    card.innerHTML = `
      <button class="provider-head" type="button">
        <span class="provider-mark">${PROVIDER_MARKS[prov.id] || ''}</span>
        <span class="provider-info">
          <span class="provider-name">
            ${escapeHtml(prov.label)}
            ${isDefault ? '<span class="default-pill">Default</span>' : ''}
          </span>
          <span class="provider-status">
            <span class="status-dot"></span>
            ${statusLabel}
          </span>
        </span>
        ${ICON_CHEVRON}
      </button>
      <div class="provider-drawer">
        <div class="provider-drawer-inner">
          <div class="provider-drawer-content">${drawerHtml(prov, status)}</div>
        </div>
      </div>
    `;
    grid.appendChild(card);

    card.querySelector('.provider-head').addEventListener('click', () => {
      state.expandedProvider = state.expandedProvider === prov.id ? null : prov.id;
      renderProviderGrid();
    });

    wireDrawer(card, prov);
  }

  $('connect-finish').disabled = !isConnected(state.config);
}

function wireDrawer(card, prov) {
  const drawer = card.querySelector('.provider-drawer-content');
  if (!drawer) return;

  drawer.querySelectorAll('.preset-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      try {
        const p = JSON.parse(chip.dataset.preset);
        const baseInput = drawer.querySelector('[data-field="baseUrl"]');
        const modelInput = drawer.querySelector('[data-field="model"]');
        if (baseInput) baseInput.value = p.baseUrl;
        if (modelInput && !modelInput.value) modelInput.value = p.exampleModel;
      } catch {}
    });
  });

  drawer.querySelector('[data-act="chatgpt-subscription"]')?.addEventListener('click', () => {
    showOnboardingError('ChatGPT subscriptions cannot power API usage for third-party apps. Use an OpenAI API key, then choose a ChatGPT model in the model menu.');
  });

  const saveBtn = drawer.querySelector('[data-act="save"]');
  saveBtn?.addEventListener('click', async () => {
    const apiKey = drawer.querySelector('[data-field="apiKey"]')?.value.trim();
    const model = drawer.querySelector('[data-field="model"]')?.value.trim();
    const baseUrl = drawer.querySelector('[data-field="baseUrl"]')?.value.trim();

    const status = state.config?.providers?.[prov.id];
    const hasExisting = !!status?.hasApiKey;

    if (prov.id !== 'openai-compatible' && !apiKey && !hasExisting) {
      showOnboardingError(`Add an API key for ${prov.label}.`);
      return;
    }
    if (prov.id === 'openai-compatible') {
      if (!baseUrl) { showOnboardingError('Base URL is required for custom endpoints.'); return; }
      if (!model) { showOnboardingError('Model name is required.'); return; }
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
      const entry = {};
      if (apiKey) entry.apiKey = apiKey;
      if (model) entry.model = model;
      if (baseUrl) entry.baseUrl = baseUrl;

      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ providers: { [prov.id]: entry } }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Failed: ${res.status}`);
      }
      state.config = (await res.json()).config;
      state.expandedProvider = null;
      clearOnboardingError();
      renderProviderGrid();
    } catch (err) {
      showOnboardingError(err.message);
      saveBtn.disabled = false;
      saveBtn.textContent = hasExisting ? 'Update' : 'Connect';
    }
  });

  drawer.querySelector('[data-act="remove"]')?.addEventListener('click', async () => {
    if (!confirm(`Remove ${prov.label}? Your key will be deleted from this device.`)) return;
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ providers: { [prov.id]: null } }),
    });
    state.config = (await res.json()).config;
    state.expandedProvider = null;
    clearOnboardingError();
    renderProviderGrid();
  });

  drawer.querySelector('[data-act="default"]')?.addEventListener('click', async () => {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ defaultProvider: prov.id }),
    });
    state.config = (await res.json()).config;
    renderProviderGrid();
  });
}

// --- Onboarding wiring -----------------------------------------------------
function wireOnboarding() {
  $('welcome-next').addEventListener('click', () => gotoPane(1));

  $('name-back').addEventListener('click', () => gotoPane(0));
  $('name-next').addEventListener('click', () => {
    const name = $('ai-name').value.trim() || 'Atlas';
    state.config = { ...(state.config || {}), aiName: name };
    gotoPane(2);
  });

  $('theme-back').addEventListener('click', () => gotoPane(1));
  $('theme-next').addEventListener('click', () => {
    state.config = { ...(state.config || {}), baseTheme: state.baseTheme };
    gotoPane(3);
  });

  $('presence-back').addEventListener('click', () => gotoPane(2));
  $('presence-next').addEventListener('click', () => {
    state.config = {
      ...(state.config || {}),
      avatarStyle: state.avatarStyle,
      avatarColor: state.avatarColor,
    };
    gotoPane(4);
  });

  $('connect-back').addEventListener('click', () => gotoPane(3));

  $('connect-finish').addEventListener('click', async () => {
    if (!isConnected(state.config)) {
      showOnboardingError('Connect at least one provider to continue.');
      return;
    }
    const btn = $('connect-finish');
    btn.disabled = true;
    btn.textContent = 'Starting…';
    try {
      // Persist name + avatar identity now that the user has fully committed
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          aiName: state.config?.aiName || $('ai-name').value.trim() || 'Atlas',
          avatarStyle: state.avatarStyle,
          avatarColor: state.avatarColor,
          baseTheme: state.baseTheme,
        }),
      });
      state.config = (await res.json()).config;
      enterHome();
    } catch (err) {
      showOnboardingError(err.message);
      btn.disabled = false;
      btn.textContent = 'Begin';
    }
  });

  $('ai-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('name-next').click(); }
  });

  // Build theme cards + presence cards + color picker once at boot
  buildThemeCards();
  applyAvatarColorVar(state.avatarColor);
  buildPresenceCards();
  buildColorPicker();
}

/**
 * Render the theme picker grid. Each card shows a palette strip + label +
 * tagline. Clicking a card hot-applies that base theme so the user can see
 * the rest of the onboarding flow in the chosen aesthetic before committing.
 */
function buildThemeCards() {
  const grid = $('theme-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const theme of publicThemeList()) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'theme-card';
    card.dataset.themeId = theme.id;
    card.role = 'radio';
    card.setAttribute('aria-checked', theme.id === state.baseTheme ? 'true' : 'false');
    if (theme.id === state.baseTheme) card.classList.add('selected');

    const swatches = theme.palettePreview
      .map((hex) => `<span class="theme-swatch" style="background:${hex}"></span>`)
      .join('');

    card.innerHTML = `
      <div class="theme-swatches">${swatches}</div>
      <div class="theme-meta">
        <span class="theme-label">${escapeHtml(theme.label)}</span>
        <span class="theme-tagline">${escapeHtml(theme.tagline)}</span>
      </div>
    `;

    card.addEventListener('click', () => {
      state.baseTheme = theme.id;
      applyBaseTheme(theme.id);
      for (const c of grid.querySelectorAll('.theme-card')) {
        const on = c.dataset.themeId === theme.id;
        c.classList.toggle('selected', on);
        c.setAttribute('aria-checked', on ? 'true' : 'false');
      }
    });

    grid.appendChild(card);
  }
}

// --- Home boot --------------------------------------------------------------
async function enterHome() {
  // Ensure renderer is alive before showing the home screen so we don't
  // get a blank avatar tile while it warms up.
  ensureAvatarRenderer();
  ensureOrbRenderer();
  setAvatarPreset(state.config?.avatarStyle || 'nova');

  await refetchWidgets();
  show('home');
  // Don't focus the chat input on entry — the orb starts collapsed and only
  // expands when the user clicks it (or hits ⌘K).
}

// --- Floating chat orb ----------------------------------------------------
//
// Single fixed element that doubles as: (1) a draggable send button when
// collapsed, (2) a pill-shaped chat input when expanded. Position persists
// in localStorage so it stays where the user last dragged it.

const ORB_KEY = 'bor.chat-orb.pos.v1';
const ORB_W = { collapsed: 52, expanded: 480 };
const ORB_H = { collapsed: 52, expanded: 56 };
const DRAG_THRESHOLD_PX = 4;

function clampToViewport(x, y, w, h) {
  return {
    x: Math.max(8, Math.min(window.innerWidth - w - 8, x)),
    y: Math.max(8, Math.min(window.innerHeight - h - 8, y)),
  };
}

function setOrbPosition(orb, x, y) {
  const w = orb.dataset.state === 'expanded' ? ORB_W.expanded : ORB_W.collapsed;
  const h = orb.dataset.state === 'expanded' ? ORB_H.expanded : ORB_H.collapsed;
  const c = clampToViewport(x, y, w, h);
  orb.style.left = `${c.x}px`;
  orb.style.top = `${c.y}px`;
}

function loadOrbPosition() {
  try {
    const v = JSON.parse(localStorage.getItem(ORB_KEY));
    if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) return v;
  } catch {}
  // Default: bottom-right, comfortably inset
  return {
    x: window.innerWidth - ORB_W.collapsed - 28,
    y: window.innerHeight - ORB_H.collapsed - 28,
  };
}

function saveOrbPosition(x, y) {
  try { localStorage.setItem(ORB_KEY, JSON.stringify({ x, y })); } catch {}
}

function expandOrb() {
  const orb = $('chat-form');
  if (orb.dataset.state === 'expanded') return;
  // Anchor the orb's RIGHT edge in place; the pill grows leftward from it.
  const rect = orb.getBoundingClientRect();
  const newLeft = rect.right - ORB_W.expanded;
  orb.dataset.state = 'expanded';
  setOrbPosition(orb, newLeft, rect.top);
  setTimeout(() => $('chat-input').focus(), 80);
}

function collapseOrb() {
  const orb = $('chat-form');
  if (orb.dataset.state === 'collapsed') return;
  // Keep the send button (right edge) in the same spot when collapsing.
  const rect = orb.getBoundingClientRect();
  const newLeft = rect.right - ORB_W.collapsed;
  orb.dataset.state = 'collapsed';
  setOrbPosition(orb, newLeft, rect.top);
  saveOrbPosition(parseFloat(orb.style.left), parseFloat(orb.style.top));
  $('chat-input').blur();
}

function initChatOrb() {
  const orb = $('chat-form');
  const input = $('chat-input');
  ensureOrbRenderer();

  const pos = loadOrbPosition();
  setOrbPosition(orb, pos.x, pos.y);

  // Pointer-based drag w/ click-vs-drag detection. Listeners attach to the
  // ORB itself (the form) so events bubbled from any child — including the
  // send button — get caught. We capture the pointer once we cross the drag
  // threshold so off-element movement still tracks. The submit handler
  // dispatches the click intent based on collapsed/expanded state.
  let pointerId = null;
  let startX = 0, startY = 0;
  let orbStartX = 0, orbStartY = 0;
  let moved = false;
  let suppressNextSubmit = false;

  const onPointerDown = (e) => {
    if (orb.dataset.state !== 'collapsed') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return; // only primary
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    orbStartX = parseFloat(orb.style.left) || 0;
    orbStartY = parseFloat(orb.style.top) || 0;
    moved = false;
  };

  const onPointerMove = (e) => {
    if (pointerId === null || e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!moved && (dx * dx + dy * dy) > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
      moved = true;
      orb.classList.add('dragging');
      try { orb.setPointerCapture(pointerId); } catch {}
    }
    if (moved) {
      e.preventDefault();
      setOrbPosition(orb, orbStartX + dx, orbStartY + dy);
    }
  };

  const onPointerUp = (e) => {
    if (pointerId === null || e.pointerId !== pointerId) return;
    if (moved) {
      saveOrbPosition(parseFloat(orb.style.left), parseFloat(orb.style.top));
      orb.classList.remove('dragging');
      // Eat the click that browsers fire after pointerup so a drag doesn't
      // accidentally trigger expand on release.
      suppressNextSubmit = true;
      setTimeout(() => { suppressNextSubmit = false; }, 80);
      try { orb.releasePointerCapture(pointerId); } catch {}
    }
    pointerId = null;
  };

  orb.addEventListener('pointerdown', onPointerDown);
  orb.addEventListener('pointermove', onPointerMove);
  orb.addEventListener('pointerup', onPointerUp);
  orb.addEventListener('pointercancel', onPointerUp);

  // Form submit fires on send-button click AND Enter-key in input.
  // We dispatch based on state: collapsed click → expand; expanded → send.
  orb.addEventListener('submit', (e) => {
    e.preventDefault();
    if (suppressNextSubmit) { suppressNextSubmit = false; return; }
    if (orb.dataset.state === 'collapsed') {
      expandOrb();
      return;
    }
    const text = input.value;
    input.value = '';
    sendChat(text);
    collapseOrb();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      collapseOrb();
    }
  });

  document.addEventListener('pointerdown', (e) => {
    if (orb.dataset.state !== 'expanded') return;
    if (!orb.contains(e.target)) collapseOrb();
  });

  window.addEventListener('resize', () => {
    const x = parseFloat(orb.style.left) || 0;
    const y = parseFloat(orb.style.top) || 0;
    setOrbPosition(orb, x, y);
  });
}

function wireHome() {
  initChatOrb();

  $('avatar').addEventListener('click', () => expandOrb());

  $('widget-modal').addEventListener('click', (e) => {
    if (e.target.dataset.close) closeWidgetModal();
  });
  $('system-modal').addEventListener('click', (e) => {
    if (e.target.dataset.systemClose) closeSystemModal();
  });
  $('system-close').addEventListener('click', closeSystemModal);
  $('modal-delete').addEventListener('click', () => {
    if (modalCurrent) deleteWidget(modalCurrent.id);
  });

  $('reset-btn').addEventListener('click', async () => {
    const ok = confirm('Reset Bed of Roses? This deletes your config, providers, and all widgets.');
    if (!ok) return;
    for (const w of state.widgets) {
      await fetch(`/api/widgets/${encodeURIComponent(w.id)}`, { method: 'DELETE' });
    }
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reset: true }),
    });
    location.reload();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      expandOrb();
    }
    if (e.key === 'Escape' && !$('widget-modal').classList.contains('hidden')) {
      closeWidgetModal();
    }
    if (e.key === 'Escape' && !$('system-modal').classList.contains('hidden')) {
      closeSystemModal();
    }
  });
}

async function boot() {
  initAmbient();
  initParallax();
  startHudClock();
  wireOnboarding();
  wireHome();
  show('splash');

  const splashStarted = Date.now();
  let cfg = null;
  let providers = [];
  try {
    const [cfgRes, provRes] = await Promise.all([
      fetch('/api/config'),
      fetch('/api/providers'),
    ]);
    cfg = (await cfgRes.json()).config;
    providers = (await provRes.json()).providers || [];
  } catch { /* server not reachable yet */ }

  state.config = cfg;
  state.providerCatalog = providers;
  if (cfg?.aiName) $('ai-name').value = cfg.aiName;

  const elapsed = Date.now() - splashStarted;
  await new Promise((r) => setTimeout(r, Math.max(0, 1400 - elapsed)));

  // Hydrate identity from saved config (or defaults)
  state.avatarStyle = cfg?.avatarStyle || 'nova';
  state.avatarColor = cfg?.avatarColor || 'lilac';
  state.orbRenderer?.setPreset(state.avatarStyle);
  state.orbRenderer?.setColor(state.avatarColor);
  state.baseTheme = cfg?.baseTheme || DEFAULT_THEME;
  applyBaseTheme(state.baseTheme);
  applyAvatarColorVar(state.avatarColor);
  pushColorToAmbient(state.avatarColor);
  applyWallpaper(cfg?.wallpaper);
  state.decorations = Array.isArray(cfg?.decorations) ? cfg.decorations : [];
  renderDecorations(state.decorations);
  applyTheme(cfg?.theme);

  // "Connected" means at least one provider has a key (or baseUrl for compat)
  if (cfg?.defaultProvider && cfg.providers?.[cfg.defaultProvider]?.configured) {
    enterHome();
  } else {
    show('onboarding');
    renderProviderGrid();
    gotoPane(0);
  }
}

boot();
