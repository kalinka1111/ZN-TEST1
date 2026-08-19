// 🔄 ZNK ACTV - Système de Synchronisation Cloud → Electron
// Intégration dans votre app Electron

const { ipcMain, app } = require('electron');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// ========================================
// CONFIGURATION
// ========================================

const CONFIG = {
    API_URL: 'https://api.znk.com', // Votre backend ACTV
    SYNC_INTERVAL: 5 * 60 * 1000, // 5 minutes
    CACHE_DIR: path.join(app.getPath('userData'), 'actv-cache'),
    MANIFEST_FILE: path.join(app.getPath('userData'), 'actv-manifest.json'),
    MAX_CACHE_SIZE_MB: 500, // Limite du cache
    DOWNLOAD_CHUNK_SIZE: 1024 * 1024 // 1MB chunks
};

// ========================================
// ACTV SYNC MANAGER
// ========================================

class ACTVSyncManager {
    constructor() {
        this.localManifest = null;
        this.remoteManifest = null;
        this.syncInProgress = false;
        this.downloadQueue = [];
        this.syncInterval = null;
    }

    // Initialiser le système de sync
    async initialize() {
        console.log('🔄 Initialisation ACTV Sync...');

        // Créer les dossiers nécessaires
        await this.ensureDirectories();

        // Charger le manifest local
        await this.loadLocalManifest();

        console.log('✅ ACTV Sync initialisé');
    }

    // Créer les dossiers de cache
    async ensureDirectories() {
        try {
            await fs.mkdir(CONFIG.CACHE_DIR, { recursive: true });
            console.log('📁 Dossier cache créé:', CONFIG.CACHE_DIR);
        } catch (e) {
            console.error('❌ Erreur création dossiers:', e);
        }
    }

    // Charger le manifest local
    async loadLocalManifest() {
        try {
            const data = await fs.readFile(CONFIG.MANIFEST_FILE, 'utf8');
            this.localManifest = JSON.parse(data);
            console.log(`📋 Manifest local chargé: ${this.localManifest.videos.length} vidéos`);
        } catch (e) {
            console.log('ℹ️ Pas de manifest local, création d\'un nouveau');
            this.localManifest = {
                version: 1,
                lastSync: null,
                videos: [],
                emissions: []
            };
            await this.saveLocalManifest();
        }
    }

    // Sauvegarder le manifest local
    async saveLocalManifest() {
        try {
            await fs.writeFile(
                CONFIG.MANIFEST_FILE,
                JSON.stringify(this.localManifest, null, 2)
            );
            console.log('💾 Manifest local sauvegardé');
        } catch (e) {
            console.error('❌ Erreur sauvegarde manifest:', e);
        }
    }

    // Récupérer le manifest depuis le serveur ACTV
    async fetchRemoteManifest(userToken) {
        try {
            console.log('🌐 Récupération du manifest distant...');

            const response = await axios.get(
                `${CONFIG.API_URL}/actv/manifest`,
                {
                    headers: { 'Authorization': `Bearer ${userToken}` },
                    timeout: 10000
                }
            );

            this.remoteManifest = response.data;
            console.log(`✅ Manifest distant récupéré: ${this.remoteManifest.videos.length} vidéos`);

            return this.remoteManifest;

        } catch (error) {
            console.error('❌ Erreur récupération manifest distant:', error.message);
            throw error;
        }
    }

