// Provider: Google Gemini
// Generative Language API. Schema differs from OpenAI/Anthropic:
//   - System prompt goes in `systemInstruction`, not the message array
//   - Assistant role is "model" (not "assistant")
//   - Each message wraps content in `parts: [{ text: ... }]`
//
// Streaming: Gemini's streamGenerateContent emits a JSON ARRAY (not SSE), one
// element per chunk, with the standard candidates/content/parts shape. We use
// alt=sse which gives proper `data: {...}` lines to keep parity with the rest.

import { iterateSseStream } from './sse-util.js';
import { toGeminiParts } from './multimodal.js';
import { providerMaxOutputTokens } from './limits.js';
import { geminiThinkingConfig } from './reasoning.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
// Imagen is the image-gen model line for Google's Gemini key. Verified May
// 2026 against ListModels: `imagen-4.0-generate-001` (predict method) is the
// production endpoint. `imagen-4.0-fast-generate-001` is cheaper; `…-ultra…`
// is higher quality. Callers may override via the `model` argument.
const DEFAULT_IMAGE_MODEL = 'imagen-4.0-generate-001';

export default {
  id: 'gemini',
  label: 'Google Gemini',
  description: 'Gemini 2.5 + 3.5 — multimodal, fast, generous free tier.',
  defaultModel: 'gemini-2.5-flash',
  models: [
    { id: 'gemini-3.5-flash',        label: 'Gemini 3.5 Flash',       note: 'Newest stable' },
    { id: 'gemini-2.5-pro',          label: 'Gemini 2.5 Pro',         note: 'Most capable' },
    { id: 'gemini-2.5-flash',        label: 'Gemini 2.5 Flash',       note: 'Balanced (recommended)' },
    { id: 'gemini-2.5-flash-lite',   label: 'Gemini 2.5 Flash Lite',  note: 'Fastest, cheapest' },
    { id: 'gemini-3.1-pro-preview',  label: 'Gemini 3.1 Pro',         note: 'Newest, preview' },
    { id: 'gemini-3-flash-preview',  label: 'Gemini 3 Flash',         note: 'Preview' },
  ],
  signupUrl: 'https://aistudio.google.com/apikey',
  needsBaseUrl: false,
  keyHint: 'AIza…',

  async *stream({ apiKey, model, system, messages, signal }) {
    const m = model || 'gemini-2.5-flash';
    const url = `${BASE}/models/${encodeURIComponent(m)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
    // Build parts arrays per message. Images come pre-fetched + base64-encoded
    // by the helper because Gemini doesn't accept image URLs inline.
    const contents = [];
    for (const msg of messages) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: await toGeminiParts(msg.content),
      });
    }
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: {
        maxOutputTokens: providerMaxOutputTokens(),
        temperature: 0.7,
        thinkingConfig: geminiThinkingConfig(m),
      },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini ${res.status}: ${err.slice(0, 400)}`);
    }
    for await (const ev of iterateSseStream(res.body)) {
      if (!ev.data) continue;
      try {
        const j = JSON.parse(ev.data);
        const parts = j.candidates?.[0]?.content?.parts || [];
        for (const p of parts) if (p.text) yield p.text;
      } catch { /* ignore malformed */ }
    }
  },

  /**
   * Generate an image via Imagen (the Gemini key works against the Imagen
   * endpoint). Returns `{ mediaType, data }` where data is base64 PNG.
   */
  async generateImage({ apiKey, prompt, model = DEFAULT_IMAGE_MODEL, size = '1024x1024', signal }) {
    const [w, h] = size.split('x').map(Number);
    const aspectRatio = w === h ? '1:1' : w > h ? '16:9' : '9:16';
    const url = `${BASE}/models/${encodeURIComponent(model)}:predict?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio },
      }),
      signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini image ${res.status}: ${err.slice(0, 400)}`);
    }
    const j = await res.json();
    const pred = j.predictions?.[0];
    const b64 = pred?.bytesBase64Encoded;
    const mime = pred?.mimeType || 'image/png';
    if (!b64) throw new Error('Gemini image response missing bytesBase64Encoded');
    return { mediaType: mime, data: b64, model };
  },
};
