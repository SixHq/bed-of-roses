// Bridge polyfill injected at document-start into every BOR widget /app
// webview. It rewrites `window.parent.postMessage(...)` so widget HTML
// can keep using the same bridge pattern it uses in the Electron iframe
// surface-preload path — no widget needs to know whether it's running
// in Electron or Swift.
//
// Phase 1: the polyfill is injected and rewrites the API, but
// `webkit.messageHandlers.borBridge` is not yet registered, so calls
// silently no-op. Phase 3 registers the handler and wires through the
// Node runtime.

(function () {
  if (window.__borBridgeInstalled) return;
  window.__borBridgeInstalled = true;

  const handler = window.webkit && window.webkit.messageHandlers
    ? window.webkit.messageHandlers.borBridge
    : null;
  const ALLOWED_TYPES = [
    'state-get',
    'state-set',
    'llm-request',
    'web-search',
    'web-fetch',
    'image-generate',
  ];

  // The widget reads replies on its existing `window.addEventListener('message', …)`
  // by checking the `requestId` field. We keep that contract: native code
  // calls `window.__borBridgeReply(reply)` once it has the answer, and we
  // forward it as a regular window-message event.
  const origPostMessage = window.postMessage.bind(window);
  window.__borBridgeReply = function (reply) {
    try {
      origPostMessage(reply, '*');
    } catch (err) {
      console.error('[bor-bridge] reply post failed:', err);
    }
  };

  // Replace window.parent with a controlled proxy. Widget HTML calls
  // `parent.postMessage({type, requestId, ...payload}, '*')`; we intercept,
  // validate, and forward to native.
  try {
    Object.defineProperty(window, 'parent', {
      configurable: false,
      enumerable: true,
      value: {
        postMessage(message) {
          if (!message || typeof message !== 'object') return;
          if (!message.requestId) return;
          if (!ALLOWED_TYPES.includes(message.type)) return;
          if (handler && typeof handler.postMessage === 'function') {
            handler.postMessage(message);
          } else {
            // No native handler — Phase 1 path. Reply with an error so the
            // widget surfaces something useful instead of waiting forever.
            queueMicrotask(() => {
              origPostMessage({
                requestId: message.requestId,
                ok: false,
                error: 'BOR bridge handler not installed in this build',
              }, '*');
            });
          }
        },
      },
    });
  } catch (err) {
    console.error('[bor-bridge] failed to install parent shim:', err);
  }
})();
