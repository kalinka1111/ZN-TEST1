const { app, BrowserWindow, ipcMain } = require('electron');
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
  const htmlFiles = ["Photo-Sculpt.html","ZNKMembresDash.html","ZNKStudiosDash copie.html","ZNKStudiosDash.html","ZNKUserDash.html","ZNKadminDash.html","ZNKartEtudesDash.html","ZNKmembresdashoriginal.html","ZNKvisiteurDash.html","auth-hub.html","index.html","index1.html","infos-user.html","inscription.html","parametres.html","quizz programmeur.html","user-selection.html","znk-visual-navigator.html"];
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
