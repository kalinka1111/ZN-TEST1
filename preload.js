/**
 * Preload Script - Compatible avec contextIsolation: false ET true
 * Permet d'utiliser directement ipcRenderer dans les pages (legacy)
 * ET expose une API sécurisée via contextBridge (recommandé, utilisé quand
 * contextIsolation: true dans main.js, càd tant que ZNK_ALLOW_LEGACY n'est pas défini).
 */

const { contextBridge, ipcRenderer, webUtils } = require('electron');

// ========================================
// MODE 1: contextIsolation: false (legacy)
// ========================================
// ⚠️ Attention : si main.js tourne avec contextIsolation: true (le défaut actuel,
// sauf variable d'env ZNK_ALLOW_LEGACY=1), cette assignation directe à window
// n'est PAS fiable pour exposer l'objet electron complet au monde de la page.
// Elle est conservée pour compatibilité avec d'anciennes pages (ex: auth-hub.html)
// qui tournent en mode legacy (ZNK_ALLOW_LEGACY=1, contextIsolation: false).
// Pour tout code nouveau, utilise l'API sécurisée exposée plus bas (electronAPI, znkManifest, znkAudio).
try {
    window.electron = require('electron');
} catch (e) {
    console.warn('⚠️ [Preload] window.electron non assigné (probablement contextIsolation actif):', e.message);
}

