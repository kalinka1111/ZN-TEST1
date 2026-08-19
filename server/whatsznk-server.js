// WhatsZNK Signaling Server
// Serveur WebSocket pour gérer les connexions peer-to-peer

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 3001;

// État du serveur
const state = {
  users: new Map(),      // userId -> { ws, roomId, info }
  rooms: new Map(),      // roomId -> Set<userId>
  connections: new Map() // connectionId -> { from, to, createdAt }
};

// ==================== WebSocket HANDLERS ====================

wss.on('connection', (ws) => {
  let currentUserId = null;
  
  console.log('🔌 Nouvelle connexion WebSocket');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      handleMessage(ws, data);
    } catch (error) {
      console.error('❌ Erreur parsing message:', error);
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  });

  ws.on('close', () => {
    if (currentUserId) {
      handleUserDisconnect(currentUserId);
    }
    console.log('🔌 Connexion WebSocket fermée');
  });

  ws.on('error', (error) => {
    console.error('❌ Erreur WebSocket:', error);
  });

  // Handler pour les messages
  function handleMessage(ws, data) {
    switch (data.type) {
      case 'register':
        currentUserId = data.userId;
        registerUser(ws, data.userId, data.info || {});
        break;

      case 'join-room':
        joinRoom(data.userId, data.roomId);
        break;

      case 'leave-room':
        leaveRoom(data.userId);
        break;

      case 'offer':
      case 'answer':
      case 'ice-candidate':
        forwardSignal(data);
        break;

      default:
        console.warn('⚠️ Type de message inconnu:', data.type);
    }
  }
});

// ==================== USER MANAGEMENT ====================

function registerUser(ws, userId, info) {
  state.users.set(userId, {
    ws,
    roomId: null,
    info,
    connectedAt: new Date()
  });

  ws.send(JSON.stringify({
    type: 'registered',
    userId,
    timestamp: new Date().toISOString()
  }));

  console.log(`✅ Utilisateur enregistré: ${userId}`);
}

function handleUserDisconnect(userId) {
  const user = state.users.get(userId);
  
  if (!user) return;

  // Quitter la room si l'utilisateur était dedans
  if (user.roomId) {
    leaveRoom(userId);
  }

  state.users.delete(userId);
  console.log(`👋 Utilisateur déconnecté: ${userId}`);
}

// ==================== ROOM MANAGEMENT ====================

function joinRoom(userId, roomId) {
  const user = state.users.get(userId);
  
  if (!user) {
    console.error(`❌ Utilisateur ${userId} introuvable`);
    return;
  }

  // Créer la room si elle n'existe pas
  if (!state.rooms.has(roomId)) {
    state.rooms.set(roomId, new Set());
  }

  const room = state.rooms.get(roomId);
  
  // Notifier les autres utilisateurs de la room
  const existingUsers = Array.from(room);
  existingUsers.forEach(existingUserId => {
    const existingUser = state.users.get(existingUserId);
    if (existingUser && existingUser.ws) {
      existingUser.ws.send(JSON.stringify({
        type: 'user-joined',
        userId,
        roomId
      }));
    }
  });

  // Ajouter l'utilisateur à la room
  room.add(userId);
  user.roomId = roomId;

  // Envoyer la liste des utilisateurs au nouvel arrivant
  user.ws.send(JSON.stringify({
    type: 'room-users',
    roomId,
    users: existingUsers
  }));

  console.log(`🚪 ${userId} a rejoint la room ${roomId}`);
  console.log(`   Utilisateurs dans la room: ${room.size}`);
}

function leaveRoom(userId) {
  const user = state.users.get(userId);
  
  if (!user || !user.roomId) return;

  const roomId = user.roomId;
  const room = state.rooms.get(roomId);

  if (room) {
    room.delete(userId);

    // Notifier les autres utilisateurs
    room.forEach(otherUserId => {
      const otherUser = state.users.get(otherUserId);
      if (otherUser && otherUser.ws) {
        otherUser.ws.send(JSON.stringify({
          type: 'user-left',
          userId,
          roomId
        }));
      }
    });

    // Supprimer la room si elle est vide
    if (room.size === 0) {
      state.rooms.delete(roomId);
      console.log(`🗑️ Room ${roomId} supprimée (vide)`);
    }
  }

  user.roomId = null;
  console.log(`👋 ${userId} a quitté la room ${roomId}`);
}

