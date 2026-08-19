// main.js - ZNK Universal Electron Launcher
// Compatible avec TOUS les modules ZNK

const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');

// ==================== CONFIGURATION ====================

// Parser les arguments
const args = process.argv.slice(1);
const getArg = (prefix) => {
    const arg = args.find(a => a.startsWith(prefix));
    return arg ? arg.split('=')[1] : null;
};

const PORT = getArg('--port') || '3000';
const APP_TYPE = getArg('--app') || 'dashboard';
const DEV_MODE = args.includes('--dev');

// Configuration des applications
const APP_CONFIGS = {
    // Dashboard principal
    dashboard: {
        width: 1600,
        height: 1000,
        minWidth: 1200,
        path: '/ZNKStudiosDash.html',
        title: '🎛️ ZNK Studios Dashboard',
        icon: 'znk-icon.png',
        devTools: true
    },
    
    // WhatsZNK Video Chat
    whatsznk: {
        width: 1400,
        height: 900,
        minWidth: 900,
        path: '/whatsznk.html',
        title: '📹 WhatsZNK Video Chat',
        icon: 'whatsznk-icon.png',
        features: ['camera', 'microphone']
    },
    
    // Camera Core
    camera: {
        width: 1400,
        height: 900,
        minWidth: 1000,
        path: '/znk-camera-core-local.html',
        title: '🎥 ZNK Camera Core',
        icon: 'camera-icon.png',
        features: ['camera']
    },
    
    // ACTV
    actv: {
        width: 1200,
        height: 800,
        minWidth: 900,
        path: '/actv.html',
        title: '📺 ACTV',
        icon: 'actv-icon.png'
    },
    
    // Archives
    archives: {
        width: 1400,
        height: 900,
        minWidth: 1000,
        path: '/archives.html',
        title: '📁 Archives Manager',
        icon: 'archives-icon.png',
        devTools: true
    },
    
    // ZAZA IA
    zaza: {
        width: 1400,
        height: 900,
        minWidth: 1000,
        path: '/',
        title: '🤖 ZAZA IA',
        icon: 'zaza-icon.png'
    }
};

// ==================== WINDOWS MANAGEMENT ====================

const windows = new Map();

function createWindow(appType = APP_TYPE) {
    const config = APP_CONFIGS[appType] || APP_CONFIGS.dashboard;
    
    // Vérifier si la fenêtre existe déjà
    if (windows.has(appType)) {
        const existingWin = windows.get(appType);
        if (!existingWin.isDestroyed()) {
            existingWin.focus();
            return existingWin;
        }
    }
    
    const win = new BrowserWindow({
        width: config.width,
        height: config.height,
        minWidth: config.minWidth || 800,
        minHeight: config.minHeight || 600,
        backgroundColor: '#0f0c29',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false, // Pour iframe cross-origin
            allowRunningInsecureContent: true
        },
        title: config.title,
        icon: path.join(__dirname, 'assets', config.icon),
        show: false // Afficher quand prêt
    });

    // Afficher quand prêt
    win.once('ready-to-show', () => {
        win.show();
        console.log(`✅ ${config.title} ready`);
    });

    // Charger l'URL
    const url = `http://localhost:${PORT}${config.path}`;
    console.log(`🚀 Loading: ${url}`);
    win.loadURL(url);
    
    // DevTools en mode dev
    if (DEV_MODE || config.devTools) {
        win.webContents.openDevTools();
    }

    // Gérer les erreurs de chargement
    win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error(`❌ Failed to load: ${errorDescription}`);
        
        // Afficher une page d'erreur
        win.loadURL(`data:text/html,
            <html>
                <body style="background:#0f0c29;color:white;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;">
                    <div>
                        <h1>❌ Erreur de connexion</h1>
                        <p>Impossible de se connecter à <code>http://localhost:${PORT}</code></p>
                        <p style="color:#888;font-size:14px;">Vérifiez que le serveur est démarré</p>
                        <button onclick="location.reload()" style="margin-top:20px;padding:10px 20px;background:#00d4ff;border:none;border-radius:8px;color:#000;font-weight:bold;cursor:pointer;">
                            🔄 Réessayer
                        </button>
                    </div>
                </body>
            </html>
        `);
    });

    // Logs console
    win.webContents.on('console-message', (event, level, message, line, sourceId) => {
        if (DEV_MODE) {
            console.log(`[${appType}] ${message}`);
        }
    });

    // Sauvegarder la référence
    windows.set(appType, win);
    
    // Nettoyer quand fermé
    win.on('closed', () => {
        windows.delete(appType);
    });

    return win;
}

// ==================== MENU ====================

