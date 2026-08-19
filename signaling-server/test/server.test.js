const { app, server, io } = require('../server');
const request = require('supertest');
const ioClient = require('socket.io-client');

describe('ZNK237 Signaling Server Tests', () => {
  let clientSocket1;
  let clientSocket2;
  const serverUrl = 'http://localhost:3000';

  beforeAll((done) => {
    server.listen(3000, () => {
      done();
    });
  });

  afterAll((done) => {
    io.close();
    server.close(done);
  });

  afterEach(() => {
    if (clientSocket1 && clientSocket1.connected) {
      clientSocket1.disconnect();
    }
    if (clientSocket2 && clientSocket2.connected) {
      clientSocket2.disconnect();
    }
  });

  describe('HTTP Endpoints', () => {
    test('GET / devrait retourner les infos du serveur', async () => {
      const response = await request(app).get('/');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('status', 'running');
      expect(response.body).toHaveProperty('stats');
    });

    test('GET /health devrait retourner le status', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('GET /stats devrait retourner les statistiques', async () => {
      const response = await request(app).get('/stats');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalConnections');
      expect(response.body).toHaveProperty('activeConnections');
      expect(response.body).toHaveProperty('activePeers');
    });
  });

  describe('Socket.io Connections', () => {
    test('Devrait se connecter au serveur', (done) => {
      clientSocket1 = ioClient(serverUrl, {
        transports: ['websocket']
      });

      clientSocket1.on('connect', () => {
        expect(clientSocket1.connected).toBe(true);
        done();
      });
    });

    test('Devrait enregistrer un peer', (done) => {
      clientSocket1 = ioClient(serverUrl, {
        transports: ['websocket']
      });

      clientSocket1.on('connect', () => {
        clientSocket1.emit('register', 'test-peer-1');
      });

      clientSocket1.on('registered', (data) => {
        expect(data).toHaveProperty('peerId', 'test-peer-1');
        expect(data).toHaveProperty('socketId');
        done();
      });
    });

    test('Devrait recevoir la liste des peers', (done) => {
      clientSocket1 = ioClient(serverUrl, {
        transports: ['websocket']
      });

      clientSocket1.on('connect', () => {
        clientSocket1.emit('register', 'test-peer-1');
      });

      clientSocket1.on('peer-list', (peers) => {
        expect(Array.isArray(peers)).toBe(true);
        done();
      });
    });
  });

  describe('Room Management', () => {
    test('Devrait rejoindre une room', (done) => {
      clientSocket1 = ioClient(serverUrl, {
        transports: ['websocket']
      });

      clientSocket1.on('connect', () => {
        clientSocket1.emit('register', 'test-peer-1');
        clientSocket1.emit('join-room', 'test-room');
      });

      clientSocket1.on('room-peers', (data) => {
        expect(data).toHaveProperty('roomId', 'test-room');
        expect(data).toHaveProperty('peers');
        expect(Array.isArray(data.peers)).toBe(true);
        done();
      });
    });

    test('Devrait notifier les autres peers quand un nouveau peer rejoint', (done) => {
      clientSocket1 = ioClient(serverUrl, {
        transports: ['websocket']
      });
      
      clientSocket2 = ioClient(serverUrl, {
        transports: ['websocket']
      });

      let socket1Ready = false;
      let socket2Ready = false;

      const checkBothReady = () => {
        if (socket1Ready && socket2Ready) {
          clientSocket2.emit('join-room', 'test-room');
        }
      };

      clientSocket1.on('connect', () => {
        clientSocket1.emit('register', 'peer-1');
        clientSocket1.emit('join-room', 'test-room');
        socket1Ready = true;
        checkBothReady();
      });

      clientSocket2.on('connect', () => {
        clientSocket2.emit('register', 'peer-2');
        socket2Ready = true;
        checkBothReady();
      });

      clientSocket1.on('peer-joined', (data) => {
        expect(data).toHaveProperty('peerId', 'peer-2');
        done();
      });
    });
  });

  describe('Signaling', () => {
    test('Devrait transférer les signaux WebRTC', (done) => {
      clientSocket1 = ioClient(serverUrl, {
        transports: ['websocket']
      });
      
      clientSocket2 = ioClient(serverUrl, {
        transports: ['websocket']
      });

      const testSignal = { type: 'offer', sdp: 'test-sdp' };

      clientSocket1.on('connect', () => {
        clientSocket1.emit('register', 'peer-1');
      });

      clientSocket2.on('connect', () => {
        clientSocket2.emit('register', 'peer-2');
        
        setTimeout(() => {
          clientSocket1.emit('signal', {
            to: 'peer-2',
            from: 'peer-1',
            signal: testSignal
          });
        }, 100);
      });

      clientSocket2.on('signal', (data) => {
        expect(data).toHaveProperty('from', 'peer-1');
        expect(data).toHaveProperty('signal');
        expect(data.signal).toEqual(testSignal);
        done();
      });
    });
  });

  describe('Broadcast', () => {
    test('Devrait broadcaster des messages dans une room', (done) => {
      clientSocket1 = ioClient(serverUrl, {
        transports: ['websocket']
      });
      
      clientSocket2 = ioClient(serverUrl, {
        transports: ['websocket']
      });

      const testMessage = { type: 'test', data: 'hello' };

      clientSocket1.on('connect', () => {
        clientSocket1.emit('register', 'peer-1');
        clientSocket1.emit('join-room', 'test-room');
      });

      clientSocket2.on('connect', () => {
        clientSocket2.emit('register', 'peer-2');
        clientSocket2.emit('join-room', 'test-room');
        
        setTimeout(() => {
          clientSocket1.emit('broadcast', {
            roomId: 'test-room',
            message: testMessage
          });
        }, 100);
      });

      clientSocket2.on('broadcast', (data) => {
        expect(data).toHaveProperty('from', 'peer-1');
        expect(data).toHaveProperty('message');
        expect(data.message).toEqual(testMessage);
        done();
      });
    });
  });

  describe('Disconnection', () => {
    test('Devrait notifier quand un peer se déconnecte', (done) => {
      clientSocket1 = ioClient(serverUrl, {
        transports: ['websocket']
      });
      
      clientSocket2 = ioClient(serverUrl, {
        transports: ['websocket']
      });

      clientSocket1.on('connect', () => {
        clientSocket1.emit('register', 'peer-1');
      });

      clientSocket2.on('connect', () => {
        clientSocket2.emit('register', 'peer-2');
        
        setTimeout(() => {
          clientSocket1.disconnect();
        }, 100);
      });

      clientSocket2.on('peer-left', (peerId) => {
        expect(peerId).toBe('peer-1');
        done();
      });
    });
  });
});