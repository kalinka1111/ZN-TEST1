const { actvSync } = require('./actv-sync-system');

// Au démarrage de l'app
app.whenReady().then(async () => {
    await actvSync.initialize();
    createWindow();
});

// Quand l'utilisateur se connecte ET a un abonnement
async function onUserLoggedIn(user) {
    if (user.subscription?.status === 'active') {
        // Démarrer la sync auto
        actvSync.startAutoSync(user.token, 5); // 5 min
    }
}
const { app, protocol, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const videoPathResolver = require('./videoPathResolver');

// Enregistrer le protocole custom AVANT app.ready
app.whenReady().then(() => {
    // Protocole pour servir les vidéos persistantes
    protocol.registerFileProtocol('app-video', (request, callback) => {
        const url = request.url.replace('app-video://', '');
        const [type, ...filenameParts] = url.split('/');
        const filename = filenameParts.join('/');
        
        if (type === 'persistent') {
            const videoPath = videoPathResolver.getPhysicalPath(filename);
            
            if (fs.existsSync(videoPath)) {
                callback({ path: videoPath });
            } else {
                callback({ error: -6 }); // FILE_NOT_FOUND
            }
        } else {
            callback({ error: -6 });
        }
    });

    createWindow();
});

function createWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false // Nécessaire pour les custom protocols
        }
    });

    win.loadFile('src/dashboard/actv.html');
}