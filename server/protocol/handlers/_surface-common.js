// Shared helpers for surface handlers (shortcuts + apps).
//
// Both `shortcut.js` and `widget.js` (legacy, being deleted in Phase 3) need
// the same XML-child extraction, doc validation, and update-precondition
// checks. Keeping them here means the create/update flow is consistent across
// surface kinds and the no-op legacy shim doesn't need to re-implement.

import { stripProtocolArtifacts } from './file.js';

export function pickChild(block, name) {
  const node = block.children?.find((c) => c.name === name) || null;
  // The model can hallucinate BOR's internal <tool_results>/<tool_result>
  // turn-wrapper tags (or a stray closing tool tag) INTO the html/doc payload it
  // streams — strip them so they never land in a surface's source. Idempotent.
  if (node && (name === 'html' || name === 'doc') && typeof node.body === 'string') {
    node.body = stripProtocolArtifacts(node.body);
  }
  return node;
}

/**
 * Require a non-empty <doc> child on a create/update tag.
 * Returns `{ error: {...tool_error...} }` on failure or `{ doc }` on success.
 */
export function requiredDoc(block, tag) {
  const docNode = pickChild(block, 'doc');
  const doc = String(docNode?.body || '').trim();
  if (!doc) {
    return {
      error: {
        ok: false,
        event: 'tool_error',
        payload: { tag, reason: 'missing <doc> child with the complete surface documentation' },
        llmEcho: `${tag} failed: missing doc`,
      },
    };
  }
  return { doc };
}

/**
 * Block update_* tags from running until the LLM has read the surface doc
 * earlier in the same turn. The doc is the source-of-truth for what the
 * surface does; updating without reading it risks destructive rewrites that
 * drop existing features the user cares about.
 */
export async function requireDocReadBeforeUpdate(ctx, id, tag) {
  const docPath = await ctx.ensureSurfaceDoc?.(id) || ctx.surfaceDocPath?.(id) || `os-data/surfaces/${id}/surface.md`;
  if (!ctx.hasReadFile?.(docPath)) {
    return {
      error: {
        ok: false,
        event: 'tool_error',
        payload: {
          tag,
          reason: `must read ${docPath} with <read_file> before updating this surface, then include a complete updated <doc> child`,
          docPath,
        },
        llmEcho: `${tag} failed: read ${docPath} first`,
      },
    };
  }
  return { docPath };
}

/**
 * Clamp bubbleHeight to the allowed range (160-600 px). Default 280 if missing
 * or unparseable. Shortcuts that need to be taller than 600 should be
 * <create_app> instead — that's what apps are for.
 */
export function clampBubbleHeight(raw, fallback = 280) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(160, Math.min(600, Math.round(value)));
}
