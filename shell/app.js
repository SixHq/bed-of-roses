// Bed of Roses — display shell controller (v0.3)
// Four-pane onboarding (welcome → name → presence → connect), memoji-engine
// avatar on the homepage and live preview cards in the presence picker.

import {
  MemojiRenderer,
  COLORS,
  COLOR_NAMES,
} from '/memoji.js';
import { AmbientField } from '/ambient.js';
import { speaker } from '/speak.js';
import { runChatTurn } from '/protocol-client.js';
import { applyBaseTheme, publicThemeList, DEFAULT_THEME } from '/themes/index.js';
import { installBridge } from '/surface-bridge.js';

const $ = (id) => document.getElementById(id);
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const BASE_THEME_STORAGE_KEY = 'bor.baseTheme';
const IS_V2_HOST = new URLSearchParams(window.location.search).get('host') === 'v2';

const state = {
  config: null,
  systemApps: [],
  widgets: [],
  filesPath: 'device:/',
  filesSelection: null,
  filesContextMenu: null,
  fileContextRefs: [],
  filesBackStack: [],
  filesForwardStack: [],
  messages: [],
  pending: false,
  avatarStyle: 'nova',
  avatarColor: 'lilac',
  baseTheme: DEFAULT_THEME,   // active base theme id (bloom / cartoon-brutalist / …)
  decorations: [],
  avatarRenderer: null,
  presencePreviews: [],   // optional animated previews for themes that provide them
  providerCatalog: [],     // [{id, label, description, models, signupUrl, ...}]
  expandedProvider: null,  // id of currently-expanded drawer in connect pane
  buildTurnSeq: 0,
  thoughtText: '',
  thoughtTone: 'warm',
  thoughtTargetText: '',
  thoughtRenderedText: '',
  thoughtRenderFrame: 0,
  connectivity: {
    online: true,
    checking: true,
    error: null,
    checkedAt: null,
  },
};

function normalizeBaseTheme(id) {
  return publicThemeList().some((theme) => theme.id === id) ? id : DEFAULT_THEME;
}

function rememberedBaseTheme() {
  try {
    const id = localStorage.getItem(BASE_THEME_STORAGE_KEY);
    return id && normalizeBaseTheme(id);
  } catch {
    return null;
  }
}

function rememberBaseTheme(id) {
  try {
    localStorage.setItem(BASE_THEME_STORAGE_KEY, normalizeBaseTheme(id));
  } catch {}
}

function syncThemeSelection() {
  const grid = $('theme-grid');
  if (!grid) return;
  for (const card of qsa('.theme-card', grid)) {
    const on = card.dataset.themeId === state.baseTheme;
    card.classList.toggle('selected', on);
    card.setAttribute('aria-checked', on ? 'true' : 'false');
  }
}

function setBaseTheme(id, { persist = true } = {}) {
  const next = normalizeBaseTheme(id);
  state.baseTheme = next;
  applyBaseTheme(next);
  if (persist) rememberBaseTheme(next);
  syncThemeSelection();
  updatePresenceCopy();
  syncChatPresence();
  return next;
}

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
const DECORATION_DEFAULT_OPACITY = 0.22;
const DECORATION_MAX_OPACITY = 0.28;
const DECORATION_MIN_SIZE = 48;

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

    if (result.manual) {
      x = Math.max(DECORATION_EDGE, Math.min(window.innerWidth - width - DECORATION_EDGE, x));
      y = Math.max(DECORATION_EDGE, Math.min(window.innerHeight - height - DECORATION_EDGE, y));
      result.anchor = 'top-left';
      result.x = `${Math.round(x)}px`;
      result.y = `${Math.round(y)}px`;
      placed.push(decorationBox(result, x, y));
      return result;
    }

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

function effectiveDecorationOpacity(value) {
  const n = Number(value);
  const base = Number.isFinite(n) ? n : DECORATION_DEFAULT_OPACITY;
  return Math.max(0.08, Math.min(DECORATION_MAX_OPACITY, base));
}

function clampDecorationViewportPosition(left, top, width, height) {
  return {
    left: Math.max(DECORATION_EDGE, Math.min(window.innerWidth - width - DECORATION_EDGE, left)),
    top: Math.max(DECORATION_EDGE, Math.min(window.innerHeight - height - DECORATION_EDGE, top)),
  };
}

function sameDecoration(decoration, id, themeId) {
  return decoration?.id === id && String(decoration?.themeId || '') === String(themeId || '');
}

async function persistDecorations() {
  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decorations: state.decorations }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.config?.decorations) {
      state.config = data.config;
      state.decorations = data.config.decorations;
    }
  } catch (err) {
    console.warn('[decorations] persist failed', err);
  }
}

function updateDecoration(id, themeId, patch) {
  state.decorations = state.decorations.map((decoration) => (
    sameDecoration(decoration, id, themeId) ? { ...decoration, ...patch } : decoration
  ));
  if (state.config) state.config.decorations = state.decorations;
  persistDecorations();
}

function deleteDecoration(id, themeId) {
  state.decorations = state.decorations.filter((decoration) => !sameDecoration(decoration, id, themeId));
  if (state.config) state.config.decorations = state.decorations;
  renderDecorations(state.decorations);
  persistDecorations();
}

