/**
 * BUILD-GENERATOR-IMPROVED.JS
 * Système qui génère les fichiers de build adapté à ZNK237-APP
 * 
 * AMÉLIORATIONS:
 * ✅ Utilise le mapping ZNK237 (structure avec /electron, /modules, etc.)
 * ✅ Préserve les builds existants (dist/mac, dist/win séparés)
 * ✅ Détecte automatiquement la structure du projet
 * 
 * UTILISATION:
 * node build-generator-improved.js
 */

const fs = require('fs');
const path = require('path');

class ZNKBuildGenerator {
  constructor(projectPath = '.') {
    this.projectPath = path.resolve(projectPath);
    this.buildDir = path.join(this.projectPath, 'build-files');
    this.config = {
      name: 'ZNK237-APP',
      version: '1.0.0',
      author: 'ZNK Systems'
    };
    
    // Structure ZNK237
    this.znkStructure = {
      electronDir: 'electron',
      modulesDir: 'modules',
      modulesAdminDir: 'modules-admin',
      iconsDir: ['icons', 'assets/icons'],
      mainHTML: ['index.html', 'auth-hub.html', 'ZNKadminDash.html', 'ZNKMembresDash.html']
    };
  }

  /**
   * Génère tous les fichiers de build
   */
  async generate() {
    console.log('🚀 Génération des fichiers de build ZNK237...\n');

    // Créer le dossier build-files
    if (!fs.existsSync(this.buildDir)) {
      fs.mkdirSync(this.buildDir, { recursive: true });
    }

    // Analyser le projet selon mapping ZNK237
    await this.analyzeZNKProject();

    // Générer les fichiers
    this.generatePathAdapter();
    this.generatePreloadBuild();
    this.generateMainBuild();
    this.generatePackageBuild();
    this.generateBuildScripts();
    this.generateReadme();

    console.log('\n✅ Génération terminée !');
    console.log(`📁 Fichiers dans: ${this.buildDir}\n`);
    this.printInstructions();
  }

  /**
   * Analyser le projet selon la structure ZNK237
   */
  async analyzeZNKProject() {
    console.log('🔍 Analyse du projet ZNK237...');

    // Détecter dossier electron/
    const electronPath = path.join(this.projectPath, this.znkStructure.electronDir);
    if (fs.existsSync(electronPath)) {
      console.log(`  ✅ Trouvé: ${this.znkStructure.electronDir}/`);
      this.hasElectronDir = true;
      
      // Chercher main.js dans electron/
      const mainInElectron = path.join(electronPath, 'main.js');
      if (fs.existsSync(mainInElectron)) {
        console.log('  ✅ main.js dans electron/ (sera préservé)');
      }
    }

    // Détecter modules/
    const modulesPath = path.join(this.projectPath, this.znkStructure.modulesDir);
    if (fs.existsSync(modulesPath)) {
      const moduleFiles = fs.readdirSync(modulesPath).filter(f => f.endsWith('.html'));
      console.log(`  ✅ modules/ : ${moduleFiles.length} fichiers`);
    }

    // Détecter modules-admin/
    const modulesAdminPath = path.join(this.projectPath, this.znkStructure.modulesAdminDir);
    if (fs.existsSync(modulesAdminPath)) {
      const adminFiles = fs.readdirSync(modulesAdminPath).filter(f => f.endsWith('.html'));
      console.log(`  ✅ modules-admin/ : ${adminFiles.length} fichiers`);
    }

    // Détecter les dossiers icons
    this.detectedIcons = [];
    for (const iconsPath of this.znkStructure.iconsDir) {
      const fullPath = path.join(this.projectPath, iconsPath);
      if (fs.existsSync(fullPath)) {
        console.log(`  ✅ Trouvé: ${iconsPath}/`);
        this.detectedIcons.push(iconsPath);
      }
    }

    // Détecter package.json
    const pkgPath = path.join(this.projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      this.config.name = pkg.name || this.config.name;
      this.config.version = pkg.version || this.config.version;
      this.config.author = pkg.author || this.config.author;
      console.log(`  ✅ package.json détecté: ${this.config.name}`);
    }

    console.log('');
  }

