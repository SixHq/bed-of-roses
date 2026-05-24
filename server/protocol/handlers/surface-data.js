// Surface data handlers — XML protocol access to app/widget state.json.
//
// App/widget HTML can already use the iframe bridge getState/setState. These
// handlers give the main LLM and dream cycle the same durable data surface
// without rewriting UI code. Mutations use a small JSON Patch subset so CRUD
// is precise and additive.

function compactJson(value, max = 6000) {
  const text = JSON.stringify(value, null, 2);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n... [truncated ${text.length - max} chars]`;
}

function parseOperations(body) {
  let parsed;
  try {
    parsed = JSON.parse(String(body || '').trim());
  } catch (e) {
    const err = new Error(`body must be JSON operations: ${e.message}`);
    err.statusCode = 400;
    throw err;
  }
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.operations)) return parsed.operations;
  if (parsed && typeof parsed === 'object' && parsed.op) return [parsed];
  const err = new Error('body must be a JSON Patch operation, an array of operations, or {"operations":[...]}');
  err.statusCode = 400;
  throw err;
}

function cleanId(block) {
  return String(block.attrs?.id || '').trim();
}

function idFromStatePath(path) {
  const raw = String(path || '').trim().replace(/\\/g, '/');
  const match = raw.match(/(?:^|\/)os-data\/widgets\/((?:app|widget)-[\w.-]+)\/state\.json$/);
  if (!match) return '';
  return match[1];
}

function surfaceId(block) {
  return cleanId(block) || idFromStatePath(block.attrs?.state_path || block.attrs?.state || block.attrs?.file || '');
}

export async function executeListSurfaces(_block, ctx) {
  const tag = 'list_surfaces';
  try {
    const surfaces = await ctx.listSurfaces();
    await ctx.audit({ kind: 'surface.list', count: surfaces.length });
    const lines = surfaces.map((s) => {
      const kind = s.kind === 'app' ? 'APP' : 'WIDGET';
      const statePath = s.statePath || `os-data/widgets/${s.id}/state.json`;
      const docPath = s.docPath || `os-data/widgets/${s.id}/surface.md`;
      const htmlPath = s.htmlPath || `os-data/widgets/${s.id}/widget.html`;
      return `${kind} "${s.name}" id=${s.id} html=${htmlPath} state=${statePath} doc=${docPath}`;
    });
    return {
      ok: true,
      event: tag,
      payload: { surfaces },
      llmEcho: lines.length ? `surfaces:\n${lines.join('\n')}` : 'surfaces: none',
    };
  } catch (e) {
    return {
      ok: false,
      event: 'tool_error',
      payload: { tag, reason: e.message },
      llmEcho: `${tag} failed: ${e.message}`,
    };
  }
}

export async function executeReadSurfaceData(block, ctx) {
  const tag = 'read_surface_data';
  const id = surfaceId(block);
  const path = String(block.attrs?.path || '').trim();
  if (!id) {
    return { ok: false, event: 'tool_error', payload: { tag, reason: 'id or state_path required' }, llmEcho: `${tag} failed: missing id or state_path` };
  }
  try {
    const value = path
      ? await ctx.readSurfaceDataPath(id, path)
      : await ctx.readSurfaceData(id);
    ctx.markSurfaceDataRead?.(id);
    await ctx.audit({ kind: 'surface.data.read', id, path: path || '/' });
    return {
      ok: true,
      event: tag,
      payload: { id, path: path || '/', value },
      llmEcho: `surface data for ${id}${path ? ` at ${path}` : ''}:\n${compactJson(value)}`,
    };
  } catch (e) {
    return {
      ok: false,
      event: 'tool_error',
      payload: { tag, id, reason: e.message },
      llmEcho: `${tag} failed for ${id}: ${e.message}`,
    };
  }
}

export async function executeMutateSurfaceData(block, ctx) {
  const tag = 'mutate_surface_data';
  const id = surfaceId(block);
  if (!id) {
    return { ok: false, event: 'tool_error', payload: { tag, reason: 'id or state_path required' }, llmEcho: `${tag} failed: missing id or state_path` };
  }
  if (!ctx.hasReadSurfaceData?.(id)) {
    return {
      ok: false,
      event: 'tool_error',
      payload: { tag, id, reason: `must read ${id} with <read_surface_data> before mutating its state` },
      llmEcho: `${tag} failed: read ${id} state first`,
    };
  }
  let operations;
  try {
    operations = parseOperations(block.body);
  } catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag, id, reason: e.message }, llmEcho: `${tag} failed for ${id}: ${e.message}` };
  }
  try {
    const result = await ctx.mutateSurfaceData(id, operations);
    await ctx.audit({
      kind: 'surface.data.mutate',
      id,
      opCount: result.opCount,
      ops: operations.map((op) => ({ op: op.op, path: op.path || '' })).slice(0, 50),
      bytes: result.bytes,
    });
    ctx.logSessionEvent?.('surface.data.mutate', { id, opCount: result.opCount, bytes: result.bytes });
    return {
      ok: true,
      event: tag,
      payload: { id, opCount: result.opCount, bytes: result.bytes, state: result.state },
      llmEcho: `mutated ${id} state with ${result.opCount} op(s); ${result.bytes}B now`,
    };
  } catch (e) {
    return {
      ok: false,
      event: 'tool_error',
      payload: { tag, id, reason: e.message },
      llmEcho: `${tag} failed for ${id}: ${e.message}`,
    };
  }
}
