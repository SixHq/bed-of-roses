// Provider: OpenAI-compatible (custom endpoint)
//
// This single provider covers a huge ecosystem: Groq, OpenRouter, Together,
// Mistral, Perplexity, Anyscale, Fireworks, DeepInfra, Cerebras, Ollama (local),
// LMStudio (local), llama.cpp server, vLLM — anything that speaks the OpenAI
// Chat Completions schema. The user supplies the base URL, key, and model.
//
// Some endpoints don't require a key (e.g. local Ollama). We pass an empty
// Authorization if no key is provided.

import { httpStreamError, iterateSseStream, makeTruncatedStreamError, strictFinishEnabled } from './sse-util.js';
import { toOpenAiContent } from './multimodal.js';
import { providerMaxOutputTokens } from './limits.js';
import { openAiCompatibleReasoningParams, openRouterReasoningParams } from './reasoning.js';

const PRESETS = [
  // DeepSeek: legacy `deepseek-chat` / `deepseek-reasoner` names sunset
  // 2026-07-24 — v4 names are the way forward (verified api-docs.deepseek.com).
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', signupUrl: 'https://platform.deepseek.com/api_keys', exampleModel: 'deepseek-v4-pro' },
  { id: 'kimi', name: 'Kimi (Moonshot)', baseUrl: 'https://api.moonshot.ai/v1', signupUrl: 'https://platform.moonshot.ai', exampleModel: 'kimi-k3' },
  { id: 'zai', name: 'Z.ai (GLM)', baseUrl: 'https://api.z.ai/api/paas/v4', signupUrl: 'https://z.ai/manage-apikey/apikey-list', exampleModel: 'glm-5.2' },
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', signupUrl: 'https://console.groq.com/keys', exampleModel: 'llama-3.3-70b-versatile' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', signupUrl: 'https://openrouter.ai/keys', exampleModel: 'anthropic/claude-sonnet-5' },
  { id: 'together', name: 'Together AI', baseUrl: 'https://api.together.xyz/v1', signupUrl: 'https://api.together.ai/settings/api-keys', exampleModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
  { id: 'mistral', name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', signupUrl: 'https://console.mistral.ai/api-keys', exampleModel: 'mistral-large-latest' },
  { id: 'perplexity', name: 'Perplexity', baseUrl: 'https://api.perplexity.ai', signupUrl: 'https://www.perplexity.ai/settings/api', exampleModel: 'llama-3.1-sonar-large-128k-online' },
  { id: 'fireworks', name: 'Fireworks', baseUrl: 'https://api.fireworks.ai/inference/v1', signupUrl: 'https://fireworks.ai/account/api-keys', exampleModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct' },
  { id: 'deepinfra', name: 'DeepInfra', baseUrl: 'https://api.deepinfra.com/v1/openai', signupUrl: 'https://deepinfra.com/dash/api_keys', exampleModel: 'meta-llama/Llama-3.3-70B-Instruct' },
  { id: 'cerebras', name: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1', signupUrl: 'https://cloud.cerebras.ai/platform', exampleModel: 'llama-3.3-70b' },
  { id: 'ollama', name: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', signupUrl: 'https://ollama.com/download', exampleModel: 'llama3.3', noKey: true },
  { id: 'lmstudio', name: 'LM Studio (local)', baseUrl: 'http://localhost:1234/v1', signupUrl: 'https://lmstudio.ai', exampleModel: 'local-model', noKey: true },
];

export default {
  id: 'openai-compatible',
  label: 'OpenAI-compatible',
  description: 'Bring any OpenAI-compatible endpoint — Groq, OpenRouter, Mistral, Perplexity, Ollama, LM Studio, and more.',
  defaultModel: '',
  models: [], // free-form
  signupUrl: 'https://openrouter.ai/keys', // a reasonable default starting point
  needsBaseUrl: true,
  keyHint: 'sk-… or leave empty for local',
  presets: PRESETS,
  // Arbitrary OpenAI-compatible endpoints (Kimi, DeepSeek, Ollama, …) don't
  // accept OpenAI's inline `file` content part — document blocks are replaced
  // with a text pointer, and read_file extracts PDF text server-side instead.
  supportsDocuments: false,

  async *stream({ apiKey, model, baseUrl, system, messages, signal, reasoning, emitReasoning }) {
    if (!baseUrl) throw new Error('Base URL required for OpenAI-compatible providers.');
    if (!model) throw new Error('Model name required for OpenAI-compatible providers.');
    const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';
    const headers = { 'content-type': 'application/json' };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    const nativeMessages = [{ role: 'system', content: system }];
    for (const m of messages) {
      nativeMessages.push({ role: m.role, content: await toOpenAiContent(m.content, { supportsDocuments: false }) });
    }
    const body = {
      model,
      ...(baseUrl.includes('openrouter.ai') ? openRouterReasoningParams(model, reasoning) : openAiCompatibleReasoningParams(model, reasoning)),
      max_tokens: providerMaxOutputTokens(),
      stream: true,
      messages: nativeMessages,
    };
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
    if (!res.ok) throw await httpStreamError('Custom endpoint', res);
    let finished = false;
    for await (const ev of iterateSseStream(res.body)) {
      if (!ev.data) continue;
      if (ev.data === '[DONE]') { finished = true; continue; }
      try {
        const j = JSON.parse(ev.data);
        if (j.choices?.[0]?.finish_reason) finished = true;
        const d = j.choices?.[0]?.delta;
        if (d?.content) yield d.content;
        // OpenRouter streams reasoning as `delta.reasoning`; DeepSeek-style
        // endpoints use `delta.reasoning_content`.
        else if (emitReasoning && (d?.reasoning_content || d?.reasoning)) {
          const text = d.reasoning_content || d.reasoning;
          if (typeof text === 'string' && text) yield { type: 'reasoning', text };
        }
      } catch { /* ignore malformed */ }
    }
    // The Chat Completions streaming contract mandates a final `data: [DONE]`
    // (and a finish_reason chunk before it). An endpoint that never sends
    // either can set BOR_STREAM_STRICT_FINISH=0.
    if (strictFinishEnabled() && !finished) throw makeTruncatedStreamError('Custom endpoint');
  },
};
