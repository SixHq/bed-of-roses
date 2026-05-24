// Memory tag handlers.
//
//   <remember>fact</remember>      — append a single fact to user_profile.preferences
//   <recall query="…"/>            — read-time substring search over profile + recent sessions
//   <forget query="…"/>            — remove preference(s) matching the query
//   <dream/>                       — disabled for now
//
// Every handler returns the standard {ok, event, payload, llmEcho} shape the
// executor expects. SSE event names mirror the tag names so the client can
// react if it wants (e.g. show a transient "remembered" toast).

import * as profile from '../../memory/profile.js';
import { getRecentEvents } from '../../memory/sessions.js';
// Dreams are disabled for now because they were interrupting normal chat.
// import { requestBackgroundDream } from '../../memory/dream.js';

export async function executeRemember(block, ctx) {
  const fact = (block.body || '').trim();
  if (!fact) {
    return { ok: false, event: 'tool_error', payload: { tag: 'remember', reason: 'empty fact' }, llmEcho: 'remember failed: empty fact' };
  }
  const r = await profile.appendPreference(fact);
  if (!r.ok) {
    return { ok: false, event: 'tool_error', payload: { tag: 'remember', reason: r.reason }, llmEcho: `remember failed: ${r.reason}` };
  }
  await ctx.audit({ kind: 'memory.remember', fact, dedup: !!r.dedup });
  return {
    ok: true,
    event: 'remember',
    payload: { fact, dedup: !!r.dedup, prefCount: r.profile.preferences.length },
    llmEcho: r.dedup ? `already remembered: ${fact}` : `remembered: ${fact}`,
  };
}

export async function executeRecall(block, ctx) {
  const query = (block.attrs?.query || '').trim().toLowerCase();
  if (!query) {
    return { ok: false, event: 'tool_error', payload: { tag: 'recall', reason: 'query required' }, llmEcho: 'recall failed: missing query' };
  }
  const prof = await profile.read();
  const matchedPrefs = prof.preferences.filter((p) => p.toLowerCase().includes(query));
  const recentEvents = await getRecentEvents(80);
  const matchedEvents = recentEvents
    .filter((e) => {
      const blob = JSON.stringify(e).toLowerCase();
      return blob.includes(query);
    })
    .slice(-10); // most recent N

  const summary = [
    matchedPrefs.length
      ? `From profile (${matchedPrefs.length}): ${matchedPrefs.map((p) => `"${p}"`).join(', ')}`
      : null,
    matchedEvents.length
      ? `From recent sessions (${matchedEvents.length}): ` +
        matchedEvents.map((e) => `${e.kind}${e.text ? ` "${e.text.slice(0, 60)}"` : ''}`).join('; ')
      : null,
  ].filter(Boolean).join('\n');

  await ctx.audit({ kind: 'memory.recall', query, prefHits: matchedPrefs.length, eventHits: matchedEvents.length });

  return {
    ok: true,
    event: 'recall',
    payload: { query, preferences: matchedPrefs, events: matchedEvents },
    llmEcho: summary || `nothing about "${query}" in memory`,
  };
}

export async function executeForget(block, ctx) {
  const query = (block.attrs?.query || '').trim();
  if (!query) {
    return { ok: false, event: 'tool_error', payload: { tag: 'forget', reason: 'query required' }, llmEcho: 'forget failed: missing query' };
  }
  const r = await profile.forget(query);
  if (!r.ok) {
    return { ok: false, event: 'tool_error', payload: { tag: 'forget', reason: r.reason }, llmEcho: `forget failed: ${r.reason}` };
  }
  await ctx.audit({ kind: 'memory.forget', query, removed: r.removed });
  return {
    ok: true,
    event: 'forget',
    payload: { query, removed: r.removed },
    llmEcho: r.removed.length
      ? `forgot: ${r.removed.join('; ')}`
      : `nothing matched "${query}"`,
  };
}

/**
 * Dream/consolidation is disabled for now.
 */
export async function executeDream(_block, ctx) {
  await ctx.audit({ kind: 'memory.dream.disabled' });
  return {
    ok: false,
    event: 'tool_error',
    payload: {
      tag: 'dream',
      reason: 'dreams are disabled',
    },
    llmEcho: 'dream disabled',
  };
}
