// Provider: Anthropic (Claude)
// Uses the Messages API. System prompt is a top-level field, not a message.

import { httpStreamError, iterateSseStream, makeTruncatedStreamError, strictFinishEnabled } from './sse-util.js';
import { toAnthropicContent } from './multimodal.js';
import { providerMaxOutputTokens } from './limits.js';
import { anthropicReasoningParams } from './reasoning.js';

const URL = 'https://api.anthropic.com/v1/messages';
const VERSION = '2023-06-01';

export default {
  id: 'anthropic',
  label: 'Anthropic',
  description: 'Claude — strong reasoning, large context, ideal for widget generation.',
  defaultModel: 'claude-opus-4-8',
  // Verified against platform.claude.com July 2026. Fable 5 note: thinking is
  // always on (adaptive accepted, `disabled` rejected) and it requires 30-day
  // data retention on the org — our anthropicReasoningParams shape is valid.
  models: [
    { id: 'claude-fable-5', label: 'Claude Fable 5', note: 'Most capable, premium' },
    { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', note: 'Best for agents (recommended)' },
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', note: 'Powerful' },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', note: 'Balanced, near-Opus coding' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', note: 'Previous Sonnet' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', note: 'Fastest, cheapest' },
  ],
  signupUrl: 'https://console.anthropic.com/settings/keys',
  needsBaseUrl: false,
  supportsDocuments: true,
  keyHint: 'sk-ant-…',

  async *stream({ apiKey, model, system, messages, signal, reasoning, emitReasoning }) {
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
        model: model || 'claude-opus-4-8',
        max_tokens: providerMaxOutputTokens(),
        ...anthropicReasoningParams(reasoning),
        stream: true,
        system,
        messages: nativeMessages,
      }),
      signal,
    });
    if (!res.ok) throw await httpStreamError('Anthropic', res);
    let finished = false;
    for await (const ev of iterateSseStream(res.body)) {
      if (ev.event === 'message_stop') { finished = true; continue; }
      // We only care about content_block_delta events that carry text deltas.
      if (ev.event === 'content_block_delta') {
        try {
          const j = JSON.parse(ev.data);
          const t = j.delta?.text;
          if (t) yield t;
          // Extended-thinking deltas. Only surfaced when the caller opted in —
          // every other stream() consumer expects bare text strings.
          else if (emitReasoning && j.delta?.type === 'thinking_delta' && j.delta.thinking) {
            yield { type: 'reasoning', text: j.delta.thinking };
          }
        } catch { /* ignore malformed */ }
      } else if (ev.event === 'error') {
        try {
          const j = JSON.parse(ev.data);
          throw new Error(`Anthropic stream error: ${j.error?.message || ev.data}`);
        } catch (e) { throw e instanceof Error ? e : new Error(String(e)); }
      }
      // message_start / content_block_start / content_block_stop / message_delta — ignored
    }
    if (strictFinishEnabled() && !finished) throw makeTruncatedStreamError('Anthropic');
  },
};
