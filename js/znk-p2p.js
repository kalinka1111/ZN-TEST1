// ZNK P2P Client - À inclure dans vos pages HTML
class ZNKP2P {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.peers = [];
    }

    connect(url = 'http://localhost:3000') {
        // Socket.IO doit être chargé avant (via CDN ou local)
        if (typeof io === 'undefined') {
            console.error('❌ Socket.IO non chargé !');
            return;
        }

        this.socket = io(url);
        
        this.socket.on('connect', () => {
            console.log('✅ P2P connecté:', this.socket.id);
            this.connected = true;
            this.onConnect && this.onConnect(this.socket.id);
            
            // Demander sync initial
            this.socket.emit('request-sync');
        });

        this.socket.on('disconnect', () => {
            console.log('❌ P2P déconnecté');
            this.connected = false;
            this.onDisconnect && this.onDisconnect();
        });

        this.socket.on('peers-list', (peers) => {
            console.log('👥 Peers disponibles:', peers.length);
            this.peers = peers;
            this.onPeersUpdate && this.onPeersUpdate(peers);
        });

        this.socket.on('peer-joined', (peerId) => {
            console.log('👋 Nouveau peer:', peerId);
            this.peers.push(peerId);
            this.onPeerJoined && this.onPeerJoined(peerId);
        });

        this.socket.on('peer-left', (peerId) => {
            console.log('👋 Peer parti:', peerId);
            this.peers = this.peers.filter(id => id !== peerId);
            this.onPeerLeft && this.onPeerLeft(peerId);
        });

        this.socket.on('new-publication', (pub) => {
            console.log('📨 Nouvelle publication:', pub.id);
            this.onPublication && this.onPublication(pub);
        });

        this.socket.on('delete-publication', (pubId) => {
            console.log('🗑️ Publication supprimée:', pubId);
            this.onDelete && this.onDelete(pubId);
        });

        this.socket.on('sync-data', (publications) => {
            console.log('🔄 Sync reçu:', publications.length, 'publications');
            this.onSync && this.onSync(publications);
        });
    }

    publish(publication) {
        if (!this.connected) {
            console.warn('⚠️ Hors ligne, impossible de publier');
            return false;
        }
        
        this.socket.emit('share-publication', publication);
        console.log('📤 Publication envoyée:', publication.id);
        return true;
    }

    requestSync() {
        if (this.connected) {
            this.socket.emit('request-sync');
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

// Instance globale
window.znkP2P = new ZNKP2P();