    // Comparer les manifests et identifier les changements
    async compareManifests() {
        if (!this.remoteManifest) {
            throw new Error('Manifest distant non chargé');
        }

        const changes = {
            newVideos: [],      // Nouvelles vidéos à télécharger
            updatedVideos: [],  // Vidéos mises à jour
            deletedVideos: [],  // Vidéos supprimées du serveur
            newEmissions: [],   // Nouvelles émissions
            updatedEmissions: [] // Émissions mises à jour
        };

        // Map des vidéos locales par ID
        const localVideosMap = new Map(
            this.localManifest.videos.map(v => [v.id, v])
        );

        // Identifier nouvelles et mises à jour
        for (const remoteVideo of this.remoteManifest.videos) {
            const localVideo = localVideosMap.get(remoteVideo.id);

            if (!localVideo) {
                // Nouvelle vidéo
                changes.newVideos.push(remoteVideo);
            } else if (remoteVideo.version > localVideo.version) {
                // Vidéo mise à jour
                changes.updatedVideos.push(remoteVideo);
            }

            // Retirer de la map
            localVideosMap.delete(remoteVideo.id);
        }

        // Les vidéos restantes ont été supprimées du serveur
        changes.deletedVideos = Array.from(localVideosMap.values());

        // Même logique pour les émissions
        const localEmissionsMap = new Map(
            this.localManifest.emissions.map(e => [e.id, e])
        );

        for (const remoteEmission of this.remoteManifest.emissions) {
            const localEmission = localEmissionsMap.get(remoteEmission.id);

            if (!localEmission) {
                changes.newEmissions.push(remoteEmission);
            } else if (remoteEmission.version > localEmission.version) {
                changes.updatedEmissions.push(remoteEmission);
            }

            localEmissionsMap.delete(remoteEmission.id);
        }

        console.log('📊 Changements détectés:', {
            nouvelles: changes.newVideos.length,
            mises_à_jour: changes.updatedVideos.length,
            supprimées: changes.deletedVideos.length
        });

        return changes;
    }

