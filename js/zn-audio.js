/**
 * ZNK Audio System - VERSION FIXÉE POUR APP PACKAGÉE
 * Gestion des flux audio, playlists et streaming
 */

const path = require('path');
const fs = require('fs');

class ZNKAudioSystem {
    constructor() {
        this.currentTrack = null;
        this.playlist = [];
        this.audioElement = null;
        this.isPlaying = false;
        this.currentTime = 0;
        this.duration = 0;
        this.volume = 0.7;
        this.stations = new Map();
        this.archives = new Map();
        this.listeners = new Map();
        
        // 🔧 NOUVEAUX PARAMÈTRES POUR APP PACKAGÉE
        this.isPackaged = false;
        this.audioPath = '';
        this.manifestPath = '';
        this.manifest = null;
    }

    // Initialisation
    init() {
        this.detectEnvironment();
        this.createAudioElement();
        this.loadStations();
        this.loadManifest();
        this.setupEventListeners();
        return this;
    }

    // 🔧 NOUVELLE MÉTHODE : Détecter l'environnement
    detectEnvironment() {
        try {
            const { app } = require('electron');
            this.isPackaged = app.isPackaged;
            
            if (this.isPackaged) {
                // App packagée : utiliser process.resourcesPath
                this.audioPath = path.join(process.resourcesPath, 'persistent-audios');
                this.manifestPath = path.join(this.audioPath, 'znk-audio-manifest.json');
            } else {
                // Mode dev
                this.audioPath = path.join(__dirname, '..', 'persistent-audios');
                this.manifestPath = path.join(this.audioPath, 'znk-audio-manifest.json');
            }
            
            console.log('🎵 ZNK Audio Environment:', {
                isPackaged: this.isPackaged,
                audioPath: this.audioPath,
                exists: fs.existsSync(this.audioPath)
            });
            
        } catch (error) {
            // Mode web (fallback)
            console.warn('⚠️ Not in Electron, using web mode');
            this.audioPath = './persistent-audios';
            this.manifestPath = './persistent-audios/znk-audio-manifest.json';
        }
    }

    // 🔧 NOUVELLE MÉTHODE : Charger le manifest depuis le fichier
    loadManifest() {
        try {
            if (fs.existsSync(this.manifestPath)) {
                const data = fs.readFileSync(this.manifestPath, 'utf8');
                this.manifest = JSON.parse(data);
                
                console.log('✅ Manifest chargé:', {
                    tracks: this.manifest.metadata.totalTracks,
                    emissions: this.manifest.metadata.totalEmissions
                });
                
                // Charger toutes les pistes dans les archives
                this.manifest.emissions.forEach(emission => {
                    emission.tracks.forEach(track => {
                        this.archives.set(track.id, {
                            ...track,
                            emission: emission.name
                        });
                    });
                });
                
                return true;
            } else {
                console.error('❌ Manifest introuvable:', this.manifestPath);
                return false;
            }
        } catch (error) {
            console.error('❌ Erreur chargement manifest:', error);
            return false;
        }
    }

    createAudioElement() {
        this.audioElement = new Audio();
        this.audioElement.volume = this.volume;
        
        this.audioElement.addEventListener('timeupdate', () => {
            this.currentTime = this.audioElement.currentTime;
            this.emit('timeupdate', {
                current: this.currentTime,
                duration: this.duration,
                percentage: (this.currentTime / this.duration) * 100
            });
        });

        this.audioElement.addEventListener('loadedmetadata', () => {
            this.duration = this.audioElement.duration;
            this.emit('loaded', { duration: this.duration });
        });

        this.audioElement.addEventListener('ended', () => {
            this.emit('ended');
            this.playNext();
        });

        this.audioElement.addEventListener('error', (e) => {
            console.error('❌ Audio error:', e);
            console.error('   Source:', this.audioElement.src);
            this.emit('error', e);
        });

        this.audioElement.addEventListener('play', () => {
            this.isPlaying = true;
            this.emit('play');
        });

        this.audioElement.addEventListener('pause', () => {
            this.isPlaying = false;
            this.emit('pause');
        });
        
        this.audioElement.addEventListener('canplay', () => {
            console.log('✅ Audio ready to play');
        });
    }

