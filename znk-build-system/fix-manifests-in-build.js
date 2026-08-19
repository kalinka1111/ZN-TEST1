/**
 * FIX MANIFESTS IN BUILD
 * Corrige le chargement des manifests et icônes en DEV et BUILD
 */

const fs = require('fs');
const path = require('path');

class ManifestFixer {
  constructor() {
    this.root = process.cwd();
  }

  fix() {
    console.log('🔧 CORRECTION DES MANIFESTS\n');
    console.log('═'.repeat(70));
    console.log('Problème: Les manifests marchent en DEV mais pas en BUILD');
    console.log('Solution: Path adapter qui gère DEV et PROD\n');
    console.log('═'.repeat(70));
    console.log('');

    // 1. Créer le path adapter avancé
    this.createAdvancedPathAdapter();

    // 2. Mettre à jour main.js
    this.updateMainJs();

    // 3. Mettre à jour preload.js
    this.updatePreloadJs();

    // 4. Mettre à jour package.json pour inclure les manifests
    this.updatePackageJson();

    // 5. Créer un fichier de test
    this.createTestManifest();

    this.printInstructions();
  }

  createAdvancedPathAdapter() {
    console.log('📝 Création du path-adapter avancé...\n');

    const content = `/**
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
`;

    const adapterPath = path.join(this.root, 'electron/path-adapter.js');
    
    // Backup si existe
    if (fs.existsSync(adapterPath)) {
      fs.writeFileSync(
        adapterPath + '.backup-' + Date.now(),
        fs.readFileSync(adapterPath)
      );
    }

    fs.writeFileSync(adapterPath, content);
    console.log('   ✅ electron/path-adapter.js créé\n');
  }

  updateMainJs() {
    console.log('🔧 Mise à jour de electron/main.js...\n');

    const mainPath = path.join(this.root, 'electron/main.js');
    
    if (!fs.existsSync(mainPath)) {
      console.log('   ❌ main.js non trouvé\n');
      return;
    }

    let content = fs.readFileSync(mainPath, 'utf-8');

    // Backup
    fs.writeFileSync(
      mainPath + '.backup-' + Date.now(),
      content
    );

    // Ajouter l'import du path adapter si pas déjà présent
    if (!content.includes('path-adapter')) {
      const importLine = "const pathAdapter = require('./path-adapter');\n";
      
      // Ajouter après les autres requires
      const lastRequire = content.lastIndexOf('require(');
      if (lastRequire !== -1) {
        const endOfLine = content.indexOf('\n', lastRequire);
        content = content.slice(0, endOfLine + 1) + importLine + content.slice(endOfLine + 1);
      } else {
        content = importLine + content;
      }

      console.log('   ✅ Import path-adapter ajouté');
    } else {
      console.log('   ✅ Import path-adapter déjà présent');
    }

    // Ajouter les IPC handlers si pas déjà présents
    if (!content.includes('znk-load-manifest')) {
      const ipcHandlers = `

// IPC Handlers pour manifests et icônes
ipcMain.handle('znk-resolve-icon', async (event, iconPath) => {
  return pathAdapter.resolveIcon(iconPath);
});

ipcMain.handle('znk-load-manifest', async (event, manifestName) => {
  return pathAdapter.loadManifest(manifestName);
});

ipcMain.handle('znk-load-all-manifests', async () => {
  return pathAdapter.loadAllManifests();
});

ipcMain.handle('znk-scan-icons', async () => {
  return pathAdapter.scanIcons();
});

ipcMain.handle('znk-check-integrity', async () => {
  return pathAdapter.checkIntegrity();
});
`;

      // Ajouter avant app.whenReady()
      const whenReadyIndex = content.indexOf('app.whenReady()');
      if (whenReadyIndex !== -1) {
        content = content.slice(0, whenReadyIndex) + ipcHandlers + '\n' + content.slice(whenReadyIndex);
        console.log('   ✅ IPC handlers ajoutés');
      }
    } else {
      console.log('   ✅ IPC handlers déjà présents');
    }

    fs.writeFileSync(mainPath, content);
    console.log('   ✅ main.js mis à jour\n');
  }

