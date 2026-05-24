// Surface registry — usage stats per shortcut/app. Bumped when a surface is
// created, updated, or opened. The LLM gets the top-N most-used surfaces in
// the system prompt so it knows which apps the user lives inside.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, '..', '..');
const REGISTRY_PATH = join(PROJECT_ROOT, 'os-data', 'memory', 'surface_registry.json');

export async function read() {
  try {
    const raw = await readFile(REGISTRY_PATH, 'utf8');
    const j = JSON.parse(raw);
    return j && typeof j === 'object' ? j : {};
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    console.warn('[memory.surfaces] read failed:', e.message);
    return {};
  }
}

async function write(reg) {
  await mkdir(dirname(REGISTRY_PATH), { recursive: true });
  await writeFile(REGISTRY_PATH, JSON.stringify(reg, null, 2));
}

/** Bump the use counter for a surface. Updates lastOpened. Optional
 *  sourcePrompt appends to the recent-prompt list (capped at 5). */
export async function bumpUse(surfaceId, { name, sourcePrompt } = {}) {
  if (!surfaceId) return;
  const reg = await read();
  const entry = reg[surfaceId] || { name: name || null, useCount: 0, sourcePrompts: [] };
  entry.useCount = (entry.useCount || 0) + 1;
  entry.lastOpened = new Date().toISOString();
  if (name) entry.name = name;
  if (sourcePrompt && typeof sourcePrompt === 'string') {
    const clean = sourcePrompt.trim().slice(0, 200);
    if (clean) {
      entry.sourcePrompts = [clean, ...(entry.sourcePrompts || []).filter((s) => s !== clean)].slice(0, 5);
    }
  }
  reg[surfaceId] = entry;
  await write(reg);
  return entry;
}

/** Drop a surface from the registry (called when the surface is deleted). */
export async function drop(surfaceId) {
  const reg = await read();
  if (!reg[surfaceId]) return;
  delete reg[surfaceId];
  await write(reg);
}

/** Top N surfaces by useCount. */
export async function topSurfaces(n = 3) {
  const reg = await read();
  return Object.entries(reg)
    .map(([id, entry]) => ({ id, ...entry }))
    .sort((a, b) => (b.useCount || 0) - (a.useCount || 0))
    .slice(0, n);
}

/** Render top surfaces for the system prompt — kept tight to save tokens. */
export async function renderTopSurfaces(n = 3) {
  const top = await topSurfaces(n);
  if (top.length === 0) return '(none yet)';
  return top
    .map((w) => `  • "${w.name || w.id}" — opened ${w.useCount}× (last: ${w.lastOpened?.slice(0, 10) || '?'})`)
    .join('\n');
}
