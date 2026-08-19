// 🎥 ZNK ACTV - Serveur de Streaming Complet
// Installation: npm install express node-media-server fluent-ffmpeg socket.io cors

const express = require('express');
const NodeMediaServer = require('node-media-server');
const ffmpeg = require('fluent-ffmpeg');
const { Server } = require('socket.io');
const http = require('http');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// ========================================
// CONFIGURATION
// ========================================

const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 8000,
    mediaroot: './media',
    allow_origin: '*'
  },
  trans: {
    ffmpeg: '/usr/bin/ffmpeg', // Ajustez selon votre système
    tasks: [
      {
        app: 'live',
        hls: true,
        hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]',
        dash: true,
        dashFlags: '[f=dash:window_size=3:extra_window_size=5]'
      }
    ]
  }
};

// ========================================
// SERVEUR MÉDIA (RTMP + HLS)
// ========================================

const nms = new NodeMediaServer(config);

// Événements du serveur média
nms.on('preConnect', (id, args) => {
  console.log('🔌 [Connexion RTMP]', `ID: ${id}`, args);
});

nms.on('postConnect', (id, args) => {
  console.log('✅ [Connecté]', `ID: ${id}`);
});

nms.on('doneConnect', (id, args) => {
  console.log('❌ [Déconnecté]', `ID: ${id}`);
});

nms.on('prePublish', (id, StreamPath, args) => {
  console.log('📡 [Début Stream]', StreamPath);
  
  // Extraction du stream key
  const streamKey = getStreamKeyFromPath(StreamPath);
  
  // Vérification de la clé (à adapter selon votre système d'auth)
  if (!isValidStreamKey(streamKey)) {
    console.log('🚫 [Clé invalide]', streamKey);
    const session = nms.getSession(id);
    session.reject();
    return;
  }
  
  // Notifier tous les clients qu'un stream a démarré
  io.emit('stream_started', {
    streamKey,
    path: StreamPath,
    timestamp: Date.now()
  });
});

nms.on('donePublish', (id, StreamPath, args) => {
  console.log('🛑 [Fin Stream]', StreamPath);
  
  const streamKey = getStreamKeyFromPath(StreamPath);
  io.emit('stream_stopped', {
    streamKey,
    timestamp: Date.now()
  });
});

// ========================================
// API REST
// ========================================

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(cors());
app.use(express.json());
app.use('/media', express.static('media')); // Servir les fichiers HLS

// 📊 État des streams en direct
const liveStreams = new Map();

// ========================================
// ENDPOINTS API
// ========================================

// Obtenir tous les streams actifs
app.get('/api/streams/live', (req, res) => {
  const sessions = nms.getSession();
  const streams = [];
  
  for (const id in sessions.publishers) {
    const publisher = sessions.publishers[id];
    streams.push({
      id,
      app: publisher.publishStreamPath.split('/')[1],
      stream: publisher.publishStreamPath.split('/')[2],
      startTime: publisher.connectTime,
      clients: getStreamViewers(id)
    });
  }
  
  res.json({ streams });
});

// Obtenir les infos d'un stream spécifique
app.get('/api/stream/:streamKey', (req, res) => {
  const { streamKey } = req.params;
  const streamInfo = liveStreams.get(streamKey);
  
  if (!streamInfo) {
    return res.status(404).json({ error: 'Stream non trouvé' });
  }
  
  res.json(streamInfo);
});

// Générer une clé de stream pour un studio
app.post('/api/studio/:studioId/stream-key', (req, res) => {
  const { studioId } = req.params;
  const streamKey = generateStreamKey();
  
  // Sauvegarder dans votre DB
  saveStreamKey(studioId, streamKey);
  
  res.json({
    studioId,
    streamKey,
    rtmpUrl: `rtmp://votre-serveur.com:1935/live`,
    streamUrl: `rtmp://votre-serveur.com:1935/live/${streamKey}`,
    hlsUrl: `http://votre-serveur.com:8000/live/${streamKey}/index.m3u8`
  });
});

// Arrêter un stream (admin)
app.post('/api/stream/:streamKey/stop', (req, res) => {
  const { streamKey } = req.params;
  
  // Trouver et arrêter la session
  const sessions = nms.getSession();
  for (const id in sessions.publishers) {
    const publisher = sessions.publishers[id];
    if (publisher.publishStreamPath.includes(streamKey)) {
      const session = nms.getSession(id);
      session.reject();
      
      return res.json({ success: true, message: 'Stream arrêté' });
    }
  }
  
  res.status(404).json({ error: 'Stream non trouvé' });
});

