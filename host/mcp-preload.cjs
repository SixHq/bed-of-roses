// Preload for the MCP Marketplace window. Everything goes through the main
// process (which fetches the per-presence runtime) so there is no file://→http
// CORS issue and the catalog stays server-side cached.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('borMcp', {
  getCatalog: (opts) => ipcRenderer.invoke('bor:mcp-get-catalog', opts || {}),
  getInstalled: () => ipcRenderer.invoke('bor:mcp-get-installed'),
  getTheme: () => ipcRenderer.invoke('bor:mcp-get-theme'),
  ask: (query) => ipcRenderer.invoke('bor:mcp-ask', query),
  install: (mcpId) => ipcRenderer.invoke('bor:mcp-install', mcpId),
  close: () => ipcRenderer.invoke('bor:mcp-close'),
  // Fired when the reused window is shown again — lets the page refresh the
  // "Installed" badges without refetching the whole catalog.
  onShown: (cb) => ipcRenderer.on('bor:mcp-shown', () => { try { cb(); } catch { /* ignore */ } }),
});
