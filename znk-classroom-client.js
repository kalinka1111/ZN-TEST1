// ============================================
// ZNK CLASSROOM CLIENT (côté ÉLÈVE)
// Reprend le pattern "local-first + queue de sync" de znk-p2p-manager.js,
// mais branché sur le vrai serveur de classe (znk-classroom-server.js) au lieu
// d'une API cloud. Fonctionne entièrement hors-ligne ; se resynchronise dès que
// le réseau de l'école est retrouvé (pas besoin d'Internet).
// ============================================

class ZNKClassroomClient {
    constructor(loginId) {
        this.loginId = loginId;
        this.serverInfo = this.loadServerInfo();   // { ip, port, classeId, nom... } en cache
        this.profil = this.loadProfil();
    }

    // --------------------------------------------
    // Cache local (persiste même sans réseau)
    // --------------------------------------------

    storageKey(suffix) { return `znk_classroom_${this.loginId}_${suffix}`; }

    loadServerInfo() {
        try { return JSON.parse(localStorage.getItem('znk_classroom_server') || 'null'); }
        catch (e) { return null; }
    }
    saveServerInfo(info) {
        this.serverInfo = info;
        localStorage.setItem('znk_classroom_server', JSON.stringify(info));
    }

    loadProfil() {
        try { return JSON.parse(localStorage.getItem(this.storageKey('profil')) || 'null'); }
        catch (e) { return null; }
    }
    saveProfil(profil) {
        this.profil = profil;
        localStorage.setItem(this.storageKey('profil'), JSON.stringify(profil));
    }

    getDevoirsLocaux() {
        try { return JSON.parse(localStorage.getItem(this.storageKey('devoirs')) || '[]'); }
        catch (e) { return []; }
    }
    saveDevoirsLocaux(devoirs) {
        localStorage.setItem(this.storageKey('devoirs'), JSON.stringify(devoirs));
    }

    getQueueSoumissions() {
        try { return JSON.parse(localStorage.getItem(this.storageKey('queue')) || '[]'); }
        catch (e) { return []; }
    }
    saveQueueSoumissions(queue) {
        localStorage.setItem(this.storageKey('queue'), JSON.stringify(queue));
    }

    // --------------------------------------------
    // Découverte + connexion au serveur du prof (réseau de l'école)
    // --------------------------------------------

    // Retrouve le PC du prof sur le réseau local. Ne nécessite aucun Internet.
    // Si l'élève n'est pas à l'école (pas sur le même réseau), retourne null et
    // l'appli continue de fonctionner sur le cache local (this.serverInfo /
    // this.getDevoirsLocaux()).
    async decouvrirServeur(timeoutMs = 3000) {
        if (!window.electronAPI || !window.electronAPI.classroomDiscover) {
            console.warn('⚠️ classroomDiscover indisponible (hors Electron ?)');
            return null;
        }
        const res = await window.electronAPI.classroomDiscover(timeoutMs);
        const trouve = res && res.data;
        if (trouve) {
            this.saveServerInfo(trouve);
            console.log('🏫 Serveur de classe trouvé:', trouve.nom, `@ ${trouve.ip}:${trouve.port}`);
        } else {
            console.log('ℹ️ Aucun serveur de classe trouvé sur ce réseau (mode hors-ligne)');
        }
        return trouve;
    }

    async login(pin) {
        // Toujours (re)tenter une découverte fraîche avant de se connecter :
        // l'IP du prof peut changer d'un jour à l'autre (DHCP).
        const serverInfo = this.serverInfo || await this.decouvrirServeur();
        if (!serverInfo) {
            return { success: false, error: 'Serveur de classe introuvable sur ce réseau' };
        }

        const res = await window.electronAPI.classroomLogin(serverInfo, this.loginId, pin);
        if (res.success) {
            this.saveProfil(res.data.profil);
            await this.synchroniser(); // récupère tout de suite les devoirs à jour
        }
        return res;
    }

