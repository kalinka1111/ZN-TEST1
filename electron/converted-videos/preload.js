// preload.js - Bridge sécurisé entre le renderer et le main process
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Convertir une vidéo
    convertVideo: (options) => ipcRenderer.invoke('convert-video', options),
    
    // Ouvrir le dossier de sortie
    openOutputFolder: () => ipcRenderer.invoke('open-output-folder'),
    
    // Obtenir le chemin du dossier de sortie
    getOutputFolder: () => ipcRenderer.invoke('get-output-folder'),
    
    // Sélectionner des fichiers
    selectFiles: () => ipcRenderer.invoke('select-files'),
    
    // Écouter la progression de conversion
    onConversionProgress: (callback) => {
        ipcRenderer.on('conversion-progress', (event, data) => callback(data));
    }
});