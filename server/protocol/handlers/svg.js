import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_DECORATION_SIZE = 220;
const DEFAULT_DECORATION_OFFSET = 28;
const DEFAULT_DECORATION_OPACITY = 0.22;
const MAX_DECORATION_OPACITY = 0.28;
const DECORATION_GAP = 24;
const MAX_DECORATION_TRACK = 1600;
const VALID_ANCHORS = new Set([
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'center-left',
  'center-right',
  'center',
]);

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || `shape-${Date.now()}`;
}

function isSvg(text) {
  return /^\s*<svg[\s>]/i.test(String(text || ''));
}

function attrOr(attrs, key, fallback) {
  const value = attrs?.[key];
  return value == null || value === '' ? fallback : value;
}

function shortCss(value, fallback) {
  const text = String(value ?? fallback ?? '').trim();
  return (text || String(fallback)).slice(0, 24);
}

function normalizeAnchor(anchor) {
  const value = String(anchor || 'bottom-right').trim();
  return VALID_ANCHORS.has(value) ? value : 'bottom-right';
}

function pxNumber(value, fallback) {
  const text = String(value ?? '').trim();
  const match = text.match(/^(-?\d+(?:\.\d+)?)px$/i);
  if (match) return Number(match[1]);
  const number = Number.parseFloat(text);
  return Number.isFinite(number) ? number : fallback;
}

function pxString(value) {
  return `${Math.max(0, Math.round(value))}px`;
}

function overlaps(a, b) {
  return (
    a.x1 < b.x2 + DECORATION_GAP &&
    b.x1 < a.x2 + DECORATION_GAP &&
    a.y1 < b.y2 + DECORATION_GAP &&
    b.y1 < a.y2 + DECORATION_GAP
  );
}

function trackBox(decoration, x, y) {
  const width = Math.max(1, pxNumber(decoration.width, DEFAULT_DECORATION_SIZE));
  const height = Math.max(1, pxNumber(decoration.height, DEFAULT_DECORATION_SIZE));
  return {
    x1: x,
    x2: x + width,
    y1: y,
    y2: y + height,
    width,
    height,
  };
}

function placeWithoutOverlap(candidate, existing, themeId) {
  const anchor = normalizeAnchor(candidate.anchor);
  let x = pxNumber(candidate.x, DEFAULT_DECORATION_OFFSET);
  let y = pxNumber(candidate.y, DEFAULT_DECORATION_OFFSET);
  const baseX = x;
  const box = trackBox(candidate, x, y);
  const neighbors = existing
    .filter((d) => (
      d &&
      d.type === 'svg' &&
      d.id !== candidate.id &&
      (!d.themeId || d.themeId === themeId) &&
      normalizeAnchor(d.anchor) === anchor
    ))
    .map((d) => trackBox(d, pxNumber(d.x, DEFAULT_DECORATION_OFFSET), pxNumber(d.y, DEFAULT_DECORATION_OFFSET)));

  if (!neighbors.some((neighbor) => overlaps(box, neighbor))) {
    return { ...candidate, anchor };
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const current = trackBox(candidate, x, y);
    const hit = neighbors.find((neighbor) => overlaps(current, neighbor));
    if (!hit) {
      return { ...candidate, anchor, x: pxString(x), y: pxString(y) };
    }
    x = hit.x2 + DECORATION_GAP;
    if (x + current.width > MAX_DECORATION_TRACK) {
      x = baseX;
      y += current.height + DECORATION_GAP;
    }
  }

  return { ...candidate, anchor, x: pxString(x), y: pxString(y) };
}

export async function executeCreateSvg(block, ctx) {
  const cfg = await ctx.loadConfig();
  const themeId = cfg?.baseTheme || 'bloom';
  const name = (block.attrs?.name || block.attrs?.id || 'decoration').trim();
  const id = slugify(name);
  const svg = String(block.body || '').trim();
  if (!svg) {
    return { ok: false, event: 'tool_error', payload: { tag: 'create_svg', reason: 'SVG body required' }, llmEcho: 'create_svg failed: missing svg body' };
  }
  if (!isSvg(svg)) {
    return { ok: false, event: 'tool_error', payload: { tag: 'create_svg', reason: 'body must start with <svg' }, llmEcho: 'create_svg failed: body is not svg' };
  }

  const existing = Array.isArray(cfg?.decorations) ? cfg.decorations : [];
  const previous = existing.find((d) => d && d.id === id && d.themeId === themeId);

  const width = shortCss(attrOr(block.attrs, 'width', previous?.width || `${DEFAULT_DECORATION_SIZE}px`), `${DEFAULT_DECORATION_SIZE}px`);
  const height = shortCss(attrOr(block.attrs, 'height', previous?.height || `${DEFAULT_DECORATION_SIZE}px`), `${DEFAULT_DECORATION_SIZE}px`);
  const opacityValue = Number(attrOr(block.attrs, 'opacity', previous?.opacity ?? DEFAULT_DECORATION_OPACITY));
  const opacity = Math.max(0.05, Math.min(MAX_DECORATION_OPACITY, Number.isFinite(opacityValue) ? opacityValue : DEFAULT_DECORATION_OPACITY));
  const rotate = shortCss(attrOr(block.attrs, 'rotate', previous?.rotate || '0deg'), '0deg');
  const anchor = normalizeAnchor(attrOr(block.attrs, 'anchor', previous?.anchor || 'bottom-right'));
  const x = shortCss(attrOr(block.attrs, 'x', previous?.x || `${DEFAULT_DECORATION_OFFSET}px`), `${DEFAULT_DECORATION_OFFSET}px`);
  const y = shortCss(attrOr(block.attrs, 'y', previous?.y || `${DEFAULT_DECORATION_OFFSET}px`), `${DEFAULT_DECORATION_OFFSET}px`);
  const drift = String(attrOr(block.attrs, 'drift', previous?.drift || 'slow')).trim();
  const blend = String(attrOr(block.attrs, 'blend', previous?.blend || 'normal')).trim();
  // z is only a relative ordering hint inside the background decoration layer.
  // The shell keeps that whole layer behind widgets and opened apps.
  const zValue = Number(attrOr(block.attrs, 'z', previous?.z ?? 0));
  const z = Number.isFinite(zValue) ? zValue : 0;

  const projectRoot = ctx.projectRoot || process.cwd();
  const assetDir = join('shell', 'themes', themeId, 'assets');
  const assetPath = join(assetDir, `${id}.svg`);
  const absAssetPath = join(projectRoot, assetPath);
  await mkdir(join(projectRoot, assetDir), { recursive: true });
  await writeFile(absAssetPath, svg, 'utf8');

  const url = `/themes/${themeId}/assets/${id}.svg`;
  const requestedDecoration = {
    id,
    name: name || id,
    type: 'svg',
    themeId,
    url,
    width,
    height,
    opacity,
    rotate,
    anchor,
    x,
    y,
    drift,
    blend,
    z,
  };
  const nextDecoration = placeWithoutOverlap(requestedDecoration, existing, themeId);
  const decorations = [...existing.filter((d) => !(d && d.id === id && d.themeId === themeId)), nextDecoration]
    .sort((a, b) => (a.z || 0) - (b.z || 0));

  const next = ctx.mergeConfig(cfg, { decorations });
  await ctx.saveConfig(next);
  await ctx.audit({ kind: 'svg.create', id, themeId, path: assetPath, anchor, width, height });
  return {
    ok: true,
    event: 'set_theme',
    payload: { config: ctx.publicConfig(next) },
    llmEcho: `create_svg: placed "${id}" at ${anchor} using ${url}`,
  };
}
