/**
 * MAIN.JS
 * Main process avec adaptateur d'icônes intégré
 */

const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Import de l'adaptateur
const iconAdapter = require('./znk-icon-adapter');

let mainWindow;
const isDev = process.env.NODE_ENV === 'development';

/**
 * Créer la fenêtre principale
 */
function createWindow() {
  const windowOptions = {
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false,
    backgroundColor: '#1a1a1a'
  };

  mainWindow = new BrowserWindow(windowOptions);

  // Charger le fichier HTML principal
  const htmlFiles = [
    'auth-hub.html',
    'index.html',
    'ZNKadminDash.html',
    'ZNKMembresDash.html'
  ];

  let loaded = false;
  for (const file of htmlFiles) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      mainWindow.loadFile(filePath);
      console.log(`✅ Chargé: ${file}`);
      loaded = true;
      break;
    }
  }

  if (!loaded) {
    console.error('❌ Aucun fichier HTML trouvé');
  }

  // Afficher quand prêt
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
    
    // Debug de l'adaptateur
    console.log('\n🎯 Vérification de l\'adaptateur d\'icônes...');
    iconAdapter.debug();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  createMenu();
}

/**
 * Configurer les IPC handlers pour l'adaptateur
 */
function setupIconAdapterHandlers() {
  // Résoudre une icône
  ipcMain.handle('znk-icon-resolve', async (event, iconName) => {
    try {
      return iconAdapter.resolveIcon(iconName);
    } catch (error) {
      console.error('Erreur resolve icon:', error);
      return null;
    }
  });

  // Obtenir toutes les icônes
  ipcMain.handle('znk-icon-get-all', async () => {
    try {
      return iconAdapter.getAllIcons();
    } catch (error) {
      console.error('Erreur get all icons:', error);
      return [];
    }
  });

  // Charger le manifest intro
  ipcMain.handle('znk-icon-load-intro', async () => {
    try {
      return iconAdapter.loadIntroManifest();
    } catch (error) {
      console.error('Erreur load intro manifest:', error);
      return {};
    }
  });

  // Obtenir le mode
  ipcMain.handle('znk-icon-get-mode', async () => {
    return {
      mode: iconAdapter.mode,
      isDev: iconAdapter.isDev,
      config: iconAdapter.config
    };
  });

  // Vérifier l'intégrité
  ipcMain.handle('znk-icon-check-integrity', async () => {
    try {
      return iconAdapter.checkIntegrity();
    } catch (error) {
      return { error: error.message };
    }
  });

  // Debug
  ipcMain.handle('znk-icon-debug', async () => {
    return iconAdapter.debug();
  });

  // Info app
  ipcMain.handle('znk-get-app-info', async () => {
    return {
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      isDev: isDev,
      isPackaged: app.isPackaged
    };
  });

  // Log
  ipcMain.handle('znk-log', async (event, message) => {
    console.log(`[RENDERER] ${message}`);
  });

  console.log('✅ Icon Adapter IPC handlers configurés');
}

/**
 * Créer le menu
 */
function createMenu() {
  const template = [
    {
      label: 'ZNK237-APP',
      submenu: [
        { role: 'about', label: 'À propos' },
        { type: 'separator' },
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
        { role: 'forceReload', label: 'Forcer actualisation' },
        { role: 'toggleDevTools', label: 'Outils développeur' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom normal' },
        { role: 'zoomIn', label: 'Zoom +' },
        { role: 'zoomOut', label: 'Zoom -' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' }
      ]
    }
  ];

  if (isDev) {
    template.push({
      label: 'Debug',
      submenu: [
        {
          label: 'Vérifier adaptateur',
          click: () => {
            iconAdapter.debug();
          }
        },
        {
          label: 'Lister icônes',
          click: async () => {
            const icons = iconAdapter.getAllIcons();
            console.log('📦 Icônes disponibles:', icons.length);
            icons.forEach(icon => console.log(`  - ${icon.name}`));
          }
        }
      ]
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * Initialisation
 */
app.whenReady().then(() => {
  setupIconAdapterHandlers();
  createWindow();
  
  console.log('🚀 ZNK237-APP démarré avec Icon Adapter');
  console.log(`📁 Mode: ${iconAdapter.mode}`);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});