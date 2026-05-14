// Provider: OpenAI
// Standard Chat Completions API. The system prompt is the first message
// with role:"system". Note: ChatGPT subscriptions are billed separately
// from API access — the user must add API billing at platform.openai.com.

import { iterateSseStream } from './sse-util.js';
import { toOpenAiContent } from './multimodal.js';

const URL = 'https://api.openai.com/v1/chat/completions';
const IMAGE_URL = 'https://api.openai.com/v1/images/generations';
const DEFAULT_IMAGE_MODEL = 'gpt-image-1';

export default {
  id: 'openai',
  label: 'OpenAI',
  description: 'OpenAI API with GPT-5.x and ChatGPT-style model aliases. ChatGPT subscriptions do not include API access.',
  defaultModel: 'gpt-5.4',
  models: [
    { id: 'gpt-5.5',       label: 'GPT-5.5',       note: 'Most capable' },
    { id: 'gpt-5.4',       label: 'GPT-5.4',       note: 'Balanced (recommended)' },
    { id: 'chat-latest',   label: 'ChatGPT latest', note: 'Latest Instant model used in ChatGPT' },
    { id: 'gpt-5.3-chat-latest', label: 'GPT-5.3 Chat', note: 'ChatGPT snapshot' },
    { id: 'gpt-5.4-mini',  label: 'GPT-5.4 mini',  note: 'Fast' },
    { id: 'gpt-5.4-nano',  label: 'GPT-5.4 nano',  note: 'Cheapest' },
    { id: 'gpt-4o',        label: 'GPT-4o',        note: 'Legacy' },
    { id: 'gpt-4o-mini',   label: 'GPT-4o mini',   note: 'Legacy, cheap' },
  ],
  signupUrl: 'https://platform.openai.com/api-keys',
  needsBaseUrl: false,
  keyHint: 'sk-…',

  async *stream({ apiKey, model, system, messages }) {
    // Multimodal: each user/assistant message may contain a string or an
    // array of canonical content blocks. The helper translates to OpenAI's
    // {type:'text'|'image_url'} array shape.
    const nativeMessages = [{ role: 'system', content: system }];
    for (const m of messages) {
      nativeMessages.push({ role: m.role, content: await toOpenAiContent(m.content) });
    }
    const body = {
      model: model || 'gpt-5.4',
      max_tokens: 12000,
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
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI ${res.status}: ${err.slice(0, 400)}`);
    }
    for await (const ev of iterateSseStream(res.body)) {
      if (!ev.data || ev.data === '[DONE]') continue;
      try {
        const j = JSON.parse(ev.data);
        const delta = j.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch { /* ignore malformed */ }
    }
  },

  /**
   * Generate an image via OpenAI's gpt-image-1 model. Returns
   * `{ mediaType: 'image/png', data: <base64> }`. The caller is responsible
   * for persisting the bytes (server/tools/images.js handles that).
   */
  async generateImage({ apiKey, prompt, size = '1024x1024' }) {
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
