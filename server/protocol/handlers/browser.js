// browser_action handler — drives a headless Playwright Chromium the model can
// launch, view, and interact with, then reads back a screenshot + console logs.
// Ported from the Sixth VSCode `browser_action` tool. One action per call; the
// sequence is launch -> [click|type|scroll_down|scroll_up]* -> close.
//
// Result shape:
//   event:   'browser_action'  (presence renders a browser-session card)
//   payload: { action, url, coordinate, text, screenshot, logs, currentUrl,
//              currentMousePosition, viewport }
//   llmEcho: console logs + reminder text (mirrors Sixth)
//   llmMedia: the screenshot as an image_url block fed back to the model

import * as browser from '../../runtime/browser-session.js';

const ACTIONS = new Set(['launch', 'click', 'type', 'scroll_down', 'scroll_up', 'close']);

function toolResult(payload, echo, extra = {}) {
  return { ok: true, event: 'browser_action', payload, llmEcho: echo, ...extra };
}

function toolError(reason) {
  return { ok: false, event: 'tool_error', payload: { tag: 'browser_action', reason }, llmEcho: `browser_action failed: ${reason}` };
}

function childText(block, name) {
  const node = block.children?.find((c) => c.name === name);
  return node ? String(node.body || '').trim() : '';
}

function resultEcho(logs) {
  return `The browser action has been executed. The console logs and screenshot have been captured for your analysis.

Console logs:
${logs || '(No new logs)'}

(REMEMBER: to use any non-browser_action tool, or to launch a new URL, you MUST first close this browser with <browser_action action="close"/>. For example, if after analyzing the screenshot you need to edit a file, close the browser first, then use the file tool.)`;
}

export async function executeBrowserAction(block, ctx) {
  const attrs = block.attrs || {};
  const action = String(attrs.action || childText(block, 'action') || '').trim().toLowerCase();
  if (!action) return toolError('missing required "action" (launch | click | type | scroll_down | scroll_up | close)');
  if (!ACTIONS.has(action)) return toolError(`unknown action "${action}". Use launch | click | type | scroll_down | scroll_up | close`);

  const url = String(attrs.url || childText(block, 'url') || '').trim();
  const coordinate = String(attrs.coordinate || childText(block, 'coordinate') || '').trim();
  // `text` for the type action: prefer the tag body (CDATA-safe), then attr/child.
  const bodyText = (!block.children?.length ? String(block.body || '') : '') || String(attrs.text || childText(block, 'text') || '');

  try {
    let result;
    switch (action) {
      case 'launch': {
        if (!url) return toolError('action="launch" requires a url (e.g. http://localhost:3000)');
        const viewport = {
          width: Number(attrs.width) || undefined,
          height: Number(attrs.height) || undefined,
        };
        result = await browser.launch({ url, viewport });
        break;
      }
      case 'click': {
        if (!browser.isOpen()) return toolError('no browser is open. Launch one first with action="launch".');
        if (!coordinate) return toolError('action="click" requires a coordinate "x,y" (e.g. 512,360)');
        result = await browser.click(coordinate);
        break;
      }
      case 'type': {
        if (!browser.isOpen()) return toolError('no browser is open. Launch one first with action="launch".');
        if (!bodyText) return toolError('action="type" requires text to type (put it in the tag body or a text attribute)');
        result = await browser.type(bodyText);
        break;
      }
      case 'scroll_down': {
        if (!browser.isOpen()) return toolError('no browser is open. Launch one first with action="launch".');
        result = await browser.scrollDown();
        break;
      }
      case 'scroll_up': {
        if (!browser.isOpen()) return toolError('no browser is open. Launch one first with action="launch".');
        result = await browser.scrollUp();
        break;
      }
      case 'close': {
        await browser.close();
        await ctx.audit({ kind: 'browser.action', action: 'close' });
        return toolResult(
          { action: 'close' },
          'The browser has been closed. You may now proceed to using other tools.',
        );
      }
      default:
        return toolError(`unhandled action "${action}"`);
    }

    const viewport = browser.currentViewport();
    await ctx.audit({ kind: 'browser.action', action, url: url || undefined, coordinate: coordinate || undefined, currentUrl: result.currentUrl });

    const payload = {
      action,
      url: url || undefined,
      coordinate: coordinate || undefined,
      text: action === 'type' ? bodyText : undefined,
      screenshot: result.screenshot || '',
      logs: result.logs || '',
      currentUrl: result.currentUrl || url || '',
      currentMousePosition: result.currentMousePosition || '',
      viewport,
    };

    const extra = result.screenshot
      ? { llmMedia: [{ type: 'image_url', url: result.screenshot, mediaType: result.screenshot.startsWith('data:image/png') ? 'image/png' : 'image/jpeg', label: `browser ${action}` }] }
      : {};

    return toolResult(payload, resultEcho(result.logs), extra);
  } catch (error) {
    // On any failure, tear the browser down so the model isn't stuck "inside" a
    // dead session (matches Sixth, which closes on error).
    try { await browser.close(); } catch { /* ignore */ }
    return toolError(error.message || String(error));
  }
}
