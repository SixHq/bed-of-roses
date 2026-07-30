// Connector framework — powers the onboarding screen "Connect Bed of Roses to
// your daily life" (Gmail, Calendar, Drive, Slack, Notion, GitHub, iMessage,
// image generation, web browsing, plus any Composio OAuth app).
//
// One declarative catalog drives everything (OpenClaw-style): the UI card
// contract (fields, steps, docs), the live verification probe, the env vars
// exported into execute_command, and the system-prompt block. Secrets live in
// config.json under `connectors[id].fields` and are NEVER echoed by the public
// projection — only hasKey booleans + non-secret meta.
//
// Verify-then-persist: POST /api/connectors/:id runs the live probe FIRST and
// only saves on success. Composio-managed OAuth connectors go through
// /oauth/start + /oauth/status polling; on the first ACTIVE observation the
// connector is persisted and a Composio streamable-http MCP server is wired
// into <DATA_DIR>/.bor/mcp.json (hot-reloaded by runtime/mcp.js).
//
// Hybrid connectors (slack/notion/github) prefer Composio OAuth but keep the
// original manual-token path as a fallback: the card carries `manualFields` +
// `manualSteps`, POST /api/connectors/:id still verifies-then-persists the
// pasted token, and a connector counts as connected if EITHER path succeeded.
//
// Beyond the static catalog, GET /api/connectors/composio/apps lists every
// Composio toolkit with managed OAuth; POST
// /api/connectors/composio/apps/:slug/oauth/start connects one. Connected
// dynamic apps persist under `connectors["composio_<slug>"]` and surface as
// full cards in GET /api/connectors.
//
// Composio API v3 shapes verified against https://backend.composio.dev/api/v3/openapi.json:
//   GET  /api/v3/toolkits?limit=&page=  -> {items:[{name, slug,
//                                    composio_managed_auth_schemes,
//                                    meta:{tools_count, categories:[{name}], description}}],
//                                    total_pages}
//   POST /api/v3/auth_configs        {toolkit:{slug}, auth_config:{type:'use_composio_managed_auth'}}
//                                    -> {auth_config:{id}, toolkit:{slug}}
//   GET  /api/v3/auth_configs?toolkit_slug=&is_composio_managed=true -> {items:[{id,...}]}
//   POST /api/v3/connected_accounts/link {auth_config_id, user_id}
//                                    -> {link_token, redirect_url, expires_at, connected_account_id}
//                                    (plain POST /api/v3/connected_accounts rejects
//                                    Composio-managed OAuth configs with error 600)
//   GET  /api/v3/connected_accounts/:id -> {status: INITIALIZING|INITIATED|ACTIVE|FAILED|EXPIRED|INACTIVE|REVOKED, status_reason}
//   POST /api/v3/mcp/servers         {name, auth_config_ids:[id], managed_auth_via_composio:true}
//                                    -> {id, mcp_url, ...}   (GET ?name= lists -> {items})
//   POST /api/v3/mcp/servers/generate {mcp_server_id, managed_auth_by_composio, user_ids:[...]}
//                                    -> {mcp_url, user_ids_url:[...], connected_account_urls:[...]}
// All requests authenticate with the `x-api-key` header.

import { readFile, writeFile, mkdir, open } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { upsertBorMcpServer, removeBorMcpServer } from './mcp.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, '..', '..');
// Same per-presence data-root derivation as runtime/mcp.js.
const DATA_DIR = resolve(process.env.BOR_DATA_DIR || join(PROJECT_ROOT, 'os-data'));
const CONFIG_PATH = join(DATA_DIR, 'config.json');

const COMPOSIO_BASE_URL = process.env.BOR_COMPOSIO_BASE_URL || 'https://backend.composio.dev';
const COMPOSIO_USER_ID = 'bor-user';
const PROBE_TIMEOUT_MS = 12_000;
const STATUS_CACHE_TTL_MS = 60_000;
const POLL_TOKEN_TTL_MS = 30 * 60 * 1000;
const APPS_CACHE_TTL_MS = 60 * 60 * 1000;
const IMESSAGE_DB_PATH = join(homedir(), 'Library', 'Messages', 'chat.db');

// Dynamic (non-catalog) Composio apps persist under `connectors["composio_<slug>"]`.
const DYNAMIC_PREFIX = 'composio_';

// --- Catalog ---------------------------------------------------------------

/**
 * Factory for a Composio-managed OAuth connector card. `signin` names the
 * identity provider shown in the steps (Google for the Google suite).
 * Hybrid connectors pass `manualFields` + `manualSteps` to keep their
 * original paste-a-token path as a fallback.
 */
function composioConnector(id, toolkit, {
  name,
  tagline,
  category,
  signin = name,
  docsUrl = 'https://docs.composio.dev',
  manualFields = null,
  manualSteps = null,
} = {}) {
  return {
    id,
    name,
    tagline,
    category,
    auth: 'composio-oauth',
    toolkit,
    docsUrl,
    fields: [],
    steps: [
      'Connect Composio first — it handles sign-in securely.',
      `Click Connect. A ${signin} sign-in page opens in your browser.`,
      `Approve access for the ${signin} account you want Bed of Roses to use.`,
    ],
    ...(manualFields ? { manualFields, manualSteps: manualSteps || [] } : {}),
  };
}

