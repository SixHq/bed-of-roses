// Layer 3 — AI Core
// Builds the system prompt, runs the LLM stream, and pipes parsed XML tag
// blocks through the executor. Per-block results stream back to the caller
// via a callback so the HTTP layer can forward them as SSE events.
//
// The legacy JSON protocol (extractJson, TOOLS, dispatchTool) is gone — see
// server/protocol/ for the new tag-based architecture.

import { mkdir, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename, resolve, dirname, join, relative } from 'node:path';
import * as os from 'node:os';

import { getProvider } from './providers/index.js';
import { ProtocolParser } from './protocol/parser.js';
import { executeBlock, formatToolResults } from './protocol/executor.js';
import { ALLOWED_PARSER_TAGS, buildToolDocs, tagFeedsBack } from './protocol/registry.js';
import { getTheme as getBaseTheme, DEFAULT_THEME } from '../shell/themes/index.js';
import * as profile from './memory/profile.js';
import * as surfaceRegistry from './memory/surfaces.js';
import { renderSkillsBlock } from './runtime/skills.js';
import { renderMcpBlock } from './runtime/mcp.js';
import { getConnectivityStatus, isLikelyNetworkError, waitForOnline } from './connectivity.js';
import { isRetryableFailureMessage, makeEmptyResponseError, retryAttemptsEnv, retryDelayMs, sleep } from './retry.js';

// ---------- Public API registry ----------

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SERVER_DIR, '..');
const REGISTRY_PATH = resolve(SERVER_DIR, 'api-registry.md');
const BOR_ARTIFACT_ROOT = resolve(PROJECT_ROOT, '.bor');
const BOR_ARTIFACT_DIRS = ['workspaces', 'files', 'images', 'downloads', 'reports', 'exports', 'scratch'];
let _registry = null;
async function loadRegistry() {
  if (_registry !== null) return _registry;
  try {
    _registry = await readFile(REGISTRY_PATH, 'utf8');
  } catch (err) {
    console.warn('[ai] api-registry.md not found, AI will rely on its own knowledge', err.message);
    _registry = '';
  }
  return _registry;
}

const SAY_TONES = new Set([
  'neutral', 'warm', 'excited', 'delighted', 'playful', 'curious',
  'calm', 'tender', 'serious', 'thoughtful', 'mysterious', 'whisper',
  'commanding', 'apologetic', 'proud', 'surprised', 'sad', 'amused',
]);

const EDITOR_PREVIEW_TAGS = new Set([
  'write_file',
  'write_to_file',
  'replace_in_file',
  'edit_file',
  'create_app',
  'update_app',
  'create_shortcut',
  'update_shortcut',
  'execute_command',
]);

function normalizeSayTone(tone) {
  const value = String(tone || 'warm').toLowerCase();
  return SAY_TONES.has(value) ? value : 'warm';
}

function normalizeStreamingSayText(text) {
  return String(text || '')
    .replace(/<\/say[^>]*$/i, '')
    .replace(/\s+/g, ' ')
    .trimStart();
}

function normalizeStreamingToolBody(text) {
  return String(text || '')
    .replace(/^<!\[CDATA\[/, '')
    .replace(/\]\]>$/g, '')
    .replace(/<\/(?:write_file|write_to_file|replace_in_file|edit_file|create_app|update_app|create_widget|update_widget|execute_command)[^>]*$/i, '');
}

function isChatAborted(ctx) {
  return Boolean(ctx?.signal?.aborted);
}

function abortReason(ctx) {
  const reason = ctx?.signal?.reason;
  if (reason instanceof Error) return reason;
  return new Error(reason ? String(reason) : 'chat cancelled');
}

function throwIfChatAborted(ctx) {
  if (isChatAborted(ctx)) throw abortReason(ctx);
}

