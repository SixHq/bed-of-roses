// Conversation history — durable, resumable chat transcripts for the presence.
//
// Each conversation is one JSON file: os-data/memory/conversations/<id>.json
//   {
//     id, title, preview, createdAt, updatedAt, messageCount,
//     reasoning: [ { text, at, usersAfter, aisAfter }, ... ],   // collapsed reasoning cards
//     thread: [ <serialized bubbleState.thread items> ],        // full rich thread (cards, terminals, …)
//     messages: [ { role: 'user'|'assistant', content: string | block[] }, ... ]
//   }
// `preview` (last substantive message, ~100 chars), `reasoning`, and `thread`
// were added later; readers tolerate their absence on older records. `thread`
// is the presence's rendered timeline verbatim (say bubbles, editor/terminal/
// image/browser cards, reasoning) so resume restores the full UI, not just
// text; `reasoning`+`messages` remain the fallback for older records.
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

// Sanitize the renderer's reasoning snapshot (see presence.js
// reasoningSnapshot()): collapsed reasoning cards plus end-anchored position
// counters so the presence can re-insert them chronologically on resume.
function sanitizeReasoning(reasoning) {
  if (!Array.isArray(reasoning)) return [];
  const entries = [];
  for (const note of reasoning) {
    if (!note || typeof note.text !== 'string') continue;
    const text = note.text.trim().slice(0, 20000);
    if (!text) continue;
    entries.push({
      text,
      at: Number(note.at) || null,
      usersAfter: Math.max(0, Number(note.usersAfter) || 0),
      aisAfter: Math.max(0, Number(note.aisAfter) || 0),
    });
    if (entries.length >= 200) break;
  }
  return entries;
}

// The renderer's serialized thread can carry heavy payloads (editor card
// bodies, browser-card screenshots as data URLs). Cap items, drop oversized
// data URLs, and bound total size so a conversation file stays loadable.
const THREAD_MAX_ITEMS = 120;
const THREAD_MAX_TOTAL_CHARS = 10_000_000;
const THREAD_DATAURL_MAX = 1_500_000;
const THREAD_STRING_MAX = 400_000;

function shrinkThreadValue(value, depth = 0) {
  if (depth > 8) return null;
  if (typeof value === 'string') {
    if (value.startsWith('data:') && value.length > THREAD_DATAURL_MAX) return '';
    if (value.length > THREAD_STRING_MAX) return `${value.slice(0, THREAD_STRING_MAX)}\n[truncated]`;
    return value;
  }
  if (Array.isArray(value)) return value.slice(0, 400).map((v) => shrinkThreadValue(v, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (v === undefined || typeof v === 'function') continue;
      out[key] = shrinkThreadValue(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  return null;
}

function sanitizeThread(thread) {
  if (!Array.isArray(thread) || !thread.length) return [];
  const items = [];
  for (const raw of thread.slice(-THREAD_MAX_ITEMS)) {
    if (!raw || typeof raw !== 'object' || typeof raw.type !== 'string') continue;
    if (raw.type === 'thinking') continue;
    const item = shrinkThreadValue(raw);
    if (item && typeof item === 'object') items.push(item);
  }
  while (items.length && JSON.stringify(items).length > THREAD_MAX_TOTAL_CHARS) items.shift();
  return items;
}

// Fallback preview for records saved before the `preview` field existed:
// last non-empty message, assistant turns reduced to their spoken <say> text.
function previewFromMessages(messages) {
  if (!Array.isArray(messages)) return '';
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) continue;
    let text = '';
    if (message.role === 'assistant') {
      const raw = String(message.content || '');
      const says = [...raw.matchAll(/<say\b[^>]*>([\s\S]*?)<\/say>/gi)]
        .map((m) => m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim())
        .filter(Boolean);
      if (says.length) text = says.join(' ');
      else if (!/<[a-zA-Z]/.test(raw)) text = raw;
    } else if (typeof message.content === 'string') {
      text = message.content;
    } else if (Array.isArray(message.content)) {
      const block = message.content.find((b) => b && b.type === 'text' && typeof b.text === 'string');
      text = block?.text || '';
    }
    const normalized = String(text).replace(/\s+/g, ' ').trim();
    if (normalized) return normalized.length > 100 ? `${normalized.slice(0, 99)}…` : normalized;
  }
  return '';
}

export async function saveConversation({ id, title, messages, createdAt, updatedAt, preview, reasoning, thread } = {}) {
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
    preview: String(preview || '').slice(0, 300) || previewFromMessages(messages),
    createdAt: firstSeen || updatedAt || now,
    updatedAt: updatedAt || now,
    messageCount: messages.length,
    reasoning: sanitizeReasoning(reasoning),
    thread: sanitizeThread(thread),
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
        preview: rec.preview || previewFromMessages(rec.messages),
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