const CATALOG = [
  {
    id: 'composio',
    name: 'Composio',
    tagline: 'One key that unlocks Gmail, Drive, Slack, and more',
    category: 'platform',
    auth: 'apikey',
    docsUrl: 'https://docs.composio.dev',
    fields: [
      {
        key: 'COMPOSIO_API_KEY',
        label: 'Composio API key',
        placeholder: 'ak_...',
        secret: true,
        help: 'Project API key from app.composio.dev. Handles OAuth sign-in securely on your behalf.',
      },
    ],
    steps: [
      'Create a free account at [composio.dev](https://composio.dev) (GitHub or Google sign-in works).',
      'Open [app.composio.dev](https://app.composio.dev), go to Settings, then API Keys, and copy a project API key.',
      'Paste the key below. It unlocks every one-click Connect card.',
    ],
  },
  composioConnector('gmail', 'GMAIL', {
    name: 'Gmail',
    tagline: 'Read, search, and send email',
    category: 'daily life',
    signin: 'Google',
  }),
  composioConnector('gcalendar', 'GOOGLECALENDAR', {
    name: 'Google Calendar',
    tagline: 'See your schedule and create events',
    category: 'daily life',
    signin: 'Google',
  }),
  composioConnector('gdrive', 'GOOGLEDRIVE', {
    name: 'Google Drive',
    tagline: 'Search, read, and organize your Drive files',
    category: 'daily life',
    signin: 'Google',
  }),
  composioConnector('gdocs', 'GOOGLEDOCS', {
    name: 'Google Docs',
    tagline: 'Draft, read, and edit documents',
    category: 'work',
    signin: 'Google',
  }),
  composioConnector('gsheets', 'GOOGLESHEETS', {
    name: 'Google Sheets',
    tagline: 'Read and update your spreadsheets',
    category: 'work',
    signin: 'Google',
  }),
  composioConnector('outlook', 'OUTLOOK', {
    name: 'Outlook',
    tagline: 'Read, draft, and send Outlook mail',
    category: 'daily life',
    signin: 'Microsoft',
  }),
  composioConnector('linear', 'LINEAR', {
    name: 'Linear',
    tagline: 'Create and track issues and projects',
    category: 'work',
  }),
  composioConnector('whatsapp', 'WHATSAPP', {
    name: 'WhatsApp',
    tagline: 'Read and send WhatsApp messages',
    category: 'daily life',
  }),
  composioConnector('youtube', 'YOUTUBE', {
    name: 'YouTube',
    tagline: 'Search videos, playlists, and subscriptions',
    category: 'daily life',
  }),
  composioConnector('slack', 'SLACK', {
    name: 'Slack',
    tagline: 'Read and post in your workspace',
    category: 'daily life',
    docsUrl: 'https://api.slack.com/apps',
    manualFields: [
      {
        key: 'SLACK_BOT_TOKEN',
        label: 'Bot User OAuth Token',
        placeholder: 'xoxb-...',
        secret: true,
        help: 'From your Slack app, under OAuth & Permissions, after installing to your workspace.',
      },
    ],
    manualSteps: [
      'Go to [api.slack.com/apps](https://api.slack.com/apps) and click Create New App (from scratch).',
      'Open OAuth & Permissions and add the bot scopes: chat:write, channels:read, channels:history, users:read.',
      'Click Install to Workspace and approve.',
      'Copy the Bot User OAuth Token (starts with xoxb-) and paste it below.',
    ],
  }),
  composioConnector('notion', 'NOTION', {
    name: 'Notion',
    tagline: 'Read and write pages and databases',
    category: 'work',
    docsUrl: 'https://www.notion.so/profile/integrations',
    manualFields: [
      {
        key: 'NOTION_API_KEY',
        label: 'Internal Integration Secret',
        placeholder: 'ntn_... or secret_...',
        secret: true,
        help: 'From notion.so/profile/integrations. Remember to share your pages with the integration.',
      },
    ],
    manualSteps: [
      'Go to [notion.so/profile/integrations](https://www.notion.so/profile/integrations) and click New integration.',
      'Copy the Internal Integration Secret and paste it below.',
      'In Notion, open each page you want available and share it with the integration (the Connections menu under the page options).',
    ],
  }),
  composioConnector('github', 'GITHUB', {
    name: 'GitHub',
    tagline: 'Repos, issues, and pull requests',
    category: 'work',
    docsUrl: 'https://github.com/settings/tokens',
    manualFields: [
      {
        key: 'GITHUB_TOKEN',
        label: 'Personal access token',
        placeholder: 'ghp_... or github_pat_...',
        secret: true,
        help: 'From github.com/settings/tokens with the repo and read:user scopes.',
      },
    ],
    manualSteps: [
      'Go to [github.com/settings/tokens](https://github.com/settings/tokens) and click Generate new token.',
      'Select the repo and read:user scopes.',
      'Copy the token (starts with ghp_ or github_pat_) and paste it below.',
    ],
  }),
  {
    id: 'imessage',
    name: 'iMessage',
    tagline: 'Read and send texts from your Mac',
    category: 'daily life',
    auth: 'local-permission',
    platforms: ['darwin'],
    docsUrl: 'https://support.apple.com/guide/mac-help/mchl211c911f/mac',
    fields: [],
    steps: [
      'Open System Settings, then Privacy & Security, then Full Disk Access.',
      'Enable Bed of Roses (during development: Electron or your terminal app).',
      'Click Connect to verify access to the Messages database.',
    ],
  },
  {
    id: 'imagegen',
    name: 'Image generation',
    tagline: 'Create images from prompts',
    category: 'capabilities',
    auth: 'builtin',
    docsUrl: null,
    fields: [],
    steps: [
      'Image generation uses the OpenAI or Gemini key you added in the model setup step. Nothing else to configure.',
    ],
  },
  {
    id: 'browser',
    name: 'Web browsing',
    tagline: 'Browse the web with its own Chrome',
    category: 'capabilities',
    auth: 'builtin',
    docsUrl: null,
    fields: [],
    steps: [
      'Bed of Roses browses the web through an ambient browser with its own Chrome profile.',
      'Use Open sign-in browser to log into sites (Google, news, socials) so the agent browses as you.',
    ],
  },
];

// Cards tied to a specific OS (def.platforms) are dropped everywhere else —
// gallery, statuses, and system-prompt doctrine all flow from this filter.
const PLATFORM_CATALOG = CATALOG.filter((def) => !def.platforms || def.platforms.includes(process.platform));

const BY_ID = new Map(PLATFORM_CATALOG.map((def) => [def.id, def]));

// Toolkit slugs already covered by static cards — hidden from the dynamic
// app catalog so the UI never shows two paths to the same service.
const STATIC_TOOLKIT_SLUGS = new Set(
  CATALOG.filter((def) => def.toolkit).map((def) => def.toolkit.toLowerCase()),
);

