/**
 * PATH ADAPTER - Gère les chemins en DEV et BUILD
 * Résout automatiquement icons/, assets/, et manifests
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

class ZNKPathAdapter {
  constructor() {
    this.isDev = !app.isPackaged;
    this.setupPaths();
    
    console.log('🎯 ZNK Path Adapter initialisé');
    console.log('   Mode:', this.isDev ? 'DEV' : 'PRODUCTION');
    console.log('   Base:', this.basePath);
    console.log('   Icons:', this.iconsPaths);
  }

  setupPaths() {
    if (this.isDev) {
      // DEV: on est dans electron/
      this.basePath = path.join(__dirname, '..');
      this.iconsPaths = [
        path.join(this.basePath, 'icons'),
        path.join(this.basePath, 'assets/icons'),
        path.join(this.basePath, 'assets')
      ];
    } else {
      // PROD: ressources extraites
      this.basePath = process.resourcesPath;
      this.iconsPaths = [
        path.join(this.basePath, 'icons'),
        path.join(this.basePath, 'assets/icons'),
        path.join(this.basePath, 'assets')
      ];
    }
  }

  /**
   * Résout le chemin d'une icône
   */
  resolveIcon(iconPath) {
    if (!iconPath) return null;

    // Si c'est déjà un chemin absolu, le retourner
    if (iconPath.startsWith('file://')) {
      return iconPath;
    }

    const fileName = path.basename(iconPath);

    // Chercher dans tous les dossiers d'icônes
    for (const iconsDir of this.iconsPaths) {
      const fullPath = path.join(iconsDir, fileName);
      if (fs.existsSync(fullPath)) {
        return 'file://' + fullPath;
      }
    }

    console.warn('⚠️  Icône non trouvée:', iconPath);
    return null;
  }

  /**
   * Charge un manifest JSON
   */
  loadManifest(manifestName) {
    console.log('📄 Chargement manifest:', manifestName);

    // Chercher dans tous les dossiers d'icônes
    for (const iconsDir of this.iconsPaths) {
      const manifestPath = path.join(iconsDir, manifestName);
      
      console.log('   Recherche:', manifestPath);
      
      if (fs.existsSync(manifestPath)) {
        try {
          const content = fs.readFileSync(manifestPath, 'utf-8');
          const manifest = JSON.parse(content);
          
          console.log('   ✅ Trouvé:', manifestPath);
          console.log('   📊 Entrées:', Object.keys(manifest).length);
          
          // Adapter tous les chemins d'icônes dans le manifest
          return this.adaptManifest(manifest);
        } catch (error) {
          console.error('   ❌ Erreur lecture:', error.message);
          return null;
        }
      }
    }

    console.warn('   ⚠️  Manifest non trouvé:', manifestName);
    return null;
  }

  /**
   * Adapte tous les chemins dans un manifest
   */
  adaptManifest(manifest) {
    const adapted = {};

    for (const [key, value] of Object.entries(manifest)) {
      if (typeof value === 'string') {
        // Si c'est un chemin d'icône, le résoudre
        if (value.endsWith('.svg') || value.endsWith('.png') || value.endsWith('.jpg')) {
          adapted[key] = this.resolveIcon(value);
        } else {
          adapted[key] = value;
        }
      } else if (typeof value === 'object' && value !== null) {
        // Récursif pour les objets imbriqués
        adapted[key] = this.adaptManifest(value);
      } else {
        adapted[key] = value;
      }
    }

    return adapted;
  }

  /**
   * Charge tous les manifests disponibles
   */
  loadAllManifests() {
    console.log('📚 Chargement de tous les manifests...');
    
    const manifests = {};
    const manifestFiles = [
      'manifest-icon-b64.json',
      'icons-intro-manifest.json'
    ];

    for (const manifestFile of manifestFiles) {
      const manifest = this.loadManifest(manifestFile);
      if (manifest) {
        const name = path.basename(manifestFile, '.json');
        manifests[name] = manifest;
        console.log('   ✅', name, ':', Object.keys(manifest).length, 'entrées');
      }
    }

    console.log('   📊 Total:', Object.keys(manifests).length, 'manifests chargés');
    return manifests;
  }

  /**
   * Scan tous les fichiers d'icônes disponibles
   */
  scanIcons() {
    console.log('🔍 Scan des icônes...');
    
    const icons = [];

    for (const iconsDir of this.iconsPaths) {
      if (!fs.existsSync(iconsDir)) continue;

      try {
        const files = fs.readdirSync(iconsDir);
        
        for (const file of files) {
          if (file.endsWith('.svg') || file.endsWith('.png') || file.endsWith('.jpg')) {
            icons.push({
              name: file,
              path: path.join(iconsDir, file),
              dir: iconsDir,
              resolved: 'file://' + path.join(iconsDir, file)
            });
          }
        }
      } catch (error) {
        console.error('   ❌ Erreur scan:', iconsDir, error.message);
      }
    }

    console.log('   ✅ Trouvées:', icons.length, 'icônes');
    return icons;
  }

  /**
   * Vérification d'intégrité
   */
  checkIntegrity() {
    const icons = this.scanIcons();
    const manifests = this.loadAllManifests();

    return {
      mode: this.isDev ? 'DEV' : 'PRODUCTION',
      basePath: this.basePath,
      iconsPaths: this.iconsPaths,
      iconsFound: icons.length,
      manifestsFound: Object.keys(manifests).length,
      manifests: Object.keys(manifests),
      sampleIcons: icons.slice(0, 5).map(i => i.name)
    };
  }
}

// Export singleton
module.exports = new ZNKPathAdapter();
