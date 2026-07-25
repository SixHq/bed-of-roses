const preview = document.getElementById('preview');
const frame = document.getElementById('thumbnail');
const hitLayer = document.getElementById('hit-layer');

let surface = null;
let dragState = null;

function absolutizeUrl(value) {
  if (!value) return value;
  if (/^https?:|^data:|^blob:/i.test(value)) return value;
  if (value.startsWith('/')) return `${window.widgetPreview.runtimeUrl}${value}`;
  return `${window.widgetPreview.runtimeUrl}/${value}`;
}

function withBase(html) {
  const base = `<base href="${window.widgetPreview.runtimeUrl}/">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${base}`);
  }
  return `<!doctype html><html><head>${base}</head><body>${html}</body></html>`;
}

function thumbnailDocument(thumbnail) {
  const raw = String(thumbnail || '').trim();
  if (!raw) {
    return `<!doctype html><html><body style="margin:0;height:100vh;display:grid;place-items:center;background:#2f2f34;color:white;font:600 16px system-ui;">${escapeHtml(surface?.name || 'Widget')}</body></html>`;
  }
  if (/^https?:\/\//i.test(raw) || raw.startsWith('/api/images/') || raw.startsWith('/images/')) {
    return `<!doctype html><html><body style="margin:0;height:100vh;background:transparent;overflow:hidden;"><img src="${absolutizeUrl(raw)}" style="width:100%;height:100%;object-fit:cover;display:block;"></body></html>`;
  }
  if (/^<svg\b/i.test(raw)) {
    return `<!doctype html><html><body style="margin:0;height:100vh;background:transparent;overflow:hidden;display:grid;place-items:stretch;">${raw}</body></html>`;
  }
  return withBase(raw);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[char]);
}

async function render() {
  surface = await window.widgetPreview.getSurface();
  document.title = surface?.name || 'Widget preview';
  hitLayer.setAttribute('aria-label', `Open ${surface?.name || 'widget'}`);
  frame.srcdoc = thumbnailDocument(surface?.thumbnail);
}

window.addEventListener('message', async (event) => {
  if (event.source !== frame.contentWindow) return;
  const message = event.data;
  if (!message || typeof message !== 'object' || !message.requestId || typeof message.type !== 'string') return;
  const result = await window.widgetPreview.bridge(message).catch((error) => ({ error: error.message }));
  if (!result) return;
  frame.contentWindow.postMessage({ requestId: message.requestId, ...result }, '*');
});

hitLayer.addEventListener('pointerdown', async (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  const bounds = await window.widgetPreview.getBounds().catch(() => null);
  if (!bounds) return;
  dragState = {
    pointerId: event.pointerId,
    startX: event.screenX,
    startY: event.screenY,
    bounds,
    moved: false,
  };
  preview.classList.add('dragging');
  try { hitLayer.setPointerCapture(event.pointerId); } catch { /* ignore */ }
});

hitLayer.addEventListener('pointermove', (event) => {
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  const dx = event.screenX - dragState.startX;
  const dy = event.screenY - dragState.startY;
  if (!dragState.moved && Math.hypot(dx, dy) < 5) return;
  dragState.moved = true;
  window.widgetPreview.setBounds({
    x: dragState.bounds.x + dx,
    y: dragState.bounds.y + dy,
  }).catch(() => {});
});

async function endDrag(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  const completed = dragState;
  dragState = null;
  preview.classList.remove('dragging');
  try { hitLayer.releasePointerCapture(event.pointerId); } catch { /* ignore */ }
  if (completed.moved) {
    const bounds = await window.widgetPreview.getBounds().catch(() => null);
    if (bounds) await window.widgetPreview.persistBounds(bounds).catch(() => {});
    return;
  }
  window.widgetPreview.openSurface().catch(() => {});
}

hitLayer.addEventListener('pointerup', endDrag);
hitLayer.addEventListener('pointercancel', endDrag);

render().catch((error) => {
  frame.srcdoc = `<!doctype html><html><body style="margin:0;height:100vh;display:grid;place-items:center;background:#3a2f34;color:white;font:600 13px system-ui;padding:18px;text-align:center;">${escapeHtml(error.message)}</body></html>`;
});
