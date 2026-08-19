/**
 * ZNK SYSTEM - Admin to Persistent Data Synchronization
 * Synchronise les données admin (localStorage navigateur) → persistent-data.json
 */

class ZNKAdminSync {
    constructor() {
        this.PERSISTENT_PATH = './data/persistent-data.json';
        this.ADMIN_KEYS = {
            actv: 'znk_actv_emissions',
            radio: 'znk_radio_emissions',
            publications: 'znk_admin_publications',
            users: 'znk_users_data'
        };
    }

    /**
     * Collecte toutes les données admin depuis localStorage
     */
    collectAdminData() {
        const data = {
            version: "1.0.0",
            lastUpdate: new Date().toISOString(),
            adminOnly: {
                createdBy: "ZNKsystem",
                createdAt: new Date().toISOString()
            },
            emissions: {
                actv: this.getACTVEmissions(),
                radio: this.getRadioEmissions()
            },
            publications: {
                admin: this.getAdminPublications(),
                membres: this.getMembresPublications()
            },
            playlists: {
                actvPlaylist: this.getACTVPlaylists(),
                radioPlaylist: this.getRadioPlaylists()
            },
            userProfiles: this.getUserProfiles(),
            stats: this.calculateStats()
        };

        return data;
    }

    /**
     * Récupère les émissions ACTV (vidéos)
     */
    getACTVEmissions() {
        const stored = localStorage.getItem(this.ADMIN_KEYS.actv);
        if (!stored) return [];

        const emissions = JSON.parse(stored);
        return emissions.map(em => ({
            id: em.id,
            title: em.title,
            description: em.description || '',
            videoUrl: em.videoUrl,
            thumbnail: em.thumbnail || this.generateThumbnail(em.videoUrl),
            duration: em.duration || 0,
            publishedAt: em.publishedAt || new Date().toISOString(),
            category: em.category || 'Actualité',
            views: em.views || 0,
            isAdminCreated: true
        }));
    }

    /**
     * Récupère les émissions Radio (audios convertis)
     */
    getRadioEmissions() {
        const stored = localStorage.getItem(this.ADMIN_KEYS.radio);
        if (!stored) return [];

        const emissions = JSON.parse(stored);
        return emissions.map(em => ({
            id: em.id,
            title: em.title,
            description: em.description || '',
            coverArt: em.coverArt || this.getDefaultCover(),
            tracks: em.tracks.map(track => ({
                id: track.id,
                title: track.title,
                artist: track.artist,
                audioUrl: track.audioUrl, // MP3 original
                videoUrl: track.videoUrl, // MP4 converti
                coverArt: track.coverArt || this.getDefaultCover(),
                duration: track.duration || 0,
                genre: track.genre || 'Général'
            })),
            createdAt: em.createdAt || new Date().toISOString(),
            isAdminEmission: true
        }));
    }

    /**
     * Récupère les publications ADMIN
     * NOTA: Admin agit comme membre via son interface user/fida.html
     */
    getAdminPublications() {
        const stored = localStorage.getItem(this.ADMIN_KEYS.publications);
        if (!stored) return [];

        const publications = JSON.parse(stored);
        return publications
            .filter(pub => pub.isAdmin === true)
            .map(pub => ({
                id: pub.id,
                type: pub.type, // 'video', 'image', 'text'
                title: pub.title,
                content: pub.content, // URL ou texte
                thumbnail: pub.thumbnail,
                publishedAt: pub.publishedAt || new Date().toISOString(),
                category: pub.category || 'Annonce',
                createdBy: 'ZNKsystem'
            }));
    }

    /**
     * Récupère les publications des MEMBRES
     * Inclut les publications admin faites via interface user/fida.html
     */
    getMembresPublications() {
        const stored = localStorage.getItem(this.ADMIN_KEYS.publications);
        if (!stored) return [];

        const publications = JSON.parse(stored);
        return publications
            .filter(pub => pub.isAdmin !== true) // Publications normales des membres
            .map(pub => ({
                id: pub.id,
                userId: pub.userId,
                userName: pub.userName,
                type: pub.type, // 'artflow', 'video', 'image'
                title: pub.title,
                content: pub.content,
                thumbnail: pub.thumbnail,
                publishedAt: pub.publishedAt || new Date().toISOString(),
                likes: pub.likes || 0,
                views: pub.views || 0
            }));
    }

