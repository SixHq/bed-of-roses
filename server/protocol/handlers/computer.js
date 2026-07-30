// Native Mac computer-control tools for the BOR presence.
//
// This adapts Clicky's useful runtime ideas into BOR's XML protocol:
// - capture the user's Mac screen,
// - use the configured BOR provider's vision model to locate UI elements,
// - map screenshot pixels back into macOS/System Events coordinates,
// - click/type/hotkey/open apps,
// - run a bounded screenshot -> action loop for real app workflows.

import { execFile } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

import { saveGeneratedImage } from '../../tools/images.js';
import { getProvider } from '../../providers/index.js';
import { anthropicReasoningParams } from '../../providers/reasoning.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const COMPUTER_BETA = 'computer-use-2025-11-24';
const DEFAULT_COMPUTER_MODEL = 'claude-sonnet-4-6';
const COMMAND_TIMEOUT_MS = 20_000;
const COMPUTER_TIMEOUT_MS = 45_000;
const PRESENCE_HIDE_SETTLE_MS = 120;

const SUPPORTED_COMPUTER_RESOLUTIONS = [
  { width: 1024, height: 768, ratio: 1024 / 768 },
  { width: 1280, height: 800, ratio: 1280 / 800 },
  { width: 1366, height: 768, ratio: 1366 / 768 },
];

function runFile(file, args = [], { timeoutMs = COMMAND_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    const child = execFile(file, args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error?.code ?? 0,
        signal: error?.signal ?? null,
        stdout: String(stdout || ''),
        stderr: String(stderr || error?.message || ''),
      });
    });
    child.on('error', (error) => resolve({ ok: false, code: null, signal: null, stdout: '', stderr: error.message }));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runAppleScript(lines) {
  const args = [];
  for (const line of Array.isArray(lines) ? lines : [lines]) args.push('-e', line);
  const result = await runFile('osascript', args);
  if (!result.ok) throw new Error(result.stderr || 'osascript failed');
  return result.stdout.trim();
}

// cliclick drives mouse/keyboard via CoreGraphics CGEvents — NOT Apple Events.
// That means it needs ONLY the Accessibility permission (not Automation), so it
// avoids the -1743 "not authorized to send Apple events to System Events" error
// that blocks the osascript -> System Events path on dev/unsigned builds. We use
// it when present and fall back to osascript otherwise.
let _cliclickPath; // undefined = unprobed, string = path, null = absent
async function getCliclick() {
  if (_cliclickPath !== undefined) return _cliclickPath;
  for (const p of ['/opt/homebrew/bin/cliclick', '/usr/local/bin/cliclick']) {
    const probe = await runFile(p, ['-V']).catch(() => ({ ok: false }));
    if (probe.ok) { _cliclickPath = p; return p; }
  }
  const which = await runFile('which', ['cliclick']);
  _cliclickPath = which.ok && which.stdout.trim() ? which.stdout.trim() : null;
  return _cliclickPath;
}

// Run cliclick with the given action args. Returns true on success, false if
// cliclick isn't installed (so callers can fall back), throws on real failure.
async function cliclick(args) {
  const bin = await getCliclick();
  if (!bin) return false;
  const result = await runFile(bin, args);
  if (!result.ok) throw new Error(result.stderr || 'cliclick failed');
  return true;
}

// macOS key name -> cliclick `kp:` key name.
const CLICLICK_KP = {
  return: 'return', enter: 'return', tab: 'tab', escape: 'esc', esc: 'esc',
  delete: 'delete', backspace: 'delete', forwarddelete: 'fwd-delete', space: 'space',
  up: 'arrow-up', down: 'arrow-down', left: 'arrow-left', right: 'arrow-right',
  home: 'home', end: 'end', pageup: 'page-up', pagedown: 'page-down',
};
function cliclickModifier(part) {
  const p = part.toLowerCase();
  if (p === 'cmd' || p === 'command' || p === 'meta') return 'cmd';
  if (p === 'ctrl' || p === 'control') return 'ctrl';
  if (p === 'alt' || p === 'option' || p === 'opt') return 'alt';
  if (p === 'shift') return 'shift';
  return null;
}

