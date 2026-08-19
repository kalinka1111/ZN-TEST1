const fs = require('fs-extra');
const path = require('path');
const { app } = require('electron');

/**
 * Gestionnaire centralisé pour les manifests
 * S'intègre avec le système existant de main.js
 */
class ManifestManager {
  constructor() {
    this.userDataPath = app.getPath('userData');
    
    // Dossiers manifests uniquement (les autres existent déjà dans main.js)
    this.manifestsFolder = path.join(this.userDataPath, 'manifests');

    // Fichiers manifests
    this.manifests = {
      videos: path.join(this.manifestsFolder, 'znk-video-manifest.json'),
      music: path.join(this.manifestsFolder, 'znk-audio-manifest.json'),
      icons: path.join(this.manifestsFolder, 'znk-icons-manifest.json')
    };
  }

  async initialize() {
    try {
      await fs.ensureDir(this.manifestsFolder);

      // Initialiser chaque manifest s'il n'existe pas
      for (const [key, manifestPath] of Object.entries(this.manifests)) {
        if (!await fs.pathExists(manifestPath)) {
          await this.createDefaultManifest(key, manifestPath);
          console.log(`✅ Manifest créé: ${key}`);
        }
      }

      console.log('✅ ManifestManager initialisé');
    } catch (error) {
      console.error('❌ Erreur initialisation ManifestManager:', error);
    }
  }

  async createDefaultManifest(type, manifestPath) {
    const defaultData = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      items: []
    };

    await fs.writeJson(manifestPath, defaultData, { spaces: 2 });
  }

  async readManifest(type) {
    try {
      const manifestPath = this.manifests[type];
      
      if (!await fs.pathExists(manifestPath)) {
        await this.createDefaultManifest(type, manifestPath);
      }

      const data = await fs.readJson(manifestPath);
      return data;
    } catch (error) {
      console.error(`❌ Erreur lecture manifest ${type}:`, error);
      return { version: '1.0.0', lastUpdated: new Date().toISOString(), items: [] };
    }
  }

  async writeManifest(type, data) {
    try {
      const manifestPath = this.manifests[type];
      
      // Backup avant écriture
      if (await fs.pathExists(manifestPath)) {
        const backupPath = `${manifestPath}.backup`;
        await fs.copy(manifestPath, backupPath);
      }

      data.lastUpdated = new Date().toISOString();
      await fs.writeJson(manifestPath, data, { spaces: 2 });
      
      console.log(`✅ Manifest ${type} sauvegardé`);
      return true;
    } catch (error) {
      console.error(`❌ Erreur écriture manifest ${type}:`, error);
      return false;
    }
  }

  async addItem(type, item) {
    const manifest = await this.readManifest(type);
    
    // Éviter les doublons
    const exists = manifest.items.some(i => i.id === item.id);
    if (!exists) {
      manifest.items.push(item);
      await this.writeManifest(type, manifest);
    }
    
    return manifest;
  }

  async removeItem(type, itemId) {
    const manifest = await this.readManifest(type);
    manifest.items = manifest.items.filter(i => i.id !== itemId);
    await this.writeManifest(type, manifest);
    return manifest;
  }

  async updateItem(type, itemId, updates) {
    const manifest = await this.readManifest(type);
    const index = manifest.items.findIndex(i => i.id === itemId);
    
    if (index !== -1) {
      manifest.items[index] = { ...manifest.items[index], ...updates };
      await this.writeManifest(type, manifest);
    }
    
    return manifest;
  }
}

let instance = null;

function getManifestManager() {
  if (!instance) {
    instance = new ManifestManager();
  }
  return instance;
}

module.exports = { ManifestManager, getManifestManager };