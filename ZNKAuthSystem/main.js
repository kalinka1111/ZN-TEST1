const { app, BrowserWindow, Menu, ipcMain, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const url = require('url');

let mainWindow;
let visualNavWindow;
let embeddedServer;
let backendServer;
const isDev = !app.isPackaged;
const PORT = 8765;

// ============================================================================
// GESTION DES UTILISATEURS - SYSTÈME DE FICHIERS
// ============================================================================

const usersDir = path.join(app.getPath('userData'), 'users');
const usersIndexFile = path.join(usersDir, 'index.json');

// Créer le dossier des utilisateurs au démarrage
function initUserSystem() {
    if (!fs.existsSync(usersDir)) {
        fs.mkdirSync(usersDir, { recursive: true });
        console.log('📁 Dossier utilisateurs créé:', usersDir);
    }
    
    // Créer le fichier index s'il n'existe pas
    if (!fs.existsSync(usersIndexFile)) {
        fs.writeFileSync(usersIndexFile, JSON.stringify([], null, 2));
        console.log('📝 Fichier index créé');
    }
}

// Sauvegarder un nouvel utilisateur
ipcMain.on('save-new-user', (event, userData) => {
    try {
        // Générer un ID unique basé sur le timestamp
        const userId = Date.now().toString();
        const userFile = path.join(usersDir, `${userId}.json`);
        
        // Ajouter l'ID aux données utilisateur
        userData.id = userId;
        userData.createdAt = new Date().toISOString();
        
        // Sauvegarder le fichier utilisateur complet
        fs.writeFileSync(userFile, JSON.stringify(userData, null, 2));
        console.log('✅ Utilisateur sauvegardé:', userFile);
        
        // Mettre à jour l'index
        let usersIndex = [];
        if (fs.existsSync(usersIndexFile)) {
            const indexContent = fs.readFileSync(usersIndexFile, 'utf-8');
            usersIndex = JSON.parse(indexContent);
        }
        
        // Ajouter l'entrée dans l'index
        usersIndex.push({
            id: userId,
            whatsznk: userData.whatsznk,
            nom: userData.nom,
            prenom: userData.prenom,
            avatar: userData.avatar,
            emailZnk: userData.emailZnk,
            role: userData.role,
            createdAt: userData.createdAt
        });
        
        fs.writeFileSync(usersIndexFile, JSON.stringify(usersIndex, null, 2));
        console.log('✅ Index mis à jour:', usersIndex.length, 'utilisateur(s)');
        
        // Confirmer au renderer
        event.reply('user-saved', { success: true, userId });
        
    } catch (error) {
        console.error('❌ Erreur sauvegarde utilisateur:', error);
        event.reply('user-saved', { success: false, error: error.message });
    }
});

// Récupérer la liste de tous les utilisateurs
ipcMain.handle('get-all-users', async () => {
    try {
        if (!fs.existsSync(usersIndexFile)) {
            return [];
        }
        const indexContent = fs.readFileSync(usersIndexFile, 'utf-8');
        return JSON.parse(indexContent);
    } catch (error) {
        console.error('❌ Erreur lecture index:', error);
        return [];
    }
});

// Récupérer les données complètes d'un utilisateur
ipcMain.handle('get-user-data', async (event, userId) => {
    try {
        const userFile = path.join(usersDir, `${userId}.json`);
        if (!fs.existsSync(userFile)) {
            return { error: 'Utilisateur non trouvé' };
        }
        const userData = fs.readFileSync(userFile, 'utf-8');
        return JSON.parse(userData);
    } catch (error) {
        console.error('❌ Erreur lecture utilisateur:', error);
        return { error: error.message };
    }
});

// Vérifier le PIN d'un utilisateur
ipcMain.handle('verify-user-pin', async (event, userId, pin) => {
    try {
        const userFile = path.join(usersDir, `${userId}.json`);
        if (!fs.existsSync(userFile)) {
            return { valid: false, error: 'Utilisateur non trouvé' };
        }
        
        const userData = JSON.parse(fs.readFileSync(userFile, 'utf-8'));
        return { valid: userData.pinCode === pin };
    } catch (error) {
        console.error('❌ Erreur vérification PIN:', error);
        return { valid: false, error: error.message };
    }
});

// Mettre à jour les données d'un utilisateur
ipcMain.on('update-user-data', (event, userId, updates) => {
    try {
        const userFile = path.join(usersDir, `${userId}.json`);
        if (!fs.existsSync(userFile)) {
            event.reply('user-updated', { success: false, error: 'Utilisateur non trouvé' });
            return;
        }
        
        // Lire les données actuelles
        const userData = JSON.parse(fs.readFileSync(userFile, 'utf-8'));
        
        // Fusionner avec les mises à jour
        const updatedData = { ...userData, ...updates, updatedAt: new Date().toISOString() };
        
        // Sauvegarder
        fs.writeFileSync(userFile, JSON.stringify(updatedData, null, 2));
        
        // Mettre à jour l'index si nécessaire
        if (updates.nom || updates.prenom || updates.avatar) {
            const indexContent = fs.readFileSync(usersIndexFile, 'utf-8');
            let usersIndex = JSON.parse(indexContent);
            
            const userIndexEntry = usersIndex.find(u => u.id === userId);
            if (userIndexEntry) {
                if (updates.nom) userIndexEntry.nom = updates.nom;
                if (updates.prenom) userIndexEntry.prenom = updates.prenom;
                if (updates.avatar) userIndexEntry.avatar = updates.avatar;
            }
            
            fs.writeFileSync(usersIndexFile, JSON.stringify(usersIndex, null, 2));
        }
        
        console.log('✅ Utilisateur mis à jour:', userId);
        event.reply('user-updated', { success: true });
        
    } catch (error) {
        console.error('❌ Erreur mise à jour utilisateur:', error);
        event.reply('user-updated', { success: false, error: error.message });
    }
});

// Supprimer un utilisateur
ipcMain.handle('delete-user', async (event, userId) => {
    try {
        const userFile = path.join(usersDir, `${userId}.json`);
        
        // Supprimer le fichier
        if (fs.existsSync(userFile)) {
            fs.unlinkSync(userFile);
        }
        
        // Mettre à jour l'index
        const indexContent = fs.readFileSync(usersIndexFile, 'utf-8');
        let usersIndex = JSON.parse(indexContent);
        usersIndex = usersIndex.filter(u => u.id !== userId);
        fs.writeFileSync(usersIndexFile, JSON.stringify(usersIndex, null, 2));
        
        console.log('✅ Utilisateur supprimé:', userId);
        return { success: true };
        
    } catch (error) {
        console.error('❌ Erreur suppression utilisateur:', error);
        return { success: false, error: error.message };
    }
});

// Obtenir les statistiques
ipcMain.handle('get-users-stats', async () => {
    try {
        const indexContent = fs.readFileSync(usersIndexFile, 'utf-8');
        const users = JSON.parse(indexContent);
        
        return {
            total: users.length,
            byRole: users.reduce((acc, user) => {
                acc[user.role] = (acc[user.role] || 0) + 1;
                return acc;
            }, {}),
            recentUsers: users.slice(-5).reverse()
        };
    } catch (error) {
        console.error('❌ Erreur stats:', error);
        return { total: 0, byRole: {}, recentUsers: [] };
    }
});

// ============================================================================
// SERVEUR EMBARQUÉ - SERT LA RACINE COMPLÈTE
// ============================================================================

function startEmbeddedServer() {
    return new Promise((resolve, reject) => {
        let contentPath;
        if (isDev) {
            contentPath = __dirname;
            console.log('🔧 Mode développement');
        } else {
            contentPath = path.join(process.resourcesPath, 'app');
            console.log('📦 Mode production');
        }

        console.log('📂 Serveur embarqué - Racine:', contentPath);

        embeddedServer = http.createServer((req, res) => {
            const parsedUrl = url.parse(req.url);
            let pathname = parsedUrl.pathname;
            
            if (pathname === '/') {
                pathname = '/index.html';
            }

            pathname = decodeURIComponent(pathname);
            const filePath = path.join(contentPath, pathname);

            // SÉCURITÉ
            const normalizedPath = path.normalize(filePath);
            if (!normalizedPath.startsWith(contentPath)) {
                res.writeHead(403, { 'Content-Type': 'text/html' });
                res.end('<h1>403 - Accès interdit</h1>');
                return;
            }

            fs.stat(filePath, (err, stats) => {
                if (err) {
                    console.log('❌ 404:', pathname);
                    res.writeHead(404, { 'Content-Type': 'text/html' });
                    res.end(`<h1>404 - Fichier non trouvé</h1><p>${pathname}</p>`);
                    return;
                }

                if (stats.isDirectory()) {
                    const indexPath = path.join(filePath, 'index.html');
                    if (fs.existsSync(indexPath)) {
                        serveFile(indexPath, res);
                    } else {
                        fs.readdir(filePath, (err, files) => {
                            if (err) {
                                res.writeHead(500);
                                res.end('Erreur lecture dossier');
                                return;
                            }
                            res.writeHead(200, { 'Content-Type': 'text/html' });
                            res.end(`
                                <h1>Index de ${pathname}</h1>
                                <ul>
                                    ${files.map(f => `<li><a href="${pathname}/${f}">${f}</a></li>`).join('')}
                                </ul>
                            `);
                        });
                    }
                    return;
                }

                serveFile(filePath, res);
            });
        });

        function serveFile(filePath, res) {
            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes = {
                '.html': 'text/html',
                '.js': 'application/javascript',
                '.css': 'text/css',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.svg': 'image/svg+xml',
                '.ico': 'image/x-icon',
                '.webp': 'image/webp',
                '.woff': 'font/woff',
                '.woff2': 'font/woff2',
                '.ttf': 'font/ttf',
                '.otf': 'font/otf',
                '.eot': 'application/vnd.ms-fontobject',
                '.xml': 'application/xml',
                '.txt': 'text/plain',
                '.pdf': 'application/pdf',
                '.webmanifest': 'application/manifest+json'
            };

            const contentType = mimeTypes[ext] || 'application/octet-stream';

            fs.readFile(filePath, (error, content) => {
                if (error) {
                    res.writeHead(500);
                    res.end('Erreur serveur: ' + error.code);
                } else {
                    res.writeHead(200, {
                        'Content-Type': contentType,
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'no-cache'
                    });
                    res.end(content);
                    console.log('✅', path.basename(filePath));
                }
            });
        }

        embeddedServer.listen(PORT, '127.0.0.1', () => {
            console.log(`✅ Serveur embarqué démarré sur http://127.0.0.1:${PORT}`);
            console.log(`📁 Racine servie: ${contentPath}`);
            resolve();
        });

        embeddedServer.on('error', (err) => {
            console.error('❌ Erreur serveur embarqué:', err);
            reject(err);
        });
    });
}

// ============================================================================
// BACKEND OPTIONNEL
// ============================================================================

function startBackendIfExists() {
    return new Promise((resolve) => {
        const backendPaths = [
            path.join(__dirname, 'backend', 'server.py'),
            path.join(__dirname, 'server', 'server.py'),
            path.join(__dirname, 'server.py')
        ];

        let backendPath = null;
        for (const p of backendPaths) {
            if (fs.existsSync(p)) {
                backendPath = p;
                break;
            }
        }

        if (!backendPath) {
            console.log('⚠️ Pas de backend Python détecté (optionnel)');
            resolve(false);
            return;
        }

        console.log('🔧 Backend trouvé:', backendPath);

        if (isDev) {
            const { spawn } = require('child_process');
            const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
            
            backendServer = spawn(pythonCmd, [backendPath], {
                cwd: path.dirname(backendPath)
            });

            backendServer.stdout.on('data', (data) => {
                console.log(`Backend: ${data}`);
            });

            backendServer.stderr.on('data', (data) => {
                console.error(`Backend Error: ${data}`);
            });

            console.log('✅ Backend Python lancé (dev mode)');
        }
        
        resolve(true);
    });
}

// ============================================================================
// FENÊTRE PRINCIPALE
// ============================================================================

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        backgroundColor: '#0a0a0a',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js')
        },
        show: false,
        titleBarStyle: 'default',
        autoHideMenuBar: false
    });

    mainWindow.loadURL(`data:text/html;charset=utf-8,${getLoaderHTML()}`);
    mainWindow.show();

    Promise.all([
        startEmbeddedServer(),
        startBackendIfExists()
    ]).then(() => {
        setTimeout(() => {
            console.log(`🌐 Chargement de l'application depuis http://127.0.0.1:${PORT}`);
            mainWindow.loadURL(`http://127.0.0.1:${PORT}/index.html`);
        }, 1000);
    }).catch((err) => {
        console.error('❌ Erreur démarrage:', err);
        mainWindow.loadURL(`data:text/html;charset=utf-8,${getErrorHTML(err)}`);
    });

    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.shift && input.key.toLowerCase() === 'i') {
            mainWindow.webContents.toggleDevTools();
        }
    });

    mainWindow.webContents.on('console-message', (event, level, message) => {
        console.log(`[Renderer]:`, message);
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        if (errorCode === -3) return;
        console.error('❌ Échec chargement:', errorDescription, validatedURL);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    createMenu();
}

// ============================================================================
// HTML TEMPLATES
// ============================================================================

function getLoaderHTML() {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%);
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
        }
        .loader {
            text-align: center;
            animation: fadeIn 0.5s ease;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .spinner {
            border: 4px solid rgba(0, 255, 136, 0.1);
            border-radius: 50%;
            border-top: 4px solid #00ff88;
            width: 60px;
            height: 60px;
            animation: spin 1s linear infinite;
            margin: 0 auto 30px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        h1 {
            font-size: 48px;
            margin-bottom: 20px;
            background: linear-gradient(135deg, #00ff88, #0088ff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .status {
            margin-top: 30px;
            padding: 20px;
            background: rgba(0, 255, 136, 0.1);
            border-radius: 12px;
            max-width: 400px;
            font-size: 14px;
            line-height: 1.8;
        }
        .dot {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #00ff88;
            margin-right: 10px;
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.2); }
        }
    </style>
</head>
<body>
    <div class="loader">
        <div class="spinner"></div>
        <h1>🚀 ZNK System</h1>
        <p style="font-size: 18px; color: #888; margin-bottom: 10px;">Initialisation...</p>
        <div class="status">
            <div><span class="dot"></span>Démarrage serveur embarqué...</div>
            <div><span class="dot"></span>Chargement ressources...</div>
            <div><span class="dot"></span>Préparation interface...</div>
        </div>
    </div>
</body>
</html>
    `.trim();
}

function getErrorHTML(error) {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {
            margin: 0;
            background: #1a1a2e;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
        }
        .error {
            text-align: center;
            max-width: 600px;
            padding: 40px;
        }
        h1 { color: #ff4444; margin-bottom: 20px; font-size: 36px; }
        .message {
            background: rgba(255, 68, 68, 0.1);
            padding: 20px;
            border-radius: 12px;
            margin-top: 20px;
            text-align: left;
            border-left: 4px solid #ff4444;
        }
        code {
            background: #000;
            padding: 2px 6px;
            border-radius: 3px;
            color: #00ff88;
        }
    </style>
</head>
<body>
    <div class="error">
        <h1>⚠️ Erreur de Démarrage</h1>
        <p>L'application n'a pas pu démarrer correctement.</p>
        <div class="message">
            <strong>Erreur:</strong><br>
            <code>${error.message || error}</code>
        </div>
    </div>
</body>
</html>
    `.trim();
}

