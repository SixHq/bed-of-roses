const { ipcRenderer } = require('electron');

const runtimeArg = process.argv.find((arg) => arg.startsWith('--bor-runtime-url='));
const surfaceArg = process.argv.find((arg) => arg.startsWith('--bor-surface-id='));
const runtimeUrl = runtimeArg ? runtimeArg.slice('--bor-runtime-url='.length) : window.location.origin;
const surfaceId = surfaceArg ? surfaceArg.slice('--bor-surface-id='.length) : null;
let stateRevision = null;

async function jsonFetch(pathname, options = {}) {
  const response = await fetch(`${runtimeUrl}${pathname}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) return { ...data, error: data.error || `HTTP ${response.status}` };
  return data;
}

async function bridgeResponse(message) {
  if (!surfaceId) return { error: 'surface id missing' };
  switch (message.type) {
    case 'state-get': {
      const data = await jsonFetch(`/api/surfaces/${encodeURIComponent(surfaceId)}/state`);
      if (!data.error) stateRevision = data.revision || null;
      return data.error ? data : { state: data.state || {} };
    }
    case 'state-set': {
      const data = await jsonFetch(`/api/surfaces/${encodeURIComponent(surfaceId)}/state`, {
        method: 'POST',
        body: JSON.stringify({
          __borStateEnvelope: true,
          state: message.state || {},
          baseRevision: stateRevision,
        }),
      });
      if (!data.error) stateRevision = data.revision || null;
      if (!data.error) ipcRenderer.send('bor:surface-state-updated', { surfaceId });
      return data.error ? data : { ok: true, bytes: data.bytes };
    }
    case 'llm-request':
      return jsonFetch('/api/surface-llm', {
        method: 'POST',
        body: JSON.stringify({
          surfaceId,
          prompt: message.prompt,
          system: message.system,
          images: message.images,
        }),
      });
    case 'web-search':
      return jsonFetch('/api/surface-search', {
        method: 'POST',
        body: JSON.stringify({ surfaceId, query: message.query, limit: message.limit }),
      });
    case 'web-fetch':
      return jsonFetch('/api/surface-fetch', {
        method: 'POST',
        body: JSON.stringify({ surfaceId, url: message.url }),
      });
    case 'image-generate':
      return jsonFetch('/api/surface-image-gen', {
        method: 'POST',
        body: JSON.stringify({ surfaceId, prompt: message.prompt, size: message.size }),
      });
    case 'cron':
      return jsonFetch('/api/cron', {
        method: 'POST',
        body: JSON.stringify({ ...message, surfaceId }),
      });
    case 'notification-push':
      return jsonFetch('/api/notifications', {
        method: 'POST',
        body: JSON.stringify({ ...message, action: 'add', source: message.source || 'surface', surfaceId }),
      });
    case 'notifications-list':
      return jsonFetch('/api/notifications');
    default:
      return null;
  }
}

window.__BOR_V2_SURFACE__ = { runtimeUrl, surfaceId };

window.addEventListener('message', async (event) => {
  const message = event.data;
  if (!message || typeof message !== 'object' || !message.requestId || typeof message.type !== 'string') return;
  if (!['state-get', 'state-set', 'llm-request', 'web-search', 'web-fetch', 'image-generate', 'cron', 'notification-push', 'notifications-list'].includes(message.type)) return;

  event.stopImmediatePropagation();
  const result = await bridgeResponse(message).catch((error) => ({ error: error.message }));
  if (!result) return;
  window.postMessage({ requestId: message.requestId, ...result }, '*');
}, true);
