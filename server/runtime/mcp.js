import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  CallToolResultSchema,
  ListResourcesResultSchema,
  ListResourceTemplatesResultSchema,
  ListToolsResultSchema,
  ReadResourceResultSchema,
} from '@modelcontextprotocol/sdk/types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, '..', '..');
// Per-presence data root (BOR_DATA_DIR -> os-data/presences/<id>/). The MCP
// marketplace installs into this presence's own .bor/mcp.json.
const DATA_DIR = resolve(process.env.BOR_DATA_DIR || join(PROJECT_ROOT, 'os-data'));
const LOCAL_MCP_PATH = join(PROJECT_ROOT, '.bed-of-roses', 'mcp', 'servers.json');
const GLOBAL_MCP_PATH = join(homedir(), '.bed-of-roses', 'mcp', 'servers.json');
// The marketplace + the LLM read/write servers here, per presence.
const BOR_MCP_PATH = join(DATA_DIR, '.bor', 'mcp.json');
const DEFAULT_TIMEOUT_MS = 30_000;

// Absolute path the install task hands to the LLM, and the marketplace shows.
export function getBorMcpPath() {
  return BOR_MCP_PATH;
}

// Server names currently configured in this presence's .bor/mcp.json — used by
// the marketplace to mark catalog items as "Installed".
export async function readBorMcpServerNames() {
  return Object.keys(await readConfig(BOR_MCP_PATH));
}

const _connections = new Map(); // name -> { signature, client, transport }

const TEMPLATE = {
  mcpServers: {
    browserbase: {
      type: 'stdio',
      command: 'node',
      args: ['server/mcp/playwright-service.js'],
      cwd: '.',
      disabled: false,
    },
    'browserbase-cloud': {
      type: 'streamable-http',
      url: 'https://YOUR-BROWSER-SERVER/mcp',
      headers: {
        Authorization: 'Bearer YOUR_TOKEN',
      },
      disabled: true,
    },
  },
};

async function ensureTemplates() {
  if (!existsSync(LOCAL_MCP_PATH)) {
    await mkdir(dirname(LOCAL_MCP_PATH), { recursive: true });
    await writeFile(LOCAL_MCP_PATH, JSON.stringify(TEMPLATE, null, 2), 'utf8');
  }
}

async function readConfig(path) {
  try {
    const raw = JSON.parse(await readFile(path, 'utf8'));
    return raw && typeof raw === 'object' && raw.mcpServers && typeof raw.mcpServers === 'object'
      ? raw.mcpServers
      : {};
  } catch {
    return {};
  }
}

export async function discoverMcpServers() {
  await ensureTemplates();
  const [globalServers, localServers, borServers] = await Promise.all([
    readConfig(GLOBAL_MCP_PATH),
    readConfig(LOCAL_MCP_PATH),
    readConfig(BOR_MCP_PATH),
  ]);
  const merged = new Map();
  for (const [name, config] of Object.entries(globalServers)) {
    merged.set(name, { name, config, source: 'global' });
  }
  for (const [name, config] of Object.entries(localServers)) {
    merged.set(name, { name, config, source: 'local' });
  }
  // Per-presence marketplace installs win over the shared templates.
  for (const [name, config] of Object.entries(borServers)) {
    merged.set(name, { name, config, source: 'bor' });
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function sanitizeConfig(config) {
  return {
    type: config?.type || 'stdio',
    disabled: !!config?.disabled,
    url: config?.url || null,
    command: config?.command || null,
    cwd: config?.cwd || null,
    args: Array.isArray(config?.args) ? config.args : [],
    headers: config?.headers ? Object.keys(config.headers) : [],
  };
}

function projectValue(value) {
  if (typeof value !== 'string') return value;
  return value
    .replaceAll('${PROJECT_ROOT}', PROJECT_ROOT)
    .replaceAll('$PROJECT_ROOT', PROJECT_ROOT);
}

function projectPath(value) {
  const expanded = projectValue(value);
  if (!expanded || typeof expanded !== 'string') return undefined;
  return isAbsolute(expanded) ? expanded : resolve(PROJECT_ROOT, expanded);
}

function projectEnv(env) {
  if (!env || typeof env !== 'object') return {};
  return Object.fromEntries(
    Object.entries(env)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(projectValue(value))]),
  );
}

function inheritedEnvironment() {
  const env = getDefaultEnvironment();
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('BOR_') && typeof value === 'string') env[key] = value;
  }
  return env;
}

