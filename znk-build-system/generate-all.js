/**
 * ZNK BUILD SYSTEM - Générateur complet
 * Génère TOUT ce qu'il faut pour builder proprement
 */

const fs = require('fs');
const path = require('path');

class ZNKBuildSystem {
  constructor() {
    this.root = path.resolve(__dirname, '..');
    this.buildDir = __dirname; // znk-build-system/
  }

  async generate() {
    console.log('🚀 ZNK BUILD SYSTEM - Génération complète\n');
    
    // Analyser le projet
    await this.analyzeProject();
    
    // Générer tous les fichiers
    this.generateMainBuild();
    this.generatePathAdapter();
    this.generatePreload();
    this.generatePackageJson();
    this.generateBuildScripts();
    this.generateDebugger();
    
    console.log('\n✅ GÉNÉRATION TERMINÉE !');
    console.log('📁 Tout est dans: znk-build-system/\n');
    this.printUsage();
  }

  async analyzeProject() {
    console.log('🔍 Analyse du projet...\n');
    
    // Détecter structure
    this.structure = {
      hasElectronDir: fs.existsSync(path.join(this.root, 'electron')),
      hasModules: fs.existsSync(path.join(this.root, 'modules')),
      hasModulesAdmin: fs.existsSync(path.join(this.root, 'modules-admin')),
      hasIcons: fs.existsSync(path.join(this.root, 'icons')),
      hasAssetsIcons: fs.existsSync(path.join(this.root, 'assets/icons')),
    };
    
    // Trouver les fichiers HTML
    this.htmlFiles = fs.readdirSync(this.root)
      .filter(f => f.endsWith('.html'));
    
    // Lire package.json
    const pkgPath = path.join(this.root, 'package.json');
    if (fs.existsSync(pkgPath)) {
      this.pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    } else {
      this.pkg = { name: 'znk237-app', version: '1.0.0' };
    }
    
    console.log('✅ Structure détectée:');
    console.log(`   electron/: ${this.structure.hasElectronDir ? '✅' : '❌'}`);
    console.log(`   modules/: ${this.structure.hasModules ? '✅' : '❌'}`);
    console.log(`   modules-admin/: ${this.structure.hasModulesAdmin ? '✅' : '❌'}`);
    console.log(`   icons/: ${this.structure.hasIcons ? '✅' : '❌'}`);
    console.log(`   assets/icons/: ${this.structure.hasAssetsIcons ? '✅' : '❌'}`);
    console.log(`   HTML files: ${this.htmlFiles.length}\n`);
  }

  generateMainBuild() {
    console.log('📝 Génération main-build.js...');
    
    const mainHtml = this.htmlFiles.includes('index.html') ? 'index.html' : this.htmlFiles[0];
    
    const content = `const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Import path adapter
const pathAdapter = require('./path-adapter');

let mainWindow;

function createWindow() {
  console.log('🚀 Création fenêtre...');
  console.log('📁 __dirname:', __dirname);
  console.log('📦 isPackaged:', app.isPackaged);
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-build.js')
    },
    show: false
  });

  // Charger HTML
  const htmlFiles = ${JSON.stringify(this.htmlFiles)};
  let loaded = false;
  
  for (const file of htmlFiles) {
    const filePath = path.join(__dirname, file);
    console.log('🔍 Cherche:', filePath, '→', fs.existsSync(filePath) ? '✅' : '❌');
    
    if (fs.existsSync(filePath)) {
      mainWindow.loadFile(filePath);
      console.log('✅ Chargé:', file);
      loaded = true;
      break;
    }
  }

  if (!loaded) {
    console.error('❌ Aucun fichier HTML trouvé !');
    console.log('📂 Contenu __dirname:', fs.readdirSync(__dirname).slice(0, 10));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Debug console
  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log('🌐 Renderer:', message);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
function setupIPC() {
  ipcMain.handle('znk-resolve-icon', async (event, iconPath) => {
    return pathAdapter.resolveIcon(iconPath);
  });

  ipcMain.handle('znk-load-manifest', async (event, manifestPath) => {
    return pathAdapter.loadManifest(manifestPath);
  });

  ipcMain.handle('znk-check-integrity', async () => {
    return pathAdapter.checkIntegrity();
  });
  
  console.log('✅ IPC handlers configurés');
}

app.whenReady().then(() => {
  setupIPC();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
`;
    
    fs.writeFileSync(path.join(this.buildDir, 'main-build.js'), content);
    console.log('   ✅ main-build.js créé\n');
  }

  generatePathAdapter() {
    console.log('📝 Génération path-adapter.js...');
    
    const iconsPaths = [];
    if (this.structure.hasIcons) iconsPaths.push('icons');
    if (this.structure.hasAssetsIcons) iconsPaths.push('assets/icons');
    
    const content = `const { app } = require('electron');
const path = require('path');
const fs = require('fs');

class PathAdapter {
  constructor() {
    this.isDev = !app.isPackaged;
    this.basePath = this.getBasePath();
    this.iconsPaths = ${JSON.stringify(iconsPaths)};
    
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
`;
    
    fs.writeFileSync(path.join(this.buildDir, 'path-adapter.js'), content);
    console.log('   ✅ path-adapter.js créé\n');
  }

  generatePreload() {
    console.log('📝 Génération preload-build.js...');
    
    const content = `const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('znkAdapter', {
  resolveIcon: (iconPath) => ipcRenderer.invoke('znk-resolve-icon', iconPath),
  loadManifest: (manifestPath) => ipcRenderer.invoke('znk-load-manifest', manifestPath),
  checkIntegrity: () => ipcRenderer.invoke('znk-check-integrity')
});

console.log('✅ ZNK Adapter loaded');
`;
    
    fs.writeFileSync(path.join(this.buildDir, 'preload-build.js'), content);
    console.log('   ✅ preload-build.js créé\n');
  }