function createMenu() {
    const template = [
        // Menu ZNK
        {
            label: 'ZNK',
            submenu: [
                {
                    label: '🏠 Dashboard',
                    accelerator: 'CmdOrCtrl+D',
                    click: () => createWindow('dashboard')
                },
                { type: 'separator' },
                {
                    label: '🔄 Recharger',
                    accelerator: 'CmdOrCtrl+R',
                    click: () => {
                        const win = BrowserWindow.getFocusedWindow();
                        if (win) win.reload();
                    }
                },
                {
                    label: '🛠️ DevTools',
                    accelerator: 'F12',
                    click: () => {
                        const win = BrowserWindow.getFocusedWindow();
                        if (win) win.webContents.toggleDevTools();
                    }
                },
                { type: 'separator' },
                {
                    label: '❌ Quitter',
                    accelerator: 'CmdOrCtrl+Q',
                    role: 'quit'
                }
            ]
        },
        
        // Menu Modules
        {
            label: 'Modules',
            submenu: [
                {
                    label: '📹 WhatsZNK',
                    click: () => createWindow('whatsznk')
                },
                {
                    label: '🎥 Camera Core',
                    click: () => createWindow('camera')
                },
                {
                    label: '📺 ACTV',
                    click: () => createWindow('actv')
                },
                {
                    label: '📁 Archives',
                    click: () => createWindow('archives')
                },
                { type: 'separator' },
                {
                    label: '🤖 ZAZA IA',
                    click: () => {
                        createWindow('zaza');
                    }
                }
            ]
        },
        
        // Menu Serveurs
        {
            label: 'Serveurs',
            submenu: [
                {
                    label: '📡 ZNK Sync (Port 3000)',
                    enabled: false
                },
                {
                    label: '📹 WhatsZNK (Port 3001)',
                    enabled: false
                },
                { type: 'separator' },
                {
                    label: '🔗 Ouvrir ZAZA Launcher',
                    click: () => {
                        const win = new BrowserWindow({
                            width: 1400,
                            height: 800,
                            webPreferences: { nodeIntegration: true }
                        });
                        win.loadFile('zaza-launcher-electron.html');
                    }
                }
            ]
        },
        
        // Menu Aide
        {
            label: 'Aide',
            submenu: [
                {
                    label: '📖 Documentation',
                    click: () => {
                        require('electron').shell.openExternal('https://znk-docs.local');
                    }
                },
                { type: 'separator' },
                {
                    label: 'ℹ️ À propos',
                    click: () => {
                        dialog.showMessageBox({
                            type: 'info',
                            title: 'À propos de ZNK Studios',
                            message: 'ZNK Studios Desktop',
                            detail: `Version: 1.0.0\nElectron: ${process.versions.electron}\nChrome: ${process.versions.chrome}\nNode: ${process.versions.node}`
                        });
                    }
                }
            ]
        }
    ];
    
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// ==================== IPC HANDLERS ====================

// Communication inter-fenêtres
ipcMain.on('open-module', (event, moduleName) => {
    createWindow(moduleName);
});

// Partage de stream Camera Core → WhatsZNK
ipcMain.on('camera-stream', (event, streamData) => {
    const whatsznkWin = windows.get('whatsznk');
    if (whatsznkWin && !whatsznkWin.isDestroyed()) {
        whatsznkWin.webContents.send('camera-stream-received', streamData);
    }
});

// Notifications
ipcMain.on('show-notification', (event, { title, body }) => {
    const { Notification } = require('electron');
    new Notification({ title, body }).show();
});

// Dialogue de fichiers
ipcMain.handle('open-file-dialog', async (event, options) => {
    const result = await dialog.showOpenDialog(options);
    return result;
});

// ==================== APP LIFECYCLE ====================

app.whenReady().then(() => {
    console.log('');
    console.log('╔════════════════════════════════════════╗');
    console.log('║   🚀 ZNK UNIVERSAL ELECTRON LAUNCHER   ║');
    console.log('╚════════════════════════════════════════╝');
    console.log('');
    console.log(`📱 App Type: ${APP_TYPE}`);
    console.log(`🌐 Port: ${PORT}`);
    console.log(`🛠️  Dev Mode: ${DEV_MODE ? 'ON' : 'OFF'}`);
    console.log('');
    
    createMenu();
    createWindow(APP_TYPE);
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow(APP_TYPE);
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Logs de démarrage
app.on('ready', () => {
    console.log('✅ ZNK Electron ready');
});

app.on('before-quit', () => {
    console.log('👋 ZNK Electron shutting down...');
});

// ==================== ERROR HANDLING ====================

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
});