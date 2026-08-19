// À ajouter dans votre fichier main.js / electron.js

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        }
    });

    // Charger l'intro ou auth-hub
    mainWindow.loadFile('index.html');
}

// Handler de navigation entre modules (depuis auth-hub et auto-nav)
ipcMain.on('navigate-to-module', (event, moduleName) => {
    console.log('📡 IPC: Navigation demandée vers', moduleName);
    handleNavigation(event, moduleName);
});

// Handler alternatif pour compatibilité
ipcMain.on('navigate-to', (event, moduleName) => {
    console.log('📡 IPC: Navigation (navigate-to) vers', moduleName);
    handleNavigation(event, moduleName);
});

// Fonction centralisée de gestion de navigation
function handleNavigation(event, moduleName) {
    
    // Liste des chemins possibles
    const possiblePaths = [
        moduleName,
        path.join(__dirname, moduleName),
        path.join(__dirname, 'pages', moduleName),
        path.join(__dirname, 'views', moduleName),
        path.join(__dirname, 'src', moduleName)
    ];
    
    let fileFound = false;
    let validPath = null;
    
    // Chercher le fichier
    for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
            validPath = testPath;
            fileFound = true;
            console.log('✅ Fichier trouvé:', validPath);
            break;
        }
    }
    
    if (fileFound) {
        mainWindow.loadFile(validPath)
            .then(() => {
                console.log('✅ Navigation réussie vers', moduleName);
                event.reply('navigation-success', { 
                    module: moduleName, 
                    path: validPath 
                });
            })
            .catch((error) => {
                console.error('❌ Erreur chargement:', error);
                event.reply('navigation-error', { 
                    file: moduleName, 
                    error: error.message 
                });
            });
    } else {
        console.error('❌ Fichier non trouvé:', moduleName);
        console.log('🔍 Chemins testés:', possiblePaths);
        
        event.reply('module-not-found', { 
            module: moduleName,
            searchedPaths: possiblePaths
        });
        
        // Retour automatique à l'intro après 2 secondes
        setTimeout(() => {
            mainWindow.loadFile('index.html').catch(err => {
                console.error('❌ Impossible de charger index.html:', err);
            });
        }, 2000);
    }
});

// Handler pour auth-screen-ready
ipcMain.on('auth-screen-ready', (event) => {
    console.log('🔐 Auth screen prêt');
});

app.whenReady().then(createWindow);

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

// Log pour débugger la structure des fichiers
console.log('📂 Répertoire de l\'app:', __dirname);
console.log('📂 Fichiers disponibles:', fs.readdirSync(__dirname));
