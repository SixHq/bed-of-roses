const { contextBridge, ipcRenderer, webUtils } = require('electron');

const runtimeArg = process.argv.find((arg) => arg.startsWith('--bor-runtime-url='));
const runtimeUrl = runtimeArg ? runtimeArg.slice('--bor-runtime-url='.length) : null;

contextBridge.exposeInMainWorld('borHost', {
  runtimeUrl,
  getRuntimeUrl: () => ipcRenderer.invoke('bor:get-runtime-url'),
  getConfig: () => ipcRenderer.invoke('bor:get-config'),
  getPresenceBounds: () => ipcRenderer.invoke('bor:get-presence-bounds'),
  setPresenceBounds: (bounds) => ipcRenderer.invoke('bor:set-presence-bounds', bounds),
  listSurfaces: () => ipcRenderer.invoke('bor:list-surfaces'),
  openSurface: (surfaceOrId) => ipcRenderer.invoke('bor:open-surface', surfaceOrId),
  pickContextItems: () => ipcRenderer.invoke('bor:pick-context-items'),
  openOnboarding: () => ipcRenderer.invoke('bor:open-onboarding'),
  setPresenceMode: (mode) => ipcRenderer.invoke('bor:presence-mode', mode),
  startChat: (requestId, messages) => ipcRenderer.send('bor:chat-start', { requestId, messages }),
  cancelChat: (requestId) => ipcRenderer.send('bor:chat-cancel', { requestId }),
  onChatEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('bor:chat-event', listener);
    return () => ipcRenderer.removeListener('bor:chat-event', listener);
  },
  onTogglePresence: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('bor:toggle-presence', listener);
    return () => ipcRenderer.removeListener('bor:toggle-presence', listener);
  },
  onPresenceLayout: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('bor:presence-layout', listener);
    return () => ipcRenderer.removeListener('bor:presence-layout', listener);
  },
  /**
   * Shortcut iframe bridge. The renderer catches postMessage from sandboxed
   * shortcut iframes and forwards each call here. Main proxies to the
   * appropriate /api/surface-* endpoint and returns the result. Same protocol
   * as shell/surface-bridge.js + v2/host/surface-preload.cjs.
   * `op` is one of: 'state-get', 'state-set', 'llm-request', 'web-search',
   * 'web-fetch', 'image-generate'.
   */
  surfaceBridge: (request) => ipcRenderer.invoke('bor:surface-bridge', request),
  /** Open a BOR app full-screen from inside a shortcut iframe. */
  launchAppFromShortcut: (appId) => ipcRenderer.invoke('bor:launch-app-from-shortcut', appId),
  /** Resolve an array of dragged File objects to native absolute paths via
   *  Electron's webUtils, then have main describe each (file/folder/image).
   *  Returns the same { items } shape as pickContextItems. */
  describeDroppedFiles: async (files) => {
    if (!files || !files.length) return { items: [] };
    const paths = [];
    for (const file of files) {
      try {
        const p = webUtils.getPathForFile(file);
        if (p) paths.push(p);
      } catch { /* ignore — non-file drag (text, url) */ }
    }
    if (!paths.length) return { items: [] };
    return ipcRenderer.invoke('bor:describe-context-paths', paths);
  },
});
