// Bed of Roses — surface host bridge (shortcuts + apps).
//
// The shell exposes six primitives to surfaces running inside sandboxed
// iframes, all over postMessage:
//
//   • state-get          — read /api/surfaces/<id>/state.json
//   • state-set          — write /api/surfaces/<id>/state.json
//   • llm-request        — call /api/surface-llm (text+optional images)
//   • web-search         — call /api/surface-search
//   • web-fetch          — call /api/surface-fetch
//   • image-generate     — call /api/surface-image-gen (OpenAI/Gemini only)
//
// Why a bridge? Sandboxed iframes can fetch external HTTPS but the validator
// blocks localStorage / sessionStorage / indexedDB. The host (this file) is
// the only path surfaces have to read/write durable state or call the user's
// configured LLM and its tools.
//
// One global listener handles every iframe. We identify the requesting
// surface by matching `event.source` (the iframe's contentWindow) against the
// iframe elements currently mounted in the DOM. Each iframe must carry a
// `data-wid` attribute set when the modal opens — see
// `installBridge(iframe, surfaceId)`. (Legacy attribute name preserved so
// existing surface HTML keeps working.)

let _installed = false;
const _iframes = new WeakMap(); // iframe element → surfaceId
const _stateRevisions = new Map(); // surfaceId → last state revision observed by bridge

/**
 * Register an iframe with the bridge. Call this immediately after setting
 * `iframe.src = '/widgets/<id>/widget.html'`. The bridge will accept
 * postMessages from this iframe's contentWindow until it's removed from DOM.
 */
export function installBridge(iframe, surfaceId) {
  if (!iframe || !surfaceId) return;
  iframe.dataset.wid = surfaceId;
  _iframes.set(iframe, surfaceId);
  ensureListener();
}

/** Find the surfaceId for an event.source by walking the live iframe set. */
function surfaceIdForSource(source) {
  for (const iframe of document.querySelectorAll('iframe[data-wid]')) {
    if (iframe.contentWindow === source) return iframe.dataset.wid;
  }
  return null;
}

/** Post a response back to the originating iframe. */
function reply(source, msg) {
  try { source.postMessage(msg, '*'); } catch (e) { console.warn('[bridge] reply failed', e); }
}

async function handleStateGet({ surfaceId }) {
  try {
    const res = await fetch(`/api/surfaces/${encodeURIComponent(surfaceId)}/state`);
    const json = await res.json();
    if (!res.ok) return { error: json.error || `HTTP ${res.status}` };
    _stateRevisions.set(surfaceId, json.revision || null);
    return { state: json.state || {} };
  } catch (e) { return { error: e.message }; }
}

async function handleStateSet({ surfaceId, state }) {
  try {
    const res = await fetch(`/api/surfaces/${encodeURIComponent(surfaceId)}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        __borStateEnvelope: true,
        state: state || {},
        baseRevision: _stateRevisions.get(surfaceId) || null,
      }),
    });
    const json = await res.json();
    if (!res.ok) return { error: json.error || `HTTP ${res.status}` };
    _stateRevisions.set(surfaceId, json.revision || null);
    return { ok: true, bytes: json.bytes };
  } catch (e) { return { error: e.message }; }
}

async function handleLlmRequest({ surfaceId, prompt, system, images }) {
  try {
    const res = await fetch('/api/surface-llm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ surfaceId, prompt, system, images }),
    });
    const json = await res.json();
    if (!res.ok) return { error: json.error || `HTTP ${res.status}` };
    return { text: json.text, model: json.model, rateLimitRemaining: json.rateLimitRemaining };
  } catch (e) { return { error: e.message }; }
}

async function handleWebSearch({ surfaceId, query, limit }) {
  try {
    const res = await fetch('/api/surface-search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ surfaceId, query, limit }),
    });
    const json = await res.json();
    if (!res.ok) return { error: json.error || `HTTP ${res.status}` };
    return { results: json.results, query: json.query };
  } catch (e) { return { error: e.message }; }
}

async function handleWebFetchReq({ surfaceId, url }) {
  try {
    const res = await fetch('/api/surface-fetch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ surfaceId, url }),
    });
    const json = await res.json();
    if (!res.ok) return { error: json.error || `HTTP ${res.status}` };
    return { url: json.url, title: json.title, text: json.text, truncated: json.truncated, contentType: json.contentType };
  } catch (e) { return { error: e.message }; }
}

async function handleImageGenerate({ surfaceId, prompt, size }) {
  try {
    const res = await fetch('/api/surface-image-gen', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ surfaceId, prompt, size }),
    });
    const json = await res.json();
    if (!res.ok) return { error: json.error || `HTTP ${res.status}` };
    return { url: json.url, model: json.model, mediaType: json.mediaType, bytes: json.bytes };
  } catch (e) { return { error: e.message }; }
}

function ensureListener() {
  if (_installed) return;
  _installed = true;
  window.addEventListener('message', async (ev) => {
    const data = ev.data;
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;
    if (!data.requestId) return;

    const surfaceId = surfaceIdForSource(ev.source);
    if (!surfaceId) return; // unrecognised iframe — silently ignore

    let response;
    switch (data.type) {
      case 'state-get':
        response = { type: 'state-response', requestId: data.requestId, ...(await handleStateGet({ surfaceId })) };
        break;
      case 'state-set':
        response = { type: 'state-response', requestId: data.requestId, ...(await handleStateSet({ surfaceId, state: data.state })) };
        break;
      case 'llm-request':
        response = { type: 'llm-response', requestId: data.requestId, ...(await handleLlmRequest({ surfaceId, prompt: data.prompt, system: data.system, images: data.images })) };
        break;
      case 'web-search':
        response = { type: 'web-search-response', requestId: data.requestId, ...(await handleWebSearch({ surfaceId, query: data.query, limit: data.limit })) };
        break;
      case 'web-fetch':
        response = { type: 'web-fetch-response', requestId: data.requestId, ...(await handleWebFetchReq({ surfaceId, url: data.url })) };
        break;
      case 'image-generate':
        response = { type: 'image-generate-response', requestId: data.requestId, ...(await handleImageGenerate({ surfaceId, prompt: data.prompt, size: data.size })) };
        break;
      default:
        return; // unknown message type — ignore
    }
    reply(ev.source, response);
  });
}