  updatePreloadJs() {
    console.log('🔧 Mise à jour de electron/preload.js...\n');

    const preloadPath = path.join(this.root, 'electron/preload.js');
    
    if (!fs.existsSync(preloadPath)) {
      console.log('   ⚠️  preload.js non trouvé, création...\n');
      this.createPreloadJs();
      return;
    }

    let content = fs.readFileSync(preloadPath, 'utf-8');

    // Backup
    fs.writeFileSync(
      preloadPath + '.backup-' + Date.now(),
      content
    );

    // Vérifier si l'API znkAdapter existe déjà
    if (!content.includes('znkAdapter')) {
      const apiCode = `

// API pour charger manifests et icônes
contextBridge.exposeInMainWorld('znkAdapter', {
  resolveIcon: (iconPath) => ipcRenderer.invoke('znk-resolve-icon', iconPath),
  loadManifest: (manifestName) => ipcRenderer.invoke('znk-load-manifest', manifestName),
  loadAllManifests: () => ipcRenderer.invoke('znk-load-all-manifests'),
  scanIcons: () => ipcRenderer.invoke('znk-scan-icons'),
  checkIntegrity: () => ipcRenderer.invoke('znk-check-integrity')
});

console.log('✅ ZNK Adapter disponible dans window.znkAdapter');
`;

      content += apiCode;
      console.log('   ✅ API znkAdapter ajoutée');
    } else {
      console.log('   ✅ API znkAdapter déjà présente');
    }

    fs.writeFileSync(preloadPath, content);
    console.log('   ✅ preload.js mis à jour\n');
  }

  createPreloadJs() {
    const content = `const { contextBridge, ipcRenderer } = require('electron');

// API pour charger manifests et icônes
contextBridge.exposeInMainWorld('znkAdapter', {
  resolveIcon: (iconPath) => ipcRenderer.invoke('znk-resolve-icon', iconPath),
  loadManifest: (manifestName) => ipcRenderer.invoke('znk-load-manifest', manifestName),
  loadAllManifests: () => ipcRenderer.invoke('znk-load-all-manifests'),
  scanIcons: () => ipcRenderer.invoke('znk-scan-icons'),
  checkIntegrity: () => ipcRenderer.invoke('znk-check-integrity')
});

console.log('✅ ZNK Adapter disponible dans window.znkAdapter');
`;

    fs.writeFileSync(
      path.join(this.root, 'electron/preload.js'),
      content
    );
    console.log('   ✅ preload.js créé\n');
  }

  updatePackageJson() {
    console.log('🔧 Mise à jour de electron/package.json...\n');

    const pkgPath = path.join(this.root, 'electron/package.json');
    
    if (!fs.existsSync(pkgPath)) {
      console.log('   ⚠️  package.json non trouvé\n');
      return;
    }

    let pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    // Backup
    fs.writeFileSync(
      pkgPath + '.backup-' + Date.now(),
      JSON.stringify(pkg, null, 2)
    );

    // Assurer que les manifests et icônes sont inclus dans le build
    if (!pkg.build) pkg.build = {};
    if (!pkg.build.files) pkg.build.files = [];
    if (!pkg.build.extraResources) pkg.build.extraResources = [];

    // Fichiers à inclure
    const requiredFiles = [
      'path-adapter.js',
      '../index.html',
      '../icons/**/*',
      '../assets/**/*',
      '../modules/**/*',
      '../modules-admin/**/*'
    ];

    let modified = false;

    requiredFiles.forEach(file => {
      if (!pkg.build.files.includes(file)) {
        pkg.build.files.push(file);
        modified = true;
      }
    });

    // Extra resources pour les manifests
    const extraResources = [
      { from: '../icons', to: 'icons', filter: ['**/*'] },
      { from: '../assets', to: 'assets', filter: ['**/*'] }
    ];

    extraResources.forEach(resource => {
      const exists = pkg.build.extraResources.some(r => r.from === resource.from);
      if (!exists) {
        pkg.build.extraResources.push(resource);
        modified = true;
      }
    });

    if (modified) {
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
      console.log('   ✅ package.json mis à jour');
      console.log('   📦 Manifests et icônes inclus dans le build\n');
    } else {
      console.log('   ✅ package.json déjà configuré\n');
    }
  }

