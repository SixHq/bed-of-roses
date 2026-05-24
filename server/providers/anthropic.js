// Provider: Anthropic (Claude)
// Uses the Messages API. System prompt is a top-level field, not a message.

import { iterateSseStream } from './sse-util.js';
import { toAnthropicContent } from './multimodal.js';
import { providerMaxOutputTokens } from './limits.js';

const URL = 'https://api.anthropic.com/v1/messages';
const VERSION = '2023-06-01';

export default {
  id: 'anthropic',
  label: 'Anthropic',
  description: 'Claude — strong reasoning, large context, ideal for widget generation.',
  defaultModel: 'claude-opus-4-7',
  models: [
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', note: 'Most capable' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', note: 'Balanced' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', note: 'Fastest, cheapest' },
  ],
  signupUrl: 'https://console.anthropic.com/settings/keys',
  needsBaseUrl: false,
  keyHint: 'sk-ant-…',

  async *stream({ apiKey, model, system, messages, signal }) {
    // Multimodal: content can be a string (text-only) or an array of canonical
    // content blocks. The helper translates to Anthropic's native shape.
    const nativeMessages = [];
    for (const m of messages) {
      nativeMessages.push({ role: m.role, content: await toAnthropicContent(m.content) });
    }
    const res = await fetch(URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': VERSION,
      },
      body: JSON.stringify({
        model: model || 'claude-opus-4-7',
        max_tokens: providerMaxOutputTokens(),
        stream: true,
        system,
        messages: nativeMessages,
      }),
      signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic ${res.status}: ${err.slice(0, 400)}`);
    }
    for await (const ev of iterateSseStream(res.body)) {
      // We only care about content_block_delta events that carry text deltas.
      if (ev.event === 'content_block_delta') {
        try {
          const j = JSON.parse(ev.data);
          const t = j.delta?.text;
          if (t) yield t;
        } catch { /* ignore malformed */ }
      } else if (ev.event === 'error') {
        try {
          const j = JSON.parse(ev.data);
          throw new Error(`Anthropic stream error: ${j.error?.message || ev.data}`);
        } catch (e) { throw e instanceof Error ? e : new Error(String(e)); }
      }
      // message_start / content_block_start / content_block_stop / message_delta / message_stop — ignored
    }
  },
};
