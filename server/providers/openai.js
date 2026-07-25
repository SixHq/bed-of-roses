// Provider: OpenAI
// Standard Chat Completions API. The system prompt is the first message
// with role:"system". Note: ChatGPT subscriptions are billed separately
// from API access — the user must add API billing at platform.openai.com.

import { httpStreamError, iterateSseStream, makeTruncatedStreamError, strictFinishEnabled } from './sse-util.js';
import { toOpenAiContent } from './multimodal.js';
import { providerMaxOutputTokens } from './limits.js';
import { openAiReasoningParams } from './reasoning.js';

const URL = 'https://api.openai.com/v1/chat/completions';
const IMAGE_URL = 'https://api.openai.com/v1/images/generations';
const DEFAULT_IMAGE_MODEL = 'gpt-image-1';

export default {
  id: 'openai',
  label: 'OpenAI',
  description: 'OpenAI API with GPT-5.x and ChatGPT-style model aliases. ChatGPT subscriptions do not include API access.',
  defaultModel: 'gpt-5.6-terra',
  // Verified against developers.openai.com July 2026 — the GPT-5.6 family
  // (Sol/Terra/Luna, released 2026-07-09) is the current production lineup.
  models: [
    { id: 'gpt-5.6-sol',   label: 'GPT-5.6 Sol',   note: 'Most capable' },
    { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', note: 'Balanced (recommended)' },
    { id: 'gpt-5.6-luna',  label: 'GPT-5.6 Luna',  note: 'Fast, cost-efficient' },
    { id: 'gpt-5.5',       label: 'GPT-5.5',       note: 'Previous flagship' },
    { id: 'gpt-5.5-pro',   label: 'GPT-5.5 Pro',   note: 'Deepest reasoning, premium' },
    { id: 'chat-latest',   label: 'ChatGPT latest', note: 'Latest Instant model used in ChatGPT' },
    { id: 'gpt-5.4',       label: 'GPT-5.4',       note: 'Legacy' },
    { id: 'gpt-5.4-mini',  label: 'GPT-5.4 mini',  note: 'Legacy, fast' },
  ],
  signupUrl: 'https://platform.openai.com/api-keys',
  needsBaseUrl: false,
  supportsDocuments: true,
  keyHint: 'sk-…',

  async *stream({ apiKey, model, system, messages, signal, reasoning, emitReasoning }) {
    // Multimodal: each user/assistant message may contain a string or an
    // array of canonical content blocks. The helper translates to OpenAI's
    // {type:'text'|'image_url'} array shape.
    const nativeMessages = [{ role: 'system', content: system }];
    for (const m of messages) {
      nativeMessages.push({ role: m.role, content: await toOpenAiContent(m.content) });
    }
    const selectedModel = model || 'gpt-5.6-terra';
    const body = {
      model: selectedModel,
      ...openAiReasoningParams(selectedModel, reasoning),
      max_tokens: providerMaxOutputTokens(),
      stream: true,
      messages: nativeMessages,
    };
    const res = await fetch(URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw await httpStreamError('OpenAI', res);
    let finished = false;
    for await (const ev of iterateSseStream(res.body)) {
      if (!ev.data) continue;
      if (ev.data === '[DONE]') { finished = true; continue; }
      try {
        const j = JSON.parse(ev.data);
        if (j.choices?.[0]?.finish_reason) finished = true;
        const d = j.choices?.[0]?.delta;
        if (d?.content) yield d.content;
        // Reasoning-capable gateways surface chain-of-thought summaries as
        // `reasoning_content` (DeepSeek-style) on the delta.
        else if (emitReasoning && d?.reasoning_content) yield { type: 'reasoning', text: d.reasoning_content };
      } catch { /* ignore malformed */ }
    }
    if (strictFinishEnabled() && !finished) throw makeTruncatedStreamError('OpenAI');
  },

  /**
   * Generate an image via OpenAI's gpt-image-1 model. Returns
   * `{ mediaType: 'image/png', data: <base64> }`. The caller is responsible
   * for persisting the bytes (server/tools/images.js handles that).
   */
  async generateImage({ apiKey, prompt, size = '1024x1024', signal }) {
    const res = await fetch(IMAGE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_IMAGE_MODEL,
        prompt,
        n: 1,
        size,
      }),
      signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI image ${res.status}: ${err.slice(0, 400)}`);
    }
    const j = await res.json();
    const b64 = j.data?.[0]?.b64_json;
    if (!b64) throw new Error('OpenAI image response missing b64_json');
    return { mediaType: 'image/png', data: b64, model: DEFAULT_IMAGE_MODEL };
  },
};
