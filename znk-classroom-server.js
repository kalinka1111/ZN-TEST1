// ============================================
// ZNK CLASSROOM SERVER
// Serveur HTTP local tournant sur le PC du prof.
// Source de vérité pour SA classe : élèves, devoirs, soumissions.
// Zéro dépendance externe (http/fs/crypto natifs Node) -> pas de Python requis,
// fonctionne même sans aucune connexion Internet (réseau local de l'école suffit).
// ============================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let server = null;
let state = null; // { dataDir, classeId, nom, niveau, profId, files: {...} }

// --------------------------------------------
// Utilitaires stockage (fichiers JSON, comme userStorage ailleurs dans l'app)
// --------------------------------------------

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadJson(file, fallback) {
    try {
        if (!fs.existsSync(file)) return fallback;
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (e) {
        console.warn(`⚠️ Lecture ${file} échouée, fallback utilisé:`, e.message);
        return fallback;
    }
}

function saveJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function slugify(s) {
    return (s || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // enlève les accents
        .replace(/[^a-z0-9]/g, '');
}

// Même principe que generateLoginId dans inscription.html : prénom + 1ère lettre du nom
function generateLoginId(prenom, nom, existingIds) {
    const base = slugify(prenom) + slugify(nom).charAt(0);
    let id = base || 'eleve';
    let n = 1;
    while (existingIds.has(id)) {
        id = base + n;
        n++;
    }
    existingIds.add(id);
    return id;
}

// PIN à 4 chiffres aléatoire et UNIQUE par élève (amélioration volontaire par
// rapport à inscription.html qui donne "1234" à tout le monde : ici chaque
// enfant a son propre code, un frère/sœur ne peut pas se connecter au compte
// d'un autre juste en devinant l'ID).
function generatePin(existingPins) {
    let pin;
    do {
        pin = String(Math.floor(1000 + Math.random() * 9000));
    } while (existingPins.has(pin));
    existingPins.add(pin);
    return pin;
}

function hashContent(str) {
    return crypto.createHash('sha256').update(str || '').digest('hex');
}

// --------------------------------------------
// Accès aux données de la classe
// --------------------------------------------

function getEleves() { return loadJson(state.files.eleves, []); }
function saveEleves(list) { saveJson(state.files.eleves, list); }

function getDevoirs() { return loadJson(state.files.devoirs, []); }
function saveDevoirs(list) { saveJson(state.files.devoirs, list); }

function getSoumissions() { return loadJson(state.files.soumissions, []); }
function saveSoumissions(list) { saveJson(state.files.soumissions, list); }

// Ajoute un élève à la classe (appelé depuis l'écran "Mes élèves" du prof)
function classroomAddEleve({ prenom, nom, niveau }) {
    if (!prenom || !nom) throw new Error('Prénom et nom requis');
    const eleves = getEleves();
    const usedIds = new Set(eleves.map(e => e.loginId));
    const usedPins = new Set(eleves.map(e => e.pin));
    const loginId = generateLoginId(prenom, nom, usedIds);
    const pin = generatePin(usedPins);
    const eleve = {
        loginId, pin, prenom, nom, niveau,
        profId: state.profId,
        classeId: state.classeId,
        createdAt: new Date().toISOString()
    };
    eleves.push(eleve);
    saveEleves(eleves);
    return eleve;
}

function classroomListEleves() {
    // Ne jamais renvoyer les PIN dans une liste générale (seulement à la création,
    // affichée une fois au prof pour qu'il les distribue).
    return getEleves().map(({ pin, ...rest }) => rest);
}

function classroomLoginLocal(loginId, pin) {
    const eleve = getEleves().find(e => e.loginId === (loginId || '').trim().toLowerCase() && e.pin === pin);
    if (!eleve) return null;
    const { pin: _p, ...profil } = eleve;
    return profil;
}

function classroomPublishDevoir({ titre, matiere, contenu, dateLimite }) {
    if (!titre) throw new Error('Titre du devoir requis');
    const devoirs = getDevoirs();
    const devoir = {
        id: `dev_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        titre, matiere: matiere || '', contenu: contenu || '',
        dateLimite: dateLimite || null,
        version: 1,
        publieLe: new Date().toISOString()
    };
    devoirs.push(devoir);
    saveDevoirs(devoirs);
    return devoir;
}

function classroomListDevoirsSince(since) {
    const devoirs = getDevoirs();
    if (!since) return devoirs;
    const sinceDate = new Date(since).getTime();
    return devoirs.filter(d => new Date(d.publieLe).getTime() > sinceDate);
}

function classroomReceiveSubmission({ devoirId, eleveLoginId, contenu, fichierNom }) {
    const devoirs = getDevoirs();
    const eleves = getEleves();
    if (!devoirs.find(d => d.id === devoirId)) throw new Error('Devoir inconnu: ' + devoirId);
    if (!eleves.find(e => e.loginId === eleveLoginId)) throw new Error('Élève inconnu: ' + eleveLoginId);

    const hash = hashContent(`${devoirId}|${eleveLoginId}|${contenu}`);
    const soumissions = getSoumissions();

    // Évite les doublons si l'élève soumet deux fois la même chose (ex: sync relancée)
    if (soumissions.find(s => s.hash === hash)) {
        return soumissions.find(s => s.hash === hash);
    }

    const soumission = {
        id: `sub_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        devoirId, eleveLoginId, contenu: contenu || '', fichierNom: fichierNom || null,
        hash,
        soumisLe: new Date().toISOString()
    };
    soumissions.push(soumission);
    saveSoumissions(soumissions);
    return soumission;
}

// Cœur de la synchro : l'élève envoie ce qu'il connaît déjà, le serveur ne
// renvoie/n'accepte que ce qui manque (pas de retransmission complète à chaque fois).
function classroomSyncManifest({ devoirsConnus = [], soumissionsEnAttente = [] }) {
    const devoirs = getDevoirs();
    const versionsConnues = new Map(devoirsConnus.map(d => [d.id, d.version]));

    const devoirsAEnvoyer = devoirs.filter(d => {
        const versionConnue = versionsConnues.get(d.id);
        return versionConnue === undefined || versionConnue < d.version;
    });

    const accusesReception = [];
    for (const sub of soumissionsEnAttente) {
        try {
            const enregistree = classroomReceiveSubmission({
                devoirId: sub.devoirId,
                eleveLoginId: sub.eleveLoginId,
                contenu: sub.contenu,
                fichierNom: sub.fichierNom
            });
            accusesReception.push({ idLocal: sub.idLocal, id: enregistree.id, statut: 'recu' });
        } catch (e) {
            accusesReception.push({ idLocal: sub.idLocal, statut: 'erreur', erreur: e.message });
        }
    }

    return { devoirsAEnvoyer, accusesReception, classe: { id: state.classeId, nom: state.nom, niveau: state.niveau } };
}

// --------------------------------------------
// Serveur HTTP (routes JSON minimalistes, sans dépendance externe)
// --------------------------------------------

function sendJson(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Access-Control-Allow-Origin': '*'
    });
    res.end(body);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let chunks = '';
        req.on('data', c => { chunks += c; if (chunks.length > 5_000_000) req.destroy(); });
        req.on('end', () => {
            if (!chunks) return resolve({});
            try { resolve(JSON.parse(chunks)); } catch (e) { reject(e); }
        });
        req.on('error', reject);
    });
}

