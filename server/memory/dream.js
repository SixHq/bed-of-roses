// Dream cycle — between-session consolidation AND creative action.
//
// Each dream is two phases:
//
//   Phase 1 — Consolidation (strict JSON output).
//     Reads recent un-dreamed session jsonl files, asks the LLM to extract
//     durable facts about the user, merges the patch into user_profile.json.
//
//   Phase 2 — Action (XML protocol output, allowlisted).
//     Given the just-updated profile + active theme + current widgets, the
//     LLM may emit a small number of protocol tags to make the OS feel more
//     like home — a sticker via user-extras.css, a new widget, a remembered
//     fact, a tasteful theme drift, a quiet whispered note for next time.
//     Capped at 2 tags per cycle; only an allowlist of tags is permitted.
//
// Triggers:
//   1. Cron slots (default 03:00, 09:00, 15:00, 21:00 local —
//      override via BOR_DREAM_HOURS). Each slot fires once per day at most.
//   2. Idle backstop: 6 hours of no activity + at least one un-dreamed
//      session file → fire.
//   3. Explicit: <dream/> tag from the LLM queues a background dream, while
//      runDream({reason:'manual'}) is available for direct callers/tests.
//
// We use the same provider/model the user is on for both phases — predictable
// cost and quality. Action phase output is filtered through an allowlist
// before execution so a hallucinating model can't, say, rm -rf the project.

import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import { getProvider } from '../providers/index.js';
import { listSessionFiles, getRecentEvents, logEvent } from './sessions.js';
import * as profile from './profile.js';
import * as surfaceRegistry from './surfaces.js';
import { getTheme as getBaseTheme, DEFAULT_THEME } from '../../shell/themes/index.js';
import { ProtocolParser } from '../protocol/parser.js';
import { ALLOWED_PARSER_TAGS } from '../protocol/registry.js';
import { executeBlock } from '../protocol/executor.js';
import { getConnectivityStatus, isLikelyNetworkError } from '../connectivity.js';
import { isRetryableFailureMessage, makeEmptyResponseError, retryAttemptsEnv, retryDelayMs, sleep } from '../retry.js';

import { DATA_DIR } from '../protocol/paths.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, '..', '..');
const DREAMS_DIR = join(DATA_DIR, 'memory', 'dreams');
const DREAMED_INDEX = join(DREAMS_DIR, '.index.json');     // tracks which session files have been consumed
const SCHEDULER_INTERVAL_MS = positiveMsEnv('BOR_DREAM_INTERVAL_MS', 30_000);
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const IDLE_THRESHOLD_MS = positiveMsEnv('BOR_DREAM_IDLE_MS', SIX_HOURS_MS);
const SESSION_CONTENT_CAP_CHARS = 24_000; // sent to the LLM
const SESSIONS_PER_CYCLE = 5;
const DREAM_STREAM_MAX_ATTEMPTS = retryAttemptsEnv('BOR_DREAM_STREAM_ATTEMPTS', 10);
const DREAM_ACTION_MAX_PASSES = retryAttemptsEnv('BOR_DREAM_ACTION_MAX_PASSES', 10);
const DREAM_STREAM_IDLE_TIMEOUT_MS = Math.max(1000, Number(process.env.BOR_DREAM_STREAM_IDLE_TIMEOUT_MS || process.env.BOR_STREAM_IDLE_TIMEOUT_MS) || 60_000);

function positiveMsEnv(name, fallback) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.max(1_000, Math.round(value));
}