  createTestManifest() {
    console.log('📝 Création du fichier de test...\n');

    const testHtml = `<!DOCTYPE html>
<html>
<head>
    <title>Test Manifests ZNK237</title>
    <style>
        body {
            font-family: system-ui;
            padding: 20px;
            background: #1a1a1a;
            color: #fff;
        }
        .section {
            background: #2a2a2a;
            padding: 20px;
            margin: 20px 0;
            border-radius: 8px;
        }
        .icon {
            width: 48px;
            height: 48px;
            margin: 5px;
        }
        button {
            background: #0066cc;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            margin: 5px;
        }
        button:hover {
            background: #0052a3;
        }
        pre {
            background: #1a1a1a;
            padding: 10px;
            border-radius: 4px;
            overflow-x: auto;
        }
    </style>
</head>
<body>
    <h1>🧪 Test Manifests ZNK237</h1>

    <div class="section">
        <h2>📊 Intégrité</h2>
        <button onclick="checkIntegrity()">Vérifier</button>
        <pre id="integrity"></pre>
    </div>

    <div class="section">
        <h2>📚 Charger Manifests</h2>
        <button onclick="loadManifest('manifest-icon-b64.json')">manifest-icon-b64</button>
        <button onclick="loadManifest('icons-intro-manifest.json')">icons-intro-manifest</button>
        <button onclick="loadAllManifests()">Tous les manifests</button>
        <pre id="manifests"></pre>
    </div>

    <div class="section">
        <h2>🎨 Icônes</h2>
        <button onclick="scanIcons()">Scanner</button>
        <div id="icons"></div>
    </div>

    <script>
        async function checkIntegrity() {
            const result = await window.znkAdapter.checkIntegrity();
            document.getElementById('integrity').textContent = JSON.stringify(result, null, 2);
        }

        async function loadManifest(name) {
            const result = await window.znkAdapter.loadManifest(name);
            document.getElementById('manifests').textContent = JSON.stringify(result, null, 2);
        }

        async function loadAllManifests() {
            const result = await window.znkAdapter.loadAllManifests();
            document.getElementById('manifests').textContent = JSON.stringify(result, null, 2);
        }

        async function scanIcons() {
            const icons = await window.znkAdapter.scanIcons();
            const div = document.getElementById('icons');
            div.innerHTML = '<p>Trouvées: ' + icons.length + ' icônes</p>';
            
            icons.slice(0, 20).forEach(icon => {
                const img = document.createElement('img');
                img.src = icon.resolved;
                img.className = 'icon';
                img.title = icon.name;
                div.appendChild(img);
            });
        }

        // Test automatique au chargement
        window.addEventListener('load', () => {
            console.log('🧪 Page de test chargée');
            checkIntegrity();
        });
    </script>
</body>
</html>`;

    fs.writeFileSync(
      path.join(this.root, 'test-manifests.html'),
      testHtml
    );

    console.log('   ✅ test-manifests.html créé\n');
  }

  printInstructions() {
    console.log('═'.repeat(70));
    console.log('✅ CORRECTION TERMINÉE\n');
    console.log('═'.repeat(70));
    console.log('');
    console.log('🧪 TESTER EN DEV:\n');
    console.log('   1. cd electron && npm start');
    console.log('   2. Ouvre test-manifests.html dans l\'app');
    console.log('   3. Vérifie que les manifests se chargent\n');
    console.log('📦 BUILDER:\n');
    console.log('   cd electron');
    console.log('   npm run build-mac    (Mac)');
    console.log('   npm run build-win    (Windows)\n');
    console.log('🎯 CE QUI A ÉTÉ CORRIGÉ:\n');
    console.log('   ✅ Path adapter pour DEV et PROD');
    console.log('   ✅ Chargement automatique des manifests');
    console.log('   ✅ Résolution des chemins d\'icônes');
    console.log('   ✅ IPC handlers pour renderer');
    console.log('   ✅ Manifests inclus dans le build\n');
    console.log('💡 UTILISATION DANS TON CODE:\n');
    console.log('   // Charger un manifest');
    console.log('   const manifest = await window.znkAdapter.loadManifest("manifest-icon-b64.json");');
    console.log('');
    console.log('   // Charger tous les manifests');
    console.log('   const all = await window.znkAdapter.loadAllManifests();');
    console.log('');
    console.log('   // Les chemins sont déjà résolus !');
    console.log('   console.log(manifest.monIcone); // → file:///chemin/absolu/icon.svg\n');
    console.log('═'.repeat(70));
  }
}

// Exécution
if (require.main === module) {
  const fixer = new ManifestFixer();
  fixer.fix();
}

module.exports = ManifestFixer;