export function getConnectorCatalog() {
  return PLATFORM_CATALOG;
}

// --- Config IO -------------------------------------------------------------
// connectors.js reads/writes the same config.json as server/index.js but owns
// only the `connectors` map. It always preserves every other key and ensures
// `providers` exists so index.js's shape migration never runs on our writes.

async function readConfigFile() {
  try {
    const raw = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function readConfigFileSync() {
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

async function updateConfig(mutate) {
  const cfg = await readConfigFile();
  if (!cfg.providers || typeof cfg.providers !== 'object') cfg.providers = {};
  if (!cfg.connectors || typeof cfg.connectors !== 'object') cfg.connectors = {};
  mutate(cfg);
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  return cfg;
}

function connectorEntry(cfg, id) {
  const entry = cfg?.connectors?.[id];
  return entry && typeof entry === 'object' ? entry : null;
}

/**
 * Public, secret-stripped projection of the config `connectors` map for
 * GET /api/config. Per connector: { connected, hasKey (per saved field key,
 * boolean — never the value), meta, connectedAt }.
 */
export function publicConnectorsProjection(connectorsCfg) {
  const out = {};
  for (const [id, entry] of Object.entries(connectorsCfg || {})) {
    if (!entry || typeof entry !== 'object') continue;
    const hasKey = {};
    for (const key of Object.keys(entry.fields || {})) {
      hasKey[key] = Boolean(entry.fields[key]);
    }
    out[id] = {
      connected: true,
      hasKey,
      meta: entry.meta && typeof entry.meta === 'object' ? entry.meta : {},
      connectedAt: entry.connectedAt || null,
    };
  }
  return out;
}

// --- Probe helpers ---------------------------------------------------------

function bodySnippet(text) {
  return String(text || '').slice(0, 240).replace(/\s+/g, ' ').trim();
}

// fetch wrapper that never throws: { ok, status, json, text, netError }
async function httpProbe(url, init = {}) {
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs || PROBE_TIMEOUT_MS) });
  } catch (e) {
    return { ok: false, status: 0, json: null, text: '', netError: e?.message || 'network error' };
  }
  const text = await res.text().catch(() => '');
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
  return { ok: res.ok, status: res.status, json, text, netError: null };
}

// Per-connector live probes. Each returns { ok, detail?, reason?, meta? }.
const PROBES = {
  async composio(fields) {
    const key = fields.COMPOSIO_API_KEY;
    const { url, init } = buildComposioRequest('/api/v3/toolkits?limit=1', { apiKey: key });
    const res = await httpProbe(url, init);
    if (res.netError) return { ok: false, reason: `Could not reach Composio (${res.netError})` };
    if (!res.ok) return { ok: false, reason: `Composio rejected the key (HTTP ${res.status})${res.text ? `: ${bodySnippet(res.text)}` : ''}` };
    return { ok: true, detail: 'Composio account linked', meta: {} };
  },

  async slack(fields) {
    const token = fields.SLACK_BOT_TOKEN;
    const res = await httpProbe('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.netError) return { ok: false, reason: `Could not reach Slack (${res.netError})` };
    if (!res.json || res.json.ok !== true) {
      const err = res.json?.error || `HTTP ${res.status}`;
      return { ok: false, reason: `Slack rejected the token (${err})` };
    }
    const team = res.json.team || 'workspace';
    const user = res.json.user || 'bot';
    return {
      ok: true,
      detail: `Connected to ${team} as ${user}`,
      meta: { team, user, teamId: res.json.team_id || null },
    };
  },

  async notion(fields) {
    const key = fields.NOTION_API_KEY;
    const res = await httpProbe('https://api.notion.com/v1/users/me', {
      headers: { authorization: `Bearer ${key}`, 'Notion-Version': '2022-06-28' },
    });
    if (res.netError) return { ok: false, reason: `Could not reach Notion (${res.netError})` };
    if (!res.ok) {
      const err = res.json?.message || bodySnippet(res.text) || `HTTP ${res.status}`;
      return { ok: false, reason: `Notion rejected the key: ${err}` };
    }
    const name = res.json?.name || 'integration';
    return { ok: true, detail: `Connected as ${name}`, meta: { integration: name } };
  },

  async github(fields) {
    const token = fields.GITHUB_TOKEN;
    const res = await httpProbe('https://api.github.com/user', {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        // GitHub's API requires a User-Agent on every request.
        'user-agent': 'bed-of-roses',
      },
    });
    if (res.netError) return { ok: false, reason: `Could not reach GitHub (${res.netError})` };
    if (!res.ok) {
      const err = res.json?.message || `HTTP ${res.status}`;
      return { ok: false, reason: `GitHub rejected the token: ${err}` };
    }
    const login = res.json?.login || 'user';
    return { ok: true, detail: `Connected as ${login}`, meta: { login } };
  },

  async imessage() {
    if (process.platform !== 'darwin') {
      return { ok: false, reason: 'iMessage is only available on macOS' };
    }
    // Try to open a real read handle: distinguishes EPERM (Full Disk Access
    // not granted) from a genuinely readable database.
    let fh = null;
    try {
      fh = await open(IMESSAGE_DB_PATH, 'r');
      const buf = Buffer.alloc(16);
      await fh.read(buf, 0, 16, 0);
      return { ok: true, detail: 'Full Disk Access granted', meta: { granted: true } };
    } catch (e) {
      if (e?.code === 'ENOENT') return { ok: false, reason: 'Messages database not found on this Mac' };
      return { ok: false, reason: 'Full Disk Access not granted' };
    } finally {
      try { await fh?.close(); } catch { /* ignore */ }
    }
  },
};

// --- Status cache ----------------------------------------------------------
// Probe results are cached ~60s (same pattern as runtime/browser-use.js);
// ?refresh=1 bypasses. Keyed per connector; invalidated on connect/disconnect.

const statusCache = new Map(); // id -> { result, expiresAt }

