// Image storage + generation orchestration.
//
//   • saveGeneratedImage({ mediaType, data, hint? }) → { path, url, bytes }
//     Persists a base64 image to os-data/images/ under a unique filename.
//   • generateAndSave({ provider, providerCfg, prompt, hint? }) → { url, path, ...meta }
//     Calls the provider's generateImage() and persists the result.
//   • describeImage({ provider, providerCfg, imageUrl, focus? }) → text
//     Single-purpose vision call — used by <view_image>.
//
// Images served via /api/images/<file>. The filename uses a short hex slug
// so URLs don't leak guessable patterns but stay copy-pasteable.

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { makeEmptyResponseError } from '../retry.js';

import { DATA_DIR } from '../protocol/paths.js';

export const IMAGES_DIR = join(DATA_DIR, 'images');
const IMAGE_GEN_TIMEOUT_MS = Math.max(1000, Number(process.env.BOR_IMAGE_GEN_TIMEOUT_MS) || 120_000);
const VISION_IDLE_TIMEOUT_MS = Math.max(1000, Number(process.env.BOR_VISION_IDLE_TIMEOUT_MS || process.env.BOR_STREAM_IDLE_TIMEOUT_MS) || 60_000);

const VISION_SYSTEM = 'You are a careful describer of images. Look at the attached image and describe it in 2–4 sentences. Be concrete: name objects, read any visible text, note composition, colors, mood. Do not editorialize beyond the image.';

function slug() {
  return `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
}

function extForMediaType(mt) {
  return ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' })[mt] || 'png';
}

export async function saveGeneratedImage({ mediaType = 'image/png', data, hint = '' }) {
  if (!data) throw new Error('saveGeneratedImage: empty data');
  await mkdir(IMAGES_DIR, { recursive: true });
  const hintSlug = String(hint || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  const ext = extForMediaType(mediaType);
  const name = `${slug()}${hintSlug ? `-${hintSlug}` : ''}.${ext}`;
  const path = join(IMAGES_DIR, name);
  const buf = Buffer.from(data, 'base64');
  await writeFile(path, buf);
  return { path, url: `/api/images/${name}`, bytes: buf.length, mediaType };
}

export async function generateAndSave({ provider, providerCfg, prompt, hint, size }) {
  if (!provider || typeof provider.generateImage !== 'function') {
    throw new Error(`provider ${provider?.id || '?'} does not support image generation`);
  }
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(new Error(`image generation timeout after ${Math.round(IMAGE_GEN_TIMEOUT_MS / 1000)}s`)), IMAGE_GEN_TIMEOUT_MS);
  if (typeof timeout.unref === 'function') timeout.unref();
  let result;
  try {
    result = await provider.generateImage({
      apiKey: providerCfg.apiKey,
      prompt,
      size,
      signal: ac.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  const saved = await saveGeneratedImage({ mediaType: result.mediaType, data: result.data, hint: hint || prompt });
  return { ...saved, model: result.model, prompt };
}

/**
 * Use the provider's stream() with a multimodal user message asking it to
 * describe the supplied image URL. Returns the joined description text.
 */
export async function describeImage({ provider, providerCfg, imageUrl, focus }) {
  if (!provider || typeof provider.stream !== 'function') {
    throw new Error(`provider ${provider?.id || '?'} cannot describe images`);
  }
  const promptText = focus
    ? `Describe this image. The user's specific question: ${focus}`
    : 'Describe this image in 2–4 sentences. Be concrete.';
  let text = '';
  const ac = new AbortController();
  let idleTimer = null;
  const armIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => ac.abort(new Error(`vision stream timeout after ${Math.round(VISION_IDLE_TIMEOUT_MS / 1000)}s`)), VISION_IDLE_TIMEOUT_MS);
    if (typeof idleTimer.unref === 'function') idleTimer.unref();
  };
  try {
    armIdleTimer();
    for await (const chunk of provider.stream({
      apiKey: providerCfg.apiKey,
      model: providerCfg.model || provider.defaultModel,
      baseUrl: providerCfg.baseUrl,
      system: VISION_SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: promptText },
          { type: 'image_url', url: imageUrl },
        ],
      }],
      signal: ac.signal,
    })) {
      armIdleTimer();
      text += chunk;
      if (text.length > 4000) break;
    }
  } finally {
    clearTimeout(idleTimer);
  }
  if (!text.trim()) throw makeEmptyResponseError('vision stream');
  return text.trim();
}
