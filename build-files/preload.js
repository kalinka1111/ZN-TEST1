/**
 * PRELOAD.JS
 * Expose l'adaptateur d'icônes au frontend
 */

const { contextBridge, ipcRenderer } = require('electron');

// API pour l'adaptateur d'icônes
contextBridge.exposeInMainWorld('znkIcons', {
  /**
   * Résoudre une icône (retourne SVG en DEV, base64 en BUILD)
   * @param {string} iconName - Nom de l'icône (avec ou sans extension)
   * @returns {Promise<string>} URL ou base64
   */
  resolve: (iconName) => ipcRenderer.invoke('znk-icon-resolve', iconName),
  
  /**
   * Charger toutes les icônes disponibles
   * @returns {Promise<Array>} Liste des icônes
   */
  getAll: () => ipcRenderer.invoke('znk-icon-get-all'),
  
  /**
   * Charger le manifest intro (adapté automatiquement)
   * @returns {Promise<Object>} Manifest adapté selon le mode
   */
  loadIntroManifest: () => ipcRenderer.invoke('znk-icon-load-intro'),
  
  /**
   * Obtenir le mode actuel (DEV ou BUILD)
   * @returns {Promise<Object>} {mode, isDev, config}
   */
  getMode: () => ipcRenderer.invoke('znk-icon-get-mode'),
  
  /**
   * Vérifier l'intégrité du système
   * @returns {Promise<Object>} Rapport d'intégrité
   */
  checkIntegrity: () => ipcRenderer.invoke('znk-icon-check-integrity'),
  
  /**
   * Debug: afficher toutes les infos
   * @returns {Promise<Object>} Info debug
   */
  debug: () => ipcRenderer.invoke('znk-icon-debug')
});

// API utilitaires
contextBridge.exposeInMainWorld('znkUtils', {
  getAppInfo: () => ipcRenderer.invoke('znk-get-app-info'),
  log: (message) => ipcRenderer.invoke('znk-log', message)
});

console.log('✅ ZNK Icon Adapter exposé au frontend');