async function cachedProbe(id, refresh, fn) {
  const now = Date.now();
  const hit = statusCache.get(id);
  if (!refresh && hit && hit.expiresAt > now) return hit.result;
  const result = await fn();
  statusCache.set(id, { result, expiresAt: Date.now() + STATUS_CACHE_TTL_MS });
  return result;
}

export function invalidateConnectorCache(id) {
  if (id) statusCache.delete(id);
  else statusCache.clear();
}

// --- Composio client -------------------------------------------------------
// All Composio HTTP goes through here. buildComposioRequest is exported so
// request construction can be unit-tested without a real key.

export function buildComposioRequest(path, { method = 'GET', apiKey = '', body } = {}) {
  const url = /^https?:\/\//i.test(path) ? path : `${COMPOSIO_BASE_URL}${path}`;
  const headers = { 'x-api-key': apiKey };
  const init = { method, headers };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return { url, init };
}

async function composioFetch(path, opts = {}) {
  const { url, init } = buildComposioRequest(path, opts);
  const res = await httpProbe(url, { ...init, timeoutMs: opts.timeoutMs });
  if (res.netError) {
    return { ok: false, status: 0, json: null, reason: `Could not reach Composio (${res.netError})` };
  }
  if (!res.ok) {
    const route = `${init.method} ${path.split('?')[0]}`;
    return {
      ok: false,
      status: res.status,
      json: res.json,
      reason: `Composio ${route} returned HTTP ${res.status}${res.text ? `: ${bodySnippet(res.text)}` : ''}`,
    };
  }
  return { ok: true, status: res.status, json: res.json, reason: null };
}

function composioApiKey(cfg) {
  return connectorEntry(cfg, 'composio')?.fields?.COMPOSIO_API_KEY || null;
}

// Find-or-create a Composio-managed auth config for a toolkit. The id is
// cached in config under connectors.composio.meta.authConfigs[<slug>].
async function ensureComposioAuthConfig(apiKey, toolkitSlug) {
  const slug = toolkitSlug.toLowerCase();
  const cfg = await readConfigFile();
  const cached = connectorEntry(cfg, 'composio')?.meta?.authConfigs?.[slug];
  if (cached) return { ok: true, id: cached };

  // Reuse an existing managed auth config for this toolkit if one exists.
  const list = await composioFetch(`/api/v3/auth_configs?toolkit_slug=${encodeURIComponent(slug)}&is_composio_managed=true&limit=10`, { apiKey });
  let id = null;
  if (list.ok) {
    const items = Array.isArray(list.json?.items) ? list.json.items : [];
    id = items.find((item) => item?.id)?.id || null;
  }
  if (!id) {
    const created = await composioFetch('/api/v3/auth_configs', {
      method: 'POST',
      apiKey,
      body: { toolkit: { slug }, auth_config: { type: 'use_composio_managed_auth' } },
    });
    if (!created.ok) return { ok: false, reason: created.reason };
    id = created.json?.auth_config?.id || created.json?.id || null;
    if (!id) return { ok: false, reason: 'Composio auth config response had no id' };
  }
  await updateConfig((c) => {
    if (!c.connectors.composio || typeof c.connectors.composio !== 'object') return;
    const meta = c.connectors.composio.meta && typeof c.connectors.composio.meta === 'object' ? c.connectors.composio.meta : {};
    meta.authConfigs = { ...(meta.authConfigs || {}), [slug]: id };
    c.connectors.composio.meta = meta;
  });
  return { ok: true, id };
}

// Create (or reuse) a Composio MCP server for one toolkit, generate the
// per-user streamable-http URL, and wire it into .bor/mcp.json under
// `mcpName` (the static connector id, or the bare toolkit slug for dynamic
// apps). Idempotent. Returns { ok, mcpServerId, url } | { ok:false, reason }.
async function wireComposioMcp(mcpName, apiKey, authConfigId) {
  const serverName = `bor-${mcpName}`;
  let serverId = null;

  const created = await composioFetch('/api/v3/mcp/servers', {
    method: 'POST',
    apiKey,
    body: { name: serverName, auth_config_ids: [authConfigId], managed_auth_via_composio: true },
  });
  if (created.ok) {
    serverId = created.json?.id || null;
  } else {
    // Likely "name already taken" from a previous run — look it up.
    const list = await composioFetch(`/api/v3/mcp/servers?name=${encodeURIComponent(serverName)}`, { apiKey });
    const items = Array.isArray(list.json?.items) ? list.json.items : [];
    serverId = items.find((item) => item?.name === serverName)?.id || items.find((item) => item?.id)?.id || null;
    if (!serverId) return { ok: false, reason: created.reason };
  }

  const generated = await composioFetch('/api/v3/mcp/servers/generate', {
    method: 'POST',
    apiKey,
    body: { mcp_server_id: serverId, managed_auth_by_composio: true, user_ids: [COMPOSIO_USER_ID] },
  });
  if (!generated.ok) return { ok: false, reason: generated.reason };
  const url = (Array.isArray(generated.json?.user_ids_url) && generated.json.user_ids_url[0])
    || generated.json?.mcp_url
    || null;
  if (!url) return { ok: false, reason: 'Composio MCP URL generation returned no URL' };

  await upsertBorMcpServer(mcpName, {
    type: 'streamable-http',
    url,
    headers: { 'x-api-key': apiKey },
  });
  return { ok: true, mcpServerId: serverId, url };
}

// --- Dynamic app catalog ---------------------------------------------------
// The full list of Composio toolkits with managed OAuth, minus those already
// covered by static cards. Cached in-memory for an hour.

let appsCache = { apps: null, expiresAt: 0 };