  /**
   * Génère path-adapter.js adapté à ZNK237
   */
  generatePathAdapter() {
    console.log('📝 Génération de path-adapter.js...');

    const content = `/**
 * PATH-ADAPTER.JS - Généré automatiquement pour ZNK237-APP
 * Ne PAS modifier manuellement
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

class ZNKPathAdapter {
  constructor() {
    this.isDev = !app.isPackaged;
    this.basePath = this.getBasePath();
    this.cache = new Map();
    
    // Structure ZNK237
    this.iconsPaths = ${JSON.stringify(this.detectedIcons)};
    this.modulesPaths = ['modules', 'modules-admin'];
    
    console.log('🎯 ZNK Path Adapter: ' + (this.isDev ? 'DEV' : 'PROD'));
    console.log('📁 Base:', this.basePath);
  }
  
  getBasePath() {
    if (this.isDev) {
      return process.cwd();
    } else {
      // En production, les ressources sont dans app.asar ou app/
      return path.join(process.resourcesPath, 'app');
    }
  }
  
  resolveIcon(iconPath) {
    if (this.cache.has(iconPath)) {
      return this.cache.get(iconPath);
    }
    
    const cleanPath = iconPath.replace(/^\\/+/, '').replace(/\\\\/g, '/');
    const fileName = path.basename(cleanPath);
    
    const attempts = [
      path.join(this.basePath, cleanPath),
      ...this.iconsPaths.map(p => path.join(this.basePath, p, fileName))
    ];
    
    for (const attemptPath of attempts) {
      if (fs.existsSync(attemptPath)) {
        const resolved = 'file://' + attemptPath;
        this.cache.set(iconPath, resolved);
        return resolved;
      }
    }
    
    console.warn('⚠️  Icône non trouvée:', iconPath);
    return iconPath;
  }
  
  resolveModule(modulePath) {
    const cleanPath = modulePath.replace(/^\\/+/, '').replace(/\\\\/g, '/');
    
    const attempts = [
      path.join(this.basePath, cleanPath),
      ...this.modulesPaths.map(p => path.join(this.basePath, p, path.basename(cleanPath)))
    ];
    
    for (const attemptPath of attempts) {
      if (fs.existsSync(attemptPath)) {
        return attemptPath;
      }
    }
    
    return null;
  }
  
  loadManifest(manifestPath) {
    const resolved = this.resolveManifestPath(manifestPath);
    
    if (!resolved || !fs.existsSync(resolved)) {
      console.warn('⚠️  Manifest non trouvé:', manifestPath);
      return {};
    }
    
    try {
      const content = fs.readFileSync(resolved, 'utf-8');
      const manifest = JSON.parse(content);
      return this.adaptManifestPaths(manifest);
    } catch (error) {
      console.error('❌ Erreur manifest:', error.message);
      return {};
    }
  }
  
  resolveManifestPath(manifestPath) {
    const cleanPath = manifestPath.replace(/^\\/+/, '').replace(/\\\\/g, '/');
    
    const attempts = [
      path.join(this.basePath, cleanPath),
      ...this.iconsPaths.map(p => path.join(this.basePath, p, path.basename(cleanPath)))
    ];
    
    for (const attemptPath of attempts) {
      if (fs.existsSync(attemptPath)) {
        return attemptPath;
      }
    }
    
    return null;
  }
  
  adaptManifestPaths(manifest) {
    const adapted = JSON.parse(JSON.stringify(manifest));
    
    const adapt = (obj) => {
      for (const key in obj) {
        const value = obj[key];
        if (typeof value === 'string' && (value.endsWith('.svg') || value.endsWith('.png'))) {
          obj[key] = this.resolveIcon(value);
        } else if (typeof value === 'object' && value !== null) {
          adapt(value);
        }
      }
    };
    
    adapt(adapted);
    return adapted;
  }
  
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
          console.error('Erreur scan:', error.message);
        }
      }
    }
    
    return icons;
  }
  
  loadAllManifests() {
    const manifests = {};
    const manifestFiles = ['manifest-icon-b64.json', 'icons-intro-manifest.json'];
    
    for (const manifestFile of manifestFiles) {
      for (const iconsPath of this.iconsPaths) {
        const manifestPath = path.join(iconsPath, manifestFile);
        const manifest = this.loadManifest(manifestPath);
        
        if (Object.keys(manifest).length > 0) {
          const name = path.basename(manifestFile, '.json');
          manifests[name] = manifest;
        }
      }
    }
    
    return manifests;
  }
  
  checkIntegrity() {
    return {
      basePath: this.basePath,
      isDev: this.isDev,
      iconsPathsFound: this.iconsPaths.length,
      iconsScanned: this.scanIcons().length,
      modulesPaths: this.modulesPaths
    };
  }
}

module.exports = new ZNKPathAdapter();
`;

    fs.writeFileSync(path.join(this.buildDir, 'path-adapter.js'), content);
    console.log('  ✅ path-adapter.js créé\n');
  }

