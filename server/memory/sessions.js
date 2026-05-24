// Session activity log — append-only JSONL per chat session.
//
// Schema (one JSON object per line):
//   { ts, kind, ...payload }
//
// Kinds we emit:
//   user.message         { text }                        — the user typed something
//   tag.exec             { name, ok, summary, id? }      — an LLM tag executed
//   widget.open          { id }                          — the user opened a widget tile
//   widget.state.set     { id, bytes }                   — a widget persisted its state
//   widget.llm           { id, chars, model }            — a widget called askAI
//   widget.llm.refused   { id, reason }                  — a widget hit the rate limit
//   chat.error           { provider, reason }            — an LLM call failed
//
// Session boundary: 30 minutes of silence rolls over to a new file. We track
// the active session in-memory to avoid scanning disk on every event.

import { appendFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(HERE, '..', '..');
const SESSIONS_DIR = join(PROJECT_ROOT, 'os-data', 'memory', 'sessions');

const IDLE_BOUNDARY_MS = 30 * 60_000;

let _activeSession = { path: null, lastActivityAt: 0 };

async function ensureDir() {
  await mkdir(SESSIONS_DIR, { recursive: true });
}

function freshSessionPath() {
  // ISO timestamp, colon-safe for the filename.
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return join(SESSIONS_DIR, `${ts}.jsonl`);
}

async function getActiveSession() {
  const now = Date.now();
  if (!_activeSession.path || now - _activeSession.lastActivityAt > IDLE_BOUNDARY_MS) {
    await ensureDir();
    _activeSession = { path: freshSessionPath(), lastActivityAt: now };
  } else {
    _activeSession.lastActivityAt = now;
  }
  return _activeSession.path;
}

/** Append one event to the active session. Creates the file if needed. */
export async function logEvent(kind, payload = {}) {
  try {
    const path = await getActiveSession();
    const line = JSON.stringify({ ts: new Date().toISOString(), kind, ...payload }) + '\n';
    await appendFile(path, line);
  } catch (e) {
    console.warn('[memory.sessions]', e.message);
  }
}

/**
 * Read the last `n` events across the most recent session files. Walks files
 * newest-first, accumulating until we have n lines. Returns chronological
 * order (oldest first) so callers can render a transcript directly.
 */
export async function getRecentEvents(n = 50) {
  await ensureDir();
  let entries;
  try {
    entries = await readdir(SESSIONS_DIR);
  } catch { return []; }
  const files = entries
    .filter((name) => name.endsWith('.jsonl'))
    .sort()                  // ISO timestamps sort naturally
    .reverse();              // newest first

  const collected = [];
  for (const name of files) {
    if (collected.length >= n) break;
    let text;
    try { text = await readFile(join(SESSIONS_DIR, name), 'utf8'); } catch { continue; }
    const lines = text.trim().split('\n').filter(Boolean);
    // Walk THIS file from newest line to oldest so we don't over-collect on
    // a single huge session.
    for (let i = lines.length - 1; i >= 0 && collected.length < n; i--) {
      try { collected.push(JSON.parse(lines[i])); } catch { /* malformed line — skip */ }
    }
  }
  return collected.reverse(); // back to chronological
}

/** List session files newest-first with line counts (used by the dream cycle). */
export async function listSessionFiles() {
  await ensureDir();
  let names;
  try { names = await readdir(SESSIONS_DIR); } catch { return []; }
  return names
    .filter((n) => n.endsWith('.jsonl'))
    .sort()
    .reverse()
    .map((n) => join(SESSIONS_DIR, n));
}

/** Reset for tests. */
export function _resetSessionForTests() {
  _activeSession = { path: null, lastActivityAt: 0 };
}
