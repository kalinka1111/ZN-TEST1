// ==========================================
// ZNK - Electron Main Process
// ==========================================

const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

// ==========================================
// GESTION DES CHEMINS
// ==========================================

function getAppRoot() {
  if (app.isPackaged) {
    // Mode production : extraResources/app
    const prodPath = path.join(process.resourcesPath, 'app');
    console.log('✅ Mode PRODUCTION');
    console.log('   APP_ROOT:', prodPath);
    return prodPath;
  }
  
  // Mode dev : parent du dossier electron
  const devPath = path.join(__dirname, '..');
  console.log('✅ Mode DÉVELOPPEMENT');
  console.log('   APP_ROOT:', devPath);
  return devPath;
}

const APP_ROOT = getAppRoot();
const SERVER_PATH = path.join(APP_ROOT, 'server', 'server.js');

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🚀 ZNK APPLICATION');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📂 APP_ROOT:', APP_ROOT);
console.log('🖥️  SERVER_PATH:', SERVER_PATH);
console.log('🖥️  Platform:', process.platform);
console.log('⚡ Electron:', process.versions.electron);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

// ==========================================
// DÉMARRAGE DU SERVEUR NODE.JS
// ==========================================

function startServer() {
  return new Promise((resolve, reject) => {
    console.log('🚀 Démarrage du serveur Node.js...');
    
    const nodePath = process.platform === 'win32' 
      ? 'node.exe' 
      : 'node';
    
    serverProcess = spawn(nodePath, [SERVER_PATH], {
      cwd: path.join(APP_ROOT, 'server'),
      env: { 
        ...process.env,
        APP_ROOT: APP_ROOT,
        PORT: '3000',
        NODE_ENV: 'production',
        ELECTRON_PACKAGED: app.isPackaged ? 'true' : 'false'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let serverReady = false;

    // Logs serveur
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[SERVER] ${output.trim()}`);
      
      // Détecter quand le serveur est prêt
      if (output.includes('Serveur prêt') || 
          output.includes('listening') || 
          output.includes('ZNK UNIFIED SERVER')) {
        if (!serverReady) {
          serverReady = true;
          console.log('✅ Serveur Node.js prêt');
          resolve();
        }
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`[SERVER ERROR] ${data.toString().trim()}`);
    });

    serverProcess.on('error', (error) => {
      console.error('❌ Erreur démarrage serveur:', error);
      reject(error);
    });

    serverProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`❌ Serveur arrêté avec code: ${code}`);
      }
    });

    // Timeout de sécurité (3 secondes)
    setTimeout(() => {
      if (!serverReady) {
        console.log('⏱️  Timeout - Tentative de connexion...');
        resolve();
      }
    }, 3000);
  });
}

// ==========================================
// CRÉATION DE LA FENÊTRE PRINCIPALE
// ==========================================

function createWindow() {
  console.log('🪟 Création de la fenêtre principale...');
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    backgroundColor: '#1a1a2e',
    titleBarStyle: 'default',
    show: false,
    icon: path.join(APP_ROOT, 'icons', 'icon.png')
  });

  // Charger depuis le serveur local (IMPORTANT: pas file://)
  const url = 'http://localhost:3000/index.html';
  console.log('🌐 Chargement URL:', url);
  
  mainWindow.loadURL(url);

  // Afficher quand prêt (évite flash blanc)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    console.log('✅ Fenêtre affichée');
  });

  // Gestion erreurs de chargement
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('❌ Erreur chargement page:', errorCode, errorDescription);
    
    // Réessayer après 1 seconde
    setTimeout(() => {
      console.log('🔄 Nouvelle tentative de chargement...');
      mainWindow.loadURL(url);
    }, 1000);
  });

  // Dev tools en mode développement uniquement
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
    console.log('🛠️  DevTools activés (mode dev)');
  }

  // Logs console web dans la console Electron
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (!app.isPackaged) {
      console.log(`[WEB] ${message}`);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    console.log('🪟 Fenêtre fermée');
  });
}

// ==========================================
// INITIALISATION DE L'APPLICATION
// ==========================================

app.whenReady().then(async () => {
  console.log('⚡ App Electron prête');
  
  try {
    // 1. Démarrer le serveur
    await startServer();
    console.log('');
    
    // 2. Attendre que le serveur soit vraiment prêt
    console.log('⏳ Attente serveur (1s)...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 3. Créer la fenêtre
    createWindow();
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ ZNK DÉMARRÉ AVEC SUCCÈS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
  } catch (error) {
    console.error('❌ Erreur initialisation:', error);
    app.quit();
  }
});

// ==========================================
// GESTION MULTI-FENÊTRES (macOS)
// ==========================================

app.on('activate', () => {
  // Sur macOS, recréer une fenêtre si cliqué sur icône dock
  if (BrowserWindow.getAllWindows().length === 0) {
    console.log('🔄 Réactivation app (macOS)');
    createWindow();
  }
});

// ==========================================
// FERMETURE DE L'APPLICATION
// ==========================================

app.on('window-all-closed', () => {
  // Sur macOS, les apps restent actives même sans fenêtre
  if (process.platform !== 'darwin') {
    console.log('🛑 Toutes les fenêtres fermées - Fermeture app');
    app.quit();
  }
});

app.on('before-quit', () => {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🛑 ARRÊT DE ZNK');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (serverProcess) {
    console.log('🛑 Arrêt du serveur Node.js...');
    serverProcess.kill('SIGTERM');
    
    // Force kill si pas arrêté après 2s
    setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        console.log('⚠️  Force kill du serveur');
        serverProcess.kill('SIGKILL');
      }
    }, 2000);
  }
  
  console.log('👋 Au revoir !');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
});

// ==========================================
// GESTION DES ERREURS NON CAPTURÉES
// ==========================================

process.on('uncaughtException', (error) => {
  console.error('❌ ERREUR NON CAPTURÉE:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ PROMESSE REJETÉE:', reason);
});