  /**
   * Génère preload-build.js
   */
  generatePreloadBuild() {
    console.log('📝 Génération de preload-build.js...');

    const content = `/**
 * PRELOAD-BUILD.JS - Généré automatiquement pour ZNK237-APP
 * Ne PAS modifier manuellement
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('znkAdapter', {
  resolveIcon: (iconPath) => ipcRenderer.invoke('znk-resolve-icon', iconPath),
  resolveModule: (modulePath) => ipcRenderer.invoke('znk-resolve-module', modulePath),
  loadManifest: (manifestPath) => ipcRenderer.invoke('znk-load-manifest', manifestPath),
  loadAllManifests: () => ipcRenderer.invoke('znk-load-all-manifests'),
  scanIcons: () => ipcRenderer.invoke('znk-scan-icons'),
  checkIntegrity: () => ipcRenderer.invoke('znk-check-integrity')
});

contextBridge.exposeInMainWorld('znkUtils', {
  getMode: () => ipcRenderer.invoke('znk-get-mode'),
  getSystemInfo: () => ipcRenderer.invoke('znk-get-system-info')
});

console.log('✅ ZNK Adapter disponible (preload-build)');
`;

    fs.writeFileSync(path.join(this.buildDir, 'preload-build.js'), content);
    console.log('  ✅ preload-build.js créé\n');
  }