async function handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = url.pathname;

    try {
        if (p === '/api/classe' && req.method === 'GET') {
            return sendJson(res, 200, { id: state.classeId, nom: state.nom, niveau: state.niveau, profId: state.profId });
        }

        if (p === '/api/eleves' && req.method === 'GET') {
            return sendJson(res, 200, classroomListEleves());
        }

        if (p === '/api/eleves' && req.method === 'POST') {
            const body = await readBody(req);
            const eleve = classroomAddEleve(body);
            return sendJson(res, 201, eleve); // seule fois où le PIN est renvoyé : à distribuer par le prof
        }

        if (p === '/api/login' && req.method === 'POST') {
            const { loginId, pin } = await readBody(req);
            const profil = classroomLoginLocal(loginId, pin);
            if (!profil) return sendJson(res, 401, { success: false, error: 'Identifiant ou PIN incorrect' });
            return sendJson(res, 200, { success: true, profil });
        }

        if (p === '/api/devoirs' && req.method === 'GET') {
            return sendJson(res, 200, classroomListDevoirsSince(url.searchParams.get('since')));
        }

        if (p === '/api/devoirs' && req.method === 'POST') {
            const body = await readBody(req);
            const devoir = classroomPublishDevoir(body);
            return sendJson(res, 201, devoir);
        }

        if (p === '/api/soumissions' && req.method === 'GET') {
            const devoirId = url.searchParams.get('devoirId');
            const all = getSoumissions();
            return sendJson(res, 200, devoirId ? all.filter(s => s.devoirId === devoirId) : all);
        }

        if (p === '/api/soumissions' && req.method === 'POST') {
            const body = await readBody(req);
            const soumission = classroomReceiveSubmission(body);
            return sendJson(res, 201, soumission);
        }

        if (p === '/api/sync/manifest' && req.method === 'POST') {
            const body = await readBody(req);
            const resultat = classroomSyncManifest(body);
            return sendJson(res, 200, resultat);
        }

        sendJson(res, 404, { error: 'Route inconnue: ' + p });
    } catch (e) {
        console.error('❌ Erreur serveur classe:', e);
        sendJson(res, 400, { error: e.message || String(e) });
    }
}

