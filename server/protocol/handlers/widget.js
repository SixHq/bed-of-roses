// App handlers + legacy-widget no-op shim.
//
// Apps (kind='app', full-screen Mac windows via Swift helper) live here for
// now. Shortcuts (bubble iframe cards) are in shortcut.js. Phase 3 will
// rename this file to app.js and delete the executeLegacyWidgetTag shim
// once enough conversation history has aged out that no old <launch_widget/>
// tags appear in pumped-back recordings.

import * as surfaceRegistry from '../../memory/surfaces.js';
import { pickChild, requiredDoc, requireDocReadBeforeUpdate } from './_surface-common.js';

// ---------- APPS ----------

async function executeCreateApp(block, ctx) {
  const tag = 'create_app';
  // No guidelines gate — see shortcut.js for full rationale. The system
  // prompt still asks the model to fetch guidelines first; failing the
  // create when the model emits tags out of order is worse UX than just
  // accepting it.
  const name = (block.attrs.name || '').trim().slice(0, 32) || 'Untitled App';
  const icon = (block.attrs.icon || '').trim() || 'shapes';

  const thumbnailNode = pickChild(block, 'thumbnail');
  const htmlNode = pickChild(block, 'html');
  const docResult = requiredDoc(block, tag);
  if (docResult.error) return docResult.error;
  if (!htmlNode || !htmlNode.body) {
    return { ok: false, event: 'tool_error', payload: { tag, reason: 'missing <html> child' }, llmEcho: `${tag} failed: missing html` };
  }

  let thumbnail = thumbnailNode?.body || null;
  if (thumbnail) {
    if (!/^<svg\b/i.test(thumbnail) &&
        !/^<!doctype\s+html|^<html\b|<body\b/i.test(thumbnail) &&
        !/^https:\/\//i.test(thumbnail)) {
      thumbnail = null;
    }
  }
  if (!thumbnail) {
    thumbnail = ctx.autoBannerThumbnail({ name, icon, size: '1x1' });
  }

  try {
    const manifest = await ctx.saveWidget({
      name, icon, thumbnail,
      html: htmlNode.body,
      doc: docResult.doc,
      sourcePrompt: ctx.lastUserMessage || '',
      kind: 'app',
    });
    await ctx.audit({ kind: 'app.create', id: manifest.id, name: manifest.name });
    await surfaceRegistry.bumpUse(manifest.id, { name: manifest.name, sourcePrompt: ctx.lastUserMessage });
    return {
      ok: true,
      event: 'create_app',
      payload: { manifest },
      llmEcho: `Built app "${manifest.name}" — id: ${manifest.id}`,
    };
  } catch (e) {
    await ctx.audit({ kind: 'app.rejected', reason: e.message });
    return {
      ok: false,
      event: 'tool_error',
      payload: { tag, reason: e.message },
      llmEcho: `${tag} failed: ${e.message}`,
    };
  }
}

async function executeUpdateApp(block, ctx) {
  const tag = 'update_app';
  const id = (block.attrs.id || '').trim();
  if (!id || !id.startsWith('app-')) {
    return { ok: false, event: 'tool_error', payload: { tag, reason: 'expected an app id (app-…)' }, llmEcho: `${tag} failed: expected an app id` };
  }
  const readResult = await requireDocReadBeforeUpdate(ctx, id, tag);
  if (readResult.error) return readResult.error;
  const docResult = requiredDoc(block, tag);
  if (docResult.error) return docResult.error;

  const patch = { size: '1x1' };
  if (block.attrs.icon) patch.icon = String(block.attrs.icon).trim();
  const nameNode = pickChild(block, 'name');
  if (nameNode?.body) patch.name = nameNode.body.slice(0, 30);
  const thumbnailNode = pickChild(block, 'thumbnail');
  if (thumbnailNode) {
    const t = (thumbnailNode.body || '').trim();
    if (t) patch.thumbnail = t;
  }
  const htmlNode = pickChild(block, 'html');
  if (htmlNode?.body) patch.html = htmlNode.body;
  patch.doc = docResult.doc;

  try {
    const manifest = await ctx.editWidget(id, patch);
    await ctx.audit({ kind: 'app.edit', id, fields: Object.keys(patch) });
    await surfaceRegistry.bumpUse(id, { name: manifest.name, sourcePrompt: ctx.lastUserMessage });
    return {
      ok: true,
      event: 'update_app',
      payload: { manifest },
      llmEcho: `Updated ${id} (${Object.keys(patch).join(', ')})`,
    };
  } catch (e) {
    await ctx.audit({ kind: 'app.edit.rejected', id, reason: e.message });
    return {
      ok: false,
      event: 'tool_error',
      payload: { tag, reason: e.message },
      llmEcho: `${tag} failed: ${e.message}`,
    };
  }
}