    // --------------------------------------------
    // Le cœur : synchro par manifeste (n'échange que ce qui manque)
    // --------------------------------------------

    async synchroniser() {
        if (!this.serverInfo) {
            const trouve = await this.decouvrirServeur();
            if (!trouve) return { success: false, offline: true };
        }

        const devoirsConnus = this.getDevoirsLocaux().map(d => ({ id: d.id, version: d.version }));
        const soumissionsEnAttente = this.getQueueSoumissions();

        let res;
        try {
            res = await window.electronAPI.classroomSyncManifest(this.serverInfo, {
                eleveLoginId: this.loginId,
                devoirsConnus,
                soumissionsEnAttente
            });
        } catch (e) {
            console.warn('⚠️ Synchro échouée (réseau école indisponible ?):', e.message);
            return { success: false, offline: true };
        }

        if (!res.success) return { success: false, offline: true };

        // 1. Fusionner les nouveaux devoirs / versions mises à jour
        const { devoirsAEnvoyer, accusesReception } = res.data;
        if (devoirsAEnvoyer && devoirsAEnvoyer.length) {
            const locaux = this.getDevoirsLocaux();
            for (const d of devoirsAEnvoyer) {
                const idx = locaux.findIndex(l => l.id === d.id);
                if (idx >= 0) locaux[idx] = d; else locaux.push(d);
            }
            this.saveDevoirsLocaux(locaux);
            console.log(`✅ ${devoirsAEnvoyer.length} devoir(s) reçu(s)/mis à jour`);
        }

        // 2. Retirer de la queue les soumissions confirmées reçues par le serveur
        if (accusesReception && accusesReception.length) {
            const restant = this.getQueueSoumissions().filter(
                s => !accusesReception.some(a => a.idLocal === s.idLocal && a.statut === 'recu')
            );
            this.saveQueueSoumissions(restant);
            console.log(`✅ ${accusesReception.length} soumission(s) confirmée(s) par le prof`);
        }

        return { success: true, devoirsRecus: devoirsAEnvoyer?.length || 0 };
    }

    // --------------------------------------------
    // Soumission d'un devoir (marche même sans réseau : mise en queue automatique)
    // --------------------------------------------

    soumettreDevoir(devoirId, contenu, fichierNom = null) {
        const soumission = {
            idLocal: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            devoirId,
            eleveLoginId: this.loginId,
            contenu,
            fichierNom,
            creeLe: new Date().toISOString()
        };

        const queue = this.getQueueSoumissions();
        queue.push(soumission);
        this.saveQueueSoumissions(queue);
        console.log('📋 Devoir enregistré localement, en attente d\'envoi au prof');

        // Tentative immédiate si le réseau de l'école est déjà là ; sinon reste
        // en queue jusqu'au prochain synchroniser() (ex: relancé au retour à l'école).
        this.synchroniser().catch(() => {});

        return soumission;
    }

    getNombreEnAttente() {
        return this.getQueueSoumissions().length;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ZNKClassroomClient;
} else {
    window.ZNKClassroomClient = ZNKClassroomClient;
}

// ============================================
// EXEMPLE D'UTILISATION (côté écran élève)
// ============================================
/*
const classe = new ZNKClassroomClient('leam');

// Au chargement de la page (l'élève est peut-être à l'école, peut-être chez lui)
await classe.decouvrirServeur();

// Connexion (échoue proprement si hors réseau école ET jamais connecté avant)
const { success, error } = await classe.login('4821');

// Lister les devoirs (toujours depuis le cache local, à jour ou pas selon la sync)
const devoirs = classe.getDevoirsLocaux();

// Rendre un devoir : fonctionne hors-ligne, s'envoie tout seul dès que possible
classe.soumettreDevoir('dev_123', 'Ma réponse rédigée...', null);

// Bouton "Resynchroniser" explicite (ex: dès que l'élève sait qu'il est de retour à l'école)
const resultat = await classe.synchroniser();
*/
