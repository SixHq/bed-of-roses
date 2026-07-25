// Ambient browser handlers — the a11y-snapshot + ref-based browser tool
// family (browser_open, browser_snapshot, browser_click, ...). Each tag maps
// one flat-attr XML block onto an @playwright/mcp tool call driven in-process
// by runtime/browser-agent.js.
//
// Result shape (matches handlers/browser.js):
//   event:   the tag name (presence renders a tool card)
//   payload: { tag, tool, args, text }
//   llmEcho: the inlined markdown text (### Page + snapshot YAML) so the model
//            always sees fresh page state — refs ([ref=eN]) come from here
//   llmMedia: screenshots as image_url blocks, when the MCP result has images
//
// Unlike the legacy coordinate session, this browser is persistent: it stays
// open across tools and turns until <browser_end/>.

import { callBrowserTool, closeBrowserAgent, isBrowserAgentOpen } from '../../runtime/browser-agent.js';

const STALE_REF_HINT =
  'refs go stale after navigation — take a fresh browser_snapshot and use a current ref ([ref=eN]) from the LATEST snapshot';

function toolResult(tag, payload, echo, extra = {}) {
  return { ok: true, event: tag, payload, llmEcho: echo, ...extra };
}

function toolError(tag, reason) {
  return {
    ok: false,
    event: 'tool_error',
    payload: { tag, reason },
    llmEcho: `${tag} failed: ${reason}\n(Hint: ${STALE_REF_HINT}.)`,
  };
}

function childText(block, name) {
  const node = block.children?.find((c) => c.name === name);
  return node ? String(node.body || '').trim() : '';
}

function attr(block, name) {
  return String(block.attrs?.[name] ?? '').trim();
}

function isTrue(value) {
  return /^(1|true|yes)$/i.test(String(value || '').trim());
}

function mediaFromImages(images, label) {
  if (!images?.length) return {};
  return {
    llmMedia: images.map((img) => ({
      type: 'image_url',
      url: `data:${img.mediaType};base64,${img.base64}`,
      mediaType: img.mediaType,
      label,
    })),
  };
}

// Shared drive: call the MCP tool, audit, echo the inlined page + snapshot.
async function drive(tag, tool, args, ctx, auditExtra = {}) {
  const result = await callBrowserTool(tool, args);
  if (!result.ok) return toolError(tag, result.text || 'browser tool returned an error');
  await ctx.audit({ kind: 'browser.agent', tool, tag, ...auditExtra });
  const payload = { tag, tool, args, text: result.text };
  return toolResult(tag, payload, result.text, mediaFromImages(result.images, tag));
}

export async function executeBrowserOpen(block, ctx) {
  const url = attr(block, 'url') || childText(block, 'url') || String(block.body || '').trim();
  if (!url) return toolError('browser_open', 'missing required "url" (full URL including protocol)');
  return drive('browser_open', 'browser_navigate', { url }, ctx, { url });
}

export async function executeBrowserSnapshot(block, ctx) {
  const args = {};
  const target = attr(block, 'target');
  const depth = Number(attr(block, 'depth'));
  if (target) args.target = target;
  if (Number.isFinite(depth) && depth > 0) args.depth = depth;
  return drive('browser_snapshot', 'browser_snapshot', args, ctx);
}

export async function executeBrowserClick(block, ctx) {
  const target = attr(block, 'target');
  const element = attr(block, 'element');
  if (!target) return toolError('browser_click', 'missing required "target" — a ref like e6 from the latest snapshot');
  if (!element) return toolError('browser_click', 'missing required "element" — a short human description of what you are clicking');
  const args = { element, target };
  if (isTrue(attr(block, 'double'))) args.doubleClick = true;
  const button = attr(block, 'button');
  if (button) args.button = button;
  return drive('browser_click', 'browser_click', args, ctx, { target, element });
}

export async function executeBrowserType(block, ctx) {
  const target = attr(block, 'target');
  const element = attr(block, 'element');
  // Text: prefer the tag body (CDATA-safe), then the attr / child.
  const text = (!block.children?.length ? String(block.body || '') : '')
    || String(block.attrs?.text ?? '')
    || childText(block, 'text');
  if (!target) return toolError('browser_type', 'missing required "target" — a ref like e6 from the latest snapshot');
  if (!element) return toolError('browser_type', 'missing required "element" — a short human description of the field');
  if (!text) return toolError('browser_type', 'missing text — put it in the tag body (CDATA-safe) or a text attribute');
  const args = { element, target, text };
  if (isTrue(attr(block, 'submit'))) args.submit = true;
  if (isTrue(attr(block, 'slowly'))) args.slowly = true;
  return drive('browser_type', 'browser_type', args, ctx, { target, element });
}

