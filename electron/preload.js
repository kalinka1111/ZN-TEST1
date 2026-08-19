// ==========================================
// ZNK - Electron Preload Script
// Bridge sécurisé entre Electron et le Web
// ==========================================

const { contextBridge } = require('electron');

console.log('🔗 ZNK Preload - Initialisation du bridge');

// ==========================================
// EXPOSITION DES API SÉCURISÉES
// ==========================================

contextBridge.exposeInMainWorld('electronAPI', {
  
  // Informations système
  platform: process.platform,
  version: process.versions.electron,
  nodeVersion: process.versions.node,
  chromeVersion: process.versions.chrome,
  
  // Détection du mode
  isElectron: true,
  isPackaged: process.env.ELECTRON_PACKAGED === 'true',
  isDevelopment: process.env.NODE_ENV !== 'production',
  
  // Network status
  getNetworkStatus: () => navigator.onLine,
  
  // Event listeners pour changements réseau
  onNetworkChange: (callback) => {
    window.addEventListener('online', () => {
      console.log('🌐 Réseau: ONLINE');
      callback(true);
    });
    
    window.addEventListener('offline', () => {
      console.log('🌐 Réseau: OFFLINE');
      callback(false);
    });
  },
  
  // Logs vers console Electron (utile pour debug)
  log: (...args) => {
    console.log('[WEB]', ...args);
  },
  
  error: (...args) => {
    console.error('[WEB ERROR]', ...args);
  },
  
  // Info app
  getAppInfo: () => ({
    name: 'ZNK',
    version: '1.0.0',
    platform: process.platform,
    electron: process.versions.electron
  })
});

// ==========================================
// DÉTECTION ET LOGS
// ==========================================

console.log('✅ Bridge Electron initialisé:');
console.log('   - Platform:', process.platform);
console.log('   - Electron:', process.versions.electron);
console.log('   - Mode:', process.env.NODE_ENV || 'development');

// Notification au DOM quand prêt
window.addEventListener('DOMContentLoaded', () => {
  console.log('✅ DOM chargé - Bridge disponible');
  
  // Ajouter un marqueur dans le DOM
  const meta = document.createElement('meta');
  meta.name = 'znk-electron';
  meta.content = 'true';
  document.head.appendChild(meta);
});

// ==========================================
// DÉSACTIVATION DE CERTAINES FEATURES WEB
// ==========================================

// Bloquer l'ouverture de nouvelles fenêtres (sécurité)
window.addEventListener('DOMContentLoaded', () => {
  const originalOpen = window.open;
  window.open = function(url, target, features) {
    console.log('🚫 window.open bloqué:', url);
    // Ouvrir dans la même fenêtre
    if (url) {
      window.location.href = url;
    }
    return null;
  };
});

console.log('🔗 ZNK Preload - Terminé');