function appleString(value) {
  return `"${String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

async function tempPath(ext = 'jpg') {
  const dir = join(tmpdir(), 'bor-computer');
  await mkdir(dir, { recursive: true });
  return join(dir, `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}.${ext}`);
}

async function screenInfo() {
  const script = `
import json
from AppKit import NSScreen, NSEvent
mouse = NSEvent.mouseLocation()
screens = []
for idx, screen in enumerate(NSScreen.screens(), 1):
    frame = screen.frame()
    contains_mouse = (
        mouse.x >= frame.origin.x and
        mouse.x <= frame.origin.x + frame.size.width and
        mouse.y >= frame.origin.y and
        mouse.y <= frame.origin.y + frame.size.height
    )
    screens.append({
        "screenNumber": idx,
        "x": float(frame.origin.x),
        "y": float(frame.origin.y),
        "width": float(frame.size.width),
        "height": float(frame.size.height),
        "scale": float(screen.backingScaleFactor()),
        "isCursorScreen": bool(contains_mouse),
    })
print(json.dumps({
    "mouse": {"x": float(mouse.x), "y": float(mouse.y)},
    "screens": screens,
    "virtualTop": max((s["y"] + s["height"] for s in screens), default=0),
}))
`.trim();
  const result = await runFile('python3', ['-c', script]);
  if (!result.ok) throw new Error(result.stderr || 'failed to inspect screens');
  return JSON.parse(result.stdout);
}

function chooseScreen(info, display = 'cursor') {
  const value = String(display || 'cursor').trim().toLowerCase();
  if (value === 'cursor' || value === 'current') {
    return info.screens.find((screen) => screen.isCursorScreen) || info.screens[0];
  }
  if (value === 'main' || value === 'primary') return info.screens[0];
  const numeric = Number.parseInt(value.replace(/^screen/i, ''), 10);
  if (Number.isFinite(numeric)) {
    return info.screens.find((screen) => screen.screenNumber === numeric) || info.screens[0];
  }
  return info.screens[0];
}

function parseSipsDimensions(output) {
  const width = Number((output.match(/pixelWidth:\s*(\d+)/) || [])[1]);
  const height = Number((output.match(/pixelHeight:\s*(\d+)/) || [])[1]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error('could not read screenshot dimensions');
  return { width, height };
}

async function imageDimensions(path) {
  const result = await runFile('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', path]);
  if (!result.ok) throw new Error(result.stderr || 'sips failed');
  return parseSipsDimensions(result.stdout);
}

function truthyAttr(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

async function setHostPresenceCaptureHidden(hidden) {
  const base = process.env.BOR_HOST_CONTROL_URL;
  const token = process.env.BOR_HOST_CONTROL_TOKEN;
  if (!base || !token || typeof fetch !== 'function') return false;
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/host/presence-capture`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-bor-host-token': token,
      },
      body: JSON.stringify({ hidden }),
      signal: AbortSignal.timeout(900),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    return Boolean(data.hidden || data.depth > 0 || data.ok);
  } catch {
    return false;
  }
}

async function withPresenceExcluded(includePresence, fn) {
  if (includePresence) return { ...(await fn()), presenceExcluded: false };
  const hidden = await setHostPresenceCaptureHidden(true);
  if (hidden) await sleep(PRESENCE_HIDE_SETTLE_MS);
  try {
    return { ...(await fn()), presenceExcluded: hidden };
  } finally {
    if (hidden) {
      await setHostPresenceCaptureHidden(false);
      await sleep(35);
    }
  }
}

function bestComputerResolution(width, height) {
  const ratio = Number(width) / Math.max(1, Number(height));
  let best = SUPPORTED_COMPUTER_RESOLUTIONS[1];
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const candidate of SUPPORTED_COMPUTER_RESOLUTIONS) {
    const diff = Math.abs(ratio - candidate.ratio);
    if (diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
  }
  return { width: best.width, height: best.height };
}