export async function executeBrowserPressKey(block, ctx) {
  const key = attr(block, 'key') || String(block.body || '').trim();
  if (!key) return toolError('browser_press_key', 'missing required "key" (e.g. Enter, Escape, ArrowDown)');
  return drive('browser_press_key', 'browser_press_key', { key }, ctx, { key });
}

export async function executeBrowserSelect(block, ctx) {
  const target = attr(block, 'target');
  const element = attr(block, 'element');
  const values = attr(block, 'values').split(',').map((v) => v.trim()).filter(Boolean);
  if (!target) return toolError('browser_select', 'missing required "target" — a ref like e6 from the latest snapshot');
  if (!element) return toolError('browser_select', 'missing required "element" — a short human description of the dropdown');
  if (!values.length) return toolError('browser_select', 'missing required "values" — comma-separated option value(s)');
  return drive('browser_select', 'browser_select_option', { element, target, values }, ctx, { target, element });
}

export async function executeBrowserFillForm(block, ctx) {
  const body = String(block.body || '').trim();
  const shapeHint =
    'body must be a JSON array of fields: [{"name":"human field name","type":"textbox|checkbox|radio|combobox|slider","ref":"e6","value":"..."}]';
  if (!body) return toolError('browser_fill_form', `missing body — ${shapeHint}`);
  let fields;
  try {
    fields = JSON.parse(body);
  } catch (e) {
    return toolError('browser_fill_form', `body is not valid JSON (${e.message}) — ${shapeHint}`);
  }
  if (!Array.isArray(fields)) fields = [fields];
  const mapped = [];
  for (const field of fields) {
    if (!field || typeof field !== 'object') return toolError('browser_fill_form', `each field must be an object — ${shapeHint}`);
    const target = String(field.ref || field.target || '').trim();
    if (!target) return toolError('browser_fill_form', `field "${field.name || '?'}" is missing "ref" — ${shapeHint}`);
    mapped.push({
      name: String(field.name || '').trim() || 'field',
      type: String(field.type || 'textbox').trim(),
      target,
      value: field.value == null ? '' : String(field.value),
    });
  }
  return drive('browser_fill_form', 'browser_fill_form', { fields: mapped }, ctx, { fields: mapped.length });
}

export async function executeBrowserBack(block, ctx) {
  return drive('browser_back', 'browser_navigate_back', {}, ctx);
}

export async function executeBrowserTabs(block, ctx) {
  const action = attr(block, 'action').toLowerCase() || 'list';
  if (!['list', 'new', 'select', 'close'].includes(action)) {
    return toolError('browser_tabs', `unknown action "${action}" — use list | new | select | close`);
  }
  const args = { action };
  const index = Number(attr(block, 'index'));
  if (Number.isFinite(index)) args.index = index;
  return drive('browser_tabs', 'browser_tabs', args, ctx, { action });
}

export async function executeBrowserScreenshot(block, ctx) {
  const args = {};
  if (isTrue(attr(block, 'full'))) args.fullPage = true;
  const target = attr(block, 'target');
  if (target) {
    args.target = target;
    args.element = attr(block, 'element') || 'the referenced element';
  }
  return drive('browser_screenshot', 'browser_take_screenshot', args, ctx);
}

export async function executeBrowserWait(block, ctx) {
  const seconds = Number(attr(block, 'seconds'));
  const text = attr(block, 'text');
  const textGone = attr(block, 'text_gone');
  const args = {};
  if (Number.isFinite(seconds) && seconds > 0) args.time = Math.min(seconds, 60);
  if (text) args.text = text;
  if (textGone) args.textGone = textGone;
  if (!Object.keys(args).length) {
    return toolError('browser_wait', 'provide seconds="N", text="..." (wait for it to appear), or text_gone="..." (wait for it to disappear)');
  }
  return drive('browser_wait', 'browser_wait_for', args, ctx, args);
}

export async function executeBrowserEnd(block, ctx) {
  const wasOpen = isBrowserAgentOpen();
  await closeBrowserAgent();
  await ctx.audit({ kind: 'browser.agent', tool: 'browser_close', tag: 'browser_end' });
  return toolResult(
    'browser_end',
    { tag: 'browser_end', wasOpen },
    wasOpen
      ? 'The ambient browser has been closed.'
      : 'No ambient browser was open — nothing to close.',
  );
}
