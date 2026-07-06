// Shortcut handlers — adapter shims around saveWidget / editWidget /
// deleteWidget / surfaceRegistry. Shortcuts are stateful iframe cards that
// live INSIDE the presence thought bubble (not on the desktop). The
// presentation field on each manifest discriminates shortcut (bubble card)
// from app (full-screen Mac window via Swift helper); shortcuts use the
// existing `widget-` ID prefix for continuity with the LLM's conversation
// memory.
//
// All four handlers reuse the saveWidget/editWidget/deleteWidget functions
// in server/index.js — only the kind/presentation/bubbleHeight fields differ
// from the app handler family in widget.js.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import * as surfaceRegistry from '../../memory/surfaces.js';
import { pickChild, requiredDoc, requireDocReadBeforeUpdate, clampBubbleHeight } from './_surface-common.js';

/**
 * <create_shortcut name="…" icon="…" bubbleHeight="240">
 *   <thumbnail><![CDATA[…]]></thumbnail>
 *   <html><![CDATA[…]]></html>
 *   <doc><![CDATA[…]]></doc>
 * </create_shortcut>
 */
export async function executeCreateShortcut(block, ctx) {
  const tag = 'create_shortcut';
  // No guidelines gate. The system prompt still asks the model to call
  // <get_ux_ui_strict_guidelines/> first (and most of the design contract
  // is already injected in the prompt itself), but failing the create when
  // the model forgets or emits tags out of order produces worse UX than
  // accepting it. The model can self-correct on the next turn if the
  // result looks off.
  const name = (block.attrs.name || '').trim().slice(0, 24) || 'Untitled Shortcut';
  const icon = (block.attrs.icon || '').trim() || 'shapes';
  const bubbleHeight = clampBubbleHeight(block.attrs.bubbleHeight, 280);

  const thumbnailNode = pickChild(block, 'thumbnail');
  const htmlNode = pickChild(block, 'html');
  const docResult = requiredDoc(block, tag);
  if (docResult.error) return docResult.error;

  if (!htmlNode || !htmlNode.body) {
    return { ok: false, event: 'tool_error', payload: { tag, reason: 'missing <html> child' }, llmEcho: `${tag} failed: missing html` };
  }

  // Auto-banner fallback if thumbnail is missing or unrecognized — same
  // shape as widget.js used. Shortcuts don't render the thumbnail in the
  // bubble (the live iframe is the surface), but the launcher/inventory UI
  // uses it so the LLM still has to ship one.
  let thumbnail = thumbnailNode?.body || null;
  if (thumbnail) {
    if (!/^<svg\b/i.test(thumbnail) &&
        !/^<!doctype\s+html|^<html\b|<body\b/i.test(thumbnail) &&
        !/^https:\/\//i.test(thumbnail)) {
      thumbnail = null;
    }
  }
  if (!thumbnail) {
    thumbnail = ctx.autoBannerThumbnail({ name, icon, size: '2x1' });
  }

  try {
    const manifest = await ctx.saveWidget({
      name,
      icon,
      thumbnail,
      bubbleHeight,
      html: htmlNode.body,
      doc: docResult.doc,
      sourcePrompt: ctx.lastUserMessage || '',
      kind: 'shortcut',
    });
    await ctx.audit({ kind: 'shortcut.create', id: manifest.id, name: manifest.name, bubbleHeight: manifest.bubbleHeight });
    await surfaceRegistry.bumpUse(manifest.id, { name: manifest.name, sourcePrompt: ctx.lastUserMessage });
    return {
      ok: true,
      event: 'display_shortcut',
      payload: {
        id: manifest.id,
        manifest,
        html: htmlNode.body,
        state: {},
        bubbleHeight: manifest.bubbleHeight,
      },
      llmEcho: `Built shortcut "${manifest.name}" (id: ${manifest.id}, ${manifest.bubbleHeight}px tall). It is now live in the thought bubble.`,
    };
  } catch (e) {
    await ctx.audit({ kind: 'shortcut.rejected', reason: e.message });
    return {
      ok: false,
      event: 'tool_error',
      payload: { tag, reason: e.message },
      llmEcho: `${tag} failed: ${e.message}`,
    };
  }
}

/**
 * <update_shortcut id="widget-…" icon="…" bubbleHeight="280">
 *   <name>…</name>
 *   <thumbnail><![CDATA[…]]></thumbnail>
 *   <html><![CDATA[…]]></html>
 *   <doc><![CDATA[…]]></doc>
 * </update_shortcut>
 */