async function createTransport(config) {
  switch (config.type) {
    case 'stdio':
      if (!config.command) throw new Error('stdio MCP server missing command');
      return new StdioClientTransport({
        command: projectValue(config.command),
        args: Array.isArray(config.args) ? config.args.map((arg) => String(projectValue(arg))) : [],
        cwd: projectPath(config.cwd),
        env: { ...inheritedEnvironment(), ...projectEnv(config.env) },
        stderr: config.stderr || 'inherit',
      });
    case 'sse':
      if (!config.url) throw new Error('sse MCP server missing url');
      return new SSEClientTransport(new URL(config.url), {
        requestInit: {
          headers: config.headers || {},
        },
      });
    case 'streamable-http':
    case 'http':
      if (!config.url) throw new Error('http MCP server missing url');
      return new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: {
          headers: config.headers || {},
        },
      });
    default:
      throw new Error(`unsupported MCP transport type "${config.type}"`);
  }
}

async function getConnection(name) {
  const servers = await discoverMcpServers();
  const server = servers.find((s) => s.name === name);
  if (!server) throw new Error(`MCP server "${name}" not found`);
  if (server.config?.disabled) throw new Error(`MCP server "${name}" is disabled`);
  const signature = JSON.stringify(server.config);
  const cached = _connections.get(name);
  if (cached && cached.signature === signature) return cached;
  if (cached) {
    try { await cached.transport?.close?.(); } catch { /* ignore */ }
    _connections.delete(name);
  }
  const client = new Client({ name: 'Bed of Roses', version: '0.1.0' }, { capabilities: {} });
  const transport = await createTransport(server.config);
  await client.connect(transport);
  const next = { signature, client, transport, server };
  _connections.set(name, next);
  return next;
}

export async function listMcpServers() {
  const servers = await discoverMcpServers();
  return servers.map((s) => ({
    name: s.name,
    source: s.source,
    ...sanitizeConfig(s.config),
  }));
}

export async function listMcpTools(serverName) {
  const { client } = await getConnection(serverName);
  const response = await client.request({ method: 'tools/list' }, ListToolsResultSchema, { timeout: DEFAULT_TIMEOUT_MS });
  return response?.tools || [];
}

export async function listMcpResources(serverName) {
  const { client } = await getConnection(serverName);
  const response = await client.request({ method: 'resources/list' }, ListResourcesResultSchema, { timeout: DEFAULT_TIMEOUT_MS });
  return response?.resources || [];
}

export async function listMcpResourceTemplates(serverName) {
  const { client } = await getConnection(serverName);
  const response = await client.request({ method: 'resources/templates/list' }, ListResourceTemplatesResultSchema, { timeout: DEFAULT_TIMEOUT_MS });
  return response?.resourceTemplates || [];
}

export async function callMcpTool(serverName, toolName, args) {
  const { client } = await getConnection(serverName);
  const response = await client.request({
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args,
    },
  }, CallToolResultSchema, { timeout: DEFAULT_TIMEOUT_MS });
  return {
    ...response,
    content: response?.content || [],
  };
}

export async function readMcpResource(serverName, uri) {
  const { client } = await getConnection(serverName);
  return client.request({
    method: 'resources/read',
    params: { uri },
  }, ReadResourceResultSchema, { timeout: DEFAULT_TIMEOUT_MS });
}

function toolPreview(tool) {
  const title = `${tool.name}${tool.description ? ` — ${tool.description}` : ''}`;
  return title.length > 220 ? `${title.slice(0, 220)}…` : title;
}

export async function renderMcpBlock({ maxChars = 5000 } = {}) {
  const servers = await listMcpServers();
  if (!servers.length) return '(no MCP servers configured)';
  const lines = [];
  for (const server of servers) {
    lines.push(`- ${server.name} (${server.source}) — ${server.type}${server.disabled ? ' [disabled]' : ''}`);
    if (server.disabled) continue;
    try {
      const tools = await listMcpTools(server.name);
      if (tools.length) {
        for (const tool of tools.slice(0, 12)) lines.push(`    • ${toolPreview(tool)}`);
        if (tools.length > 12) lines.push(`    • … ${tools.length - 12} more`);
      } else {
        lines.push('    • (no tools exposed)');
      }
    } catch (e) {
      lines.push(`    • unavailable: ${e.message}`);
    }
  }
  const out = lines.join('\n');
  return out.length > maxChars ? `${out.slice(0, maxChars)}\n[…MCP truncated]` : out;
}

export { LOCAL_MCP_PATH, GLOBAL_MCP_PATH };