  /**
   * Génère main-build.js
   */
  generateMainBuild() {
    console.log('📝 Génération de main-build.js...');

    const content = `/**
 * MAIN-BUILD.JS - Généré automatiquement pour ZNK237-APP
 * Fichier main.js pour le build avec adaptateur intégré
 * Ton main.js original (dans electron/) reste intact !
 */

const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Import adaptateur
const pathAdapter = require('./path-adapter');

let mainWindow;
const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const windowOptions = {
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-build.js')
    },
    show: false
  };

  mainWindow = new BrowserWindow(windowOptions);

  // Charger index.html ou fallback selon structure ZNK237
  const htmlFiles = [
    'index.html',
    'auth-hub.html',
    'inscription.html',
    'ZNKadminDash.html',
    'ZNKMembresDash.html',
    'ZNKartEtudesDash.html',
    'ZNKvisiteurDash.html'
  ];

  let loaded = false;
  for (const file of htmlFiles) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      mainWindow.loadFile(filePath);
      console.log(\`✅ Chargé: \${file}\`);
      loaded = true;
      break;
    }
  }

  if (!loaded) {
    console.error('❌ Aucun fichier HTML trouvé');
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  createMenu();
}

function setupIPCHandlers() {
  ipcMain.handle('znk-resolve-icon', async (event, iconPath) => {
    try {
      return pathAdapter.resolveIcon(iconPath);
    } catch (error) {
      console.error('Erreur resolve:', error);
      return iconPath;
    }
  });

  ipcMain.handle('znk-resolve-module', async (event, modulePath) => {
    try {
      return pathAdapter.resolveModule(modulePath);
    } catch (error) {
      console.error('Erreur resolve module:', error);
      return null;
    }
  });

  ipcMain.handle('znk-load-manifest', async (event, manifestPath) => {
    try {
      return pathAdapter.loadManifest(manifestPath);
    } catch (error) {
      console.error('Erreur manifest:', error);
      return {};
    }
  });

  ipcMain.handle('znk-load-all-manifests', async () => {
    try {
      return pathAdapter.loadAllManifests();
    } catch (error) {
      console.error('Erreur all manifests:', error);
      return {};
    }
  });

  ipcMain.handle('znk-scan-icons', async () => {
    try {
      return pathAdapter.scanIcons();
    } catch (error) {
      console.error('Erreur scan:', error);
      return [];
    }
  });

  ipcMain.handle('znk-check-integrity', async () => {
    try {
      return pathAdapter.checkIntegrity();
    } catch (error) {
      return { error: error.message };
    }
  });

  ipcMain.handle('znk-get-mode', async () => {
    return { isDev, isPackaged: app.isPackaged };
  });

  ipcMain.handle('znk-get-system-info', async () => {
    return {
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron
    };
  });

  console.log('✅ IPC Handlers configurés');
}

function createMenu() {
  const template = [
    {
      label: '${this.config.name}',
      submenu: [
        { role: 'quit', label: 'Quitter' }
      ]
    },
    {
      label: 'Édition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Refaire' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' }
      ]
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'reload', label: 'Actualiser' },
        { role: 'toggleDevTools', label: 'Dev Tools' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  setupIPCHandlers();
  createWindow();
  console.log('🚀 ${this.config.name} démarré avec adaptateur');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
`;

    fs.writeFileSync(path.join(this.buildDir, 'main-build.js'), content);
    console.log('  ✅ main-build.js créé\n');
  }

