// Path resolution + write-protection rules for filesystem and shell handlers.
//
// Reads (read_file, list_files) are unrestricted — they can touch any path
// the Node process can read.
//
// Writes (write_file, delete_file) refuse a small reserved set: anything
// inside the running OS source tree, anything outside $HOME if absolute, and
// the obvious sensitive areas. The model is otherwise free.
//
// Resolution rule:
//   • absolute path → used as-is
//   • relative path → resolved against the project root
//
// Audit logs always record the absolute resolved path.

import { resolve, isAbsolute, normalize, relative } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
// server/protocol/paths.js -> server/protocol -> server -> project root
export const PROJECT_ROOT = resolve(HERE, '..', '..');
const HOME = homedir();

// Reserved areas (relative to project root) — never written or deleted.
const RESERVED_DIRS = ['server', 'shell', 'node_modules', '.git'];
const RESERVED_FILES = ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'];

// Narrow carve-outs INSIDE reserved dirs that the LLM is allowed to write to.
// Keeps the OS source tree protected while letting the AI extend its own
// theme. Each entry is a regex matched against the relative path.
const WRITE_CARVEOUTS = [
  // Per-theme user-extras stylesheet — the LLM's "I want a sticker on the
  // homepage" canvas. One file per theme dir.
  /^shell\/themes\/[a-z0-9-]+\/user-extras\.css$/,
  // Per-theme assets dropped in (svg / png). Lets the LLM ship a labubu
  // sticker, a custom widget background image, etc.
  /^shell\/themes\/[a-z0-9-]+\/assets\/[\w.-]+\.(svg|png|jpg|jpeg|gif|webp)$/i,
];

/** Resolve a raw path string to an absolute path. */
export function resolvePath(rawPath, { cwd = PROJECT_ROOT } = {}) {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    throw new Error('path is required');
  }
  const trimmed = rawPath.trim();
  return isAbsolute(trimmed) ? normalize(trimmed) : resolve(cwd, trimmed);
}

/** Throws if `absPath` is in the reserved set. */
export function assertWritable(absPath) {
  // Refuse absolute paths outside the user's home dir.
  if (!absPath.startsWith(HOME) && !absPath.startsWith('/tmp') && !absPath.startsWith('/var/folders')) {
    throw new Error(`refused: path outside $HOME (${absPath})`);
  }
  // Refuse anything inside the running OS source tree we care about.
  const rel = relative(PROJECT_ROOT, absPath).split('\\').join('/');
  if (!rel.startsWith('..')) {
    // Inside the project. Check carve-outs first (they win over reserved-set).
    for (const allow of WRITE_CARVEOUTS) {
      if (allow.test(rel)) return;
    }
    const segments = rel.split('/');
    if (RESERVED_DIRS.includes(segments[0])) {
      throw new Error(`refused: reserved directory (${segments[0]}/)`);
    }
    if (segments.length === 1 && RESERVED_FILES.includes(segments[0])) {
      throw new Error(`refused: reserved file (${segments[0]})`);
    }
  }
}

/** Convenience for handlers that want both at once. */
export function resolveForWrite(rawPath, opts) {
  const abs = resolvePath(rawPath, opts);
  assertWritable(abs);
  return abs;
}
