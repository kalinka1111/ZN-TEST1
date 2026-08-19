/**
 * ZNK - Client de synchronisation VPS (leçons + soumissions)
 * =============================================================
 *
 * À inclure via <script src="./js/znk-sync-client.js"></script>
 * dans terminal-lecons.html (côté prof) ET etudes.html (côté élève).
 *
 * Principe "avec mémoire" :
 * Après chaque pull réussi, on garde la date renvoyée par le serveur
 * (serverTime) dans localStorage. Au prochain pull, on ne redemande que
 * ce qui a changé depuis cette date -> pas besoin de tout retélécharger
 * à chaque connexion.
 *
 * Config attendue AVANT ce script (ex. dans un <script> juste avant) :
 *   window.ZNK_SYNC_CONFIG = {
 *     apiBase: 'https://ton-vps.example.com',   // adresse du VPS
 *     apiKey: 'xxxxx'                            // clé API du compte connecté
 *   };
 *
 * Si ZNK_SYNC_CONFIG n'existe pas, le module ne plante pas : il log juste
 * un avertissement et les fonctions renvoient { ok:false, offline:true }.
 */

const ZNKSync = (function () {

    function getConfig() {
        const cfg = window.ZNK_SYNC_CONFIG;
        if (!cfg || !cfg.apiBase) {
            console.warn('⚠️ ZNK_SYNC_CONFIG absent ou incomplet — sync VPS désactivée pour le moment.');
            return null;
        }
        return cfg;
    }

    // Clé localStorage où on mémorise "la dernière fois qu'on a demandé
    // les nouveautés" — une par type de donnée + par prof, pour ne pas
    // mélanger la mémoire de deux profs différents sur le même appareil.
    function lastSyncKey(kind, profId) {
        return `znk_last_sync_${kind}_${profId}`;
    }

    function getLastSync(kind, profId) {
        // Chaîne ISO texte (ex: "2026-07-23T02:15:00.000Z"), pas un nombre.
        // '' = jamais synchronisé -> tout récupérer la 1ère fois.
        return localStorage.getItem(lastSyncKey(kind, profId)) || '';
    }

    function setLastSync(kind, profId, serverTime) {
        localStorage.setItem(lastSyncKey(kind, profId), serverTime);
    }

    /**
     * Permet de forcer un rechargement complet (debug, ou si on suspecte
     * une désynchronisation) : oublie la mémoire pour ce type + ce prof.
     */
    function resetSync(kind, profId) {
        localStorage.removeItem(lastSyncKey(kind, profId));
        console.log(`🔄 Mémoire de sync réinitialisée pour ${kind} / prof ${profId}`);
    }

    async function apiFetch(path, options = {}) {
        const cfg = getConfig();
        if (!cfg) return { ok: false, offline: true };

        try {
            const res = await fetch(`${cfg.apiBase}${path}`, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': cfg.apiKey,
                    ...(options.headers || {})
                }
            });
            if (!res.ok) {
                console.warn(`⚠️ Sync VPS: réponse ${res.status} pour ${path}`);
                return { ok: false, offline: false, status: res.status };
            }
            return await res.json();
        } catch (err) {
            // Pas de réseau, VPS injoignable, etc. -> on ne casse rien,
            // l'app continue de fonctionner en local (offline-first).
            console.warn('⚠️ Sync VPS indisponible (hors-ligne ?) :', err.message);
            return { ok: false, offline: true };
        }
    }

    // ------------------------------------------------------------------
    // LEÇONS
    // ------------------------------------------------------------------

    /**
     * Récupère les leçons nouvelles/modifiées depuis le dernier pull.
     * @param {string} profId
     * @param {(lecons: object[]) => void} onMerge - appelée avec les leçons
     *        reçues, à toi de les fusionner dans ton localStorage existant
     *        (même logique merge-by-id/updatedAt que tu as déjà côté client)
     */
    async function pullLecons(profId, onMerge) {
        const since = getLastSync('lecons', profId);
        const data = await apiFetch(`/api/v1/lecons/pull?profId=${encodeURIComponent(profId)}&since=${since}`);

        if (data.ok) {
            if (data.lecons.length > 0 && typeof onMerge === 'function') {
                onMerge(data.lecons);
            }
            setLastSync('lecons', profId, data.serverTime);
            console.log(`✅ Sync leçons: ${data.lecons.length} nouvelle(s)/modifiée(s) depuis ${since ? new Date(since).toLocaleString('fr-FR') : 'jamais'}`);
        }
        return data;
    }

    /**
     * Pousse des leçons vers le VPS (le prof publie/modifie une leçon).
     * @param {string} profId
     * @param {object[]} lecons - chaque leçon doit avoir { id, updatedAt, ... }
     */
    async function pushLecons(profId, lecons) {
        const data = await apiFetch('/api/v1/lecons/push', {
            method: 'POST',
            body: JSON.stringify({ profId, lecons })
        });
        if (data.ok) {
            console.log('✅ Leçons envoyées au VPS:', data.results);
        }
        return data;
    }

    // ------------------------------------------------------------------
    // SOUMISSIONS
    // ------------------------------------------------------------------

    /**
     * Le prof récupère les devoirs rendus par ses élèves.
     */
    async function pullSoumissions(profId, onMerge) {
        const since = getLastSync('soumissions', profId);
        const data = await apiFetch(`/api/v1/soumissions/pull?profId=${encodeURIComponent(profId)}&since=${since}`);

        if (data.ok) {
            if (data.soumissions.length > 0 && typeof onMerge === 'function') {
                onMerge(data.soumissions);
            }
            setLastSync('soumissions', profId, data.serverTime);
            console.log(`✅ Sync soumissions: ${data.soumissions.length} nouvelle(s) depuis ${since ? new Date(since).toLocaleString('fr-FR') : 'jamais'}`);
        }
        return data;
    }

    /**
     * L'élève envoie un devoir fait.
     * @param {string} profId
     * @param {string} eleveId
     * @param {object[]} soumissions - chaque soumission doit avoir { id, updatedAt, leconId, ... }
     */
    async function pushSoumissions(profId, eleveId, soumissions) {
        const data = await apiFetch('/api/v1/soumissions/push', {
            method: 'POST',
            body: JSON.stringify({ profId, eleveId, soumissions })
        });
        if (data.ok) {
            console.log('✅ Soumissions envoyées au VPS:', data.results);
        }
        return data;
    }

    return {
        pullLecons,
        pushLecons,
        pullSoumissions,
        pushSoumissions,
        resetSync
    };
})();