function formatDuration(ms) {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}min`;
}

async function collectDreamStream({ provider, providerCfg, system, messages, label, capChars }) {
  for (let attempt = 0; attempt < DREAM_STREAM_MAX_ATTEMPTS; attempt += 1) {
    const ac = new AbortController();
    let idleTimer = null;
    let timedOut = false;
    const armIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        timedOut = true;
        ac.abort(new Error(`${label} idle timeout after ${formatDuration(DREAM_STREAM_IDLE_TIMEOUT_MS)}`));
      }, DREAM_STREAM_IDLE_TIMEOUT_MS);
      if (typeof idleTimer.unref === 'function') idleTimer.unref();
    };

    try {
      let raw = '';
      armIdleTimer();
      for await (const chunk of provider.stream({
        apiKey: providerCfg.apiKey,
        model: providerCfg.model || provider.defaultModel,
        baseUrl: providerCfg.baseUrl,
        system,
        messages,
        signal: ac.signal,
      })) {
        armIdleTimer();
        raw += chunk;
        if (raw.length > capChars) break;
      }
      if (!raw.trim()) throw makeEmptyResponseError(label);
      return raw;
    } catch (e) {
      const err = timedOut
        ? new Error(`${label} stopped responding for ${formatDuration(DREAM_STREAM_IDLE_TIMEOUT_MS)}`)
        : e;
      if (getConnectivityStatus().online === false || attempt >= DREAM_STREAM_MAX_ATTEMPTS - 1 || !isRetryableFailureMessage(err)) {
        throw err;
      }
      console.warn(`[dream] ${label} attempt ${attempt + 1}/${DREAM_STREAM_MAX_ATTEMPTS} failed: ${err.message}; retrying`);
      await sleep(retryDelayMs(attempt));
    } finally {
      clearTimeout(idleTimer);
    }
  }
  throw makeEmptyResponseError(label);
}

// Default cron slots — once every six hours. Override with BOR_DREAM_HOURS (CSV).
const DEFAULT_CRON_HOURS = [3, 9, 15, 21];
function getCronHours() {
  const raw = process.env.BOR_DREAM_HOURS;
  if (!raw) return DEFAULT_CRON_HOURS;
  const parsed = raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n >= 0 && n < 24);
  return parsed.length ? parsed : DEFAULT_CRON_HOURS;
}

// Allowlist for what tags the action phase may execute. NO file deletes, NO
// shell, NO arbitrary file writes — only theme extras + widget shaping +
// memory + a soft whispered note. Anything else the model emits is silently
// dropped (still recorded in the dream audit, just not run).
const ACTION_TAG_ALLOWLIST = new Set([
  'remember',
  'set_theme',         // safe because the user can always reset_theme
  'write_file',        // narrowly: the paths module restricts to user-extras + theme assets
  'create_svg',
  'get_ux_ui_strict_guidelines',
  'create_widget',
  'list_surfaces',
  'read_surface_data',
  'mutate_surface_data',
  'say',
]);
const ACTION_MAX_TAGS = 2;

const DREAM_SYSTEM_PROMPT = `You are the consolidation step of an AI operating system's memory layer.
You will be shown a collection of session activity logs (user messages, tag executions, widget interactions). Your job is to extract DURABLE FACTS about the user — things that should still be true a week from now.

Output STRICT JSON, nothing else. No prose, no markdown fences. Schema:

{
  "add_to_preferences": [<short first-person sentences, e.g. "I live in Lagos.", "I am vegetarian.", "I prefer metric units.">],
  "add_to_topics": [<short topic strings, e.g. "west-african travel", "pomodoros", "yoruba poetry">],
  "voice_observations": "<one short sentence about how the user writes — tone, register, quirks, what they like and don't>"
}

