// WhatsZNK Video Chat Module
// Intégration avec ZNK Camera Core et système de sync

class WhatsZNKManager {
  constructor(config = {}) {
    this.serverUrl = config.serverUrl || 'http://localhost:3001';
    this.cameraCore = null; // Référence au ZNK Camera Core
    this.peers = new Map(); // id -> peer connection
    this.localStream = null;
    this.socket = null;
    this.roomId = null;
    this.userId = this.generateUserId();
    
    // Configuration WebRTC
    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
  }

  // Générer un ID utilisateur unique
  generateUserId() {
    return 'user_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Initialiser la connexion avec le serveur
  async connect() {
    try {
      // Utiliser WebSocket pour le signaling
      this.socket = new WebSocket(this.serverUrl.replace('http', 'ws'));
      
      this.socket.onopen = () => {
        console.log('✅ Connecté au serveur WhatsZNK');
        this.sendSignal({ type: 'register', userId: this.userId });
      };

      this.socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        this.handleSignal(data);
      };

      this.socket.onerror = (error) => {
        console.error('❌ Erreur WebSocket:', error);
      };

      this.socket.onclose = () => {
        console.log('🔌 Déconnecté du serveur');
      };

    } catch (error) {
      console.error('❌ Erreur de connexion:', error);
      throw error;
    }
  }

  // Envoyer un signal au serveur
  sendSignal(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }

  // Gérer les signaux reçus
  async handleSignal(data) {
    switch (data.type) {
      case 'user-joined':
        console.log('👤 Utilisateur rejoint:', data.userId);
        await this.createPeerConnection(data.userId);
        break;

      case 'user-left':
        console.log('👋 Utilisateur parti:', data.userId);
        this.removePeer(data.userId);
        break;

      case 'offer':
        await this.handleOffer(data);
        break;

      case 'answer':
        await this.handleAnswer(data);
        break;

      case 'ice-candidate':
        await this.handleIceCandidate(data);
        break;

      case 'room-users':
        // Recevoir la liste des utilisateurs dans la room
        console.log('📋 Utilisateurs dans la room:', data.users);
        for (const userId of data.users) {
          if (userId !== this.userId) {
            await this.createPeerConnection(userId, true);
          }
        }
        break;
    }
  }

  // Rejoindre une room
  async joinRoom(roomId) {
    this.roomId = roomId;
    
    // Obtenir le stream depuis Camera Core si disponible
    if (window.znkCamera && window.znkCamera.getStream) {
      this.localStream = await window.znkCamera.getStream();
    } else {
      // Sinon, obtenir le stream standard
      this.localStream = await this.getCameraStream();
    }

    this.sendSignal({
      type: 'join-room',
      roomId: this.roomId,
      userId: this.userId
    });

    console.log(`🚪 Rejoint la room: ${roomId}`);
  }

  // Obtenir le stream caméra (avec effets Camera Core si possible)
  async getCameraStream() {
    try {
      // Si Camera Core est disponible, utiliser son canvas
      if (window.znkCamera && window.znkCamera.state && window.znkCamera.state.currentSource) {
        const canvas = document.getElementById('virtualCamera');
        if (canvas) {
          // Capturer le canvas comme stream
          const stream = canvas.captureStream(30); // 30 fps
          
          // Ajouter l'audio séparément
          const audioStream = await navigator.mediaDevices.getUserMedia({ 
            audio: true 
          });
          
          audioStream.getAudioTracks().forEach(track => {
            stream.addTrack(track);
          });

          console.log('🎥 Stream depuis Camera Core capturé');
          return stream;
        }
      }

      // Fallback: stream caméra standard
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: true
      });

