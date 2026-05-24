// Shared SSE stream parser used by every streaming provider (OpenAI,
// Anthropic, OpenAI-compatible, Gemini). Each emits `data: {...}\n\n` lines —
// what differs is the JSON inside, which is the caller's job to interpret.
//
// Usage:
//   for await (const event of iterateSseStream(response.body)) {
//     // event = { event, data } — `event` is the SSE event name (or null), `data` is the raw string
//   }

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