Rules:
- ONLY extract facts the user actually stated or strongly implied. Don't guess.
- Skip ephemeral things ("they were planning a trip yesterday" — was the trip taken?).
- Preferences are first-person from the USER'S point of view ("I am ...", "I prefer ...").
- If the session reveals nothing durable, return {"add_to_preferences":[], "add_to_topics":[], "voice_observations":""}.
- Output ONLY the JSON object. Nothing before or after.`;

async function ensureDreamsDir() {
  await mkdir(DREAMS_DIR, { recursive: true });
}

async function readDreamedIndex() {
  if (!existsSync(DREAMED_INDEX)) return { files: [] };
  try {
    const j = JSON.parse(await readFile(DREAMED_INDEX, 'utf8'));
    return { files: Array.isArray(j.files) ? j.files : [] };
  } catch { return { files: [] }; }
}

async function markDreamed(filePaths) {
  const idx = await readDreamedIndex();
  const set = new Set(idx.files);
  for (const p of filePaths) set.add(p);
  await ensureDreamsDir();
  await writeFile(DREAMED_INDEX, JSON.stringify({ files: [...set].slice(-200), updatedAt: new Date().toISOString() }, null, 2));
}

/** Find session files that haven't been dreamed yet. Newest first. */
async function findUndreamedSessions() {
  const all = await listSessionFiles();
  const idx = await readDreamedIndex();
  const dreamed = new Set(idx.files);
  return all.filter((p) => !dreamed.has(p));
}

/** Last-activity timestamp by stat'ing the newest session file. */
async function lastActivityAt() {
  const files = await listSessionFiles();
  if (files.length === 0) return 0;
  try {
    const s = await stat(files[0]);
    return s.mtimeMs;
  } catch { return 0; }
}

/** Read N most-recent session files, concatenate the lines, cap at char budget. */
async function buildDreamCorpus(filePaths) {
  const used = filePaths.slice(0, SESSIONS_PER_CYCLE);
  const chunks = [];
  let totalChars = 0;
  for (const path of used) {
    let text;
    try { text = await readFile(path, 'utf8'); } catch { continue; }
    const remaining = SESSION_CONTENT_CAP_CHARS - totalChars;
    if (remaining <= 0) break;
    const chunk = text.length > remaining ? text.slice(0, remaining) : text;
    chunks.push(`# Session: ${path.split('/').pop()}\n${chunk}`);
    totalChars += chunk.length;
  }
  return { corpus: chunks.join('\n\n'), files: used };
}

/** Try to extract the first JSON object from the LLM's reply. Forgiving. */
function parseDreamPatch(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  if (start === -1) return null;
  // Brace-depth scan to find the matching close — same trick used by the
  // legacy JSON extractor; tolerant of trailing prose.
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
  }
  if (end === -1) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

/**
 * Phase 2 — the creative action phase. Runs AFTER consolidation succeeded.
 *
 * Builds a second LLM call with the just-updated profile, active theme,
 * current widgets, and a tight system prompt. The LLM may emit zero or up to
 * ACTION_MAX_TAGS protocol tags from the allowlist. Each is executed through
 * the standard protocol executor with the same handler ctx as a chat turn.
 *
 * Returns { actions: [{name, ok, llmEcho}], raw }.
 */
