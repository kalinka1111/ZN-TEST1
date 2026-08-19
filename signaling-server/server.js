/**
 * Serveur de Signalisation WebRTC pour ZNK237 P2P App
 * Utilise Socket.io pour la communication entre peers
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configuration CORS pour Electron
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Middleware
app.use(cors());
app.use(express.json());

// Stockage des peers connectés
const peers = new Map();
const rooms = new Map();

// Configuration
const PORT = process.env.PORT || 3000;
const MAX_PEERS_PER_ROOM = 50;

// Stats du serveur
const stats = {
  totalConnections: 0,
  activeConnections: 0,
  totalMessages: 0,
  totalRooms: 0,
  startTime: Date.now()
};

// Routes HTTP pour le monitoring
app.get('/', (req, res) => {
  res.json({
    name: 'ZNK237 Signaling Server',
    version: '1.0.0',
    status: 'running',
    stats: {
      ...stats,
      uptime: Date.now() - stats.startTime,
      activePeers: peers.size,
      activeRooms: rooms.size
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    peers: peers.size 
  });
});

app.get('/stats', (req, res) => {
  res.json({
    ...stats,
    uptime: Date.now() - stats.startTime,
    activePeers: peers.size,
    activeRooms: rooms.size,
    peersPerRoom: Array.from(rooms.entries()).map(([room, peers]) => ({
      room,
      count: peers.size
    }))
  });
});

// Gestion des connexions Socket.io
io.on('connection', (socket) => {
  console.log(`🔌 Nouvelle connexion: ${socket.id}`);
  
  stats.totalConnections++;
  stats.activeConnections++;

  // Enregistrement d'un peer
  socket.on('register', (peerId) => {
    const peerInfo = {
      id: peerId || socket.id,
      socketId: socket.id,
      connectedAt: Date.now(),
      rooms: new Set()
    };

    peers.set(socket.id, peerInfo);
    socket.peerId = peerInfo.id;

    console.log(`✅ Peer enregistré: ${peerInfo.id}`);
    
    socket.emit('registered', {
      peerId: peerInfo.id,
      socketId: socket.id
    });

    // Envoyer la liste des peers disponibles
    broadcastPeerList();
  });

  // Rejoindre une room
  socket.on('join-room', (roomId) => {
    if (!socket.peerId) {
      socket.emit('error', { message: 'Peer non enregistré' });
      return;
    }

    // Créer la room si elle n'existe pas
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
      stats.totalRooms++;
    }

    const room = rooms.get(roomId);

    // Vérifier la limite
    if (room.size >= MAX_PEERS_PER_ROOM) {
      socket.emit('error', { message: 'Room pleine' });
      return;
    }

    // Ajouter le peer à la room
    room.add(socket.id);
    socket.join(roomId);

    const peerInfo = peers.get(socket.id);
    if (peerInfo) {
      peerInfo.rooms.add(roomId);
    }

    console.log(`🚪 ${socket.peerId} a rejoint la room ${roomId}`);

    // Notifier les autres peers de la room
    socket.to(roomId).emit('peer-joined', {
      peerId: socket.peerId,
      socketId: socket.id
    });

    // Envoyer la liste des peers de la room
    const roomPeers = Array.from(room)
      .filter(sid => sid !== socket.id)
      .map(sid => {
        const peer = peers.get(sid);
        return peer ? peer.id : sid;
      });

    socket.emit('room-peers', {
      roomId,
      peers: roomPeers
    });
  });

  // Quitter une room
  socket.on('leave-room', (roomId) => {
    leaveRoom(socket, roomId);
  });

  // Transfert de signal WebRTC
  socket.on('signal', ({ to, from, signal, roomId }) => {
    stats.totalMessages++;

    if (roomId) {
      // Broadcast dans une room
      socket.to(roomId).emit('signal', {
        from: from || socket.peerId,
        signal
      });
    } else {
      // Envoi direct à un peer spécifique
      const targetPeer = Array.from(peers.values()).find(p => p.id === to);
      
      if (targetPeer) {
        io.to(targetPeer.socketId).emit('signal', {
          from: from || socket.peerId,
          signal
        });
      } else {
        socket.emit('error', { message: `Peer ${to} non trouvé` });
      }
    }
  });

  // Broadcast d'un message
  socket.on('broadcast', ({ roomId, message }) => {
    if (roomId && rooms.has(roomId)) {
      socket.to(roomId).emit('broadcast', {
        from: socket.peerId,
        message,
        timestamp: Date.now()
      });
    }
  });

  // Obtenir la liste des peers
  socket.on('get-peers', (callback) => {
    const peerList = Array.from(peers.values())
      .filter(p => p.socketId !== socket.id)
      .map(p => ({
        id: p.id,
        connectedAt: p.connectedAt
      }));

    if (typeof callback === 'function') {
      callback(peerList);
    } else {
      socket.emit('peer-list', peerList);
    }
  });

  // Obtenir les peers d'une room
  socket.on('get-room-peers', ({ roomId }, callback) => {
    if (!rooms.has(roomId)) {
      const result = { roomId, peers: [] };
      if (typeof callback === 'function') {
        callback(result);
      } else {
        socket.emit('room-peers', result);
      }
      return;
    }

    const room = rooms.get(roomId);
    const roomPeers = Array.from(room)
      .filter(sid => sid !== socket.id)
      .map(sid => {
        const peer = peers.get(sid);
        return peer ? { id: peer.id, socketId: sid } : null;
      })
      .filter(p => p !== null);

    const result = { roomId, peers: roomPeers };
    
    if (typeof callback === 'function') {
      callback(result);
    } else {
      socket.emit('room-peers', result);
    }
  });

  // Ping/Pong pour keepalive
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });

  // Déconnexion
  socket.on('disconnect', (reason) => {
    console.log(`🔌 Déconnexion: ${socket.peerId || socket.id} (${reason})`);
    
    stats.activeConnections--;

    // Nettoyer les rooms
    const peerInfo = peers.get(socket.id);
    if (peerInfo && peerInfo.rooms) {
      peerInfo.rooms.forEach(roomId => {
        leaveRoom(socket, roomId);
      });
    }

    // Supprimer le peer
    peers.delete(socket.id);

    // Notifier les autres peers
    if (socket.peerId) {
      io.emit('peer-left', socket.peerId);
    }

    broadcastPeerList();
  });

  // Gestion des erreurs
  socket.on('error', (error) => {
    console.error(`❌ Erreur socket ${socket.id}:`, error);
  });
});

// Fonction helper pour quitter une room
function leaveRoom(socket, roomId) {
  if (!rooms.has(roomId)) return;

  const room = rooms.get(roomId);
  room.delete(socket.id);
  socket.leave(roomId);

  const peerInfo = peers.get(socket.id);
  if (peerInfo) {
    peerInfo.rooms.delete(roomId);
  }

  // Supprimer la room si vide
  if (room.size === 0) {
    rooms.delete(roomId);
  }

  // Notifier les autres peers
  socket.to(roomId).emit('peer-left', {
    peerId: socket.peerId,
    roomId
  });

  console.log(`🚪 ${socket.peerId} a quitté la room ${roomId}`);
}

// Broadcaster la liste des peers à tous
function broadcastPeerList() {
  const peerList = Array.from(peers.values()).map(p => ({
    id: p.id,
    connectedAt: p.connectedAt
  }));

  io.emit('peer-list', peerList);
}

// Nettoyage périodique
setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000; // 5 minutes

  for (const [socketId, peerInfo] of peers.entries()) {
    if (now - peerInfo.connectedAt > timeout) {
      console.log(`🧹 Nettoyage du peer inactif: ${peerInfo.id}`);
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
      }
      peers.delete(socketId);
    }
  }
}, 60000); // Vérifier toutes les minutes

// Démarrage du serveur
server.listen(PORT, () => {
  console.log('🚀 ZNK237 Signaling Server démarré');
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log('✅ Prêt à accepter des connexions');
});

// Gestion des erreurs du serveur
server.on('error', (error) => {
  console.error('❌ Erreur serveur:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Arrêt du serveur...');
  server.close(() => {
    console.log('✅ Serveur arrêté proprement');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Interruption reçue, arrêt...');
  server.close(() => {
    console.log('✅ Serveur arrêté');
    process.exit(0);
  });
});

module.exports = { app, server, io };