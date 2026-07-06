// Conversation history — durable, resumable chat transcripts for the presence.
//
// Each conversation is one JSON file: os-data/memory/conversations/<id>.json
//   {
//     id, title, createdAt, updatedAt, messageCount,
//     messages: [ { role: 'user'|'assistant', content: string | block[] }, ... ]
//   }
//
// The presence renderer already holds the canonical context array
// (`taskMessages`) and saves it back here after every completed turn, so this
// store is the source of truth that survives restarts. Scoped per presence via
// DATA_DIR (each presence runs its own runtime with its own data root).

import { readFile, writeFile, mkdir, readdir, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { DATA_DIR } from '../protocol/paths.js';

const CONV_DIR = join(DATA_DIR, 'memory', 'conversations');

// Keep the most recent N conversations on disk; prune older ones on save.
const MAX_CONVERSATIONS = 200;

// Conversation ids are client-generated (`conv-<ts>-<rand>`). Allow only a
// filesystem-safe charset so the id can never escape CONV_DIR.
function safeId(id) {
  const s = String(id || '').trim();
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(s)) return null;
  return s;
}

export async function saveConversation({ id, title, messages, createdAt, updatedAt } = {}) {
  const safe = safeId(id);
  if (!safe) return { ok: false, reason: 'invalid id' };
  if (!Array.isArray(messages) || !messages.length) return { ok: false, reason: 'empty conversation' };

  await mkdir(CONV_DIR, { recursive: true });
  const path = join(CONV_DIR, `${safe}.json`);

  // Preserve the original createdAt across updates.
  let firstSeen = createdAt;
  if (!firstSeen) {
    try {
      const prev = JSON.parse(await readFile(path, 'utf8'));
      firstSeen = prev.createdAt;
    } catch { /* new conversation */ }
  }

  const now = new Date().toISOString();
  const record = {
    id: safe,
    title: String(title || '').slice(0, 200) || 'Conversation',
    createdAt: firstSeen || updatedAt || now,
    updatedAt: updatedAt || now,
    messageCount: messages.length,
    messages,
  };
  await writeFile(path, JSON.stringify(record, null, 2));
  await pruneOld().catch(() => {});
  return { ok: true, id: safe };
}

export async function listConversations() {
  let files = [];
  try {
    files = await readdir(CONV_DIR);
  } catch (e) {
    if (e.code === 'ENOENT') return { conversations: [] };
    throw e;
  }
  const items = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const rec = JSON.parse(await readFile(join(CONV_DIR, f), 'utf8'));
      items.push({
        id: rec.id,
        title: rec.title || 'Conversation',
        createdAt: rec.createdAt || null,
        updatedAt: rec.updatedAt || rec.createdAt || null,
        messageCount: rec.messageCount || (Array.isArray(rec.messages) ? rec.messages.length : 0),
      });
    } catch { /* skip corrupt file */ }
  }
  items.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return { conversations: items };
}

export async function getConversation(id) {
  const safe = safeId(id);
  if (!safe) return null;
  try {
    return JSON.parse(await readFile(join(CONV_DIR, `${safe}.json`), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

export async function deleteConversation(id) {
  const safe = safeId(id);
  if (!safe) return { ok: false, reason: 'invalid id' };
  try {
    await unlink(join(CONV_DIR, `${safe}.json`));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  return { ok: true, id: safe };
}

export async function clearConversations() {
  let files = [];
  try {
    files = await readdir(CONV_DIR);
  } catch (e) {
    if (e.code === 'ENOENT') return { ok: true, removed: 0 };
    throw e;
  }
  const targets = files.filter((f) => f.endsWith('.json'));
  await Promise.all(targets.map((f) => unlink(join(CONV_DIR, f)).catch(() => {})));
  return { ok: true, removed: targets.length };
}

// Drop the oldest conversations (by file mtime) once we exceed the cap. Uses
// stat rather than parsing every file so saves stay cheap.
async function pruneOld() {
  let files = [];
  try {
    files = (await readdir(CONV_DIR)).filter((f) => f.endsWith('.json'));
  } catch {
    return;
  }
  if (files.length <= MAX_CONVERSATIONS) return;
  const stamped = [];
  for (const f of files) {
    try {
      const s = await stat(join(CONV_DIR, f));
      stamped.push({ f, mtime: s.mtimeMs });
    } catch { /* ignore */ }
  }
  stamped.sort((a, b) => b.mtime - a.mtime);
  const stale = stamped.slice(MAX_CONVERSATIONS);
  await Promise.all(stale.map(({ f }) => unlink(join(CONV_DIR, f)).catch(() => {})));
}