// Stats globales
app.get('/api/stats', (req, res) => {
  const sessions = nms.getSession();
  
  res.json({
    totalPublishers: Object.keys(sessions.publishers || {}).length,
    totalViewers: Object.keys(sessions.players || {}).length,
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

// ========================================
// WEBSOCKET - Temps réel
// ========================================

io.on('connection', (socket) => {
  console.log('🔌 Client WebSocket connecté:', socket.id);
  
  // Envoyer la liste des streams actifs
  socket.emit('streams_update', Array.from(liveStreams.values()));
  
  // Un viewer rejoint un stream
  socket.on('join_stream', (streamKey) => {
    socket.join(`stream_${streamKey}`);
    console.log(`👁️ Viewer rejoint: ${streamKey}`);
    
    // Incrémenter le compteur de viewers
    const stream = liveStreams.get(streamKey);
    if (stream) {
      stream.viewers = (stream.viewers || 0) + 1;
      io.to(`stream_${streamKey}`).emit('viewer_count', stream.viewers);
    }
  });
  
  // Un viewer quitte un stream
  socket.on('leave_stream', (streamKey) => {
    socket.leave(`stream_${streamKey}`);
    
    const stream = liveStreams.get(streamKey);
    if (stream) {
      stream.viewers = Math.max((stream.viewers || 0) - 1, 0);
      io.to(`stream_${streamKey}`).emit('viewer_count', stream.viewers);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('❌ Client déconnecté:', socket.id);
  });
});

// ========================================
// FONCTIONS UTILITAIRES
// ========================================

function getStreamKeyFromPath(streamPath) {
  // Format: /live/STREAM_KEY
  return streamPath.split('/')[2];
}

function isValidStreamKey(streamKey) {
  // TODO: Vérifier dans votre base de données
  // Pour l'instant, accepter toutes les clés
  return true;
}

function generateStreamKey() {
  return `znk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function saveStreamKey(studioId, streamKey) {
  // TODO: Sauvegarder dans votre DB
  console.log(`💾 Clé sauvegardée: ${studioId} -> ${streamKey}`);
}

function getStreamViewers(sessionId) {
  const sessions = nms.getSession();
  let count = 0;
  
  for (const id in sessions.players) {
    const player = sessions.players[id];
    if (player.publishStreamPath === sessions.publishers[sessionId]?.publishStreamPath) {
      count++;
    }
  }
  
  return count;
}

// ========================================
// TRANSCODAGE VOD (pour vidéos uploadées)
// ========================================

app.post('/api/transcode', (req, res) => {
  const { videoPath, outputName } = req.body;
  
  if (!videoPath || !outputName) {
    return res.status(400).json({ error: 'videoPath et outputName requis' });
  }
  
  const outputDir = path.join(__dirname, 'media', 'vod', outputName);
  
  // Créer le dossier de sortie
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Transcoder en HLS
  ffmpeg(videoPath)
    .outputOptions([
      '-codec:v libx264',
      '-codec:a aac',
      '-hls_time 10',
      '-hls_list_size 0',
      '-f hls'
    ])
    .output(path.join(outputDir, 'index.m3u8'))
    .on('start', (cmd) => {
      console.log('🎬 Transcodage démarré:', cmd);
    })
    .on('progress', (progress) => {
      console.log(`⏳ Progression: ${progress.percent}%`);
    })
    .on('end', () => {
      console.log('✅ Transcodage terminé');
      res.json({
        success: true,
        hlsUrl: `/media/vod/${outputName}/index.m3u8`
      });
    })
    .on('error', (err) => {
      console.error('❌ Erreur transcodage:', err);
      res.status(500).json({ error: err.message });
    })
    .run();
});

// ========================================
// DÉMARRAGE
// ========================================

// Créer les dossiers nécessaires
['media', 'media/live', 'media/vod'].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Démarrer le serveur média
nms.run();
console.log('🎥 Serveur RTMP démarré sur le port 1935');
console.log('📺 Serveur HLS démarré sur le port 8000');

// Démarrer l'API REST
server.listen(3001, () => {
  console.log('🚀 API REST démarrée sur le port 3001');
  console.log('');
  console.log('📡 Configuration OBS:');
  console.log('   Serveur: rtmp://localhost:1935/live');
  console.log('   Clé: [votre_stream_key]');
  console.log('');
  console.log('🌐 URL de visionnage:');
  console.log('   http://localhost:8000/live/[stream_key]/index.m3u8');
});

// Gestion propre de l'arrêt
process.on('SIGINT', () => {
  console.log('\n🛑 Arrêt du serveur...');
  nms.stop();
  server.close();
  process.exit(0);
});