/** GET /api/connectors/composio/apps */
export async function listComposioApps() {
  const cfg = await readConfigFile();
  const apiKey = composioApiKey(cfg);
  if (!apiKey) return { ok: false, reason: 'Connect Composio first' };

  if (appsCache.apps && appsCache.expiresAt > Date.now()) {
    return { ok: true, apps: appsCache.apps };
  }

  const bySlug = new Map();
  let page = 1;
  let totalPages = 1;
  do {
    const res = await composioFetch(`/api/v3/toolkits?limit=500&page=${page}`, { apiKey });
    if (!res.ok) return { ok: false, reason: res.reason };
    totalPages = Number(res.json?.total_pages) || 1;
    const items = Array.isArray(res.json?.items) ? res.json.items : [];
    for (const item of items) {
      const slug = String(item?.slug || '').toLowerCase();
      if (!slug || bySlug.has(slug) || STATIC_TOOLKIT_SLUGS.has(slug)) continue;
      const schemes = Array.isArray(item?.composio_managed_auth_schemes) ? item.composio_managed_auth_schemes : [];
      if (!schemes.includes('OAUTH2')) continue;
      bySlug.set(slug, {
        slug,
        name: item?.name || slug,
        toolsCount: Number(item?.meta?.tools_count) || 0,
        category: item?.meta?.categories?.[0]?.name || 'other',
        description: String(item?.meta?.description || ''),
      });
    }
    page += 1;
  } while (page <= totalPages);

  const apps = [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
  appsCache = { apps, expiresAt: Date.now() + APPS_CACHE_TTL_MS };
  return { ok: true, apps };
}

// Pseudo-defs for connected dynamic apps so they surface as full cards in
// GET /api/connectors and reuse the composio-oauth status machinery.
function dynamicConnectorDefs(cfg) {
  const out = [];
  for (const [id, entry] of Object.entries(cfg?.connectors || {})) {
    if (!id.startsWith(DYNAMIC_PREFIX) || BY_ID.has(id)) continue;
    if (!entry || typeof entry !== 'object') continue;
    const slug = id.slice(DYNAMIC_PREFIX.length);
    const meta = entry.meta && typeof entry.meta === 'object' ? entry.meta : {};
    out.push({
      id,
      name: meta.name || slug,
      tagline: bodySnippet(meta.description).slice(0, 140) || 'Connected via Composio',
      category: meta.category || 'other',
      auth: 'composio-oauth',
      toolkit: meta.toolkit || slug.toUpperCase(),
      dynamic: true,
      docsUrl: 'https://docs.composio.dev',
      fields: [],
      steps: [],
    });
  }
  return out;
}

// --- OAuth polling state ---------------------------------------------------

// pollToken -> { connectorId, mcpName, displayName, meta, accountId,
//                authConfigId, createdAt, done }
const pollSessions = new Map();

function prunePollSessions() {
  const cutoff = Date.now() - POLL_TOKEN_TTL_MS;
  for (const [token, rec] of pollSessions) {
    if (rec.createdAt < cutoff) pollSessions.delete(token);
  }
}

// Shared start machinery: ensure the managed auth config, open a link
// session, and stash a poll session. Returns { ok, redirectUrl, pollToken }.
async function startOauthSession(apiKey, toolkitSlug, { connectorId, mcpName, displayName, meta }) {
  const authConfig = await ensureComposioAuthConfig(apiKey, toolkitSlug);
  if (!authConfig.ok) return { ok: false, reason: authConfig.reason };

  // Composio-managed OAuth connections go through the link-session endpoint
  // (POST /api/v3/connected_accounts rejects managed-auth configs with
  // error 600). Response: { link_token, redirect_url, expires_at,
  // connected_account_id } — all required per the live OpenAPI spec.
  const account = await composioFetch('/api/v3/connected_accounts/link', {
    method: 'POST',
    apiKey,
    body: { auth_config_id: authConfig.id, user_id: COMPOSIO_USER_ID },
  });
  if (!account.ok) return { ok: false, reason: account.reason };
  const accountId = account.json?.connected_account_id || null;
  if (!accountId) return { ok: false, reason: 'Composio link response had no connected_account_id' };
  const redirectUrl = account.json?.redirect_url || null;
  if (!redirectUrl) return { ok: false, reason: 'Composio link response had no redirect_url' };

  prunePollSessions();
  const pollToken = randomUUID();
  pollSessions.set(pollToken, {
    connectorId,
    mcpName,
    displayName,
    meta: meta || {},
    accountId,
    authConfigId: authConfig.id,
    createdAt: Date.now(),
    done: false,
  });
  return { ok: true, redirectUrl, pollToken };
}

/**
 * Shared status machinery: poll the connected account; on the first ACTIVE
 * observation persist config `connectors[connectorId]` (preserving any manual
 * fields already saved for hybrid connectors) and wire the MCP server.
 * Idempotent. Returns { status: 'pending'|'connected'|'failed', detail }
 * (+ justConnected for the route's audit call).
 */
async function pollOauthSession(connectorId, pollToken) {
  const rec = pollSessions.get(String(pollToken || ''));
  if (!rec || rec.connectorId !== connectorId) {
    return { status: 'failed', detail: 'Unknown or expired poll token — restart the connection' };
  }
  const cfg = await readConfigFile();
  const apiKey = composioApiKey(cfg);
  if (!apiKey) return { status: 'failed', detail: 'Composio key missing — reconnect Composio first' };

  const res = await composioFetch(`/api/v3/connected_accounts/${encodeURIComponent(rec.accountId)}`, { apiKey });
  if (!res.ok) return { status: 'pending', detail: res.reason || 'Waiting for Composio' };

  const status = String(res.json?.status || '').toUpperCase();
  if (status === 'ACTIVE') {
    const alreadyPersisted = Boolean(connectorEntry(cfg, connectorId)?.meta?.connectedAccountId);
    let detail = `${rec.displayName} linked via Composio`;
    const wired = await wireComposioMcp(rec.mcpName, apiKey, rec.authConfigId);
    await updateConfig((c) => {
      const prev = connectorEntry(c, connectorId);
      c.connectors[connectorId] = {
        // Hybrid connectors keep any manual token saved by the other path.
        fields: prev?.fields && typeof prev.fields === 'object' ? prev.fields : {},
        connectedAt: prev?.connectedAt || new Date().toISOString(),
        meta: {
          ...(prev?.meta && typeof prev.meta === 'object' ? prev.meta : {}),
          ...rec.meta,
          connectedAccountId: rec.accountId,
          authConfigId: rec.authConfigId,
          mcpServerId: wired.ok ? wired.mcpServerId : null,
          detail,
        },
      };
    });
    if (!wired.ok) detail = `${rec.displayName} linked, but MCP wiring failed: ${wired.reason}`;
    invalidateConnectorCache(connectorId);
    const justConnected = !rec.done && !alreadyPersisted;
    rec.done = true;
    return { status: 'connected', detail, justConnected };
  }
  if (['FAILED', 'EXPIRED', 'INACTIVE', 'REVOKED'].includes(status)) {
    return { status: 'failed', detail: res.json?.status_reason || `Connection ${status.toLowerCase()}` };
  }
  return { status: 'pending', detail: 'Waiting for sign-in to finish' };
}

/** POST /api/connectors/:id/oauth/start */
export async function startConnectorOauth(id) {
  const def = BY_ID.get(id);
  if (!def) return { ok: false, reason: `Unknown connector "${id}"`, statusCode: 404 };
  if (def.auth !== 'composio-oauth') return { ok: false, reason: `${def.name} does not use OAuth` };

  const cfg = await readConfigFile();
  const apiKey = composioApiKey(cfg);
  if (!apiKey) {
    return { ok: false, reason: 'Connect Composio first — it handles sign-in securely.' };
  }
  return startOauthSession(apiKey, def.toolkit, {
    connectorId: id,
    mcpName: id,
    displayName: `${def.name} account`,
    meta: { toolkit: def.toolkit },
  });
}

/** GET /api/connectors/:id/oauth/status?pollToken=... */
export async function pollConnectorOauth(id, pollToken) {
  if (!BY_ID.has(id)) {
    return { status: 'failed', detail: 'Unknown or expired poll token — restart the connection' };
  }
  return pollOauthSession(id, pollToken);
}

/** POST /api/connectors/composio/apps/:slug/oauth/start */
export async function startComposioAppOauth(rawSlug) {
  const slug = String(rawSlug || '').toLowerCase();
  const cfg = await readConfigFile();
  const apiKey = composioApiKey(cfg);
  if (!apiKey) return { ok: false, reason: 'Connect Composio first' };

  const catalog = await listComposioApps();
  if (!catalog.ok) return { ok: false, reason: catalog.reason };
  const app = catalog.apps.find((a) => a.slug === slug);
  if (!app) return { ok: false, reason: `Unknown Composio app "${slug}"`, statusCode: 404 };

  return startOauthSession(apiKey, slug, {
    connectorId: `${DYNAMIC_PREFIX}${slug}`,
    mcpName: slug,
    displayName: app.name,
    meta: {
      toolkit: slug.toUpperCase(),
      name: app.name,
      category: app.category,
      description: app.description,
      toolsCount: app.toolsCount,
    },
  });
}

/** GET /api/connectors/composio/apps/:slug/oauth/status?pollToken=... */
export async function pollComposioAppOauth(rawSlug, pollToken) {
  const slug = String(rawSlug || '').toLowerCase();
  return pollOauthSession(`${DYNAMIC_PREFIX}${slug}`, pollToken);
}

// --- Status computation ----------------------------------------------------

const IMAGE_PROVIDERS = [
  ['openai', 'OpenAI'],
  ['gemini', 'Google Gemini'],
  ['bor', 'Bed of Roses'],
];

function imagegenStatus(cfg) {
  const found = IMAGE_PROVIDERS.find(([pid]) => {
    const p = cfg?.providers?.[pid];
    return p && (p.apiKey || p.baseUrl);
  });
  if (found) return { status: 'connected', detail: `Powered by ${found[1]}` };
  return { status: 'not_connected', detail: 'Add an OpenAI or Gemini key in the previous step' };
}

async function computeConnectorStatus(def, cfg, refresh) {
  const entry = connectorEntry(cfg, def.id);

  if (def.id === 'browser') {
    return { status: 'connected', detail: 'Ambient browser with its own Chrome profile' };
  }
  if (def.id === 'imagegen') {
    return imagegenStatus(cfg);
  }

  if (def.auth === 'local-permission') {
    const probe = await cachedProbe(def.id, refresh, () => PROBES.imessage());
    if (entry) {
      return probe.ok
        ? { status: 'connected', detail: probe.detail }
        : { status: 'attention', detail: probe.reason };
    }
    return { status: 'not_connected', detail: probe.ok ? 'Full Disk Access granted — click Connect' : probe.reason };
  }

  if (def.auth === 'composio-oauth') {
    const apiKey = composioApiKey(cfg);
    const manualFieldDefs = def.manualFields || [];
    // Connected if EITHER path succeeded: OAuth via Composio, or (hybrid
    // connectors) a manually pasted token.
    const hasManual = Boolean(entry && manualFieldDefs.some((f) => entry.fields?.[f.key]));
    const hasOauth = Boolean(entry?.meta?.connectedAccountId);
    if (!entry) {
      let detail = apiKey ? 'Ready to connect your account' : 'Requires Composio (connect it first)';
      if (!apiKey && manualFieldDefs.length) detail = 'Connect via Composio, or paste a token';
      return { status: 'not_connected', detail };
    }
    if (!hasManual && !hasOauth) return { status: 'attention', detail: 'Connection incomplete — reconnect' };
    return cachedProbe(def.id, refresh, async () => {
      const probeFn = PROBES[def.id];
      if (hasManual && probeFn) {
        const probe = await probeFn(entry.fields || {});
        if (probe.ok) return { status: 'connected', detail: probe.detail };
        if (!hasOauth) return { status: 'attention', detail: probe.reason };
      }
      if (!apiKey) return { status: 'attention', detail: 'Composio key missing — reconnect Composio' };
      const res = await composioFetch(`/api/v3/connected_accounts/${encodeURIComponent(entry.meta.connectedAccountId)}`, { apiKey });
      if (!res.ok) return { status: 'attention', detail: res.reason };
      const status = String(res.json?.status || '').toUpperCase();
      if (status === 'ACTIVE') return { status: 'connected', detail: entry.meta?.detail || `${def.name} linked via Composio` };
      return { status: 'attention', detail: res.json?.status_reason || `Connection ${status.toLowerCase() || 'unknown'}` };
    });
  }

  // apikey connectors: never-configured stays not_connected without probing;
  // configured ones re-probe (cached) to detect 'attention'.
  if (!entry) return { status: 'not_connected', detail: 'Not connected' };
  const probeFn = PROBES[def.id];
  if (!probeFn) return { status: 'connected', detail: entry.meta?.detail || 'Connected' };
  return cachedProbe(def.id, refresh, async () => {
    const probe = await probeFn(entry.fields || {});
    return probe.ok
      ? { status: 'connected', detail: probe.detail }
      : { status: 'attention', detail: probe.reason };
  });
}

/**
 * GET /api/connectors — the static catalog plus connected dynamic Composio
 * apps, with live statuses. Unconnected dynamic apps are NOT listed here —
 * the UI browses those via GET /api/connectors/composio/apps.
 */
export async function listConnectors({ refresh = false } = {}) {
  const cfg = await readConfigFile();
  const defs = [...PLATFORM_CATALOG, ...dynamicConnectorDefs(cfg)];
  return Promise.all(defs.map(async (def) => {
    let status = { status: 'not_connected', detail: 'Not connected' };
    try {
      status = await computeConnectorStatus(def, cfg, refresh);
    } catch (e) {
      status = { status: 'attention', detail: `Status check failed: ${e?.message || e}` };
    }
    return {
      id: def.id,
      name: def.name,
      tagline: def.tagline,
      category: def.category,
      auth: def.auth,
      status: status.status,
      detail: status.detail || '',
      fields: def.fields.map((f) => ({ key: f.key, label: f.label, placeholder: f.placeholder, secret: f.secret, help: f.help })),
      steps: def.steps,
      manualFields: (def.manualFields || []).map((f) => ({ key: f.key, label: f.label, placeholder: f.placeholder, secret: f.secret, help: f.help })),
      manualSteps: def.manualSteps || [],
      docsUrl: def.docsUrl,
    };
  }));
}

// --- Connect / disconnect --------------------------------------------------

// Verify-then-persist for a pasted-token connect (apikey connectors and the
// manual fallback of hybrid composio-oauth connectors).
async function connectWithFields(def, fieldDefs, rawFields) {
  const fields = {};
  for (const f of fieldDefs) {
    const value = typeof rawFields?.[f.key] === 'string' ? rawFields[f.key].trim() : '';
    if (!value) return { ok: false, reason: `${f.label} is required` };
    fields[f.key] = value;
  }
  const probe = await PROBES[def.id](fields);
  if (!probe.ok) return { ok: false, reason: probe.reason };

  await updateConfig((c) => {
    const prev = connectorEntry(c, def.id);
    c.connectors[def.id] = {
      // Merge so a hybrid connector's manual token coexists with an OAuth link.
      fields: { ...(prev?.fields && typeof prev.fields === 'object' ? prev.fields : {}), ...fields },
      connectedAt: new Date().toISOString(),
      meta: {
        // Keep non-secret cached meta (e.g. composio authConfigs map,
        // connectedAccountId) across re-connects.
        ...(prev?.meta && typeof prev.meta === 'object' ? prev.meta : {}),
        ...(probe.meta || {}),
        detail: probe.detail,
      },
    };
  });
  invalidateConnectorCache(def.id);
  return { ok: true, status: 'connected', detail: probe.detail };
}

/**
 * POST /api/connectors/:id — verify-then-persist. Runs the live probe first;
 * only on success saves into config `connectors[id]`. Returns
 * { ok:true, status:'connected', detail } or { ok:false, reason }.
 */
export async function connectConnector(id, rawFields = {}) {
  const def = BY_ID.get(id);
  if (!def) {
    if (id.startsWith(DYNAMIC_PREFIX)) {
      return { ok: false, reason: 'Composio apps connect through OAuth — use the Connect button' };
    }
    return { ok: false, reason: `Unknown connector "${id}"`, statusCode: 404 };
  }

  if (def.auth === 'builtin') {
    const cfg = await readConfigFile();
    const status = def.id === 'imagegen'
      ? imagegenStatus(cfg)
      : { status: 'connected', detail: 'Ambient browser with its own Chrome profile' };
    return { ok: true, status: status.status, detail: status.detail };
  }

  if (def.auth === 'composio-oauth') {
    // Hybrid connectors accept the manual token path as a fallback.
    if (def.manualFields?.length) return connectWithFields(def, def.manualFields, rawFields);
    return { ok: false, reason: `${def.name} connects through OAuth — use the Connect button` };
  }

  if (def.auth === 'local-permission') {
    const probe = await PROBES.imessage();
    if (!probe.ok) return { ok: false, reason: probe.reason };
    await updateConfig((c) => {
      c.connectors[id] = {
        fields: {},
        connectedAt: connectorEntry(c, id)?.connectedAt || new Date().toISOString(),
        meta: { granted: true },
      };
    });
    invalidateConnectorCache(id);
    return { ok: true, status: 'connected', detail: probe.detail };
  }

  // apikey
  return connectWithFields(def, def.fields, rawFields);
}

/**
 * DELETE /api/connectors/:id — remove config entry + MCP entry. Handles both
 * static ids and dynamic `composio_<slug>` ids (whose MCP server is named
 * after the bare slug).
 */
export async function disconnectConnector(id) {
  const def = BY_ID.get(id);
  const dynamic = !def && id.startsWith(DYNAMIC_PREFIX);
  if (!def && !dynamic) return { ok: false, reason: `Unknown connector "${id}"`, statusCode: 404 };
  await updateConfig((c) => {
    delete c.connectors[id];
  });
  const mcpName = dynamic ? id.slice(DYNAMIC_PREFIX.length) : id;
  try { await removeBorMcpServer(mcpName); } catch { /* best-effort */ }
  invalidateConnectorCache(id);
  return { ok: true };
}

// --- Sign-in browser (builtin web-browsing card) ---------------------------

let signinContext = null; // fallback playwright persistent context

/**
 * POST /api/connectors/browser/signin — open a headed page on the agent's
 * persistent Chrome profile so the user can sign into sites. Best-effort;
 * never throws.
 */
export async function openConnectorSigninBrowser() {
  // Preferred: the ambient browser agent (headed by default, persistent profile).
  try {
    const mod = await import('./browser-agent.js');
    if (typeof mod?.callBrowserTool === 'function') {
      await mod.callBrowserTool('browser_navigate', { url: 'https://www.google.com' });
      return { ok: true };
    }
  } catch { /* module missing or launch failed — fall back */ }

  // Fallback: launch a headed persistent-profile Chromium directly, the way
  // runtime/browser-session.js resolves executables, on the shared profile
  // at .bed-of-roses/browser/profile.
  try {
    const { chromium } = await import('playwright');
    const browserRuntime = await import('./browser.js');
    try { browserRuntime.ensureBrowserDirs(); } catch { /* ignore */ }
    if (signinContext) {
      try {
        const page = signinContext.pages()[0] || await signinContext.newPage();
        await page.bringToFront();
        return { ok: true };
      } catch {
        signinContext = null;
      }
    }
    const options = { headless: false };
    const resolved = browserRuntime.resolveBrowserExecutable({ userFacing: false });
    if (resolved?.ok && resolved.executablePath) options.executablePath = resolved.executablePath;
    signinContext = await chromium.launchPersistentContext(browserRuntime.MCP_PROFILE_DIR, options);
    signinContext.on('close', () => { signinContext = null; });
    const page = signinContext.pages()[0] || await signinContext.newPage();
    await page.goto('https://www.google.com').catch(() => {});
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `Could not open the sign-in browser: ${e?.message || e}` };
  }
}