// ==================== SIGNALING ====================

function forwardSignal(data) {
  const recipientUser = state.users.get(data.to);
  
  if (!recipientUser || !recipientUser.ws) {
    console.error(`❌ Destinataire ${data.to} introuvable`);
    return;
  }

  // Transférer le signal au destinataire
  recipientUser.ws.send(JSON.stringify(data));

  // Logger pour debug
  const signalType = data.type === 'ice-candidate' ? 'ICE' : data.type.toUpperCase();
  console.log(`📡 ${signalType}: ${data.from} → ${data.to}`);
}

// ==================== HTTP API ====================

// Obtenir les statistiques du serveur
app.get('/api/stats', (req, res) => {
  const stats = {
    totalUsers: state.users.size,
    totalRooms: state.rooms.size,
    rooms: []
  };

  state.rooms.forEach((users, roomId) => {
    stats.rooms.push({
      id: roomId,
      userCount: users.size,
      users: Array.from(users)
    });
  });

  res.json(stats);
});

// Obtenir les utilisateurs d'une room
app.get('/api/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  const room = state.rooms.get(roomId);

  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const users = Array.from(room).map(userId => {
    const user = state.users.get(userId);
    return {
      userId,
      info: user ? user.info : null,
      connectedAt: user ? user.connectedAt : null
    };
  });

  res.json({
    roomId,
    userCount: users.length,
    users
  });
});

// Créer une nouvelle room
app.post('/api/rooms', (req, res) => {
  const roomId = req.body.roomId || `room_${Date.now().toString(36)}`;
  
  if (state.rooms.has(roomId)) {
    return res.status(400).json({ error: 'Room already exists' });
  }

  state.rooms.set(roomId, new Set());

  res.json({
    roomId,
    created: true,
    url: `http://localhost:${PORT}/join/${roomId}`
  });
});

// Kick un utilisateur d'une room (admin)
app.post('/api/rooms/:roomId/kick/:userId', (req, res) => {
  const { roomId, userId } = req.params;
  
  const user = state.users.get(userId);
  if (!user || user.roomId !== roomId) {
    return res.status(404).json({ error: 'User not in room' });
  }

  leaveRoom(userId);

  // Envoyer une notification au user
  if (user.ws) {
    user.ws.send(JSON.stringify({
      type: 'kicked',
      roomId
    }));
  }

  res.json({ success: true });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'WhatsZNK Signaling Server',
    version: '1.0.0',
    uptime: process.uptime(),
    connections: state.users.size,
    rooms: state.rooms.size
  });
});

// ==================== CLEANUP ====================

// Nettoyer les connexions mortes toutes les 30 secondes
setInterval(() => {
  let cleaned = 0;

  state.users.forEach((user, userId) => {
    if (!user.ws || user.ws.readyState !== WebSocket.OPEN) {
      handleUserDisconnect(userId);
      cleaned++;
    }
  });

  if (cleaned > 0) {
    console.log(`🧹 Nettoyage: ${cleaned} connexion(s) morte(s) supprimée(s)`);
  }
}, 30000);

// ==================== DÉMARRAGE ====================

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n🎥 WhatsZNK Signaling Server démarré');
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌐 WebSocket: ws://localhost:${PORT}`);
  console.log(`📊 API: http://localhost:${PORT}/api/stats`);
  console.log('\n✅ Prêt pour les connexions vidéo\n');
});

// Gestion propre de l'arrêt
process.on('SIGTERM', () => {
  console.log('\n👋 Arrêt du serveur...');
  
  // Notifier tous les utilisateurs
  state.users.forEach(user => {
    if (user.ws && user.ws.readyState === WebSocket.OPEN) {
      user.ws.send(JSON.stringify({
        type: 'server-shutdown'
      }));
      user.ws.close();
    }
  });

  server.close(() => {
    console.log('✅ Serveur arrêté proprement');
    process.exit(0);
  });
});

// Export pour tests
module.exports = { app, server, wss, state };