// Shared SSE stream parser used by every streaming provider (OpenAI,
// Anthropic, OpenAI-compatible, Gemini). Each emits `data: {...}\n\n` lines —
// what differs is the JSON inside, which is the caller's job to interpret.
//
// Usage:
//   for await (const event of iterateSseStream(response.body)) {
//     // event = { event, data } — `event` is the SSE event name (or null), `data` is the raw string
//   }

import { parseRetryAfterMs } from '../retry.js';

// Build the error for a non-2xx streaming response. Keeps the established
// "<Label> <status>: <body>" message shape but attaches machine-readable
// `status` and `retryAfterMs` so the chat loop's classifyStreamFailure can
// honor Retry-After instead of regexing the message.
export async function httpStreamError(label, res) {
  let bodyText = '';
  try { bodyText = await res.text(); } catch { /* body unreadable — status is enough */ }
  const err = new Error(`${label} ${res.status}: ${bodyText.slice(0, 400)}`);
  err.status = res.status;
  const retryAfterMs = parseRetryAfterMs(res.headers?.get?.('retry-after'));
  if (retryAfterMs !== null) err.retryAfterMs = retryAfterMs;
  return err;
}

// Truncated-SSE guard. Every provider tracks whether its native finish marker
// arrived ([DONE], message_stop, finish_reason/finishReason); a stream that
// ends without one was cut mid-response (proxy reset, upstream crash) and is
// retryable. Set BOR_STREAM_STRICT_FINISH=0 to disable for endpoints that
// never send a finish marker.
export function strictFinishEnabled() {
  return process.env.BOR_STREAM_STRICT_FINISH !== '0';
}

export function makeTruncatedStreamError(label) {
  const err = new Error(`${label} stream ended without a completion marker (connection dropped mid-response)`);
  err.code = 'BOR_TRUNCATED_STREAM';
  return err;
}

export async function* iterateSseStream(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      // Normalize CRLF → LF so the `\n\n` separator works regardless of
      // server line ending. Gemini emits CRLF; OpenAI/Anthropic emit LF.
      buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

      // SSE messages are separated by a blank line.
      let sep;
      while ((sep = buf.indexOf('\n\n')) !== -1) {
        const raw = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const ev = parseEvent(raw);
        if (ev) yield ev;
      }
    }

    // Tail (no trailing blank line)
    if (buf.trim()) {
      const ev = parseEvent(buf);
      if (ev) yield ev;
    }
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }
}

function parseEvent(raw) {
  let event = null;
  const dataLines = [];
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith(':')) continue; // comment
    const idx = line.indexOf(':');
    const field = idx === -1 ? line : line.slice(0, idx);
    const value = idx === -1 ? '' : line.slice(idx + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}