    /**
     * Génère les playlists ACTV
     */
    getACTVPlaylists() {
        const emissions = this.getACTVEmissions();
        const publications = this.getAdminPublications().filter(p => p.type === 'video');

        return [{
            id: 'actv_playlist_main',
            name: 'Playlist ACTV Principale',
            videos: [
                ...emissions.map(e => e.id),
                ...publications.map(p => p.id)
            ],
            autoplay: true,
            loop: false,
            createdAt: new Date().toISOString()
        }];
    }

    /**
     * Génère les playlists Radio
     */
    getRadioPlaylists() {
        const emissions = this.getRadioEmissions();
        const allTracks = [];

        emissions.forEach(emission => {
            allTracks.push(...emission.tracks.map(t => t.id));
        });

        return [{
            id: 'radio_playlist_main',
            name: 'Radio Principale',
            tracks: allTracks,
            shuffle: false,
            repeat: false,
            createdAt: new Date().toISOString()
        }];
    }

    /**
     * Récupère les profils utilisateurs
     */
    getUserProfiles() {
        const stored = localStorage.getItem(this.ADMIN_KEYS.users);
        if (!stored) {
            return {
                membres: [],
                visiteurs: [],
                etudes: []
            };
        }

        const users = JSON.parse(stored);
        
        return {
            membres: users.filter(u => u.role === 'membre'),
            visiteurs: users.filter(u => u.role === 'visiteur'),
            etudes: users.filter(u => u.role === 'etude')
        };
    }

    /**
     * Calcule les statistiques globales
     */
    calculateStats() {
        const actvEmissions = this.getACTVEmissions();
        const radioEmissions = this.getRadioEmissions();
        const publications = [...this.getAdminPublications(), ...this.getMembresPublications()];
        const profiles = this.getUserProfiles();

        const totalUsers = 
            profiles.membres.length + 
            profiles.visiteurs.length + 
            profiles.etudes.length;

        return {
            totalEmissions: actvEmissions.length + radioEmissions.length,
            totalPublications: publications.length,
            totalUsers: totalUsers,
            totalPlays: 0, // À calculer depuis les analytics
            lastSync: new Date().toISOString()
        };
    }

    /**
     * Sauvegarde dans persistent-data.json
     */
    async saveToPersistentFile() {
        const data = this.collectAdminData();
        const jsonString = JSON.stringify(data, null, 2);

        try {
            // Pour Electron: utiliser fs
            if (typeof window !== 'undefined' && window.fs) {
                await window.fs.writeFile(this.PERSISTENT_PATH, jsonString, 'utf8');
                console.log('✅ Données sauvegardées dans persistent-data.json');
                return { success: true, path: this.PERSISTENT_PATH };
            }
            
            // Pour navigateur: télécharger le fichier
            else {
                const blob = new Blob([jsonString], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'persistent-data.json';
                a.click();
                URL.revokeObjectURL(url);
                console.log('✅ Fichier téléchargé: persistent-data.json');
                return { success: true, downloaded: true };
            }
        } catch (error) {
            console.error('❌ Erreur sauvegarde:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Synchronisation complète
     */
    async syncAll() {
        console.log('🔄 Début synchronisation Admin → Persistent...');
        
        const result = await this.saveToPersistentFile();
        
        if (result.success) {
            const stats = this.calculateStats();
            console.log(`✅ Synchronisation terminée:
                - ${stats.totalEmissions} émissions
                - ${stats.totalPublications} publications
                - ${stats.totalUsers} utilisateurs`);
        }
        
        return result;
    }

    /**
     * Utilitaires
     */
    generateThumbnail(videoUrl) {
        return videoUrl.replace('.mp4', '-thumb.jpg');
    }

    getDefaultCover() {
        return "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><rect fill='%23333' width='300' height='300'/><text x='150' y='170' font-size='100' text-anchor='middle' fill='%2300ff88'>♪</text></svg>";
    }
}

// API publique
const znkSync = new ZNKAdminSync();

// Export pour utilisation
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ZNKAdminSync;
}

// Exemple d'utilisation
/*
// Dans votre dashboard admin:
const syncButton = document.getElementById('syncButton');
syncButton.addEventListener('click', async () => {
    const result = await znkSync.syncAll();
    if (result.success) {
        alert('✅ Données synchronisées avec succès !');
    } else {
        alert('❌ Erreur: ' + result.error);
    }
});

// Synchronisation automatique toutes les 5 minutes
setInterval(() => {
    znkSync.syncAll();
}, 5 * 60 * 1000);
*/