// ========================================
// MODE 2: API sécurisée via contextBridge
// ========================================
try {
console.log('🔎 [DIAG preload] Avant exposeInMainWorld("electronAPI") — contextIsolated:', process.contextIsolated);
contextBridge.exposeInMainWorld('electronAPI', {
    // Navigation (pour znk-auto-nav.js)
    navigateToModule: (moduleName) => {
        console.log('🔵 [Preload] Navigation vers:', moduleName);
        ipcRenderer.send('navigate-to-module', moduleName);
    },

    navigateTo: (moduleName) => {
        console.log('🔵 [Preload] Navigate-to vers:', moduleName);
        ipcRenderer.send('navigate-to', moduleName);
    },

    authScreenReady: () => {
        console.log('✅ [Preload] Auth screen ready');
        ipcRenderer.send('auth-screen-ready');
    },

    // Listeners navigation
    onNavigationSuccess: (callback) => {
        ipcRenderer.on('navigation-success', (event, data) => callback(data));
    },

    onNavigationError: (callback) => {
        ipcRenderer.on('navigation-error', (event, data) => callback(data));
    },

    onModuleNotFound: (callback) => {
        ipcRenderer.on('module-not-found', (event, data) => callback(data));
    },

    // Gestion utilisateurs
    saveNewUser: (userData) => ipcRenderer.send('save-new-user', userData),
    onUserSaved: (callback) => ipcRenderer.on('user-saved', (event, data) => callback(data)),

    getAllUsers: () => ipcRenderer.invoke('get-all-users'),
    getUserData: (userId) => ipcRenderer.invoke('get-user-data', userId),
    verifyUserPin: (userId, pin) => ipcRenderer.invoke('verify-user-pin', userId, pin),

    updateUserData: (userId, updates) => ipcRenderer.send('update-user-data', userId, updates),
    onUserUpdated: (callback) => ipcRenderer.on('user-updated', (event, data) => callback(data)),

    deleteUser: (userId) => ipcRenderer.invoke('delete-user', userId),
    getUsersStats: () => ipcRenderer.invoke('get-users-stats'),

    // Mode "classe locale" (école/village isolé, sans internet, sans Python)
    // Côté PROF : démarre le serveur + l'annonce sur le réseau de l'école.
    classroomStart: (opts) => ipcRenderer.invoke('znk-classroom:start', opts),
    classroomStop: () => ipcRenderer.invoke('znk-classroom:stop'),
    classroomAddEleve: (eleve) => ipcRenderer.invoke('znk-classroom:add-eleve', eleve),
    classroomListEleves: () => ipcRenderer.invoke('znk-classroom:list-eleves'),
    classroomPublishDevoir: (devoir) => ipcRenderer.invoke('znk-classroom:publish-devoir', devoir),
    classroomListDevoirs: (since) => ipcRenderer.invoke('znk-classroom:list-devoirs', { since }),
    // Côté ÉLÈVE : trouve le serveur du prof puis dialogue avec lui.
    classroomDiscover: (timeoutMs) => ipcRenderer.invoke('znk-classroom:discover', { timeoutMs }),
    classroomLogin: (serverInfo, loginId, pin) => ipcRenderer.invoke('znk-classroom:login', { serverInfo, loginId, pin }),
    classroomGetDevoirs: (serverInfo, since) => ipcRenderer.invoke('znk-classroom:get-devoirs', { serverInfo, since }),
    classroomSubmit: (serverInfo, payload) => ipcRenderer.invoke('znk-classroom:submit', { serverInfo, payload }),
    classroomSyncManifest: (serverInfo, manifest) => ipcRenderer.invoke('znk-classroom:sync-manifest', { serverInfo, manifest }),

    // Conversion vidéo
    convertVideo: (options) => ipcRenderer.invoke('convert-video', options),
    openOutputFolder: () => ipcRenderer.invoke('open-output-folder'),
    getOutputFolder: () => ipcRenderer.invoke('get-output-folder'),
    selectFiles: () => ipcRenderer.invoke('select-files'),
    makeVideoPersistent: (options) => ipcRenderer.invoke('make-video-persistent', options),
    getVideoUrl: (options) => ipcRenderer.invoke('get-video-url', options),
    // ArtFlow : publication vidéo visible par tous (upload du fichier +
    // push des métadonnées vers le VPS, relayé en local par server.py)
    publishArtflowPost: (options) => ipcRenderer.invoke('artflow:publish-post', options),
    uploadArtflowVideo: (options) => ipcRenderer.invoke('artflow:upload-video', options),
    // Vidéos "seed" (assets/videos-seed) : contenu figé livré avec l'appli,
    // identique sur toutes les installations — utilisé par creer-lecon-admin.html
    // pour choisir une vidéo déjà présente plutôt que d'en importer une nouvelle.
    listSeedVideos: () => ipcRenderer.invoke('list-seed-videos'),

    // Export vitesse (ZNKVitesseVideo) — ffmpeg natif, setpts/atempo, sortie .mp4
    changeVideoSpeed: (options) => ipcRenderer.invoke('znk-speed-export', options),
    onSpeedExportProgress: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('speed-export-progress', handler);
        return () => ipcRenderer.removeListener('speed-export-progress', handler);
    },

    // Export transitions photo (ZNKTransitions) — ffmpeg natif, filter_complex
    // fourni par le renderer (même code que le repli ffmpeg.wasm), sortie .mp4
    transitionVideos: (options) => ipcRenderer.invoke('znk-transition-export', options),
    onTransitionExportProgress: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('transition-export-progress', handler);
        return () => ipcRenderer.removeListener('transition-export-progress', handler);
    },

    // Export fondu (ZNKFadeVideo) — ffmpeg natif, xfade "fade" classique, sortie .mp4
    fadeVideos: (options) => ipcRenderer.invoke('znk-fade-export', options),
    onFadeExportProgress: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('fade-export-progress', handler);
        return () => ipcRenderer.removeListener('fade-export-progress', handler);
    },

    // Export animation (ZNKAnim) — séquence d'images -> mp4 via ffmpeg natif.
    // 1) writeAnimFrameBatch : envoie les frames rendues par lots (évite un
    //    message IPC unique trop volumineux pour les animations longues).
    // 2) finalizeAnimExport : déclenche l'encodage ffmpeg (image2 -> mp4) une
    //    fois toutes les frames reçues.
    writeAnimFrameBatch: (options) => ipcRenderer.invoke('znk-anim-write-frame-batch', options),
    finalizeAnimExport: (options) => ipcRenderer.invoke('znk-anim-finalize-export', options),
    onAnimExportProgress: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('anim-export-progress', handler);
        return () => ipcRenderer.removeListener('anim-export-progress', handler);
    },

    // Transcription vocale locale (whisper.cpp, offline) — ZNK-LIVREmoi
    // audioDataUrl: "data:audio/webm;base64,..." -> { success, text } ou { success:false, error }
    transcribeAudio: (audioDataUrl) => ipcRenderer.invoke('transcribe-audio', audioDataUrl),

    // Audio persistant (existait déjà côté main.js, jamais exposé jusqu'ici)
    makeAudioPersistent: (options) => ipcRenderer.invoke('make-audio-persistent', options),
    selectAudioFiles: () => ipcRenderer.invoke('select-audio-files'),
    getAudioUrl: (options) => ipcRenderer.invoke('get-audio-url', options),

    // Banque de sons ZNK Studio musical (instruments importés : piano, guitare,
    // harpe, balafon, flûte, tam-tam) — fichiers statiques dans assets/sounds,
    // lus via fs côté main (voir soundbank:* dans main.js), pas via fetch()
    // (peu fiable en file:// une fois packagé, cf. AUDIO_PATHS/get-audio-url).
    loadSoundBankManifest: () => ipcRenderer.invoke('soundbank:load-manifest'),
    loadSoundBankFile: (filename) => ipcRenderer.invoke('soundbank:load-file', filename),
    // Lit un fichier choisi via selectAudioFiles (chemin natif) et le renvoie
    // en base64 — nécessaire car File.path n'existe plus côté renderer (voir
    // getPathForFile plus bas) : sans ça, un fichier choisi via le dialogue
    // natif ne peut pas être transformé en Blob pour l'upload serveur (voir
    // user-publish-radio.html, LOCAL_SERVER/.../track/sync-push).
    readAudioFile: (filePath) => ipcRenderer.invoke('read-audio-file', filePath),
    // Domaine du VPS (pour résoudre les URLs relatives /files/... renvoyées
    // par server.py) et cache à la demande d'une piste distante après lecture
    // (voir main.js pour le détail — implémente le sync-puis-offline en lecture).
    getRegistryUrl: () => ipcRenderer.invoke('get-registry-url'),
    // Réglage persistant de l'adresse du VPS (fichier znk-config.json dans
    // userData) — pour un futur écran de réglages, sans variable d'environnement.
    setRegistryUrl: (url) => ipcRenderer.invoke('set-registry-url', url),
    cacheAudioTrack: (options) => ipcRenderer.invoke('cache-audio-track', options),

    // Matériels de leçon : images et documents (terminal-lecons.html)
    makeMaterialPersistent: (options) => ipcRenderer.invoke('make-material-persistent', options),
    getMaterialUrl: (options) => ipcRenderer.invoke('get-material-url', options),
    getRadioAdminManifest: () => ipcRenderer.invoke('radio:get-admin-manifest'),
    getRadioUserManifest: () => ipcRenderer.invoke('radio:get-user-manifest'),

    // Sync catalogue radio officiel <-> VPS (via server.py local, voir main.js)
    pullOfficialRadioCatalog: () => ipcRenderer.invoke('radio:pull-official-catalog'),
    pushOfficialRadioCatalog: (emission) => ipcRenderer.invoke('radio:push-official-catalog', { emission }),

    // Depuis Electron 32+, File.path n'est plus fiable (retiré pour raisons de
    // sécurité) : il faut passer par webUtils.getPathForFile(), qui ne peut être
    // appelé QUE depuis le preload (pas depuis la page elle-même). C'est ce que
    // terminal-lecons.html appelle pour récupérer le chemin natif du fichier
    // choisi via <input type="file"> avant de le transmettre à makeVideoPersistent
    // / makeAudioPersistent / makeMaterialPersistent.
    getPathForFile: (file) => {
        try {
            return webUtils.getPathForFile(file);
        } catch (e) {
            console.warn('⚠️ [Preload] webUtils.getPathForFile a échoué:', e.message);
            return file && file.path ? file.path : null; // repli pour anciennes versions d'Electron
        }
    },

    onConversionProgress: (callback) => {
        ipcRenderer.on('conversion-progress', (event, data) => callback(data));
    },

    // Système
    platform: process.platform,
    version: process.versions.electron,

    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getPlatform: () => ipcRenderer.invoke('get-platform'),
    getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
    isDevMode: () => ipcRenderer.invoke('is-dev-mode'),
    getPreloadPath: () => ipcRenderer.invoke('get-preload-path'),

    openExternal: (url) => ipcRenderer.send('open-external', url),
    openPath: (targetPath) => ipcRenderer.invoke('open-path', targetPath),

    // Sauvegarde de fichier (dialogue natif "Enregistrer") — existait côté
    // main.js ('save-file') mais n'était exposée nulle part ici, donc aucun
    // module ne pouvait l'appeler. Corrigé.
    saveFile: (options) => ipcRenderer.invoke('save-file', options),

    // Manifeste des téléchargements (partagé, userData) — alimenté
    // automatiquement à chaque saveFile() réussi. Utilisé par archives.html
    // pour afficher tout ce qui a été téléchargé ailleurs dans ZNK, sans
    // réimport manuel.
    listDownloads: () => ipcRenderer.invoke('list-downloads'),
    removeDownloadEntry: (id) => ipcRenderer.invoke('remove-download-entry', { id }),
    clearDownloads: () => ipcRenderer.invoke('clear-downloads'),
    onDownloadAdded: (callback) => {
        ipcRenderer.on('download-added', (event, data) => callback(data));
    },

    // --- ZNK Auto Executor / Terminal Admin (réel) ---
    terminalSelectWorkspace: () => ipcRenderer.invoke('terminal:select-workspace'),
    terminalGetDefaultWorkspace: () => ipcRenderer.invoke('terminal:get-default-workspace'),
    terminalListDirectory: (dirPath) => ipcRenderer.invoke('terminal:list-directory', { dirPath }),
    // channelId optionnel (défaut 'main') : permet de faire tourner plusieurs
    // process en parallèle sans qu'ils se bloquent entre eux (ex: 'server' pour
    // un `python3 server.py` de fond, indépendant du terminal principal).
    terminalExecute: (command, cwd, requestId, channelId) =>
        ipcRenderer.invoke('terminal:execute', { command, cwd, requestId, channelId }),
    terminalKill: (channelId) => ipcRenderer.invoke('terminal:kill', { channelId }),
    onTerminalOutput: (callback) => {
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('terminal-output', handler);
        return () => ipcRenderer.removeListener('terminal-output', handler);
    },

    // --- ZNK Professeur : données partagées (modules, interrogations, leçons, résultats) ---
    // Fichier JSON dans userData, indépendant du système znkManifest (vidéos/audio/icônes).
    // ⚠️ Ces deux méthodes existaient déjà côté main.js ('znk:read-data'/'znk:write-data')
    // mais n'étaient jamais exposées ici : znk-professeur-manifest.js ne pouvait donc
    // jamais persister sur disque, et retombait toujours sur localStorage seul.
    znkReadData: () => ipcRenderer.invoke('znk:read-data'),
    znkWriteData: (json) => ipcRenderer.invoke('znk:write-data', json),

    // --- ZNK Nomad : ledger partagé (comptes, wallets, cartes, PIN, mailbox) ---
    // Fichier séparé (znk-nomad-ledger.json), distinct du fichier professeur ci-dessus.
    // ⚠️ 2026-08-06 : même bug que znkReadData/znkWriteData plus haut — auth-hub.html,
    // ZNKSECURE.html et nomad.html appellent tous window.electronAPI.znkNomadReadData()/
    // znkNomadWriteData() depuis le début, mais ces méthodes n'ont jamais été exposées
    // ici (electronAPI.znkNomadWriteData était `undefined`) : chaque écriture (PIN,
    // création/suppression d'ID, compte bancaire) retombait silencieusement sur
    // localStorage seul, jamais sur le vrai fichier partagé. Les handlers IPC
    // 'znk-nomad:read-data'/'znk-nomad:write-data' existent côté main.js.
    znkNomadReadData: () => ipcRenderer.invoke('znk-nomad:read-data'),
    znkNomadWriteData: (json) => ipcRenderer.invoke('znk-nomad:write-data', json),

    // --- Seed ACTV (premier lancement) ---
    getSeedActvEmissions: () => ipcRenderer.invoke('seed:get-actv-emissions'),
    getSeedGalleryCurated: () => ipcRenderer.invoke('seed:get-gallery-curated'),

    // --- ZNK Admin Persistence (ZNKadminDash.html) ---
    savePersistentContent: (options) => ipcRenderer.invoke('save-persistent-content', options),
    saveManifest: (options) => ipcRenderer.invoke('save-manifest', options),
    syncToBuild: (options) => ipcRenderer.invoke('sync-to-build', options),

    // --- ZNK Radio (znk-publish-radio.html) ---
    // role: 'admin' | 'user' — détermine dans quel fichier l'émission est
    // enregistrée (voir main.js pour le détail des chemins).
    radioSaveEmission: (role, emission) => ipcRenderer.invoke('radio:save-emission', { role, emission }),
    radioDeleteEmission: (role, emissionId) => ipcRenderer.invoke('radio:delete-emission', { role, emissionId }),

    // Communication générique
    send: (channel, data) => {
        const validChannels = [
            'navigate-to-module',
            'navigate-to',
            'auth-screen-ready',
            'open-visual-navigator',
            'check-backend',
            'save-new-user',
            'update-user-data',
            'open-external'
        ];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        } else {
            console.warn('⚠️ [Preload] Canal non autorisé:', channel);
        }
    },

    receive: (channel, callback) => {
        const validChannels = [
            'navigation-success',
            'navigation-error',
            'module-not-found',
            'backend-status',
            'app-ready',
            'user-saved',
            'user-updated',
            'conversion-progress',
            'terminal-output'
        ];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => callback(...args));
        } else {
            console.warn('⚠️ [Preload] Canal de réception non autorisé:', channel);
        }
    },

    log: (message) => {
        console.log('[Electron]:', message);
    },

    // Accès admin caché
    verifyAdminKey: (key) => ipcRenderer.invoke('verify-admin-key', key)
});
console.log('✅ [DIAG preload] exposeInMainWorld("electronAPI") a réussi sans exception.');
} catch (e) {
    console.error('❌ [DIAG preload] exposeInMainWorld("electronAPI") A LEVÉ UNE EXCEPTION:', e);
}