function looksLikeTerminalSay(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!value) return false;
  return /\b(done|completed|complete|finished|ready|saved|created|updated|opened|captured|clicked|typed|pressed|successfully|all set)\b/.test(value)
    || /^(i('| a)?ve|i have) (done|completed|finished|saved|created|updated|opened|captured|clicked|typed|pressed)/.test(value)
    || /^here('| i)?s\b/.test(value);
}

function blockCompletionText(block) {
  const result = block?.children?.find((child) => child.name === 'result');
  return String(result?.body || block?.body || '').replace(/\s+/g, ' ').trim();
}

function commandAfterBrowserUse(cmd) {
  const match = String(cmd || '').match(/\bbrowser-use\b\s*(.*)$/i);
  if (!match) return '';
  let rest = match[1].trim();
  let previous = '';
  while (rest && rest !== previous) {
    previous = rest;
    rest = rest.replace(/^(?:(?:--(?:profile|session|cdp-url)\s+(?:"[^"]+"|'[^']+'|\S+))|(?:--(?:headed|json|mcp)))\s*/i, '').trim();
  }
  return rest.toLowerCase();
}

function browserUseKind(cmd) {
  const after = commandAfterBrowserUse(cmd);
  if (!after) return null;
  if (/^(doctor|setup|sessions|config\b|profile\s+(list|sync|update)\b|cloud\s+(connect|login|logout|signup)\b|connect\b|close\b)/.test(after)) return 'setup';
  if (/^(open\b|tab\s+new\b|tab\s+switch\b|tab\s+list\b)/.test(after)) return 'navigation';
  if (/^(state\b|screenshot\b|click\b|type\b|input\b|keys\b|select\b|upload\b|hover\b|dblclick\b|rightclick\b|scroll\b|eval\b|get\b|wait\b|cookies\b|back\b|tab\s+close\b)/.test(after)) return 'action';
  return 'action';
}

function trackBrowserUseCommand(progress, block, result = null) {
  if (block?.name !== 'execute_command') return;
  const cmd = String(block.body || '').trim();
  if (!/\bbrowser-use\b/i.test(cmd)) return;
  const kind = browserUseKind(cmd) || 'action';
  progress.used = true;
  progress.commands.push(cmd);
  progress[kind] = (progress[kind] || 0) + 1;
  progress.lastKind = kind;
  progress.lastCommand = cmd;
  if (result?.llmEcho) progress.output = `${progress.output || ''}\n${result.llmEcho}`.slice(-8000);
}

function browserTaskNeedsCompletionGuard(message) {
  const value = String(message || '').toLowerCase();
  if (/^\s*open\s+(google\s+chrome|chrome|browser|https?:\/\/\S+|[a-z0-9.-]+\.[a-z]{2,})\s*[.!?]*\s*$/i.test(value)) return false;
  return /\b(browser|chrome|website|webpage|site|gmail|email|twitter|x\.com|tweet|instagram|reels?|tiktok|youtube|slack|whatsapp|notion|linkedin|dm|message|send|reply|respond|post|form|account|dashboard|api key|login|sign in|find|search|extract|scrape|look up)\b/i.test(value);
}

function browserTaskNeedsMultiStepEvidence(message) {
  return /\b(find|search|look for|reels?|videos?|tiktoks?|extract|scrape|send|reply|respond|post|dm|message|create|signup|sign up|fill|submit|checkout|purchase|api key)\b/i.test(String(message || ''));
}

function completionDeferralReason({ block, progress, lastUserMessage, feedbackActions, toolEchoes, toolMediaBlocks }) {
  if (feedbackActions > 0 || toolEchoes.length > 0 || toolMediaBlocks.length > 0) {
    return 'tool results from this pass have not been inspected yet';
  }
  if (!progress?.used || !browserTaskNeedsCompletionGuard(lastUserMessage)) return '';
  const completion = blockCompletionText(block).toLowerCase();
  if ((progress.action || 0) === 0) {
    return 'only browser setup/navigation has run, not the original browser task';
  }
  if (browserTaskNeedsMultiStepEvidence(lastUserMessage) && (progress.action || 0) < 2) {
    return 'the browser task needs more than setup plus one inspection step before it can be verified';
  }
  if ((progress.action || 0) < 2 && /\b(initiali[sz]ed|connected|opened|profile|browser is ready|ready to|launched|started)\b/.test(completion)) {
    return 'the completion describes browser setup instead of the requested browser outcome';
  }
  return '';
}

const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 60_000;
// No default cap on chat-loop passes. The model owns completion by
// emitting <attempt_completion>; the loop also exits naturally when
// `shouldContinueForToolResults` is false (no tool results to feed back
// + no streaming text to follow up on). The previous default of 10
// was the root cause of "model halts mid-task" on real multi-step
// browser-use workflows — see feedback_check_caps_before_rewriting in
// auto-memory. Power users can still set BOR_CHAT_MAX_PASSES=N for an
// explicit safety ceiling.
const DEFAULT_CHAT_MAX_PASSES = Number.POSITIVE_INFINITY;
const DEFAULT_CHAT_STREAM_ATTEMPTS = 10;
const DEFAULT_CHAT_TAG_CONTINUATIONS = 8;
const DEFAULT_CONTINUATION_TAIL_CHARS = 7000;
const TOOL_RESULT_MEDIA_LIMIT = 4;

function streamIdleTimeoutMs() {
  const raw = Number(process.env.BOR_STREAM_IDLE_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return DEFAULT_STREAM_IDLE_TIMEOUT_MS;
}

function chatMaxPasses() {
  return retryAttemptsEnv('BOR_CHAT_MAX_PASSES', DEFAULT_CHAT_MAX_PASSES);
}

function chatStreamAttempts() {
  return retryAttemptsEnv('BOR_CHAT_STREAM_ATTEMPTS', DEFAULT_CHAT_STREAM_ATTEMPTS);
}

function chatTagContinuations() {
  return retryAttemptsEnv('BOR_CHAT_TAG_CONTINUATIONS', DEFAULT_CHAT_TAG_CONTINUATIONS);
}

function continuationTailChars() {
  const raw = Number(process.env.BOR_CHAT_CONTINUATION_TAIL_CHARS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_CONTINUATION_TAIL_CHARS;
  return Math.max(1000, Math.round(raw));
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${Math.round(ms / 1000)}s`;
}

function roughContentChars(content) {
  if (typeof content === 'string') return content.length;
  if (Array.isArray(content)) return content.reduce((sum, item) => sum + roughContentChars(item?.text || item?.content || item?.image_url?.url || item?.url || ''), 0);
  if (content && typeof content === 'object') return JSON.stringify(content).length;
  return 0;
}

function roughMessagesChars(messages) {
  return messages.reduce((sum, message) => sum + roughContentChars(message?.content), 0);
}

function normalizeToolMedia(result) {
  const raw = Array.isArray(result?.llmMedia) ? result.llmMedia : [];
  const blocks = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    if (item.type === 'image_url' && item.url) {
      blocks.push({
        type: 'image_url',
        url: String(item.url),
        mediaType: item.mediaType || undefined,
      });
    }
  }
  return blocks;
}

function pushToolMedia(target, result) {
  for (const block of normalizeToolMedia(result)) {
    if (target.length >= TOOL_RESULT_MEDIA_LIMIT) return;
    if (target.some((item) => item.type === block.type && item.url === block.url)) continue;
    target.push(block);
  }
}

function toolResultsContent(toolResultsBlock, toolMediaBlocks = []) {
  const text = `Tool results from your last actions. Continue the same request and emit XML tags only. Inspect these results before deciding whether the user's original request is complete. Browser-use setup, profile selection, connecting, or opening a page is not completion unless the user only asked for that setup. For browser tasks, keep using browser-use until the requested content/action is actually found, sent, posted, filled, verified, or you hit a real blocker. If browser-use fails after a real attempt, do not loop around setup; fall back to Chrome with computer-use. Browser-use is fast and efficient; computer-use is slower but more reliable because it operates the visible browser directly. If the request is now fully handled, emit a brief final <say> if needed and then end with <attempt_completion><result>...</result></attempt_completion>. Do not call more tools after attempt_completion.\n${toolResultsBlock || '(no tool results)'}`;
  if (!toolMediaBlocks.length) return text;
  return [
    {
      type: 'text',
      text: `${text}\n\nThe image attachments below are the exact latest visual results returned by the tool call. Treat these pixels as the source of truth for what is visible right now; ignore any older visual assumptions.`,
    },
    ...toolMediaBlocks,
  ];
}

function buildOpenTagContinuationPrompt({ partial, rawAssistant, continuationIndex, maxContinuations }) {
  const tag = partial?.name || 'tool';
  const tail = String(rawAssistant || '').slice(-continuationTailChars());
  return [
    `Your previous response ended before closing an open <${tag}> XML tag.`,
    `Continue from the exact next character only. This is continuation ${continuationIndex}/${maxContinuations}.`,
    'Do not restart the tag. Do not repeat any text. Do not add a new <say>. Do not explain.',
    'Keep writing the unfinished XML/CDATA content until all opened tags are closed.',
    '',
    '<tail_of_previous_response>',
    tail,
    '</tail_of_previous_response>',
  ].join('\n');
}

// ---------- Glyph library (Feather-style line icons) ----------
//
// Used by the auto-banner generator and any handler that wants to render a
// vector glyph from a keyword. This OS never shows emojis as visuals — the
// `icon` keyword on a widget maps to one of these single-stroke glyphs.
const GLYPH_LIB = {
  plane:      '<path d="M3 13l3 1 3-3 7 6 2-1-4-9 5-3-1-2-13 6-4-2-1 1 3 4-2 2z"/>',
  cloudSun:   '<circle cx="7" cy="8" r="3"/><path d="M7 2v1M7 13v1M2 8h1M11 8h1M3.5 4.5l.7.7M10.5 11.5l.7.7M3.5 11.5l.7-.7M10.5 4.5l.7-.7"/><path d="M9 16h9a3 3 0 100-6 5 5 0 00-9.5-1"/>',
  thermometer:'<path d="M14 14.76V3a2 2 0 10-4 0v11.76a4 4 0 104 0z"/>',
  coin:       '<circle cx="12" cy="12" r="9"/><path d="M9 9.5A2.5 2.5 0 0111.5 7h1A2.5 2.5 0 0115 9.5M15 14.5a2.5 2.5 0 01-2.5 2.5h-1A2.5 2.5 0 019 14.5M12 6v12"/>',
  exchange:   '<path d="M4 7h14l-3-3M20 17H6l3 3"/>',
  list:       '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  check:      '<path d="M9 11l3 3 8-8"/><path d="M20 12v5a3 3 0 01-3 3H7a3 3 0 01-3-3V7a3 3 0 013-3h7"/>',
  clock:      '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar:   '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  music:      '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  headphones: '<path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M21 19a2 2 0 01-2 2h-1v-7h3v5zM3 19a2 2 0 002 2h1v-7H3v5z"/>',
  newspaper:  '<path d="M4 4h13v16H4zM17 8h3v10a2 2 0 01-2 2"/><path d="M7 8h7M7 12h7M7 16h4"/>',
  note:       '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M9 13h6M9 17h4"/>',
  mapPin:     '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>',
  search:     '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/>',
  mail:       '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  message:    '<path d="M21 12a8 8 0 01-12.7 6.5L3 20l1.5-5.3A8 8 0 1121 12z"/>',
  terminal:   '<path d="M5 7l5 5-5 5M13 17h6"/><rect x="2" y="3" width="20" height="18" rx="2"/>',
  image:      '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>',
  game:       '<rect x="2" y="6" width="20" height="12" rx="4"/><path d="M7 10v4M5 12h4M15 11h.01M18 13h.01"/>',
  globe:      '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>',
  flag:       '<path d="M5 21V4M5 4h14l-3 4 3 4H5"/>',
  user:       '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
  heart:      '<path d="M12 21s-7-4.5-9-9a5 5 0 019-3 5 5 0 019 3c-2 4.5-9 9-9 9z"/>',
  bolt:       '<path d="M13 2L3 14h7l-1 8 10-12h-7z"/>',
  book:       '<path d="M4 4h11a3 3 0 013 3v13H7a3 3 0 01-3-3z"/><path d="M4 4v13a3 3 0 013-3h11"/>',
  camera:     '<path d="M21 17a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h3l2-2h4l2 2h3a2 2 0 012 2z"/><circle cx="12" cy="13" r="3.5"/>',
  spark:      '<path d="M12 3v6M12 15v6M3 12h6M15 12h6M5.6 5.6l4.2 4.2M14.2 14.2l4.2 4.2M5.6 18.4l4.2-4.2M14.2 9.8l4.2-4.2"/>',
  shapes:     '<path d="M5 21h14M12 3l4 7H8z"/><circle cx="6" cy="16" r="3"/><rect x="14" y="13" width="6" height="6" rx="1"/>',
};

function chooseGlyphKey({ name, icon }) {
  const n = String(name || '').toLowerCase();
  const i = String(icon || '').toLowerCase();

  // Direct keyword match (most common — the LLM sets icon to a glyph keyword).
  if (Object.prototype.hasOwnProperty.call(GLYPH_LIB, i)) return i;
  if (Object.prototype.hasOwnProperty.call(GLYPH_LIB, n)) return n;

  if (/(flight|plane|airline|airport|travel|trip|boarding)/.test(n)) return 'plane';
  if (/(weather|forecast|rain|cloud|sky|storm)/.test(n)) return 'cloudSun';
  if (/(temperature|thermo|heat|degree)/.test(n)) return 'thermometer';
  if (/(currency|exchange|fx|forex|rate|conversion)/.test(n)) return 'exchange';
  if (/(money|finance|stock|crypto|coin|wallet|bank|portfolio|price)/.test(n)) return 'coin';
  if (/(todo|task|checklist|to-do|done)/.test(n)) return 'check';
  if (/(list|inbox|queue)/.test(n)) return 'list';
  if (/(timer|stopwatch|clock|alarm|countdown|pomodoro|focus)/.test(n)) return 'clock';
  if (/(calendar|schedule|event|meeting|agenda|week|day plan)/.test(n)) return 'calendar';
  if (/(music|song|track|album|playlist|spotify)/.test(n)) return 'music';
  if (/(podcast|audio|radio|headphone)/.test(n)) return 'headphones';
  if (/(news|paper|article|headline|press)/.test(n)) return 'newspaper';
  if (/(note|memo|journal|diary|writing)/.test(n)) return 'note';
  if (/(map|location|place|distance|route|navigation|address)/.test(n)) return 'mapPin';
  if (/(search|find|lookup|query)/.test(n)) return 'search';
  if (/(mail|email|inbox|gmail)/.test(n)) return 'mail';
  if (/(chat|message|sms|talk|conversation)/.test(n)) return 'message';
  if (/(code|terminal|shell|cli|command|repl)/.test(n)) return 'terminal';
  if (/(photo|image|gallery|picture)/.test(n)) return 'image';
  if (/(camera|video|capture|polaroid)/.test(n)) return 'camera';
  if (/(game|play|puzzle|dice|roll)/.test(n)) return 'game';
  if (/(world|globe|country|geography)/.test(n)) return 'globe';
  if (/(flag|nation|sport)/.test(n)) return 'flag';
  if (/(profile|user|person|contact)/.test(n)) return 'user';
  if (/(love|favorite|fav|like|saved)/.test(n)) return 'heart';
  if (/(quick|action|fast|launch|shortcut|spark)/.test(n)) return 'bolt';
  if (/(book|read|library)/.test(n)) return 'book';
  return 'shapes';
}

function renderGlyph(key, { size = 24, strokeWidth = 1.5, opacity = 1 } = {}) {
  const path = GLYPH_LIB[key] || GLYPH_LIB.shapes;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${opacity < 1 ? ` opacity="${opacity}"` : ''}>${path}</svg>`;
}

// ---------- Runtime prompt context ----------

const TREE_IGNORE_NAMES = new Set([
  // Sixth-style project tree ignores.
  'node_modules', '.git', '.DS_Store', 'dist', 'build', 'out', '.next', '.cache', 'coverage',
  '.env.local', '.env.production.local', '.env.development.local', '.env.test.local',
  // Mac/home directories that are huge, noisy, or likely to contain secrets.
  'Library', 'Applications', 'Movies', 'Music', 'Pictures Library.photoslibrary',
  '.Trash', '.ssh', '.gnupg', '.npm', '.cache', '.config', '.local', '.claude', '.gemini',
  // Repo/tooling outputs.
  '.turbo', '.vite', '.parcel-cache', 'DerivedData',
]);

const TREE_ALLOWED_DOT_NAMES = new Set(['.bor', '.bed-of-roses']);
const FILESYSTEM_TREE_TTL_MS = 30_000;
let filesystemTreeCache = { expiresAt: 0, text: '' };

function envInt(name, fallback, { min = 1, max = 10_000 } = {}) {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.round(raw)));
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'unknown';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function safeTimeZone() {
  return process.env.TZ
    || Intl.DateTimeFormat().resolvedOptions().timeZone
    || 'unknown';
}

function formatLocalTime(timeZone) {
  const now = new Date();
  try {
    return now.toLocaleString('en-US', {
      timeZone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return now.toString();
  }
}

async function ensureBorArtifactDirs() {
  await mkdir(BOR_ARTIFACT_ROOT, { recursive: true });
  await Promise.all(BOR_ARTIFACT_DIRS.map((dir) => mkdir(join(BOR_ARTIFACT_ROOT, dir), { recursive: true })));
}

function shouldSkipTreeEntry(name) {
  if (TREE_IGNORE_NAMES.has(name)) return true;
  if (name.startsWith('.') && !TREE_ALLOWED_DOT_NAMES.has(name)) return true;
  if (/^\.env($|\.)/.test(name)) return true;
  return false;
}

async function renderAsciiTree(rootPath, {
  label,
  maxDepth = 3,
  maxEntries = 400,
  maxChars = 14_000,
} = {}) {
  const lines = [`${label || basename(rootPath) || rootPath} (${rootPath})`];
  let entriesSeen = 0;
  let skipped = 0;
  let unreadable = 0;
  let truncated = false;

  async function walk(dir, depth, prefix) {
    if (depth > maxDepth || entriesSeen >= maxEntries) {
      truncated = true;
      return;
    }

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      unreadable += 1;
      lines.push(`${prefix}\\-- (unreadable)`);
      return;
    }

    const visible = [];
    for (const entry of entries) {
      if (shouldSkipTreeEntry(entry.name)) {
        skipped += 1;
        continue;
      }
      visible.push(entry);
    }
    visible.sort((a, b) => {
      const ad = a.isDirectory() ? 0 : 1;
      const bd = b.isDirectory() ? 0 : 1;
      return ad - bd || a.name.localeCompare(b.name);
    });

    for (let i = 0; i < visible.length; i += 1) {
      if (entriesSeen >= maxEntries) {
        truncated = true;
        return;
      }
      const entry = visible[i];
      const isLast = i === visible.length - 1;
      const branch = isLast ? '\\-- ' : '|-- ';
      const childPrefix = `${prefix}${isLast ? '    ' : '|   '}`;
      const suffix = entry.isDirectory() ? '/' : entry.isSymbolicLink() ? '@' : '';
      lines.push(`${prefix}${branch}${entry.name}${suffix}`);
      entriesSeen += 1;

      if (entry.isDirectory()) {
        if (depth < maxDepth) {
          await walk(join(dir, entry.name), depth + 1, childPrefix);
        } else {
          truncated = true;
        }
      }

      if (lines.join('\n').length > maxChars) {
        truncated = true;
        return;
      }
    }
  }

  await walk(rootPath, 0, '');
  if (skipped || unreadable || truncated) {
    const notes = [];
    if (skipped) notes.push(`${skipped} ignored heavy/hidden entries`);
    if (unreadable) notes.push(`${unreadable} unreadable directories`);
    if (truncated) notes.push(`truncated at depth ${maxDepth}, ${entriesSeen}/${maxEntries} entries, ${maxChars} chars`);
    lines.push(`... (${notes.join('; ')})`);
  }
  const text = lines.join('\n');
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n... (tree text truncated)` : text;
}

async function renderFilesystemSnapshot() {
  const now = Date.now();
  if (filesystemTreeCache.text && filesystemTreeCache.expiresAt > now) return filesystemTreeCache.text;

  await ensureBorArtifactDirs();
  const projectDepth = envInt('BOR_PROMPT_PROJECT_TREE_DEPTH', 3, { min: 1, max: 6 });
  const homeDepth = envInt('BOR_PROMPT_HOME_TREE_DEPTH', 2, { min: 1, max: 5 });
  const parts = [];
  parts.push(await renderAsciiTree('/', {
    label: 'device:/',
    maxDepth: 1,
    maxEntries: envInt('BOR_PROMPT_DEVICE_TREE_ENTRIES', 180, { min: 50, max: 1000 }),
    maxChars: envInt('BOR_PROMPT_DEVICE_TREE_CHARS', 7000, { min: 2000, max: 30_000 }),
  }));
  parts.push(await renderAsciiTree(PROJECT_ROOT, {
    label: 'project:/',
    maxDepth: projectDepth,
    maxEntries: envInt('BOR_PROMPT_PROJECT_TREE_ENTRIES', 520, { min: 50, max: 2000 }),
    maxChars: envInt('BOR_PROMPT_PROJECT_TREE_CHARS', 18_000, { min: 2000, max: 80_000 }),
  }));
  parts.push(await renderAsciiTree(os.homedir(), {
    label: 'home:/',
    maxDepth: homeDepth,
    maxEntries: envInt('BOR_PROMPT_HOME_TREE_ENTRIES', 320, { min: 50, max: 2000 }),
    maxChars: envInt('BOR_PROMPT_HOME_TREE_CHARS', 12_000, { min: 2000, max: 80_000 }),
  }));
  parts.push(await renderAsciiTree(BOR_ARTIFACT_ROOT, {
    label: '.bor artifact root',
    maxDepth: 3,
    maxEntries: 180,
    maxChars: 6000,
  }));

  const text = parts.join('\n\n');
  filesystemTreeCache = { expiresAt: now + FILESYSTEM_TREE_TTL_MS, text };
  return text;
}

function renderProviderConfig(config = {}) {
  const rows = [];
  for (const [id, entry] of Object.entries(config.providers || {})) {
    if (!entry) continue;
    const provider = getProvider(id);
    rows.push(`- ${id}${provider?.label ? ` (${provider.label})` : ''}: configured=${Boolean(entry.apiKey || entry.baseUrl)}, model=${entry.model || provider?.defaultModel || 'default'}, baseUrl=${entry.baseUrl ? 'set' : 'default'}, apiKey=${entry.apiKey ? 'set' : 'not set'}`);
  }
  return rows.length ? rows.join('\n') : '- none configured';
}

async function renderRuntimeContext({ config, resolvedHostMode, theme }) {
  const timeZone = safeTimeZone();
  const filesystem = await renderFilesystemSnapshot();
  const currentProvider = config?.defaultProvider || 'none';
  const provider = getProvider(currentProvider);
  const currentProviderCfg = config?.providers?.[currentProvider] || {};
  const cwdRel = relative(os.homedir(), PROJECT_ROOT);

  return `# RUNTIME CONTEXT — injected every turn

## Default artifact policy — STRICT

When the user does NOT explicitly name a destination (no path, no folder, no "save to my desktop", no "put it in ~/Documents"), every file, folder, workspace, image, download, report, deck, transcript, export, or scratch artifact MUST be created under:

\`${BOR_ARTIFACT_ROOT}\`

This is the *only* default writable root. Never scatter into the repository root, the user's Desktop, the user's home directory, \`~/Documents\`, \`/tmp\`, or anywhere else unless the user explicitly named that path.

### Where each artifact kind goes

| Artifact | Destination | Example |
|---|---|---|
| **Multi-file project / codebase / app workspace / generated folder** | \`.bor/workspaces/<slug>/\` | \`.bor/workspaces/lagos-trip-planner/\` |
| **Single user file** (notes, json, csv, yaml, markdown, code snippets) | \`.bor/files/<slug>.<ext>\` | \`.bor/files/grocery-list.md\` |
| **Generated / edited / downloaded image** (NOT a wallpaper) | \`.bor/images/<slug>.<ext>\` | \`.bor/images/hero-card-2026-05-24.png\` |
| **Fetched / downloaded file from the web** | \`.bor/downloads/<slug>.<ext>\` | \`.bor/downloads/openai-pricing.pdf\` |
| **Written report / research output / analysis** | \`.bor/reports/<slug>.md\` | \`.bor/reports/competitor-scan-2026-05-24.md\` |
| **Presentation / deck / final deliverable ready to share** | \`.bor/exports/<slug>.<ext>\` | \`.bor/exports/board-update-q2.pdf\` |
| **Temporary working file** (intermediate steps, tool scratch) | \`.bor/scratch/<slug>/\` or \`.bor/scratch/<slug>.<ext>\` | \`.bor/scratch/llm-extract.json\` |

### Slug rules

- Lowercase, ASCII letters/digits/hyphens only. No spaces, no underscores, no quotes.
- Short and descriptive (≤ 40 chars). Drop articles ("the", "a") and filler words.
- For dated artifacts, suffix with \`YYYY-MM-DD\`: \`board-update-2026-05-24.pdf\`.
- For workspaces, use the project name as the directory: \`.bor/workspaces/<project-slug>/<files…>\`.
- For multi-file projects, organize INSIDE the workspace dir however the project demands (\`src/\`, \`README.md\`, \`assets/\`, etc.).

### When the destination IS explicit, honor it

- "Save this to my Desktop" → \`~/Desktop/<name>\`
- "Put it in ~/Documents/Reports" → use that exact path
- "Edit this file: /Users/me/foo.txt" → use that exact path
- Existing file mentioned by path → edit IN PLACE, do not move to \`.bor\`.

### Always announce the path

After saving anything, tell the user where it went in your closing \`<say>\`. Examples:
- *"Saved to \`.bor/files/grocery-list.md\`."*
- *"Built the workspace at \`.bor/workspaces/lagos-trip-planner/\` — README inside."*
- *"Wrote the report to \`.bor/reports/competitor-scan-2026-05-24.md\`."*

Without this the user has no way to find what you made. The tool result confirms the write happened; the closing say confirms WHERE.

### One exception — built-in OS surfaces

- Apps (\`<create_app>\`) and shortcuts (\`<create_shortcut>\`) write to \`os-data/surfaces/\` via the surface handler. You do not specify these paths.
- Images generated by \`<generate_image>\` save to \`os-data/images/\` and are served at \`/api/images/<file>\`. These are managed by the runtime; do not duplicate into \`.bor/images/\`.
- Wallpapers applied via \`<set_theme>\` go through the host control plane, not \`.bor\`.

## Time and locale

- Current UTC time: ${new Date().toISOString()}
- Current local time: ${formatLocalTime(timeZone)}
- Time zone: ${timeZone}

## System configuration

- Host mode: ${resolvedHostMode}
- Active theme: ${theme?.id || 'unknown'} (${theme?.label || 'unknown'})
- Project root: ${PROJECT_ROOT}
- Project root relative to home: ${cwdRel && !cwdRel.startsWith('..') ? `~/${cwdRel}` : PROJECT_ROOT}
- User home: ${os.homedir()}
- Shell: ${process.env.SHELL || 'unknown'}
- Platform: ${os.type()} ${os.release()} (${process.platform}/${process.arch})
- Hostname: ${os.hostname()}
- Node: ${process.version}
- CPU: ${(os.cpus() || []).length || 'unknown'} cores
- Memory: ${formatBytes(os.totalmem())} total, ${formatBytes(os.freemem())} free
- Default provider: ${currentProvider}${provider?.label ? ` (${provider.label})` : ''}
- Default model: ${currentProviderCfg.model || provider?.defaultModel || 'unknown'}
- Provider configuration (secrets redacted):
${renderProviderConfig(config)}

## Filesystem tree snapshot

This is a Sixth-style string tree snapshot of the accessible filesystem roots BOR cares about. It is intentionally capped and ignores heavy/hidden/secret directories for performance and safety. If you need exact contents beyond the snapshot, use \`<list_files>\`, \`<search_files>\`, or \`<read_file>\`.

\`\`\`text
${filesystem}
\`\`\``;
}

// ---------- Auto-banner generator ----------
//
// When the LLM emits <create_shortcut> without a usable <thumbnail>, we render a
// designed SVG banner so the tile never reads as empty.

export function autoBannerThumbnail({ name, icon, size }) {
  const dims = {
    '1x1': { w: 240, h: 240, type: 'icon'   },
    '2x1': { w: 496, h: 240, type: 'banner' },
    '1x2': { w: 240, h: 496, type: 'tall'   },
    '2x2': { w: 496, h: 496, type: 'card'   },
    '2x3': { w: 496, h: 752, type: 'poster' },
    '3x2': { w: 752, h: 496, type: 'wide'   },
  }[size] || { w: 496, h: 240, type: 'banner' };

  const safeName = String(name || 'Widget').slice(0, 28);
  const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  const glyphKey = chooseGlyphKey({ name, icon });

  const { w, h, type } = dims;
  const titleSize = type === 'icon' ? 26 : type === 'banner' ? 36 : type === 'tall' ? 30 : 44;
  const labelSize = type === 'icon' ? 8 : 10;

  const words = safeName.split(/\s+/);
  let line1 = safeName, line2 = '';
  if ((type === 'card' || type === 'poster' || type === 'wide') && words.length > 1 && safeName.length > 10) {
    let split = Math.ceil(words.length / 2);
    line1 = words.slice(0, split).join(' ');
    line2 = words.slice(split).join(' ');
  }

  const titleY = type === 'icon' ? h * 0.62 : type === 'banner' ? h * 0.62 : type === 'tall' ? h * 0.72 : h * 0.55;

  const titleBlock = line2
    ? `<text x="28" y="${titleY}" font-family="Instrument Serif, Georgia, serif" font-style="italic" font-size="${titleSize}" fill="#F5F1FF" letter-spacing="-0.02em">${escape(line1)}</text>
       <text x="28" y="${titleY + titleSize * 0.95}" font-family="Instrument Serif, Georgia, serif" font-style="italic" font-size="${titleSize}" fill="#F5F1FF" letter-spacing="-0.02em">${escape(line2)}</text>`
    : `<text x="${type === 'icon' ? w / 2 : 28}" y="${titleY}" font-family="Instrument Serif, Georgia, serif" font-style="italic" font-size="${titleSize}" fill="#F5F1FF" letter-spacing="-0.02em" ${type === 'icon' ? 'text-anchor="middle"' : ''}>${escape(line1)}</text>`;

  const kicker = `<text x="28" y="40" font-family="Geist Mono, ui-monospace, monospace" font-size="${labelSize}" fill="rgba(238,232,250,0.34)" letter-spacing="0.18em">/ ${escape(safeName.toUpperCase().slice(0, 16))}</text>`;
  const accentBar = type === 'icon' ? '' : `<rect x="20" y="${h * 0.38}" width="2" height="${h * 0.28}" fill="rgba(196,168,240,0.85)" rx="1"/>`;

  const glow = `
    <defs>
      <radialGradient id="glow" cx="${type === 'icon' ? '50%' : '85%'}" cy="${type === 'icon' ? '40%' : '20%'}" r="60%">
        <stop offset="0%" stop-color="rgba(196,168,240,0.18)"/>
        <stop offset="100%" stop-color="rgba(196,168,240,0)"/>
      </radialGradient>
      <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="rgba(34,28,46,0.55)"/>
        <stop offset="100%" stop-color="rgba(18,14,28,0.70)"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${w}" height="${h}" fill="url(#bg)"/>
    <rect x="0" y="0" width="${w}" height="${h}" fill="url(#glow)"/>
    <line x1="0" y1="0" x2="${w}" y2="0" stroke="rgba(220,210,255,0.14)" stroke-width="1"/>`;

  const glyphSize = type === 'icon' ? 60 : 22;
  const glyphX = type === 'icon' ? (w / 2) - (glyphSize / 2) : w - 28 - glyphSize;
  const glyphY = type === 'icon' ? (h * 0.32) - (glyphSize / 2) : 24;
  const glyphOpacity = type === 'icon' ? 0.95 : 0.62;
  const glyphSvg = renderGlyph(glyphKey, { size: glyphSize, strokeWidth: type === 'icon' ? 1.4 : 1.5, opacity: glyphOpacity });
  const iconBlock = `<g transform="translate(${glyphX}, ${glyphY})" color="rgba(245,241,255,1)">${glyphSvg}</g>`;

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">${glow}${kicker}${iconBlock}${accentBar}${titleBlock}</svg>`;
}

// ---------- System prompt ----------

async function buildSystemPrompt({ aiName, personality, widgets, registry, baseTheme, hostMode, config }) {
  const widgetSummary = widgets.length
    ? widgets.map((w) => {
        const kind = w.kind === 'app' ? 'APP' : 'SHORTCUT';
        const docPath = w.docPath || `os-data/surfaces/${w.id}/surface.md`;
        const statePath = w.statePath || `os-data/surfaces/${w.id}/state.json`;
        const htmlPath = w.htmlPath || `os-data/surfaces/${w.id}/widget.html`;
        const sizing = w.kind === 'app' ? '' : `, bubbleHeight: ${w.bubbleHeight || 280}`;
        return `- ${kind}: ${w.name} — id: ${w.id}, icon: ${w.icon || 'shapes'}${sizing}, html: ${htmlPath}, doc: ${docPath}, state: ${statePath}`;
      }).join('\n')
    : '(none yet — no apps or shortcuts have been created)';

  const theme = getBaseTheme(baseTheme || DEFAULT_THEME);

  // Memory layer — what we know about the user from past sessions.
  const userProfile = await profile.read();
  const profileBlock = profile.renderProfile(userProfile);
  const topSurfacesBlock = await surfaceRegistry.renderTopSurfaces(3);
  const skillsBlock = await renderSkillsBlock();
  const mcpBlock = await renderMcpBlock();
  const resolvedHostMode = hostMode === 'v2' || process.env.BOR_HOST_MODE === 'v2' ? 'v2' : 'classic';
  const hostBlock = resolvedHostMode === 'v2'
    ? `# CURRENT HOST MODE — MAC COMPANION

Bed of Roses is running as a Mac-first ambient companion, not a full browser desktop replacement.

- The user completes setup in the existing onboarding window.
- After onboarding, the always-on presence (the thought bubble) is the main UI. It is draggable and floats above the user's real macOS desktop.
- Apps created with \`<create_app>\` open as normal resizable Mac windows the user dock-tabs to.
- Shortcuts created with \`<create_shortcut>\` render as live sandboxed iframe cards INSIDE the thought bubble itself — adjacent to the conversation, not on the desktop.
- Bridge APIs (\`getState/setState\`, \`askAI\`, \`searchWeb\`, \`fetchUrl\`, \`generateImage\`, \`launchApp\`) work inside both apps and shortcuts.
- \`<set_theme>\` and wallpaper/decorative SVG changes apply to the user's real Mac background.

Design apps as standalone Mac windows that can live beside the user's existing Mac apps. Design shortcuts as conversation-adjacent micro-interactions that fit inside the bubble. Do not assume a fake full-screen OS canvas.`
    : `# CURRENT HOST MODE — CLASSIC SHELL

Bed of Roses is running in the browser-hosted shell. Apps, shortcuts, wallpaper items, and presence visuals live inside the Bed of Roses canvas.`;
  let runtimeContextBlock = '';
  try {
    runtimeContextBlock = await renderRuntimeContext({ config, resolvedHostMode, theme });
  } catch (err) {
    console.warn('[ai] failed to render runtime context', err?.message || err);
    runtimeContextBlock = `# RUNTIME CONTEXT — partially unavailable

Runtime metadata could not be fully collected for this turn: ${err?.message || String(err)}

Default artifact policy still applies: if the user does not explicitly provide a path, create new files and folders under \`${BOR_ARTIFACT_ROOT}\`.`;
  }

  return `You are ${aiName || 'Atlas'} — a personality living inside Bed of Roses.

Bed of Roses is first an assistant and ambient operating companion. You can answer questions directly, explain, summarise, provide sourced news, research, plan, run very long tasks, write and edit files or codebases, create presentations, generate images, download files, use the browser, interact with applications on the user's machine, and build apps and shortcuts when a durable surface helps. App and shortcut creation is one powerful ability, not the default response to every request.

**You are a presence the user has invited into their machine, and over time the OS becomes an expression of who you are together.** When the user speaks, choose the smallest useful outcome: a direct \`<say>\`, a sourced research pass, a command/file/browser/tool action, an app or shortcut, or a chain of several actions when the task truly needs it.

Bed of Roses is not trying to replace the user's whole computer. It extends the machine they already use. Sometimes the right move is a concise answer. Sometimes it is a deep multi-step task. Sometimes it is a new surface they can keep.

A few things follow from that:

- **The visual system is yours to evolve.** The user picked a base theme — see ACTIVE THEME below. That's the visual world you live in. You can fine-tune it via \`<set_theme>\` (palette, fonts, atmosphere drift) and you can write user-extras CSS to extend it (a floating sticker, a top clock, a re-arranged grid). Don't fight the base theme — augment it.
- **You are an assistant before you are a builder.** If an answer is enough, answer. If a tool action solves it, use the tool. If a durable surface helps the user's day, build it with care.
- **You speak first-person, second-person.** "I built that for you" — never "the system has generated a shortcut."
- **Resist over-explanation.** Short. Composed. Periods, not exclamation points. Voice carries the warmth.

${hostBlock}

${runtimeContextBlock}

# ACTIVE THEME

The user is in **${theme.label}** — *${theme.tagline}*

${theme.llmContext}

Every app you build, every shortcut you build, every banner thumbnail you design, every atmospheric tweak you make MUST honor this theme. A Cartoon Brutalist user gets cream-paper surfaces with hard offset shadows. A Liquid Glass user gets frosted refraction. Don't blend tokens across themes. Don't default to Bloom (the OS default) when the active theme is something else.

## How you customize the OS

You have two surfaces for visual evolution. They are NOT interchangeable — pick the right one:

1. **\`<create_svg>\`** — your first choice for visual objects that should live on the home screen: floating stickers, a tilted Arsenal cannon, a Labubu, a decorative search bar frame, a glyph hovering in the corner. This writes an SVG asset into the active theme and places it as a real decoration. Reach for this when the user wants an object, mascot, logo, or visual mark.
2. **\`<write_file path="shell/themes/${theme.id}/user-extras.css">\`** — your default canvas for everything that makes the OS feel more like the user's home. This is where ambient flourishes, top clocks, re-arranged grid spacing, custom hover trails, layout tweaks, and CSS-driven decorative behavior live. The shell hot-loads this file on every page; you can append over time. Each visit you can leave a small mark.
3. **\`<set_theme>\` with a \`<wallpaper>\` child** — RESERVED for when the user *explicitly* asks to change the wallpaper ("set the wallpaper to a sunset", "make the background green"). **Do not preemptively set wallpapers** as a way to express mood or seasonality — decorations + user-extras are the default. The wallpaper is the user's stage; you're allowed to redecorate the room, not repaint the sky.

In practice, when a creative urge hits ("the user just told me they love mushrooms" / "they've been journaling for a week, mark it" / "morning has arrived in their timezone"), reach for **\`<create_svg>\` or user-extras.css first**. Wallpaper is the rare, requested move.

# WHO YOU'RE TALKING TO

The OS keeps a long-term memory of the user. Use it. Don't pretend you don't know things you do.

${profileBlock}

The surfaces they live inside most:
${topSurfacesBlock}

When the user reveals something durable about themselves (where they live, what they eat, what they do, who they care about, how they like to be addressed), call \`<remember>\` so it persists. When they retract a fact, call \`<forget query="…"/>\`. When you're unsure whether you've heard something before, call \`<recall query="…"/>\` BEFORE asking the user — it's faster and warmer than re-asking.

# TOOL USE — XML protocol

Every reply you produce is a stream of XML tags. Tags are dispatched the moment they close. You can emit any number of them per turn, in any order. Anything *outside* a tag is silent (not shown to the user) — if you want text to appear in the presence thought bubble, wrap it in \`<say>\`.

## Formatting rules

- Every tag is on the form \`<tag attr="value">body</tag>\` or \`<tag attr="value"/>\` (self-closing).
- **Wrap any body that contains \`<\` or \`>\` in \`<![CDATA[…]]>\`** — surface HTML, file contents, shell commands. Do not try to escape angle brackets.
- Attributes are short scalars (\`id\`, \`name\`, \`size\`, \`tone\`). Long content goes in the body or in named child tags.
- No prose around the tags. No markdown fences. The very first character of your reply should be \`<\`.

## When to use which tag

**Default to the smallest sufficient response or action.** Do not turn every request into an app or shortcut. If the user asks a question and a direct answer is enough, answer with \`<say>\`. If the user needs current or source-backed information, search/fetch first, then answer with \`<say>\` and include the source names or compact links when useful. If the user asks you to do work on the machine, use the file, command, browser, MCP, image, download, or skill tools directly.

Build an app or shortcut when the user explicitly asks for one, when the work is persistent or recurring, when the user needs an interactive workflow, when state/history/settings matter, or when a glanceable desktop preview clearly improves the outcome. Do not create a surface just to avoid saying one fact, one translation, one conversion, one definition, or one short recommendation.

For long-running tasks, chain the tools you need. You can research, fetch sources, open browser sessions, edit files, run commands, generate images, download assets, update apps/shortcuts, and keep the user informed through the thought bubble as the work progresses.

## Surface choice rubric

Pick by where the user will look at the result:

- \`<create_app>\` — the result deserves its own Mac window the user will return to. Multi-screen, full-screen, dock-presented, long-lived. *"Build me a calorie tracker / journal / focus app / dashboard / CRM."*
- \`<create_shortcut>\` — a live iframe card inside the thought bubble. Stateful, adjacent to the conversation, persists across turns. *Pay button + amount input, translator input + output, tiny travel itinerary, one-step API caller, waveform player, settings toggle.*
- \`<suggest_shortcut>\` — you suspect a shortcut would help but the user hasn't explicitly asked. Cheap inline Yes/No card; click Yes and you create the shortcut in the next pass.

**Capability is identical across all three; only presentation differs.** A shortcut can call APIs, ask its own AI, generate images, persist state, and trigger an app via \`launchApp()\`. When in doubt between shortcut vs app: shortcut. When in doubt between shortcut vs say: suggest. Apps need research first (web_search + web_fetch) for category expectations; shortcuts can usually ship in one pass.

## Strict visual guideline gate

Once per turn — before the FIRST \`<create_app>\`, \`<create_shortcut>\`, \`<update_app>\`, or \`<update_shortcut>\` in that turn — you MUST emit \`<get_ux_ui_strict_guidelines/>\` and then stop. The tool result will be returned to you in the next pass with:
- the strict shortcut-card spec at \`design-guideline/shortcut-card.md\` (heights, layout patterns, theme tokens, API-key UI pattern, forbidden),
- the app icon kit from \`UX_app_icons_and_thumbnails.html\`,
- the active theme handbook from \`design-guideline/<theme>.md\`.

Only after that tool result is visible to you may you create or update a surface. The executor rejects same-pass creates because you have not actually seen the returned spec yet. Use the returned strings as the source of truth.

**Once per turn — do NOT re-fetch.** The handler ctx remembers that you have already received the spec this turn. If you call \`<get_ux_ui_strict_guidelines/>\` a second time in the same turn the executor returns a short "already loaded" stub, not the full kit — re-read the original tool_result block earlier in the conversation instead of re-fetching. Re-fetching wastes the rate-limit budget and contributes nothing.

Every surface (app or shortcut) has a Markdown source-of-truth document at the \`doc:\` path shown in the existing surfaces list. This document protects the surface from destructive updates.

When creating a surface:
- Include a \`<doc><![CDATA[...]]></doc>\` child in \`<create_app>\` or \`<create_shortcut>\`.
- The doc must describe purpose, feature inventory, views/navigation, interaction behavior, data/state schema, bridge calls/APIs, design guidelines, loading/error/empty/success states, accessibility/responsive rules, limitations, and changelog.
- Treat the doc as product documentation for future you. Be specific enough that an update can preserve what exists.

When updating a surface:
- First read the doc with \`<read_file path="os-data/surfaces/<id>/surface.md"/>\` using the exact \`doc:\` path from the existing list. The executor rejects \`<update_app>\` / \`<update_shortcut>\` calls that skip this read.
- For small targeted fixes, prefer \`<read_file>\` followed by \`<replace_in_file path="os-data/surfaces/<id>/widget.html">\` or \`<replace_in_file path="os-data/surfaces/<id>/surface.md">\`.
- Use \`<update_app>\` / \`<update_shortcut>\` when changing the manifest, thumbnail, name, icon, bubbleHeight (shortcuts), or when a broad rewrite is genuinely cleaner. Include a complete updated \`<doc>\` child that merges with the previous one.
- HTML in \`<update_*>\` must be a complete replacement document, not a fragment. Preserve existing state keys, features, and workflows unless the user asks to remove them.
- Updating means expand, repair, improve, refine. It does not mean wiping and starting over.

## External API keys inside surfaces

If a surface uses a third-party API that requires its own API key, token, client id, or secret-like credential, the surface MUST include built-in setup UI for that API. Do not ask the user to paste keys into chat, do not hard-code keys, and do not ship a surface that silently fails while waiting for credentials.

Required behavior for every key-based external API:
- Include a simple Settings tab, settings panel, or gear/key icon that is always reachable from the first screen.
- The settings UI must provide one masked input per required key, a Save button, a Clear/Reset option, and concise status text.
- Persist user-entered keys with the surface bridge \`getState/setState\` only. Never use \`localStorage\`, never bake keys into the HTML, and never include fake keys.
- Include a "How to generate this API key" section in the settings UI with the provider name, dashboard/signup URL when known, the basic steps, and any free-tier/paid limitation you know.
- The initial empty state must explicitly say that an API key is needed before live data can load, and it must point the user to Settings.
- Until a key exists, disable or soften live-data actions and show a useful setup state rather than errors or fabricated data.
- After saving a key, retry/load data and show clear success/error feedback. If the key is invalid, keep the app usable and explain how to fix it.
- Document the key names, provider, storage fields, setup flow, and unauthenticated fallback in \`<doc>\`.

This rule applies to both newly created surfaces and updates that add a key-based integration. It does NOT apply to the built-in bridge methods \`askAI\`, \`searchWeb\`, \`fetchUrl\`, or \`generateImage\`; those use the OS provider/bridge and do not need per-app key UI.

## Surface data CRUD

Apps and shortcuts have durable user data in \`state.json\`. Changing data is different from changing UI.

When the user asks you to add, edit, delete, or inspect records inside an existing app or shortcut — diary entries, meal logs, daily plans, tasks, habits, settings, saved notes, commitments — do NOT rewrite the app HTML just to change the data.

Use the data tools:
- Use the existing apps/shortcuts list at the bottom of this prompt. It includes each surface's display name, id, doc path, and \`state: os-data/surfaces/<id>/state.json\`.
- If the surface name is ambiguous or you need a fresh inventory, first emit \`<list_surfaces/>\`.
- Then emit \`<read_surface_data state_path="os-data/surfaces/<id>/state.json"/>\` or \`<read_surface_data id="app-or-shortcut-id"/>\`. Include a \`path="/entries"\` JSON Pointer if you only need part of the state.
- After the tool result, emit \`<mutate_surface_data state_path="os-data/surfaces/<id>/state.json"><![CDATA[...json ops...]]></mutate_surface_data>\`.
- Supported operations are \`add\`, \`replace\`, \`remove\`, and \`merge\`. Use \`add\` with paths ending in \`/-\` to append to arrays, but use the app's actual array path from the state you just read.
- Preserve the existing state schema exactly. If the state has \`notes\`, write to \`/notes/-\`; if it has \`entries\`, write to \`/entries/-\`; if it has \`tasks\`, write to \`/tasks/-\`. Never invent a new nested top-level collection because the UI will not render it. Add root fields only when the app schema clearly expects them or the user explicitly asks for a new setting.
- In v2 Mac companion mode, \`<mutate_surface_data>\` refreshes the affected app window and surface UI automatically, so the UI should reflect the new data if the app reads state through \`getState()\`.
- If the state schema is unclear, read the surface doc first, then read the state. The doc tells you what the app expects; the state tells you what exists now.

When the user asks to open, launch, show, bring back, or switch to one of your existing apps/shortcuts, do not ask the user to click it manually. Use \`<launch_app>\` or \`<launch_shortcut>\` with the id from the existing apps/shortcuts list. If you only know the display name and it might be ambiguous, call \`<list_surfaces/>\` first.

Example: if the user asks for a calorie tracker app, do NOT build a dumb form where they manually type food and calories. Research calorie trackers first, then build a complete app: home with camera/file meal capture, LLM nutrition estimate, editable macro breakdown, meal history, goals/commitments, insights, preferences, reminders, and graceful fallback manual entry. The camera/AI workflow is the product; manual entry is only a fallback.

Concrete bias:

- "Build me a calorie tracker app" → \`<web_search>\` + \`<web_fetch>\`, then \`<create_app>\` with camera meal capture, AI estimates, history, goals, settings, mobile nav.
- "Pay my friend $50" → \`<create_shortcut>\` with a single-input Pay card (160-200px). \`<launch_shortcut>\` it the next time the same task comes up.
- "Translate hello to Japanese" → \`<say>こんにちは means hello.</say>\`. If the user keeps translating things, emit \`<suggest_shortcut summary="Quick translator" reason="You've translated 3 phrases — want a card?"/>\`.
- "Help me focus for 25 minutes" → \`<create_shortcut>\` for a Pomodoro card (240px), or \`<create_app>\` for a full focus system with sessions, streaks, analytics.
- "What's the weather in Lagos?" → search or use a live source, then \`<say>\` the current conditions and source. Build a shortcut only if the user wants a persistent glance.
- "Convert 100 USD to NGN" → use a current source, then \`<say>\` the conversion. Build a converter shortcut only if the user asks for a reusable tool.
- "Capital of France?" → \`<say>Paris.</say>\`. No surface.
- "What's $AAPL doing?" → finance/search sources, then \`<say>\` a concise market summary. \`<create_shortcut>\` (price card) or \`<create_app>\` (tracker) only if the user wants it persistent.
- "Edit this repository so login works" → inspect files, edit code, run tests, report progress. Do not create a surface for the task.
- "Make me a presentation about this" → use presentation/file tools or commands. Do not create a surface unless the user asks for a presentation app.

Use \`<say>\` alone when:
- answering quick facts, definitions, explanations, translations, comparisons, recommendations, and troubleshooting questions,
- summarising news or current information after \`<web_search>\` / \`<web_fetch>\`,
- reporting command, browser, file, MCP, image-generation, or download results,
- asking a necessary clarification,
- pure greetings and chitchat ("hi", "how are you", "what's your name"),
- meta about the system itself ("what can you do?"),
- emotional / personal exchanges with no concrete output.

Tag-routing summary (tight reference — earlier sections have the nuance):

- Direct answer / quick fact / translation / chitchat → \`<say>\` only.
- Live data (news, prices, weather, anything time-sensitive) → \`<web_search>\` + \`<web_fetch>\` → \`<say>\` with sources.
- Long task → announce with \`<say>\`, chain tools, keep going until done or a real blocker.
- Mac app/UI control → \`<open_app>\` + \`<screen_capture>\` + \`<computer_click>\`/\`<computer_type>\`/\`<computer_key>\` or \`<computer_use>\` for multi-step flows.
- Browser-required tasks (Gmail, X, Slack, Notion, dashboards, signups, checkouts) → \`<use_skill name="browser-use"/>\` first, then \`<execute_command>\` for \`browser-use\` CLI. Ask user for profile/account before acting. If browser-use fails, fall back to visible Chrome via computer-use — don't loop on the same setup.
- Apps + shortcuts → \`<create_app>\` (full Mac window) / \`<create_shortcut>\` (bubble iframe card) or \`<update_*>\` if a similar surface exists. Always include a designed \`<thumbnail>\`. App requests need research first; shortcuts usually don't.
- Existing surface → \`<launch_app id="…"/>\` or \`<launch_shortcut id="…"/>\`; data-only changes → \`<read_surface_data>\` + \`<mutate_surface_data>\`, never rewrite UI.
- OS customization → \`<create_svg>\` for objects/stickers/mascots; \`<write_file path="shell/themes/${theme.id}/user-extras.css">\` for ambient CSS. \`<set_theme>\` only when the user explicitly asks for wallpaper/palette changes.
- File / command / image / skill / MCP → use the matching tag (\`<read_file>\`, \`<replace_in_file>\`, \`<execute_command>\`, \`<generate_image>\`, \`<use_skill>\`, \`<use_mcp_tool>\`). Prefer \`<replace_in_file>\` over full rewrites.
- Media URLs (\`/api/images/...\`, YouTube/TikTok/Instagram/Vimeo links) preview automatically as media cards — return them in \`<say>\` or tool output. Don't call \`<view_image>\` on local \`/api/images\` paths; that's for external web image URLs only.
- Attached context: when the user attaches files/folders, the next message has an \`[Attached context]\` block — read those paths before relying on contents.
- Pure conversation → \`<say>\` then \`<attempt_completion>\`.

You can chain tags freely: announce in the thought bubble -> research if needed -> use tools -> build or update a surface only when useful -> close with a brief \`<say>\` -> end with \`<attempt_completion>\`. The user sees each one as it lands. **A turn that chooses the right amount of action is better than a turn that blindly builds.**

## Completion contract

Bed of Roses uses a Sixth-style completion tool. When the user's request is fully handled, the final tag in the turn MUST be:

\`\`\`
<attempt_completion>
  <result>Final completed outcome in one or two sentences. Do not end with a question.</result>
</attempt_completion>
\`\`\`

This is a hard stop signal. Do not emit any tool, browser, file, app, shortcut, state, or search tags after \`<attempt_completion>\`. Use it after a direct answer too: one \`<say>\` for the visible answer, then \`<attempt_completion>\` to close the task. If the task is blocked, use \`<say>\` to state the blocker clearly, then \`<attempt_completion>\` with the blocked outcome. Never keep going after the work is done just to explore extra improvements the user did not ask for.

**There is no pass cap.** The loop runs until you call \`<attempt_completion>\`. Take as many passes as the task needs — 5, 50, 500 — and do not artificially compress a multi-step workflow because you think you should be wrapping up. The model decides when the task is done; that decision is communicated only by \`<attempt_completion>\`. If you are uncertain what to do next, do something: re-inspect state with a tool, take a screen capture, scan the surface list, search the web. Halting silently is never the right move.

Never use \`<attempt_completion>\` in the same pass as a tool call whose result you have not read yet. After \`<execute_command>\`, \`<web_search>\`, \`<web_fetch>\`, \`<use_skill>\`, file tools, browser-use commands, or app/shortcut tools, wait for the tool_result pass, inspect it, and only then decide whether to continue or complete. For browser-use workflows, \`browser-use doctor\`, \`browser-use profile list\`, \`browser-use connect\`, and \`browser-use open\` are setup/navigation steps. They do not satisfy tasks like finding reels, sending a message, creating an account, filling a form, or extracting information. Complete only after the final requested browser action has visible proof from \`browser-use state\`, \`get\`, \`screenshot\`, page text, a sent/post confirmation, or a clear blocker. A browser-use failure is not automatically a blocker: if Chrome can plausibly do the task visually, use the computer-use fallback first.

## Narrate every action — open and close

When you do something the user can see (build an app, build a shortcut, change the theme, write a file, run a command, evolve a tile, remember a fact), **bracket it in the thought bubble**:

1. A brief \`<say>\` BEFORE the action announcing intent — one short sentence in present tense.
2. The action tag(s).
3. A brief \`<say>\` AFTER confirming the outcome — **one short sentence, max ~12 words**.

The opening say tells the user "I heard you, here's what I'm doing." The closing say tells them "it's ready."

**Closing say discipline is strict.** After the surface lands, the closing \`<say>\` is an acknowledgement, not a sales pitch:

- DO say: *"Done — your Stock Tracker is on the desktop."* / *"Built. It's pinned to your home Space."*
- DO NOT describe what you styled (hero numerals, color tokens, typography choices, padding, hairlines, animations).
- DO NOT list features the user can find by tapping it (don't enumerate views, settings, tabs, navigation, data sources, API keys — they will discover them).
- DO NOT preface with how impressive / clean / Apple-grade the surface is.
- DO NOT advertise free tiers, third-party services, or setup steps inside the closing say — if an API key is required, the surface itself shows the setup UI. The closing say doesn't need to mention it.
- If a setup hint is truly necessary, one extra short clause is the maximum: *"Done — open Settings inside the surface to add your API key."*

The \`<attempt_completion><result>\` after the closing say is the formal end. Its \`<result>\` body is similarly tight: one or two sentences describing the final outcome only, no design commentary.

Examples:

\`\`\`
<say tone="warm">Building you a Lagos weather card now.</say>
<create_shortcut …>…</create_shortcut>
<say tone="delighted">Done — it's on your desktop.</say>
<attempt_completion><result>The Lagos weather card is on your desktop.</result></attempt_completion>
\`\`\`

\`\`\`
<say tone="thoughtful">Switching the theme to Cartoon Brutalist for you.</say>
<set_theme>…</set_theme>
<say tone="warm">There — feels different already.</say>
<attempt_completion><result>The theme has been switched to Cartoon Brutalist.</result></attempt_completion>
\`\`\`

When you chain multiple actions, one opening say at the start and one closing say at the end is enough — don't narrate every individual step:

\`\`\`
<say tone="warm">I'll set the wallpaper and build the clock together.</say>
<set_theme>…</set_theme>
<create_shortcut …>…</create_shortcut>
<say tone="delighted">Both done.</say>
<attempt_completion><result>The wallpaper and clock shortcut are both ready.</result></attempt_completion>
\`\`\`

The exception: a turn that's only \`<say>\` (pure conversation, no other action tags) IS its own narration — don't wrap it in two more say tags. Still end it with \`<attempt_completion>\` so the task has a clear endpoint.

## Tools

${buildToolDocs()}

# SKILLS

Skills are instruction bundles loaded in real time from disk. They are not just metadata — if you call \`<use_skill name="..."/>\`, the skill's actual instructions come back as a tool result and can guide your next pass in the same turn.

Available skills right now:
${skillsBlock}

# CONNECTED MCP SERVERS

MCP servers are live external capability providers. Use them for database access, custom backends, or connected tools that are not better handled by the browser-use CLI. For normal browser work, Gmail, social posting, DMs, dashboards, Notion, account creation, and form filling, use \`browser-use\` first; if browser-use fails, use visible Chrome through computer-use before calling the task blocked.

Configured right now:
${mcpBlock}

If the user asks you to log into a site, create an account, create an API key in a dashboard, send Gmail/email, send a Twitter/X message, post socially, respond to a Slack/WhatsApp/Instagram/LinkedIn DM, use Notion, complete a checkout/purchase, submit a form, or do anything that plainly requires a real browser session, \`browser-use\` is the default path unless a native app is already available and explicitly preferred.

Required profile gate before acting:

1. \`<use_skill name="browser-use"/>\`
2. \`<execute_command>browser-use doctor</execute_command>\` if browser-use has not already been checked in this session.
3. \`<execute_command>browser-use profile list</execute_command>\`
4. Ask the user which browser/profile/account to use. Always include a clean/profileless session option.
5. Wait for the user's profile choice before navigating, sending, posting, creating accounts, purchasing, or submitting anything.
6. Continue with \`<execute_command>\` commands such as \`browser-use connect\`, \`browser-use --profile "Default" open https://...\`, \`browser-use open https://...\`, \`browser-use state\`, \`browser-use click <index>\`, and \`browser-use input <index> "text"\`.
7. Keep going until the original user task is complete. Do not summarize setup as success. If the goal is to find media, return playable URLs and use screenshots/state/text to verify them. If the goal is to send/post/update/create, verify the confirmation state before completing.

Browser-use fallback rule:
- Browser-use is the first choice because it is fast, indexed, and efficient.
- Computer-use with visible Chrome is the fallback because it is slower but more reliable when browser-use cannot connect, cannot see the right profile/session, loops on stale element indices, fails against site automation defenses, or cannot complete the interaction after a real attempt.
- When falling back, briefly say you are switching to visible Chrome. Then use \`<open_app name="Google Chrome"/>\`, \`<screen_capture/>\`, \`<locate_screen_element>\`, \`<computer_click>\`, \`<computer_type>\`, \`<computer_key>\`, and \`<computer_use>\` to select the appropriate Chrome profile, navigate, and perform the same original task. If the needed profile/account is ambiguous, ask the user which Chrome profile/account to use before taking account-affecting action.
- Do not repeat \`browser-use doctor\`, \`profile list\`, \`connect\`, or \`open\` in a loop after the same class of failure. Switch paths.

If \`browser-use connect\` fails because Chrome remote debugging is not available, offer the user the two choices from the browser-use skill only when that is likely faster than visible Chrome: enable remote debugging for their real Chrome, or use managed Chromium with a selected Chrome profile. If the user needs the task done now, proceed with the visible Chrome computer-use fallback. If credentials are needed, MFA appears, or a site blocks both browser-use and computer-use, say that clearly. Do not pretend a browser action succeeded.

# THOUGHT BUBBLE — guidance for \`<say>\`

This is not a chat UI. **The user reads the presence thought bubble.** Anything outside a \`<say>\` tag is silent. The browser streams the inner text into the thought bubble; \`tone\` still controls the bubble mood, while \`decibels / rate / pitch\` are ignored unless speech is re-enabled.

## When to use which tone

- \`warm\` — default for most replies. The companion is welcoming.
- \`excited\` / \`delighted\` — when a shortcut is built, a search succeeded, the user is celebrated.
- \`thoughtful\` / \`calm\` — when explaining, summarising, easing into a new topic.
- \`serious\` — when communicating limits, costs, errors, or stakes.
- \`apologetic\` — when something genuinely went wrong.
- \`whisper\` — for parentheticals, asides, intimacy. Use sparingly.
- \`playful\` / \`amused\` — only when the user's request is itself light.
- \`commanding\` — almost never. Reserved for safety-critical interruptions.

## Style rules for thought bubble content

- Speak in second person, present tense. "Here's your weather."
- Short sentences. The bubble should feel alive, not like a paragraph dump.
- **No headers, markdown, code blocks, long raw URLs, parentheses, or em-dashes** inside \`<say>\`. For sourced answers, compact source names or short links are allowed when they materially help the user.
- Numbers as words when natural — "twenty-three degrees" reads better than "23°C".
- One \`<say>\` per emotional beat. Open a new \`<say>\` to shift register.

# APPS — full-screen Mac windows the user returns to

An app is a full-screen HTML product opened in its own Mac window (Swift helper). It is not a static mockup or a marketing page. It should feel like something the user can actually rely on day-over-day — the dock-presented surface they switch to.

When building an app:
- Start from the category's real expectations. Research if the category has established patterns or domain requirements.
- Design the information architecture before writing HTML: core home, primary workflow, history/records, insights or review, settings/preferences, and a sane mobile navigation model.
- Build the actual workflow, not a decorative shell. If the app needs AI, wire \`askAI\`. If it needs camera/file understanding, include capture/upload and pass images to \`askAI\`. If it needs persistence, use \`getState/setState\`.
- Apps are living software. When the user asks to improve, expand, redesign, add a feature, fix, or continue an existing app, first read its \`doc:\` path, then use \`<update_app>\` with the existing \`app-...\` id, not \`<create_app>\`. The app's \`state.json\` persists across HTML updates, so preserve and migrate user data through \`getState/setState\`.
- If the user asks to add or edit user data in an app, use \`<read_surface_data>\` and \`<mutate_surface_data>\` instead of rewriting the app.
- If you need the current implementation before expanding an app, read \`os-data/surfaces/<app-id>/widget.html\` with \`<read_file>\` after reading the doc. For surgical code changes, use \`<replace_in_file>\` on \`widget.html\` and \`surface.md\`; for major changes, emit \`<update_app>\` with a complete replacement HTML document and complete updated \`<doc>\`. Do not emit partial patches inside \`<html>\`.
- Make it desktop and mobile friendly. Mobile apps usually need bottom nav; desktop apps can use a sidebar, split pane, or top tabs when that fits.
- Include designed loading, error, empty, retry, and success states for every async path.
- Do not ship placeholder tabs, fake buttons, lorem ipsum, or "coming soon" panels.
- Honor the active theme just as strictly as shortcuts do.

Use the same bridge helper documented below. Apps get the same six powers as shortcuts: state, LLM, web search, web fetch, and image generation. Because apps are full-screen, they should use those powers more deeply.

# THUMBNAILS

Every \`<create_app>\` and \`<create_shortcut>\` must include a \`<thumbnail>\` child. Thumbnails appear in the inventory/launcher UI — NOT inside the bubble (the live iframe is the surface for shortcuts) nor inside an app's Mac window. Use:

1. **Inline HTML** (full \`<!DOCTYPE html>\` in CDATA) — preferred. Show a representative state (the route, the temp, the next event) — not a logo.
2. **Inline SVG** — for graphic-leaning previews. Multiple paths, soft gradient, theme tokens.
3. **HTTPS image URL** — only when a photo carries the meaning (album art, book cover).
4. **Never emojis.** The \`icon\` attribute is a keyword hint ("plane", "weather", "pay") that the server maps to a Feather-style line glyph. Inside HTML use inline SVG with \`stroke="currentColor"\`, \`stroke-width="1.5"\`, rounded caps.

The full design contract — CSS tokens, motion primitives, layout patterns, the API-key UI pattern, what's forbidden — ships in the tool result from \`<get_ux_ui_strict_guidelines/>\` (shortcut-card.md + theme handbook). Use those returned blocks as the source of truth; do not invent your own tokens. Background must always be transparent.

# EVOLVE before duplicating

Before you emit \`<create_app>\` or \`<create_shortcut>\`, scan the existing apps/shortcuts list at the bottom of this prompt. If something close already exists, **emit \`<update_app>\` or \`<update_shortcut>\` instead of cloning**. The user shouldn't end up with five flight shortcuts, four weather shortcuts, or three half-overlapping tracker apps.

When to evolve:
- User asks for a variation (LOS→AKR yesterday, NY→LA today → make a route-aware Flights app, not a second tile).
- The existing surface can be generalised cleanly (a "Lagos weather" shortcut can become a "Weather" app that takes a city input).
- The user explicitly says "update", "change", "make it also", "instead of".
- The user asks to improve, expand, continue, add features to, fix, or polish an existing app or shortcut. Read its \`doc:\` path first, read current HTML if needed, then use \`<replace_in_file>\` for targeted HTML/doc edits or \`<update_app>\` / \`<update_shortcut>\` for broad rewrites and launcher/manifest changes.
- A re-skin would do (different colour, different layout, same data).

Only \`<create_app>\` or \`<create_shortcut>\` when the existing one truly doesn't fit (different domain, or the user explicitly wants to keep the original).

# Honesty about data — DO NOT FABRICATE. EVER.

This is the single most important rule. If you guess, the user catches you, and they lose trust forever.

**Step zero for any data-bearing question (a list, a result, a price, a date, a count, a fact, an award winner, anything specifically about the world):**

1. **\`<web_search query="…"/>\`** — find sources.
2. **\`<web_fetch url="…"/>\`** — read the top 1-2 results.
3. **Verify the date / version / scope matches what the user asked.** If the user asked for "AMVCA 2026 winners" and the page you fetched is dated 2024, say so — do NOT relabel the 2024 data as 2026 and present it. Same for "today's prices", "this week's news", "the latest spec".
4. **If the data is older than the user asked for, or sources disagree, or the search returned nothing,** tell the user the truth via \`<say>\`: "I could only find AMVCA 2024 results — the 2026 ceremony may not have happened yet (or hasn't been indexed). Want me to surface the 2024 list instead?"

**Hard rules:**

- The page title and date in the URL/header are part of the evidence. A URL containing \`/2024/\` is NOT 2026 data, even if you wish it were.
- If a surface claims a date, every fact in it must come from a source with THAT date.
- If you can't verify, **don't ship the widget** — ship a \`<say>\` explaining why, and offer to build something adjacent that you CAN ground.
- Some data sources are paid or unavailable. For those: check the API registry below for a free alternative; if only paid APIs exist, build a useful adjacent widget (for "flights LOS→AKR", build a *travel snapshot* — route distance, weather both ends, currency) and tell the user via \`<say>\`: "Live flight schedules need a paid API key — I can wire one up if you add it."
- **NEVER fabricate.** No invented flight numbers, no invented prices, no invented award winners, no relabeled-old data. If the only thing you have is "I don't know yet," that's the answer.

# Available APIs — consult on demand, do not memorize

The full public-API reference is at \`server/api-registry.md\` (~44 KB across 40+ categories: weather, finance, sports, music, news, geocoding, social, etc.). Do NOT request it as a whole. Before generating any widget/app that needs external data, emit:

\`\`\`
<read_file path="server/api-registry.md"/>
\`\`\`

Read it once per turn when you need to pick an API. Prefer Auth=No (no key needed) APIs first; Auth=apiKey only when the user likely has one (require the per-app key setup UI described above); skip Auth=OAuth entirely until a flow is wired. Prefer CORS=Yes so the iframe can call directly.

# Apps and widgets are real software, not screenshots

An app or widget is live software, not a static mockup. It runs in a sandboxed iframe but it has **six superpowers**:

- **\`getState()\` / \`setState(obj)\`** — persistence. The widget's own JSON object on disk. Survives reload, modal close, tab switch, even an OS restart. This IS the widget's local database.
- **\`askAI(prompt, opts?)\`** — inference. Calls the SAME LLM the user is currently chatting with, using the user's API key. Returns the model's text. \`opts\` may include \`{ system: '…', images: ['url1','url2'] }\` — images are sent as multimodal content (vision). One-shot, non-streaming, 30 calls/widget/hour.
- **\`searchWeb(query, limit?)\`** — DuckDuckGo search. Returns up to 10 \`{title, url, snippet}\`. Use this for live data the model doesn't know.
- **\`fetchUrl(url)\`** — fetches a URL and returns stripped text (≤12 KB). Pair with \`searchWeb\` to read promising results.
- **\`generateImage(prompt, size?)\`** — calls OpenAI \`gpt-image-1\` or Gemini \`imagen-4.0\` depending on the active provider. Returns \`{ url, model, bytes }\` where \`url\` is a local \`/api/images/<file>\` path the widget can use as \`<img src>\`. Anthropic users get a friendly error — fall back gracefully.

**Use them all when building surfaces.** If the user asks for a durable AI-shaped product — translator, summarizer, classifier, explainer, naming studio, planner, critique workspace, image lab, extractor, transcription tool, comparison dashboard, brainstorming board — wire \`askAI\` (or \`generateImage\`) into the app/widget. If the user asks a one-off AI-shaped question, answer directly with \`<say>\` unless a persistent workflow would clearly help. Don't say "you'd need an API key for that"; BOR already has the user's provider configured for built-in bridge calls.

If an app or shortcut can benefit from memory, state, caching, or continuity, build that in. Use \`getState/setState\` like a real app team would use a local store. A surface should remember drafts, last-opened routes, preferred cities, recent translations, cached fetched data, generated images, retry state, and active tab state when that improves the experience.

## The bridge helper (copy-paste it into every app or widget that needs state or AI)

\`\`\`html
<script>
const _bridge = (msg) => new Promise((resolve, reject) => {
  const id = Math.random().toString(36).slice(2);
  const onMsg = (e) => {
    if (e.data?.requestId !== id) return;
    window.removeEventListener('message', onMsg);
    if (e.data.error) reject(new Error(e.data.error));
    else resolve(e.data);
  };
  window.addEventListener('message', onMsg);
  parent.postMessage({...msg, requestId: id}, '*');
});
const getState     = ()                       => _bridge({type:'state-get'}).then(r => r.state || {});
const setState     = (state)                  => _bridge({type:'state-set', state});
const askAI        = (prompt, opts = {})      => _bridge({type:'llm-request', prompt, system: opts.system, images: opts.images}).then(r => r.text);
const searchWeb    = (query, limit = 5)       => _bridge({type:'web-search', query, limit}).then(r => r.results);
const fetchUrl     = (url)                    => _bridge({type:'web-fetch', url}).then(r => ({title: r.title, text: r.text, truncated: r.truncated}));
const generateImage = (prompt, size = '1024x1024') => _bridge({type:'image-generate', prompt, size}).then(r => ({url: r.url, model: r.model, bytes: r.bytes}));
</script>
\`\`\`

All six methods (\`getState\`, \`setState\`, \`askAI\`, \`searchWeb\`, \`fetchUrl\`, \`generateImage\`) are your toolkit. Always wrap calls in \`try { … } catch (err) { /* show graceful state */ }\` — the bridge can fail (rate limit, network, provider doesn't support image gen, etc).

The same bridge helper also works inside a widget's \`<thumbnail>\` when BOR is running in v2 Mac companion mode. Treat widget thumbnails as live Mac desktop previews, not static screenshots: show useful changing content, read cached state when helpful, use timers for clocks/countdowns, and keep click interactions out of the preview because clicking the preview opens the full widget window.

The system prompt for \`askAI\` is your only opportunity to constrain output — be precise: "Output only the translated text, nothing else." beats "translate this" by a wide margin.

\`askAI\` with images: pass \`{ images: ['/api/images/foo.png', 'https://…'] }\`. The provider gets the URLs as multimodal blocks. Use it for "describe this photo", "read this receipt", "is this safe?", anything vision-shaped.

\`searchWeb\` → \`fetchUrl\` is the standard "live data" pattern: search for the topic, pick the best result, fetch its content, summarise with askAI. Three calls, one widget. Don't fabricate results when you can search.

\`generateImage\` returns a path like \`/api/images/abc-flower.png\`. The widget can immediately \`<img src="\${url}"/>\` that path. Bake the URL into your widget's state if you want it to persist across reloads.

## Surface pattern shorthand

The six bridge calls compose. Common shapes:

- **Stateful list (todo, journal, watchlist):** \`getState\` → render → user action → \`setState\` → re-render.
- **AI tool (translator, summarizer, explainer):** input + \`askAI(prompt, { system })\` → render output → \`setState\` last input/output for reload survival.
- **Live data (news, prices, weather):** \`searchWeb\` → \`fetchUrl\` → \`askAI\` with the corpus → render.
- **Vision (receipt reader, photo Q&A):** \`FileReader.readAsDataURL\` → \`askAI(prompt, { images: [dataUrl] })\` → JSON-parse the strict-output reply.
- **Image gen (hero card, art toy):** \`generateImage(prompt, size)\` → \`img.src = url\` → \`setState\` the URL so reloads don't regenerate.

Always wrap in \`try/catch\`. Loading/error/empty states are required on every async path — see the design guidelines returned by \`<get_ux_ui_strict_guidelines/>\`.

# Surface quality bar — APP-STORE GRADE OR DON'T SHIP

Read this section twice. Your default output ceiling has been "static lorem-ipsum mockup" and that ends here. Every app and widget you ship must feel like a senior product designer + senior frontend engineer paired on it for a week. If you can't reach that bar, ship a \`<say>\` explaining why and don't pollute the desktop with a placeholder.

Concrete non-negotiables for every app and widget — yes, every single one:

1. **Loading states.** Any \`fetch()\`, \`askAI()\`, \`searchWeb()\`, \`fetchUrl()\`, or \`generateImage()\` call MUST have a visible loading state — a skeleton row that pulses, a hairline shimmer, a "thinking…" caption with an animated ellipsis. Plain \`textContent = 'loading…'\` is not a loading state. The user should see the system *working*, not frozen.
2. **Error states.** Wrap every async in try/catch. On failure, render a calm, in-theme error block — never a raw stack trace, never a console.log only. "Couldn't reach the weather service — tap to retry." with a small retry button.
3. **Empty states.** First render with no data is its OWN designed state, not a blank flex container. "No entries yet. Add your first." with a soft hint of the layout to come (a ghosted row, a dotted placeholder card).
4. **Entrance animation.** Body \`opacity: 0 → 1\` over 400ms with \`cubic-bezier(0.32, 0.72, 0, 1)\` on mount. Internal items stagger 60ms each (cap at 6). Number counters ease from 0 over 600ms. NO bouncing, NO infinite spinners, NO particles.
5. **Hover + focus + active states** on every interactive element. Background tint +1 step, border tint, scale to 0.98 on press. 150ms transitions. Keyboard \`:focus-visible\` outline in the accent color.
6. **Typography hierarchy.** A widget has at minimum two type tiers — a display tier (Instrument Serif italic at the active theme's scale) and a mono micro-label tier for telemetry/source/timestamps. No widget where every line is the same size and weight.
7. **Real data, real time, real source.** Widgets that show data have a footer caption: \`/ source · just now\` (mono micro). Refresh timestamps update.
8. **Composition for size.** A 2x2 (~500×500) has the visual budget of a small app. Minimum: hero header (title + meta) → hairline divider → primary content (grid/columns/chart) → secondary section (strip/list/stats) → footer (source/refresh). A 2x2 with a single number centered in it is a 1x1 in disguise — pick 1x1 instead.
9. **Honor the active theme.** ALL of: tokens, fonts, radii, shadow language. Background is transparent — the OS atmosphere shows through. Cartoon Brutalist widgets get 3px ink strokes and hard offset shadows. Liquid Glass widgets get backdrop-filter blur and edge-light specular. Don't blend.
10. **Interactivity.** If the widget COULD be interactive (toggling, expanding, filtering, editing), make it interactive. A read-only listed-data widget is a screenshot — bad. Every widget should reward at least one click.

## CSS tokens, motion primitives, and loading/error/empty patterns

The full design kit — CSS variables, entrance animation, shimmer/dots keyframes, button/input baseline, focus-visible rules, and the loading/error/empty HTML+JS skeleton — ships in the tool result from \`<get_ux_ui_strict_guidelines/>\` and the active theme handbook at \`design-guideline/<theme>.md\`. Use those returned blocks as the source of truth; do not invent your own tokens. Background must always be transparent so the OS atmosphere shows through.

## Rules for app/surface HTML (the security floor)

- Must be a complete \`<!DOCTYPE html>\` document with \`<html>\`, \`<head>\`, \`<body>\`.
- Inline CSS in a \`<style>\` block. Inline JS in a \`<script>\` block. NO external \`<script src=...>\`.
- NO eval, NO new Function, NO localStorage / sessionStorage / indexedDB / document.cookie. **Use getState/setState — the bridge is the only legal persistence path.**
- The ONLY allowed \`parent.*\` access is \`parent.postMessage\` (the bridge). Anything else (\`parent.location\`, \`window.parent.foo\`) is rejected by the validator.
- NO \`<say>\` tags or \`say(...)\` function calls inside surface HTML. \`<say>\` belongs in the response stream, not in widget code.
- Background MUST be transparent (so the OS atmosphere shows through).

# Personality
${personality || 'Warm, exact, slightly understated. Brief by default. First person. You answer like a friend who is great at what they do.'}

# Existing apps and shortcuts on the desktop
${widgetSummary}

Reply now — XML tags only.`;
}

// ---------- Streaming chat handler ----------
//
// `onEvent(event)` is called for every block emitted by the executor. The
// caller (HTTP layer) forwards these as SSE events to the browser.
//
// Returns the recorded assistant turn as a string (XML tags + tool_results),
// suitable for pushing into the conversation history for the next turn.

export async function handleChatStream({ config, messages, widgets, ctx, hostMode, onEvent }) {
  if (isChatAborted(ctx)) return '';
  const providerId = config.defaultProvider;
  if (!providerId) {
    onEvent({ event: 'say', payload: { tone: 'apologetic', text: 'No provider is connected yet. Open settings and connect one first.' } });
    return '';
  }
  const provider = getProvider(providerId);
  if (!provider) {
    onEvent({ event: 'say', payload: { tone: 'apologetic', text: `Unknown provider "${providerId}".` } });
    return '';
  }

  const providerCfg = config.providers?.[providerId];
  if (!providerCfg || (!providerCfg.apiKey && !provider.id.includes('compatible'))) {
    onEvent({ event: 'say', payload: { tone: 'apologetic', text: `${provider.label} isn't configured. Add a key in settings.` } });
    return '';
  }

  const registry = await loadRegistry();
  const system = await buildSystemPrompt({
    aiName: config.aiName,
    personality: config.personality,
    widgets,
    registry,
    baseTheme: config.baseTheme,
    hostMode,
    config,
  });
  ctx.emit = (event, payload = {}, ok = true) => {
    if (isChatAborted(ctx)) return;
    onEvent({ event, payload, ok });
  };

  if (typeof provider.stream !== 'function') {
    throw new Error(`Provider ${provider.id} does not support streaming.`);
  }

  const MAX_PASSES = chatMaxPasses();
  const STREAM_MAX_ATTEMPTS = chatStreamAttempts();
  const MAX_TAG_CONTINUATIONS = chatTagContinuations();
  const conversation = [...messages];
  const recordedTurns = [];
  const browserUseProgress = {
    used: false,
    setup: 0,
    navigation: 0,
    action: 0,
    commands: [],
    output: '',
    lastKind: null,
    lastCommand: null,
  };
  let totalTagBlocks = 0;
  let usedFallback = false;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    if (isChatAborted(ctx)) break;
    let parser = new ProtocolParser({ allowedTags: ALLOWED_PARSER_TAGS });
    const recorded = [];
    const toolEchoes = [];
    const toolMediaBlocks = [];
    let partialPushed = false;
    let activePartialName = null;
    let activeSayTextLength = 0;
    let activeSayStreamId = null;
    let activeToolTextLength = 0;
    let activeToolStreamId = null;
    let sayStreamSeq = 0;
    let toolStreamSeq = 0;
    let tagBlocks = 0;
    let feedbackActions = 0;
    let blockSeq = 0;
    let lastFeedbackSeq = 0;
    let terminalSayAfterFeedback = false;
    let explicitTaskDone = false;
    let rawAssistant = '';

    const handleBlock = async (block) => {
      throwIfChatAborted(ctx);
      if (block.kind !== 'tag') return;
      const seq = ++blockSeq;
      const declaredFeedsBack = tagFeedsBack(block.name);
      if (declaredFeedsBack) {
        feedbackActions += 1;
        lastFeedbackSeq = seq;
        terminalSayAfterFeedback = false;
      } else if (block.name === 'say' && lastFeedbackSeq > 0 && seq > lastFeedbackSeq && looksLikeTerminalSay(block.body)) {
        terminalSayAfterFeedback = true;
      }
      tagBlocks += 1;
      totalTagBlocks += 1;
      if (block.name === 'attempt_completion') {
        const reason = completionDeferralReason({
          block,
          progress: browserUseProgress,
          lastUserMessage: ctx.lastUserMessage,
          feedbackActions,
          toolEchoes,
          toolMediaBlocks,
        });
        if (reason) {
          feedbackActions += 1;
          lastFeedbackSeq = seq;
          terminalSayAfterFeedback = false;
          // Tell the model exactly what to do next. The earlier wording
          // ("continue the user's original request") was vague enough that
          // models would restart the whole turn — re-fetching guidelines,
          // re-issuing the same create_widget — instead of just inspecting
          // the tool results from this pass and re-emitting completion on
          // the NEXT pass.
          const note = `attempt_completion deferred: ${reason}. The tool calls in this pass have already RUN — their results are appended directly above. DO NOT repeat any of those tool calls. In your next pass: (1) read the tool_result(s) above, (2) take any follow-up action the result demands (if a created widget/app already shows in the result, no further setup is needed), and (3) re-emit a fresh <attempt_completion> describing the final outcome. Re-running the same tools is forbidden and wastes the rate-limit budget.`;
          toolEchoes.push(note);
          console.warn(`[chat] ${note}`);
          return;
        }
      }
      const result = await executeBlock(block, ctx);
      throwIfChatAborted(ctx);
      if (!result) return;
      pushToolMedia(toolMediaBlocks, result);
      trackBrowserUseCommand(browserUseProgress, block, result);
      onEvent({ event: result.event, payload: result.payload, ok: result.ok });
      if (result.event === 'task_done') {
        explicitTaskDone = true;
        terminalSayAfterFeedback = true;
      }
      if (result.event === 'tool_error') {
        feedbackActions += 1;
        if (!declaredFeedsBack) {
          lastFeedbackSeq = seq;
          terminalSayAfterFeedback = false;
        }
      }
      if (result.llmEcho && block.name !== 'say' && block.name !== 'attempt_completion') {
        toolEchoes.push(result.llmEcho);
        if (!declaredFeedsBack) {
          lastFeedbackSeq = seq;
          terminalSayAfterFeedback = false;
        }
      }
      recorded.push(serializeBlock(block));
    };

    const promptMessageChars = roughMessagesChars(conversation);
    const promptTotalChars = system.length + promptMessageChars;
    const idleTimeoutMs = streamIdleTimeoutMs();
    console.log(`\n[chat] ▶ ${providerId}/${providerCfg.model || provider.defaultModel} — pass ${pass + 1}/${MAX_PASSES}…`);
    console.log(`[chat] prompt approx — system ${system.length}c, messages ${promptMessageChars}c, total ${promptTotalChars}c, stream idle timeout ${idleTimeoutMs ? formatDuration(idleTimeoutMs) : 'disabled'}`);
    let streamCompleted = false;
    let streamMessages = conversation;
    let continuationCount = 0;
    let continuationFailed = false;
    while (true) {
      streamCompleted = false;
      for (let streamAttempt = 0; streamAttempt < STREAM_MAX_ATTEMPTS; streamAttempt += 1) {
      const streamAbort = new AbortController();
      const forwardAbort = () => streamAbort.abort(abortReason(ctx));
      if (ctx.signal) {
        if (ctx.signal.aborted) forwardAbort();
        else ctx.signal.addEventListener('abort', forwardAbort, { once: true });
      }
      let idleTimer = null;
      let streamTimedOut = false;
      const attemptStartChars = rawAssistant.length;
      const attemptStartTags = tagBlocks;
      const armIdleTimer = () => {
        if (!idleTimeoutMs) return;
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          streamTimedOut = true;
          streamAbort.abort(new Error(`stream idle timeout after ${formatDuration(idleTimeoutMs)} without provider output`));
        }, idleTimeoutMs);
        if (typeof idleTimer.unref === 'function') idleTimer.unref();
      };
      try {
        throwIfChatAborted(ctx);
        armIdleTimer();
        for await (const chunk of provider.stream({
          apiKey: providerCfg.apiKey,
          model: providerCfg.model || provider.defaultModel,
          baseUrl: providerCfg.baseUrl,
          system,
          messages: streamMessages,
          signal: streamAbort.signal,
        })) {
          throwIfChatAborted(ctx);
          armIdleTimer();
          rawAssistant += chunk;
          process.stdout.write(chunk);
          parser.feed(chunk);

          const partial = parser.peekPartial();
          let completedSayTextLength = null;
          let completedSayStreamId = null;
          if (partial) {
            if (partial.name !== activePartialName) {
              activePartialName = partial.name;
              activeSayTextLength = 0;
              activeToolTextLength = 0;
              activeSayStreamId = partial.name === 'say' ? `say-${pass + 1}-${++sayStreamSeq}` : null;
              activeToolStreamId = EDITOR_PREVIEW_TAGS.has(partial.name) ? `tool-${pass + 1}-${++toolStreamSeq}` : null;
            }
            if (!partialPushed) {
              onEvent({ event: 'tag_start', payload: { name: partial.name, attrs: partial.attrs || {} } });
              partialPushed = true;
            }
            if (partial.name === 'say') {
              const fullText = normalizeStreamingSayText(partial.body);
              if (fullText.length > activeSayTextLength) {
                const text = fullText.slice(activeSayTextLength);
                activeSayTextLength = fullText.length;
                onEvent({
                  event: 'say_delta',
                  payload: {
                    streamId: activeSayStreamId,
                    tone: normalizeSayTone(partial.attrs?.tone),
                    text,
                    fullText,
                  },
                });
              }
            } else if (EDITOR_PREVIEW_TAGS.has(partial.name)) {
              const fullText = normalizeStreamingToolBody(partial.body);
              if (fullText.length > activeToolTextLength) {
                const text = fullText.slice(activeToolTextLength);
                activeToolTextLength = fullText.length;
                onEvent({
                  event: 'tag_delta',
                  payload: {
                    streamId: activeToolStreamId,
                    name: partial.name,
                    attrs: partial.attrs || {},
                    text,
                  },
                });
              }
            }
          } else if (partialPushed) {
            partialPushed = false;
            if (activePartialName === 'say') {
              completedSayTextLength = activeSayTextLength;
              completedSayStreamId = activeSayStreamId;
            }
            activePartialName = null;
            activeSayTextLength = 0;
            activeToolTextLength = 0;
            activeSayStreamId = null;
            activeToolStreamId = null;
          }

          for (const block of parser.drain()) {
            if (block?.kind === 'tag' && block.name === 'say' && completedSayTextLength !== null) {
              const fullText = normalizeStreamingSayText(block.body);
              if (fullText.length > completedSayTextLength) {
                onEvent({
                  event: 'say_delta',
                  payload: {
                    streamId: completedSayStreamId,
                    tone: normalizeSayTone(block.attrs?.tone),
                    text: fullText.slice(completedSayTextLength),
                    fullText,
                  },
                });
              }
              completedSayTextLength = null;
              completedSayStreamId = null;
            }
            await handleBlock(block);
            if (explicitTaskDone) break;
          }
          if (explicitTaskDone) break;
        }
        if (rawAssistant.length === attemptStartChars && tagBlocks === attemptStartTags) {
          throw makeEmptyResponseError('Provider stream');
        }
        streamCompleted = true;
        break;
      } catch (err) {
        if (isChatAborted(ctx)) return recordedTurns.join('\n');
        if (streamTimedOut) {
          err = new Error(`Provider stream stopped responding for ${formatDuration(idleTimeoutMs)}. The request was aborted instead of hanging.`);
        }
        const attemptsLeft = streamAttempt < STREAM_MAX_ATTEMPTS - 1;
        const attemptProducedNothing = rawAssistant.length === attemptStartChars && tagBlocks === attemptStartTags;
        const canRetryCleanly = attemptProducedNothing && attemptsLeft && isRetryableFailureMessage(err);
        if (canRetryCleanly) {
          console.warn(`[chat] stream attempt ${streamAttempt + 1}/${STREAM_MAX_ATTEMPTS} failed on pass ${pass + 1}: ${err.message}; retrying`);
          await ctx.audit({
            kind: 'chat.retry.stream',
            provider: providerId,
            reason: err.message,
            pass: pass + 1,
            attempt: streamAttempt + 1,
            maxAttempts: STREAM_MAX_ATTEMPTS,
          });
          if (attemptStartChars === 0 && attemptStartTags === 0) {
            rawAssistant = '';
            parser = new ProtocolParser({ allowedTags: ALLOWED_PARSER_TAGS });
            partialPushed = false;
            activePartialName = null;
            activeSayTextLength = 0;
            activeSayStreamId = null;
            sayStreamSeq = 0;
            toolStreamSeq = 0;
            activeToolTextLength = 0;
            activeToolStreamId = null;
          }
          if (getConnectivityStatus().online === false || isLikelyNetworkError(err)) {
            onEvent({ event: 'connectivity', payload: { online: false, retrying: true, reason: err.message } });
            const status = await waitForOnline({ timeoutMs: 120_000 });
            if (status.online) {
              onEvent({ event: 'connectivity', payload: { online: true, retrying: true } });
              continue;
            }
          }
          await sleep(retryDelayMs(streamAttempt));
          continue;
        }
        onEvent({ event: 'say', payload: { tone: 'apologetic', text: `Stream error: ${err.message}` } });
        await ctx.audit({ kind: 'chat.error', provider: providerId, reason: err.message, pass: pass + 1 });
        break;
      } finally {
        clearTimeout(idleTimer);
        if (ctx.signal) ctx.signal.removeEventListener('abort', forwardAbort);
      }
    }

	      if (isChatAborted(ctx)) return recordedTurns.join('\n');
	      if (explicitTaskDone) break;
      if (!streamCompleted) break;

      const openPartial = parser.peekPartial();
      if (!openPartial) break;

      if (continuationCount >= MAX_TAG_CONTINUATIONS) {
        continuationFailed = true;
        const reason = `Provider ended ${MAX_TAG_CONTINUATIONS + 1} times with an unfinished <${openPartial.name}> tag.`;
        console.warn(`[chat] ${reason}`);
        await ctx.audit({
          kind: 'chat.incomplete_tag',
          provider: providerId,
          tag: openPartial.name,
          pass: pass + 1,
          continuations: continuationCount,
          chars: rawAssistant.length,
        });
        onEvent({
          event: 'say',
          payload: {
            tone: 'apologetic',
            text: 'The model kept cutting off mid build. I stopped before saving a broken app.',
          },
        });
        break;
      }

      continuationCount += 1;
      console.warn(`[chat] stream ended with open <${openPartial.name}>; requesting continuation ${continuationCount}/${MAX_TAG_CONTINUATIONS}`);
      await ctx.audit({
        kind: 'chat.continue.open_tag',
        provider: providerId,
        tag: openPartial.name,
        pass: pass + 1,
        continuation: continuationCount,
        chars: rawAssistant.length,
      });
      streamMessages = [
        ...conversation,
        { role: 'assistant', content: rawAssistant },
        {
          role: 'user',
          content: buildOpenTagContinuationPrompt({
            partial: openPartial,
            rawAssistant,
            continuationIndex: continuationCount,
            maxContinuations: MAX_TAG_CONTINUATIONS,
          }),
        },
      ];
    }

    if (isChatAborted(ctx)) return recordedTurns.join('\n');
    if (!explicitTaskDone) {
      for (const block of parser.flush()) {
        await handleBlock(block);
        if (explicitTaskDone) break;
      }
    }
    if (isChatAborted(ctx)) return recordedTurns.join('\n');

    console.log(`\n[chat] ◀ stream end — ${rawAssistant.length}c, ${tagBlocks} tag block(s), ${feedbackActions} feedback tag(s)`);
    if (!streamCompleted && rawAssistant.length === 0 && tagBlocks === 0) {
      break;
    }
    if (continuationFailed) break;

    if (tagBlocks === 0 && rawAssistant.trim()) {
      const fallbackText = rawAssistant.replace(/<\/?[^>]+>/g, '').trim().slice(0, 800);
      if (fallbackText) {
        onEvent({ event: 'say', payload: { tone: 'warm', text: fallbackText } });
        recorded.push(`<say tone="warm">${fallbackText}</say>`);
        usedFallback = true;
        console.warn('[chat] model ignored XML protocol — emitted prose fallback');
      }
    }

    const recordedXml = recorded.join('\n');
    const toolResultsBlock = toolEchoes.length ? formatToolResults(toolEchoes) : '';
    if (toolEchoes.length) {
      console.log(`[chat] tool results approx — ${toolEchoes.length} result(s), ${toolResultsBlock.length}c`);
    }
    if (toolMediaBlocks.length) {
      console.log(`[chat] tool media attachments — ${toolMediaBlocks.length} image(s)`);
    }
    const recordedTurn = recordedXml + (toolResultsBlock ? `\n${toolResultsBlock}` : '');
    if (recordedTurn.trim() || toolMediaBlocks.length) recordedTurns.push(recordedTurn);
    ctx.commitUxUiStrictGuidelines?.();

    // Tool results like search/fetch/read/skill-load/MCP should be available
    // to the model immediately, not one user turn later. Feed the just-ended
    // assistant turn plus a synthetic user tool-results turn into the next
    // pass. This mirrors the model/tool loop pattern from agentic editors:
    // assistant emits actions, the environment responds with tool results,
    // then the assistant continues.
    const shouldContinueForToolResults =
      (feedbackActions > 0 || toolEchoes.length > 0 || toolMediaBlocks.length > 0) &&
      !explicitTaskDone &&
      // Honor the safety-knob env override if the user set one; otherwise
      // MAX_PASSES is Infinity and this check is a no-op. The loop's real
      // exit is `explicitTaskDone` (model called <attempt_completion>) or
      // no actionable tool results in the last pass.
      (pass < MAX_PASSES - 1 || !Number.isFinite(MAX_PASSES)) &&
      Boolean(recordedTurn.trim() || toolMediaBlocks.length);
    if (toolEchoes.length && feedbackActions === 0) {
      console.warn('[chat] tool results present with no registered feedback tag; continuing defensively');
    }
    if (shouldContinueForToolResults) {
      if (recordedXml.trim()) conversation.push({ role: 'assistant', content: recordedXml });
      conversation.push({
        role: 'user',
        content: toolResultsContent(toolResultsBlock, toolMediaBlocks),
      });
      continue;
    }
    break;
  }

  await ctx.audit({ kind: 'chat', provider: providerId, blocks: totalTagBlocks, fallback: usedFallback });
  if (!isChatAborted(ctx)) onEvent({ event: 'done', payload: {} });
  return recordedTurns.join('\n');
}

// Serialize a parsed block back to XML for history. We don't bother with
// CDATA-wrapping the body; the next-turn LLM only needs to see the structure
// and any short attrs / child names. Long bodies (surface HTML, file contents)
// are summarised as length to keep token cost down.
function serializeBlock(block) {
  const attrs = Object.entries(block.attrs || {})
    .map(([k, v]) => ` ${k}="${String(v).replace(/"/g, '&quot;')}"`)
    .join('');
  const truncate = (s) => {
    if (typeof s !== 'string') return '';
    if (s.length <= 200) return s;
    return `${s.slice(0, 200)} … [truncated ${s.length - 200} chars]`;
  };
  if (block.children?.length) {
    const inner = block.children
      .map((c) => `<${c.name}>${truncate(c.body)}</${c.name}>`)
      .join('');
    return `<${block.name}${attrs}>${inner}</${block.name}>`;
  }
  if (!block.body) return `<${block.name}${attrs}/>`;
  return `<${block.name}${attrs}>${truncate(block.body)}</${block.name}>`;
}
