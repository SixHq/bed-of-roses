// Surface (shortcut/app) host endpoints — the server-side half of the
// postMessage bridge.
//
// Three responsibilities:
//   1. /api/surfaces/:id/state    GET / POST  → read/write per-surface state.json
//   2. /api/surface-llm           POST        → proxy a prompt to the active provider's stream(),
//                                               return the joined text once complete
//   3. Per-surface rate limit on surface-llm so a runaway surface can't drain the user's API key.
//
// In-memory rate limit only (resets on server restart). Predictable and good
// enough for v0.6 — a persistent counter would need a tiny KV layer that
// isn't worth the complexity for a single-user OS.

import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';

import { getProvider } from './providers/index.js';
import { webSearch } from './tools/web-search.js';
import { webFetch } from './tools/web-fetch.js';
import { generateAndSave } from './tools/images.js';
import { isRetryableFailureMessage, makeEmptyResponseError, retryAttemptsEnv, retryDelayMs, sleep } from './retry.js';

const RATE_LIMIT_PER_WINDOW = 30;       // max surface-llm calls
const RATE_LIMIT_WINDOW_MS = 60 * 60_000; // ...per hour
const IMAGE_GEN_PER_WINDOW = 10;        // image gen is expensive — separate bucket
const STATE_MAX_BYTES = 256 * 1024;
const LLM_MAX_PROMPT_CHARS = 12_000;
// Retry budget for user-facing surface bridge calls (web-fetch, web-search,
// image-gen, llm). DELIBERATELY low: a shortcut iframe is waiting on this
// promise; 10 retries with exponential backoff = 30+ seconds of frozen UI.
// 2 attempts is enough to ride out a transient blip without making the user
// stare at a hung card on a real failure.
const SURFACE_API_MAX_ATTEMPTS = retryAttemptsEnv('BOR_SURFACE_API_ATTEMPTS', 2);
const SURFACE_STREAM_IDLE_TIMEOUT_MS = Math.max(1000, Number(process.env.BOR_WIDGET_STREAM_IDLE_TIMEOUT_MS || process.env.BOR_STREAM_IDLE_TIMEOUT_MS) || 30_000);

// Map<bucketKey, { count, windowStart }>  — bucketKey = `${surfaceId}:${kind}`
// Each tool type gets its own bucket so a chatty translator surface can still
// generate one image without burning its LLM budget.
const _rateBuckets = new Map();

function stateRevision(raw = '') {
  return createHash('sha256').update(String(raw)).digest('hex').slice(0, 16);
}

