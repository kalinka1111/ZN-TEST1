// updater.js - Système de mise à jour ZNK complet
// Vérifie un serveur distant, télécharge et installe automatiquement

const { app, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');

class ZNKUpdater {
    constructor(config = {}) {
        // Configuration par défaut
        this.config = {
            updateServerUrl: config.updateServerUrl || 'https://updates.znk.com/latest.json',
            autoCheck: config.autoCheck !== false, // true par défaut
            autoDownload: config.autoDownload !== false,
            autoInstall: config.autoInstall === true, // false par défaut (demande confirmation)
            checkIntervalHours: config.checkIntervalHours || 24,
            allowPrerelease: config.allowPrerelease || false,
            ...config
        };

        this.updateCheckInterval = null;
        this.isChecking = false;
        this.isDownloading = false;
        this.downloadProgress = 0;
        this.mainWindow = null;
        
        console.log('📦 ZNKUpdater initialisé');
        console.log('🔗 Serveur MAJ:', this.config.updateServerUrl);
    }

    /**
     * Initialise le système et enregistre les handlers IPC
     */
    async initialize(mainWindow = null) {
        try {
            this.mainWindow = mainWindow;
            console.log('🔄 Initialisation du système de MAJ...');
            
            const currentVersion = app.getVersion();
            console.log(`📌 Version actuelle: ${currentVersion}`);
            
            // Créer les dossiers nécessaires
            await this.ensureUpdateFolders();
            
            // Enregistrer les handlers IPC
            this.registerIpcHandlers();
            
            // Démarrer la vérification auto si activée
            if (this.config.autoCheck) {
                this.startAutoCheck();
            }
            
            console.log('✅ Système MAJ initialisé');
            return true;
            
        } catch (error) {
            console.warn('⚠️ Erreur initialisation updater:', error.message);
            return false;
        }
    }

    /**
     * Crée les dossiers nécessaires
     */
    async ensureUpdateFolders() {
        const folders = [
            path.join(app.getPath('userData'), 'updates'),
            path.join(app.getPath('userData'), 'updates', 'downloads'),
            path.join(app.getPath('userData'), 'updates', 'backups')
        ];

        for (const folder of folders) {
            if (!fs.existsSync(folder)) {
                fs.mkdirSync(folder, { recursive: true });
            }
        }
    }

    /**
     * Enregistre les handlers IPC pour la communication avec le renderer
     */
    registerIpcHandlers() {
        ipcMain.handle('updater:check', async () => {
            return await this.checkForUpdates();
        });

        ipcMain.handle('updater:download', async () => {
            return await this.downloadUpdate();
        });

        ipcMain.handle('updater:install', async () => {
            return await this.installUpdate();
        });

        ipcMain.handle('updater:get-info', () => {
            return this.getVersionInfo();
        });

        ipcMain.handle('updater:get-progress', () => {
            return {
                isChecking: this.isChecking,
                isDownloading: this.isDownloading,
                progress: this.downloadProgress
            };
        });
    }

    /**
     * Vérifie s'il existe une mise à jour
     */
    async checkForUpdates(silent = false) {
        if (this.isChecking) {
            return { available: false, message: 'Vérification déjà en cours' };
        }

        try {
            this.isChecking = true;
            if (!silent) console.log('🔍 Vérification des mises à jour...');
            
            this.notifyRenderer('update-checking');

            // Récupérer les infos de version depuis le serveur
            const latestInfo = await this.fetchLatestVersion();
            
            if (!latestInfo) {
                throw new Error('Impossible de récupérer les informations de version');
            }

            const currentVersion = app.getVersion();
            const isNewer = this.compareVersions(latestInfo.version, currentVersion) > 0;

            if (isNewer) {
                console.log(`🆕 Nouvelle version disponible: ${latestInfo.version}`);
                
                const result = {
                    available: true,
                    currentVersion,
                    latestVersion: latestInfo.version,
                    releaseNotes: latestInfo.releaseNotes || '',
                    releaseDate: latestInfo.releaseDate || new Date().toISOString(),
                    downloadUrl: latestInfo.downloadUrl,
                    fileSize: latestInfo.fileSize || 0,
                    isPrerelease: latestInfo.prerelease || false
                };

                this.notifyRenderer('update-available', result);

                // Téléchargement auto si activé
                if (this.config.autoDownload && !silent) {
                    setTimeout(() => this.downloadUpdate(), 2000);
                }

                return result;
            } else {
                if (!silent) console.log('✅ Application à jour');
                this.notifyRenderer('update-not-available', { currentVersion });
                return { available: false, currentVersion };
            }

        } catch (error) {
            console.error('❌ Erreur vérification MAJ:', error.message);
            this.notifyRenderer('update-error', { error: error.message });
            return { available: false, error: error.message };
            
        } finally {
            this.isChecking = false;
        }
    }

    /**
     * Récupère les informations de la dernière version depuis le serveur
     */
    async fetchLatestVersion() {
        return new Promise((resolve, reject) => {
            const url = this.config.updateServerUrl;
            const protocol = url.startsWith('https') ? https : http;

            const request = protocol.get(url, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode}`));
                    return;
                }

                let data = '';
                response.on('data', chunk => data += chunk);
                response.on('end', () => {
                    try {
                        const info = JSON.parse(data);
                        resolve(info);
                    } catch (e) {
                        reject(new Error('Réponse serveur invalide'));
                    }
                });
            });

            request.on('error', reject);
            request.setTimeout(10000, () => {
                request.destroy();
                reject(new Error('Timeout'));
            });
        });
    }

    /**
     * Télécharge la mise à jour
     */
    async downloadUpdate() {
        if (this.isDownloading) {
            return { success: false, message: 'Téléchargement déjà en cours' };
        }

        try {
            this.isDownloading = true;
            this.downloadProgress = 0;
            console.log('⬇️ Téléchargement de la mise à jour...');
            
            this.notifyRenderer('update-downloading', { progress: 0 });

            // Récupérer les infos de la dernière version
            const latestInfo = await this.fetchLatestVersion();
            
            if (!latestInfo || !latestInfo.downloadUrl) {
                throw new Error('URL de téléchargement introuvable');
            }

            const downloadPath = path.join(
                app.getPath('userData'),
                'updates',
                'downloads',
                `update-${latestInfo.version}.${this.getInstallerExtension()}`
            );

            // Télécharger le fichier
            await this.downloadFile(latestInfo.downloadUrl, downloadPath, (progress) => {
                this.downloadProgress = progress;
                this.notifyRenderer('update-downloading', { progress });
            });

            console.log('✅ Téléchargement terminé:', downloadPath);
            
            // Vérifier l'intégrité si checksum fourni
            if (latestInfo.checksum) {
                const isValid = await this.verifyChecksum(downloadPath, latestInfo.checksum);
                if (!isValid) {
                    throw new Error('Checksum invalide');
                }
                console.log('✅ Checksum vérifié');
            }

            this.notifyRenderer('update-downloaded', { 
                path: downloadPath,
                version: latestInfo.version 
            });

            // Installation auto si activée
            if (this.config.autoInstall) {
                setTimeout(() => this.installUpdate(), 1000);
            }

            return { 
                success: true, 
                path: downloadPath,
                version: latestInfo.version 
            };

        } catch (error) {
            console.error('❌ Erreur téléchargement:', error.message);
            this.notifyRenderer('update-error', { error: error.message });
            return { success: false, error: error.message };
            
        } finally {
            this.isDownloading = false;
        }
    }

    /**
     * Télécharge un fichier avec suivi de progression
     */
    downloadFile(url, destination, onProgress) {
        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http;
            const file = fs.createWriteStream(destination);

            const request = protocol.get(url, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode}`));
                    return;
                }

                const totalSize = parseInt(response.headers['content-length'], 10);
                let downloaded = 0;

                response.on('data', (chunk) => {
                    downloaded += chunk.length;
                    const progress = Math.floor((downloaded / totalSize) * 100);
                    
                    if (onProgress) {
                        onProgress(progress);
                    }
                });

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve(destination);
                });
            });

            request.on('error', (err) => {
                fs.unlink(destination, () => {});
                reject(err);
            });

            file.on('error', (err) => {
                fs.unlink(destination, () => {});
                reject(err);
            });
        });
    }

    /**
     * Installe la mise à jour
     */
    async installUpdate() {
        try {
            console.log('🔧 Installation de la mise à jour...');
            
            const latestInfo = await this.fetchLatestVersion();
            const updateFile = path.join(
                app.getPath('userData'),
                'updates',
                'downloads',
                `update-${latestInfo.version}.${this.getInstallerExtension()}`
            );

            if (!fs.existsSync(updateFile)) {
                throw new Error('Fichier de mise à jour introuvable');
            }

            // Demander confirmation à l'utilisateur
            const response = await this.showInstallDialog(latestInfo.version);
            
            if (response === 0) { // "Installer maintenant"
                this.notifyRenderer('update-installing');
                
                // Lancer l'installateur selon la plateforme
                await this.launchInstaller(updateFile);
                
                // Quitter l'application
                setTimeout(() => {
                    app.quit();
                }, 1000);

                return { success: true };
            } else {
                return { success: false, canceled: true };
            }

        } catch (error) {
            console.error('❌ Erreur installation:', error.message);
            this.notifyRenderer('update-error', { error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Lance l'installateur selon la plateforme
     */
    async launchInstaller(installerPath) {
        const platform = process.platform;

        if (platform === 'darwin') {
            // macOS: Ouvrir le DMG
            await shell.openPath(installerPath);
        } else if (platform === 'win32') {
            // Windows: Lancer l'EXE
            spawn(installerPath, { detached: true, stdio: 'ignore' });
        } else {
            // Linux: Lancer l'AppImage ou DEB
            const ext = path.extname(installerPath);
            if (ext === '.AppImage') {
                fs.chmodSync(installerPath, '755');
                spawn(installerPath, { detached: true, stdio: 'ignore' });
            } else {
                await shell.openPath(installerPath);
            }
        }
    }

    /**
     * Affiche la boîte de dialogue d'installation
     */
    async showInstallDialog(version) {
        if (!this.mainWindow) {
            return 0; // Installer par défaut si pas de fenêtre
        }

        const result = await dialog.showMessageBox(this.mainWindow, {
            type: 'info',
            title: 'Mise à jour prête',
            message: `La version ${version} est prête à être installée.`,
            detail: 'L\'application va se fermer pendant l\'installation.',
            buttons: ['Installer maintenant', 'Plus tard'],
            defaultId: 0,
            cancelId: 1
        });

        return result.response;
    }

    /**
     * Vérifie le checksum d'un fichier
     */
    async verifyChecksum(filePath, expectedChecksum) {
        return new Promise((resolve) => {
            const crypto = require('crypto');
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);

            stream.on('data', data => hash.update(data));
            stream.on('end', () => {
                const fileChecksum = hash.digest('hex');
                resolve(fileChecksum === expectedChecksum);
            });
            stream.on('error', () => resolve(false));
        });
    }

    /**
     * Lance la vérification automatique périodique
     */
    startAutoCheck() {
        if (this.updateCheckInterval) {
            return;
        }

        const intervalMs = this.config.checkIntervalHours * 60 * 60 * 1000;
        console.log(`🔄 Vérification auto activée (${this.config.checkIntervalHours}h)`);
        
        this.updateCheckInterval = setInterval(() => {
            this.checkForUpdates(true);
        }, intervalMs);
        
        // Première vérification après 30 secondes
        setTimeout(() => this.checkForUpdates(true), 30000);
    }

    /**
     * Arrête la vérification automatique
     */
    stopAutoCheck() {
        if (this.updateCheckInterval) {
            clearInterval(this.updateCheckInterval);
            this.updateCheckInterval = null;
            console.log('⏹️ Vérification auto arrêtée');
        }
    }

    /**
     * Compare deux versions (semver)
     */
    compareVersions(v1, v2) {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);

        for (let i = 0; i < 3; i++) {
            const p1 = parts1[i] || 0;
            const p2 = parts2[i] || 0;
            if (p1 > p2) return 1;
            if (p1 < p2) return -1;
        }
        return 0;
    }

    /**
     * Obtient l'extension de l'installateur selon la plateforme
     */
    getInstallerExtension() {
        switch (process.platform) {
            case 'darwin': return 'dmg';
            case 'win32': return 'exe';
            case 'linux': return 'AppImage';
            default: return 'bin';
        }
    }

    /**
     * Notifie le renderer d'un événement
     */
    notifyRenderer(event, data = {}) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(`updater:${event}`, data);
        }
    }

    /**
     * Obtient les informations de version
     */
    getVersionInfo() {
        return {
            current: app.getVersion(),
            platform: process.platform,
            arch: process.arch,
            electron: process.versions.electron,
            node: process.versions.node,
            chrome: process.versions.chrome
        };
    }

    /**
     * Nettoyage avant fermeture
     */
    cleanup() {
        console.log('🧹 Nettoyage updater...');
        this.stopAutoCheck();
    }
}

module.exports = ZNKUpdater;
console.log('✅ updater.js chargé (version complète)');
