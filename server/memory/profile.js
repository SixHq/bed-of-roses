// User profile — the structured derivative of session activity that the LLM
// reads at every chat turn so it knows who it's talking to.
//
// Schema:
//   {
//     preferences: ["prefers metric units", "based in Lagos", ...],   // capped at 50
//     voice:       "calm, dry humor; doesn't like exclamation points",
//     topics:      ["west african travel", "pomodoros", ...],
//     lastUpdated: "2026-05-09T03:00:00Z"
//   }
//
// Writes happen in two paths:
//   • <remember>X</remember> — appends X to preferences, dedupes case-insensitively
//   • dream cycle — merges a structured patch from the LLM consolidation prompt

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

import { DATA_DIR } from '../protocol/paths.js';

const PROFILE_PATH = join(DATA_DIR, 'memory', 'user_profile.json');

const PREF_CAP = 50;
const TOPIC_CAP = 30;

const EMPTY = () => ({ preferences: [], voice: null, topics: [], lastUpdated: null });

export async function read() {
  try {
    const raw = await readFile(PROFILE_PATH, 'utf8');
    const j = JSON.parse(raw);
    return {
      preferences: Array.isArray(j.preferences) ? j.preferences : [],
      voice: typeof j.voice === 'string' ? j.voice : null,
      topics: Array.isArray(j.topics) ? j.topics : [],
      lastUpdated: typeof j.lastUpdated === 'string' ? j.lastUpdated : null,
    };
  } catch (e) {
    if (e.code === 'ENOENT') return EMPTY();
    console.warn('[memory.profile] read failed:', e.message);
    return EMPTY();
  }
}

async function write(profile) {
  await mkdir(dirname(PROFILE_PATH), { recursive: true });
  await writeFile(PROFILE_PATH, JSON.stringify({ ...profile, lastUpdated: new Date().toISOString() }, null, 2));
}

/** Append a single fact. Deduplicates case-insensitively. Caps at PREF_CAP. */
export async function appendPreference(fact) {
  const clean = String(fact || '').trim().slice(0, 280);
  if (!clean) return { ok: false, reason: 'empty fact' };
  const profile = await read();
  const lower = clean.toLowerCase();
  if (profile.preferences.some((p) => p.toLowerCase() === lower)) {
    return { ok: true, dedup: true, profile };
  }
  profile.preferences.push(clean);
  // Trim oldest if over cap — newest stay.
  if (profile.preferences.length > PREF_CAP) {
    profile.preferences = profile.preferences.slice(-PREF_CAP);
  }
  await write(profile);
  return { ok: true, profile };
}

/** Remove preferences matching a query (case-insensitive substring). */
export async function forget(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { ok: false, reason: 'empty query', removed: [] };
  const profile = await read();
  const before = profile.preferences;
  const removed = [];
  profile.preferences = before.filter((p) => {
    if (p.toLowerCase().includes(q)) { removed.push(p); return false; }
    return true;
  });
  if (removed.length === 0) return { ok: true, removed: [], profile };
  await write(profile);
  return { ok: true, removed, profile };
}

/**
 * Merge a dream-cycle patch:
 *   { add_to_preferences?: [strings], add_to_topics?: [strings], voice_observations?: string }
 */
export async function mergeDreamPatch(patch) {
  if (!patch || typeof patch !== 'object') return { ok: false, reason: 'invalid patch' };
  const profile = await read();
  const seenP = new Set(profile.preferences.map((p) => p.toLowerCase()));
  for (const fact of patch.add_to_preferences || []) {
    const clean = String(fact || '').trim().slice(0, 280);
    if (!clean) continue;
    if (seenP.has(clean.toLowerCase())) continue;
    profile.preferences.push(clean);
    seenP.add(clean.toLowerCase());
  }
  if (profile.preferences.length > PREF_CAP) {
    profile.preferences = profile.preferences.slice(-PREF_CAP);
  }

  const seenT = new Set(profile.topics.map((t) => t.toLowerCase()));
  for (const t of patch.add_to_topics || []) {
    const clean = String(t || '').trim().slice(0, 80);
    if (!clean) continue;
    if (seenT.has(clean.toLowerCase())) continue;
    profile.topics.push(clean);
    seenT.add(clean.toLowerCase());
  }
  if (profile.topics.length > TOPIC_CAP) {
    profile.topics = profile.topics.slice(-TOPIC_CAP);
  }

  if (typeof patch.voice_observations === 'string' && patch.voice_observations.trim()) {
    profile.voice = patch.voice_observations.trim().slice(0, 280);
  }

  await write(profile);
  return { ok: true, profile };
}

/** Render the profile as the WHO YOU'RE TALKING TO section. Token-budgeted. */
export function renderProfile(profile, { maxChars = 1600 } = {}) {
  if (!profile) profile = EMPTY();
  const lines = [];
  if (profile.preferences.length) {
    lines.push('Preferences and facts the user has shared:');
    for (const p of profile.preferences) lines.push(`  • ${p}`);
  }
  if (profile.topics.length) {
    lines.push('');
    lines.push(`Topics that come up: ${profile.topics.join(', ')}.`);
  }
  if (profile.voice) {
    lines.push('');
    lines.push(`Their voice / style: ${profile.voice}`);
  }
  if (lines.length === 0) return '(no profile yet — this user is new to you.)';
  let out = lines.join('\n');
  if (out.length > maxChars) out = out.slice(0, maxChars) + '\n[…profile truncated]';
  return out;
}