// --------------------------------------------
// Cycle de vie
// --------------------------------------------

function startClassroomServer({ dataDir, port = 8765, classeId, nom, niveau, profId }) {
    if (server) {
        console.log('ℹ️ Serveur de classe déjà démarré');
        return { success: true, port, alreadyRunning: true };
    }

    const baseDir = path.join(dataDir, 'classroom', classeId || 'default');
    ensureDir(baseDir);

    state = {
        dataDir: baseDir,
        classeId: classeId || null,
        nom: nom || 'Ma classe',
        niveau: niveau || null,
        profId: profId || null,
        files: {
            eleves: path.join(baseDir, 'eleves.json'),
            devoirs: path.join(baseDir, 'devoirs.json'),
            soumissions: path.join(baseDir, 'soumissions.json')
        }
    };

    server = http.createServer((req, res) => { handleRequest(req, res); });

    return new Promise((resolve) => {
        server.listen(port, '0.0.0.0', () => {
            console.log(`🏫 Serveur de classe démarré sur le port ${port} (classe: ${state.nom})`);
            resolve({ success: true, port });
        });
        server.on('error', (err) => {
            console.warn('⚠️ Impossible de démarrer le serveur de classe:', err.message);
            server = null;
            resolve({ success: false, error: err.message });
        });
    });
}

function stopClassroomServer() {
    if (server) {
        server.close();
        server = null;
        state = null;
        console.log('🛑 Serveur de classe arrêté');
    }
    return { success: true };
}

// --------------------------------------------
// Client HTTP générique (utilisé côté élève pour parler au serveur du prof)
// --------------------------------------------

function classroomRequest({ ip, port }, routePath, method = 'GET', bodyObj = null) {
    return new Promise((resolve, reject) => {
        const bodyStr = bodyObj ? JSON.stringify(bodyObj) : null;
        const req = http.request({
            host: ip,
            port,
            path: routePath,
            method,
            headers: bodyStr
                ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) }
                : {},
            timeout: 8000
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const parsed = data ? JSON.parse(data) : {};
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    reject(new Error('Réponse invalide du serveur de classe: ' + e.message));
                }
            });
        });
        req.on('timeout', () => req.destroy(new Error('Délai dépassé (serveur de classe injoignable)')));
        req.on('error', reject);
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

module.exports = {
    startClassroomServer,
    stopClassroomServer,
    classroomAddEleve,
    classroomListEleves,
    classroomLoginLocal,
    classroomPublishDevoir,
    classroomListDevoirsSince,
    classroomReceiveSubmission,
    classroomSyncManifest,
    classroomRequest
};