// --- exec env + prompt block ----------------------------------------------

/**
 * Env vars for execute_command: API keys of connected key-based services,
 * including hybrid connectors' manual tokens when present. OAuth-only
 * connections have no raw token to export.
 * Synchronous (execEnv() builds env at spawn time) — config.json is tiny.
 */
export function connectorEnv() {
  const env = {};
  try {
    const cfg = readConfigFileSync();
    for (const def of PLATFORM_CATALOG) {
      const fieldDefs = def.auth === 'apikey' ? def.fields : (def.manualFields || []);
      if (!fieldDefs.length) continue;
      const entry = connectorEntry(cfg, def.id);
      if (!entry?.fields) continue;
      for (const f of fieldDefs) {
        const value = entry.fields[f.key];
        if (typeof value === 'string' && value) env[f.key] = value;
      }
    }
  } catch { /* never block command execution */ }
  return env;
}

/**
 * Short plain-text block for the system prompt: connected services + how to
 * use each, mail/calendar/chat first. Hybrid connectors steer to curl + the
 * exported env token when one is saved, otherwise to their MCP server.
 * Empty string when nothing is connected. The orchestrator wires this into
 * ai.js — do not import it from here.
 */
export async function renderConnectorsBlock() {
  const cfg = await readConfigFile();
  const has = (id) => Boolean(connectorEntry(cfg, id));
  const hasToken = (id, key) => Boolean(connectorEntry(cfg, id)?.fields?.[key]);
  const mcpLine = (label, server, extra = '') => `- ${label}: use list_mcp_tools server=${server} then use_mcp_tool.${extra}`;
  const lines = [];

  // Mail + calendar first.
  if (has('gmail')) lines.push(mcpLine('Gmail', 'gmail', ' NEVER drive a browser for email.'));
  if (has('outlook')) lines.push(mcpLine('Outlook', 'outlook', ' NEVER drive a browser for email.'));
  if (has('gcalendar')) lines.push(mcpLine('Google Calendar', 'gcalendar', ' NEVER drive a browser for calendar.'));
  // Chat.
  if (has('slack')) {
    lines.push(hasToken('slack', 'SLACK_BOT_TOKEN')
      ? '- Slack: bot token in $SLACK_BOT_TOKEN — call the Slack REST API (slack.com/api/*) with curl via execute_command.'
      : mcpLine('Slack', 'slack'));
  }
  if (has('whatsapp')) lines.push(mcpLine('WhatsApp', 'whatsapp'));
  if (has('imessage')) lines.push('- iMessage: read ~/Library/Messages/chat.db with sqlite3 via execute_command (Full Disk Access granted); send via osascript telling the Messages app.');
  // Files + work.
  if (has('gdrive')) lines.push(mcpLine('Google Drive', 'gdrive'));
  if (has('gdocs')) lines.push(mcpLine('Google Docs', 'gdocs'));
  if (has('gsheets')) lines.push(mcpLine('Google Sheets', 'gsheets'));
  if (has('linear')) lines.push(mcpLine('Linear', 'linear'));
  if (has('youtube')) lines.push(mcpLine('YouTube', 'youtube'));
  if (has('notion')) {
    lines.push(hasToken('notion', 'NOTION_API_KEY')
      ? '- Notion: key in $NOTION_API_KEY — call api.notion.com with curl via execute_command (header Notion-Version: 2022-06-28).'
      : mcpLine('Notion', 'notion'));
  }
  if (has('github')) {
    lines.push(hasToken('github', 'GITHUB_TOKEN')
      ? '- GitHub: token in $GITHUB_TOKEN — call api.github.com with curl via execute_command.'
      : mcpLine('GitHub', 'github'));
  }
  // Dynamic Composio apps, generically.
  for (const [id, entry] of Object.entries(cfg.connectors || {})) {
    if (!id.startsWith(DYNAMIC_PREFIX) || BY_ID.has(id)) continue;
    if (!entry || typeof entry !== 'object') continue;
    const slug = id.slice(DYNAMIC_PREFIX.length);
    lines.push(mcpLine(entry.meta?.name || slug, slug));
  }
  if (has('composio') && lines.length === 0) {
    lines.push('- Composio: key in $COMPOSIO_API_KEY (backend.composio.dev, x-api-key header).');
  }

  if (!lines.length) return '';
  const out = `Connected services:\n${lines.join('\n')}`;
  return out.length > 1600 ? `${out.slice(0, 1597)}...` : out;
}