// ========================================
// API pour les manifests (vidéos / audio / icônes)
// ========================================
contextBridge.exposeInMainWorld('znkManifest', {
    // Vidéos
    saveVideo: (videoData) => ipcRenderer.invoke('manifest:save-video', videoData),
    loadVideos: () => ipcRenderer.invoke('manifest:load-videos'),
    removeVideo: (videoId) => ipcRenderer.invoke('manifest:remove-video', videoId),

    // Audio
    saveAudio: (audioData) => ipcRenderer.invoke('manifest:save-audio', audioData),
    loadAudio: () => ipcRenderer.invoke('manifest:load-audio'),

    // Icônes
    saveIcon: (iconData) => ipcRenderer.invoke('manifest:save-icon', iconData),
    loadIcons: () => ipcRenderer.invoke('manifest:load-icons'),

    // Listener pour les mises à jour
    onVideoPersisted: (callback) => {
        ipcRenderer.on('video-persisted', (event, data) => callback(data));
    }

});

// ========================================
// API audio (sons UI)
// ========================================
contextBridge.exposeInMainWorld('znkAudio', {
    playSound: (soundName) => ipcRenderer.invoke('play-sound', soundName),
    setVolume: (volume) => ipcRenderer.invoke('set-volume', volume),
    getVolume: () => ipcRenderer.invoke('get-volume')
});