function normalizeSurfaceName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function executeLaunchApp(block, ctx) {
  const tag = 'launch_app';
  const id = String(block.attrs?.id || '').trim();
  const name = String(block.attrs?.name || block.body || '').trim();
  if (!id && !name) {
    return { ok: false, event: 'tool_error', payload: { tag, reason: 'id or name required' }, llmEcho: `${tag} failed: missing id or name` };
  }

  const surfaces = await ctx.listSurfaces();
  const apps = surfaces.filter((s) => s.kind === 'app');

  let target = null;
  if (id) {
    target = apps.find((s) => s.id === id);
    if (!target) {
      const wrongKind = surfaces.find((s) => s.id === id);
      const reason = wrongKind ? `${id} is not an app` : `app ${id} was not found`;
      return { ok: false, event: 'tool_error', payload: { tag, id, reason }, llmEcho: `${tag} failed: ${reason}` };
    }
  } else {
    const query = normalizeSurfaceName(name);
    const exact = apps.filter((s) => normalizeSurfaceName(s.name) === query);
    const matches = exact.length ? exact : apps.filter((s) => normalizeSurfaceName(s.name).includes(query));
    if (matches.length === 1) target = matches[0];
    else if (matches.length > 1) {
      const choices = matches.slice(0, 8).map((s) => `${s.name} (${s.id})`);
      return { ok: false, event: 'tool_error', payload: { tag, name, reason: 'ambiguous app name', matches: choices }, llmEcho: `${tag} failed: ambiguous app name "${name}". Matches: ${choices.join(', ')}` };
    } else {
      return { ok: false, event: 'tool_error', payload: { tag, name, reason: `app "${name}" was not found` }, llmEcho: `${tag} failed: app "${name}" was not found` };
    }
  }

  await ctx.audit({ kind: 'app.launch', id: target.id, name: target.name });
  await surfaceRegistry.bumpUse(target.id, { name: target.name, sourcePrompt: ctx.lastUserMessage });
  return {
    ok: true,
    event: 'launch_app',
    payload: { id: target.id, name: target.name, kind: 'app', manifest: target },
    llmEcho: `Opened app "${target.name}" (${target.id})`,
  };
}

async function executeDeleteApp(block, ctx) {
  const tag = 'delete_app';
  const id = (block.attrs.id || '').trim();
  if (!id || !id.startsWith('app-')) {
    return { ok: false, event: 'tool_error', payload: { tag, reason: 'expected an app id (app-…)' }, llmEcho: `${tag} failed: expected an app id` };
  }
  try {
    await ctx.deleteWidget(id);
    await ctx.audit({ kind: 'app.delete', id });
    await surfaceRegistry.drop(id);
    return { ok: true, event: 'delete_app', payload: { id }, llmEcho: `Deleted ${id}` };
  } catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag, reason: e.message }, llmEcho: `${tag} failed: ${e.message}` };
  }
}

// ---------- LEGACY WIDGET SHIM ----------
//
// The 5 hidden widget tag entries in registry.js dispatch here. Any tag from
// old conversation history (<create_widget/>, <launch_widget/>, etc.) returns
// a clean tool_error redirecting the LLM to <create_shortcut>. Deleted in
// Phase 3 along with this file's eventual rename to app.js.
async function executeLegacyWidgetTag(block, _ctx) {
  return {
    ok: false,
    event: 'tool_error',
    payload: {
      tag: block.name,
      reason: 'the widget primitive has been replaced by shortcuts (iframe cards inside the thought bubble). Emit <create_shortcut>, <update_shortcut>, <launch_shortcut>, or <delete_shortcut> instead. Apps (<create_app> etc.) are unchanged.',
    },
    llmEcho: `${block.name} is no longer supported — use the corresponding shortcut tag (e.g. <create_shortcut>) instead.`,
  };
}

export {
  executeCreateApp,
  executeUpdateApp,
  executeLaunchApp,
  executeDeleteApp,
  executeLegacyWidgetTag,
};
