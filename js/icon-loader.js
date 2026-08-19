/**
 * Chargeur d'icônes universel
 * Fonctionne en dev et en production
 */
class IconLoader {
    constructor() {
        this.manifests = new Map();
        this.baseURL = window.location.origin;
    }

    /**
     * Charger un manifest d'icônes
     */
    async loadManifest(manifestPath, options = {}) {
        try {
            // Normaliser le chemin (toujours commencer par /)
            const normalizedPath = manifestPath.startsWith('/') 
                ? manifestPath 
                : '/' + manifestPath;

            const fullURL = this.baseURL + normalizedPath;
            console.log('🔍 Chargement manifest:', fullURL);

            const response = await fetch(fullURL);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const manifest = await response.json();
            this.manifests.set(manifestPath, manifest);
            
            console.log('✅ Manifest chargé:', Object.keys(manifest).length, 'icônes');
            
            // Auto-appliquer si demandé
            if (options.autoApply) {
                this.applyManifest(manifestPath, options);
            }
            
            return manifest;
            
        } catch (error) {
            console.error('❌ Erreur chargement manifest:', error);
            
            // Fallback
            if (options.fallback) {
                console.log('🔄 Utilisation fallback...');
                return options.fallback;
            }
            
            throw error;
        }
    }

    /**
     * Appliquer les icônes du manifest au DOM
     */
    applyManifest(manifestPath, options = {}) {
        const manifest = this.manifests.get(manifestPath);
        if (!manifest) {
            console.error('❌ Manifest non chargé:', manifestPath);
            return;
        }

        const { selector = '[data-icon]', attribute = 'data-icon' } = options;
        
        Object.entries(manifest).forEach(([iconName, iconData]) => {
            // Trouver les éléments avec data-icon="iconName"
            const elements = document.querySelectorAll(`${selector}="${iconName}"]`);
            
            elements.forEach(el => {
                if (el.tagName === 'IMG') {
                    // Pour <img>, mettre dans src
                    el.src = iconData;
                } else {
                    // Pour autres éléments, background-image
                    el.style.backgroundImage = `url(${iconData})`;
                    el.style.backgroundSize = 'contain';
                    el.style.backgroundRepeat = 'no-repeat';
                    el.style.backgroundPosition = 'center';
                }
                
                console.log('✅ Icône appliquée:', iconName, '→', el.tagName);
            });
        });
    }

    /**
     * Obtenir une icône spécifique
     */
    getIcon(manifestPath, iconName) {
        const manifest = this.manifests.get(manifestPath);
        return manifest ? manifest[iconName] : null;
    }
}

// Instance globale
window.iconLoader = new IconLoader();