// Streaming XML parser for the Bed of Roses tool protocol.
//
// Modeled on Sixth's parseAssistantMessageV2 (index-based state machine), with
// two extensions Sixth doesn't need:
//   1. Tag attributes — `<say tone="warm" decibels="55">…</say>`. Sixth's tags
//      have no attrs; ours carry short scalars to avoid noisy child tags.
//   2. CDATA payloads — widget HTML / file contents / shell commands all
//      contain `<` and `>`. CDATA lets the model emit them verbatim without
//      brittle escaping or last-occurrence heuristics.
//
// Usage:
//
//   const p = new ProtocolParser({ allowedTags });
//   p.feed(chunk1);
//   p.feed(chunk2);
//   for (const block of p.drain()) { ... }    // ready blocks (text + completed tags)
//   for (const block of p.flush()) { ... }    // call once stream ends
//
// Block shapes:
//   { kind: 'text', text }                        — text outside any tag (rare; often empty)
//   { kind: 'tag', name, attrs, body, children, partial }
//
// `body` is the raw inner text (post-CDATA-unwrap, trimmed). `children` is an
// array of nested block-tag objects, which lets handlers like <create_widget>
// pull their <thumbnail> / <html> children out as typed parameters.

const ATTR_RE = /(\w[\w-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>/]+))/g;

function parseAttrs(rawAttrString) {
  const out = {};
  if (!rawAttrString) return out;
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(rawAttrString)) !== null) {
    const name = m[1].toLowerCase();
    const value = (m[3] ?? m[4] ?? m[5] ?? '').trim();
    out[name] = value;
  }
  return out;
}

// Find the next opening tag at or after `from`. Returns { name, attrs, selfClose, openStart, openEnd }
// or null. Honors the allowed-tag set so prose that mentions <something> in
// passing doesn't accidentally enter tag mode. CDATA and comments are skipped.
function findNextOpen(buf, from, allowed) {
  let i = from;
  while (i < buf.length) {
    const lt = buf.indexOf('<', i);
    if (lt === -1) return null;

    // Skip CDATA — opaque payload, not a tag.
    if (buf.startsWith('<![CDATA[', lt)) {
      const end = buf.indexOf(']]>', lt + 9);
      if (end === -1) return { incompleteAt: lt };
      i = end + 3;
      continue;
    }
    // Skip comments.
    if (buf.startsWith('<!--', lt)) {
      const end = buf.indexOf('-->', lt + 4);
      if (end === -1) return { incompleteAt: lt };
      i = end + 3;
      continue;
    }
    // Skip closing tags + processing instructions — they only matter when we
    // already know which open tag we're inside.
    if (buf[lt + 1] === '/' || buf[lt + 1] === '?' || buf[lt + 1] === '!') {
      i = lt + 1;
      continue;
    }

    const gt = buf.indexOf('>', lt + 1);
    if (gt === -1) return { incompleteAt: lt };

    const inner = buf.slice(lt + 1, gt).trim();
    const selfClose = inner.endsWith('/');
    const head = selfClose ? inner.slice(0, -1).trim() : inner;
    const spaceIdx = head.search(/\s/);
    const name = (spaceIdx === -1 ? head : head.slice(0, spaceIdx)).toLowerCase();

    if (!allowed.has(name)) {
      // Unknown tag — leave it as plain text by advancing past `<`.
      i = lt + 1;
      continue;
    }

    const attrs = parseAttrs(spaceIdx === -1 ? '' : head.slice(spaceIdx + 1));
    return { name, attrs, selfClose, openStart: lt, openEnd: gt + 1 };
  }
  return null;
}

// Tags whose body may itself legitimately contain their OWN close tag — an HTML
// document ends with `</html>`. For these the wrapper close is the LAST
// occurrence within the (already-bounded) parent body, not the first.
const LAST_CLOSE_TAGS = new Set(['html']);

// Find matching `</name>`. Returns position of the `<` that begins `</name>`, or
// -1 if not yet present in the buffer.
//
// We DELIBERATELY do not skip CDATA here. Tool/param close tags (`</write_file>`,
// `</create_app>`, `</content>`, …) never appear inside file content, so the
// first `</name>` is always the real close. Skipping CDATA was the bug: when the
// model emitted a malformed CDATA close (`]]` without `>`, stray text), the old
// code would jump to the NEXT file's `]]>` and swallow every following file into
// this one's body. The single tag whose close DOES collide with content (`html`)
// is handled separately via last-occurrence (see parseTagBody / LAST_CLOSE_TAGS).
function findMatchingClose(buf, from, name) {
  const closeNeedle = `</${name}`;
  let i = from;
  while (i < buf.length) {
    const lt = buf.indexOf('<', i);
    if (lt === -1) return -1;
    if (buf.startsWith(closeNeedle, lt)) {
      const after = lt + closeNeedle.length;
      // Confirm it's actually `</name>` and not `</name2>`.
      if (buf[after] === '>' || /\s/.test(buf[after] || '')) {
        const gt = buf.indexOf('>', after);
        if (gt === -1) return -1;
        return lt;
      }
    }
    i = lt + 1;
  }
  return -1;
}

