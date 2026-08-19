const { contextBridge, ipcRenderer } = require('electron');

// Exposer les APIs de manière sécurisée au renderer
contextBridge.exposeInMainWorld('znkAPI', {
  
  // ========== VIDÉOS ==========
  videos: {
    getAll: () => ipcRenderer.invoke('videos:getAll'),
    add: (videoData) => ipcRenderer.invoke('videos:add', videoData),
    remove: (videoId) => ipcRenderer.invoke('videos:remove', videoId),
    update: (videoId, updates) => ipcRenderer.invoke('videos:update', videoId, updates),
    copy: (sourcePath, filename) => ipcRenderer.invoke('videos:copy', sourcePath, filename),
    exists: (filename) => ipcRenderer.invoke('videos:exists', filename)
  },

  // ========== MUSIQUE ==========
  music: {
    getAll: () => ipcRenderer.invoke('music:getAll'),
    add: (musicData) => ipcRenderer.invoke('music:add', musicData),
    remove: (musicId) => ipcRenderer.invoke('music:remove', musicId),
    copy: (sourcePath, filename) => ipcRenderer.invoke('music:copy', sourcePath, filename)
  },

  // ========== ICÔNES ==========
  icons: {
    getAll: () => ipcRenderer.invoke('icons:getAll'),
    add: (iconData) => ipcRenderer.invoke('icons:add', iconData),
    remove: (iconId) => ipcRenderer.invoke('icons:remove', iconId),
    copy: (sourcePath, filename) => ipcRenderer.invoke('icons:copy', sourcePath, filename)
  },

  // ========== UTILITAIRES ==========
  manifest: {
    clean: (type) => ipcRenderer.invoke('manifest:clean', type),
    getPaths: () => ipcRenderer.invoke('manifest:getPaths'),
    export: (exportPath) => ipcRenderer.invoke('manifest:export', exportPath),
    import: (importPath) => ipcRenderer.invoke('manifest:import', importPath),
    listFiles: (type) => ipcRenderer.invoke('manifest:listFiles', type)
  }
});