/**
 * ZNK SYSTEM - User Storage (localStorage)
 * Système identique à persistent-data.json mais en localStorage pour les users
 * Les users créent leurs propres données sans accès au JSON central admin
 */

class ZNKUserStorage {
    constructor(userId) {
        this.userId = userId || this.generateUserId();
        this.KEYS = {
            userData: `znk_user_${this.userId}_data`,
            emissions: `znk_user_${this.userId}_emissions`,
            publications: `znk_user_${this.userId}_publications`,
            playlists: `znk_user_${this.userId}_playlists`,
            preferences: `znk_user_${this.userId}_preferences`
        };
        
        this.initUser();
    }

    /**
     * Initialise l'utilisateur s'il n'existe pas
     */
    initUser() {
        if (!localStorage.getItem(this.KEYS.userData)) {
            const userData = {
                userId: this.userId,
                createdAt: new Date().toISOString(),
                role: 'user', // user, membre, visiteur, etude
                userName: 'User',
                avatar: 'U',
                dashboardAccess: ['actv', 'artflow', 'radio'],
                stats: {
                    totalEmissions: 0,
                    totalPublications: 0,
                    totalPlays: 0
                }
            };
            localStorage.setItem(this.KEYS.userData, JSON.stringify(userData));
        }
    }

    /**
     * Génère un ID utilisateur unique
     */
    generateUserId() {
        return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Récupère les données utilisateur
     */
    getUserData() {
        const data = localStorage.getItem(this.KEYS.userData);
        return data ? JSON.parse(data) : null;
    }

    /**
     * Met à jour les données utilisateur
     */
    updateUserData(updates) {
        const userData = this.getUserData();
        const updated = { ...userData, ...updates };
        localStorage.setItem(this.KEYS.userData, JSON.stringify(updated));
        return updated;
    }

    // ==========================================
    // EMISSIONS RADIO (identique à admin)
    // ==========================================

    /**
     * Récupère toutes les émissions radio de l'utilisateur
     */
    getRadioEmissions() {
        const data = localStorage.getItem(this.KEYS.emissions);
        return data ? JSON.parse(data) : [];
    }

    /**
     * Crée une nouvelle émission radio
     */
    createRadioEmission(emission) {
        const emissions = this.getRadioEmissions();
        const newEmission = {
            id: `emission_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: emission.title,
            description: emission.description || '',
            coverArt: emission.coverArt || this.getDefaultCover(),
            tracks: [],
            createdAt: new Date().toISOString(),
            isUserEmission: true,
            userId: this.userId
        };
        emissions.push(newEmission);
        localStorage.setItem(this.KEYS.emissions, JSON.stringify(emissions));
        this.updateStats();
        return newEmission;
    }

    /**
     * Ajoute une piste à une émission
     */
    addTrackToEmission(emissionId, track) {
        const emissions = this.getRadioEmissions();
        const emission = emissions.find(e => e.id === emissionId);
        
        if (!emission) {
            throw new Error(`Émission ${emissionId} introuvable`);
        }

        const newTrack = {
            id: `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: track.title,
            artist: track.artist,
            audioUrl: track.audioUrl, // MP3 original
            videoUrl: track.videoUrl, // MP4 converti
            coverArt: track.coverArt || this.getDefaultCover(),
            duration: track.duration || 0,
            genre: track.genre || 'Général',
            addedAt: new Date().toISOString(),
            plays: 0
        };

        emission.tracks.push(newTrack);
        localStorage.setItem(this.KEYS.emissions, JSON.stringify(emissions));
        return newTrack;
    }

    /**
     * Supprime une émission
     */
    deleteRadioEmission(emissionId) {
        let emissions = this.getRadioEmissions();
        emissions = emissions.filter(e => e.id !== emissionId);
        localStorage.setItem(this.KEYS.emissions, JSON.stringify(emissions));
        this.updateStats();
    }

    /**
     * Supprime une piste d'une émission
     */
    deleteTrackFromEmission(emissionId, trackId) {
        const emissions = this.getRadioEmissions();
        const emission = emissions.find(e => e.id === emissionId);
        
        if (emission) {
            emission.tracks = emission.tracks.filter(t => t.id !== trackId);
            localStorage.setItem(this.KEYS.emissions, JSON.stringify(emissions));
        }
    }

    /**
     * Incrémente le nombre de lectures d'une piste
     */
    incrementTrackPlays(emissionId, trackId) {
        const emissions = this.getRadioEmissions();
        const emission = emissions.find(e => e.id === emissionId);
        
        if (emission) {
            const track = emission.tracks.find(t => t.id === trackId);
            if (track) {
                track.plays = (track.plays || 0) + 1;
                track.lastPlayed = new Date().toISOString();
                localStorage.setItem(this.KEYS.emissions, JSON.stringify(emissions));
                this.updateStats();
            }
        }
    }

    // ==========================================
    // PUBLICATIONS ARTFLOW (identique à admin)
    // ==========================================

    /**
     * Récupère toutes les publications de l'utilisateur
     */
    getPublications() {
        const data = localStorage.getItem(this.KEYS.publications);
        return data ? JSON.parse(data) : [];
    }

    /**
     * Crée une nouvelle publication
     */
    createPublication(publication) {
        const publications = this.getPublications();
        const userData = this.getUserData();
        
        const newPublication = {
            id: `pub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            userId: this.userId,
            userName: userData.userName,
            type: publication.type, // 'artflow', 'video', 'image', 'text'
            title: publication.title,
            content: publication.content, // URL ou texte
            thumbnail: publication.thumbnail,
            publishedAt: new Date().toISOString(),
            likes: 0,
            views: 0,
            isUserCreated: true
        };

        publications.push(newPublication);
        localStorage.setItem(this.KEYS.publications, JSON.stringify(publications));
        this.updateStats();
        return newPublication;
    }

    /**
     * Supprime une publication
     */
    deletePublication(publicationId) {
        let publications = this.getPublications();
        publications = publications.filter(p => p.id !== publicationId);
        localStorage.setItem(this.KEYS.publications, JSON.stringify(publications));
        this.updateStats();
    }

    /**
     * Incrémente les likes d'une publication
     */
    likePublication(publicationId) {
        const publications = this.getPublications();
        const pub = publications.find(p => p.id === publicationId);
        
        if (pub) {
            pub.likes = (pub.likes || 0) + 1;
            localStorage.setItem(this.KEYS.publications, JSON.stringify(publications));
        }
    }

    /**
     * Incrémente les vues d'une publication
     */
    viewPublication(publicationId) {
        const publications = this.getPublications();
        const pub = publications.find(p => p.id === publicationId);
        
        if (pub) {
            pub.views = (pub.views || 0) + 1;
            localStorage.setItem(this.KEYS.publications, JSON.stringify(publications));
        }
    }

    // ==========================================
    // PLAYLISTS (identique à admin)
    // ==========================================

    /**
     * Récupère toutes les playlists
     */
    getPlaylists() {
        const data = localStorage.getItem(this.KEYS.playlists);
        return data ? JSON.parse(data) : { radio: [], actv: [] };
    }

    /**
     * Crée une playlist radio
     */
    createRadioPlaylist(name, trackIds = []) {
        const playlists = this.getPlaylists();
        
        const newPlaylist = {
            id: `playlist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: name,
            type: 'radio',
            tracks: trackIds,
            shuffle: false,
            repeat: false,
            createdAt: new Date().toISOString()
        };

        playlists.radio.push(newPlaylist);
        localStorage.setItem(this.KEYS.playlists, JSON.stringify(playlists));
        return newPlaylist;
    }

    /**
     * Crée une playlist ACTV
     */
    createACTVPlaylist(name, videoIds = []) {
        const playlists = this.getPlaylists();
        
        const newPlaylist = {
            id: `playlist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: name,
            type: 'actv',
            videos: videoIds,
            autoplay: true,
            loop: false,
            createdAt: new Date().toISOString()
        };

        playlists.actv.push(newPlaylist);
        localStorage.setItem(this.KEYS.playlists, JSON.stringify(playlists));
        return newPlaylist;
    }

    /**
     * Ajoute un élément à une playlist
     */
    addToPlaylist(playlistId, itemId) {
        const playlists = this.getPlaylists();
        const allPlaylists = [...playlists.radio, ...playlists.actv];
        const playlist = allPlaylists.find(p => p.id === playlistId);
        
        if (playlist) {
            if (playlist.type === 'radio') {
                playlist.tracks.push(itemId);
            } else {
                playlist.videos.push(itemId);
            }
            localStorage.setItem(this.KEYS.playlists, JSON.stringify(playlists));
        }
    }

    /**
     * Supprime un élément d'une playlist
     */
    removeFromPlaylist(playlistId, itemId) {
        const playlists = this.getPlaylists();
        const allPlaylists = [...playlists.radio, ...playlists.actv];
        const playlist = allPlaylists.find(p => p.id === playlistId);
        
        if (playlist) {
            if (playlist.type === 'radio') {
                playlist.tracks = playlist.tracks.filter(t => t !== itemId);
            } else {
                playlist.videos = playlist.videos.filter(v => v !== itemId);
            }
            localStorage.setItem(this.KEYS.playlists, JSON.stringify(playlists));
        }
    }

    // ==========================================
    // PRÉFÉRENCES UTILISATEUR
    // ==========================================

    /**
     * Récupère les préférences
     */
    getPreferences() {
        const data = localStorage.getItem(this.KEYS.preferences);
        return data ? JSON.parse(data) : {
            theme: 'dark',
            autoplay: true,
            volume: 80,
            notifications: true
        };
    }

    /**
     * Met à jour les préférences
     */
    updatePreferences(updates) {
        const prefs = this.getPreferences();
        const updated = { ...prefs, ...updates };
        localStorage.setItem(this.KEYS.preferences, JSON.stringify(updated));
        return updated;
    }

    // ==========================================
    // STATS ET UTILITAIRES
    // ==========================================

    /**
     * Met à jour les statistiques utilisateur
     */
    updateStats() {
        const emissions = this.getRadioEmissions();
        const publications = this.getPublications();
        
        let totalPlays = 0;
        emissions.forEach(em => {
            em.tracks.forEach(t => {
                totalPlays += t.plays || 0;
            });
        });

        const userData = this.getUserData();
        userData.stats = {
            totalEmissions: emissions.length,
            totalPublications: publications.length,
            totalPlays: totalPlays,
            lastUpdate: new Date().toISOString()
        };
        
        localStorage.setItem(this.KEYS.userData, JSON.stringify(userData));
    }

    /**
     * Export de toutes les données utilisateur (backup)
     */
    exportAllData() {
        return {
            userData: this.getUserData(),
            emissions: this.getRadioEmissions(),
            publications: this.getPublications(),
            playlists: this.getPlaylists(),
            preferences: this.getPreferences(),
            exportedAt: new Date().toISOString()
        };
    }

    /**
     * Import de données (restauration)
     */
    importAllData(data) {
        if (data.userData) {
            localStorage.setItem(this.KEYS.userData, JSON.stringify(data.userData));
        }
        if (data.emissions) {
            localStorage.setItem(this.KEYS.emissions, JSON.stringify(data.emissions));
        }
        if (data.publications) {
            localStorage.setItem(this.KEYS.publications, JSON.stringify(data.publications));
        }
        if (data.playlists) {
            localStorage.setItem(this.KEYS.playlists, JSON.stringify(data.playlists));
        }
        if (data.preferences) {
            localStorage.setItem(this.KEYS.preferences, JSON.stringify(data.preferences));
        }
    }

    /**
     * Efface toutes les données utilisateur
     */
    clearAllData() {
        Object.values(this.KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
    }

    /**
     * Image de couverture par défaut
     */
    getDefaultCover() {
        return "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><rect fill='%23333' width='300' height='300'/><text x='150' y='170' font-size='100' text-anchor='middle' fill='%2300ff88'>♪</text></svg>";
    }
}

// Export pour utilisation
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ZNKUserStorage;
}

// API globale
window.ZNKUserStorage = ZNKUserStorage;

/**
 * EXEMPLE D'UTILISATION
 */

/*
// Initialiser le storage utilisateur
const userStorage = new ZNKUserStorage();

// Créer une émission
const emission = userStorage.createRadioEmission({
    title: 'Ma Super Emission',
    description: 'Collection de mes morceaux préférés'
});

// Ajouter une piste (après conversion MP3 → MP4)
const track = userStorage.addTrackToEmission(emission.id, {
    title: 'Blue in Green',
    artist: 'Miles Davis',
    audioUrl: 'blob:...',  // MP3 original
    videoUrl: 'blob:...',  // MP4 converti
    duration: 342,
    genre: 'Jazz'
});

// Créer une publication ArtFlow
const publication = userStorage.createPublication({
    type: 'artflow',
    title: 'Mon ArtFlow #1',
    content: 'blob:...',
    thumbnail: 'blob:...'
});

// Créer une playlist
const playlist = userStorage.createRadioPlaylist('Ma Playlist Jazz');
userStorage.addToPlaylist(playlist.id, track.id);

// Incrémenter les lectures
userStorage.incrementTrackPlays(emission.id, track.id);

// Export backup
const backup = userStorage.exportAllData();
console.log('Backup:', backup);

// Import backup
userStorage.importAllData(backup);

// Stats
console.log('Stats:', userStorage.getUserData().stats);
*/