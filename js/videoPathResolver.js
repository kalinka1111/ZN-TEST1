const { app } = require('electron');
const path = require('path');
const fs = require('fs');

class VideoPathResolver {
    constructor() {
        // Chemin des ressources en production
        this.resourcesPath = app.isPackaged 
            ? process.resourcesPath 
            : path.join(__dirname, '../resources');
        
        this.persistentVideosPath = path.join(this.resourcesPath, 'videos', 'persistent');
    }

    // Résoudre le chemin d'une vidéo persistante
    resolvePersistentVideo(filename) {
        const fullPath = path.join(this.persistentVideosPath, filename);
        
        // Vérifier si le fichier existe
        if (fs.existsSync(fullPath)) {
            // Retourner un custom protocol pour Electron
            return `app-video://persistent/${filename}`;
        }
        
        console.warn(`Vidéo persistante introuvable: ${filename}`);
        return null;
    }

    // Obtenir le chemin physique (pour le backend)
    getPhysicalPath(filename) {
        return path.join(this.persistentVideosPath, filename);
    }

    // Lister toutes les vidéos persistantes
    listPersistentVideos() {
        try {
            const files = fs.readdirSync(this.persistentVideosPath);
            return files.filter(file => 
                file.endsWith('.mp4') || 
                file.endsWith('.webm') || 
                file.endsWith('.mov')
            );
        } catch (error) {
            console.error('Erreur lecture vidéos persistantes:', error);
            return [];
        }
    }

    // Charger le manifest des vidéos persistantes
    loadPersistentManifest() {
        const manifestPath = path.join(this.persistentVideosPath, 'manifest.json');
        
        if (fs.existsSync(manifestPath)) {
            const data = fs.readFileSync(manifestPath, 'utf8');
            return JSON.parse(data);
        }
        
        return [];
    }
}

module.exports = new VideoPathResolver();