function systemPointFromScreenshot({ x, y, capture, declaredWidth = null, declaredHeight = null }) {
  const sourceWidth = Number(declaredWidth || capture.screenshot.width);
  const sourceHeight = Number(declaredHeight || capture.screenshot.height);
  const screen = capture.display;
  const localX = (Number(x) / sourceWidth) * screen.width;
  const localYTop = (Number(y) / sourceHeight) * screen.height;
  const topOffset = Number(capture.virtualTop || (screen.y + screen.height)) - (screen.y + screen.height);
  return {
    x: Math.round(screen.x + localX),
    y: Math.round(topOffset + localYTop),
  };
}

async function captureScreen({ display = 'cursor', hint = 'screen', includePresence = false } = {}) {
  const info = await screenInfo();
  const screen = chooseScreen(info, display);
  const file = await tempPath('jpg');
  try {
    const result = await withPresenceExcluded(includePresence, async () => {
      const args = ['-x', '-t', 'jpg'];
      if (screen?.screenNumber) args.push('-D', String(screen.screenNumber));
      args.push(file);
      const shot = await runFile('screencapture', args, { timeoutMs: 30_000 });
      if (!shot.ok) {
        throw new Error(`${shot.stderr || 'screencapture failed'}. Grant Screen Recording permission to the terminal/Electron host if macOS asks.`);
      }
      const dims = await imageDimensions(file);
      const data = (await readFile(file)).toString('base64');
      const saved = await saveGeneratedImage({ mediaType: 'image/jpeg', data, hint });
      return { saved, dims };
    });
    return {
      ...result.saved,
      display: screen,
      screens: info.screens,
      virtualTop: info.virtualTop,
      mouse: info.mouse,
      screenshot: result.dims,
      presenceExcluded: result.presenceExcluded,
    };
  } finally {
    await rm(file, { force: true }).catch(() => {});
  }
}

async function resizedForComputerUse(capture) {
  const size = bestComputerResolution(capture.display.width, capture.display.height);
  const sourcePath = capture.path;
  const out = await tempPath('jpg');
  const result = await runFile('sips', ['-z', String(size.height), String(size.width), sourcePath, '--out', out]);
  if (!result.ok) throw new Error(result.stderr || 'failed to resize screenshot for computer use');
  const data = (await readFile(out)).toString('base64');
  await rm(out, { force: true }).catch(() => {});
  return { ...size, data, mediaType: 'image/jpeg' };
}

function anthropicComputerConfig(config) {
  const anthropicCfg = config?.providers?.anthropic;
  if (!anthropicCfg?.apiKey) return null;
  return {
    apiKey: anthropicCfg.apiKey,
    model: anthropicCfg.model || DEFAULT_COMPUTER_MODEL,
  };
}

function configuredVisionProvider(config) {
  const providerId = config?.defaultProvider;
  const provider = providerId ? getProvider(providerId) : null;
  if (!provider || typeof provider.stream !== 'function') {
    throw new Error('The selected provider does not support vision planning.');
  }
  const providerCfg = config.providers?.[providerId] || {};
  const hasAuth = providerCfg.apiKey || (provider.id === 'openai-compatible' && providerCfg.baseUrl);
  if (!hasAuth) throw new Error(`${provider.label} is not configured.`);
  return { providerId, provider, providerCfg };
}

function extractJsonObject(text) {
  const raw = String(text || '').trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  try { return JSON.parse(raw); } catch { /* try balanced object below */ }

  const start = raw.indexOf('{');
  if (start < 0) throw new Error(`provider did not return JSON: ${raw.slice(0, 160)}`);
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(raw.slice(start, i + 1));
    }
  }
  throw new Error(`provider returned incomplete JSON: ${raw.slice(0, 160)}`);
}

function jsonImageContent({ resized, prompt }) {
  return [
    {
      type: 'text',
      text: `${prompt}

Screenshot coordinate space: ${resized.width}x${resized.height}. Coordinates must be integer pixels in this exact image space.`,
    },
    {
      type: 'image_url',
      url: `data:${resized.mediaType};base64,${resized.data}`,
      mediaType: resized.mediaType,
    },
  ];
}