// Last-occurrence close finder for collision-prone tags (html). Operates on the
// already-bounded parent body, so the wrapper `</html>` is the last one.
function findLastClose(buf, from, name) {
  const needle = `</${name}>`;
  const idx = buf.lastIndexOf(needle);
  if (idx < from) return -1;
  return { closeStart: idx, closeGt: idx + needle.length - 1 };
}

// Unwrap a CDATA-wrapped body. We anchor on the OUTER markers — the first
// `<![CDATA[` and the LAST `]]>` — instead of a non-greedy per-segment regex.
// This mirrors Sixth's "lastIndexOf the close tag" robustness: file content that
// legitimately contains `]]>` (e.g. `arr[i[j]]> 0`) or even `<![CDATA[` survives
// verbatim instead of terminating the body early. Content with no CDATA at all
// is returned as-is, so the model may also emit raw content between the tags.
function unwrapCdata(text) {
  if (!text) return text;
  const first = text.indexOf('<![CDATA[');
  if (first === -1) return text; // no CDATA — raw content, leave untouched
  const bodyStart = first + 9;
  const last = text.lastIndexOf(']]>');
  if (last >= bodyStart) {
    // Outer wrapper: keep anything before the open, the verbatim inner, and
    // anything after the close (the last two are normally empty).
    return text.slice(0, first) + text.slice(bodyStart, last) + text.slice(last + 3);
  }
  // `<![CDATA[` opened but no proper `]]>` close (malformed/streaming). Drop the
  // marker and strip a trailing bare `]]` plus any same-line junk after it.
  return text.slice(0, first) + text.slice(bodyStart).replace(/\]\][^\n]*$/, '');
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripIncompleteClose(text, tagName) {
  if (!text) return text;
  const namedClose = new RegExp(`<\\/${escapeRegExp(tagName)}[^>]*$`, 'i');
  const stripped = text.replace(namedClose, '');
  if (stripped !== text) return stripped;
  const idx = text.lastIndexOf('</');
  if (idx === -1) return text;
  const tail = text.slice(idx + 2).toLowerCase();
  const name = String(tagName).toLowerCase();
  return tail && name.startsWith(tail) ? text.slice(0, idx) : text;
}

// Recursively parse the children of a tag body. We only recurse one level
// deep per call but delegate further nesting via recursion when a child tag's
// body itself contains tags from `allowed`.
function parseTagBody(body, allowed) {
  const children = [];
  let pos = 0;
  while (pos < body.length) {
    const open = findNextOpen(body, pos, allowed);
    if (!open || open.incompleteAt !== undefined) break;

    if (open.selfClose) {
      children.push({
        kind: 'tag',
        name: open.name,
        attrs: open.attrs,
        body: '',
        children: [],
        partial: false,
      });
      pos = open.openEnd;
      continue;
    }

    let closeStart;
    let closeGt;
    if (LAST_CLOSE_TAGS.has(open.name)) {
      // e.g. an HTML doc's own `</html>` precedes the wrapper's — take the last.
      const found = findLastClose(body, open.openEnd, open.name);
      closeStart = found ? found.closeStart : -1;
      closeGt = found ? found.closeGt : -1;
    } else {
      closeStart = findMatchingClose(body, open.openEnd, open.name);
      closeGt = closeStart === -1 ? -1 : body.indexOf('>', closeStart);
    }
    if (closeStart === -1) break; // shouldn't happen for fully-buffered body
    const inner = body.slice(open.openEnd, closeStart);

    children.push({
      kind: 'tag',
      name: open.name,
      attrs: open.attrs,
      body: unwrapCdata(inner).trim(),
      children: parseTagBody(inner, allowed),
      partial: false,
    });
    pos = closeGt + 1;
  }
  return children;
}

export class ProtocolParser {
  constructor({ allowedTags, shouldAutoCloseTag = null }) {
    this.allowed = new Set(allowedTags.map((t) => t.toLowerCase()));
    this.shouldAutoCloseTag = typeof shouldAutoCloseTag === 'function' ? shouldAutoCloseTag : null;
    this.buf = '';
    this.consumed = 0;     // bytes already emitted as text or as a tag
    this.queue = [];       // ready blocks waiting for drain()
    this.partial = null;   // currently-open tag block (preview only)
  }