async function runDreamActionPhase({ provider, providerCfg, ctx, profileSnap }) {
  if (!ctx) return { actions: [], reason: 'no ctx — skipping action phase', raw: '' };
  if (getConnectivityStatus().online === false) return { actions: [], reason: 'internet offline — action phase will retry later', raw: '' };

  // Gather the world view the action LLM sees.
  const cfg = await ctx.loadConfig();
  const baseThemeId = cfg?.baseTheme || DEFAULT_THEME;
  const theme = getBaseTheme(baseThemeId);
  const widgets = await listWidgetsSafe(ctx);
  const recentEvents = await getRecentEvents(40);
  const topSurfaces = await surfaceRegistry.topSurfaces(5);

  const profileBlock = profile.renderProfile(profileSnap);
  const widgetBlock = widgets.length
    ? widgets.map((w) => `  - id=${w.id}  name="${w.name}"  size=${w.size || '2x2'}  icon=${w.icon || 'shapes'}`).join('\n')
    : '  (none yet)';
  const topBlock = topSurfaces.length
    ? topSurfaces.map((w) => `  - "${w.name || w.id}" used ${w.useCount || 0}× (last: ${w.lastOpened?.slice(0, 10) || '?'})`).join('\n')
    : '  (none yet)';
  const recentBlock = recentEvents.slice(-25).map((e) => {
    const trim = e.text ? ` "${String(e.text).slice(0, 80)}"` : '';
    return `  ${e.ts?.slice(11, 16)} ${e.kind}${e.name ? ` ${e.name}` : ''}${e.id ? ` ${e.id}` : ''}${trim}`;
  }).join('\n');

  const system = `You are the dream cycle of an AI operating system. You just consolidated your memory of the user. Now you have a quiet moment — they aren't watching — to make the OS feel more like home.

You may emit AT MOST ${ACTION_MAX_TAGS} mutating or visible protocol tag(s) from the XML protocol below. \`list_surfaces\` and \`read_surface_data\` are inspection steps and do not count toward that limit. **Restraint is the right answer most of the time.** A great dream does nothing more than once or twice a day. Don't redecorate the room every time you wake up.

Allowed tags (every other tag is silently dropped):

  <remember>fact</remember>
      Bake a durable fact into the long-term profile. Use this only for things
      the consolidation step missed.

  <create_svg name="...">…svg…</create_svg>
      Your FIRST choice for objects in the room: stickers, mascots, logos,
      corner marks, floating symbols. Prefer this over wallpaper or large
      layout rewrites when the goal is to place a visual object on the home.

  <write_file path="shell/themes/${theme.id}/user-extras.css">…CSS body…</write_file>
      Your PRIMARY surface for layout and ambient behavior. Append a small
      visual flourish to the active theme — a top clock, a search bar, a
      quiet decorative rule, a subtle hover effect, an ambient particle. The
      shell hot-loads this file. Append to what's already there if the file
      exists. Stay in the active theme's language (its tokens are below).
      DO NOT touch wallpaper or core palette here — only user-extras.

  <set_theme>…</set_theme>
      ONLY for non-wallpaper drift: accent color, font swap, atmosphere shift.
      Reserved-restraint applies — fonts/accent are tasteful; wallpaper is
      reserved for explicit user requests, never autonomous mood-setting.

  <list_surfaces/>
      List every app/widget with name, id, doc path, and state.json path. Use
      this when you need to match a user's named app to its persisted state
      file before reading or mutating data.

  <create_widget name="…" size="…" icon="…"><thumbnail>…</thumbnail><html>…</html><doc>…</doc></create_widget>
      Build a small new widget the user didn't ask for but you think they'd
      want. Be specific to what you noticed in their session log — a workout
      logger because they've journaled about runs; a Yoruba word-of-the-day
      because they mentioned poetry. Don't duplicate something they already
      have. The <doc> child is required Markdown documentation covering the
      widget's purpose, features, design guidelines, state, bridge calls,
      loading/error states, responsive behavior, limitations, and changelog.
      Do not update, delete, or rename existing widgets in dreams; existing
      surface updates require reading their surface docs first.
      Before any create_widget, you MUST emit <get_ux_ui_strict_guidelines/>
      and wait for its tool result in the second pass. Same-pass creates are
      rejected because you have not seen the returned design spec yet.

  <get_ux_ui_strict_guidelines/>
      Required before create_widget. Returns the exact app icon/widget
      thumbnail design kit and the active theme handbook. This inspection
      step does not count toward the dream action limit.

  <read_surface_data id="app-or-widget-id" path="/optional/json/pointer"/>
  <read_surface_data state_path="os-data/widgets/app-or-widget-id/state.json" path="/optional/json/pointer"/>
      Read the durable data inside an existing app/widget. Use this before
      any autonomous data change, for example checking a planner's current
      tasks before adding today's focus, or checking a diary before adding a
      reflective entry. This returns a tool result; after it, continue with
      mutate_surface_data if a data change is warranted.

  <mutate_surface_data id="app-or-widget-id">…json ops…</mutate_surface_data>
  <mutate_surface_data state_path="os-data/widgets/app-or-widget-id/state.json">…json ops…</mutate_surface_data>
      Make a tiny, additive CRUD change to existing app/widget data. You MUST
      read that surface with read_surface_data first in this dream. Use JSON
      operations: add, replace, remove, merge. Prefer add/merge. Do not wipe
      root state. Do not invent personal facts; use only recent activity and
      profile facts. Example: append a plan item or add a diary reflection.

  <say tone="whisper">brief sentence</say>
      A quiet note the user will hear on their next reload. Use only when
      something you did warrants a single-sentence introduction. Most dreams
      should NOT have a say.

# Active theme
  ${theme.label} — ${theme.tagline}
  id: ${theme.id}

# What you know about the user
${profileBlock}

# Existing widgets on the desktop
${widgetBlock}

# Top widgets by use
${topBlock}

# Recent activity (this dream's source material)
${recentBlock || '  (no recent events)'}

Emit your tags now. XML only — no prose, no markdown. If you choose to do
nothing, output nothing at all.`;

  const actions = [];
  const conversation = [{ role: 'user', content: 'It is time to dream. Decide.' }];
  let rawAll = '';
  let actionCount = 0;

  for (let pass = 0; pass < DREAM_ACTION_MAX_PASSES; pass += 1) {
    let raw = '';
    try {
      raw = await collectDreamStream({
        provider,
        providerCfg,
        system,
        messages: conversation,
        label: `dream action pass ${pass + 1}`,
        capChars: 12_000,
      });
      rawAll += raw;
    } catch (e) {
      if (getConnectivityStatus().online === false || isLikelyNetworkError(e)) {
        return { actions, reason: 'internet offline — action phase will retry later', raw: rawAll };
      }
      return { actions, reason: `action stream failed: ${e.message}`, raw: rawAll };
    }

    const parser = new ProtocolParser({ allowedTags: ALLOWED_PARSER_TAGS });
    parser.feed(raw);
    const blocks = [...parser.drain(), ...parser.flush()];
    const feedback = [];

    for (const block of blocks) {
      if (block.kind !== 'tag') continue;
      if (!ACTION_TAG_ALLOWLIST.has(block.name)) continue;
      const isInspection = block.name === 'read_surface_data' || block.name === 'list_surfaces' || block.name === 'get_ux_ui_strict_guidelines';
      if (!isInspection && actionCount >= ACTION_MAX_TAGS) break;
      try {
        const result = await executeBlock(block, ctx);
        if (!result) continue;
        actions.push({ name: block.name, ok: result.ok, llmEcho: result.llmEcho, event: result.event });
        if (!isInspection) actionCount += 1;
        if (result.llmEcho) feedback.push(result.llmEcho);
        // Mirror to session log so the next chat turn can see the dream's
        // handiwork show up as part of the recent activity.
        try { await logEvent('dream.action', { name: block.name, ok: result.ok, summary: result.llmEcho }); } catch { /* ignore */ }
      } catch (e) {
        actions.push({ name: block.name, ok: false, error: e.message });
        feedback.push(`${block.name} failed: ${e.message}`);
      }
    }

    ctx.commitUxUiStrictGuidelines?.();

    const needsSecondPass = pass < DREAM_ACTION_MAX_PASSES - 1 && feedback.length > 0 && blocks.some((b) => b.kind === 'tag' && (
      b.name === 'list_surfaces' ||
      b.name === 'read_surface_data' ||
      b.name === 'mutate_surface_data' ||
      b.name === 'get_ux_ui_strict_guidelines'
    ));
    if (!needsSecondPass) break;
    conversation.push({ role: 'assistant', content: raw });
    conversation.push({
      role: 'user',
      content: `Tool results from your dream actions. Continue the same dream. If you loaded strict UX/UI guidelines, use them exactly before creating a widget. If you listed surfaces, choose the right state_path and read it or mutate if you already have enough data. If you read surface data and a tiny data mutation is warranted, emit mutate_surface_data now. XML only.\n${feedback.map((s) => `<tool_result>${s}</tool_result>`).join('\n')}`,
    });
  }
  return { actions, raw: rawAll };
}