async function callVisionJson({ config, capture, prompt }) {
  const { providerId, provider, providerCfg } = configuredVisionProvider(config);
  const resized = await resizedForComputerUse(capture);
  let text = '';
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(new Error('vision planning request timed out')), COMPUTER_TIMEOUT_MS);
  if (typeof timeout.unref === 'function') timeout.unref();
  try {
    for await (const chunk of provider.stream({
      apiKey: providerCfg.apiKey,
      model: providerCfg.model || provider.defaultModel,
      baseUrl: providerCfg.baseUrl,
      system: [
        'You are BOR\'s Mac screen vision planner.',
        'Look at the supplied screenshot and return STRICT JSON only.',
        'No markdown. No XML. No prose outside JSON.',
        'Use screenshot pixel coordinates, not normalized coordinates.',
      ].join('\n'),
      messages: [{
        role: 'user',
        content: jsonImageContent({ resized, prompt }),
      }],
      signal: ac.signal,
    })) {
      text += chunk;
      if (text.length > 8000) break;
    }
  } finally {
    clearTimeout(timeout);
  }
  return {
    providerId,
    resized: { width: resized.width, height: resized.height },
    text: text.trim(),
    json: extractJsonObject(text),
  };
}

async function callAnthropicComputer({ config, capture, prompt, maxTokens = 512 }) {
  const computerCfg = anthropicComputerConfig(config);
  if (!computerCfg) throw new Error('Anthropic API key required for Computer Use. Add Anthropic in settings first.');
  const resized = await resizedForComputerUse(capture);
  const body = {
    model: computerCfg.model,
    max_tokens: maxTokens,
    ...anthropicReasoningParams(),
    tools: [{
      type: 'computer_20251124',
      name: 'computer',
      display_width_px: resized.width,
      display_height_px: resized.height,
    }],
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: resized.mediaType, data: resized.data },
        },
        { type: 'text', text: prompt },
      ],
    }],
  };
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(new Error('computer-use request timed out')), COMPUTER_TIMEOUT_MS);
  if (typeof timeout.unref === 'function') timeout.unref();
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': computerCfg.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-beta': COMPUTER_BETA,
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Anthropic Computer Use ${res.status}: ${text.slice(0, 500)}`);
    const json = JSON.parse(text);
    return {
      json,
      resized: { width: resized.width, height: resized.height },
      text: (json.content || []).filter((b) => b.type === 'text').map((b) => b.text || '').join('\n').trim(),
      toolUses: (json.content || []).filter((b) => b.type === 'tool_use'),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function firstCoordinateToolUse(toolUses) {
  for (const block of toolUses || []) {
    const coordinate = block?.input?.coordinate;
    if (Array.isArray(coordinate) && coordinate.length === 2) return block;
  }
  return null;
}

function coordinateFromPlan(plan) {
  const value = plan?.coordinate || plan?.coordinates || plan?.point || plan?.click || plan?.target;
  if (Array.isArray(value) && value.length >= 2) return [Number(value[0]), Number(value[1])];
  if (value && typeof value === 'object') {
    const x = Number(value.x);
    const y = Number(value.y);
    if (Number.isFinite(x) && Number.isFinite(y)) return [x, y];
  }
  return null;
}

function normalizePlannerAction(plan = {}) {
  if (plan.done === true || String(plan.status || '').toLowerCase() === 'done') return null;
  const source = plan.input && typeof plan.input === 'object'
    ? plan.input
    : plan.action && typeof plan.action === 'object'
      ? plan.action
      : plan;
  const rawAction = String(source.action || source.type || plan.action || '').toLowerCase().trim();
  const actionAliases = {
    click: 'left_click',
    left: 'left_click',
    left_click: 'left_click',
    double: 'double_click',
    double_click: 'double_click',
    move: 'mouse_move',
    mouse_move: 'mouse_move',
    type: 'type',
    text: 'type',
    key: 'key',
    hotkey: 'key',
    press: 'key',
    wait: 'wait',
    scroll: 'scroll',
  };
  const action = actionAliases[rawAction] || rawAction;
  if (!action || action === 'none') return null;
  const input = { action };
  const coordinate = coordinateFromPlan(source) || coordinateFromPlan(plan);
  if (coordinate) input.coordinate = coordinate.map((n) => Math.round(Number(n)));
  if (source.text || plan.text) input.text = String(source.text || plan.text);
  if (source.key || plan.key) input.key = String(source.key || plan.key);
  if (source.scroll_amount || source.amount || plan.scroll_amount || plan.amount) {
    input.scroll_amount = Number(source.scroll_amount || source.amount || plan.scroll_amount || plan.amount);
  }
  return { input };
}

async function clickAt(x, y) {
  const X = Math.round(Number(x));
  const Y = Math.round(Number(y));
  if (await cliclick([`c:${X},${Y}`])) return;
  await runAppleScript(`tell application "System Events" to click at {${X}, ${Y}}`);
}

async function doubleClickAt(x, y) {
  const X = Math.round(Number(x));
  const Y = Math.round(Number(y));
  if (await cliclick([`dc:${X},${Y}`])) return;
  await clickAt(X, Y);
  await new Promise((resolve) => setTimeout(resolve, 90));
  await clickAt(X, Y);
}

async function typeText(text) {
  const value = String(text ?? '');
  // cliclick types the literal text via CGEvents (Accessibility only).
  if (await cliclick([`t:${value}`])) return;
  // Fallback: clipboard + Cmd+V via System Events (needs Automation).
  await runAppleScript([
    'set oldClipboard to the clipboard',
    `set the clipboard to ${appleString(value)}`,
    'tell application "System Events" to keystroke "v" using command down',
    'delay 0.12',
    'set the clipboard to oldClipboard',
  ]);
}

const KEY_CODES = {
  return: 36,
  enter: 36,
  tab: 48,
  escape: 53,
  esc: 53,
  delete: 51,
  backspace: 51,
  forwarddelete: 117,
  space: 49,
  up: 126,
  down: 125,
  left: 123,
  right: 124,
  home: 115,
  end: 119,
  pageup: 116,
  pagedown: 121,
};

function modifierName(part) {
  const p = part.toLowerCase();
  if (p === 'cmd' || p === 'command' || p === 'meta') return 'command down';
  if (p === 'ctrl' || p === 'control') return 'control down';
  if (p === 'alt' || p === 'option' || p === 'opt') return 'option down';
  if (p === 'shift') return 'shift down';
  return null;
}

async function pressKey(combo) {
  const parts = String(combo || '').split(/[+\s]+/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) throw new Error('key required');
  const key = parts.at(-1).toLowerCase();

  // Prefer cliclick (CGEvents, Accessibility-only — no -1743).
  const cliMods = parts.slice(0, -1).map(cliclickModifier).filter(Boolean);
  const kpName = CLICLICK_KP[key];
  const keyAction = kpName ? `kp:${kpName}` : (key.length === 1 ? `t:${key}` : null);
  if (keyAction) {
    const args = [
      ...cliMods.map((m) => `kd:${m}`),
      keyAction,
      ...cliMods.slice().reverse().map((m) => `ku:${m}`),
    ];
    if (await cliclick(args)) return;
  }

  // Fallback: osascript -> System Events (needs Automation permission).
  const modifiers = parts.slice(0, -1).map(modifierName).filter(Boolean);
  const using = modifiers.length ? ` using {${modifiers.join(', ')}}` : '';
  if (KEY_CODES[key] !== undefined) {
    await runAppleScript(`tell application "System Events" to key code ${KEY_CODES[key]}${using}`);
    return;
  }
  const normalized = key.length === 1 ? key : key.replace(/^key:/, '');
  await runAppleScript(`tell application "System Events" to keystroke ${appleString(normalized)}${using}`);
}

async function openMacApp(name) {
  const appName = String(name || '').trim();
  if (!appName) throw new Error('app name required');
  if (process.platform === 'win32') {
    // `start` resolves App Paths registrations and PATH entries.
    const result = await runFile('cmd', ['/c', 'start', '', appName]);
    if (!result.ok) throw new Error(result.stderr || `failed to open ${appName}`);
    return;
  }
  if (process.platform === 'linux') {
    // gtk-launch takes a .desktop id; fall back to running the name as a
    // command for CLI-launchable apps (code, firefox, …).
    const desktopId = appName.toLowerCase().replaceAll(' ', '-');
    const viaGtk = await runFile('gtk-launch', [desktopId]).catch(() => ({ ok: false }));
    if (viaGtk.ok) return;
    const quoted = `'${appName.replaceAll("'", `'\\''`)}'`;
    const direct = await runFile('sh', ['-c', `nohup ${quoted} >/dev/null 2>&1 &`]);
    if (!direct.ok) throw new Error(direct.stderr || `failed to open ${appName}`);
    return;
  }
  const result = await runFile('open', ['-a', appName]);
  if (!result.ok) throw new Error(result.stderr || `failed to open ${appName}`);
}

