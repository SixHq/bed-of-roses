// Ambient browser agent — an in-process @playwright/mcp connection driving a
// persistent companion browser through accessibility snapshots and element
// refs. Unlike the coordinate-based browser-session (screenshot + click x,y),
// this surface returns a YAML accessibility snapshot where every interactive
// element carries a stable ref ([ref=eN]); the model acts by ref, not pixels.
//
// The MCP server runs inside this process over an InMemoryTransport — no
// subprocess, no port. The underlying browser launches lazily on the first
// tool call and STAYS OPEN across tools and turns until <browser_end/> — this
// session is deliberately NOT wired into the executor's auto-close flag that
// tears down the old coordinate session.

import { readFile } from 'node:fs/promises';
import { basename, isAbsolute, join } from 'node:path';
import { createConnection } from '@playwright/mcp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  BROWSER_DATA_ROOT,
  MCP_OUTPUT_DIR,
  MCP_PROFILE_DIR,
  ensureBrowserDirs,
  resolveBrowserExecutable,
  truthy,
} from './browser.js';

// Cap on the inlined markdown+snapshot text echoed back to the model. Beyond
// this the middle of the snapshot is elided (head + tail kept).
const MAX_ECHO_CHARS = 24000;
const ECHO_HEAD_CHARS = 16000;
const ECHO_TAIL_CHARS = 6000;

// The legacy `browserbase` stdio MCP service shares MCP_PROFILE_DIR. If that
// profile is locked by another Chromium, we fall back to a sibling profile
// for the rest of this process's life.
const FALLBACK_PROFILE_DIR = join(BROWSER_DATA_ROOT, 'agent-profile');

let agent = null; // { server, client }
let agentPromise = null; // in-flight init, so concurrent callers share one
let useFallbackProfile = false;

function parseViewport() {
  const raw = String(process.env.BOR_BROWSER_VIEWPORT || '1440x1000');
  const match = raw.match(/^(\d+)\s*[x,]\s*(\d+)$/);
  const width = match ? Number(match[1]) : 1440;
  const height = match ? Number(match[2]) : 1000;
  return { width, height };
}

// Same launch resolution order as playwright-service.js / browser-session.js:
// explicit channel env → resolved executable (system Chrome preferred, bundled
// Chromium fallback) → let Playwright pick. Headed by default — this is a
// visible companion browser; BOR_BROWSER_HEADLESS=1 opts into headless.
function buildLaunchOptions() {
  const options = { headless: truthy(process.env.BOR_BROWSER_HEADLESS) };
  if (process.env.BOR_BROWSER_CHANNEL) {
    options.channel = process.env.BOR_BROWSER_CHANNEL;
  } else {
    const resolved = resolveBrowserExecutable();
    if (resolved.ok) options.executablePath = resolved.executablePath;
  }
  return options;
}

async function initAgent() {
  ensureBrowserDirs();
  const server = await createConnection({
    browser: {
      userDataDir: useFallbackProfile ? FALLBACK_PROFILE_DIR : MCP_PROFILE_DIR,
      launchOptions: buildLaunchOptions(),
      contextOptions: { viewport: parseViewport() },
    },
    capabilities: ['core'],
    outputDir: MCP_OUTPUT_DIR,
    timeouts: {
      action: Number(process.env.BOR_BROWSER_ACTION_TIMEOUT) || 10000,
      navigation: Number(process.env.BOR_BROWSER_NAVIGATION_TIMEOUT) || 90000,
    },
    imageResponses: 'allow',
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'bed-of-roses', version: '0.1.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  agent = { server, client };
  return agent;
}

export async function getBrowserAgent() {
  if (agent) return agent;
  if (!agentPromise) {
    agentPromise = initAgent().finally(() => { agentPromise = null; });
  }
  return agentPromise;
}

export function isBrowserAgentOpen() {
  return Boolean(agent);
}

export async function closeBrowserAgent() {
  const current = agent;
  agent = null;
  if (!current) return;
  try { await current.client.callTool({ name: 'browser_close', arguments: {} }); } catch { /* best-effort */ }
  try { await current.client.close(); } catch { /* ignore */ }
}

function isConnectionError(error) {
  const message = String(error?.message || error || '');
  return /transport|connection|not connected|closed|EPIPE|ECONNRESET|write after end/i.test(message);
}

function isProfileLockError(text) {
  return /ProcessSingleton|SingletonLock|profile.*(?:lock|in use)|user data directory is already in use/i.test(String(text || ''));
}

// Action tools return the snapshot as a markdown FILE LINK under outputDir
// (`- [Snapshot](<path>.yml)`); inline the file contents so the model always
// sees the fresh page state directly in the tool_result.
async function inlineSnapshotLinks(text) {
  const matches = [...String(text || '').matchAll(/\[Snapshot\]\(([^)]+)\)/g)];
  let result = String(text || '');
  for (const match of matches) {
    const linkPath = match[1];
    const candidates = [];
    if (isAbsolute(linkPath)) candidates.push(linkPath);
    candidates.push(join(MCP_OUTPUT_DIR, linkPath), join(MCP_OUTPUT_DIR, basename(linkPath)));
    let yaml = null;
    for (const candidate of candidates) {
      try {
        yaml = await readFile(candidate, 'utf8');
        break;
      } catch { /* try next candidate */ }
    }
    if (yaml != null) {
      result = result.replace(match[0], `Snapshot:\n\`\`\`yaml\n${yaml.trimEnd()}\n\`\`\``);
    }
    // On read failure keep the link text as-is.
  }
  return result;
}

function capEcho(text) {
  if (text.length <= MAX_ECHO_CHARS) return text;
  const head = text.slice(0, ECHO_HEAD_CHARS);
  const tail = text.slice(-ECHO_TAIL_CHARS);
  return `${head}\n[snapshot truncated — use browser_snapshot with depth/target to narrow]\n${tail}`;
}

async function normalizeResult(res) {
  const parts = [];
  const images = [];
  for (const block of res?.content || []) {
    if (block.type === 'text' && block.text) parts.push(block.text);
    else if (block.type === 'image' && block.data) {
      images.push({ mediaType: block.mimeType || 'image/png', base64: block.data });
    }
  }
  const text = capEcho(await inlineSnapshotLinks(parts.join('\n')));
  return { ok: !res?.isError, text, images };
}

/**
 * Call one MCP browser tool and return `{ ok, text, images }` with the
 * snapshot inlined. Recovers once from a dead transport (crashed browser)
 * and once from a locked shared profile (falls back to agent-profile).
 */
export async function callBrowserTool(name, args = {}) {
  let current = await getBrowserAgent();
  let res;
  try {
    res = await current.client.callTool({ name, arguments: args });
  } catch (error) {
    if (!isConnectionError(error)) throw error;
    // Transport died (browser/server crash) — tear down, re-init, retry once.
    await closeBrowserAgent();
    current = await getBrowserAgent();
    res = await current.client.callTool({ name, arguments: args });
  }

  if (res?.isError && !useFallbackProfile) {
    const errText = (res.content || []).map((b) => b.text || '').join('\n');
    if (isProfileLockError(errText)) {
      useFallbackProfile = true;
      await closeBrowserAgent();
      current = await getBrowserAgent();
      res = await current.client.callTool({ name, arguments: args });
    }
  }

  return normalizeResult(res);
}
