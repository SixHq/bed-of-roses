const { contextBridge, ipcRenderer } = require('electron');

const runtimeArg = process.argv.find((arg) => arg.startsWith('--bor-runtime-url='));
const surfaceArg = process.argv.find((arg) => arg.startsWith('--bor-surface-id='));
const runtimeUrl = runtimeArg ? runtimeArg.slice('--bor-runtime-url='.length) : null;
const surfaceId = surfaceArg ? surfaceArg.slice('--bor-surface-id='.length) : null;

contextBridge.exposeInMainWorld('widgetPreview', {
  runtimeUrl,
  surfaceId,
  getSurface: () => ipcRenderer.invoke('bor:get-surface', surfaceId),
  openSurface: () => ipcRenderer.invoke('bor:open-surface', surfaceId),
  getBounds: () => ipcRenderer.invoke('bor:get-widget-preview-bounds', surfaceId),
  setBounds: (bounds) => ipcRenderer.invoke('bor:set-widget-preview-bounds', surfaceId, bounds),
  persistBounds: (bounds) => ipcRenderer.invoke('bor:persist-widget-preview-bounds', surfaceId, bounds),
  bridge: (message) => ipcRenderer.invoke('bor:preview-bridge', surfaceId, message),
});