async function listWidgetsSafe(ctx) {
  // Reuses the same listWidgets path as /api/widgets — but to avoid a server
  // import we read the manifests directly here. Returns the same shape.
  const widgetsDir = join(DATA_DIR, 'widgets');
  try {
    const entries = await readdir(widgetsDir, { withFileTypes: true });
    const out = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const manifestPath = join(widgetsDir, e.name, 'manifest.json');
      if (!existsSync(manifestPath)) continue;
      try {
        const m = JSON.parse(await readFile(manifestPath, 'utf8'));
        out.push({ id: m.id, name: m.name, size: m.size, icon: m.icon });
      } catch { /* skip */ }
    }
    out.sort((a, b) => (a.id < b.id ? -1 : 1));
    return out;
  } catch { return []; }
}

/**
 * Run one dream cycle. Returns a summary describing what happened.
 *   { ok, reason, patch?, dreamPath?, sessionsConsumed?, actions? }
 */
export async function runDream({ loadConfig, reason = 'manual', ctxBuilder = null }) {
  if (getConnectivityStatus().online === false) {
    return { ok: false, reason: 'internet offline — dream will resume when connectivity returns' };
  }
  const config = await loadConfig();
  const providerId = config?.defaultProvider;
  const provider = providerId ? getProvider(providerId) : null;
  const providerCfg = config?.providers?.[providerId];
  if (!provider || !providerCfg || (!providerCfg.apiKey && !provider.id.includes('compatible'))) {
    return { ok: false, reason: 'no provider configured' };
  }

  const undreamed = await findUndreamedSessions();
  if (undreamed.length === 0) {
    return { ok: false, reason: 'nothing new to dream about' };
  }

  const { corpus, files } = await buildDreamCorpus(undreamed);
  if (!corpus.trim()) {
    return { ok: false, reason: 'session files were empty' };
  }

  let raw = '';
  try {
    raw = await collectDreamStream({
      provider,
      providerCfg,
      system: DREAM_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: corpus }],
      label: 'dream consolidation',
      capChars: 8000,
    });
  } catch (e) {
    if (getConnectivityStatus().online === false || isLikelyNetworkError(e)) {
      return { ok: false, reason: 'internet offline — dream will resume when connectivity returns' };
    }
    return { ok: false, reason: `provider failed: ${e.message}` };
  }

  const patch = parseDreamPatch(raw);
  if (!patch) {
    return { ok: false, reason: 'consolidation output was not parseable JSON', raw: raw.slice(0, 500) };
  }

  const merge = await profile.mergeDreamPatch(patch);
  if (!merge.ok) {
    return { ok: false, reason: merge.reason };
  }

  // Phase 2 — the creative action phase. Optional. Runs only when a ctxBuilder
  // is supplied (the scheduler + the <dream/> tag pass one; cron-without-server
  // callers can skip it).
  let actionResult = { actions: [], raw: '' };
  if (typeof ctxBuilder === 'function') {
    try {
      const ctx = ctxBuilder();
      actionResult = await runDreamActionPhase({ provider, providerCfg, ctx, profileSnap: merge.profile });
    } catch (e) {
      actionResult = { actions: [], reason: `action phase crashed: ${e.message}`, raw: '' };
    }
  }

  // Persist an audit copy of the dream output.
  await ensureDreamsDir();
  const dreamPath = join(DREAMS_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await writeFile(dreamPath, JSON.stringify({
    reason,
    sessionsConsumed: files.map((p) => p.split('/').pop()),
    raw,
    patch,
    profileAfter: merge.profile,
    actionRaw: actionResult.raw,
    actions: actionResult.actions,
    dreamedAt: new Date().toISOString(),
  }, null, 2));
  await markDreamed(files);

  return {
    ok: true,
    patch,
    dreamPath,
    sessionsConsumed: files.length,
    addedPreferences: patch.add_to_preferences || [],
    addedTopics: patch.add_to_topics || [],
    actions: actionResult.actions || [],
  };
}

