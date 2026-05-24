import { loadSkill, discoverSkills } from '../../runtime/skills.js';
import {
  listMcpServers,
  listMcpTools,
  callMcpTool,
  readMcpResource,
  listMcpResources,
  listMcpResourceTemplates,
} from '../../runtime/mcp.js';

function parseJsonBody(text) {
  const raw = String(text || '').trim();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (e) { throw new Error(`invalid JSON body: ${e.message}`); }
}

export async function executeUseSkill(block, ctx) {
  const name = (block.attrs?.name || block.body || '').trim();
  if (!name) {
    return { ok: false, event: 'tool_error', payload: { tag: 'use_skill', reason: 'skill name required' }, llmEcho: 'use_skill failed: missing name' };
  }
  const skill = await loadSkill(name);
  if (!skill) {
    const skills = await discoverSkills();
    const names = skills.map((s) => s.name).join(', ') || 'none';
    return { ok: false, event: 'tool_error', payload: { tag: 'use_skill', reason: `skill "${name}" not found` }, llmEcho: `skill "${name}" not found. Available skills: ${names}` };
  }
  await ctx.audit({ kind: 'skill.use', name: skill.name, source: skill.source });
  return {
    ok: true,
    event: 'use_skill',
    payload: { name: skill.name, source: skill.source },
    llmEcho: `# Skill: ${skill.name}\n${skill.body}`.slice(0, 36000),
  };
}

export async function executeListMcpServers(_block, ctx) {
  try {
    const servers = await listMcpServers();
    await ctx.audit({ kind: 'mcp.list_servers', count: servers.length });
    const echo = servers.length
      ? servers.map((s) => `- ${s.name} (${s.source}) — ${s.type}${s.disabled ? ' [disabled]' : ''}`).join('\n')
      : '(no MCP servers configured)';
    return { ok: true, event: 'list_mcp_servers', payload: { servers }, llmEcho: echo };
  } catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag: 'list_mcp_servers', reason: e.message }, llmEcho: `list_mcp_servers failed: ${e.message}` };
  }
}

export async function executeListMcpTools(block, ctx) {
  const server = (block.attrs?.server || '').trim();
  if (!server) {
    return { ok: false, event: 'tool_error', payload: { tag: 'list_mcp_tools', reason: 'server required' }, llmEcho: 'list_mcp_tools failed: missing server' };
  }
  try {
    const [tools, resources, templates] = await Promise.all([
      listMcpTools(server),
      listMcpResources(server).catch(() => []),
      listMcpResourceTemplates(server).catch(() => []),
    ]);
    await ctx.audit({ kind: 'mcp.list_tools', server, tools: tools.length, resources: resources.length, templates: templates.length });
    const toolBlock = tools.length ? tools.map((t) => `- ${t.name}${t.description ? ` — ${t.description}` : ''}`).join('\n') : '(no tools)';
    const resourceBlock = resources.length ? resources.map((r) => `- ${r.uri}${r.name ? ` — ${r.name}` : ''}`).join('\n') : '(no resources)';
    const templateBlock = templates.length ? templates.map((r) => `- ${r.uriTemplate}${r.name ? ` — ${r.name}` : ''}`).join('\n') : '(no resource templates)';
    return {
      ok: true,
      event: 'list_mcp_tools',
      payload: { server, tools, resources, resourceTemplates: templates },
      llmEcho: `# MCP server: ${server}\n## Tools\n${toolBlock}\n## Resources\n${resourceBlock}\n## Resource templates\n${templateBlock}`.slice(0, 10000),
    };
  } catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag: 'list_mcp_tools', reason: e.message }, llmEcho: `list_mcp_tools failed: ${e.message}` };
  }
}

export async function executeUseMcpTool(block, ctx) {
  const server = (block.attrs?.server || '').trim();
  const tool = (block.attrs?.tool || '').trim();
  if (!server || !tool) {
    return { ok: false, event: 'tool_error', payload: { tag: 'use_mcp_tool', reason: 'server and tool required' }, llmEcho: 'use_mcp_tool failed: missing server/tool' };
  }
  let args = {};
  try { args = parseJsonBody(block.body); } catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag: 'use_mcp_tool', reason: e.message }, llmEcho: `use_mcp_tool failed: ${e.message}` };
  }
  try {
    const result = await callMcpTool(server, tool, args);
    await ctx.audit({ kind: 'mcp.call_tool', server, tool, isError: !!result.isError });
    const content = Array.isArray(result.content) ? result.content : [];
    const rendered = content.map((item) => {
      if (item.type === 'text') return item.text;
      return JSON.stringify(item);
    }).join('\n').slice(0, 10000);
    return {
      ok: !result.isError,
      event: 'use_mcp_tool',
      payload: { server, tool, result },
      llmEcho: `# MCP tool result — ${server}.${tool}\n${rendered || '(no content)'}`,
    };
  } catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag: 'use_mcp_tool', reason: e.message }, llmEcho: `use_mcp_tool failed: ${e.message}` };
  }
}

export async function executeAccessMcpResource(block, ctx) {
  const server = (block.attrs?.server || '').trim();
  const uri = (block.attrs?.uri || '').trim();
  if (!server || !uri) {
    return { ok: false, event: 'tool_error', payload: { tag: 'access_mcp_resource', reason: 'server and uri required' }, llmEcho: 'access_mcp_resource failed: missing server/uri' };
  }
  try {
    const result = await readMcpResource(server, uri);
    await ctx.audit({ kind: 'mcp.read_resource', server, uri });
    const rendered = (result?.contents || []).map((c) => {
      if (typeof c.text === 'string') return c.text;
      if (typeof c.blob === 'string') return `[blob ${c.mimeType || 'application/octet-stream'} ${c.blob.length}b64]`;
      return JSON.stringify(c);
    }).join('\n').slice(0, 10000);
    return {
      ok: true,
      event: 'access_mcp_resource',
      payload: { server, uri, result },
      llmEcho: `# MCP resource — ${server} ${uri}\n${rendered || '(empty)'}`,
    };
  } catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag: 'access_mcp_resource', reason: e.message }, llmEcho: `access_mcp_resource failed: ${e.message}` };
  }
}
