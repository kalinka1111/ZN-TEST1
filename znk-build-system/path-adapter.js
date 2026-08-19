const { app } = require('electron');
const path = require('path');
const fs = require('fs');

class PathAdapter {
  constructor() {
    this.isDev = !app.isPackaged;
    this.basePath = this.getBasePath();
    this.iconsPaths = ["icons","assets/icons"];
    
    console.log('🎯 PathAdapter:', this.isDev ? 'DEV' : 'PROD');
    console.log('📁 BasePath:', this.basePath);
  }
  
  getBasePath() {
    if (this.isDev) {
      return process.cwd();
    } else {
      // En production: extraire de app.asar
      return process.resourcesPath;
    }
  }
  
  resolveIcon(iconPath) {
    const fileName = path.basename(iconPath);
    
    // Chercher dans tous les dossiers icons
    for (const iconsDir of this.iconsPaths) {
      const fullPath = path.join(this.basePath, iconsDir, fileName);
      if (fs.existsSync(fullPath)) {
        return 'file://' + fullPath;
      }
    }
    
    console.warn('⚠️  Icône non trouvée:', iconPath);
    return iconPath;
  }
  
  loadManifest(manifestPath) {
    for (const iconsDir of this.iconsPaths) {
      const fullPath = path.join(this.basePath, iconsDir, manifestPath);
      if (fs.existsSync(fullPath)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          return JSON.parse(content);
        } catch (error) {
          console.error('❌ Erreur manifest:', error.message);
        }
      }
    }
    return {};
  }
  
  checkIntegrity() {
    const icons = [];
    for (const iconsDir of this.iconsPaths) {
      const fullPath = path.join(this.basePath, iconsDir);
      if (fs.existsSync(fullPath)) {
        icons.push(...fs.readdirSync(fullPath).filter(f => f.endsWith('.svg') || f.endsWith('.png')));
      }
    }
    
    return {
      basePath: this.basePath,
      isDev: this.isDev,
      iconsFound: icons.length,
      iconsPaths: this.iconsPaths
    };
  }
}

module.exports = new PathAdapter();