    // Gestion des stations
    loadStations() {
        const defaultStations = [
            {
                id: 'znk-fm',
                name: 'ZNK BOUM RADIO',
                genre: 'Art & Communication',
                description: 'Votre station de référence pour l\'actualité tech, innovation et culture digitale',
                logo: 'ZNK',
                type: 'live',
                listeners: 1247
            },
            {
                id: 'tech-radio',
                name: 'Tech Radio',
                genre: 'Innovation',
                description: '100% technologie, innovations et découvertes digitales',
                logo: 'TR',
                type: 'live',
                listeners: 892
            },
            {
                id: 'culture-fm',
                name: 'Culture FM',
                genre: 'Arts & Culture',
                description: 'Arts, littérature et débats culturels pour les passionnés',
                logo: 'CF',
                type: 'live',
                listeners: 634
            },
            {
                id: 'music-wave',
                name: 'Music Wave',
                genre: 'Hits & Charts',
                description: 'Les meilleurs hits du moment en non-stop',
                logo: 'MW',
                type: 'live',
                listeners: 2156
            },
            {
                id: 'jazz-cafe',
                name: 'Jazz Café',
                genre: 'Jazz & Soul',
                description: 'Une sélection raffinée de jazz classique et contemporain',
                logo: 'JC',
                type: 'live',
                listeners: 445
            },
            {
                id: 'news-24',
                name: 'News 24/7',
                genre: 'Actualités',
                description: 'L\'info en continu, 24h/24 et 7j/7',
                logo: 'N24',
                type: 'live',
                listeners: 3892
            }
        ];

        defaultStations.forEach(station => {
            this.stations.set(station.id, station);
        });
    }

    // 🔧 MÉTHODE MISE À JOUR : Obtenir le chemin correct d'un fichier audio
    getAudioFilePath(filename) {
        const fullPath = path.join(this.audioPath, filename);
        
        // Vérifier que le fichier existe
        if (!fs.existsSync(fullPath)) {
            console.error('❌ Fichier audio introuvable:', fullPath);
            return null;
        }
        
        // Retourner en format file://
        return `file://${fullPath}`;
    }

    // 🔧 MÉTHODE MISE À JOUR : Lecture d'un fichier depuis les archives
    playArchive(archiveId) {
        const track = this.archives.get(archiveId);
        if (!track) {
            console.error('❌ Archive audio inconnue:', archiveId);
            return false;
        }

        const audioPath = this.getAudioFilePath(track.filename);
        if (!audioPath) {
            console.error('❌ Impossible de charger:', track.filename);
            return false;
        }

        console.log('▶️  Lecture:', track.title, '→', audioPath);

        this.currentTrack = {
            type: 'archive',
            ...track,
            title: track.title,
            artist: track.artist || 'ZNK'
        };

        this.audioElement.src = audioPath;
        this.audioElement.play()
            .then(() => {
                console.log('✅ Lecture démarrée');
                this.emit('trackchange', this.currentTrack);
            })
            .catch(err => {
                console.error('❌ Erreur play():', err);
            });
        
        return true;
    }

    // Lecture d'une station
    playStation(stationId) {
        const station = this.stations.get(stationId);
        if (!station) {
            console.error('❌ Station inconnue:', stationId);
            return false;
        }

        this.currentTrack = {
            type: 'station',
            ...station,
            title: `${station.name} - En direct`,
            artist: `Live • ${station.genre}`
        };

        // Pour une vraie station, on utiliserait une URL de stream
        // this.audioElement.src = station.streamUrl;
        // this.audioElement.play();
        
        console.log('📻 Station sélectionnée:', station.name);
        this.emit('stationchange', this.currentTrack);
        this.emit('trackchange', this.currentTrack);
        
        return true;
    }

    // Contrôles de lecture
    play() {
        if (this.audioElement.src) {
            return this.audioElement.play();
        }
    }

    pause() {
        this.audioElement.pause();
    }

    togglePlay() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    stop() {
        this.pause();
        this.audioElement.currentTime = 0;
    }

    // Navigation
    playNext() {
        const currentIndex = this.playlist.findIndex(t => t.id === this.currentTrack?.id);
        if (currentIndex < this.playlist.length - 1) {
            const nextTrack = this.playlist[currentIndex + 1];
            this.playArchive(nextTrack.id);
        } else {
            // Boucler sur la playlist
            if (this.playlist.length > 0) {
                this.playArchive(this.playlist[0].id);
            } else {
                this.emit('playlistend');
            }
        }
    }

    playPrevious() {
        const currentIndex = this.playlist.findIndex(t => t.id === this.currentTrack?.id);
        if (currentIndex > 0) {
            const prevTrack = this.playlist[currentIndex - 1];
            this.playArchive(prevTrack.id);
        }
    }