async function executeComputerAction(action, capture, declared) {
  const input = action.input || {};
  const kind = String(input.action || '').toLowerCase();
  const coordinate = Array.isArray(input.coordinate) ? input.coordinate : null;
  const mapped = coordinate
    ? systemPointFromScreenshot({ x: coordinate[0], y: coordinate[1], capture, declaredWidth: declared.width, declaredHeight: declared.height })
    : null;

  if (kind === 'left_click') {
    if (!mapped) throw new Error('left_click missing coordinate');
    await clickAt(mapped.x, mapped.y);
    return `left_click at ${mapped.x},${mapped.y}`;
  }
  if (kind === 'double_click') {
    if (!mapped) throw new Error('double_click missing coordinate');
    await doubleClickAt(mapped.x, mapped.y);
    return `double_click at ${mapped.x},${mapped.y}`;
  }
  if (kind === 'mouse_move') {
    return mapped ? `mouse_move target ${mapped.x},${mapped.y}` : 'mouse_move skipped';
  }
  if (kind === 'type') {
    await typeText(input.text || '');
    return `typed ${String(input.text || '').length} chars`;
  }
  if (kind === 'key') {
    await pressKey(input.text || input.key || '');
    return `pressed ${input.text || input.key}`;
  }
  if (kind === 'wait' || kind === 'screenshot') {
    await new Promise((resolve) => setTimeout(resolve, kind === 'wait' ? 900 : 120));
    return kind;
  }
  if (kind === 'scroll') {
    const amount = Number(input.scroll_amount || input.amount || 4);
    const key = amount < 0 ? 'up' : 'down';
    for (let i = 0; i < Math.min(12, Math.abs(Math.round(amount))); i += 1) await pressKey(key);
    return `scroll ${key} ${Math.abs(Math.round(amount))}`;
  }
  throw new Error(`unsupported computer action: ${kind || '(missing)'}`);
}

