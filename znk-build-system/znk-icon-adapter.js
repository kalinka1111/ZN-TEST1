/**
 * ZNK-ICON-ADAPTER.JS
 * Adaptateur intelligent pour gérer les icônes en DEV et BUILD
 * 
 * DEV: /icons/ + icons-intro-manifest.json
 * BUILD: /assets/icons/ + manifest-icon-b64.json
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

class ZNKIconAdapter {
  constructor() {
    this.isDev = !app.isPackaged;
    this.mode = this.isDev ? 'DEV' : 'BUILD';
    
    // Configuration des chemins selon le mode
    this.config = this.isDev ? {
      iconsPath: 'icons',
      manifestFile: 'icons-intro-manifest.json',
      format: 'svg'
    } : {
      iconsPath: 'assets/icons',
      manifestFile: 'manifest-icon-b64.json',
      format: 'base64'
    };
    
    this.basePath = this.getBasePath();
    this.manifestCache = null;
    this.iconCache = new Map();
    
    console.log(`🎯 ZNK Icon Adapter: ${this.mode} mode`);
    console.log(`📁 Icons path: ${this.config.iconsPath}`);
    console.log(`📄 Manifest: ${this.config.manifestFile}`);
  }
  
  /**
   * Obtenir le chemin de base selon le mode
   */
  getBasePath() {
    if (this.isDev) {
      return process.cwd();
    } else {
      // En production, les ressources sont dans app.asar ou resources/app
      return path.join(process.resourcesPath, 'app');
    }
  }
  
  /**
   * Charger le manifest approprié
   */
  loadManifest() {
    if (this.manifestCache) {
      return this.manifestCache;
    }
    
    const manifestPath = path.join(
      this.basePath,
      this.config.iconsPath,
      this.config.manifestFile
    );
    
    try {
      if (!fs.existsSync(manifestPath)) {
        console.warn(`⚠️ Manifest non trouvé: ${manifestPath}`);
        return {};
      }
      
      const content = fs.readFileSync(manifestPath, 'utf-8');
      this.manifestCache = JSON.parse(content);
      
      console.log(`✅ Manifest chargé: ${Object.keys(this.manifestCache).length} entrées`);
      return this.manifestCache;
      
    } catch (error) {
      console.error('❌ Erreur chargement manifest:', error.message);
      return {};
    }
  }
  
  /**
   * Résoudre une icône selon le mode
   */
  resolveIcon(iconName) {
    // Nettoyer le nom (enlever path, extension)
    const cleanName = path.basename(iconName, path.extname(iconName));
    
    // Vérifier le cache
    if (this.iconCache.has(cleanName)) {
      return this.iconCache.get(cleanName);
    }
    
    let resolved;
    
    if (this.isDev) {
      // Mode DEV: retourner le chemin file://
      resolved = this.resolveDevIcon(cleanName);
    } else {
      // Mode BUILD: retourner base64 du manifest
      resolved = this.resolveBuildIcon(cleanName);
    }
    
    // Mettre en cache
    this.iconCache.set(cleanName, resolved);
    return resolved;
  }
  
  /**
   * Résoudre icône en mode DEV (SVG)
   */
  resolveDevIcon(iconName) {
    const extensions = ['.svg', '.png'];
    const iconsDir = path.join(this.basePath, this.config.iconsPath);
    
    for (const ext of extensions) {
      const iconPath = path.join(iconsDir, iconName + ext);
      
      if (fs.existsSync(iconPath)) {
        const fileUrl = 'file://' + iconPath;
        console.log(`🔍 DEV: ${iconName} → ${iconPath}`);
        return fileUrl;
      }
    }
    
    console.warn(`⚠️ Icône non trouvée: ${iconName}`);
    return null;
  }
  
  /**
   * Résoudre icône en mode BUILD (base64)
   */
  resolveBuildIcon(iconName) {
    const manifest = this.loadManifest();
    
    // Chercher dans le manifest
    if (manifest[iconName]) {
      console.log(`🔍 BUILD: ${iconName} → base64`);
      return manifest[iconName];
    }
    
    // Chercher avec variations de nom
    const variations = [
      iconName,
      iconName.toLowerCase(),
      iconName.toUpperCase(),
      iconName.replace(/-/g, '_'),
      iconName.replace(/_/g, '-')
    ];
    
    for (const variant of variations) {
      if (manifest[variant]) {
        console.log(`🔍 BUILD: ${iconName} → ${variant} (base64)`);
        return manifest[variant];
      }
    }
    
    console.warn(`⚠️ Icône non trouvée dans manifest: ${iconName}`);
    return null;
  }
  
  /**
   * Charger toutes les icônes disponibles
   */
  getAllIcons() {
    if (this.isDev) {
      return this.scanDevIcons();
    } else {
      return this.getBuildIcons();
    }
  }
  
  /**
   * Scanner les icônes en DEV
   */
  scanDevIcons() {
    const iconsDir = path.join(this.basePath, this.config.iconsPath);
    const icons = [];
    
    try {
      if (!fs.existsSync(iconsDir)) {
        return icons;
      }
      
      const files = fs.readdirSync(iconsDir);
      
      files.forEach(file => {
        const ext = path.extname(file);
        if (['.svg', '.png'].includes(ext)) {
          const name = path.basename(file, ext);
          icons.push({
            name: name,
            file: file,
            path: path.join(this.config.iconsPath, file),
            url: this.resolveIcon(name)
          });
        }
      });
      
    } catch (error) {
      console.error('Erreur scan icons:', error.message);
    }
    
    return icons;
  }
  
  /**
   * Obtenir les icônes du manifest BUILD
   */
  getBuildIcons() {
    const manifest = this.loadManifest();
    const icons = [];
    
    for (const [name, data] of Object.entries(manifest)) {
      icons.push({
        name: name,
        data: data,
        format: 'base64'
      });
    }
    
    return icons;
  }
  
  /**
   * Adapter un manifest intro pour le BUILD
   * Convertit les références SVG en base64
   */
  adaptManifestForBuild(introManifest) {
    const adapted = {};
    
    for (const [key, value] of Object.entries(introManifest)) {
      if (typeof value === 'string' && value.endsWith('.svg')) {
        // Remplacer par base64
        const iconName = path.basename(value, '.svg');
        adapted[key] = this.resolveIcon(iconName);
      } else if (typeof value === 'object' && value !== null) {
        // Récursif pour les objets
        adapted[key] = this.adaptManifestForBuild(value);
      } else {
        adapted[key] = value;
      }
    }
    
    return adapted;
  }
  
  /**
   * Charger le manifest intro et l'adapter automatiquement
   */
  loadIntroManifest() {
    const introPath = path.join(
      this.basePath,
      this.config.iconsPath,
      'icons-intro-manifest.json'
    );
    
    try {
      if (!fs.existsSync(introPath)) {
        console.warn('⚠️ icons-intro-manifest.json non trouvé');
        return {};
      }
      
      const content = fs.readFileSync(introPath, 'utf-8');
      const manifest = JSON.parse(content);
      
      // Adapter selon le mode
      if (this.isDev) {
        return manifest; // Pas besoin d'adapter en DEV
      } else {
        return this.adaptManifestForBuild(manifest);
      }
      
    } catch (error) {
      console.error('Erreur chargement intro manifest:', error.message);
      return {};
    }
  }
  
  /**
   * Vérifier l'intégrité du système
   */
  checkIntegrity() {
    const report = {
      mode: this.mode,
      basePath: this.basePath,
      config: this.config,
      iconsFound: 0,
      manifestLoaded: false,
      errors: []
    };
    
    // Vérifier le dossier icons
    const iconsPath = path.join(this.basePath, this.config.iconsPath);
    if (fs.existsSync(iconsPath)) {
      report.iconsFound = this.getAllIcons().length;
    } else {
      report.errors.push(`Dossier icons non trouvé: ${iconsPath}`);
    }
    
    // Vérifier le manifest
    try {
      const manifest = this.loadManifest();
      report.manifestLoaded = Object.keys(manifest).length > 0;
    } catch (error) {
      report.errors.push(`Erreur manifest: ${error.message}`);
    }
    
    return report;
  }
  
  /**
   * Mode debug: afficher toutes les infos
   */
  debug() {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 ZNK ICON ADAPTER - DEBUG');
    console.log('='.repeat(60));
    
    const integrity = this.checkIntegrity();
    
    console.log(`\nMode: ${integrity.mode}`);
    console.log(`Base Path: ${integrity.basePath}`);
    console.log(`Icons Path: ${integrity.config.iconsPath}`);
    console.log(`Manifest: ${integrity.config.manifestFile}`);
    console.log(`Icons trouvées: ${integrity.iconsFound}`);
    console.log(`Manifest chargé: ${integrity.manifestLoaded ? '✅' : '❌'}`);
    
    if (integrity.errors.length > 0) {
      console.log('\n⚠️ Erreurs:');
      integrity.errors.forEach(err => console.log(`  - ${err}`));
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    return integrity;
  }
}

// Export singleton
module.exports = new ZNKIconAdapter();