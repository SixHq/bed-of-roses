// Shared helpers for multimodal message handling across providers.
//
// Canonical message content shape (what AI core and handlers pass IN):
//
//   content: string | Array<ContentBlock>
//   ContentBlock = { type: 'text', text: string }
//                | { type: 'image_url', url: string, mediaType?: string }
//                | { type: 'document', url: string, mediaType?: string, name?: string }
//
// Each provider translates the canonical form to its native API shape via
// the helpers below. Providers may also need base64-encoded image bytes —
// `fetchImageAsBase64()` handles that, with a small in-memory cache so the
// same URL across messages isn't fetched twice.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DATA_DIR } from '../protocol/paths.js';

const IMAGES_DIR = join(DATA_DIR, 'images');
const _b64Cache = new Map(); // url → { mediaType, data }
const CACHE_MAX = 32;
const IMAGE_FETCH_TIMEOUT_MS = Math.max(1000, Number(process.env.BOR_IMAGE_FETCH_TIMEOUT_MS) || 30_000);

/** Best-guess content type from URL extension if the server doesn't say. */
function guessMediaType(url, headerCT) {
  if (headerCT && /^image\//.test(headerCT)) return headerCT.split(';')[0].trim();
  const m = url.toLowerCase().match(/\.(png|jpe?g|gif|webp)(\?|$)/);
  if (!m) return 'image/png';
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' })[m[1]] || 'image/png';
}

function parseDataUrl(url) {
  const match = String(url || '').match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;
  const mediaType = match[1] || 'image/png';
  const body = match[3] || '';
  const data = match[2]
    ? body.replace(/\s/g, '')
    : Buffer.from(decodeURIComponent(body), 'utf8').toString('base64');
  return { mediaType, data };
}

function localImageName(url) {
  const raw = String(url || '').trim();
  if (raw.startsWith('/api/images/')) return raw.slice('/api/images/'.length).split(/[?#]/)[0];
  try {
    const parsed = new URL(raw);
    const localHost = parsed.hostname === '127.0.0.1'
      || parsed.hostname === 'localhost'
      || parsed.hostname === '::1'
      || parsed.hostname === '[::1]';
    if (localHost && parsed.pathname.startsWith('/api/images/')) {
      return parsed.pathname.slice('/api/images/'.length).split(/[?#]/)[0];
    }
  } catch {
    // Not an absolute URL.
  }
  return '';
}

async function readLocalImageAsBase64(url) {
  const name = localImageName(url);
  if (!name || /[\/\\]|\.\./.test(name)) return null;
  const path = join(IMAGES_DIR, name);
  const buf = await readFile(path);
  return {
    mediaType: guessMediaType(name, ''),
    data: buf.toString('base64'),
  };
}

export async function fetchImageAsBase64(url) {
  if (_b64Cache.has(url)) return _b64Cache.get(url);
  let entry = parseDataUrl(url);
  if (!entry) entry = await readLocalImageAsBase64(url);
  if (entry) {
    if (_b64Cache.size >= CACHE_MAX) _b64Cache.delete(_b64Cache.keys().next().value);
    _b64Cache.set(url, entry);
    return entry;
  }
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(new Error(`image fetch timeout after ${Math.round(IMAGE_FETCH_TIMEOUT_MS / 1000)}s`)), IMAGE_FETCH_TIMEOUT_MS);
  if (typeof timeout.unref === 'function') timeout.unref();
  let res;
  try {
    res = await fetch(url, { signal: ac.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`image fetch ${res.status}: ${url.slice(0, 120)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mediaType = guessMediaType(url, res.headers.get('content-type'));
  entry = { mediaType, data: buf.toString('base64') };
  if (_b64Cache.size >= CACHE_MAX) _b64Cache.delete(_b64Cache.keys().next().value);
  _b64Cache.set(url, entry);
  return entry;
}

async function imageDataUrl(url) {
  const { mediaType, data } = await fetchImageAsBase64(url);
  return `data:${mediaType};base64,${data}`;
}

/**
 * Base64-decode an inline attachment (document or image). Attachments dragged
 * onto the presence arrive as data URLs, so this is a cheap parse; for any
 * non-data URL we fall back to fetching the bytes.
 */
async function inlineBase64(url, fallbackMediaType) {
  const parsed = parseDataUrl(url);
  if (parsed) return parsed;
  const { mediaType, data } = await fetchImageAsBase64(url);
  return { mediaType: mediaType || fallbackMediaType, data };
}

function shouldInlineImage(url) {
  return Boolean(parseDataUrl(url) || localImageName(url));
}

/** Normalize a single message's content to an array of blocks. */
export function normalizeContent(content) {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  if (Array.isArray(content)) {
    return content.map((b) => {
      if (typeof b === 'string') return { type: 'text', text: b };
      if (b?.type === 'text') return { type: 'text', text: String(b.text || '') };
      if (b?.type === 'image_url') return { type: 'image_url', url: String(b.url || ''), mediaType: b.mediaType };
      if (b?.type === 'document') return { type: 'document', url: String(b.url || ''), mediaType: b.mediaType, name: b.name, path: b.path };
      return null;
    }).filter(Boolean);
  }
  return [{ type: 'text', text: String(content ?? '') }];
}

/** Convert canonical content → Anthropic native blocks (supports url images). */
export async function toAnthropicContent(content) {
  const blocks = normalizeContent(content);
  const out = [];
  for (const b of blocks) {
    if (b.type === 'text') {
      out.push({ type: 'text', text: b.text });
    } else if (b.type === 'image_url') {
      if (shouldInlineImage(b.url)) {
        const { mediaType, data } = await fetchImageAsBase64(b.url);
        out.push({ type: 'image', source: { type: 'base64', media_type: b.mediaType || mediaType, data } });
      } else {
        // Anthropic accepts {source: {type:'url', url}} for externally reachable image URLs.
        out.push({ type: 'image', source: { type: 'url', url: b.url } });
      }
    } else if (b.type === 'document') {
      // PDFs go as base64 document blocks (GA — no beta header needed).
      const { mediaType, data } = await inlineBase64(b.url, 'application/pdf');
      out.push({ type: 'document', source: { type: 'base64', media_type: b.mediaType || mediaType || 'application/pdf', data } });
    }
  }
  return out;
}

/**
 * Convert canonical content → OpenAI native blocks. `supportsDocuments` gates
 * the `type:'file'` PDF part: real OpenAI (and the metered bor proxy) accept it,
 * but arbitrary OpenAI-compatible endpoints often don't, so they pass false and
 * get a text placeholder instead of a 400.
 */
export async function toOpenAiContent(content, { supportsDocuments = true } = {}) {
  const blocks = normalizeContent(content);
  if (blocks.length === 1 && blocks[0].type === 'text') return blocks[0].text;
  const out = [];
  for (const b of blocks) {
    if (b.type === 'text') {
      out.push({ type: 'text', text: b.text });
      continue;
    }
    if (b.type === 'image_url') {
      out.push({ type: 'image_url', image_url: { url: shouldInlineImage(b.url) ? await imageDataUrl(b.url) : b.url } });
      continue;
    }
    if (b.type === 'document') {
      if (supportsDocuments) {
        let fileData = b.url;
        if (!parseDataUrl(b.url)) {
          const { mediaType, data } = await inlineBase64(b.url, b.mediaType || 'application/pdf');
          fileData = `data:${b.mediaType || mediaType || 'application/pdf'};base64,${data}`;
        }
        out.push({ type: 'file', file: { filename: b.name || 'document.pdf', file_data: fileData } });
      } else {
        // Never tell the model a flat "cannot read it" — models parrot that
        // back to the user as "I can't see your attachment". Give it a next
        // step instead.
        out.push({
          type: 'text',
          text: `[The user attached "${b.name || 'document.pdf'}" (${b.mediaType || 'application/pdf'}). This provider cannot ingest it inline.${b.path ? ` The file is on disk at: ${b.path} — call <read_file path="${b.path}"/> to get its extracted text.` : ' Call read_file on the file\'s path (see the attached-context manifest) to get its extracted text.'} The attachment IS real — never claim no file was attached.]`,
        });
      }
    }
  }
  return out;
}

/** Convert canonical content → Gemini native `parts` array (inline base64). */
export async function toGeminiParts(content) {
  const blocks = normalizeContent(content);
  const parts = [];
  for (const b of blocks) {
    if (b.type === 'text') {
      parts.push({ text: b.text });
    } else if (b.type === 'image_url') {
      const { mediaType, data } = await fetchImageAsBase64(b.url);
      parts.push({ inlineData: { mimeType: mediaType, data } });
    } else if (b.type === 'document') {
      const { mediaType, data } = await inlineBase64(b.url, 'application/pdf');
      parts.push({ inlineData: { mimeType: b.mediaType || mediaType || 'application/pdf', data } });
    }
  }
  return parts;
}

/** Returns true iff any message in the array has image content. */
export function hasImages(messages) {
  for (const m of messages || []) {
    if (Array.isArray(m.content) && m.content.some((b) => b?.type === 'image_url')) return true;
  }
  return false;
}