export async function executeUpdateShortcut(block, ctx) {
  const tag = 'update_shortcut';
  const id = (block.attrs.id || '').trim();
  if (!id) {
    return { ok: false, event: 'tool_error', payload: { tag, reason: 'missing id' }, llmEcho: `${tag} failed: missing id` };
  }
  if (!id.startsWith('widget-')) {
    return { ok: false, event: 'tool_error', payload: { tag, reason: 'expected a shortcut id (widget-…)' }, llmEcho: `${tag} failed: expected a shortcut id` };
  }
  const readResult = await requireDocReadBeforeUpdate(ctx, id, tag);
  if (readResult.error) return readResult.error;
  const docResult = requiredDoc(block, tag);
  if (docResult.error) return docResult.error;

  const patch = {};
  if (block.attrs.icon) patch.icon = String(block.attrs.icon).trim();
  if ('bubbleHeight' in block.attrs) patch.bubbleHeight = clampBubbleHeight(block.attrs.bubbleHeight, undefined);
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

  if (Object.keys(patch).length === 0) {
    return { ok: false, event: 'tool_error', payload: { tag, reason: 'no fields to change' }, llmEcho: `${tag} no-op` };
  }

  try {
    const manifest = await ctx.editWidget(id, patch);
    await ctx.audit({ kind: 'shortcut.edit', id, fields: Object.keys(patch) });
    await surfaceRegistry.bumpUse(id, { name: manifest.name, sourcePrompt: ctx.lastUserMessage });
    // Read fresh html + state so the presence renderer can re-mount the iframe
    // with the updated content (Phase 2: in-place reload without re-creating
    // the iframe node when possible).
    let html = patch.html || '';
    if (!html) {
      try { html = await readFile(join(ctx.dataDir || ctx.projectRoot, 'surfaces', id, 'widget.html'), 'utf8'); }
      catch { html = ''; }
    }
    let state = {};
    try {
      const raw = await readFile(join(ctx.dataDir || ctx.projectRoot, 'surfaces', id, 'state.json'), 'utf8');
      state = raw.trim() ? JSON.parse(raw) : {};
    } catch { /* state may be empty */ }
    return {
      ok: true,
      event: 'display_shortcut',
      payload: { id, manifest, html, state, bubbleHeight: manifest.bubbleHeight, isUpdate: true },
      llmEcho: `Updated shortcut ${id} (${Object.keys(patch).join(', ')}).`,
    };
  } catch (e) {
    await ctx.audit({ kind: 'shortcut.edit.rejected', id, reason: e.message });
    return {
      ok: false,
      event: 'tool_error',
      payload: { tag, reason: e.message },
      llmEcho: `${tag} failed: ${e.message}`,
    };
  }
}

/**
 * <launch_shortcut id="widget-…"/>
 *
 * Re-mounts an existing shortcut into the active thread. The presence
 * renderer uses `display_shortcut` to insert it as a thread item.
 */
export async function executeLaunchShortcut(block, ctx) {
  const tag = 'launch_shortcut';
  const id = (block.attrs.id || '').trim() || (block.body || '').trim();
  if (!id || !id.startsWith('widget-')) {
    return { ok: false, event: 'tool_error', payload: { tag, reason: 'expected a shortcut id (widget-…)' }, llmEcho: `${tag} failed: missing/invalid id` };
  }
  const dir = join(ctx.dataDir || ctx.projectRoot, 'surfaces', id);
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    return { ok: false, event: 'tool_error', payload: { tag, reason: 'shortcut not found' }, llmEcho: `${tag} failed: ${id} not found` };
  }
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const html = await readFile(join(dir, 'widget.html'), 'utf8');
    let state = {};
    try {
      const raw = await readFile(join(dir, 'state.json'), 'utf8');
      state = raw.trim() ? JSON.parse(raw) : {};
    } catch { /* state may be empty */ }
    await surfaceRegistry.bumpUse(id, { name: manifest.name, sourcePrompt: ctx.lastUserMessage });
    await ctx.audit({ kind: 'shortcut.launch', id, name: manifest.name });
    return {
      ok: true,
      event: 'display_shortcut',
      payload: { id, manifest, html, state, bubbleHeight: manifest.bubbleHeight || 280 },
      llmEcho: `Opened shortcut "${manifest.name}" (id: ${id}).`,
    };
  } catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag, reason: e.message }, llmEcho: `${tag} failed: ${e.message}` };
  }
}

/**
 * <delete_shortcut id="widget-…"/>
 */
export async function executeDeleteShortcut(block, ctx) {
  const tag = 'delete_shortcut';
  const id = (block.attrs.id || '').trim();
  if (!id || !id.startsWith('widget-')) {
    return { ok: false, event: 'tool_error', payload: { tag, reason: 'expected a shortcut id (widget-…)' }, llmEcho: `${tag} failed: missing/invalid id` };
  }
  try {
    await ctx.deleteWidget(id);
    await surfaceRegistry.drop(id);
    await ctx.audit({ kind: 'shortcut.delete', id });
    return {
      ok: true,
      event: 'delete_shortcut',
      payload: { id },
      llmEcho: `Deleted shortcut ${id}.`,
    };
  } catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag, reason: e.message }, llmEcho: `${tag} failed: ${e.message}` };
  }
}