      console.log('📹 Stream caméra standard capturé');
      return stream;

    } catch (error) {
      console.error('❌ Erreur capture stream:', error);
      throw error;
    }
  }

  // Créer une connexion peer
  async createPeerConnection(userId, initiator = false) {
    if (this.peers.has(userId)) {
      console.log('⚠️ Peer déjà existant:', userId);
      return;
    }

    const peerConnection = new RTCPeerConnection(this.rtcConfig);
    this.peers.set(userId, peerConnection);

    // Ajouter les tracks locaux
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, this.localStream);
      });
    }

    // Gérer les tracks distants
    peerConnection.ontrack = (event) => {
      console.log('📡 Track reçu de:', userId);
      this.handleRemoteStream(userId, event.streams[0]);
    };

    // Gérer les ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({
          type: 'ice-candidate',
          candidate: event.candidate,
          to: userId,
          from: this.userId
        });
      }
    };

    // Gérer les changements de connexion
    peerConnection.onconnectionstatechange = () => {
      console.log(`🔗 État connexion avec ${userId}:`, peerConnection.connectionState);
      
      if (peerConnection.connectionState === 'disconnected' || 
          peerConnection.connectionState === 'failed') {
        this.removePeer(userId);
      }
    };

    // Si initiateur, créer l'offre
    if (initiator) {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      this.sendSignal({
        type: 'offer',
        offer: offer,
        to: userId,
        from: this.userId
      });
    }

    return peerConnection;
  }

  // Gérer une offre reçue
  async handleOffer(data) {
    const peerConnection = await this.createPeerConnection(data.from);
    
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    this.sendSignal({
      type: 'answer',
      answer: answer,
      to: data.from,
      from: this.userId
    });
  }

  // Gérer une réponse reçue
  async handleAnswer(data) {
    const peerConnection = this.peers.get(data.from);
    
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
  }

  // Gérer un ICE candidate reçu
  async handleIceCandidate(data) {
    const peerConnection = this.peers.get(data.from);
    
    if (peerConnection) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  }

  // Gérer le stream distant
  handleRemoteStream(userId, stream) {
    // Créer ou mettre à jour l'élément vidéo pour cet utilisateur
    let videoElement = document.getElementById(`video-${userId}`);
    
    if (!videoElement) {
      videoElement = document.createElement('video');
      videoElement.id = `video-${userId}`;
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      
      // Ajouter à la grille de vidéos
      const videoGrid = document.getElementById('videoGrid');
      if (videoGrid) {
        const wrapper = document.createElement('div');
        wrapper.className = 'video-wrapper';
        wrapper.dataset.userId = userId;
        
        wrapper.innerHTML = `
          <video id="video-${userId}" autoplay playsinline></video>
          <div class="video-label">${userId}</div>
        `;
        
        videoGrid.appendChild(wrapper);
        videoElement = wrapper.querySelector('video');
      }
    }

    videoElement.srcObject = stream;
  }

  // Supprimer un peer
  removePeer(userId) {
    const peerConnection = this.peers.get(userId);
    
    if (peerConnection) {
      peerConnection.close();
      this.peers.delete(userId);
    }

    // Supprimer l'élément vidéo
    const videoWrapper = document.querySelector(`[data-user-id="${userId}"]`);
    if (videoWrapper) {
      videoWrapper.remove();
    }

    console.log('🗑️ Peer supprimé:', userId);
  }

  // Quitter la room
  leaveRoom() {
    // Fermer toutes les connexions
    this.peers.forEach((peer, userId) => {
      this.removePeer(userId);
    });

    // Arrêter le stream local
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    this.sendSignal({
      type: 'leave-room',
      roomId: this.roomId,
      userId: this.userId
    });

    this.roomId = null;
    console.log('👋 Room quittée');
  }

  // Activer/désactiver la caméra
  toggleCamera(enabled) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  // Activer/désactiver le micro
  toggleMicrophone(enabled) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  // Changer de source (si Camera Core est disponible)
  async switchCameraSource(sourceId) {
    if (window.znkCamera && window.znkCamera.selectSource) {
      window.znkCamera.selectSource(sourceId);
      
      // Recapturer le stream
      const newStream = await this.getCameraStream();
      
      // Mettre à jour tous les peers
      this.peers.forEach((peerConnection) => {
        const senders = peerConnection.getSenders();
        const videoTrack = newStream.getVideoTracks()[0];
        
        const videoSender = senders.find(sender => 
          sender.track && sender.track.kind === 'video'
        );
        
        if (videoSender) {
          videoSender.replaceTrack(videoTrack);
        }
      });

      // Mettre à jour le stream local
      const oldVideoTrack = this.localStream.getVideoTracks()[0];
      if (oldVideoTrack) {
        oldVideoTrack.stop();
        this.localStream.removeTrack(oldVideoTrack);
      }
      
      this.localStream.addTrack(newStream.getVideoTracks()[0]);
    }
  }

  // Appliquer un effet en temps réel (via Camera Core)
  applyEffect(effectName, params) {
    if (window.znkCamera && window.znkCamera.applyEffect) {
      window.znkCamera.applyEffect(effectName, params);
    }
  }

  // Enregistrer la session
  async startRecording() {
    if (!this.localStream) return;

    const options = {
      mimeType: 'video/webm;codecs=vp9'
    };

    this.mediaRecorder = new MediaRecorder(this.localStream, options);
    this.recordedChunks = [];

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = async () => {
      const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
      
      // Sauvegarder via le système ZNK
      if (window.api && window.api.saveRecording) {
        const arrayBuffer = await blob.arrayBuffer();
        const result = await window.api.saveRecording({
          data: Array.from(new Uint8Array(arrayBuffer)),
          filename: `whatsznk-${Date.now()}.webm`,
          roomId: this.roomId
        });
        
        console.log('💾 Enregistrement sauvegardé:', result);
      } else {
        // Fallback: téléchargement navigateur
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `whatsznk-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
      }
    };

    this.mediaRecorder.start();
    console.log('🔴 Enregistrement démarré');
  }

  // Arrêter l'enregistrement
  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      console.log('⏹️ Enregistrement arrêté');
    }
  }

  // Déconnexion
  disconnect() {
    if (this.roomId) {
      this.leaveRoom();
    }

    if (this.socket) {
      this.socket.close();
    }

    console.log('👋 Déconnecté de WhatsZNK');
  }

  // Obtenir les statistiques de connexion
  async getStats(userId) {
    const peerConnection = this.peers.get(userId);
    
    if (!peerConnection) return null;

    const stats = await peerConnection.getStats();
    const result = {
      video: {},
      audio: {},
      connection: {}
    };

    stats.forEach(report => {
      if (report.type === 'inbound-rtp') {
        if (report.mediaType === 'video') {
          result.video = {
            bytesReceived: report.bytesReceived,
            packetsReceived: report.packetsReceived,
            packetsLost: report.packetsLost,
            jitter: report.jitter
          };
        } else if (report.mediaType === 'audio') {
          result.audio = {
            bytesReceived: report.bytesReceived,
            packetsReceived: report.packetsReceived,
            packetsLost: report.packetsLost
          };
        }
      } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        result.connection = {
          currentRoundTripTime: report.currentRoundTripTime,
          availableOutgoingBitrate: report.availableOutgoingBitrate
        };
      }
    });

    return result;
  }
}

// API publique pour l'intégration
window.WhatsZNK = WhatsZNKManager;

// Fonction d'initialisation facile
window.initWhatsZNK = async function(roomId, config = {}) {
  const whatsznk = new WhatsZNKManager(config);
  
  await whatsznk.connect();
  await whatsznk.joinRoom(roomId);
  
  return whatsznk;
};

console.log('✅ WhatsZNK Module chargé');