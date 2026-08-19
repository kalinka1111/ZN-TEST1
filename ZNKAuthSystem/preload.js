const { contextBridge, ipcRenderer } = require('electron');

// Exposer les APIs de manière sécurisée
contextBridge.exposeInMainWorld('electronAPI', {
    // Gestion des utilisateurs
    saveNewUser: (userData) => ipcRenderer.send('save-new-user', userData),
    onUserSaved: (callback) => ipcRenderer.on('user-saved', callback),
    
    getAllUsers: () => ipcRenderer.invoke('get-all-users'),
    getUserData: (userId) => ipcRenderer.invoke('get-user-data', userId),
    verifyUserPin: (userId, pin) => ipcRenderer.invoke('verify-user-pin', userId, pin),
    
    updateUserData: (userId, updates) => ipcRenderer.send('update-user-data', userId, updates),
    onUserUpdated: (callback) => ipcRenderer.on('user-updated', callback),
    
    deleteUser: (userId) => ipcRenderer.invoke('delete-user', userId),
    getUsersStats: () => ipcRenderer.invoke('get-users-stats'),
    
    // Système
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getPlatform: () => process.platform,
    
    // Navigation
    openExternal: (url) => ipcRenderer.send('open-external', url)
});

console.log('✅ Preload script chargé - API exposée');