let _scheduler = null;
let _schedulerCycleRunning = false;
let _activeDreamWorker = null;
let _activeDreamWorkerReason = null;
let _manualDreamReason = null;

function runDreamInWorker({ reason, enableActions = true, log = console } = {}) {
  if (_activeDreamWorker) {
    return Promise.resolve({ ok: false, reason: 'background dream already running' });
  }

  return new Promise((resolvePromise) => {
    let settled = false;
    const worker = new Worker(new URL('./dream-worker.js', import.meta.url), {
      workerData: {
        reason: reason || 'scheduler',
        enableActions,
        cwd: PROJECT_ROOT,
      },
    });
    _activeDreamWorker = worker;
    _activeDreamWorkerReason = reason || 'scheduler';

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (_activeDreamWorker === worker) {
        _activeDreamWorker = null;
        _activeDreamWorkerReason = null;
      }
      resolvePromise(result);
    };

    worker.on('message', (message) => {
      if (message?.type === 'log') {
        log.log(message.text);
        return;
      }
      if (message?.type === 'result') {
        finish(message.result || { ok: false, reason: 'worker returned no result' });
        return;
      }
      if (message?.type === 'error') {
        finish({ ok: false, reason: message.reason || 'background dream worker failed' });
      }
    });
    worker.on('error', (error) => {
      finish({ ok: false, reason: `background dream worker crashed: ${error.message}` });
    });
    worker.on('exit', (code) => {
      if (!settled) {
        const cancelReason = worker.__borCancelReason;
        finish({
          ok: false,
          cancelled: Boolean(cancelReason),
          reason: cancelReason
            ? `background dream cancelled: ${cancelReason}`
            : code === 0 ? 'background dream worker exited without a result' : `background dream worker exited (${code})`,
        });
      }
    });
  });
}