function toolResult(event, payload, echo, extra = {}) {
  return { ok: true, event, payload, llmEcho: echo, ...extra };
}

function toolError(tag, reason) {
  return { ok: false, event: 'tool_error', payload: { tag, reason }, llmEcho: `${tag} failed: ${reason}` };
}

export async function executeScreenCapture(block, ctx) {
  try {
    const capture = await captureScreen({
      display: block.attrs?.display || 'cursor',
      hint: block.attrs?.hint || 'screen',
      includePresence: truthyAttr(block.attrs?.include_presence),
    });
    await ctx.audit({ kind: 'computer.screen_capture', url: capture.url, display: capture.display?.screenNumber, presenceExcluded: capture.presenceExcluded });
    return toolResult('screen_capture', {
      url: capture.url,
      bytes: capture.bytes,
      screenshot: capture.screenshot,
      display: capture.display,
      mouse: capture.mouse,
      presenceExcluded: capture.presenceExcluded,
    }, `Captured screen ${capture.display?.screenNumber || 1}: ${capture.url} (${capture.screenshot.width}x${capture.screenshot.height}). ${capture.presenceExcluded ? 'The BOR presence/thought bubble was hidden during capture.' : 'The BOR presence may be visible in this capture.'} The screenshot image is attached to this tool result; inspect the attached image pixels, not any previous screen context.`, {
      llmMedia: [{
        type: 'image_url',
        url: capture.url,
        mediaType: 'image/jpeg',
        label: `screen ${capture.display?.screenNumber || 1}`,
      }],
    });
  } catch (error) {
    return toolError('screen_capture', error.message);
  }
}

