// ============================================
// ZNK P2P MANAGER
// Gestionnaire de publications P2P
// Mode: Local First → P2P si connexion
// ============================================

class ZNKP2PManager {
    constructor(config = {}) {
        this.apiUrl = config.apiUrl || 'https://api.znk.app/v1';
        this.userId = this.getAnonymousUserId();
        this.isOnline = navigator.onLine;
        this.publications = [];
        this.syncQueue = [];
        
        // Écouter les changements de connexion
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
        
        console.log('📡 ZNK P2P Manager initialisé');
        console.log(`👤 User ID: ${this.userId}`);
        console.log(`🌐 Status: ${this.isOnline ? 'En ligne' : 'Hors ligne'}`);
    }

    // ========================================
    // GESTION CONNEXION
    // ========================================
    
    handleOnline() {
        console.log('✅ Connexion Internet détectée');
        this.isOnline = true;
        this.processSyncQueue();
    }

    handleOffline() {
        console.log('⚠️ Connexion Internet perdue - Mode local activé');
        this.isOnline = false;
    }

    getAnonymousUserId() {
        let userId = localStorage.getItem('znk_anon_id');
        if (!userId) {
            userId = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            localStorage.setItem('znk_anon_id', userId);
        }
        return userId;
    }

    // ========================================
    // CRÉATION DE PUBLICATION
    // ========================================

    async createPublication(data) {
        const {
            title,
            content,
            type,        // 'text', 'image', 'video', 'audio', 'file'
            tags = [],
            visibility = 'public'  // 'public', 'private'
        } = data;

        console.log('📝 Création publication:', title);

        // 1. Créer l'objet publication local
        const publication = {
            id: `pub_${Date.now()}_${this.userId}`,
            user_id: this.userId,
            title,
            content,
            type,
            tags,
            visibility,
            created_at: new Date().toISOString(),
            likes: 0,
            downloads: 0,
            comments: 0,
            synced: false,
            local_only: !this.isOnline
        };

        // 2. Sauvegarder localement TOUJOURS
        await this.saveLocalPublication(publication);
        console.log('✅ Publication sauvegardée localement');

        // 3. Si en ligne ET public, uploader vers P2P
        if (this.isOnline && visibility === 'public') {
            try {
                const uploaded = await this.uploadToP2P(publication);
                publication.synced = true;
                publication.remote_id = uploaded.id;
                await this.saveLocalPublication(publication);
                console.log('✅ Publication synchronisée P2P');
                return { success: true, publication, synced: true };
            } catch (error) {
                console.warn('⚠️ Upload P2P échoué, reste en local:', error.message);
                // Ajouter à la queue de sync
                this.addToSyncQueue(publication);
                return { success: true, publication, synced: false, local_only: true };
            }
        }

        return { success: true, publication, local_only: true };
    }

    // ========================================
    // SAUVEGARDE LOCALE
    // ========================================

    async saveLocalPublication(publication) {
        const localPubs = this.getLocalPublications();
        const existingIndex = localPubs.findIndex(p => p.id === publication.id);
        
        if (existingIndex >= 0) {
            localPubs[existingIndex] = publication;
        } else {
            localPubs.unshift(publication);
        }
        
        // Limiter à 50 publications locales
        const limited = localPubs.slice(0, 50);
        localStorage.setItem('znk_my_publications', JSON.stringify(limited));
        
        return publication;
    }

    getLocalPublications() {
        const stored = localStorage.getItem('znk_my_publications');
        return stored ? JSON.parse(stored) : [];
    }

    deleteLocalPublication(pubId) {
        const localPubs = this.getLocalPublications();
        const filtered = localPubs.filter(p => p.id !== pubId);
        localStorage.setItem('znk_my_publications', JSON.stringify(filtered));
        console.log('🗑️ Publication supprimée localement:', pubId);
        return true;
    }

    // ========================================
    // UPLOAD VERS P2P (SI ONLINE)
    // ========================================