console.log('✅ Preload script chargé');
console.log('📡 electronAPI / znkManifest / znkAudio exposés via contextBridge');
console.log('🔧 electronAPI.terminalExecute disponible pour ZNK Auto Executor');

// ========================================
// ZNK DIAGNOSTIC ADMIN - auto-injecté sur TOUTE page/webview utilisant ce preload
// ========================================
// Pas besoin d'ajouter de <script> dans chaque fichier : ce preload étant
// chargé sur la fenêtre principale ET sur chaque <webview> (needsElectronAPI),
// le panneau apparaît automatiquement partout où le preload tourne.
//
// Avant : limité aux pages dont le chemin contenait 'admin'/'dash'/'modules-admin',
// ce qui l'empêchait d'apparaître dans modules-etudes/ (LIVREmoi, ArtEtudes-*,
// terminal-lecons...). Retiré : la bulle 🔍 est maintenant partout, ce qui est
// justement ce qui la rend utile pour diagnostiquer une webview précise.
// Échappatoire si besoin de le désactiver sur une page ponctuelle : définir
// window.__ZNK_NO_DIAG__ = true; avant que ce preload ne s'exécute (rare).
function znkShouldInjectDiagnostic() {
    try {
        return window.__ZNK_NO_DIAG__ !== true;
    } catch (e) {
        return true;
    }
}

