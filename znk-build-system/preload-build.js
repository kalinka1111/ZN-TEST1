const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('znkAdapter', {
  resolveIcon: (iconPath) => ipcRenderer.invoke('znk-resolve-icon', iconPath),
  loadManifest: (manifestPath) => ipcRenderer.invoke('znk-load-manifest', manifestPath),
  checkIntegrity: () => ipcRenderer.invoke('znk-check-integrity')
});

console.log('✅ ZNK Adapter loaded');