    async uploadToP2P(publication) {
        if (!this.isOnline) {
            throw new Error('Pas de connexion Internet');
        }

        console.log('📤 Upload vers P2P:', publication.id);

        // Préparer les données
        const formData = new FormData();
        formData.append('user_id', this.userId);
        formData.append('publication_id', publication.id);
        formData.append('title', publication.title);
        formData.append('content', publication.content);
        formData.append('type', publication.type);
        formData.append('tags', JSON.stringify(publication.tags));
        formData.append('visibility', publication.visibility);
        formData.append('created_at', publication.created_at);

        try {
            const response = await fetch(`${this.apiUrl}/publications/create`, {
                method: 'POST',
                body: formData,
                headers: {
                    'X-ZNK-Client': 'electron-app',
                    'X-ZNK-Version': '1.0.0'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('✅ Upload P2P réussi:', result);
            return result;

        } catch (error) {
            console.error('❌ Erreur upload P2P:', error);
            throw error;
        }
    }

    // ========================================
    // DÉCOUVERTE COMMUNAUTÉ
    // ========================================

    async fetchCommunityFeed(filters = {}) {
        if (!this.isOnline) {
            console.warn('⚠️ Pas de connexion - Retour feed local');
            return {
                publications: this.getLocalPublications().filter(p => p.visibility === 'public'),
                local_only: true,
                error: false
            };
        }

        console.log('🌐 Chargement feed communauté...');

        try {
            const params = new URLSearchParams({
                page: filters.page || 1,
                limit: filters.limit || 20,
                category: filters.category || 'all',
                sort: filters.sort || 'recent'
            });

            const response = await fetch(`${this.apiUrl}/publications/feed?${params}`, {
                headers: {
                    'X-ZNK-User-ID': this.userId
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            this.publications = data.publications || [];
            
            console.log(`✅ ${this.publications.length} publications chargées`);
            return data;

        } catch (error) {
            console.error('❌ Erreur chargement feed:', error);
            // Fallback sur les publications locales publiques
            return {
                publications: this.getLocalPublications().filter(p => p.visibility === 'public'),
                local_only: true,
                error: true,
                message: error.message
            };
        }
    }

    async searchPublications(query, filters = {}) {
        if (!this.isOnline) {
            // Recherche locale
            const localPubs = this.getLocalPublications();
            const results = localPubs.filter(pub => {
                const searchIn = `${pub.title} ${pub.content} ${pub.tags.join(' ')}`.toLowerCase();
                return searchIn.includes(query.toLowerCase());
            });
            return { results, local_only: true };
        }

        console.log('🔍 Recherche:', query);

        try {
            const response = await fetch(`${this.apiUrl}/publications/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-ZNK-User-ID': this.userId
                },
                body: JSON.stringify({ query, filters })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            return await response.json();

        } catch (error) {
            console.error('❌ Erreur recherche:', error);
            return { results: [], error: true };
        }
    }

    // ========================================
    // TÉLÉCHARGEMENT DE CONTENU
    // ========================================

    async downloadPublication(pubId) {
        if (!this.isOnline) {
            console.warn('⚠️ Téléchargement impossible hors ligne');
            return { success: false, error: 'Pas de connexion Internet' };
        }

        console.log('⬇️ Téléchargement publication:', pubId);

        try {
            const response = await fetch(`${this.apiUrl}/publications/${pubId}/download`, {
                headers: {
                    'X-ZNK-User-ID': this.userId
                }
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const blob = await response.blob();
            const publication = await response.json();
            
            // Sauvegarder dans les téléchargements locaux
            await this.saveDownloadedPublication(pubId, publication);
            
            // Notifier le serveur (stats)
            await this.notifyDownload(pubId);
            
            console.log('✅ Publication téléchargée');
            return { success: true, publication };

        } catch (error) {
            console.error('❌ Erreur téléchargement:', error);
            return { success: false, error: error.message };
        }
    }

    async saveDownloadedPublication(pubId, data) {
        const downloads = this.getDownloadedPublications();
        downloads.unshift({ id: pubId, data, downloaded_at: new Date().toISOString() });
        
        // Limiter à 100 téléchargements
        const limited = downloads.slice(0, 100);
        localStorage.setItem('znk_downloaded_publications', JSON.stringify(limited));
    }

    getDownloadedPublications() {
        const stored = localStorage.getItem('znk_downloaded_publications');
        return stored ? JSON.parse(stored) : [];
    }

    async notifyDownload(pubId) {
        if (!this.isOnline) return;
        
        try {
            await fetch(`${this.apiUrl}/publications/${pubId}/stats/download`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-ZNK-User-ID': this.userId
                }
            });
        } catch (error) {
            console.warn('⚠️ Notification download échouée:', error);
        }
    }

    // ========================================
    // INTERACTIONS
    // ========================================

    async likePublication(pubId) {
        // Liker localement d'abord
        const localPubs = this.getLocalPublications();
        const pub = localPubs.find(p => p.id === pubId);
        
        if (pub) {
            pub.likes = (pub.likes || 0) + 1;
            pub.liked_by_me = true;
            await this.saveLocalPublication(pub);
        }

        // Si en ligne, sync vers serveur
        if (this.isOnline) {
            try {
                await fetch(`${this.apiUrl}/publications/${pubId}/like`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-ZNK-User-ID': this.userId
                    }
                });
                console.log('✅ Like synchronisé');
            } catch (error) {
                console.warn('⚠️ Sync like échoué:', error);
            }
        }

        return true;
    }

    // ========================================
    // QUEUE DE SYNCHRONISATION
    // ========================================

    addToSyncQueue(publication) {
        this.syncQueue.push(publication);
        localStorage.setItem('znk_sync_queue', JSON.stringify(this.syncQueue));
        console.log('📋 Publication ajoutée à la queue de sync');
    }

    async processSyncQueue() {
        if (!this.isOnline || this.syncQueue.length === 0) return;

        console.log(`🔄 Traitement queue de sync (${this.syncQueue.length} items)`);

        for (const publication of [...this.syncQueue]) {
            try {
                await this.uploadToP2P(publication);
                publication.synced = true;
                await this.saveLocalPublication(publication);
                
                // Retirer de la queue
                this.syncQueue = this.syncQueue.filter(p => p.id !== publication.id);
                localStorage.setItem('znk_sync_queue', JSON.stringify(this.syncQueue));
                
                console.log('✅ Publication synchronisée:', publication.id);
            } catch (error) {
                console.warn('⚠️ Échec sync:', publication.id, error);
            }
        }

        console.log('✅ Queue de sync traitée');
    }

    getSyncQueueCount() {
        return this.syncQueue.length;
    }

    // ========================================
    // STATISTIQUES
    // ========================================

    getStats() {
        const localPubs = this.getLocalPublications();
        const downloads = this.getDownloadedPublications();
        
        return {
            my_publications: localPubs.length,
            synced: localPubs.filter(p => p.synced).length,
            pending_sync: this.syncQueue.length,
            downloaded: downloads.length,
            total_likes: localPubs.reduce((sum, p) => sum + (p.likes || 0), 0)
        };
    }

    // ========================================
    // COMPRESSION (Simulée)
    // ========================================

    async compressContent(content, type) {
        // Simulation de compression
        console.log('🗜️ Compression du contenu...');
        
        // Dans une vraie implémentation:
        // - Images: utiliser Canvas API pour redimensionner
        // - Texte: utiliser pako.js pour gzip
        // - Vidéo: utiliser ffmpeg.wasm
        
        return {
            original_size: content.length,
            compressed_size: Math.floor(content.length * 0.7),
            compression_ratio: 0.7,
            compressed_data: content
        };
    }

    async decompressContent(compressedData) {
        // Simulation de décompression
        console.log('📦 Décompression du contenu...');
        return compressedData;
    }
}

// ============================================
// EXPORT & USAGE
// ============================================

// Pour utilisation dans Electron ou navigateur
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ZNKP2PManager;
} else {
    window.ZNKP2PManager = ZNKP2PManager;
}

// ============================================
// EXEMPLE D'UTILISATION
// ============================================

/*
// Initialiser le manager
const p2p = new ZNKP2PManager({
    apiUrl: 'https://api.znk.app/v1'
});

// Créer une publication
const result = await p2p.createPublication({
    title: 'Ma nouvelle création',
    content: 'Contenu de ma publication...',
    type: 'text',
    tags: ['architecture', 'code'],
    visibility: 'public'
});

console.log('Publication créée:', result);

// Charger le feed communauté
const feed = await p2p.fetchCommunityFeed({
    page: 1,
    limit: 20,
    sort: 'recent'
});

console.log('Feed:', feed);

// Télécharger une publication
const downloaded = await p2p.downloadPublication('pub_12345');

// Like une publication
await p2p.likePublication('pub_12345');

// Statistiques
const stats = p2p.getStats();
console.log('Statistiques:', stats);
*/