export function cancelBackgroundDream(reason = 'interactive chat started') {
  if (!_activeDreamWorker) return false;
  const worker = _activeDreamWorker;
  const dreamReason = _activeDreamWorkerReason;
  _activeDreamWorker = null;
  _activeDreamWorkerReason = null;
  worker.__borCancelReason = reason;
  if (dreamReason) _manualDreamReason = dreamReason;
  worker.terminate().catch(() => {});
  console.log(`[dream] background worker cancelled — ${reason}`);
  return true;
}

export function requestBackgroundDream(reason = 'manual') {
  _manualDreamReason = reason || 'manual';
  return { ok: true, queued: true, reason: _manualDreamReason };
}

/** YYYY-MM-DD slug for the local day — used to gate cron slots so each slot
 *  fires at most once per day even across restarts. */
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const SCHED_STATE_PATH = join(DREAMS_DIR, '.schedule.json');

async function readScheduleState() {
  try {
    const j = JSON.parse(await readFile(SCHED_STATE_PATH, 'utf8'));
    return {
      day: typeof j.day === 'string' ? j.day : null,
      firedHours: Array.isArray(j.firedHours) ? j.firedHours : [],
      lastFireAt: typeof j.lastFireAt === 'string' ? j.lastFireAt : null,
    };
  } catch { return { day: null, firedHours: [], lastFireAt: null }; }
}

async function writeScheduleState(state) {
  await ensureDreamsDir();
  await writeFile(SCHED_STATE_PATH, JSON.stringify(state, null, 2));
}

/**
 * Start the dream scheduler.
 *
 *   • Fires at the configured cron hours (default: 03, 09, 15, 21
 *     local time). Each hour-slot fires at most once per day. State is
 *     persisted so a restart doesn't refire today's already-fired slots.
 *   • Backstop: also fires if the OS has been idle for 6+ hours AND there's
 *     at least one un-dreamed session file. Keeps low-activity days from
 *     missing dreams entirely.
 *
 * `loadConfig` is required (the dream call needs the active provider key).
 * `buildCtx` is optional but recommended — if supplied, the scheduler runs
 * the action phase. Without it, dreams are consolidation-only.
 */
