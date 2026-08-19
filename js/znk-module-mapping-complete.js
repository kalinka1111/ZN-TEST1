// ZNK237-APP MODULE MAPPING - Auto-généré
(function () {
    window.moduleMapping = window.moduleMapping || {};
    const ROOT = './';

    Object.assign(window.moduleMapping, {
        // === DASHBOARDS PRINCIPAUX ===
        'index': ROOT + 'index.html',
        'auth-hub': ROOT + 'auth-hub.html',
        'inscription': ROOT + 'inscription.html',
        'admin-dash': ROOT + 'ZNKadminDash.html',
        'membres-dash': ROOT + 'ZNKMembresDash.html',
        'art-etudes-dash': ROOT + 'ZNKartEtudesDash.html',
        'visiteur-dash': ROOT + 'ZNKvisiteurDash.html',

        // === MODULES STANDARDS ===
        'module-222user-profile': ROOT + 'modules/222user-profile.html',
        'module-Live': ROOT + 'modules/Live.html',
        'module-Regie': ROOT + 'modules/Regie.html',
        'module-actv': ROOT + 'modules/actv.html',
        'module-affiche-maker': ROOT + 'modules/affiche-maker.html',
        'module-animation': ROOT + 'modules/animation.html',
        'module-archives': ROOT + 'modules/archives.html',
        'module-artflow-direct': ROOT + 'modules/artflow-direct.html',
        'module-artflow': ROOT + 'modules/artflow.html',
        'module-avatar-makerKids': ROOT + 'modules/avatar-makerKids.html',
        'module-avatar': ROOT + 'modules/avatar.html',
        'module-comptabilite': ROOT + 'modules/comptabilite.html',
        'module-dessin': ROOT + 'modules/dessin.html',
        'module-etudes': ROOT + 'modules/etudes.html',
        'module-fida-cameroun': ROOT + 'modules/fida-cameroun.html',
        'module-fida-social': ROOT + 'modules/fida-social.html',
        'module-fondation': ROOT + 'modules/fondation.html',
        'module-gallery': ROOT + 'modules/gallery.html',
        'module-icon-maker': ROOT + 'modules/icon-maker.html',
        'module-music-ia': ROOT + 'modules/music-ia.html',
        'module-music-pro': ROOT + 'modules/music-pro.html',
        'module-music': ROOT + 'modules/music.html',
        'module-nomad-bank-secure2': ROOT + 'modules/nomad-bank-secure2.html',
        'module-nomad': ROOT + 'modules/nomad.html',
        'module-parametres': ROOT + 'modules/parametres.html',
        'module-profil-du-user': ROOT + 'modules/profil-du-user.html',
        'module-publierAdmin': ROOT + 'modules/publierAdmin.html',
        'module-radio': ROOT + 'modules/radio.html',
        'module-sculptor': ROOT + 'modules/sculptor.html',
        'module-user-profile copie': ROOT + 'modules/user-profile copie.html',
        'module-user-profile': ROOT + 'modules/user-profile.html',
        'module-video-ia': ROOT + 'modules/video-ia.html',
        'module-video-studio': ROOT + 'modules/video-studio.html',
        'module-whatsznk': ROOT + 'modules/whatsznk.html',
        'module-znk-camera-core-local': ROOT + 'modules/znk-camera-core-local.html',

        // === MODULES ADMIN ===
        'admin-FIDA-gestion': ROOT + 'modules-admin/FIDA-gestion.html',
        'admin-ZNK - Système Unifié IA': ROOT + 'modules-admin/ZNK - Système Unifié IA.html',
        'admin-ZNKManifestMaker-Base64': ROOT + 'modules-admin/ZNKManifestMaker-Base64.html',
        'admin-ZNKSECURE': ROOT + 'modules-admin/ZNKSECURE.html',
        'admin-ZNKarchives': ROOT + 'modules-admin/ZNKarchives.html',

        // === ASSETS & MANIFESTS ===
        'manifest-icons-b64': ROOT + 'icons/manifest-icon-b64.json',
        'icons-intro-manifest': ROOT + 'icons/icons-intro-manifest.json',
        'assets-manifest-b64': ROOT + 'assets/icons/manifest-icon-b64.json',
        'assets-icons-intro': ROOT + 'assets/icons/icons-intro-manifest.json'
    });

    console.log('✅ ZNK237 moduleMapping initialisé:', Object.keys(window.moduleMapping).length, 'entrées');
    
    // Helper pour charger un module
    window.loadModule = function(moduleKey) {
        const path = window.moduleMapping[moduleKey];
        if (!path) {
            console.error('❌ Module non trouvé:', moduleKey);
            return null;
        }
        return path;
    };
})();