function wireDecorationInteractions(el, decoration) {
  const id = decoration.id;
  if (!id) return;
  const themeId = decoration.themeId || '';
  const resizeHandle = qs('.decoration-resize-handle', el);
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  let width = 0;
  let height = 0;
  let moved = false;

  const finish = (event) => {
    if (pointerId == null || event.pointerId !== pointerId) return;
    try { el.releasePointerCapture(pointerId); } catch {}
    pointerId = null;
    el.classList.remove('dragging');
    if (!moved) return;
    const left = Math.round(Number.parseFloat(el.style.left) || el.getBoundingClientRect().left);
    const top = Math.round(Number.parseFloat(el.style.top) || el.getBoundingClientRect().top);
    updateDecoration(id, themeId, {
      anchor: 'top-left',
      x: `${left}px`,
      y: `${top}px`,
      manual: true,
    });
  };

  el.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.decoration-delete, .decoration-resize-handle')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const rect = el.getBoundingClientRect();
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    width = rect.width;
    height = rect.height;
    moved = false;
    el.style.left = `${Math.round(startLeft)}px`;
    el.style.top = `${Math.round(startTop)}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.transform = `rotate(${decoration.rotate || '0deg'})`;
    try { el.setPointerCapture(pointerId); } catch {}
  });

  el.addEventListener('pointermove', (event) => {
    if (pointerId == null || event.pointerId !== pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < 4) return;
    moved = true;
    event.preventDefault();
    el.classList.add('dragging');
    const next = clampDecorationViewportPosition(startLeft + dx, startTop + dy, width, height);
    el.style.left = `${Math.round(next.left)}px`;
    el.style.top = `${Math.round(next.top)}px`;
  });

  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', finish);

  if (!resizeHandle) return;

  let resizePointerId = null;
  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeStartLeft = 0;
  let resizeStartTop = 0;
  let resizeStartWidth = 0;
  let resizeStartHeight = 0;
  let resizeMoved = false;

  const finishResize = (event) => {
    if (resizePointerId == null || event.pointerId !== resizePointerId) return;
    try { resizeHandle.releasePointerCapture(resizePointerId); } catch {}
    resizePointerId = null;
    el.classList.remove('resizing');
    if (!resizeMoved) return;
    const rect = el.getBoundingClientRect();
    updateDecoration(id, themeId, {
      anchor: 'top-left',
      x: `${Math.round(rect.left)}px`,
      y: `${Math.round(rect.top)}px`,
      width: `${Math.round(rect.width)}px`,
      height: `${Math.round(rect.height)}px`,
      manual: true,
    });
  };

  resizeHandle.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = el.getBoundingClientRect();
    resizePointerId = event.pointerId;
    resizeStartX = event.clientX;
    resizeStartY = event.clientY;
    resizeStartLeft = rect.left;
    resizeStartTop = rect.top;
    resizeStartWidth = rect.width;
    resizeStartHeight = rect.height;
    resizeMoved = false;
    el.style.left = `${Math.round(resizeStartLeft)}px`;
    el.style.top = `${Math.round(resizeStartTop)}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.transform = `rotate(${decoration.rotate || '0deg'})`;
    el.classList.add('resizing');
    try { resizeHandle.setPointerCapture(resizePointerId); } catch {}
  });

  resizeHandle.addEventListener('pointermove', (event) => {
    if (resizePointerId == null || event.pointerId !== resizePointerId) return;
    const dx = event.clientX - resizeStartX;
    const dy = event.clientY - resizeStartY;
    if (!resizeMoved && Math.hypot(dx, dy) < 3) return;
    resizeMoved = true;
    event.preventDefault();

    const maxWidth = Math.max(DECORATION_MIN_SIZE, window.innerWidth - resizeStartLeft - DECORATION_EDGE);
    const maxHeight = Math.max(DECORATION_MIN_SIZE, window.innerHeight - resizeStartTop - DECORATION_EDGE);
    let nextWidth = Math.max(DECORATION_MIN_SIZE, resizeStartWidth + dx);
    let nextHeight = Math.max(DECORATION_MIN_SIZE, resizeStartHeight + dy);

    if (!event.shiftKey) {
      const aspect = resizeStartWidth / Math.max(1, resizeStartHeight);
      if (Math.abs(dx) >= Math.abs(dy)) nextHeight = nextWidth / aspect;
      else nextWidth = nextHeight * aspect;
    }

    if (nextWidth > maxWidth) {
      nextWidth = maxWidth;
      if (!event.shiftKey) nextHeight = nextWidth / (resizeStartWidth / Math.max(1, resizeStartHeight));
    }
    if (nextHeight > maxHeight) {
      nextHeight = maxHeight;
      if (!event.shiftKey) nextWidth = nextHeight * (resizeStartWidth / Math.max(1, resizeStartHeight));
    }

    el.style.width = `${Math.round(nextWidth)}px`;
    el.style.height = `${Math.round(nextHeight)}px`;
  });

  resizeHandle.addEventListener('pointerup', finishResize);
  resizeHandle.addEventListener('pointercancel', finishResize);
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
    el.dataset.decorationId = d.id || '';
    el.dataset.themeId = d.themeId || '';
    el.dataset.drift = d.drift || 'none';
    el.style.width = d.width || '220px';
    el.style.height = d.height || '220px';
    const opacity = effectiveDecorationOpacity(d.opacity);
    el.style.setProperty('--decor-opacity', `${opacity}`);
    el.style.setProperty('--decor-hover-opacity', `${Math.min(0.34, opacity + 0.06)}`);
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
    img.draggable = false;
    el.appendChild(img);

    const deleteButton = document.createElement('button');
    deleteButton.className = 'decoration-delete';
    deleteButton.type = 'button';
    deleteButton.textContent = 'x';
    deleteButton.setAttribute('aria-label', `Delete ${d.name || d.id || 'decoration'}`);
    deleteButton.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
    });
    deleteButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteDecoration(d.id, d.themeId || '');
    });
    el.appendChild(deleteButton);

    const resizeButton = document.createElement('button');
    resizeButton.className = 'decoration-resize-handle';
    resizeButton.type = 'button';
    resizeButton.setAttribute('aria-label', `Resize ${d.name || d.id || 'decoration'}`);
    resizeButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    el.appendChild(resizeButton);

    wireDecorationInteractions(el, d);
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
    setBaseTheme(cfg.baseTheme);
    renderDecorations();
  }
  if (cfg.avatarStyle && cfg.avatarStyle !== state.avatarStyle) {
    state.avatarStyle = cfg.avatarStyle;
    state.avatarRenderer?.setPreset(cfg.avatarStyle);
    for (const p of state.presencePreviews) p.renderer?.setPreset(cfg.avatarStyle);
    syncPresenceSelection();
    syncChatPresence();
  }
  if (cfg.avatarColor && cfg.avatarColor !== state.avatarColor) {
    state.avatarColor = cfg.avatarColor;
    applyAvatarColorVar(cfg.avatarColor);
    pushColorToAmbient(cfg.avatarColor);
    state.avatarRenderer?.setColor(cfg.avatarColor);
    for (const p of state.presencePreviews) p.renderer?.setColor(cfg.avatarColor);
    syncChatPresence();
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
    for (const p of state.presencePreviews) p.renderer?.setParallax(mouseX, mouseY);

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
const PANES = ['welcome', 'name', 'theme', 'presence', 'tools', 'connect'];
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

  // Start or pause animated presence previews when a theme provides them.
  if (next === 'presence') startPresencePreviews();
  else stopPresencePreviews();

  // Probe browser-use status when the user lands on the tools pane.
  if (next === 'tools') refreshBrowserUseStatus(false);

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

function setAvatarPreset(name) {
  state.avatarStyle = name;
  if (state.avatarRenderer) state.avatarRenderer.setPreset(name);
  syncPresenceSelection();
  syncChatPresence();
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
const PRESENCE_PIXEL_POINTS = [
  [4, 2], [5, 2], [6, 2], [7, 2],
  [3, 3], [8, 3],
  [2, 4], [5, 4], [6, 4], [9, 4],
  [2, 5], [4, 5], [7, 5], [9, 5],
  [2, 6], [5, 6], [6, 6], [9, 6],
  [3, 7], [8, 7],
  [4, 8], [5, 8], [6, 8], [7, 8],
];

const PRESENCE_CHOICES = [
  {
    id: 'default',
    preset: 'nova',
    color: 'amber',
    labels: {
      default: '00 · default',
      'cartoon-brutalist': 'DEFAULT · SUN',
      'neo-brutalist': '00·DEFAULT',
      'pixel-crt': '00 · DEFAULT',
    },
    descriptions: {
      default: 'Bloom / ready',
      'cartoon-brutalist': 'Sunshine face',
      'neo-brutalist': 'Paper block',
      risograph: 'Pink + blue',
      'pixel-crt': 'Green phosphor',
    },
    vars: {
      '--presence-face': '#FFD93D',
      '--presence-neo': '#F4F2ED',
      '--presence-riso-a': '#FF48B0',
      '--presence-riso-b': '#3145C2',
      '--presence-liquid-1': '#FFB6E1',
      '--presence-liquid-2': '#FF7AB6',
      '--presence-liquid-3': '#7E1F88',
      '--presence-y2k-1': '#9ED6FF',
      '--presence-y2k-2': '#3BA8FF',
      '--presence-y2k-3': '#003FA8',
      '--presence-pixel': '#33FF66',
    },
  },
  {
    id: 'listening',
    preset: 'cipher',
    color: 'aurora',
    labels: {
      default: '01 · listening',
      'cartoon-brutalist': 'FLIRT · ROSE',
      'neo-brutalist': '01·HOT',
      'pixel-crt': '01 · LISTENING',
    },
    descriptions: {
      default: 'Fresh / heard',
      'cartoon-brutalist': 'Wink rose',
      'neo-brutalist': 'Hot accent',
      risograph: 'Yellow + pink',
      'pixel-crt': 'Amber trace',
    },
    vars: {
      '--presence-face': '#FF4FA3',
      '--presence-neo': '#FF3B00',
      '--presence-riso-a': '#FFE15B',
      '--presence-riso-b': '#FF48B0',
      '--presence-liquid-1': '#B6FFE5',
      '--presence-liquid-2': '#1E9F6B',
      '--presence-liquid-3': '#0A3C26',
      '--presence-y2k-1': '#D6FF9D',
      '--presence-y2k-2': '#5FC92F',
      '--presence-y2k-3': '#1F6005',
      '--presence-pixel': '#FFB000',
    },
  },
  {
    id: 'thinking',
    preset: 'aria',
    color: 'frost',
    labels: {
      default: '02 · thinking',
      'cartoon-brutalist': 'CALM · MINT',
      'neo-brutalist': '02·ACID',
      'pixel-crt': '02 · THINKING',
    },
    descriptions: {
      default: 'Cool / working',
      'cartoon-brutalist': 'Mint disc',
      'neo-brutalist': 'Acid block',
      risograph: 'Blue + teal',
      'pixel-crt': 'Cyan trace',
    },
    vars: {
      '--presence-face': '#5FE3A1',
      '--presence-neo': '#D6FF3B',
      '--presence-riso-a': '#3145C2',
      '--presence-riso-b': '#2BAA8E',
      '--presence-liquid-1': '#A9E0FF',
      '--presence-liquid-2': '#3C8BFF',
      '--presence-liquid-3': '#0E2A66',
      '--presence-y2k-1': '#CCF5FF',
      '--presence-y2k-2': '#00D5FF',
      '--presence-y2k-3': '#005A78',
      '--presence-pixel': '#00E0FF',
    },
  },
  {
    id: 'alert',
    preset: 'echo',
    color: 'ember',
    labels: {
      default: '03 · alert',
      'cartoon-brutalist': 'FOCUS · SKY',
      'neo-brutalist': '03·INK',
      'pixel-crt': '03 · ALERT',
    },
    descriptions: {
      default: 'Warm / attention',
      'cartoon-brutalist': 'Sky face',
      'neo-brutalist': 'Ink block',
      risograph: 'Red + yellow',
      'pixel-crt': 'Magenta trace',
    },
    vars: {
      '--presence-face': '#6BCEFF',
      '--presence-neo': '#0A0A0A',
      '--presence-riso-a': '#E53A22',
      '--presence-riso-b': '#FFE15B',
      '--presence-liquid-1': '#FFD58A',
      '--presence-liquid-2': '#FF7A2A',
      '--presence-liquid-3': '#7A2A00',
      '--presence-y2k-1': '#FFE0A1',
      '--presence-y2k-2': '#FF9C2E',
      '--presence-y2k-3': '#7A3300',
      '--presence-pixel': '#FF3B8B',
    },
  },
];

function presenceCopy(choice, field) {
  const theme = currentBaseTheme();
  const values = field === 'label' ? choice.labels : choice.descriptions;
  return values[theme] || values.default;
}

function updatePresenceCopy() {
  const grid = $('presence-grid');
  if (!grid) return;
  for (const card of qsa('.presence-card', grid)) {
    const choice = PRESENCE_CHOICES.find((entry) => entry.id === card.dataset.presenceState);
    if (!choice) continue;
    const label = qs('.presence-card-label', card);
    const sub = qs('.presence-card-sub', card);
    if (label) label.textContent = presenceCopy(choice, 'label');
    if (sub) sub.textContent = presenceCopy(choice, 'description');
    card.setAttribute('aria-label', `${presenceCopy(choice, 'label')}: ${presenceCopy(choice, 'description')}`);
  }
}

function syncPresenceSelection() {
  const grid = $('presence-grid');
  if (!grid) return;
  let selected = null;
  for (const card of qsa('.presence-card', grid)) {
    const on = card.dataset.preset === state.avatarStyle;
    card.classList.toggle('selected', on);
    card.setAttribute('aria-checked', on ? 'true' : 'false');
    if (on) selected = card;
  }
  if (!selected) {
    const fallback = qs('.presence-card', grid);
    fallback?.classList.add('selected');
    fallback?.setAttribute('aria-checked', 'true');
  }
  syncChatPresence();
}

function presencePrimitiveMarkup() {
  return `
    <span class="presence-face" aria-hidden="true">
      <span class="presence-face-eyes"><span></span><span></span></span>
    </span>
    <span class="presence-orb" aria-hidden="true"></span>
    <span class="presence-block" aria-hidden="true"></span>
    <span class="presence-stamp" aria-hidden="true"><span></span><span></span></span>
    <span class="presence-pixel-face" aria-hidden="true">
      ${PRESENCE_PIXEL_POINTS.map(([x, y]) => `<i style="--x:${x};--y:${y}"></i>`).join('')}
    </span>
  `;
}

function applyPresenceChoiceVars(node, choice) {
  if (!node || !choice) return;
  node.dataset.presenceState = choice.id;
  node.dataset.preset = choice.preset;
  node.dataset.color = choice.color;
  for (const [key, value] of Object.entries(choice.vars)) {
    node.style.setProperty(key, value);
  }
}

function currentPresenceChoice() {
  return PRESENCE_CHOICES.find((choice) => choice.preset === state.avatarStyle)
    || PRESENCE_CHOICES.find((choice) => choice.color === state.avatarColor)
    || PRESENCE_CHOICES[0];
}

function syncChatPresence() {
  const host = $('chat-send-presence');
  if (!host) return;
  if (!host.dataset.ready) {
    host.innerHTML = presencePrimitiveMarkup();
    host.dataset.ready = 'true';
  }
  const choice = currentPresenceChoice();
  applyPresenceChoiceVars(host, choice);
  applyPresenceChoiceVars($('chat-send'), choice);
}

function buildPresenceCards() {
  const grid = $('presence-grid');
  if (!grid) return;
  grid.innerHTML = '';
  state.presencePreviews = [];

  PRESENCE_CHOICES.forEach((choice) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'presence-card';
    applyPresenceChoiceVars(card, choice);
    card.setAttribute('role', 'radio');

    const wrap = document.createElement('div');
    wrap.className = 'presence-canvas-wrap presence-visual';
    wrap.innerHTML = presencePrimitiveMarkup();

    const labelEl = document.createElement('span');
    labelEl.className = 'presence-card-label';
    const subEl = document.createElement('span');
    subEl.className = 'presence-card-sub';

    card.append(wrap, labelEl, subEl);
    grid.append(card);

    card.addEventListener('click', () => {
      setAvatarPreset(choice.preset);
      setAvatarColor(choice.color);
      syncPresenceSelection();
    });
  });

  updatePresenceCopy();
  syncPresenceSelection();
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
  for (const p of state.presencePreviews) p.renderer?.setColor(name);
  state.avatarRenderer?.setColor(name);
  syncChatPresence();
  const picker = $('color-picker');
  if (picker) {
    qsa('.color-swatch', picker).forEach((swatch) => {
      swatch.classList.toggle('selected', swatch.dataset.color === name);
    });
  }
}

function startPresencePreviews() {
  for (const p of state.presencePreviews) p.renderer?.start();
}
function stopPresencePreviews() {
  for (const p of state.presencePreviews) p.renderer?.stop();
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

function positionThoughtBubble() {
  const bubble = $('thought-bubble');
  const orb = $('chat-form');
  if (!bubble || !orb || bubble.classList.contains('hidden')) return;

  const orbRect = orb.getBoundingClientRect();
  const bubbleRect = bubble.getBoundingClientRect();
  const margin = 12;
  const gap = 14;
  const maxLeft = Math.max(margin, window.innerWidth - bubbleRect.width - margin);
  const left = Math.max(margin, Math.min(maxLeft, orbRect.right - bubbleRect.width));
  let top = orbRect.top - bubbleRect.height - gap;
  if (top < margin) top = Math.min(window.innerHeight - bubbleRect.height - margin, orbRect.bottom + gap);

  bubble.style.left = `${left}px`;
  bubble.style.top = `${Math.max(margin, top)}px`;
}

function normalizeThoughtText(text) {
  const clean = typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : '';
  return clean;
}

function normalizeThoughtDelta(text) {
  return typeof text === 'string' ? text.replace(/\s+/g, ' ') : '';
}

function paintThoughtBubbleText(text, tone = state.thoughtTone || 'warm') {
  const bubble = $('thought-bubble');
  const bubbleText = $('thought-bubble-text');
  if (!bubble || !bubbleText) return;

  bubble.dataset.tone = tone;
  bubbleText.textContent = text;
  bubble.classList.remove('hidden');
  requestAnimationFrame(positionThoughtBubble);
}

function stopThoughtBubbleRender() {
  if (state.thoughtRenderFrame) {
    cancelAnimationFrame(state.thoughtRenderFrame);
    state.thoughtRenderFrame = 0;
  }
}

function scheduleThoughtBubbleRender() {
  if (state.thoughtRenderFrame) return;
  const step = () => {
    const target = state.thoughtTargetText || '';
    let current = state.thoughtRenderedText || '';

    if (current !== target) {
      if (!target.startsWith(current)) {
        current = target.slice(0, Math.min(target.length, current.length));
      }
      const remaining = Math.max(0, target.length - current.length);
      const chars = Math.max(1, Math.min(7, Math.ceil(remaining / 18)));
      state.thoughtRenderedText = current + target.slice(current.length, current.length + chars);
      state.thoughtText = state.thoughtRenderedText;
      paintThoughtBubbleText(state.thoughtRenderedText, state.thoughtTone);
      state.thoughtRenderFrame = requestAnimationFrame(step);
      return;
    }

    state.thoughtText = target;
    state.thoughtRenderFrame = 0;
    requestAnimationFrame(positionThoughtBubble);
  };

  state.thoughtRenderFrame = requestAnimationFrame(step);
}

function showThoughtBubble(text, { append = true, tone = 'warm', stream = false } = {}) {
  const clean = normalizeThoughtText(text);
  if (!clean) return;

  const currentTarget = state.thoughtTargetText || state.thoughtText || '';
  state.thoughtTargetText = append && currentTarget ? `${currentTarget} ${clean}` : clean;
  state.thoughtTone = tone;
  if (stream) {
    scheduleThoughtBubbleRender();
    return;
  }

  stopThoughtBubbleRender();
  state.thoughtRenderedText = state.thoughtTargetText;
  state.thoughtText = state.thoughtTargetText;
  paintThoughtBubbleText(state.thoughtText, tone);
}

function streamThoughtBubbleDelta(text, { tone = 'warm' } = {}) {
  const delta = normalizeThoughtDelta(text);
  if (!delta || (!delta.trim() && !state.thoughtTargetText)) return;
  state.thoughtTone = tone;
  state.thoughtTargetText = `${state.thoughtTargetText || ''}${delta}`.replace(/\s+/g, ' ').trimStart();
  scheduleThoughtBubbleRender();
}

function thoughtBubbleTargetEndsWith(text) {
  const clean = normalizeThoughtText(text);
  if (!clean) return true;
  const target = normalizeThoughtText(state.thoughtTargetText || state.thoughtText || '');
  return target.endsWith(clean);
}

function completeThoughtBubbleText(text, { tone = 'warm' } = {}) {
  const clean = normalizeThoughtText(text);
  if (!clean || thoughtBubbleTargetEndsWith(clean)) return;
  const target = normalizeThoughtText(state.thoughtTargetText || state.thoughtText || '');
  if (target && clean.startsWith(target)) {
    state.thoughtTone = tone;
    state.thoughtTargetText = clean;
    scheduleThoughtBubbleRender();
    return;
  }
  showThoughtBubble(clean, { append: true, tone, stream: true });
}

function hideThoughtBubble({ clear = true } = {}) {
  const bubble = $('thought-bubble');
  const bubbleText = $('thought-bubble-text');
  stopThoughtBubbleRender();
  if (clear) {
    state.thoughtText = '';
    state.thoughtTargetText = '';
    state.thoughtRenderedText = '';
  }
  if (bubble) bubble.classList.add('hidden');
  if (clear && bubbleText) bubbleText.textContent = '';
}

function isConnectivityOffline() {
  return state.connectivity?.online === false;
}

function connectivityMessage() {
  return 'Internet connection is down. As soon as it comes back, this goes away and you can interact with me again.';
}

function showConnectivityBubble() {
  showThoughtBubble(connectivityMessage(), { append: false, tone: 'serious' });
}

function syncChatAvailability() {
  const offline = isConnectivityOffline();
  const pending = !!state.pending;
  const form = $('chat-form');
  const input = $('chat-input');
  const send = $('chat-send');
  const alert = $('connectivity-alert');

  if (form) {
    form.classList.toggle('offline', offline);
    form.dataset.connectivity = offline ? 'offline' : 'online';
  }
  if (input) {
    input.disabled = pending || offline;
    input.placeholder = offline ? 'Internet is down. Waiting to reconnect.' : 'Ask. Or describe what you need.';
  }
  if (send) {
    // Keep the persona button interactive while offline so it can still be
    // dragged and the offline badge can be reached; submit is guarded below.
    send.disabled = pending;
  }
  if (alert) {
    alert.classList.toggle('hidden', !offline);
    alert.setAttribute('aria-hidden', offline ? 'false' : 'true');
  }
}

function applyConnectivityStatus(status = {}) {
  const wasOffline = isConnectivityOffline();
  state.connectivity = { ...state.connectivity, ...status };
  const offline = isConnectivityOffline();
  syncChatAvailability();
  if (wasOffline && !offline) {
    hideThoughtBubble();
    if (!state.pending && $('chat-form')?.dataset.state === 'expanded') $('chat-input')?.focus();
  }
}

async function pollConnectivity() {
  try {
    const res = await fetch('/api/connectivity', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    applyConnectivityStatus(await res.json());
  } catch (e) {
    applyConnectivityStatus({ online: false, error: e.message, checkedAt: new Date().toISOString() });
  }
}

function startConnectivityWatcher() {
  const alert = $('connectivity-alert');
  if (alert) {
    alert.addEventListener('mouseenter', () => { if (isConnectivityOffline()) showConnectivityBubble(); });
    alert.addEventListener('mouseleave', () => hideThoughtBubble());
    alert.addEventListener('focus', () => { if (isConnectivityOffline()) showConnectivityBubble(); });
    alert.addEventListener('blur', () => hideThoughtBubble());
  }
  window.addEventListener('online', pollConnectivity);
  window.addEventListener('offline', () => applyConnectivityStatus({ online: false, error: 'browser reports offline', checkedAt: new Date().toISOString() }));
  syncChatAvailability();
  pollConnectivity();
  setInterval(pollConnectivity, 5000);
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

function currentBaseTheme() {
  return document.documentElement.dataset.theme || state.baseTheme || DEFAULT_THEME;
}

function systemTileDoc(style, body) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}body{padding:14px}${style}</style></head><body>${body}</body></html>`;
}

function systemBrowserTileThumbnail(theme, fallback) {
  if (theme === 'cartoon-brutalist') {
    const style = `body{padding:9px 12px 38px;background:#FFF4DC;color:#0A0A0A;font-family:"Bricolage Grotesque",system-ui,sans-serif}.mini{position:relative;height:100%;border:3px solid #0A0A0A;border-radius:14px;background:#FFFAF0;box-shadow:5px 5px 0 #0A0A0A;overflow:hidden}.bar{position:absolute;left:9px;right:52px;top:9px;height:18px;border:3px solid #0A0A0A;border-radius:999px;background:#6BCEFF}.page{position:absolute;left:12px;right:74px;bottom:10px;display:grid;gap:5px}.page i{display:block;height:6px;border-radius:99px;background:#0A0A0A}.page i:nth-child(2){width:72%;background:#FF4FA3}.orb{position:absolute;right:10px;bottom:8px;width:42px;height:42px;border:3px solid #0A0A0A;border-radius:50%;background:#5FE3A1}.orb:before{content:"";position:absolute;left:9px;right:9px;top:18px;border-top:2px solid #0A0A0A}.orb:after{content:"";position:absolute;top:8px;bottom:8px;left:18px;border-left:2px solid #0A0A0A}`;
    return systemTileDoc(style, '<div class="mini"><div class="bar"></div><div class="page"><i></i><i></i></div><div class="orb"></div></div>');
  }

  if (theme === 'liquid-glass') {
    const style = `body{padding:9px 12px 38px;background:radial-gradient(circle at 18% 12%,rgba(255,122,182,.82),transparent 42%),radial-gradient(circle at 88% 90%,rgba(34,211,238,.82),transparent 45%),#06090F;color:#fff;font-family:"Inter Tight",-apple-system,BlinkMacSystemFont,sans-serif}.mini{position:relative;height:100%;border:1px solid rgba(255,255,255,.36);border-radius:24px;background:linear-gradient(135deg,rgba(255,255,255,.28),rgba(255,255,255,.08));box-shadow:inset 0 1px 0 rgba(255,255,255,.72),0 18px 38px rgba(0,0,0,.34);backdrop-filter:blur(18px) saturate(180%);overflow:hidden}.bar{position:absolute;left:12px;right:60px;top:11px;height:20px;border-radius:999px;background:rgba(255,255,255,.25);box-shadow:inset 0 1px 0 rgba(255,255,255,.72)}.page{position:absolute;left:14px;right:82px;bottom:13px;display:grid;gap:6px}.page i{display:block;height:5px;border-radius:99px;background:rgba(255,255,255,.54)}.page i:nth-child(2){width:68%;opacity:.68}.orb{position:absolute;right:12px;bottom:9px;width:46px;height:46px;border-radius:50%;background:radial-gradient(circle at 34% 28%,#fff,rgba(34,211,238,.72) 34%,rgba(167,139,250,.36) 72%);box-shadow:0 0 32px rgba(34,211,238,.58)}`;
    return systemTileDoc(style, '<div class="mini"><div class="bar"></div><div class="page"><i></i><i></i></div><div class="orb"></div></div>');
  }

  if (theme === 'neo-brutalist') {
    const style = `body{padding:10px 12px 38px;background:#F4F2ED;color:#0A0A0A;font-family:"Inter Tight",Arial,sans-serif}.mini{position:relative;height:100%;border:1px solid #0A0A0A;background:#fff;overflow:hidden}.bar{position:absolute;left:10px;right:52px;top:10px;height:18px;border:1px solid #0A0A0A;background:#fff}.bar:before{content:"";display:block;width:9px;height:9px;margin:4px;background:#FF3B00}.page{position:absolute;left:10px;right:72px;bottom:10px;display:grid;grid-template-columns:1fr 1fr;gap:6px}.page i{display:block;height:18px;border:1px solid #0A0A0A;background:#fff}.page i:first-child{background:#FF3B00}.orb{position:absolute;right:11px;bottom:10px;width:38px;height:38px;border:1px solid #0A0A0A;background:#D6FF3B}`;
    return systemTileDoc(style, '<div class="mini"><div class="bar"></div><div class="page"><i></i><i></i></div><div class="orb"></div></div>');
  }

  if (theme === 'risograph') {
    const style = `body{padding:10px 12px 38px;background:#F4ECD8;color:#1A1F3D;font-family:"Space Grotesk",system-ui,sans-serif}.mini{position:relative;height:100%;border:1px solid rgba(26,31,61,.62);border-radius:14px;background:#FAF3E0;box-shadow:4px 4px 0 rgba(255,72,176,.58),7px 7px 0 rgba(49,69,194,.24);overflow:hidden}.mini:before{content:"";position:absolute;inset:0;background:radial-gradient(#3145C2 1px,transparent 1.5px) 0 0/11px 11px;opacity:.14}.bar{position:absolute;left:12px;right:56px;top:11px;height:18px;border:1px solid #1A1F3D;border-radius:999px;background:#FAF3E0}.page{position:absolute;left:14px;right:78px;bottom:13px;display:grid;gap:6px}.page i{display:block;height:5px;background:#3145C2}.page i:nth-child(2){width:62%;background:#FF48B0}.orb{position:absolute;right:13px;bottom:10px;width:42px;height:42px;border:1px solid #1A1F3D;border-radius:50%;background:#FF48B0;box-shadow:-4px 4px 0 #FFE15B,3px -3px 0 #3145C2}`;
    return systemTileDoc(style, '<div class="mini"><div class="bar"></div><div class="page"><i></i><i></i></div><div class="orb"></div></div>');
  }

  if (theme === 'y2k-frutiger') {
    const style = `body{padding:9px 12px 38px;background:radial-gradient(circle at 76% 8%,rgba(255,255,255,.92),transparent 28%),linear-gradient(180deg,#E5F4FF 0%,#7FC8FF 68%,#3BA8FF 100%);color:#0A2A4D;font-family:Sora,Inter,system-ui,sans-serif}.mini{position:relative;height:100%;border:1px solid rgba(255,255,255,.9);border-radius:22px;background:linear-gradient(180deg,rgba(255,255,255,.94),rgba(255,255,255,.42) 48%,rgba(0,102,255,.14) 52%,rgba(255,255,255,.46));box-shadow:inset 0 1px 0 #fff,0 13px 24px rgba(0,64,140,.26);overflow:hidden}.mini:before{content:"";position:absolute;left:12px;right:16px;top:7px;height:14px;border-radius:999px;background:rgba(255,255,255,.82)}.bar{position:absolute;left:13px;right:60px;top:26px;height:16px;border-radius:999px;background:rgba(255,255,255,.74);box-shadow:inset 0 1px 0 #fff}.page{position:absolute;left:15px;right:80px;bottom:12px;display:grid;gap:5px}.page i{display:block;height:5px;border-radius:999px;background:rgba(0,102,255,.48)}.page i:nth-child(2){width:64%;background:rgba(10,42,77,.34)}.orb{position:absolute;right:13px;bottom:9px;width:45px;height:45px;border-radius:50%;background:radial-gradient(circle at 32% 25%,#fff,#A8E063 35%,#00D5FF 70%);box-shadow:0 0 24px rgba(0,213,255,.52)}`;
    return systemTileDoc(style, '<div class="mini"><div class="bar"></div><div class="page"><i></i><i></i></div><div class="orb"></div></div>');
  }

  if (theme === 'pixel-crt') {
    const style = `body{padding:10px 12px 38px;background:#0B0F0A;color:#33FF66;font-family:"IBM Plex Mono","VT323",monospace;text-shadow:0 0 7px rgba(51,255,102,.5)}body:after{content:"";position:fixed;inset:0;background:repeating-linear-gradient(180deg,rgba(51,255,102,.09) 0 1px,transparent 1px 4px);pointer-events:none}.mini{position:relative;height:100%;border:1px solid rgba(51,255,102,.78);background:#0F140E;box-shadow:0 0 18px rgba(51,255,102,.20) inset;overflow:hidden}.bar{position:absolute;left:10px;right:12px;top:10px;height:19px;border:1px solid #33FF66;padding:4px 7px;font:700 9px/1 "IBM Plex Mono";color:#33FF66}.bar:before{content:"https://";}.page{position:absolute;left:11px;right:66px;bottom:11px;display:grid;gap:6px}.page i{display:block;height:5px;background:#33FF66;box-shadow:0 0 6px rgba(51,255,102,.5)}.page i:nth-child(2){width:70%;background:#FFB000}.orb{position:absolute;right:12px;bottom:10px;width:38px;height:38px;border:1px solid #33FF66}.orb:before,.orb:after{content:"";position:absolute;inset:9px;border-top:1px solid #33FF66;border-bottom:1px solid #33FF66}.orb:after{inset:7px 17px;border:0;border-left:1px solid #33FF66;border-right:1px solid #33FF66}`;
    return systemTileDoc(style, '<div class="mini"><div class="bar"></div><div class="page"><i></i><i></i></div><div class="orb"></div></div>');
  }

  if (theme === 'warm-earthy') {
    const style = `body{padding:10px 12px 38px;background:#EDE2CD;color:#2A1F14;font-family:"Plus Jakarta Sans",system-ui,sans-serif}.mini{position:relative;height:100%;border:1px solid rgba(42,31,20,.18);border-radius:18px;background:radial-gradient(rgba(42,31,20,.05) 1px,transparent 1.2px) 0 0/6px 6px,#FAF3E3;box-shadow:0 14px 28px rgba(95,63,42,.18);overflow:hidden}.bar{position:absolute;left:12px;right:58px;top:12px;height:18px;border:1px solid rgba(42,31,20,.20);border-radius:999px;background:#F5E9D0}.page{position:absolute;left:14px;right:80px;bottom:12px;display:grid;gap:6px}.page i{display:block;height:5px;border-radius:999px;background:#7A8450}.page i:nth-child(2){width:66%;background:#C8553D}.orb{position:absolute;right:13px;bottom:9px;width:42px;height:42px;border-radius:50%;background:#E8B86F;border:1px solid rgba(42,31,20,.20);box-shadow:inset 0 0 0 9px rgba(122,132,80,.14)}`;
    return systemTileDoc(style, '<div class="mini"><div class="bar"></div><div class="page"><i></i><i></i></div><div class="orb"></div></div>');
  }

  if (fallback && theme !== 'bloom') return fallback;

  const style = `body{padding:10px 12px 38px;background:#07060B;color:#F5F1FF;font-family:Geist,system-ui,sans-serif}.mini{position:relative;height:100%;border:1px solid rgba(245,241,255,.22);border-radius:18px;background:linear-gradient(160deg,rgba(255,255,255,.12),rgba(255,255,255,.04));box-shadow:inset 0 1px 0 rgba(255,255,255,.10),0 16px 30px rgba(0,0,0,.32);overflow:hidden}.bar{position:absolute;left:12px;right:58px;top:12px;height:18px;border:1px solid rgba(245,241,255,.20);border-radius:999px;background:rgba(255,255,255,.07)}.page{position:absolute;left:14px;right:80px;bottom:13px;display:grid;gap:6px}.page i{display:block;height:5px;border-radius:999px;background:rgba(245,241,255,.44)}.page i:nth-child(2){width:66%;background:rgba(196,168,240,.58)}.orb{position:absolute;right:13px;bottom:10px;width:42px;height:42px;border:1px solid rgba(245,241,255,.28);border-radius:50%;background:radial-gradient(circle at 35% 28%,rgba(255,255,255,.30),rgba(196,168,240,.20) 42%,rgba(255,255,255,.03) 70%);box-shadow:0 0 24px rgba(196,168,240,.26)}`;
  return systemTileDoc(style, '<div class="mini"><div class="bar"></div><div class="page"><i></i><i></i></div><div class="orb"></div></div>');
}

function systemTileThumbnail(w) {
  if (!w?.system) return w?.thumbnail;
  const app = w.appType || w.id;
  if (app !== 'files' && app !== 'browser') return w.thumbnail;
  const theme = currentBaseTheme();
  if (app === 'browser') return systemBrowserTileThumbnail(theme, w.thumbnail);

  if (theme === 'cartoon-brutalist') {
    const style = `body{background:#FFF4DC;color:#0A0A0A;font-family:"Bricolage Grotesque",system-ui,sans-serif;display:flex;flex-direction:column;justify-content:space-between}.tag{font:700 9px/1 "Space Mono",monospace;letter-spacing:.14em;text-transform:uppercase}.title{font:900 28px/0.95 "Archivo Black",Impact,sans-serif;text-transform:uppercase;letter-spacing:0}.folder,.window{position:relative;border:3px solid #0A0A0A;border-radius:16px;box-shadow:7px 7px 0 #0A0A0A;background:#FFD93D}.folder{height:54%;transform:rotate(-2deg)}.folder:before{content:"";position:absolute;left:14px;top:-18px;width:74px;height:26px;border:3px solid #0A0A0A;border-bottom:0;border-radius:14px 14px 0 0;background:#6BCEFF}.folder:after{content:"";position:absolute;right:14px;bottom:12px;width:36px;height:36px;border:3px solid #0A0A0A;border-radius:50%;background:#FF4FA3}.window{height:50%;background:#FFFAF0;padding:10px}.bar{height:20px;border:3px solid #0A0A0A;border-radius:999px;background:#6BCEFF}.globe{position:absolute;right:12px;bottom:10px;width:54px;height:54px;border:3px solid #0A0A0A;border-radius:50%;background:#5FE3A1;box-shadow:5px 5px 0 #0A0A0A}.globe:before,.globe:after{content:"";position:absolute;inset:12px;border:2px solid #0A0A0A;border-left:0;border-right:0}.globe:after{inset:8px 22px;border:0;border-left:2px solid #0A0A0A;border-right:2px solid #0A0A0A}`;
    return systemTileDoc(style, app === 'files'
      ? '<div class="tag">/ device</div><div class="folder"></div><div class="title">Files</div>'
      : '<div class="tag">world wide web</div><div class="window"><div class="bar"></div><div class="globe"></div></div><div class="title">Browser</div>');
  }

  if (theme === 'liquid-glass') {
    const style = `body{background:radial-gradient(circle at 15% 10%,rgba(255,122,182,.8),transparent 42%),radial-gradient(circle at 90% 85%,rgba(34,211,238,.75),transparent 44%),radial-gradient(circle at 62% 58%,rgba(231,111,0,.62),transparent 42%),#06090F;color:#fff;font-family:"Inter Tight",-apple-system,BlinkMacSystemFont,sans-serif;display:flex;flex-direction:column;justify-content:space-between}.tag{font:500 9px/1 "JetBrains Mono",monospace;letter-spacing:.15em;text-transform:uppercase;color:rgba(255,255,255,.68)}.title{font:500 30px/1 "Instrument Serif",Georgia,serif;font-style:italic;text-shadow:0 10px 30px rgba(0,0,0,.38)}.glass{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.34);border-radius:28px;background:linear-gradient(135deg,rgba(255,255,255,.26),rgba(255,255,255,.08));box-shadow:inset 0 1px 0 rgba(255,255,255,.65),0 22px 44px rgba(0,0,0,.34);backdrop-filter:blur(18px) saturate(180%)}.folder{height:55%}.folder:before{content:"";position:absolute;left:16px;top:12px;width:82px;height:22px;border-radius:18px;background:rgba(255,255,255,.28);box-shadow:inset 0 1px 0 rgba(255,255,255,.72)}.folder:after{content:"";position:absolute;right:16px;bottom:14px;width:46px;height:46px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,rgba(109,200,255,.52) 38%,rgba(167,139,250,.34));box-shadow:0 0 30px rgba(109,200,255,.62)}.bar{height:28px;border-radius:999px;background:rgba(255,255,255,.24);box-shadow:inset 0 1px 0 rgba(255,255,255,.65);font:500 9px/28px "JetBrains Mono";padding:0 12px;color:rgba(255,255,255,.76)}.orb{margin:14px 8px 0 auto;width:60px;height:60px;border-radius:50%;background:radial-gradient(circle at 35% 28%,#fff,rgba(34,211,238,.72) 34%,rgba(167,139,250,.38) 68%);box-shadow:0 0 34px rgba(34,211,238,.55)}`;
    return systemTileDoc(style, app === 'files'
      ? '<div class="tag">device files</div><div class="glass folder"></div><div class="title">Files</div>'
      : '<div class="tag">chromium</div><div class="glass" style="height:56%;padding:12px"><div class="bar">https://</div><div class="orb"></div></div><div class="title">Browser</div>');
  }

  if (theme === 'neo-brutalist') {
    const style = `body{background:#F4F2ED;color:#0A0A0A;font-family:"Inter Tight",Arial,sans-serif;display:grid;grid-template-rows:auto 1fr auto;gap:10px}.tag{font:700 9px/1 "JetBrains Mono",monospace;letter-spacing:.13em;text-transform:uppercase;border-bottom:1px solid #0A0A0A;padding-bottom:8px}.title{font:800 30px/0.92 "Inter Tight";text-transform:uppercase;letter-spacing:0}.panel{border:1px solid #0A0A0A;background:#fff;position:relative}.row{height:22px;border-bottom:1px solid #0A0A0A;display:grid;grid-template-columns:22px 1fr;align-items:center}.row:before{content:"";width:8px;height:8px;margin-left:7px;background:#FF3B00}.row span{height:7px;background:#0A0A0A;margin-right:14px}.row:nth-child(2):before{background:#D6FF3B;border:1px solid #0A0A0A}.row:nth-child(3):before{background:#0A0A0A}.chrome{height:100%;padding:10px}.bar{height:26px;border:1px solid #0A0A0A;display:flex;align-items:center;padding:0 9px;font:700 9px "JetBrains Mono";text-transform:uppercase}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.grid div{height:34px;border:1px solid #0A0A0A;background:#fff}.grid div:first-child{background:#FF3B00}`;
    return systemTileDoc(style, app === 'files'
      ? '<div class="tag">[01] filesystem</div><div class="panel"><div class="row"><span></span></div><div class="row"><span></span></div><div class="row"><span></span></div></div><div class="title">Files</div>'
      : '<div class="tag">[02] network</div><div class="panel chrome"><div class="bar">https://</div><div class="grid"><div></div><div></div><div></div><div></div></div></div><div class="title">Browser</div>');
  }

  if (theme === 'risograph') {
    const style = `body{background:#F4ECD8;color:#1A1F3D;font-family:"Space Grotesk",system-ui,sans-serif;display:flex;flex-direction:column;justify-content:space-between}.tag{font:700 9px/1 "JetBrains Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:#3145C2}.title{font:800 31px/0.95 Fraunces,Georgia,serif;font-style:italic;color:#1A1F3D}.print{position:relative;height:55%;border:1px solid rgba(26,31,61,.55);border-radius:14px;background:#FAF3E0;box-shadow:5px 5px 0 rgba(255,72,176,.66),8px 8px 0 rgba(49,69,194,.28);overflow:hidden}.print:before{content:"";position:absolute;inset:0;background:radial-gradient(#3145C2 1px,transparent 1.5px) 0 0/10px 10px;opacity:.23;mix-blend-mode:multiply}.folder:after{content:"";position:absolute;left:14px;right:22px;bottom:18px;height:52px;border-radius:12px;background:#FFE15B;border:1px solid #1A1F3D;box-shadow:3px 3px 0 #3145C2}.browser:after{content:"";position:absolute;right:16px;bottom:15px;width:58px;height:58px;border-radius:50%;background:#FF48B0;border:1px solid #1A1F3D;box-shadow:-4px 4px 0 #FFE15B,3px -3px 0 #3145C2}.bar{position:absolute;left:14px;right:14px;top:16px;height:25px;border:1px solid #1A1F3D;border-radius:99px;background:#FAF3E0}`;
    return systemTileDoc(style, app === 'files'
      ? '<div class="tag">edition / files</div><div class="print folder"></div><div class="title">Files</div>'
      : '<div class="tag">edition / web</div><div class="print browser"><div class="bar"></div></div><div class="title">Browser</div>');
  }

  if (theme === 'y2k-frutiger') {
    const style = `body{background:radial-gradient(circle at 74% 8%,rgba(255,255,255,.9),transparent 28%),radial-gradient(circle at 12% 86%,rgba(168,224,99,.42),transparent 38%),linear-gradient(180deg,#E5F4FF 0%,#7FC8FF 68%,#3BA8FF 100%);color:#0A2A4D;font-family:Sora,Inter,system-ui,sans-serif;display:flex;flex-direction:column;justify-content:space-between}.tag{font:600 9px/1 "JetBrains Mono",monospace;letter-spacing:.11em;text-transform:uppercase;color:rgba(10,42,77,.58)}.title{font:800 27px/1 Sora,sans-serif;letter-spacing:0;text-shadow:0 1px 0 rgba(255,255,255,.9)}.gel{height:55%;border:1px solid rgba(255,255,255,.82);border-radius:24px;background:linear-gradient(180deg,rgba(255,255,255,.92),rgba(255,255,255,.36) 48%,rgba(0,102,255,.12) 52%,rgba(255,255,255,.46));box-shadow:inset 0 1px 0 #fff,0 16px 30px rgba(0,64,140,.28);position:relative;overflow:hidden}.gel:before{content:"";position:absolute;left:14px;right:14px;top:12px;height:35%;border-radius:999px;background:linear-gradient(180deg,rgba(255,255,255,.9),rgba(255,255,255,.12))}.folder:after{content:"";position:absolute;right:16px;bottom:14px;width:42px;height:42px;border-radius:50% 50% 46% 54%;background:radial-gradient(circle at 34% 24%,#fff,#00D5FF 38%,#0066FF 72%);box-shadow:0 10px 20px rgba(0,102,255,.28)}.browser .bar{position:absolute;left:16px;right:16px;top:18px;height:27px;border-radius:999px;background:rgba(255,255,255,.72);box-shadow:inset 0 1px 0 #fff}.browser:after{content:"";position:absolute;right:17px;bottom:13px;width:56px;height:56px;border-radius:50%;background:radial-gradient(circle at 32% 25%,#fff,#A8E063 35%,#00D5FF 70%);box-shadow:0 0 24px rgba(0,213,255,.52)}`;
    return systemTileDoc(style, app === 'files'
      ? '<div class="tag">my computer</div><div class="gel folder"></div><div class="title">Files</div>'
      : '<div class="tag">internet browser</div><div class="gel browser"><div class="bar"></div></div><div class="title">Browser</div>');
  }

  if (theme === 'pixel-crt') {
    const style = `body{background:#0B0F0A;color:#33FF66;font-family:"IBM Plex Mono","VT323",monospace;display:grid;grid-template-rows:auto 1fr auto;gap:9px;text-shadow:0 0 7px rgba(51,255,102,.5)}body:after{content:"";position:fixed;inset:0;background:repeating-linear-gradient(180deg,rgba(51,255,102,.09) 0 1px,transparent 1px 4px);pointer-events:none}.tag{font:600 10px/1 "IBM Plex Mono";letter-spacing:.08em;text-transform:uppercase;color:#FFB000}.title{font:400 38px/0.85 VT323,"IBM Plex Mono";letter-spacing:0}.term{border:1px solid rgba(51,255,102,.7);background:#0F140E;box-shadow:0 0 0 1px rgba(51,255,102,.18),0 0 22px rgba(51,255,102,.22) inset;padding:10px}.line{height:12px;margin-bottom:8px;background:linear-gradient(90deg,#33FF66 0 44%,transparent 44%)}.line:nth-child(2){width:72%;background:linear-gradient(90deg,#33FF66 0 68%,transparent 68%)}.line:nth-child(3){width:82%;background:linear-gradient(90deg,#FFB000 0 38%,transparent 38%)}.bar{height:24px;border:1px solid #33FF66;padding:5px 8px;font-size:9px;color:#33FF66}.grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px}.grid div{height:25px;border:1px solid rgba(51,255,102,.52)}`;
    return systemTileDoc(style, app === 'files'
      ? '<div class="tag">~\\DEVICE</div><div class="term"><div class="line"></div><div class="line"></div><div class="line"></div></div><div class="title">FILES</div>'
      : '<div class="tag">TCP/IP READY</div><div class="term"><div class="bar">https://</div><div class="grid"><div></div><div></div><div></div><div></div></div></div><div class="title">BROWSER</div>');
  }

  return w.thumbnail;
}

function isPendingBuildSurface(w) {
  return !!w?.pendingBuild;
}

function workInProgressLabel(surface) {
  const kind = surface?.kind === 'app' ? 'app' : 'widget';
  if (surface?.pendingFailed) return `${kind} build paused`;
  return `building ${kind}`;
}

function buildWorkInProgressDoc(surface, { compact = false } = {}) {
  const theme = currentBaseTheme();
  const kind = surface?.kind === 'app' ? 'app' : 'widget';
  const name = escapeHtml(surface?.name || (kind === 'app' ? 'App' : 'Widget'));
  const status = escapeHtml(workInProgressLabel(surface));
  const detail = surface?.pendingFailed
    ? (surface?.pendingReason || 'Something interrupted the build. You can delete this draft and ask me to try again.')
    : 'I am assembling the interface, states, data flow, and theme details now.';
  const mode = compact ? 'compact' : 'full';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}body{background:transparent;color:#F5F1FF;font-family:Inter,Geist,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.wip{min-height:100%;display:grid;place-items:center;padding:clamp(18px,4vw,44px);position:relative;isolation:isolate}
.panel{width:min(760px,100%);min-height:${compact ? '100%' : 'min(520px,78vh)'};display:grid;grid-template-rows:auto 1fr auto;gap:${compact ? '10px' : '28px'};padding:${compact ? '13px' : '32px'};border:1px solid rgba(245,241,255,.18);border-radius:${compact ? '18px' : '28px'};background:linear-gradient(160deg,rgba(34,31,45,.68),rgba(10,8,17,.42));box-shadow:0 24px 70px rgba(0,0,0,.32);overflow:hidden;position:relative}
.meta{font:700 ${compact ? '8px' : '11px'}/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.16em;text-transform:uppercase;color:rgba(245,241,255,.52);display:flex;justify-content:space-between;gap:12px}
h1{margin:0;font-family:"Instrument Serif",Georgia,serif;font-style:italic;font-weight:400;font-size:${compact ? '21px' : 'clamp(42px,7vw,86px)'};line-height:.92;letter-spacing:0;color:#F5F1FF}
p{margin:0;max-width:560px;color:rgba(245,241,255,.66);font-size:${compact ? '10px' : '15px'};line-height:1.55}
.stage{display:grid;align-content:center;gap:${compact ? '7px' : '18px'}}
.skeleton{display:grid;grid-template-columns:1.2fr .8fr;gap:${compact ? '6px' : '16px'};min-height:${compact ? '44px' : '180px'}}
.block,.line{border:1px solid rgba(245,241,255,.14);border-radius:${compact ? '10px' : '18px'};background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.12),rgba(255,255,255,.04));background-size:220% 100%;animation:shine 1.8s ease-in-out infinite}
.stack{display:grid;gap:${compact ? '5px' : '12px'}}.line{height:${compact ? '8px' : '18px'};border-radius:999px}.line:nth-child(2){width:72%}.line:nth-child(3){width:88%}
.footer{display:flex;align-items:center;justify-content:space-between;gap:16px}.dots{display:flex;gap:6px}.dots i{width:${compact ? '4px' : '8px'};height:${compact ? '4px' : '8px'};border-radius:50%;background:currentColor;opacity:.42;animation:pulse 1s ease-in-out infinite}.dots i:nth-child(2){animation-delay:.14s}.dots i:nth-child(3){animation-delay:.28s}
@keyframes shine{0%{background-position:180% 0}100%{background-position:-80% 0}}@keyframes pulse{50%{opacity:1;transform:translateY(-3px)}}@media (prefers-reduced-motion:reduce){.block,.line,.dots i{animation:none}}
body[data-theme="cartoon-brutalist"]{color:#0A0A0A}.wip[data-theme="cartoon-brutalist"] .panel{background:#FFF4DC;border:3px solid #0A0A0A;border-radius:18px;box-shadow:8px 8px 0 #0A0A0A}.wip[data-theme="cartoon-brutalist"] h1{font-family:"Archivo Black",Impact,sans-serif;font-style:normal;text-transform:uppercase;color:#0A0A0A}.wip[data-theme="cartoon-brutalist"] .meta,.wip[data-theme="cartoon-brutalist"] p{color:#0A0A0A}.wip[data-theme="cartoon-brutalist"] .block,.wip[data-theme="cartoon-brutalist"] .line{border:3px solid #0A0A0A;background:linear-gradient(90deg,#FFD93D,#FF4FA3,#6BCEFF);box-shadow:4px 4px 0 #0A0A0A}
.wip[data-theme="liquid-glass"] .panel{background:linear-gradient(135deg,rgba(255,255,255,.24),rgba(255,255,255,.07));border-color:rgba(255,255,255,.34);backdrop-filter:blur(18px) saturate(180%);box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 30px 80px rgba(0,0,0,.38)}.wip[data-theme="liquid-glass"]{background:radial-gradient(circle at 20% 10%,rgba(255,122,182,.28),transparent 32%),radial-gradient(circle at 80% 70%,rgba(34,211,238,.25),transparent 36%)}
.wip[data-theme="neo-brutalist"] .panel{background:#F4F2ED;color:#0A0A0A;border:1px solid #0A0A0A;border-radius:0;box-shadow:none}.wip[data-theme="neo-brutalist"] h1,.wip[data-theme="neo-brutalist"] p,.wip[data-theme="neo-brutalist"] .meta{color:#0A0A0A}.wip[data-theme="neo-brutalist"] h1{font-family:"Inter Tight",Arial,sans-serif;font-style:normal;font-weight:900;text-transform:uppercase}.wip[data-theme="neo-brutalist"] .block,.wip[data-theme="neo-brutalist"] .line{border:1px solid #0A0A0A;border-radius:0;background:linear-gradient(90deg,#fff,#FF3B00,#D6FF3B)}
.wip[data-theme="risograph"] .panel{background:#F4ECD8;color:#1A1F3D;border-color:rgba(26,31,61,.5);box-shadow:8px 8px 0 rgba(255,72,176,.7),13px 13px 0 rgba(49,69,194,.3)}.wip[data-theme="risograph"] h1,.wip[data-theme="risograph"] p,.wip[data-theme="risograph"] .meta{color:#1A1F3D}.wip[data-theme="risograph"] .block,.wip[data-theme="risograph"] .line{border-color:rgba(26,31,61,.45);background:linear-gradient(90deg,#FAF3E0,#FFE15B,#FF48B0,#3145C2)}
.wip[data-theme="warm-earthy"] .panel{background:linear-gradient(160deg,rgba(55,45,32,.82),rgba(24,18,13,.62));border-color:rgba(234,205,158,.28);color:#F6E8D0}.wip[data-theme="warm-earthy"] h1{color:#F6E8D0}.wip[data-theme="warm-earthy"] .block,.wip[data-theme="warm-earthy"] .line{background:linear-gradient(90deg,rgba(234,205,158,.12),rgba(180,122,74,.4),rgba(234,205,158,.12))}
.wip[data-theme="y2k-frutiger"] .panel{background:linear-gradient(180deg,rgba(255,255,255,.9),rgba(126,200,255,.58));border-color:rgba(255,255,255,.86);color:#0A2A4D;box-shadow:inset 0 1px 0 #fff,0 20px 48px rgba(0,64,140,.25)}.wip[data-theme="y2k-frutiger"] h1,.wip[data-theme="y2k-frutiger"] p,.wip[data-theme="y2k-frutiger"] .meta{color:#0A2A4D}.wip[data-theme="y2k-frutiger"] .block,.wip[data-theme="y2k-frutiger"] .line{border-color:rgba(255,255,255,.9);background:linear-gradient(90deg,#fff,#A8E063,#00D5FF,#fff)}
.wip[data-theme="pixel-crt"] .panel{background:#0B0F0A;color:#33FF66;border:1px solid #33FF66;border-radius:0;box-shadow:0 0 0 1px rgba(51,255,102,.22),0 0 34px rgba(51,255,102,.18) inset;text-shadow:0 0 7px rgba(51,255,102,.55)}.wip[data-theme="pixel-crt"]:after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(180deg,rgba(51,255,102,.08) 0 1px,transparent 1px 4px);pointer-events:none}.wip[data-theme="pixel-crt"] h1,.wip[data-theme="pixel-crt"] p,.wip[data-theme="pixel-crt"] .meta{color:#33FF66}.wip[data-theme="pixel-crt"] h1{font-family:VT323,"IBM Plex Mono",monospace;font-style:normal;text-transform:uppercase}.wip[data-theme="pixel-crt"] .block,.wip[data-theme="pixel-crt"] .line{border-color:#33FF66;border-radius:0;background:linear-gradient(90deg,rgba(51,255,102,.08),rgba(51,255,102,.44),rgba(255,176,0,.32))}
body[data-mode="compact"] .wip{padding:0}body[data-mode="compact"] .panel{width:100%;border-radius:0;border:0;box-shadow:none}body[data-mode="compact"] p{display:none}body[data-mode="compact"] .footer{display:none}
</style></head><body data-theme="${escapeAttr(theme)}" data-mode="${mode}"><main class="wip" data-theme="${escapeAttr(theme)}"><section class="panel"><div class="meta"><span>${status}</span><span>${kind}</span></div><div class="stage"><h1>${name}</h1><p>${escapeHtml(detail)}</p><div class="skeleton"><div class="block"></div><div class="stack"><div class="line"></div><div class="line"></div><div class="line"></div></div></div></div><div class="footer"><span class="meta">preview will switch when ready</span><span class="dots"><i></i><i></i><i></i></span></div></section></main></body></html>`;
}

// Build the inner thumbnail markup for a tile. Format priority:
//   1. Inline SVG (starts with `<svg`)            → drawn directly
//   2. Inline HTML doc (starts with `<!doctype`/`<html`/multi-tag) →
//                                                    sandboxed srcdoc iframe
//   3. HTTPS image URL                              → <img>
//   4. Vector-glyph fallback (Feather-style line icon, NEVER emoji)
function buildTileThumbnail(w) {
  if (isPendingBuildSurface(w)) {
    return `<div class="tile-thumb"><iframe class="tile-thumb-html" sandbox="allow-scripts" srcdoc="${escapeAttr(buildWorkInProgressDoc(w, { compact: true }))}" loading="lazy" title="${escapeAttr(w.name || 'Build preview')}"></iframe></div>`;
  }
  const thumbnail = w?.system ? systemTileThumbnail(w) : w?.thumbnail;
  const t = typeof thumbnail === 'string' ? thumbnail.trim() : '';
  const previewTitle = w?.kind === 'app' ? 'App preview' : 'Widget preview';
  if (t.startsWith('<svg') || /^<svg\b/i.test(t)) {
    const svg = t.replace(/^<svg\b/i, '<svg class="tile-svg"');
    return `<div class="tile-thumb">${svg}</div>`;
  }
  // Inline HTML preview: sandboxed iframe, scripts allowed but no same-origin
  // so it can't reach our window. Strict CSP applied via the tile-preview
  // host endpoint? For now, srcdoc with sandbox.
  if (/^<!doctype\s+html|^<html\b|<body\b/i.test(t)) {
    return `<div class="tile-thumb"><iframe class="tile-thumb-html" sandbox="allow-scripts" srcdoc="${escapeAttr(t)}" loading="lazy" title="${escapeAttr(w.name || previewTitle)}"></iframe></div>`;
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

function createPendingBuildSurface(tagName, attrs = {}, turnId = state.buildTurnSeq) {
  const kind = tagName === 'create_app' ? 'app' : tagName === 'create_widget' ? 'widget' : null;
  if (!kind) return null;

  const fallbackName = kind === 'app' ? 'New App' : 'New Widget';
  const rawName = typeof attrs.name === 'string' ? attrs.name.trim() : '';
  const size = kind === 'app' ? '1x1' : (WIDGET_SIZES[attrs.size] ? attrs.size : '2x1');
  const pending = {
    id: `pending-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    name: (rawName || fallbackName).slice(0, kind === 'app' ? 32 : 24),
    icon: (attrs.icon || (kind === 'app' ? 'spark' : 'shapes')).slice(0, 30),
    thumbnail: null,
    size,
    pendingBuild: true,
    pendingTurnId: turnId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.widgets.push(pending);
  renderWidgets();
  return pending;
}

function firstPendingBuild(kind, { includeFailed = false } = {}) {
  return state.widgets.find((w) => (
    isPendingBuildSurface(w) &&
    w.kind === kind &&
    (includeFailed || !w.pendingFailed)
  ));
}

function completePendingBuild(manifest) {
  if (!manifest) return;
  const kind = manifest.kind === 'app' ? 'app' : 'widget';
  const pending = firstPendingBuild(kind);
  if (!pending) {
    state.widgets.push(manifest);
    renderWidgets();
    return;
  }

  const idx = state.widgets.findIndex((w) => w.id === pending.id);
  const carriedLayout = pending.layout ? { ...pending.layout } : null;
  const next = { ...manifest };
  if (carriedLayout) {
    next.layout = carriedLayout;
    saveLocalWidgetLayout(next.id, carriedLayout);
    patchWidgetManifest(next.id, { layout: carriedLayout, size: next.size }).catch(() => {});
  }

  if (idx >= 0) state.widgets.splice(idx, 1, next);
  else state.widgets.push(next);

  const modalWasShowingPending = modalCurrent?.id === pending.id && !$('widget-modal')?.classList.contains('hidden');
  renderWidgets();
  if (modalWasShowingPending) openWidgetModal(next);
}

function failPendingBuild(tagName, reason = 'Build did not finish.') {
  const kind = tagName === 'create_app' ? 'app' : tagName === 'create_widget' ? 'widget' : null;
  if (!kind) return;
  const pending = firstPendingBuild(kind);
  if (!pending) return;
  pending.pendingFailed = true;
  pending.pendingReason = reason;
  pending.updatedAt = new Date().toISOString();
  renderWidgets();
  if (modalCurrent?.id === pending.id) {
    openPendingBuildModal(pending);
  }
}

function failUnfinishedPendingBuilds(turnId) {
  let changed = false;
  for (const w of state.widgets) {
    if (isPendingBuildSurface(w) && !w.pendingFailed && w.pendingTurnId === turnId) {
      w.pendingFailed = true;
      w.pendingReason = 'Build did not finish.';
      w.updatedAt = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) {
    renderWidgets();
    if (isPendingBuildSurface(modalCurrent)) {
      const current = state.widgets.find((w) => w.id === modalCurrent.id);
      if (current) openPendingBuildModal(current);
    }
  }
}

function desktopItems() {
  const apps = state.widgets.filter((item) => item?.kind === 'app');
  const widgets = state.widgets.filter((item) => item?.kind !== 'app');
  return [...state.systemApps, ...apps, ...widgets];
}

function normalizeWidgetSize(size) {
  return WIDGET_SIZES[size] ? size : '2x1';
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
  if (String(id || '').startsWith('pending-')) return null;
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
  const isApp = widget?.kind === 'app';
  const size = isApp ? '1x1' : normalizeWidgetSize(widget.size);
  const rawLayout = isApp ? { x: widget.layout?.x, y: widget.layout?.y } : widget.layout;
  const layout = clampWidgetLayout(rawLayout, size);
  const dims = widgetLayoutSizePx(size, isApp ? { x: layout.x, y: layout.y } : layout);
  tile.dataset.size = size;
  tile.style.left = `${layout.x}px`;
  tile.style.top = `${layout.y}px`;
  tile.style.width = `${dims.width}px`;
  tile.style.height = `${dims.height}px`;
}

function ensureWidgetLayouts({ persistMissing = true } = {}) {
  for (const widget of desktopItems()) {
    const isApp = widget?.kind === 'app';
    widget.size = isApp ? '1x1' : normalizeWidgetSize(widget.size);
    const local = loadLocalWidgetLayout(widget.id);
    const existing = widget.layout || local;
    if (existing && Number.isFinite(Number(existing.x)) && Number.isFinite(Number(existing.y))) {
      widget.layout = clampWidgetLayout(isApp ? { x: existing.x, y: existing.y } : existing, widget.size);
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
  if (widget?.kind === 'app') return;
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
    const isApp = w.kind === 'app';
    const tile = document.createElement('article');
    tile.className = `tile${w.system ? ' system-tile' : ''}${isApp ? ' app-tile' : ''}${isPendingBuildSurface(w) ? ' pending-build-tile' : ''}`;
    tile.dataset.id = w.id;
    tile.dataset.surface = w.system ? 'system' : isApp ? 'app' : 'widget';
    if (w.system) tile.dataset.systemApp = w.appType || w.id;
    applyTileGeometry(tile, w);

    tile.innerHTML = `
      ${buildTileThumbnail(w)}
      <span class="tile-name">${escapeHtml(w.name || (isApp ? 'App' : 'Widget'))}</span>
      ${w.system ? '' : `<button class="tile-delete" type="button" aria-label="Delete ${isApp ? 'app' : 'widget'}" title="Delete ${isApp ? 'app' : 'widget'}">
        <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M3 3l6 6M9 3l-6 6"></path>
        </svg>
      </button>`}
      ${isApp ? '' : '<button class="tile-resize-handle" type="button" aria-label="Resize widget" title="Resize"></button>'}
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
function openPendingBuildModal(widget) {
  modalCurrent = widget;
  const isApp = widget?.kind === 'app';
  const modal = $('widget-modal');
  modal.dataset.surface = isApp ? 'app' : 'widget';
  modal.dataset.pendingBuild = widget?.pendingFailed ? 'failed' : 'building';
  $('modal-title').textContent = widget.name;
  $('modal-delete').setAttribute('aria-label', `Delete ${isApp ? 'app' : 'widget'} draft`);
  $('modal-delete').setAttribute('title', `Delete ${isApp ? 'app' : 'widget'} draft`);
  const iframe = $('modal-iframe');
  iframe.removeAttribute('data-wid');
  iframe.removeAttribute('src');
  iframe.title = `${isApp ? 'App' : 'Widget'} build preview`;
  iframe.srcdoc = buildWorkInProgressDoc(widget);
  modal.classList.remove('hidden');
}

function openWidgetModal(widget) {
  if (isPendingBuildSurface(widget)) {
    openPendingBuildModal(widget);
    return;
  }
  modalCurrent = widget;
  const isApp = widget?.kind === 'app';
  const modal = $('widget-modal');
  delete modal.dataset.pendingBuild;
  modal.dataset.surface = isApp ? 'app' : 'widget';
  $('modal-title').textContent = widget.name;
  $('modal-delete').setAttribute('aria-label', `Delete ${isApp ? 'app' : 'widget'}`);
  $('modal-delete').setAttribute('title', `Delete ${isApp ? 'app' : 'widget'}`);
  const iframe = $('modal-iframe');
  // Register the iframe with the host bridge BEFORE setting src so the
  // listener accepts postMessages as soon as the widget mounts.
  installBridge(iframe, widget.id);
  iframe.title = isApp ? 'App' : 'Widget';
  iframe.removeAttribute('srcdoc');
  iframe.src = `/widgets/${widget.id}/widget.html`;
  modal.classList.remove('hidden');
  // Memory: log the open event so the LLM sees usage on the next turn.
  // Fire-and-forget; the user doesn't need to wait on this.
  fetch('/api/memory/event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: isApp ? 'app.open' : 'widget.open', id: widget.id, name: widget.name }),
  }).catch(() => {});
}
function closeWidgetModal() {
  const modal = $('widget-modal');
  modal.classList.add('hidden');
  delete modal.dataset.surface;
  delete modal.dataset.pendingBuild;
  const iframe = $('modal-iframe');
  iframe.removeAttribute('data-wid');
  iframe.removeAttribute('srcdoc');
  iframe.src = 'about:blank';
  modalCurrent = null;
}

async function deleteWidget(id) {
  const target = state.widgets.find((w) => w.id === id) || modalCurrent;
  const isApp = target?.kind === 'app' || String(id || '').startsWith('app-');
  const ok = confirm(`Delete this ${isApp ? 'app' : 'widget'}?`);
  if (!ok) return;
  if (isPendingBuildSurface(target)) {
    state.widgets = state.widgets.filter((w) => w.id !== id);
    renderWidgets();
    if (modalCurrent?.id === id) closeWidgetModal();
    return;
  }
  await fetch(`/api/widgets/${encodeURIComponent(id)}`, { method: 'DELETE' });
  state.widgets = state.widgets.filter((w) => w.id !== id);
  renderWidgets();
  if (modalCurrent?.id === id) closeWidgetModal();
}

// --- System apps -----------------------------------------------------------
function closeSystemModal() {
  const modal = $('system-modal');
  modal?.classList.add('hidden');
  if (modal) {
    delete modal.dataset.appType;
  }
  $('system-actions').innerHTML = '';
  $('system-body').innerHTML = '';
}

function openSystemApp(app) {
  const modal = $('system-modal');
  $('system-title').textContent = app.name || 'App';
  $('system-actions').innerHTML = '';
  $('system-body').innerHTML = '';
  modal.dataset.appType = app.appType || app.id || 'app';
  modal.classList.remove('hidden');
  if (app.appType === 'browser') renderBrowserApp();
  else renderFilesApp(state.filesPath || 'device:/', { history: 'replace' });
}

function parseExplorerPath(path) {
  const text = String(path || 'device:/').trim() || 'device:/';
  const normalized = text.replace(/^\/(?=[a-z][a-z0-9_-]*:)/i, '');
  const match = normalized.match(/^([a-z][a-z0-9_-]*):(\/.*)?$/i);
  if (match) {
    return {
      root: match[1].toLowerCase(),
      subpath: match[2] || '/',
    };
  }
  return {
    root: text.startsWith('/') ? 'bor' : 'device',
    subpath: text.startsWith('/') ? text : `/${text}`,
  };
}

function normalizeExplorerPath(path) {
  const parsed = parseExplorerPath(path);
  const parts = parsed.subpath.split('/').filter(Boolean);
  return `${parsed.root}:/${parts.join('/')}`;
}

function pushFilesHistory(stack, path) {
  const normalized = normalizeExplorerPath(path);
  if (!normalized) return;
  if (stack.at(-1) === normalized) return;
  stack.push(normalized);
  if (stack.length > 80) stack.splice(0, stack.length - 80);
}

function navigateFilesApp(path) {
  return renderFilesApp(path, { history: 'push', fromPath: state.filesPath });
}

function navigateFilesHistory(direction) {
  const isBack = direction === 'back';
  const source = isBack ? state.filesBackStack : state.filesForwardStack;
  const target = source.pop();
  if (!target) return;

  const current = normalizeExplorerPath(state.filesPath || 'device:/');
  pushFilesHistory(isBack ? state.filesForwardStack : state.filesBackStack, current);
  renderFilesApp(target, { history: 'replace' }).then((ok) => {
    if (ok !== false) return;
    const opposite = isBack ? state.filesForwardStack : state.filesBackStack;
    opposite.pop();
    pushFilesHistory(source, target);
  });
}

function fileParent(path) {
  const parsed = parseExplorerPath(path);
  const parts = parsed.subpath.split('/').filter(Boolean);
  parts.pop();
  return `${parsed.root}:/${parts.join('/')}`;
}

function fileName(path) {
  return String(path || '/').split('/').filter(Boolean).pop() || 'Files';
}

function fileExt(path) {
  const name = fileName(path).toLowerCase();
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1) : '';
}

function fileBaseName(path) {
  return fileName(path).toLowerCase();
}

function fileRawUrl(path, download = false) {
  return `/api/files/raw?path=${encodeURIComponent(path)}${download ? '&download=1' : ''}`;
}

const TEXT_FILE_EXTENSIONS = new Set([
  'txt', 'text', 'md', 'markdown', 'mdx', 'rst', 'log', 'out', 'err',
  'json', 'jsonl', 'ndjson', 'geojson', 'csv', 'tsv', 'xml', 'yaml', 'yml',
  'toml', 'ini', 'cfg', 'conf', 'properties', 'env', 'editorconfig',
  'html', 'htm', 'css', 'scss', 'sass', 'less', 'js', 'mjs', 'cjs', 'jsx',
  'ts', 'tsx', 'vue', 'svelte', 'astro', 'py', 'pyw', 'ipynb', 'rb', 'php',
  'java', 'kt', 'kts', 'scala', 'go', 'rs', 'swift', 'c', 'h', 'cpp', 'cc',
  'cxx', 'hpp', 'hh', 'cs', 'fs', 'fsx', 'vb', 'dart', 'lua', 'r', 'jl',
  'pl', 'pm', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd', 'sql',
  'graphql', 'gql', 'proto', 'dockerfile', 'makefile', 'mk', 'gradle',
  'tex', 'bib', 'diff', 'patch', 'gitignore', 'gitattributes', 'npmrc',
  'yarnrc', 'lock', 'license',
]);

const TEXT_FILE_NAMES = new Set([
  'dockerfile', 'makefile', 'rakefile', 'gemfile', 'podfile', 'procfile',
  'license', 'licence', 'notice', 'readme', 'changelog', 'authors',
  'contributors', '.gitignore', '.gitattributes', '.npmrc', '.yarnrc',
  '.env', '.env.local', '.env.example',
]);

const IMAGE_FILE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']);
const PDF_FILE_EXTENSIONS = new Set(['pdf']);
const SPREADSHEET_FILE_EXTENSIONS = new Set(['xls', 'xlsx', 'xlsm', 'ods', 'numbers']);
const ARCHIVE_FILE_EXTENSIONS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz']);

function isTextViewablePath(path) {
  const ext = fileExt(path);
  const name = fileBaseName(path);
  return TEXT_FILE_EXTENSIONS.has(ext) || TEXT_FILE_NAMES.has(name);
}

function fileTypeLabel(path) {
  const ext = fileExt(path);
  if (isTextViewablePath(path)) return ext ? `${ext.toUpperCase()} text` : 'Text';
  if (IMAGE_FILE_EXTENSIONS.has(ext)) return 'Image';
  if (PDF_FILE_EXTENSIONS.has(ext)) return 'PDF';
  if (SPREADSHEET_FILE_EXTENSIONS.has(ext)) return 'Spreadsheet';
  if (ARCHIVE_FILE_EXTENSIONS.has(ext)) return 'Archive';
  return ext ? `${ext.toUpperCase()} file` : 'File';
}

function openerKeywordsForFile(path) {
  const ext = fileExt(path);
  const name = fileBaseName(path);
  const keywords = new Set([ext, fileTypeLabel(path).toLowerCase(), 'file', 'viewer', 'opener']);
  if (isTextViewablePath(path)) ['text', 'code', 'editor', 'reader', 'markdown'].forEach((k) => keywords.add(k));
  if (IMAGE_FILE_EXTENSIONS.has(ext)) ['image', 'photo', 'gallery', 'picture'].forEach((k) => keywords.add(k));
  if (PDF_FILE_EXTENSIONS.has(ext)) ['pdf', 'document', 'reader'].forEach((k) => keywords.add(k));
  if (SPREADSHEET_FILE_EXTENSIONS.has(ext) || ['csv', 'tsv'].includes(ext)) ['spreadsheet', 'table', 'sheet', 'csv', 'excel'].forEach((k) => keywords.add(k));
  if (['json', 'jsonl', 'ndjson', 'geojson'].includes(ext)) ['json', 'data', 'inspector'].forEach((k) => keywords.add(k));
  if (name.includes('readme')) keywords.add('readme');
  return [...keywords].filter(Boolean);
}

function fileOpenersFor(selection) {
  if (!selection?.path) return [];
  const keywords = openerKeywordsForFile(selection.path);
  return state.widgets
    .filter((item) => item && !isPendingBuildSurface(item))
    .map((item) => {
      const haystack = `${item.name || ''} ${item.icon || ''} ${item.sourcePrompt || ''}`.toLowerCase();
      const score = keywords.reduce((total, keyword) => total + (keyword && haystack.includes(keyword) ? 1 : 0), 0);
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function isFilePlaceActive(currentPath, placePath) {
  const current = normalizeExplorerPath(currentPath);
  const place = normalizeExplorerPath(placePath);
  if (current === place) return true;
  if (place.endsWith(':/')) return false;
  return current.startsWith(`${place}/`);
}

async function parseFileResponse(res, fallback = 'File operation failed') {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || fallback);
  return data;
}

function showFileError(message) {
  const body = $('system-body');
  const existing = qs('.files-inline-error', body);
  if (existing) existing.remove();
  const target = qs('.files-toolbar', body) || qs('.files-main', body);
  if (!target) {
    body.innerHTML = `<div class="system-error">${escapeHtml(message)}</div>`;
    return;
  }
  const el = document.createElement('div');
  el.className = 'files-inline-error';
  el.textContent = message;
  target.insertAdjacentElement('afterend', el);
}

function closeFileContextMenu() {
  state.filesContextMenu?.remove();
  state.filesContextMenu = null;
}

function fileContextMentionName(selection) {
  return (fileName(selection?.path).replace(/[\[\]\n\r]/g, '').trim() || 'file');
}

function upsertFileContextRef(selection) {
  const name = fileContextMentionName(selection);
  const path = normalizeExplorerPath(selection.path);
  const ref = {
    id: `${selection.kind}:${path}`,
    mention: `@[${name}]`,
    name,
    path,
    kind: selection.kind === 'dir' ? 'folder' : 'file',
    type: selection.kind === 'dir' ? 'Folder' : fileTypeLabel(path),
    size: Number.isFinite(Number(selection.size)) ? Number(selection.size) : null,
  };
  const idx = state.fileContextRefs.findIndex((item) => item.id === ref.id);
  if (idx >= 0) state.fileContextRefs.splice(idx, 1, ref);
  else state.fileContextRefs.push(ref);
  return ref;
}

function useFileSelectionAsContext(selection) {
  if (!selection?.path) return;
  const ref = upsertFileContextRef(selection);
  const input = $('chat-input');
  if (input) {
    const current = input.value;
    if (!current.includes(ref.mention)) {
      const prefix = current.trim() ? `${current.replace(/\s+$/, '')} ` : '';
      input.value = `${prefix}${ref.mention} `;
    }
    try { expandOrb(); } catch {}
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }, 80);
  }
  closeFileContextMenu();
}

function activeFileContextRefsForText(text) {
  const value = String(text || '');
  return state.fileContextRefs.filter((ref) => value.includes(ref.mention));
}

function clearFileContextRefs(refs) {
  if (!refs.length) return;
  const used = new Set(refs.map((ref) => ref.id));
  state.fileContextRefs = state.fileContextRefs.filter((ref) => !used.has(ref.id));
}

function appendFileContextToPrompt(text, refs) {
  if (!refs.length) return text;
  const details = refs.map((ref) => [
    `- mention: ${ref.mention}`,
    `  name: ${ref.name}`,
    `  kind: ${ref.kind}`,
    `  path: ${ref.path}`,
    `  type: ${ref.type}`,
    ref.size != null ? `  size: ${ref.size} bytes` : null,
  ].filter(Boolean).join('\n')).join('\n');
  return `${text}\n\n<file_context>\nThe user attached these local file explorer items as context for this prompt. Do not assume the file contents are already loaded. Use read_file with the exact path for files. Use list_files, search_files, then read_file for folders or when you need to inspect related files.\n${details}\n</file_context>`;
}

function openExistingFileOpener(opener) {
  if (!opener) return;
  closeFileContextMenu();
  closeSystemModal();
  openWidgetModal(opener);
}

function renderOpenersList(selection, { compact = false } = {}) {
  const openers = fileOpenersFor(selection);
  const shown = openers.slice(0, compact ? 3 : 5);
  return `
    <div class="files-openers">
      <div class="files-openers-title">${openers.length} matching ${openers.length === 1 ? 'app/widget' : 'apps/widgets'}</div>
      ${shown.length ? shown.map((opener) => `
        <button class="files-opener-option" type="button" data-opener-id="${escapeAttr(opener.id)}">
          <span>${escapeHtml(opener.name || 'Untitled')}</span>
          <small>${escapeHtml(opener.kind === 'app' ? 'App' : 'Widget')}</small>
        </button>
      `).join('') : '<div class="files-openers-empty">No existing opener found</div>'}
    </div>
  `;
}

function wirePreviewOpeners(preview, selection) {
  qsa('[data-opener-id]', preview).forEach((button) => {
    button.addEventListener('click', () => {
      const opener = state.widgets.find((item) => item.id === button.dataset.openerId);
      openExistingFileOpener(opener);
    });
  });
}

function openFileContextMenu(event, selection) {
  if (!selection) return;
  event.preventDefault();
  event.stopPropagation();
  closeFileContextMenu();

  const menu = document.createElement('div');
  menu.className = 'files-context-menu';
  menu.style.left = `${Math.min(event.clientX, window.innerWidth - 270)}px`;
  menu.style.top = `${Math.min(event.clientY, window.innerHeight - 320)}px`;

  const openers = fileOpenersFor(selection);
  const isFile = selection.kind === 'file';
  menu.innerHTML = `
    <button type="button" data-menu-act="context">Use ${isFile ? 'File' : 'Folder'} as Context</button>
    <div class="files-context-meta">
      <strong>${escapeHtml(fileName(selection.path))}</strong>
      <span>${escapeHtml(selection.kind === 'dir' ? 'Folder' : fileTypeLabel(selection.path))}${selection.size != null ? ` · ${escapeHtml(formatBytes(selection.size))}` : ''}</span>
      ${isFile ? `<span>${openers.length} matching ${openers.length === 1 ? 'opener' : 'openers'}</span>` : ''}
    </div>
    <button type="button" data-menu-act="open">${selection.kind === 'dir' ? 'Open folder' : isTextViewablePath(selection.path) ? 'Preview as text' : 'Preview'}</button>
    ${isFile ? `
      <div class="files-context-section-title">Open With</div>
      ${openers.length ? openers.slice(0, 8).map((opener) => `
        <button type="button" data-menu-act="opener" data-opener-id="${escapeAttr(opener.id)}">
          <span>${escapeHtml(opener.name || 'Untitled')}</span>
          <small>${escapeHtml(opener.kind === 'app' ? 'App' : 'Widget')}</small>
        </button>
      `).join('') : '<button type="button" disabled>No apps or widgets yet</button>'}
    ` : ''}
    <div class="files-context-section-title">File</div>
    <button type="button" data-menu-act="copy-path">Copy path</button>
    ${isFile ? `<a href="${escapeAttr(fileRawUrl(selection.path, true))}">Download</a>` : ''}
  `;

  menu.addEventListener('click', async (e) => {
    const openerButton = e.target.closest('[data-opener-id]');
    const action = e.target.closest('[data-menu-act]')?.dataset.menuAct;
    if (openerButton && action === 'opener') {
      const opener = state.widgets.find((item) => item.id === openerButton.dataset.openerId);
      openExistingFileOpener(opener);
      return;
    }
    if (action === 'context') useFileSelectionAsContext(selection);
    else if (action === 'open') {
      closeFileContextMenu();
      if (selection.kind === 'dir') navigateFilesApp(selection.path);
      else renderFilePreview(selection);
    } else if (action === 'copy-path') {
      await navigator.clipboard?.writeText(selection.path).catch(() => {});
      closeFileContextMenu();
    }
  });

  document.body.appendChild(menu);
  state.filesContextMenu = menu;
  requestAnimationFrame(() => {
    const off = (e) => {
      if (!menu.contains(e.target)) {
        closeFileContextMenu();
        document.removeEventListener('pointerdown', off, true);
      }
    };
    document.addEventListener('pointerdown', off, true);
  });
}

async function renderFilesApp(path = 'device:/', { history = 'replace', fromPath = null } = {}) {
  const requestedPath = normalizeExplorerPath(path);
  const previousPath = normalizeExplorerPath(fromPath || state.filesPath || 'device:/');
  state.filesPath = requestedPath;
  const body = $('system-body');
  body.innerHTML = '<div class="system-loading">Loading files...</div>';
  let data;
  try {
    const res = await fetch(`/api/files?path=${encodeURIComponent(requestedPath)}`);
    data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unable to list files');
  } catch (err) {
    state.filesPath = previousPath;
    body.innerHTML = `<div class="system-error">${escapeHtml(err.message)}</div>`;
    return false;
  }

  const resolvedPath = normalizeExplorerPath(data.path || requestedPath);
  if (history === 'push' && previousPath !== resolvedPath) {
    pushFilesHistory(state.filesBackStack, previousPath);
    state.filesForwardStack = [];
  }
  state.filesPath = resolvedPath;
  state.filesSelection = null;
  const places = Array.isArray(data.places) ? data.places : [];
  const pinnedPlaces = places.filter((place) => place.pinned);
  const devicePlaces = places.filter((place) => !place.pinned);
  const writable = data.writable !== false;
  body.innerHTML = `
    <div class="files-app system-app-shell">
      <aside class="files-sidebar">
        <div class="system-app-brand">
          <span class="system-app-glyph files-glyph" aria-hidden="true"></span>
          <span>Files</span>
        </div>
        <div class="files-places">
          ${pinnedPlaces.length ? '<div class="files-place-section-title">Pinned</div>' : ''}
          ${pinnedPlaces.map((place) => `
            <button class="files-place files-place-pinned ${isFilePlaceActive(data.path, place.path) ? 'active' : ''}" type="button" data-path="${escapeAttr(place.path)}">
              <span class="files-place-icon" aria-hidden="true"></span>
              <span>${escapeHtml(place.name || place.label || 'BOR Home')}</span>
            </button>
          `).join('')}
          ${devicePlaces.length ? '<div class="files-place-section-title">Device</div>' : ''}
          ${devicePlaces.map((place) => `
            <button class="files-place ${isFilePlaceActive(data.path, place.path) ? 'active' : ''}" type="button" data-path="${escapeAttr(place.path)}">
              <span class="files-place-icon" aria-hidden="true"></span>
              <span>${escapeHtml(place.name || place.label || 'Folder')}</span>
            </button>
          `).join('')}
        </div>
      </aside>
      <section class="files-main">
        <div class="system-app-illustration files-illustration" aria-hidden="true">
          <span class="files-illustration-folder"></span>
          <span class="files-illustration-card"></span>
          <span class="files-illustration-dot"></span>
        </div>
        <div class="files-toolbar">
          <div class="files-history-controls" aria-label="Folder history">
            <button class="files-nav files-history-btn" type="button" data-history="back" aria-label="Back" title="Back" ${state.filesBackStack.length ? '' : 'disabled'}>&lt;</button>
            <button class="files-nav files-history-btn" type="button" data-history="forward" aria-label="Forward" title="Forward" ${state.filesForwardStack.length ? '' : 'disabled'}>&gt;</button>
          </div>
          <button class="files-nav" type="button" data-up="1" ${String(data.path || '').endsWith(':/') ? 'disabled' : ''}>Up</button>
          <div class="files-path" title="${escapeAttr(data.absolutePath || data.path || '')}">
            <span class="files-path-label">${escapeHtml(data.displayPath || data.path || 'Files')}</span>
            <span class="files-path-abs">${escapeHtml(data.absolutePath || '')}</span>
          </div>
          <div class="files-toolbar-actions">
            <button class="files-action" type="button" data-act="folder" ${writable ? '' : 'disabled'}>New Folder</button>
            <button class="files-action" type="button" data-act="upload" ${writable ? '' : 'disabled'}>Upload</button>
            <button class="files-action" type="button" data-act="rename" disabled>Rename</button>
            <button class="files-action" type="button" data-act="move" disabled>Move</button>
            <button class="files-action" type="button" data-act="download" disabled>Download</button>
            <button class="files-action danger" type="button" data-act="delete" disabled>Delete</button>
          </div>
          <input class="files-upload-input" type="file" multiple />
        </div>
        <div class="files-content">
          <div class="files-list">
            ${(data.items || []).map((entry) => `
              <button class="file-row" type="button" data-path="${escapeAttr(entry.path)}" data-kind="${escapeAttr(entry.kind)}" data-ext="${escapeAttr(fileExt(entry.path))}" data-size="${entry.size ?? ''}" data-name="${escapeAttr(entry.name)}" title="${escapeAttr(entry.name)}">
                <span class="file-icon" data-kind="${escapeAttr(entry.kind)}" data-ext="${escapeAttr(fileExt(entry.path))}" aria-hidden="true">
                  <span class="file-icon-mark"></span>
                </span>
                <span class="file-name">${escapeHtml(entry.name)}</span>
                <span class="file-meta">${entry.kind === 'file' && entry.size != null ? `${Math.round(entry.size / 1024)} KB` : ''}</span>
              </button>
            `).join('') || '<div class="files-empty">No files</div>'}
          </div>
          <div class="files-preview" id="files-preview">
            <div class="files-preview-empty">
              <span class="files-preview-icon" aria-hidden="true"></span>
              <span>Select a file</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  `;

  qsa('.files-place', body).forEach((button) => {
    button.addEventListener('click', () => navigateFilesApp(button.dataset.path));
  });
  qs('[data-history="back"]', body)?.addEventListener('click', () => navigateFilesHistory('back'));
  qs('[data-history="forward"]', body)?.addEventListener('click', () => navigateFilesHistory('forward'));
  qs('[data-up="1"]', body)?.addEventListener('click', () => navigateFilesApp(fileParent(state.filesPath)));

  const setActions = () => {
    const selected = state.filesSelection;
    qsa('[data-act="rename"], [data-act="move"], [data-act="delete"]', body).forEach((button) => { button.disabled = !selected || !writable; });
    qs('[data-act="download"]', body).disabled = !selected || selected.kind !== 'file';
  };

  qsa('.file-row', body).forEach((row) => {
    row.addEventListener('click', () => {
      if (row.dataset.kind === 'dir') {
        navigateFilesApp(row.dataset.path);
        return;
      }
      qsa('.file-row.selected', body).forEach((el) => el.classList.remove('selected'));
      row.classList.add('selected');
      const size = Number(row.dataset.size);
      state.filesSelection = {
        path: row.dataset.path,
        kind: row.dataset.kind,
        name: row.dataset.name || fileName(row.dataset.path),
        size: Number.isFinite(size) ? size : null,
      };
      setActions();
      renderFilePreview(state.filesSelection);
    });
    row.addEventListener('contextmenu', (event) => {
      const size = Number(row.dataset.size);
      state.filesSelection = {
        path: row.dataset.path,
        kind: row.dataset.kind,
        name: row.dataset.name || fileName(row.dataset.path),
        size: Number.isFinite(size) ? size : null,
      };
      qsa('.file-row.selected', body).forEach((el) => el.classList.remove('selected'));
      row.classList.add('selected');
      setActions();
      openFileContextMenu(event, state.filesSelection);
    });
    row.addEventListener('dblclick', () => {
      if (row.dataset.kind === 'dir') navigateFilesApp(row.dataset.path);
    });
  });

  qs('[data-act="folder"]', body)?.addEventListener('click', async () => {
    const name = prompt('Folder name');
    if (!name) return;
    try {
      await parseFileResponse(await fetch('/api/files/folder', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: state.filesPath, name }),
      }));
      renderFilesApp(state.filesPath);
    } catch (err) {
      showFileError(err.message);
    }
  });

  const uploadInput = qs('.files-upload-input', body);
  qs('[data-act="upload"]', body)?.addEventListener('click', () => uploadInput.click());
  uploadInput?.addEventListener('change', async () => {
    const fd = new FormData();
    fd.append('path', state.filesPath);
    for (const file of uploadInput.files || []) fd.append('file', file, file.name);
    try {
      await parseFileResponse(await fetch('/api/files/upload', { method: 'POST', body: fd }));
      uploadInput.value = '';
      renderFilesApp(state.filesPath);
    } catch (err) {
      showFileError(err.message);
    }
  });

  qs('[data-act="rename"]', body)?.addEventListener('click', async () => {
    if (!state.filesSelection) return;
    const name = prompt('New name', fileName(state.filesSelection.path));
    if (!name) return;
    try {
      await parseFileResponse(await fetch('/api/files/rename', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: state.filesSelection.path, name }),
      }));
      renderFilesApp(state.filesPath);
    } catch (err) {
      showFileError(err.message);
    }
  });

  qs('[data-act="move"]', body)?.addEventListener('click', async () => {
    if (!state.filesSelection) return;
    const to = prompt('Move to folder path', state.filesPath);
    if (!to) return;
    try {
      await parseFileResponse(await fetch('/api/files/move', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ from: state.filesSelection.path, to }),
      }));
      renderFilesApp(state.filesPath);
    } catch (err) {
      showFileError(err.message);
    }
  });

  qs('[data-act="download"]', body)?.addEventListener('click', () => {
    if (state.filesSelection?.kind === 'file') window.location.href = fileRawUrl(state.filesSelection.path, true);
  });

  qs('[data-act="delete"]', body)?.addEventListener('click', async () => {
    if (!state.filesSelection) return;
    if (!confirm(`Delete ${fileName(state.filesSelection.path)}?`)) return;
    try {
      await parseFileResponse(await fetch(`/api/files?path=${encodeURIComponent(state.filesSelection.path)}`, { method: 'DELETE' }));
      renderFilesApp(state.filesPath);
    } catch (err) {
      showFileError(err.message);
    }
  });
  return true;
}

function regexEscape(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textViewerDoc(text, selection) {
  const lines = text.split('\n');
  return lines.map((line, index) => `
    <div class="text-viewer-line">
      <span class="text-viewer-gutter">${index + 1}</span>
      <code>${escapeHtml(line || ' ')}</code>
    </div>
  `).join('');
}

async function renderTextFilePreview(preview, selection) {
  const ext = fileExt(selection.path);
  preview.innerHTML = `
    <div class="text-viewer" data-wrap="1">
      <header class="text-viewer-header">
        <div class="text-viewer-title">
          <span class="files-preview-kind">${escapeHtml(fileTypeLabel(selection.path))}</span>
          <strong>${escapeHtml(fileName(selection.path))}</strong>
          <small>${escapeHtml(formatBytes(selection.size) || '')}</small>
        </div>
        <div class="text-viewer-actions">
          <input class="text-viewer-search" type="search" placeholder="Search" autocomplete="off" spellcheck="false" />
          <button class="files-action" type="button" data-text-act="wrap">Wrap</button>
          <button class="files-action" type="button" data-text-act="copy">Copy</button>
        </div>
      </header>
      <div class="text-viewer-meta">
        <span>${escapeHtml(selection.path)}</span>
        ${renderOpenersList(selection, { compact: true })}
      </div>
      <div class="text-viewer-body"><div class="system-loading">Loading text...</div></div>
    </div>
  `;
  wirePreviewOpeners(preview, selection);

  const viewer = qs('.text-viewer', preview);
  const body = qs('.text-viewer-body', preview);
  let text = '';
  try {
    const res = await fetch(fileRawUrl(selection.path));
    if (!res.ok) throw new Error('Unable to load preview');
    text = await res.text();
    const truncated = text.length > 300000;
    const visible = truncated ? text.slice(0, 300000) : text;
    const lineCount = visible.split('\n').length;
    qs('.text-viewer-title small', preview).textContent = [
      formatBytes(selection.size),
      `${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`,
      truncated ? 'truncated' : '',
      ext ? `.${ext}` : '',
    ].filter(Boolean).join(' · ');
    body.innerHTML = `<div class="text-viewer-lines">${textViewerDoc(visible, selection)}</div>`;
  } catch (err) {
    body.innerHTML = `<div class="system-error">${escapeHtml(err.message)}</div>`;
    return;
  }

  qs('[data-text-act="wrap"]', preview)?.addEventListener('click', () => {
    const next = viewer.dataset.wrap === '1' ? '0' : '1';
    viewer.dataset.wrap = next;
  });
  qs('[data-text-act="copy"]', preview)?.addEventListener('click', async () => {
    await navigator.clipboard?.writeText(text).catch(() => {});
  });
  qs('.text-viewer-search', preview)?.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    const lineEls = qsa('.text-viewer-line', preview);
    if (!query) {
      lineEls.forEach((line) => {
        line.hidden = false;
        line.classList.remove('match');
      });
      return;
    }
    const re = new RegExp(regexEscape(query), 'i');
    lineEls.forEach((line) => {
      const hit = re.test(qs('code', line)?.textContent || '');
      line.hidden = !hit;
      line.classList.toggle('match', hit);
    });
  });
}

async function renderFilePreview(selection) {
  const preview = $('files-preview');
  if (!preview || !selection) return;
  closeFileContextMenu();
  if (selection.kind === 'dir') {
    preview.innerHTML = `
      <div class="files-preview-card" data-kind="dir">
        <span class="files-preview-large-icon files-preview-folder" aria-hidden="true"></span>
        <div class="files-preview-kind">Folder</div>
        <div class="files-preview-name">${escapeHtml(fileName(selection.path))}</div>
        <button class="files-action" type="button">Open</button>
      </div>
    `;
    qs('button', preview).addEventListener('click', () => navigateFilesApp(selection.path));
    return;
  }
  const ext = fileExt(selection.path);
  if (IMAGE_FILE_EXTENSIONS.has(ext)) {
    preview.innerHTML = `
      <div class="files-media-preview">
        <img class="files-preview-image" src="${escapeAttr(fileRawUrl(selection.path))}" alt="" />
        <div class="files-preview-strip">
          <span>${escapeHtml(fileName(selection.path))}</span>
          ${renderOpenersList(selection, { compact: true })}
        </div>
      </div>
    `;
    wirePreviewOpeners(preview, selection);
    return;
  }
  if (PDF_FILE_EXTENSIONS.has(ext)) {
    preview.innerHTML = `
      <div class="files-media-preview">
        <iframe class="files-preview-frame" src="${escapeAttr(fileRawUrl(selection.path))}" title="${escapeAttr(fileName(selection.path))}"></iframe>
        <div class="files-preview-strip">
          <span>${escapeHtml(fileName(selection.path))}</span>
          ${renderOpenersList(selection, { compact: true })}
        </div>
      </div>
    `;
    wirePreviewOpeners(preview, selection);
    return;
  }
  if (isTextViewablePath(selection.path)) {
    await renderTextFilePreview(preview, selection);
    return;
  }
  preview.innerHTML = `
    <div class="files-preview-card" data-kind="file">
      <span class="files-preview-large-icon files-preview-file" data-ext="${escapeAttr(ext)}" aria-hidden="true"></span>
      <div class="files-preview-kind">${escapeHtml(fileTypeLabel(selection.path))}</div>
      <div class="files-preview-name">${escapeHtml(fileName(selection.path))}</div>
      <p class="files-preview-note">This file is not a text/code format that BOR can preview directly yet. Right-click it to use it as context for your next prompt or open it with a matching app/widget.</p>
      ${renderOpenersList(selection)}
    </div>
  `;
  wirePreviewOpeners(preview, selection);
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
      <div class="browser-app system-app-shell">
        <div class="system-app-illustration browser-illustration" aria-hidden="true">
          <span class="browser-illustration-window"></span>
          <span class="browser-illustration-globe"></span>
          <span class="browser-illustration-dot"></span>
        </div>
        <form class="browser-launch">
          <input class="browser-url" type="text" placeholder="Search or enter URL" value="${escapeAttr(status.lastUrl || '')}" />
          <button class="btn btn-primary" type="submit">Open</button>
        </form>
        <div class="browser-status ${status.available ? 'ready' : 'error'}" data-state="${status.available ? 'ready' : 'error'}">
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
 * Display a completed <say> SSE event. Browser speech is intentionally
 * disabled; the presence communicates through the thought bubble instead.
 */
function speakOne({ tone = 'warm', text, decibels, rate, pitch }) {
  if (typeof text !== 'string' || !text.trim()) return;
  completeThoughtBubbleText(text, { tone });
  appendBubble('ai', text); // accessibility/debug — log stays display:none
  void decibels;
  void rate;
  void pitch;

  // Speech synthesis is commented out by request. Keep the code shape nearby
  // in case voice output is re-enabled later, but do not make the AI speak.
  // if (typeof window === 'undefined' || !window.speechSynthesis || !speaker.enabled) return;
  // const queued = speaker.speak(
  //   [{ kind: 'spoken', text: text.trim(), tone, volume: typeof decibels === 'number' ? Math.max(0.05, Math.min(1, (decibels - 20) / 70)) : null, rate, pitch }],
  //   { onAllDone: () => { if (!speaker.isBusy()) setPersonaSpeaking(false); } },
  // );
  // if (queued) setPersonaSpeaking(true);
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

function applyUpdatedSurface(manifest) {
  if (!manifest?.id) {
    refetchWidgets();
    return;
  }

  const idx = state.widgets.findIndex((w) => w.id === manifest.id);
  const next = idx >= 0 ? { ...state.widgets[idx], ...manifest } : manifest;
  if (idx >= 0) state.widgets.splice(idx, 1, next);
  else state.widgets.push(next);

  const modal = $('widget-modal');
  const shouldReloadOpenSurface = modalCurrent?.id === manifest.id && modal && !modal.classList.contains('hidden');
  renderWidgets();
  if (shouldReloadOpenSurface) openWidgetModal(next);
}

async function sendChat(text) {
  if (state.pending || !text.trim()) return;
  if (isConnectivityOffline()) {
    showConnectivityBubble();
    return;
  }
  hideThoughtBubble();
  const contextRefs = activeFileContextRefsForText(text);
  const outboundText = appendFileContextToPrompt(text, contextRefs);
  const buildTurnId = ++state.buildTurnSeq;
  state.pending = true;
  $('chat-form')?.classList.add('pending');
  setXmlGenerating(false);
  syncChatAvailability();

  appendBubble('user', text);
  state.messages.push({ role: 'user', content: outboundText });
  clearFileContextRefs(contextRefs);
  dismissGreeting();
  setAvatarState('thinking');
  speaker.cancel(); // hush any prior utterance the moment the user speaks
  setPersonaSpeaking(false);

  try {
    const { recorded } = await runChatTurn({
      messages: state.messages,
      handlers: {
        // Streamed-tag hint — show "building" if the partial tag is an app/widget op.
        tag_start: ({ name, attrs }) => {
          setXmlGenerating(true, name);
          if (name === 'create_widget' || name === 'update_widget' || name === 'create_app' || name === 'update_app') {
            setAvatarState('building');
            if (name === 'create_widget' || name === 'create_app') {
              createPendingBuildSurface(name, attrs || {}, buildTurnId);
            }
          } else {
            setAvatarState('thinking');
          }
        },

        // Thought bubble stream. The final `say` still arrives for history,
        // but `say_delta` lets the bubble render before the tag fully closes.
        say_delta: (p) => streamThoughtBubbleDelta(p?.text, { tone: p?.tone || 'warm' }),

        // Completed <say> block
        say: (p) => speakOne(p),

        // Widgets
        create_widget: ({ manifest }) => {
          if (!manifest) return;
          completePendingBuild(manifest);
          setAvatarState('success', 1200);
        },
        update_widget: ({ manifest }) => { applyUpdatedSurface(manifest); setAvatarState('success', 1000); },
        delete_widget: () => { refetchWidgets(); },

        // Apps
        create_app: ({ manifest }) => {
          if (!manifest) return;
          completePendingBuild(manifest);
          setAvatarState('success', 1200);
        },
        update_app: ({ manifest }) => { applyUpdatedSurface(manifest); setAvatarState('success', 1000); },
        delete_app: () => { refetchWidgets(); },

        // Theme / system
        set_theme: ({ config }) => { if (config) applyConfigSnapshot(config); },
        reset_chat: () => {
          state.messages = [];
          $('chat-log').innerHTML = '';
          hideThoughtBubble();
        },
        connectivity: (p) => applyConnectivityStatus(p),

        // Filesystem / shell — reflect in the chat log so the user sees what ran.
        read_file: ({ path, bytes, truncated }) => appendBubble('system', `read ${path} (${bytes}B${truncated ? ', truncated' : ''})`),
        read_file_in_chunks: ({ path, chunk, totalChunks }) => appendBubble('system', `read ${path} chunk ${chunk}/${totalChunks}`),
        read_batch: ({ count }) => appendBubble('system', `read batch (${count})`),
        write_file: ({ path, bytes }) => appendBubble('system', `wrote ${path} (${bytes}B)`),
        replace_in_file: ({ path, bytes, blocks }) => appendBubble('system', `edited ${path} (${blocks} block${blocks === 1 ? '' : 's'}, ${bytes}B)`),
        delete_file: ({ path }) => appendBubble('system', `deleted ${path}`),
        list_files: ({ path, count }) => appendBubble('system', `listed ${path} (${count})`),
        search_files: ({ path, count }) => appendBubble('system', `searched ${path} (${count} matches)`),
        list_code_definition_names: ({ path, count }) => appendBubble('system', `listed definitions ${path} (${count})`),
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
          failPendingBuild(tag, reason);
        },

        done: () => {
          setXmlGenerating(false);
          failUnfinishedPendingBuilds(buildTurnId);
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
    failUnfinishedPendingBuilds(buildTurnId);
  } finally {
    state.pending = false;
    $('chat-form')?.classList.remove('pending', 'generating', 'xml-generating');
    setXmlGenerating(false);
    syncChatAvailability();
    if (!isConnectivityOffline() && $('chat-form').dataset.state === 'expanded') $('chat-input').focus();
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

function isV2OnboardingComplete(cfg) {
  const providerId = cfg?.defaultProvider;
  return Boolean(
    cfg?.aiName
    && cfg?.avatarStyle
    && cfg?.avatarColor
    && cfg?.baseTheme
    && providerId
    && cfg?.providers?.[providerId]?.configured
  );
}

// --- Tools pane: browser-use detection -------------------------------------
async function refreshBrowserUseStatus(force = false) {
  const card = $('tool-browser-use');
  const badge = $('browser-use-badge');
  const body = $('browser-use-body');
  const meta = $('browser-use-meta');
  if (!card || !badge) return;
  card.dataset.status = 'checking';
  badge.textContent = force ? 'checking…' : 'checking…';
  badge.className = 'tool-badge';
  try {
    const res = await fetch(`/api/browser-use/status${force ? '?refresh=1' : ''}`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const status = await res.json();
    if (status.installed) {
      card.dataset.status = 'installed';
      badge.textContent = '✓ installed';
      badge.classList.add('ok');
      if (body) body.classList.add('hidden');
      if (meta) {
        const parts = [];
        if (status.version) parts.push(status.version);
        if (status.path) parts.push(status.path);
        meta.textContent = parts.join(' · ');
      }
    } else {
      card.dataset.status = 'missing';
      badge.textContent = 'not installed';
      badge.classList.add('warn');
      if (body) body.classList.remove('hidden');
      if (meta) meta.textContent = status.detail || '';
    }
  } catch (err) {
    card.dataset.status = 'error';
    badge.textContent = 'detection failed';
    badge.classList.add('err');
    if (meta) meta.textContent = err.message;
  }
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

  // Tools pane — detection-driven status for browser-use (and future CLIs).
  $('tools-back').addEventListener('click', () => gotoPane(3));
  $('tools-next').addEventListener('click', () => gotoPane(5));
  $('browser-use-recheck').addEventListener('click', () => refreshBrowserUseStatus(true));
  $('browser-use-copy').addEventListener('click', () => {
    const cmd = $('browser-use-cmd').textContent || '';
    navigator.clipboard?.writeText(cmd).catch(() => {});
    const btn = $('browser-use-copy');
    const orig = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = orig; }, 1200);
  });

  $('connect-back').addEventListener('click', () => gotoPane(4));

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
      setBaseTheme(theme.id);
    });

    grid.appendChild(card);
  }
}

// --- Home boot --------------------------------------------------------------
async function enterHome() {
  // Ensure renderer is alive before showing the home screen so we don't
  // get a blank avatar tile while it warms up.
  ensureAvatarRenderer();
  syncChatPresence();
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
  requestAnimationFrame(positionThoughtBubble);
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
  requestAnimationFrame(positionThoughtBubble);
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
  requestAnimationFrame(positionThoughtBubble);
  $('chat-input').blur();
}

function initChatOrb() {
  const orb = $('chat-form');
  const input = $('chat-input');
  const send = $('chat-send');
  syncChatPresence();

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

  const openCollapsedOrb = () => {
    hideThoughtBubble();
    expandOrb();
  };

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

  send?.addEventListener('click', (e) => {
    if (orb.dataset.state !== 'collapsed') return;
    e.preventDefault();
    if (suppressNextSubmit) {
      suppressNextSubmit = false;
      return;
    }
    openCollapsedOrb();
  });

  // Form submit fires on send-button click AND Enter-key in input.
  // We dispatch based on state: collapsed click → expand; expanded → send.
  orb.addEventListener('submit', (e) => {
    e.preventDefault();
    if (suppressNextSubmit) { suppressNextSubmit = false; return; }
    if (orb.dataset.state === 'collapsed') {
      openCollapsedOrb();
      return;
    }
    if (isConnectivityOffline()) {
      showConnectivityBubble();
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

  $('avatar').addEventListener('click', () => {
    hideThoughtBubble();
    expandOrb();
  });

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
  startConnectivityWatcher();

  const initialTheme = rememberedBaseTheme() || window.__BOR_BOOT_THEME || DEFAULT_THEME;
  setBaseTheme(initialTheme, { persist: false });
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

  // Hydrate identity as soon as config is available so the splash itself
  // reflects the selected theme during the minimum boot hold.
  state.avatarStyle = cfg?.avatarStyle || 'nova';
  state.avatarColor = cfg?.avatarColor || 'lilac';
  setBaseTheme(cfg?.baseTheme || rememberedBaseTheme() || initialTheme);
  applyAvatarColorVar(state.avatarColor);
  syncChatPresence();
  pushColorToAmbient(state.avatarColor);
  applyWallpaper(cfg?.wallpaper);
  state.decorations = Array.isArray(cfg?.decorations) ? cfg.decorations : [];
  renderDecorations(state.decorations);
  applyTheme(cfg?.theme);

  const elapsed = Date.now() - splashStarted;
  await new Promise((r) => setTimeout(r, Math.max(0, 1400 - elapsed)));

  // The legacy browser shell can enter home after provider setup. The v2 Mac
  // host must keep onboarding open until identity, theme, presence, and provider
  // are all committed; otherwise the setup window can appear to vanish after a
  // provider-only save.
  if (IS_V2_HOST ? isV2OnboardingComplete(cfg) : (cfg?.defaultProvider && cfg.providers?.[cfg.defaultProvider]?.configured)) {
    enterHome();
  } else {
    show('onboarding');
    renderProviderGrid();
    gotoPane(0);
  }
}

boot();