export async function executeLocateScreenElement(block, ctx) {
  const query = (block.attrs?.query || block.body || ctx.lastUserMessage || '').trim();
  if (!query) return toolError('locate_screen_element', 'query required');
  try {
    const config = await ctx.loadConfig();
    const capture = await captureScreen({
      display: block.attrs?.display || 'cursor',
      hint: 'locate-screen-element',
      includePresence: truthyAttr(block.attrs?.include_presence),
    });
    const prompt = `Find the visible Mac UI element matching this request:
"${query}"

Return JSON with this schema:
{"found":true,"coordinate":[x,y],"action":"left_click","label":"short visible label","reason":"why this is the target"}

If no specific visible UI element matches, return:
{"found":false,"reason":"short reason"}`;
    let planResult;
    try {
      planResult = await callVisionJson({ config, capture, prompt });
    } catch (visionError) {
      if (!anthropicComputerConfig(config)) throw visionError;
      const fallback = await callAnthropicComputer({
        config,
        capture,
        prompt: `The user is looking at this Mac screen and asked: "${query}"

Use the computer tool to click the exact UI element that best satisfies the request. If no specific visible UI element applies, respond with text only saying "no specific element".

Return one computer tool action when an element should be clicked.`,
        maxTokens: 256,
      });
      const toolUse = firstCoordinateToolUse(fallback.toolUses);
      if (!toolUse) {
        return toolResult('locate_screen_element', {
          found: false,
          text: fallback.text,
          screenshotUrl: capture.url,
          presenceExcluded: capture.presenceExcluded,
        }, `No specific screen element found. Model said: ${fallback.text || '(no text)'}`);
      }
      const [fx, fy] = toolUse.input.coordinate;
      planResult = {
        providerId: 'anthropic-computer-use',
        resized: fallback.resized,
        json: { found: true, coordinate: [fx, fy], action: toolUse.input.action || 'left_click', reason: 'Anthropic Computer Use fallback' },
      };
    }
    const plan = planResult.json || {};
    const coordinate = coordinateFromPlan(plan);
    if (plan.found === false || !coordinate) {
      return toolResult('locate_screen_element', {
        found: false,
        text: plan.reason || plan.text || planResult.text,
        screenshotUrl: capture.url,
        presenceExcluded: capture.presenceExcluded,
        provider: planResult.providerId,
      }, `No specific screen element found. Model said: ${plan.reason || plan.text || planResult.text || '(no text)'}`);
    }
    const [x, y] = coordinate;
    const click = systemPointFromScreenshot({
      x, y,
      capture,
      declaredWidth: planResult.resized.width,
      declaredHeight: planResult.resized.height,
    });
    await ctx.audit({ kind: 'computer.locate', query, x: click.x, y: click.y });
    return toolResult('locate_screen_element', {
      found: true,
      query,
      action: plan.action || 'left_click',
      label: plan.label || '',
      reason: plan.reason || '',
      provider: planResult.providerId,
      coordinate: { x: Math.round(Number(x)), y: Math.round(Number(y)), space: `${planResult.resized.width}x${planResult.resized.height}` },
      click: { x: click.x, y: click.y, space: 'mac-system-events' },
      screenshotUrl: capture.url,
      presenceExcluded: capture.presenceExcluded,
      display: capture.display,
    }, `Located "${query}" at computer coordinate ${Math.round(Number(x))},${Math.round(Number(y))}; click_x=${click.x}, click_y=${click.y}; screenshot=${capture.url}`);
  } catch (error) {
    return toolError('locate_screen_element', error.message);
  }
}