  generatePackageJson() {
    console.log('📝 Génération package-build.json...');
    
    const pkg = {
      name: this.pkg.name || 'znk237-app',
      version: this.pkg.version || '1.0.0',
      main: "main-build.js",
      description: "ZNK237-APP",
      scripts: {
        "start": "electron .",
        "build-mac": "electron-builder --mac",
        "build-win": "electron-builder --win"
      },
      devDependencies: {
        "electron": "^27.0.0",
        "electron-builder": "^24.6.4"
      },
      build: {
        appId: "com.znk.znk237app",
        productName: "ZNK237-APP",
        directories: {
          output: "dist/${platform}"
        },
        files: [
          "main-build.js",
          "path-adapter.js",
          "preload-build.js",
          "*.html",
          "modules/**/*",
          "modules-admin/**/*",
          "js/**/*",
          "ui/**/*",
          "frontend/**/*"
        ],
        extraResources: [
          {
            from: "icons",
            to: "icons"
          },
          {
            from: "assets",
            to: "assets"
          }
        ],
        mac: {
          target: "dmg",
          category: "public.app-category.productivity"
        },
        win: {
          target: "nsis"
        }
      }
    };
    
    fs.writeFileSync(
      path.join(this.buildDir, 'package-build.json'),
      JSON.stringify(pkg, null, 2)
    );
    console.log('   ✅ package-build.json créé\n');
  }

  generateBuildScripts() {
    console.log('📝 Génération scripts de build...');
    
    const buildScript = `#!/bin/bash
# BUILD ZNK237-APP

PLATFORM=\${1:-mac}

echo "🚀 BUILD ZNK237-APP - \$PLATFORM"
echo ""

# Copier fichiers
echo "📦 Copie fichiers build..."
cp znk-build-system/main-build.js ./
cp znk-build-system/path-adapter.js ./
cp znk-build-system/preload-build.js ./

# Backup package.json
if [ -f "package.json" ]; then
    cp package.json package.backup.json
fi

# Utiliser package-build.json
cp znk-build-system/package-build.json package.json

# Build
echo "🔨 Build en cours..."
if [ "\$PLATFORM" = "mac" ]; then
    npm run build-mac
elif [ "\$PLATFORM" = "win" ]; then
    npm run build-win
fi

# Restore
if [ -f "package.backup.json" ]; then
    mv package.backup.json package.json
fi

# Clean
rm -f main-build.js path-adapter.js preload-build.js

echo ""
echo "✅ Build terminé: dist/\$PLATFORM/"
`;
    
    fs.writeFileSync(path.join(this.buildDir, 'build.sh'), buildScript);
    fs.chmodSync(path.join(this.buildDir, 'build.sh'), '755');
    console.log('   ✅ build.sh créé\n');
  }

  generateDebugger() {
    console.log('📝 Génération debug.js...');
    
    const content = `/**
 * DEBUG ZNK237-APP
 * Lance l'app en mode debug pour voir ce qui se passe
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🔍 DEBUG MODE ZNK237-APP\\n');

// Copier les fichiers
require('fs').copyFileSync('znk-build-system/main-build.js', 'main-build.js');
require('fs').copyFileSync('znk-build-system/path-adapter.js', 'path-adapter.js');
require('fs').copyFileSync('znk-build-system/preload-build.js', 'preload-build.js');

// Backup et remplacer package.json
if (require('fs').existsSync('package.json')) {
  require('fs').copyFileSync('package.json', 'package.debug-backup.json');
}
require('fs').copyFileSync('znk-build-system/package-build.json', 'package.json');

console.log('📦 Fichiers copiés\\n');
console.log('🚀 Lancement Electron...\\n');
console.log('━'.repeat(50));

const electron = spawn('npx', ['electron', '.'], {
  stdio: 'inherit',
  shell: true
});

electron.on('close', (code) => {
  console.log('━'.repeat(50));
  console.log('\\n🛑 Electron fermé (code:', code, ')\\n');
  
  // Restore
  if (require('fs').existsSync('package.debug-backup.json')) {
    require('fs').copyFileSync('package.debug-backup.json', 'package.json');
    require('fs').unlinkSync('package.debug-backup.json');
  }
  
  // Clean
  require('fs').unlinkSync('main-build.js');
  require('fs').unlinkSync('path-adapter.js');
  require('fs').unlinkSync('preload-build.js');
  
  console.log('✅ Nettoyage terminé\\n');
});
`;
    
    fs.writeFileSync(path.join(this.buildDir, 'debug.js'), content);
    console.log('   ✅ debug.js créé\n');
  }

  printUsage() {
    console.log('╔' + '═'.repeat(58) + '╗');
    console.log('║' + ' '.repeat(18) + 'UTILISATION' + ' '.repeat(29) + '║');
    console.log('╚' + '═'.repeat(58) + '╝');
    console.log('');
    console.log('1️⃣  TESTER en DEV:');
    console.log('    node znk-build-system/debug.js');
    console.log('');
    console.log('2️⃣  BUILD MAC:');
    console.log('    ./znk-build-system/build.sh mac');
    console.log('');
    console.log('3️⃣  BUILD WINDOWS:');
    console.log('    ./znk-build-system/build.sh win');
    console.log('');
    console.log('╔' + '═'.repeat(58) + '╗');
  }
}

// Exécution
if (require.main === module) {
  const system = new ZNKBuildSystem();
  system.generate().catch(console.error);
}

module.exports = ZNKBuildSystem;