function znkInjectDiagnosticPanel() {
    if (!znkShouldInjectDiagnostic()) return;
    if (document.getElementById('znk-diag-bubble')) return;

    const style = document.createElement('style');
    style.textContent = `
        #znk-diag-bubble {
            position: fixed; bottom: 18px; right: 18px; z-index: 999999;
            width: 44px; height: 44px; border-radius: 50%;
            background: rgba(20,20,20,0.85); color: #fff;
            display: flex; align-items: center; justify-content: center;
            font-size: 20px; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,0.4);
            font-family: monospace; user-select: none;
        }
        #znk-diag-panel {
            position: fixed; bottom: 70px; right: 18px; z-index: 999999;
            width: 340px; max-height: 60vh; overflow: auto;
            background: rgba(15,15,15,0.95); color: #d7ffd7;
            border-radius: 10px; padding: 14px; font-family: monospace;
            font-size: 12px; line-height: 1.6; box-shadow: 0 6px 20px rgba(0,0,0,0.5);
            display: none;
        }
        #znk-diag-panel.open { display: block; }
        #znk-diag-panel h4 { color: #9ef0c8; margin-bottom: 8px; font-size: 13px; }
        #znk-diag-panel .row { display:flex; justify-content:space-between; gap:8px; border-bottom:1px solid rgba(255,255,255,0.08); padding:3px 0; }
        #znk-diag-panel .ok { color:#9ef0c8; }
        #znk-diag-panel .bad { color:#ff9d9d; }
        #znk-diag-panel .refresh { margin-top:8px; width:100%; padding:6px; background:#2a2a2a; color:#fff; border:none; border-radius:6px; cursor:pointer; }
    `;
    document.head.appendChild(style);

    // IMPORTANT : ce qui suit doit s'exécuter dans le "main world" (contexte
    // JS de la page), pas dans le "isolated world" du preload — sinon
    // window.electronAPI y est TOUJOURS undefined (deux objets window
    // différents), même quand tout fonctionne réellement côté page.
    const diagScript = document.createElement('script');
    diagScript.textContent = `
    (function() {
        const bubble = document.createElement('div');
        bubble.id = 'znk-diag-bubble';
        bubble.textContent = '🔍';
        document.body.appendChild(bubble);

        const panel = document.createElement('div');
        panel.id = 'znk-diag-panel';
        document.body.appendChild(panel);

        function check(label, value) {
            const isGood = value && value !== 'undefined' && value !== '❌';
            return '<div class="row"><span>' + label + '</span><span class="' + (isGood ? 'ok' : 'bad') + '">' + value + '</span></div>';
        }

        function render() {
            const api = window.electronAPI || null;
            const rows = [
                ['Page', window.location.pathname.split('/').slice(-2).join('/')],
                ['Electron (UA)', /Electron/i.test(navigator.userAgent) ? '✅ oui' : '❌ non'],
                ['window.electronAPI', typeof window.electronAPI],
                ['window.znkManifest', typeof window.znkManifest],
                ['window.require (legacy)', typeof window.require],
                ['api.selectFiles', typeof (api && api.selectFiles)],
                ['api.convertVideo', typeof (api && api.convertVideo)],
                ['api.makeVideoPersistent', typeof (api && api.makeVideoPersistent)],
                ['api.getVideoUrl', typeof (api && api.getVideoUrl)],
                ['api.publishArtflowPost', typeof (api && api.publishArtflowPost)],
                ['api.uploadArtflowVideo', typeof (api && api.uploadArtflowVideo)],
                ['api.makeAudioPersistent', typeof (api && api.makeAudioPersistent)],
                ['api.makeMaterialPersistent', typeof (api && api.makeMaterialPersistent)],
                ['api.getPathForFile', typeof (api && api.getPathForFile)],
                ['api.znkReadData / znkWriteData', (api && typeof api.znkReadData === 'function' && typeof api.znkWriteData === 'function') ? 'function' : 'undefined'],
                ['api.radioSaveEmission', typeof (api && api.radioSaveEmission)],
                ['api.terminalExecute', typeof (api && api.terminalExecute)],
                ['api.transcribeAudio', typeof (api && api.transcribeAudio)],
            ];
            panel.innerHTML =
                '<h4>🔍 Diagnostic ZNK (admin)</h4>' +
                rows.map(function(r) { return check(r[0], r[1]); }).join('') +
                '<button class="refresh" id="znk-diag-refresh">🔄 Rafraîchir</button>';
            const btn = document.getElementById('znk-diag-refresh');
            if (btn) btn.onclick = render;
        }

        bubble.addEventListener('click', function() {
            panel.classList.toggle('open');
            if (panel.classList.contains('open')) render();
        });
    })();
    `;
    document.body.appendChild(diagScript);
    diagScript.remove();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', znkInjectDiagnosticPanel);
} else {
    znkInjectDiagnosticPanel();
}
