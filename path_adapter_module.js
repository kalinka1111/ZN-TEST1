/**
 * ZNK PATH ADAPTER - Adaptateur automatique de chemins
 * Compatible avec la structure ZNK237-APP
 * Gère automatiquement les chemins icons/ et assets/icons/
 * Auto-détecte dev vs build
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

class ZNKPathAdapter {
  constructor() {
    this.isDev = !app.isPackaged;
    this.basePath = this.getBasePath();
    this.cache = new Map();
    
    // Chemins possibles pour les icônes
    this.iconsPaths = [
      'icons',
      'assets/icons',
      path.join('assets', 'icons')
    ];
    
    // Chemins possibles pour les manifests
    this.manifestPaths = [
      'icons/manifest-icon-b64.json',
      'icons/icons-intro-manifest.json',
      'assets/icons/manifest-icon-b64.json',
      'assets/icons/icons-intro-manifest.json'
    ];
    
    console.log(`🎯 ZNK Path Adapter initialisé`);
    console.log(`   Mode: ${this.isDev ? 'DEVELOPMENT' : 'PRODUCTION'}`);
    console.log(`   Base: ${this.basePath}`);
  }
  
  getBasePath() {
    if (this.isDev) {
      return process.cwd();
    } else {
      // En production (après build)
      return path.join(process.resourcesPath, 'app');
    }
  }
  
  /**
   * Résout un chemin d'icône
   * @param {string} iconPath - Chemin relatif de l'icône
   * @returns {string} Chemin résolu
   */
  resolveIcon(iconPath) {
    // Vérifier le cache
    if (this.cache.has(iconPath)) {
      return this.cache.get(iconPath);
    }
    
    // Nettoyer le chemin
    const cleanPath = iconPath.replace(/^\/+/, '').replace(/\\/g, '/');
    const fileName = path.basename(cleanPath);
    
    // Tentatives de résolution
    const attempts = [
      // Chemin original
      path.join(this.basePath, cleanPath),
      // Dans /icons/
      path.join(this.basePath, 'icons', fileName),
      // Dans /assets/icons/
      path.join(this.basePath, 'assets', 'icons', fileName),
      // Variante avec sous-dossiers
      path.join(this.basePath, 'icons', ...cleanPath.split('/').slice(-2)),
      path.join(this.basePath, 'assets', 'icons', ...cleanPath.split('/').slice(-2))
    ];
    
    for (const attemptPath of attempts) {
      if (fs.existsSync(attemptPath)) {
        const resolvedPath = this.isDev 
          ? `file://${attemptPath}`
          : `file://${attemptPath}`;
        
        this.cache.set(iconPath, resolvedPath);
        return resolvedPath;
      }
    }
    
    console.warn(`⚠️  Icône non trouvée: ${iconPath}`);
    // Retourner un chemin par défaut ou le chemin original
    return iconPath;
  }
  
  /**
   * Charge et adapte un manifest JSON
   * @param {string} manifestPath - Chemin du manifest
   * @returns {Object} Manifest adapté
   */
  loadManifest(manifestPath) {
    const fullPath = this.resolveManifestPath(manifestPath);
    
    if (!fullPath || !fs.existsSync(fullPath)) {
      console.error(`❌ Manifest non trouvé: ${manifestPath}`);
      return {};
    }
    
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const manifest = JSON.parse(content);
      
      // Adapter tous les chemins dans le manifest
      return this.adaptManifestPaths(manifest);
    } catch (error) {
      console.error(`❌ Erreur lecture manifest: ${error.message}`);
      return {};
    }
  }
  
  /**
   * Résout le chemin d'un manifest
   */
  resolveManifestPath(manifestPath) {
    const cleanPath = manifestPath.replace(/^\/+/, '').replace(/\\/g, '/');
    
    const attempts = [
      path.join(this.basePath, cleanPath),
      path.join(this.basePath, 'icons', path.basename(cleanPath)),
      path.join(this.basePath, 'assets', 'icons', path.basename(cleanPath))
    ];
    
    for (const attemptPath of attempts) {
      if (fs.existsSync(attemptPath)) {
        return attemptPath;
      }
    }
    
    return null;
  }
  
  /**
   * Adapte tous les chemins dans un manifest
   */
  adaptManifestPaths(manifest) {
    const adapted = JSON.parse(JSON.stringify(manifest)); // Deep clone
    
    const adaptPaths = (obj) => {
      for (const key in obj) {
        const value = obj[key];
        
        if (typeof value === 'string') {
          // Si c'est un chemin d'image
          if (value.endsWith('.svg') || value.endsWith('.png') || value.endsWith('.jpg')) {
            obj[key] = this.resolveIcon(value);
          }
        } else if (typeof value === 'object' && value !== null) {
          // Récursif pour les objets imbriqués
          adaptPaths(value);
        }
      }
    };
    
    adaptPaths(adapted);
    return adapted;
  }
  
  /**
   * Scan et liste tous les icônes disponibles
   * @returns {Array} Liste des icônes trouvées
   */
  scanIcons() {
    const icons = [];
    
    for (const iconsPath of this.iconsPaths) {
      const fullPath = path.join(this.basePath, iconsPath);
      
      if (fs.existsSync(fullPath)) {
        try {
          const files = fs.readdirSync(fullPath);
          
          files.forEach(file => {
            if (file.endsWith('.svg') || file.endsWith('.png')) {
              icons.push({
                name: file,
                path: path.join(iconsPath, file),
                fullPath: path.join(fullPath, file)
              });
            }
          });
        } catch (error) {
          console.error(`Erreur scan ${iconsPath}:`, error.message);
        }
      }
    }
    
    console.log(`✅ ${icons.length} icônes scannées`);
    return icons;
  }
  
  /**
   * Charge tous les manifests disponibles
   * @returns {Object} Manifests combinés
   */
  loadAllManifests() {
    const manifests = {};
    
    for (const manifestPath of this.manifestPaths) {
      const manifest = this.loadManifest(manifestPath);
      
      if (Object.keys(manifest).length > 0) {
        const name = path.basename(manifestPath, '.json');
        manifests[name] = manifest;
      }
    }
    
    console.log(`✅ ${Object.keys(manifests).length} manifests chargés`);
    return manifests;
  }
  
  /**
   * Vérifie l'intégrité de la structure
   * @returns {Object} Rapport de vérification
   */
  checkIntegrity() {
    const report = {
      basePath: this.basePath,
      isDev: this.isDev,
      iconsFound: 0,
      manifestsFound: 0,
      missingPaths: []
    };
    
    // Vérifier les dossiers icons
    for (const iconsPath of this.iconsPaths) {
      const fullPath = path.join(this.basePath, iconsPath);
      if (fs.existsSync(fullPath)) {
        report.iconsFound++;
      } else {
        report.missingPaths.push(iconsPath);
      }
    }
    
    // Vérifier les manifests
    for (const manifestPath of this.manifestPaths) {
      const resolved = this.resolveManifestPath(manifestPath);
      if (resolved) {
        report.manifestsFound++;
      }
    }
    
    return report;
  }
  
  /**
   * Nettoie le cache
   */
  clearCache() {
    this.cache.clear();
    console.log('🗑️  Cache nettoyé');
  }
}

// Export singleton
const pathAdapter = new ZNKPathAdapter();

module.exports = pathAdapter;