// ============================================================================
// VISUAL NAVIGATOR
// ============================================================================

function createVisualNavigator() {
    if (visualNavWindow) {
        visualNavWindow.focus();
        return;
    }

    visualNavWindow = new BrowserWindow({
        width: 1600,
        height: 1000,
        backgroundColor: '#eef2ff',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        },
        title: 'ZNK Visual Navigator'
    });

    visualNavWindow.loadURL(`http://127.0.0.1:${PORT}/znk-visual-navigator.html`);

    visualNavWindow.on('closed', () => {
        visualNavWindow = null;
    });
}

// ============================================================================
// MENU
// ============================================================================

function createMenu() {
    const template = [
        {
            label: 'ZNK',
            submenu: [
                {
                    label: 'À propos',
                    click: () => {
                        console.log('ZNK System v2.0');
                    }
                },
                { type: 'separator' },
                {
                    label: 'Quitter',
                    accelerator: 'CmdOrCtrl+Q',
                    click: () => app.quit()
                }
            ]
        },
        {
            label: 'Affichage',
            submenu: [
                {
                    label: 'Visual Navigator',
                    accelerator: 'CmdOrCtrl+Shift+V',
                    click: createVisualNavigator
                },
                { type: 'separator' },
                { role: 'reload', label: 'Recharger' },
                { role: 'forceReload', label: 'Recharger (force)' },
                { type: 'separator' },
                { role: 'togglefullscreen', label: 'Plein écran' }
            ]
        },
        {
            label: 'Développement',
            submenu: [
                {
                    label: 'Outils de développement',
                    accelerator: 'CmdOrCtrl+Shift+I',
                    click: () => mainWindow.webContents.toggleDevTools()
                },
                { type: 'separator' },
                {
                    label: 'Dossier utilisateurs',
                    click: () => {
                        require('electron').shell.openPath(usersDir);
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// ============================================================================
// LIFECYCLE
// ============================================================================

app.whenReady().then(() => {
    // Initialiser le système utilisateurs
    initUserSystem();
    
    createMainWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (embeddedServer) {
        embeddedServer.close();
    }
    if (backendServer) {
        backendServer.kill();
    }
    
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    if (embeddedServer) embeddedServer.close();
    if (backendServer) backendServer.kill();
});

console.log('🚀 ZNK Electron - Mode:', isDev ? 'Développement' : 'Production');
console.log('📂 App Path:', app.getAppPath());
console.log('📂 User Data:', app.getPath('userData'));
console.log('📂 Users Directory:', usersDir);