  feed(chunk) {
    if (typeof chunk !== 'string' || chunk.length === 0) return;
    this.buf += chunk;
    this._advance();
  }

  // Returns and clears all ready blocks (does not include any still-partial tag).
  drain() {
    const out = this.queue;
    this.queue = [];
    return out;
  }

  // Read-only peek at the partial block (e.g. `<create_widget` not yet closed).
  // Useful for streaming UI hints — "building widget…" — without committing.
  peekPartial() {
    return this.partial;
  }

  // Call once the LLM stream has ended. Emits any tail text. Unclosed tags
  // are dropped (they were never executable).
  flush() {
    if (this.consumed < this.buf.length && !this.partial) {
      const tail = this.buf.slice(this.consumed);
      const text = tail.replace(/\s+/g, ' ').trim();
      if (text.length) this.queue.push({ kind: 'text', text });
      this.consumed = this.buf.length;
    }
    this.partial = null;
    return this.drain();
  }

  closeRecoverablePartial() {
    if (!this.partial || !this.shouldAutoCloseTag) return false;
    const body = String(this.partial.body || '');
    if (!this.shouldAutoCloseTag(this.partial, body)) return false;
    this.queue.push({
      kind: 'tag',
      name: this.partial.name,
      attrs: this.partial.attrs || {},
      body: unwrapCdata(body).trim(),
      children: parseTagBody(body, this.allowed),
      partial: false,
    });
    this.consumed = this.buf.length;
    this.partial = null;
    return true;
  }

  _advance() {
    while (this.consumed < this.buf.length) {
      const open = findNextOpen(this.buf, this.consumed, this.allowed);

      // No tag in sight: keep buffering — could be plain text we'll emit on
      // flush, or a tag open boundary that hasn't arrived yet. We don't emit
      // text mid-stream because the model rarely writes plain text outside
      // tags; if it ever does, flush() catches it.
      if (open === null) return;

      // Boundary case: we hit `<` but the rest of the open tag hasn't streamed
      // yet. Stop and wait for more data.
      if (open.incompleteAt !== undefined) return;

      // Emit any pre-tag text first.
      if (open.openStart > this.consumed) {
        const slice = this.buf.slice(this.consumed, open.openStart);
        const text = slice.replace(/\s+/g, ' ').trim();
        if (text.length) this.queue.push({ kind: 'text', text });
      }

      if (open.selfClose) {
        this.queue.push({
          kind: 'tag',
          name: open.name,
          attrs: open.attrs,
          body: '',
          children: [],
          partial: false,
        });
        this.consumed = open.openEnd;
        this.partial = null;
        continue;
      }

      // Look for the matching close tag.
      const closeStart = findMatchingClose(this.buf, open.openEnd, open.name);
      if (closeStart === -1) {
        const nextOpen = findNextOpen(this.buf, open.openEnd, this.allowed);
        const bodyBeforeNext = nextOpen && nextOpen.incompleteAt === undefined
          ? this.buf.slice(open.openEnd, nextOpen.openStart)
          : '';
        const autoCloseBlock = {
          kind: 'tag',
          name: open.name,
          attrs: open.attrs,
          body: unwrapCdata(bodyBeforeNext).trim(),
          children: [],
          partial: true,
        };
        if (
          this.shouldAutoCloseTag
          && nextOpen
          && nextOpen.incompleteAt === undefined
          && this.shouldAutoCloseTag(autoCloseBlock, autoCloseBlock.body)
        ) {
          this.queue.push({
            kind: 'tag',
            name: open.name,
            attrs: open.attrs,
            body: autoCloseBlock.body,
            children: parseTagBody(bodyBeforeNext, this.allowed),
            partial: false,
          });
          this.consumed = nextOpen.openStart;
          this.partial = null;
          continue;
        }

        // Tag is still streaming. Surface a partial block for UI hints, then
        // wait for more data.
        const partialInner = stripIncompleteClose(this.buf.slice(open.openEnd), open.name);
        this.partial = {
          kind: 'tag',
          name: open.name,
          attrs: open.attrs,
          body: unwrapCdata(partialInner),
          children: [],
          partial: true,
        };
        return;
      }

      const inner = this.buf.slice(open.openEnd, closeStart);
      const closeGt = this.buf.indexOf('>', closeStart);
      this.queue.push({
        kind: 'tag',
        name: open.name,
        attrs: open.attrs,
        body: unwrapCdata(inner).trim(),
        children: parseTagBody(inner, this.allowed),
        partial: false,
      });
      this.consumed = closeGt + 1;
      this.partial = null;
    }
  }
}

// Convenience: parse a complete buffer in one shot (non-streaming callers).
export function parseAll(text, { allowedTags }) {
  const p = new ProtocolParser({ allowedTags });
  p.feed(text);
  return p.flush();
}