    // Seek
    seek(seconds) {
        if (this.audioElement.src && this.duration) {
            this.audioElement.currentTime = Math.max(0, Math.min(seconds, this.duration));
        }
    }

    seekToPercentage(percentage) {
        if (this.duration) {
            this.seek((percentage / 100) * this.duration);
        }
    }

    forward(seconds = 10) {
        this.seek(this.currentTime + seconds);
    }

    rewind(seconds = 10) {
        this.seek(this.currentTime - seconds);
    }

    // Volume
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        this.audioElement.volume = this.volume;
        this.emit('volumechange', this.volume);
    }

    mute() {
        this.audioElement.muted = true;
        this.emit('mute');
    }

    unmute() {
        this.audioElement.muted = false;
        this.emit('unmute');
    }

    toggleMute() {
        if (this.audioElement.muted) {
            this.unmute();
        } else {
            this.mute();
        }
    }

    // Playlist
    setPlaylist(tracks) {
        this.playlist = tracks;
        this.emit('playlistchange', this.playlist);
    }

    addToPlaylist(track) {
        this.playlist.push(track);
        this.emit('playlistchange', this.playlist);
    }

    removeFromPlaylist(trackId) {
        this.playlist = this.playlist.filter(t => t.id !== trackId);
        this.emit('playlistchange', this.playlist);
    }

    clearPlaylist() {
        this.playlist = [];
        this.emit('playlistchange', this.playlist);
    }

    // 🔧 NOUVELLE MÉTHODE : Charger une émission complète
    loadEmission(emissionId) {
        if (!this.manifest) {
            console.error('❌ Manifest non chargé');
            return false;
        }
        
        const emission = this.manifest.emissions.find(e => e.id === emissionId);
        if (!emission) {
            console.error('❌ Émission introuvable:', emissionId);
            return false;
        }
        
        this.setPlaylist(emission.tracks);
        console.log('✅ Émission chargée:', emission.name, `(${emission.tracks.length} pistes)`);
        
        return true;
    }

    // 🔧 NOUVELLE MÉTHODE : Obtenir toutes les émissions
    getEmissions() {
        if (!this.manifest) return [];
        return this.manifest.emissions;
    }

    // Event system
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    off(event, callback) {
        if (this.listeners.has(event)) {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    console.error(`❌ Erreur callback ${event}:`, e);
                }
            });
        }
    }

    setupEventListeners() {
        // Écouter les messages P2P pour les nouveaux fichiers audio
        if (window.znkP2P) {
            window.znkP2P.onMessage = (data) => {
                this.receivePublishedAudio(data);
            };
        }
    }

    // Utilitaires
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    // 🔧 NOUVELLE MÉTHODE : Diagnostique complet
    diagnose() {
        console.log('🔍 === DIAGNOSTIC ZNK AUDIO ===');
        console.log('📦 Packagé:', this.isPackaged);
        console.log('📁 Audio path:', this.audioPath);
        console.log('📄 Manifest path:', this.manifestPath);
        console.log('✅ Dossier existe:', fs.existsSync(this.audioPath));
        console.log('✅ Manifest existe:', fs.existsSync(this.manifestPath));
        
        if (fs.existsSync(this.audioPath)) {
            const files = fs.readdirSync(this.audioPath);
            console.log('📂 Fichiers audio:', files.filter(f => f.endsWith('.mp3')).length);
        }
        
        console.log('🎵 Archives chargées:', this.archives.size);
        console.log('📻 Stations:', this.stations.size);
        console.log('🎼 Playlist:', this.playlist.length);
        console.log('=== FIN DIAGNOSTIC ===');
    }

    // État actuel
    getState() {
        return {
            currentTrack: this.currentTrack,
            isPlaying: this.isPlaying,
            currentTime: this.currentTime,
            duration: this.duration,
            volume: this.volume,
            playlist: this.playlist,
            stations: Array.from(this.stations.values()),
            archives: Array.from(this.archives.values()),
            emissions: this.getEmissions()
        };
    }
}

// Export global
window.znkAudio = new ZNKAudioSystem().init();

// Pour usage en module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ZNKAudioSystem;
}

// Auto-diagnostic au démarrage (mode dev uniquement)
if (typeof window !== 'undefined' && !window.znkAudio.isPackaged) {
    setTimeout(() => {
        window.znkAudio.diagnose();
    }, 1000);
}