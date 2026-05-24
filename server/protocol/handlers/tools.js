// Tool handlers — web_search, web_fetch, view_image, generate_image.
//
// Each returns the standard {ok, event, payload, llmEcho} shape. The llmEcho
// is the structured tool_result text the next turn's history sees, so it
// should be concrete: search results listed, fetched-page summary, image
// description, generated-image URL.

import { webSearch } from '../../tools/web-search.js';
import { webFetch } from '../../tools/web-fetch.js';
import { generateAndSave, describeImage } from '../../tools/images.js';
import { getProvider } from '../../providers/index.js';

const SEARCH_DEFAULT_LIMIT = 5;
const SEARCH_MAX_LIMIT = 10;

export async function executeWebSearch(block, ctx) {
  const query = (block.attrs?.query || '').trim();
  if (!query) {
    return { ok: false, event: 'tool_error', payload: { tag: 'web_search', reason: 'query required' }, llmEcho: 'web_search failed: missing query' };
  }
  let limit = parseInt(block.attrs?.limit || `${SEARCH_DEFAULT_LIMIT}`, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = SEARCH_DEFAULT_LIMIT;
  if (limit > SEARCH_MAX_LIMIT) limit = SEARCH_MAX_LIMIT;

  try {
    const r = await webSearch(query, { limit });
    if (!r.ok) {
      return { ok: false, event: 'tool_error', payload: { tag: 'web_search', reason: r.reason }, llmEcho: `web_search failed: ${r.reason}` };
    }
    await ctx.audit({ kind: 'web.search', query, results: r.results.length });
    const echo = r.results.length
      ? r.results.map((res, i) => `[${i + 1}] ${res.title}\n    ${res.url}\n    ${res.snippet}`).join('\n')
      : `no results for "${query}"`;
    return { ok: true, event: 'web_search', payload: { query, results: r.results }, llmEcho: echo };
  } catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag: 'web_search', reason: e.message }, llmEcho: `web_search crashed: ${e.message}` };
  }
}

export async function executeWebFetch(block, ctx) {
  const url = (block.attrs?.url || '').trim();
  if (!url) {
    return { ok: false, event: 'tool_error', payload: { tag: 'web_fetch', reason: 'url required' }, llmEcho: 'web_fetch failed: missing url' };
  }
  try {
    const r = await webFetch(url);
    if (!r.ok) {
      return { ok: false, event: 'tool_error', payload: { tag: 'web_fetch', reason: r.reason }, llmEcho: `web_fetch failed: ${r.reason}` };
    }
    await ctx.audit({ kind: 'web.fetch', url, bytes: r.text.length });
    const echo = `# ${r.title || url}\n${r.text}${r.truncated ? '\n[…truncated]' : ''}`;
    return {
      ok: true,
      event: 'web_fetch',
      payload: { url, title: r.title, contentType: r.contentType, text: r.text, truncated: r.truncated },
      llmEcho: echo.slice(0, 8000),
    };
  } catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag: 'web_fetch', reason: e.message }, llmEcho: `web_fetch crashed: ${e.message}` };
  }
}

export async function executeViewImage(block, ctx) {
  const url = (block.attrs?.url || '').trim();
  const focus = (block.attrs?.focus || '').trim() || null;
  if (!url) {
    return { ok: false, event: 'tool_error', payload: { tag: 'view_image', reason: 'url required' }, llmEcho: 'view_image failed: missing url' };
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return {
      ok: false,
      event: 'tool_error',
      payload: { tag: 'view_image', reason: 'view_image only accepts external absolute http(s) image URLs. Do not use it for BOR-local /api/images paths; those are previewed automatically in the thought bubble.' },
      llmEcho: 'view_image refused: local/relative BOR media paths are previewed automatically; use view_image only for external http(s) image URLs from web pages.',
    };
  }
  const host = parsedUrl.hostname.toLowerCase();
  if (!['http:', 'https:'].includes(parsedUrl.protocol) || host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return {
      ok: false,
      event: 'tool_error',
      payload: { tag: 'view_image', reason: 'view_image is only for external online http(s) image URLs, not localhost or BOR-local media.' },
      llmEcho: 'view_image refused: use only external online http(s) image URLs, not localhost or BOR-local media.',
    };
  }
  const cfg = await ctx.loadConfig();
  const providerId = cfg?.defaultProvider;
  const provider = providerId ? getProvider(providerId) : null;
  const providerCfg = cfg?.providers?.[providerId];
  if (!provider || !providerCfg) {
    return { ok: false, event: 'tool_error', payload: { tag: 'view_image', reason: 'no provider configured' }, llmEcho: 'view_image failed: no provider' };
  }
  try {
    const description = await describeImage({ provider, providerCfg, imageUrl: url, focus });
    await ctx.audit({ kind: 'vision.describe', url, chars: description.length });
    return {
      ok: true,
      event: 'view_image',
      payload: { url, description },
      llmEcho: `Image at ${url}:\n${description}`,
    };
  } catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag: 'view_image', reason: e.message }, llmEcho: `view_image failed: ${e.message}` };
  }
}

export async function executeGenerateImage(block, ctx) {
  const prompt = (block.attrs?.prompt || block.body || '').trim();
  const size = (block.attrs?.size || '1024x1024').trim();
  const hint = (block.attrs?.hint || '').trim();
  if (!prompt) {
    return { ok: false, event: 'tool_error', payload: { tag: 'generate_image', reason: 'prompt required' }, llmEcho: 'generate_image failed: missing prompt' };
  }
  const cfg = await ctx.loadConfig();
  const providerId = cfg?.defaultProvider;
  const provider = providerId ? getProvider(providerId) : null;
  const providerCfg = cfg?.providers?.[providerId];
  if (!provider || !providerCfg) {
    return { ok: false, event: 'tool_error', payload: { tag: 'generate_image', reason: 'no provider configured' }, llmEcho: 'generate_image failed: no provider' };
  }
  if (typeof provider.generateImage !== 'function') {
    return {
      ok: false,
      event: 'tool_error',
      payload: { tag: 'generate_image', reason: `provider "${provider.label}" does not support image generation — use OpenAI or Gemini` },
      llmEcho: `generate_image not supported on ${provider.label}`,
    };
  }
  try {
    const saved = await generateAndSave({ provider, providerCfg, prompt, hint, size });
    await ctx.audit({ kind: 'image.generate', model: saved.model, bytes: saved.bytes, url: saved.url });
    return {
      ok: true,
      event: 'generate_image',
      payload: { url: saved.url, model: saved.model, prompt, bytes: saved.bytes, mediaType: saved.mediaType },
      llmEcho: `Generated image: ${saved.url} (${saved.model}, ${saved.bytes}B). The image is now hosted at that path and can be used in widgets or referenced in further conversation.`,
    };
  } catch (e) {
    return { ok: false, event: 'tool_error', payload: { tag: 'generate_image', reason: e.message }, llmEcho: `generate_image failed: ${e.message}` };
  }
}
