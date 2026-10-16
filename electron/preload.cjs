const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('coreDesktop', Object.freeze({
  isDesktop: true,
  getDisplaySources: () => ipcRenderer.invoke('core:display:sources'),
  selectDisplaySource: (sourceId) => ipcRenderer.invoke('core:display:select', sourceId),
  openPrivacySettings: (kind) => ipcRenderer.invoke('core:windows:privacy', kind),
}));
