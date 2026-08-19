// ============================================
// ZNK CLASSROOM DISCOVERY
// Découverte automatique du PC-prof sur le réseau local de l'école, en UDP broadcast.
// Reprend le principe du broadcast déjà présent dans znk_p2p_protocol.py, mais en
// Node natif (module 'dgram') : aucune dépendance à Python.
// ============================================

const dgram = require('dgram');

const DISCOVERY_PORT_DEFAUT = 41234;
const MSG_DISCOVER = 'ZNK_CLASSROOM_DISCOVER';
const MSG_ANNOUNCE = 'ZNK_CLASSROOM_ANNOUNCE';

let announceSocket = null;

// --------------------------------------------
// Côté PROF : répond aux élèves qui cherchent le serveur de la classe
// --------------------------------------------

function startClassroomAnnounce({ classeId, nom, niveau, profId, httpPort, discoveryPort = DISCOVERY_PORT_DEFAUT }) {
    if (announceSocket) {
        console.log('ℹ️ Annonce de classe déjà active');
        return { success: true, alreadyRunning: true };
    }

    return new Promise((resolve) => {
        const socket = dgram.createSocket('udp4');

        socket.on('error', (err) => {
            console.warn('⚠️ Erreur socket annonce classe:', err.message);
            socket.close();
            announceSocket = null;
            resolve({ success: false, error: err.message });
        });

        socket.on('message', (msg, rinfo) => {
            let payload;
            try { payload = JSON.parse(msg.toString()); } catch (e) { return; }
            if (payload.type !== MSG_DISCOVER) return;

            const reponse = Buffer.from(JSON.stringify({
                type: MSG_ANNOUNCE,
                classeId, nom, niveau, profId, httpPort
            }));
            // Répond directement à l'élève qui a demandé (pas de re-broadcast nécessaire)
            socket.send(reponse, rinfo.port, rinfo.address, (err) => {
                if (err) console.warn('⚠️ Échec réponse annonce classe:', err.message);
            });
        });

        socket.bind(discoveryPort, () => {
            socket.setBroadcast(true);
            announceSocket = socket;
            console.log(`📡 Annonce de classe active sur le port UDP ${discoveryPort} (classe: ${nom})`);
            resolve({ success: true });
        });
    });
}

function stopClassroomAnnounce() {
    if (announceSocket) {
        announceSocket.close();
        announceSocket = null;
        console.log('🛑 Annonce de classe arrêtée');
    }
    return { success: true };
}

// --------------------------------------------
// Côté ÉLÈVE : cherche un serveur de classe sur le réseau local
// --------------------------------------------

function discoverClassroomServer({ discoveryPort = DISCOVERY_PORT_DEFAUT, timeoutMs = 3000 } = {}) {
    return new Promise((resolve) => {
        const socket = dgram.createSocket('udp4');
        let resolved = false;

        const finish = (result) => {
            if (resolved) return;
            resolved = true;
            try { socket.close(); } catch (e) { /* ignore */ }
            resolve(result);
        };

        const timer = setTimeout(() => finish(null), timeoutMs);

        socket.on('error', (err) => {
            console.warn('⚠️ Erreur découverte classe:', err.message);
            clearTimeout(timer);
            finish(null);
        });

        socket.on('message', (msg, rinfo) => {
            let payload;
            try { payload = JSON.parse(msg.toString()); } catch (e) { return; }
            if (payload.type !== MSG_ANNOUNCE) return;

            clearTimeout(timer);
            finish({
                ip: rinfo.address,
                port: payload.httpPort,
                classeId: payload.classeId,
                nom: payload.nom,
                niveau: payload.niveau,
                profId: payload.profId
            });
        });

        socket.bind(0, () => {
            socket.setBroadcast(true);
            const demande = Buffer.from(JSON.stringify({ type: MSG_DISCOVER }));
            socket.send(demande, discoveryPort, '255.255.255.255');
        });
    });
}

module.exports = {
    startClassroomAnnounce,
    stopClassroomAnnounce,
    discoverClassroomServer
};
