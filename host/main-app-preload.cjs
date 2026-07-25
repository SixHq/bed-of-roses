// Preload for the Main BOR app window. Exposes a narrow, registry-scoped API
// for managing presences. Distinct from preload.cjs (the per-presence orb
// bridge) — this one operates ACROSS presences.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('borMainApp', {
  // Where the bor-web app (credits/dashboard) is served. Local dev runs it on
  // :3000 (see bor-web/vite.config.js); prod points at the deployed URL.
  webBase: process.env.BOR_SIXTH_LOCAL === '1' ? 'http://localhost:3000' : 'https://app.bedofroses.os',
  listPresences: () => ipcRenderer.invoke('bor:presences-list'),
  createPresence: (nickname) => ipcRenderer.invoke('bor:presences-create', { nickname }),
  deletePresence: (id) => ipcRenderer.invoke('bor:presences-delete', { id }),
  updatePresence: (id, patch) => ipcRenderer.invoke('bor:presences-update', { id, patch }),
  getPresenceConfig: (id) => ipcRenderer.invoke('bor:presence-get-config', { id }),
  updatePresenceConfig: (id, patch) => ipcRenderer.invoke('bor:presence-update-config', { id, patch }),
  getPresenceData: (id, kind) => ipcRenderer.invoke('bor:presence-get-data', { id, kind }),
  openOnboarding: (id) => ipcRenderer.invoke('bor:open-presence-onboarding', { id }),
  focusPresence: (id) => ipcRenderer.invoke('bor:focus-presence', { id }),
  openExternal: (url) => ipcRenderer.invoke('bor:open-external', url),
  // Subscribe to "presences changed" pushes from main (create/delete/update).
  onPresencesChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('bor:presences-changed', listener);
    return () => ipcRenderer.removeListener('bor:presences-changed', listener);
  },
});