    // Télécharger une vidéo
    async downloadVideo(video, progressCallback) {
        const videoPath = path.join(CONFIG.CACHE_DIR, `${video.id}.mp4`);
        const tempPath = `${videoPath}.tmp`;

        try {
            console.log(`⬇️ Téléchargement: ${video.title}`);

            const response = await axios({
                method: 'GET',
                url: video.downloadUrl,
                responseType: 'stream',
                onDownloadProgress: (progressEvent) => {
                    const progress = Math.round(
                        (progressEvent.loaded * 100) / progressEvent.total
                    );
                    if (progressCallback) {
                        progressCallback(video.id, progress);
                    }
                }
            });

            // Écrire dans un fichier temporaire
            const writer = require('fs').createWriteStream(tempPath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            // Vérifier le hash si disponible
            if (video.hash) {
                const fileHash = await this.calculateFileHash(tempPath);
                if (fileHash !== video.hash) {
                    throw new Error('Hash invalide - fichier corrompu');
                }
            }

            // Renommer le fichier temporaire
            await fs.rename(tempPath, videoPath);

            console.log(`✅ Téléchargé: ${video.title}`);

            return {
                success: true,
                path: videoPath,
                size: (await fs.stat(videoPath)).size
            };

        } catch (error) {
            console.error(`❌ Erreur téléchargement ${video.title}:`, error.message);

            // Supprimer le fichier temporaire en cas d'erreur
            try {
                await fs.unlink(tempPath);
            } catch (e) {}

            return { success: false, error: error.message };
        }
    }

    // Calculer le hash d'un fichier (pour vérification d'intégrité)
    async calculateFileHash(filePath) {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = require('fs').createReadStream(filePath);

            stream.on('data', (data) => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }

    // Supprimer une vidéo locale
    async deleteLocalVideo(videoId) {
        const videoPath = path.join(CONFIG.CACHE_DIR, `${videoId}.mp4`);

        try {
            await fs.unlink(videoPath);
            console.log(`🗑️ Vidéo supprimée: ${videoId}`);
            return true;
        } catch (e) {
            console.warn(`⚠️ Impossible de supprimer ${videoId}:`, e.message);
            return false;
        }
    }

    // Synchroniser (fonction principale)
    async sync(userToken, progressCallback) {
        if (this.syncInProgress) {
            console.warn('⚠️ Sync déjà en cours');
            return { success: false, message: 'Sync déjà en cours' };
        }

        this.syncInProgress = true;

        try {
            console.log('🔄 Démarrage de la synchronisation...');

            // 1. Récupérer le manifest distant
            await this.fetchRemoteManifest(userToken);

            // 2. Comparer avec le manifest local
            const changes = await this.compareManifests();

            // 3. Supprimer les vidéos obsolètes
            for (const video of changes.deletedVideos) {
                await this.deleteLocalVideo(video.id);
            }

            // 4. Télécharger les nouvelles vidéos et mises à jour
            const toDownload = [...changes.newVideos, ...changes.updatedVideos];
            let downloaded = 0;

            for (const video of toDownload) {
                const result = await this.downloadVideo(video, (id, progress) => {
                    if (progressCallback) {
                        progressCallback({
                            type: 'download',
                            videoId: id,
                            progress,
                            current: downloaded + 1,
                            total: toDownload.length
                        });
                    }
                });

                if (result.success) {
                    downloaded++;
                    
                    // Ajouter le chemin local à la vidéo
                    video.localPath = result.path;
                    video.cached = true;
                }
            }

            // 5. Mettre à jour le manifest local
            this.localManifest.videos = this.remoteManifest.videos.map(v => {
                const localPath = path.join(CONFIG.CACHE_DIR, `${v.id}.mp4`);
                return {
                    ...v,
                    localPath,
                    cached: require('fs').existsSync(localPath)
                };
            });

            this.localManifest.emissions = this.remoteManifest.emissions;
            this.localManifest.lastSync = new Date().toISOString();
            this.localManifest.version = this.remoteManifest.version;

            await this.saveLocalManifest();

            // 6. Gérer le cache (supprimer si trop gros)
            await this.manageCacheSize();

            console.log('✅ Synchronisation terminée');

            this.syncInProgress = false;

            return {
                success: true,
                changes: {
                    downloaded: downloaded,
                    deleted: changes.deletedVideos.length,
                    total: this.localManifest.videos.length
                }
            };

        } catch (error) {
            console.error('❌ Erreur synchronisation:', error);
            this.syncInProgress = false;

            return {
                success: false,
                error: error.message
            };
        }
    }

    // Gérer la taille du cache
    async manageCacheSize() {
        try {
            const files = await fs.readdir(CONFIG.CACHE_DIR);
            let totalSize = 0;

            const fileStats = await Promise.all(
                files.map(async (file) => {
                    const filePath = path.join(CONFIG.CACHE_DIR, file);
                    const stats = await fs.stat(filePath);
                    return { file, size: stats.size, mtime: stats.mtime };
                })
            );

            totalSize = fileStats.reduce((sum, f) => sum + f.size, 0);
            const totalMB = totalSize / (1024 * 1024);

            console.log(`💾 Taille du cache: ${totalMB.toFixed(2)} MB`);

            // Si le cache dépasse la limite, supprimer les plus anciens
            if (totalMB > CONFIG.MAX_CACHE_SIZE_MB) {
                console.log('⚠️ Cache trop gros, nettoyage...');

                // Trier par date (plus ancien en premier)
                fileStats.sort((a, b) => a.mtime - b.mtime);

                let freedSize = 0;
                const targetSize = CONFIG.MAX_CACHE_SIZE_MB * 0.8 * 1024 * 1024; // 80% de la limite

                for (const file of fileStats) {
                    if (totalSize - freedSize <= targetSize) break;

                    const filePath = path.join(CONFIG.CACHE_DIR, file.file);
                    await fs.unlink(filePath);
                    freedSize += file.size;

                    console.log(`🗑️ Supprimé: ${file.file} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
                }

                console.log(`✅ Cache nettoyé: ${(freedSize / 1024 / 1024).toFixed(2)} MB libérés`);
            }

        } catch (error) {
            console.error('❌ Erreur gestion cache:', error);
        }
    }

    // Démarrer la synchronisation automatique
    startAutoSync(userToken, intervalMinutes = 5) {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }

        console.log(`⏰ Auto-sync activé (${intervalMinutes} minutes)`);

        // Sync initial
        this.sync(userToken);

        // Sync périodique
        this.syncInterval = setInterval(() => {
            console.log('⏰ Sync automatique...');
            this.sync(userToken);
        }, intervalMinutes * 60 * 1000);
    }

    // Arrêter la synchronisation automatique
    stopAutoSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('⏸️ Auto-sync arrêté');
        }
    }

    // Obtenir le manifest local (pour l'UI)
    getLocalManifest() {
        return this.localManifest;
    }

    // Vérifier si une vidéo est en cache
    isVideoCached(videoId) {
        const videoPath = path.join(CONFIG.CACHE_DIR, `${videoId}.mp4`);
        return require('fs').existsSync(videoPath);
    }

    // Obtenir le chemin local d'une vidéo
    getLocalVideoPath(videoId) {
        const videoPath = path.join(CONFIG.CACHE_DIR, `${videoId}.mp4`);
        return this.isVideoCached(videoId) ? videoPath : null;
    }
}

// Instance globale
const actvSync = new ACTVSyncManager();

// ========================================
// IPC HANDLERS (Communication avec Renderer)
// ========================================

// Initialiser le sync
ipcMain.handle('actv:init-sync', async () => {
    await actvSync.initialize();
    return { success: true };
});

// Lancer une synchronisation manuelle
ipcMain.handle('actv:sync', async (event, userToken) => {
    return await actvSync.sync(userToken, (progress) => {
        event.sender.send('actv:sync-progress', progress);
    });
});

// Démarrer l'auto-sync
ipcMain.handle('actv:start-auto-sync', async (event, userToken, intervalMinutes) => {
    actvSync.startAutoSync(userToken, intervalMinutes);
    return { success: true };
});

// Arrêter l'auto-sync
ipcMain.handle('actv:stop-auto-sync', async () => {
    actvSync.stopAutoSync();
    return { success: true };
});

// Obtenir le manifest local
ipcMain.handle('actv:get-manifest', async () => {
    return actvSync.getLocalManifest();
});

// Vérifier si une vidéo est en cache
ipcMain.handle('actv:is-cached', async (event, videoId) => {
    return actvSync.isVideoCached(videoId);
});

// Obtenir le chemin local d'une vidéo
ipcMain.handle('actv:get-video-path', async (event, videoId) => {
    return actvSync.getLocalVideoPath(videoId);
});

// ========================================
// EXEMPLE D'UTILISATION DANS LE RENDERER
// ========================================

/*
// Dans votre code React/HTML (renderer process)

// 1. Initialiser au démarrage de l'app
await window.electron.invoke('actv:init-sync');

// 2. Démarrer l'auto-sync quand l'utilisateur se connecte
const user = getCurrentUser();
await window.electron.invoke('actv:start-auto-sync', user.token, 5); // 5 minutes

// 3. Écouter les progrès de sync
window.electron.on('actv:sync-progress', (progress) => {
    console.log('Téléchargement:', progress);
    updateProgressBar(progress);
});

// 4. Synchroniser manuellement (bouton refresh)
async function syncNow() {
    const result = await window.electron.invoke('actv:sync', user.token);
    if (result.success) {
        alert(`✅ ${result.changes.downloaded} vidéos téléchargées!`);
        reloadVideos();
    }
}

// 5. Obtenir le manifest pour afficher les vidéos
const manifest = await window.electron.invoke('actv:get-manifest');
displayVideos(manifest.videos);

// 6. Jouer une vidéo (online ou cache)
async function playVideo(videoId) {
    const isCached = await window.electron.invoke('actv:is-cached', videoId);
    
    if (isCached) {
        // Jouer depuis le cache local
        const localPath = await window.electron.invoke('actv:get-video-path', videoId);
        videoPlayer.src = `file://${localPath}`;
    } else {
        // Jouer depuis le streaming online
        videoPlayer.src = `https://cdn.znk.com/videos/${videoId}.m3u8`;
    }
}
*/

module.exports = { actvSync, ACTVSyncManager };