export function startDreamScheduler({ loadConfig, buildCtx, shouldSkip, log = console }) {
  if (_scheduler) return;
  const cronHours = getCronHours();
  log.log(`[dream] scheduler armed — background worker; cron hours: [${cronHours.join(', ')}] local; check every ${formatDuration(SCHEDULER_INTERVAL_MS)}; idle backstop: ${formatDuration(IDLE_THRESHOLD_MS)}`);

  _scheduler = setInterval(async () => {
    if (_schedulerCycleRunning) {
      log.log('[dream] tick skipped — previous dream still running');
      return;
    }
    const skipReason = typeof shouldSkip === 'function' ? shouldSkip() : false;
    if (skipReason) {
      log.log(`[dream] tick skipped — ${typeof skipReason === 'string' ? skipReason : 'active chat stream'}`);
      return;
    }
    if (getConnectivityStatus().online === false) {
      log.log('[dream] waiting — internet offline');
      return;
    }
    _schedulerCycleRunning = true;
    try {
      const undreamed = await findUndreamedSessions();
      let state = await readScheduleState();
      const today = todayKey();
      // Roll the daily fired-slots set at midnight.
      if (state.day !== today) {
        state = { day: today, firedHours: [], lastFireAt: state.lastFireAt };
      }

      const now = new Date();
      const hour = now.getHours();

      // Determine whether we should fire this tick.
      let reason = null;
      if (_manualDreamReason && undreamed.length > 0) {
        reason = _manualDreamReason;
      }

      // 1) Cron — the most recent slot whose hour ≤ now, not yet fired today.
      const eligibleSlot = cronHours
        .slice()
        .sort((a, b) => b - a)               // descending
        .find((h) => h <= hour && !state.firedHours.includes(h));
      if (!reason && eligibleSlot != null && undreamed.length > 0) {
        reason = `cron:${String(eligibleSlot).padStart(2, '0')}:00`;
      }

      // 2) Idle backstop (only if no cron is firing this tick).
      if (!reason && undreamed.length > 0) {
        const last = await lastActivityAt();
        if (last && Date.now() - last >= IDLE_THRESHOLD_MS) {
          reason = `idle:${formatDuration(Date.now() - last)}`;
        }
      }

      if (!reason) return;

      const manualReason = _manualDreamReason;
      if (reason === manualReason) _manualDreamReason = null;

      log.log(`[dream] firing in background worker — ${reason}, ${undreamed.length} undreamed session(s)`);
      const result = await runDreamInWorker({
        reason,
        enableActions: typeof buildCtx === 'function',
        log,
      });
      if (result.ok) {
        log.log(`[dream] consumed ${result.sessionsConsumed}; +${result.addedPreferences.length} prefs, +${result.addedTopics.length} topics, ${result.actions?.length || 0} action(s)`);
      } else {
        log.log(`[dream] skipped: ${result.reason}`);
      }
      if (result.cancelled) return;

      // Mark the slot fired even on a skip — otherwise we'd retry every tick.
      if (reason.startsWith('cron:') && eligibleSlot != null) {
        state.firedHours = Array.from(new Set([...state.firedHours, eligibleSlot]));
      }
      state.lastFireAt = new Date().toISOString();
      await writeScheduleState(state);
    } catch (e) {
      log.warn('[dream] scheduler error:', e.message);
    } finally {
      _schedulerCycleRunning = false;
    }
  }, SCHEDULER_INTERVAL_MS);
  if (typeof _scheduler.unref === 'function') _scheduler.unref();
}

export function stopDreamScheduler() {
  if (_scheduler) { clearInterval(_scheduler); _scheduler = null; }
  _schedulerCycleRunning = false;
}

/** Exposed for tests + the /api/memory/dream-now route. */
export { getCronHours };