export async function executeComputerClick(block, ctx) {
  const x = Number(block.attrs?.x);
  const y = Number(block.attrs?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return toolError('computer_click', 'x and y required');
  try {
    const kind = String(block.attrs?.kind || 'left').toLowerCase();
    if (kind === 'double') await doubleClickAt(x, y);
    else await clickAt(x, y);
    await ctx.audit({ kind: 'computer.click', x, y, clickKind: kind });
    return toolResult('computer_click', { x: Math.round(x), y: Math.round(y), kind }, `Clicked ${kind} at ${Math.round(x)},${Math.round(y)}.`);
  } catch (error) {
    return toolError('computer_click', error.message);
  }
}

export async function executeComputerType(block, ctx) {
  const text = String(block.body || block.attrs?.text || '');
  if (!text) return toolError('computer_type', 'text required');
  try {
    await typeText(text);
    await ctx.audit({ kind: 'computer.type', chars: text.length });
    return toolResult('computer_type', { chars: text.length }, `Typed/pasted ${text.length} characters into the active app.`);
  } catch (error) {
    return toolError('computer_type', error.message);
  }
}

export async function executeComputerKey(block, ctx) {
  const key = String(block.attrs?.key || block.body || '').trim();
  if (!key) return toolError('computer_key', 'key required');
  try {
    await pressKey(key);
    await ctx.audit({ kind: 'computer.key', key });
    return toolResult('computer_key', { key }, `Pressed ${key}.`);
  } catch (error) {
    return toolError('computer_key', error.message);
  }
}

export async function executeOpenApp(block, ctx) {
  const name = String(block.attrs?.name || block.body || '').trim();
  if (!name) return toolError('open_app', 'name required');
  try {
    await openMacApp(name);
    await ctx.audit({ kind: 'computer.open_app', name });
    return toolResult('open_app', { name }, `Opened or activated ${name}.`);
  } catch (error) {
    return toolError('open_app', error.message);
  }
}

export async function executeComputerUse(block, ctx) {
  const goal = String(block.attrs?.goal || block.body || ctx.lastUserMessage || '').trim();
  if (!goal) return toolError('computer_use', 'goal required');
  const maxSteps = Math.max(1, Math.min(20, Number.parseInt(block.attrs?.max_steps || '8', 10) || 8));
  const display = block.attrs?.display || 'cursor';
  const includePresence = truthyAttr(block.attrs?.include_presence);
  const actions = [];
  try {
    const config = await ctx.loadConfig();
    for (let step = 1; step <= maxSteps; step += 1) {
      const capture = await captureScreen({ display, hint: `computer-use-step-${step}`, includePresence });
      const previous = actions.length ? actions.map((a, i) => `${i + 1}. ${a}`).join('\n') : '(none)';
      const prompt = `You are controlling the user's Mac through BOR.

Goal:
${goal}

Previous actions:
${previous}

Look at the current screenshot. Return exactly one JSON object.

If the task is complete or blocked:
{"done":true,"reason":"short reason"}

Otherwise return one action:
{"done":false,"action":"left_click","coordinate":[x,y],"reason":"why this action"}
{"done":false,"action":"double_click","coordinate":[x,y],"reason":"why this action"}
{"done":false,"action":"type","text":"text to type","reason":"why this action"}
{"done":false,"action":"key","key":"cmd+l","reason":"why this action"}
{"done":false,"action":"wait","reason":"why wait"}
{"done":false,"action":"scroll","scroll_amount":4,"reason":"why scroll"}

Be careful. Prefer clicking visible controls, typing only when a text field is focused, and using short hotkeys when they are safer than coordinate guesses.`;
      let result;
      let toolUse;
      try {
        result = await callVisionJson({ config, capture, prompt });
        toolUse = normalizePlannerAction(result.json || {});
      } catch (visionError) {
        if (!anthropicComputerConfig(config)) throw visionError;
        result = await callAnthropicComputer({
          config,
          capture,
          prompt: `${prompt}

If you use the computer tool, make exactly one action. If done, answer with text beginning "DONE:".`,
          maxTokens: 512,
        });
        toolUse = result.toolUses?.[0];
      }
      if (!toolUse) {
        const text = result.json?.reason || result.json?.text || result.text || 'No further action returned.';
        actions.push(text);
        await ctx.audit({ kind: 'computer.use.done', goal, steps: actions.length, reason: text.slice(0, 160) });
        return toolResult('computer_use', { goal, done: true, steps: actions.length, actions, text, screenshotUrl: capture.url, presenceExcluded: capture.presenceExcluded }, `Computer task stopped after ${actions.length} step(s): ${text}`);
      }
      const summary = await executeComputerAction(toolUse, capture, result.resized);
      actions.push(summary);
      await ctx.audit({ kind: 'computer.use.step', goal, step, action: summary });
      await new Promise((resolve) => setTimeout(resolve, 550));
    }
    return toolResult('computer_use', { goal, done: false, steps: actions.length, actions }, `Computer task reached max_steps=${maxSteps}.\n${actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}`);
  } catch (error) {
    return toolError('computer_use', `${error.message}\nCompleted actions:\n${actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}`);
  }
}
