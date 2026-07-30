const { contextBridge, ipcRenderer, webUtils } = require('electron');

const runtimeArg = process.argv.find((arg) => arg.startsWith('--bor-runtime-url='));
const runtimeUrl = runtimeArg ? runtimeArg.slice('--bor-runtime-url='.length) : null;

contextBridge.exposeInMainWorld('borHost', {
  runtimeUrl,
  /** 'darwin' | 'win32' | 'linux' — for platform-flavored UI copy. */
  platform: process.platform,
  getRuntimeUrl: () => ipcRenderer.invoke('bor:get-runtime-url'),
  getConfig: () => ipcRenderer.invoke('bor:get-config'),
  getPresenceBounds: () => ipcRenderer.invoke('bor:get-presence-bounds'),
  setPresenceBounds: (bounds) => ipcRenderer.invoke('bor:set-presence-bounds', bounds),
  listSurfaces: () => ipcRenderer.invoke('bor:list-surfaces'),
  openSurface: (surfaceOrId) => ipcRenderer.invoke('bor:open-surface', surfaceOrId),
  listNotifications: () => ipcRenderer.invoke('bor:list-notifications'),
  notificationAction: (payload) => ipcRenderer.invoke('bor:notification-action', payload),
  playNotificationSound: () => ipcRenderer.invoke('bor:notification-sound'),
  listConversations: () => ipcRenderer.invoke('bor:list-conversations'),
  getConversation: (id) => ipcRenderer.invoke('bor:get-conversation', id),
  saveConversation: (conversation) => ipcRenderer.invoke('bor:save-conversation', conversation),
  conversationAction: (payload) => ipcRenderer.invoke('bor:conversation-action', payload),
  cronAction: (payload) => ipcRenderer.invoke('bor:cron-action', payload),
  pickContextItems: () => ipcRenderer.invoke('bor:pick-context-items'),
  openOnboarding: () => ipcRenderer.invoke('bor:open-onboarding'),
  openProviderSettings: (providerId) => ipcRenderer.invoke('bor:open-provider-settings', providerId),
  openConnectorSettings: () => ipcRenderer.invoke('bor:open-connector-settings'),
  getProviderCatalog: () => ipcRenderer.invoke('bor:provider-catalog'),
  saveProviderConfig: (patch) => ipcRenderer.invoke('bor:save-provider-config', patch),
  openExternal: (url) => ipcRenderer.invoke('bor:open-external', url),
  /** Reveal a file/folder the AI mentioned (clickable path links) in Finder. */
  revealPath: (p) => ipcRenderer.invoke('bor:reveal-path', p),
  openMainApp: () => ipcRenderer.invoke('bor:open-main-app'),
  openMcpMarketplace: () => ipcRenderer.invoke('bor:open-mcp-marketplace'),
  /** Create a brand-new presence via the existing multi-presence flow
   *  (registry entry → runtime → onboarding window). Same IPC the Main app's
   *  "New presence" button uses (host/main.cjs bor:presences-create). */
  createPresence: (nickname) => ipcRenderer.invoke('bor:presences-create', { nickname }),
  onSubmitPrompt: (callback) => {
    const listener = (_event, text) => callback(text);
    ipcRenderer.on('bor:submit-prompt', listener);
    return () => ipcRenderer.removeListener('bor:submit-prompt', listener);
  },
  setMouseIgnore: (ignore) => ipcRenderer.send('bor:set-mouse-ignore', ignore),
  /** Main polls the global cursor and pushes window-relative coords here so the
   *  renderer's hit-test can run during native drags (when no mousemove fires).
   *  Payload is {x,y} while inside the window, or null when the cursor leaves. */
  onCursorPoll: (cb) => ipcRenderer.on('bor:cursor-poll', (_e, pt) => cb(pt)),
  setPresenceMode: (mode) => ipcRenderer.invoke('bor:presence-mode', mode),
  startChat: (requestId, messages) => ipcRenderer.send('bor:chat-start', { requestId, messages }),
  cancelChat: (requestId, info) => ipcRenderer.send('bor:chat-cancel', { requestId, byUser: Boolean(info && info.byUser) }),
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
   * as shell/surface-bridge.js + host/surface-preload.cjs.
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
  /** Recover a single dragged File's absolute path (for dedup/display when the
   *  renderer reads the bytes itself). Returns '' for promise-only drags. */
  getPathForFile: (file) => {
    try { return webUtils.getPathForFile(file) || ''; } catch { return ''; }
  },
});
