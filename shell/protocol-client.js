// Bed of Roses — protocol client.
//
// Runs the chat turn over an SSE-shaped POST: we open a streaming fetch,
// parse `event:` / `data:` blocks as they arrive, and route each event to
// a registered handler. EventSource only supports GET, hence the manual SSE
// reader.

const ENDPOINT = '/api/chat';

/**
 * Run one chat turn.
 *
 * @param {object} args
 * @param {Array<{role,content}>} args.messages
 * @param {Object<string,(payload)=>void>} args.handlers
 *   Map of event name → callback. Built-ins:
 *     say_delta, say, create_app, update_app, delete_app,
 *     create_widget, update_widget, delete_widget,
 *     set_theme, reset_chat, read_file, write_file, delete_file, list_files,
 *     execute_command, tool_error, tag_start, done.
 *   Extra handlers are invoked verbatim.
 * @returns {Promise<{recorded:string}>}  resolves when the server emits `done`.
 */
export async function runChatTurn({ messages, handlers }) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok || !res.body) {
    const errBody = await res.text().catch(() => '');
    let parsed = null;
    try { parsed = JSON.parse(errBody); } catch { /* plain text */ }
    if (parsed?.connectivity && typeof handlers?.connectivity === 'function') {
      try { handlers.connectivity(parsed.connectivity); } catch (e) { console.error('[protocol-client] connectivity', e); }
    }
    throw new Error(parsed?.error || `HTTP ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  let recorded = '';
  let doneSeen = false;

  const dispatch = (event, payload) => {
    const fn = handlers?.[event];
    if (typeof fn === 'function') {
      try { fn(payload); } catch (e) { console.error('[protocol-client]', event, e); }
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let sep;
      while ((sep = buf.indexOf('\n\n')) !== -1) {
        const raw = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const ev = parseEvent(raw);
        if (!ev) continue;
        if (ev.event === 'done') {
          doneSeen = true;
          recorded = ev.data?.recorded || '';
        }
        dispatch(ev.event, ev.data);
      }
    }
    // Tail (no trailing blank line).
    if (buf.trim()) {
      const ev = parseEvent(buf);
      if (ev) {
        if (ev.event === 'done') {
          doneSeen = true;
          recorded = ev.data?.recorded || '';
        }
        dispatch(ev.event, ev.data);
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }

  if (!doneSeen) {
    // Connection ended without a `done` — surface that so caller can recover.
    throw new Error('connection closed before done');
  }
  return { recorded };
}

function parseEvent(raw) {
  let event = null;
  const dataLines = [];
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    const idx = line.indexOf(':');
    const field = idx === -1 ? line : line.slice(0, idx);
    const value = idx === -1 ? '' : line.slice(idx + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  let data;
  try { data = JSON.parse(dataLines.join('\n')); } catch { data = { raw: dataLines.join('\n') }; }
  return { event, data };
}