  /**
   * Génère package-build.json avec SÉPARATION des builds
   */
  generatePackageBuild() {
    console.log('📝 Génération de package-build.json...');

    const pkg = {
      name: this.config.name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      version: this.config.version,
      description: `${this.config.name} - Build avec adaptateur`,
      main: "main-build.js",
      author: this.config.author,
      license: "MIT",
      scripts: {
        "start": "electron .",
        "build-mac": "electron-builder --mac",
        "build-win": "electron-builder --win",
        "build-all": "electron-builder --mac --win"
      },
      devDependencies: {
        "electron": "^27.0.0",
        "electron-builder": "^24.6.4"
      },
      build: {
        appId: `com.znk.${this.config.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        productName: this.config.name,
        directories: {
          output: "dist/${platform}"  // ✅ SÉPARATION PAR PLATEFORME
        },
        files: [
          "**/*",
          "!node_modules",
          "!dist",
          "!build-files",
          "!electron/main.js",
          "main-build.js",
          "path-adapter.js",
          "preload-build.js"
        ],
        extraFiles: [
          {
            from: "icons",
            to: "icons",
            filter: ["**/*"]
          },
          {
            from: "assets/icons",
            to: "assets/icons",
            filter: ["**/*"]
          },
          {
            from: "modules",
            to: "modules",
            filter: ["**/*"]
          },
          {
            from: "modules-admin",
            to: "modules-admin",
            filter: ["**/*"]
          }
        ],
        mac: {
          target: ["dmg"],
          category: "public.app-category.productivity",
          artifactName: "${productName}-${version}-mac.${ext}"
        },
        win: {
          target: ["nsis"],
          artifactName: "${productName}-${version}-win.${ext}"
        }
      }
    };

    fs.writeFileSync(
      path.join(this.buildDir, 'package-build.json'),
      JSON.stringify(pkg, null, 2)
    );
    console.log('  ✅ package-build.json créé\n');
  }

  /**
   * Génère les scripts de build (Mac + Windows séparés)
   */
  generateBuildScripts() {
    console.log('📝 Génération des scripts de build...');

    // Script Mac
    const macScript = `#!/bin/bash
# Script de build MAC pour ZNK237-APP

echo "🍎 Build Mac avec adaptateur..."

# Copier les fichiers de build
cp build-files/path-adapter.js ./
cp build-files/preload-build.js ./
cp build-files/main-build.js ./

# Sauvegarder package.json original
if [ -f "package.json" ]; then
    cp package.json package-original.json
    echo "✅ package.json original sauvegardé"
fi

# Utiliser package-build.json
cp build-files/package-build.json package.json

# Build Mac uniquement
echo "🔨 Build Mac en cours..."
npm run build-mac

# Restaurer package.json
if [ -f "package-original.json" ]; then
    mv package-original.json package.json
    echo "✅ package.json restauré"
fi

# Nettoyer
rm -f path-adapter.js preload-build.js main-build.js

echo "✅ Build Mac terminé dans dist/mac/"
`;

    // Script Windows
    const winScript = `#!/bin/bash
# Script de build WINDOWS pour ZNK237-APP

echo "🪟 Build Windows avec adaptateur..."

# Copier les fichiers de build
cp build-files/path-adapter.js ./
cp build-files/preload-build.js ./
cp build-files/main-build.js ./

# Sauvegarder package.json original
if [ -f "package.json" ]; then
    cp package.json package-original.json
    echo "✅ package.json original sauvegardé"
fi

# Utiliser package-build.json
cp build-files/package-build.json package.json

# Build Windows uniquement
echo "🔨 Build Windows en cours..."
npm run build-win

# Restaurer package.json
if [ -f "package-original.json" ]; then
    mv package-original.json package.json
    echo "✅ package.json restauré"
fi

# Nettoyer
rm -f path-adapter.js preload-build.js main-build.js

echo "✅ Build Windows terminé dans dist/win/"
`;

    // Script All (les deux)
    const allScript = `#!/bin/bash
# Script de build MAC + WINDOWS pour ZNK237-APP

echo "🌍 Build Mac + Windows avec adaptateur..."

# Copier les fichiers de build
cp build-files/path-adapter.js ./
cp build-files/preload-build.js ./
cp build-files/main-build.js ./

# Sauvegarder package.json original
if [ -f "package.json" ]; then
    cp package.json package-original.json
    echo "✅ package.json original sauvegardé"
fi

# Utiliser package-build.json
cp build-files/package-build.json package.json

# Build des deux plateformes
echo "🔨 Build Mac + Windows en cours..."
npm run build-all

# Restaurer package.json
if [ -f "package-original.json" ]; then
    mv package-original.json package.json
    echo "✅ package.json restauré"
fi

# Nettoyer
rm -f path-adapter.js preload-build.js main-build.js

echo "✅ Builds terminés:"
echo "   📁 dist/mac/"
echo "   📁 dist/win/"
`;

    // Écrire les scripts
    fs.writeFileSync(path.join(this.buildDir, 'build-mac.sh'), macScript);
    fs.writeFileSync(path.join(this.buildDir, 'build-win.sh'), winScript);
    fs.writeFileSync(path.join(this.buildDir, 'build-all.sh'), allScript);

    // Rendre exécutables
    fs.chmodSync(path.join(this.buildDir, 'build-mac.sh'), '755');
    fs.chmodSync(path.join(this.buildDir, 'build-win.sh'), '755');
    fs.chmodSync(path.join(this.buildDir, 'build-all.sh'), '755');

    console.log('  ✅ build-mac.sh créé');
    console.log('  ✅ build-win.sh créé');
    console.log('  ✅ build-all.sh créé\n');
  }

  /**
   * Génère README
   */
  generateReadme() {
    console.log('📝 Génération de README...');

    const content = `# Instructions de Build ZNK237-APP

## 🎯 Fichiers Générés

Tous les fichiers sont dans \`build-files/\`:
- \`path-adapter.js\` - Adaptateur de chemins ZNK237
- \`preload-build.js\` - Preload pour le build
- \`main-build.js\` - Main.js pour le build
- \`package-build.json\` - Package.json pour le build
- \`build-mac.sh\` - Build Mac uniquement
- \`build-win.sh\` - Build Windows uniquement
- \`build-all.sh\` - Build Mac + Windows

## 🚀 Utilisation

### Build Mac uniquement

\`\`\`bash
cd build-files
./build-mac.sh
\`\`\`

Résultat: \`dist/mac/\`

### Build Windows uniquement

\`\`\`bash
cd build-files
./build-win.sh
\`\`\`

Résultat: \`dist/win/\`

### Build Mac + Windows

\`\`\`bash
cd build-files
./build-all.sh
\`\`\`

Résultats:
- \`dist/mac/\`
- \`dist/win/\`

## ✅ Avantages

- ✅ Ton main.js original (electron/main.js) reste intact
- ✅ Les builds sont séparés (dist/mac et dist/win)
- ✅ **Les builds existants ne sont PLUS écrasés**
- ✅ Adaptateur automatique pour structure ZNK237
- ✅ Support modules/ et modules-admin/
- ✅ Support icons/ et assets/icons/

## 📁 Structure après build

\`\`\`
ZNK237-APP/
├── electron/
│   └── main.js           ← TON ORIGINAL (intact)
├── modules/              ← Inclus dans le build
├── modules-admin/        ← Inclus dans le build
├── icons/                ← Inclus dans le build
├── assets/icons/         ← Inclus dans le build
├── build-files/          ← Fichiers générés
└── dist/
    ├── mac/              ← Build Mac (préservé)
    └── win/              ← Build Windows (préservé)
\`\`\`

## 🔧 Commandes npm

Dans package-build.json:
- \`npm run start\` - Lancer l'app en dev
- \`npm run build-mac\` - Build Mac
- \`npm run build-win\` - Build Windows
- \`npm run build-all\` - Build tout

---

Généré automatiquement - ${new Date().toISOString()}
`;

    fs.writeFileSync(path.join(this.buildDir, 'README.md'), content);
    console.log('  ✅ README.md créé\n');
  }

  /**
   * Affiche les instructions
   */
  printInstructions() {
    console.log('═'.repeat(60));
    console.log('📋 INSTRUCTIONS');
    console.log('═'.repeat(60));
    console.log('');
    console.log('Tes fichiers originaux sont INTACTS:');
    console.log('  ✅ electron/main.js - Ton original');
    console.log('  ✅ package.json - Ton original');
    console.log('');
    console.log('Pour builder:');
    console.log('');
    console.log('  Mac seulement:');
    console.log('    cd build-files && ./build-mac.sh');
    console.log('    → dist/mac/');
    console.log('');
    console.log('  Windows seulement:');
    console.log('    cd build-files && ./build-win.sh');
    console.log('    → dist/win/');
    console.log('');
    console.log('  Mac + Windows:');
    console.log('    cd build-files && ./build-all.sh');
    console.log('    → dist/mac/ + dist/win/');
    console.log('');
    console.log('🎉 NOUVEAU: Les builds sont séparés !');
    console.log('  - Build Mac ne touche pas dist/win/');
    console.log('  - Build Windows ne touche pas dist/mac/');
    console.log('  - Les builds existants sont préservés');
    console.log('');
    console.log('═'.repeat(60));
    