async function atomicWriteFile(path, contents) {
  const tmp = `${path}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await writeFile(tmp, contents, 'utf8');
  await rename(tmp, path);
}

async function readStateRaw(path) {
  if (!existsSync(path)) return '';
  return readFile(path, 'utf8');
}

function checkRateLimit(surfaceId, kind = 'llm', max = RATE_LIMIT_PER_WINDOW) {
  const now = Date.now();
  const key = `${surfaceId}:${kind}`;
  const bucket = _rateBuckets.get(key);
  if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
    _rateBuckets.set(key, { count: 1, windowStart: now });
    return { ok: true, remaining: max - 1 };
  }
  if (bucket.count >= max) {
    return { ok: false, reason: `surface ${kind} rate limit (${max}/hr) reached`, retryAfterMs: RATE_LIMIT_WINDOW_MS - (now - bucket.windowStart) };
  }
  bucket.count += 1;
  return { ok: true, remaining: max - bucket.count };
}

function isValidSurfaceId(id) {
  return typeof id === 'string' && /^(widget|app)-[\w-]+$/.test(id);
}

async function retrySurfaceApi(label, fn) {
  let lastResult = null;
  for (let attempt = 0; attempt < SURFACE_API_MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await fn();
      lastResult = result;
      const reason = result?.reason || result?.error;
      if (!(result?.ok === false && isRetryableFailureMessage(reason)) || attempt >= SURFACE_API_MAX_ATTEMPTS - 1) {
        return result;
      }
      console.warn(`[surface-api] ${label} attempt ${attempt + 1}/${SURFACE_API_MAX_ATTEMPTS} failed: ${reason}; retrying`);
      await sleep(retryDelayMs(attempt));
    } catch (e) {
      if (attempt >= SURFACE_API_MAX_ATTEMPTS - 1 || !isRetryableFailureMessage(e)) throw e;
      console.warn(`[surface-api] ${label} attempt ${attempt + 1}/${SURFACE_API_MAX_ATTEMPTS} crashed: ${e.message}; retrying`);
      await sleep(retryDelayMs(attempt));
    }
  }
  return lastResult;
}

async function collectSurfaceLlmText({ provider, providerCfg, system, content, label = 'surface LLM' }) {
  for (let attempt = 0; attempt < SURFACE_API_MAX_ATTEMPTS; attempt += 1) {
    const ac = new AbortController();
    let idleTimer = null;
    let timedOut = false;
    const armIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        timedOut = true;
        ac.abort(new Error(`${label} idle timeout after ${Math.round(SURFACE_STREAM_IDLE_TIMEOUT_MS / 1000)}s`));
      }, SURFACE_STREAM_IDLE_TIMEOUT_MS);
      if (typeof idleTimer.unref === 'function') idleTimer.unref();
    };

    try {
      let text = '';
      armIdleTimer();
      for await (const chunk of provider.stream({
        apiKey: providerCfg.apiKey,
        model: providerCfg.model || provider.defaultModel,
        baseUrl: providerCfg.baseUrl,
        system,
        messages: [{ role: 'user', content }],
        signal: ac.signal,
      })) {
        armIdleTimer();
        text += chunk;
        // Hard cap so a runaway model can't OOM us. 16 KB is plenty for surface needs.
        if (text.length > 16_384) {
          text = text.slice(0, 16_384);
          break;
        }
      }
      if (!text.trim()) throw makeEmptyResponseError(label);
      return text.trim();
    } catch (e) {
      const err = timedOut
        ? new Error(`${label} stopped responding for ${Math.round(SURFACE_STREAM_IDLE_TIMEOUT_MS / 1000)}s`)
        : e;
      if (attempt >= SURFACE_API_MAX_ATTEMPTS - 1 || !isRetryableFailureMessage(err)) throw err;
      console.warn(`[surface-api] ${label} attempt ${attempt + 1}/${SURFACE_API_MAX_ATTEMPTS} failed: ${err.message}; retrying`);
      await sleep(retryDelayMs(attempt));
    } finally {
      clearTimeout(idleTimer);
    }
  }
  throw makeEmptyResponseError(label);
}

/** GET /api/surfaces/:id/state — return the surface's persisted state object. */
export async function handleGetState({ surfacesDir, surfaceId }) {
  if (!isValidSurfaceId(surfaceId)) {
    return { status: 400, body: { error: 'invalid surface id' } };
  }
  const path = join(surfacesDir, surfaceId, 'state.json');
  if (!existsSync(path)) {
    return { status: 200, body: { state: {}, revision: stateRevision('{}') } };
  }
  try {
    const raw = await readStateRaw(path);
    const state = raw.trim() ? JSON.parse(raw) : {};
    return { status: 200, body: { state, revision: stateRevision(raw.trim() || '{}') } };
  } catch (e) {
    return { status: 500, body: { error: `state read failed: ${e.message}` } };
  }
}

/** POST /api/surfaces/:id/state — replace the surface's state with the body. */
export async function handleSetState({ surfacesDir, surfaceId, body }) {
  if (!isValidSurfaceId(surfaceId)) {
    return { status: 400, body: { error: 'invalid surface id' } };
  }
  if (!body || typeof body !== 'object') {
    return { status: 400, body: { error: 'state body must be a JSON object' } };
  }
  const envelope = body.__borStateEnvelope === true;
  const stateBody = envelope ? body.state : body;
  const baseRevision = envelope ? String(body.baseRevision || '') : '';
  if (!stateBody || typeof stateBody !== 'object' || Array.isArray(stateBody)) {
    return { status: 400, body: { error: 'state body must be a JSON object' } };
  }
  const dir = join(surfacesDir, surfaceId);
  if (!existsSync(dir)) {
    return { status: 404, body: { error: 'surface not found' } };
  }
  const path = join(dir, 'state.json');
  let currentRaw = '';
  try {
    currentRaw = await readStateRaw(path);
  } catch (e) {
    return { status: 500, body: { error: `state read failed: ${e.message}` } };
  }
  const currentRevision = stateRevision(currentRaw.trim() || '{}');
  if (baseRevision && baseRevision !== currentRevision) {
    return {
      status: 409,
      body: {
        error: 'state changed before this save; reload the surface and try again',
        revision: currentRevision,
      },
    };
  }
  const serialized = JSON.stringify(stateBody);
  if (serialized.length > STATE_MAX_BYTES) {
    return { status: 413, body: { error: `state too large (>${STATE_MAX_BYTES}B)` } };
  }
  try {
    await atomicWriteFile(path, serialized);
    return { status: 200, body: { ok: true, bytes: serialized.length, revision: stateRevision(serialized) } };
  } catch (e) {
    return { status: 500, body: { error: `state write failed: ${e.message}` } };
  }
}

/**
 * POST /api/surface-llm
 *   body: { surfaceId, prompt, system?, images?: string[] }
 * Streams the response from the user's active provider and returns the joined
 * text. The surface gets one shot; we don't expose streaming back through the
 * bridge in v0.6. (If a surface needs streaming, it can do its own progressive
 * UI by chunking the prompt itself.)
 *
 * If `images` is supplied, those URLs are sent as multimodal content blocks
 * alongside the prompt — the same provider must support vision.
 */
export async function handleSurfaceLlm({ config, surfaceId, prompt, system, images }) {
  if (!isValidSurfaceId(surfaceId)) {
    return { status: 400, body: { error: 'invalid surface id' } };
  }
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return { status: 400, body: { error: 'prompt required' } };
  }
  if (prompt.length > LLM_MAX_PROMPT_CHARS) {
    return { status: 413, body: { error: `prompt too long (>${LLM_MAX_PROMPT_CHARS} chars)` } };
  }

  const limit = checkRateLimit(surfaceId, 'llm');
  if (!limit.ok) {
    return { status: 429, body: { error: limit.reason, retryAfterMs: limit.retryAfterMs } };
  }

  const providerId = config?.defaultProvider;
  const provider = providerId ? getProvider(providerId) : null;
  const providerCfg = config?.providers?.[providerId];
  if (!provider || !providerCfg || (!providerCfg.apiKey && !provider.id.includes('compatible'))) {
    return { status: 503, body: { error: 'no LLM provider configured' } };
  }

  // Sensible default system message: keep surfaces factual + concise. Surfaces
  // can override per-call by passing their own `system`.
  const sys = (typeof system === 'string' && system.trim())
    ? system.slice(0, 4000)
    : 'You are a quiet, exact assistant embedded inside a small UI surface. Reply with the answer only — no preamble, no explanation, no markdown unless the user asked for it.';

  // Build multimodal content if images are attached. Up to 4 images / call.
  const imageUrls = Array.isArray(images) ? images.filter((u) => typeof u === 'string').slice(0, 4) : [];
  const content = imageUrls.length === 0
    ? prompt
    : [
        { type: 'text', text: prompt },
        ...imageUrls.map((url) => ({ type: 'image_url', url })),
      ];

  try {
    const text = await collectSurfaceLlmText({ provider, providerCfg, system: sys, content, label: `surface ${surfaceId} LLM` });
    return {
      status: 200,
      body: {
        ok: true,
        text,
        provider: provider.id,
        model: providerCfg.model || provider.defaultModel,
        rateLimitRemaining: limit.remaining,
      },
    };
  } catch (e) {
    return { status: 502, body: { error: `LLM request failed: ${e.message}` } };
  }
}

/**
 * POST /api/surface-search
 *   body: { surfaceId, query, limit? }
 */
export async function handleSurfaceWebSearch({ surfaceId, query, limit }) {
  if (!isValidSurfaceId(surfaceId)) return { status: 400, body: { error: 'invalid surface id' } };
  if (typeof query !== 'string' || !query.trim()) return { status: 400, body: { error: 'query required' } };
  const rate = checkRateLimit(surfaceId, 'search', 60); // search is cheap
  if (!rate.ok) return { status: 429, body: { error: rate.reason } };
  try {
    const r = await retrySurfaceApi(`surface ${surfaceId} search`, () => webSearch(query, { limit: Math.min(10, Math.max(1, Number(limit) || 5)) }));
    if (!r.ok) return { status: 502, body: { error: r.reason } };
    return { status: 200, body: { ok: true, query, results: r.results } };
  } catch (e) {
    return { status: 502, body: { error: e.message } };
  }
}

/**
 * POST /api/surface-fetch
 *   body: { surfaceId, url }
 */
export async function handleSurfaceWebFetch({ surfaceId, url }) {
  if (!isValidSurfaceId(surfaceId)) return { status: 400, body: { error: 'invalid surface id' } };
  if (typeof url !== 'string' || !url.trim()) return { status: 400, body: { error: 'url required' } };
  const rate = checkRateLimit(surfaceId, 'fetch', 60);
  if (!rate.ok) return { status: 429, body: { error: rate.reason } };
  try {
    const r = await retrySurfaceApi(`surface ${surfaceId} fetch`, () => webFetch(url));
    if (!r.ok) return { status: 502, body: { error: r.reason } };
    return { status: 200, body: { ok: true, url, title: r.title, text: r.text, truncated: r.truncated, contentType: r.contentType } };
  } catch (e) {
    return { status: 502, body: { error: e.message } };
  }
}

/**
 * POST /api/surface-image-gen
 *   body: { surfaceId, prompt, size? }
 * Generates an image via the user's active provider (must be OpenAI or
 * Gemini), persists it, returns the served URL.
 */
export async function handleSurfaceImageGen({ config, surfaceId, prompt, size }) {
  if (!isValidSurfaceId(surfaceId)) return { status: 400, body: { error: 'invalid surface id' } };
  if (typeof prompt !== 'string' || !prompt.trim()) return { status: 400, body: { error: 'prompt required' } };
  if (prompt.length > 2000) return { status: 413, body: { error: 'prompt too long (>2000 chars)' } };

  const rate = checkRateLimit(surfaceId, 'image-gen', IMAGE_GEN_PER_WINDOW);
  if (!rate.ok) return { status: 429, body: { error: rate.reason } };

  const providerId = config?.defaultProvider;
  const provider = providerId ? getProvider(providerId) : null;
  const providerCfg = config?.providers?.[providerId];
  if (!provider || !providerCfg) return { status: 503, body: { error: 'no provider configured' } };
  if (typeof provider.generateImage !== 'function') {
    return { status: 501, body: { error: `${provider.label} does not support image generation — use OpenAI or Gemini` } };
  }

  try {
    const saved = await retrySurfaceApi(`surface ${surfaceId} image-gen`, () => generateAndSave({ provider, providerCfg, prompt, hint: '', size }));
    return {
      status: 200,
      body: {
        ok: true,
        url: saved.url,
        model: saved.model,
        mediaType: saved.mediaType,
        bytes: saved.bytes,
        rateLimitRemaining: rate.remaining,
      },
    };
  } catch (e) {
    return { status: 502, body: { error: e.message } };
  }
}

/** Test-only: peek/clear the in-memory rate buckets. */
export function _resetRateLimitForTests() { _rateBuckets.clear(); }
