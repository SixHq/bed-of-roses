// Provider: Bed of Roses credits (bor)
//
// Streams through the Sixth backend's metered proxy at /proxy/bor-stream. The
// user buys BOR credits (20% cheaper, all models); the backend serves the
// request via Azure OpenAI / DeepSeek under the hood and deducts the dollar cost
// SERVER-SIDE as the stream runs (BOR is open source, so the client is never
// trusted to self-report spend). The "apiKey" here is the user's JWT obtained
// from the BOR web login.
//
// Wire shape mirrors the OpenAI Chat Completions API (what the proxy expects):
//   POST {base}/proxy/bor-stream/openai/deployments/{model}/chat/completions
//   Authorization: Bearer <jwt>
//   X-BOR-Presence-Id / -Name: per-presence spend attribution
//
// Model names shown are OpenAI / Anthropic / DeepSeek; the backend maps them to
// real deployments. See 6thsense-backend src/bor_stream/model_map.py.

import { iterateSseStream } from './sse-util.js';
import { toOpenAiContent } from './multimodal.js';
import { providerMaxOutputTokens } from './limits.js';

const local = process.env.BOR_SIXTH_LOCAL === '1';
// BOR-credit streaming targets the deployed Sixth backend.
const DEFAULT_BASE = 'https://backend.withsix.co';

// Models BOR credits expose today (OpenAI / Anthropic / DeepSeek names). The
// backend maps each to the real served deployment.
const MODELS = [
  { id: 'claude-opus-4.8',   label: 'Claude Opus 4.8',   note: 'Most capable' },
  { id: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5', note: 'Balanced (recommended)' },
  { id: 'gpt-5.4',           label: 'GPT-5.4',           note: 'Fast, capable' },
  { id: 'gpt-5.4-mini',      label: 'GPT-5.4 mini',      note: 'Cheapest' },
  { id: 'deepseek-chat',     label: 'DeepSeek V3',       note: 'Open weights' },
  { id: 'deepseek-reasoner', label: 'DeepSeek R1',       note: 'Reasoning' },
];

export default {
  id: 'bor',
  label: 'Bed of Roses credits',
  description: 'Buy BOR credits — 20% cheaper, all models, pay only for what you use. Sign in with your BOR account; no per-provider API keys.',
  defaultModel: 'claude-sonnet-4.5',
  models: MODELS,
  // The web login + buy-credits flow lives here; onboarding opens it in the browser.
  signupUrl: (local ? 'http://localhost:3000' : 'https://app.bedofroses.os') + '/credits',
  needsBaseUrl: false,
  keyHint: 'BOR account token (from sign-in)',
  // Marks this as the credit option onboarding surfaces first.
  isBorCredits: true,

  async *stream({ apiKey, model, baseUrl, system, messages, signal }) {
    if (!apiKey) throw new Error('Sign in to BOR and buy credits to use this provider.');
    const base = (baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
    const selectedModel = model || 'claude-sonnet-4.5';

    const nativeMessages = [{ role: 'system', content: system }];
    for (const m of messages) {
      nativeMessages.push({ role: m.role, content: await toOpenAiContent(m.content) });
    }

    const body = {
      model: selectedModel,
      max_tokens: providerMaxOutputTokens(),
      stream: true,
      stream_options: { include_usage: true },
      messages: nativeMessages,
    };

    // OpenAI-style deployment path; the backend rewrites the deployment per the
    // model map (and routes deepseek-* to its own upstream).
    const url = `${base}/proxy/bor-stream/openai/deployments/${encodeURIComponent(selectedModel)}`
      + `/chat/completions?api-version=2024-12-01-preview`;

    const headers = {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    };
    // Per-presence spend attribution (the v2 host sets BOR_PRESENCE_ID per runtime).
    if (process.env.BOR_PRESENCE_ID) headers['x-bor-presence-id'] = process.env.BOR_PRESENCE_ID;
    if (process.env.BOR_PRESENCE_NAME) headers['x-bor-presence-name'] = process.env.BOR_PRESENCE_NAME;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const err = await res.text();
      // Surface the backend's structured errors (402 spend_cap_reached /
      // insufficient_balance) so the chat loop can show them.
      throw new Error(`BOR credits ${res.status}: ${err.slice(0, 400)}`);
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
};
