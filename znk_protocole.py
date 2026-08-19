"""
ZNKprotocole P2P - Protocole de synchronisation peer-to-peer
Permet le partage de fichiers et publications entre utilisateurs sans serveur central
"""

import socket
import threading
import json
import hashlib
import time
import os
from pathlib import Path
from typing import Dict, List, Tuple
import struct

class ZNKProtocole:
    VERSION = "1.0.0"
    PORT_DEFAULT = 9876
    BUFFER_SIZE = 4096
    MAGIC_HEADER = b'ZNK1'  # Identifiant du protocole
    
    # Types de messages
    MSG_HELLO = 0x01        # Découverte de peers
    MSG_HELLO_ACK = 0x02    # Réponse à la découverte
    MSG_FILE_LIST = 0x03    # Liste des fichiers disponibles
    MSG_FILE_REQUEST = 0x04 # Demande d'un fichier
    MSG_FILE_DATA = 0x05    # Envoi de données
    MSG_FILE_ACK = 0x06     # Confirmation de réception
    MSG_PING = 0x07         # Vérification de connexion
    MSG_PONG = 0x08         # Réponse au ping
    
    def __init__(self, user_id: str, dossier_partage: str, port: int = PORT_DEFAULT):
        self.user_id = user_id
        self.port = port
        self.dossier_partage = Path(dossier_partage)
        self.peers: Dict[str, Tuple[str, int]] = {}  # {peer_id: (ip, port)}
        self.running = False
        self.server_socket = None
        self.fichiers_locaux: Dict[str, str] = {}  # {nom_fichier: hash}
        
    def demarrer(self):
        """Démarre le nœud P2P"""
        self.running = True
        self._scanner_fichiers_locaux()
        
        # Thread serveur pour écouter les connexions entrantes
        server_thread = threading.Thread(target=self._serveur_ecoute, daemon=True)
        server_thread.start()
        
        # Thread découverte de peers
        discovery_thread = threading.Thread(target=self._decouvrir_peers, daemon=True)
        discovery_thread.start()
        
        # Thread surveillance fichiers
        watcher_thread = threading.Thread(target=self._surveiller_fichiers, daemon=True)
        watcher_thread.start()
        
        print(f"✅ ZNKprotocole démarré sur le port {self.port}")
        print(f"👤 User ID: {self.user_id}")
    
    def arreter(self):
        """Arrête le nœud P2P"""
        self.running = False
        if self.server_socket:
            self.server_socket.close()
        print("🛑 ZNKprotocole arrêté")
    
    def _serveur_ecoute(self):
        """Serveur TCP qui écoute les connexions entrantes"""
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        
        try:
            self.server_socket.bind(('0.0.0.0', self.port))
            self.server_socket.listen(5)
            print(f"🎧 Écoute sur 0.0.0.0:{self.port}")
            
            while self.running:
                try:
                    self.server_socket.settimeout(1.0)
                    client_socket, address = self.server_socket.accept()
                    thread = threading.Thread(
                        target=self._gerer_connexion,
                        args=(client_socket, address),
                        daemon=True
                    )
                    thread.start()
                except socket.timeout:
                    continue
                except Exception as e:
                    if self.running:
                        print(f"❌ Erreur acceptation: {e}")
        except Exception as e:
            print(f"❌ Erreur serveur: {e}")
    
    def _gerer_connexion(self, client_socket: socket.socket, address: Tuple):
        """Gère une connexion entrante d'un peer"""
        try:
            while self.running:
                # Lire l'en-tête du message
                header = client_socket.recv(8)
                if not header or len(header) < 8:
                    break
                
                magic, msg_type, data_len = struct.unpack('!4sBH', header[:7])
                
                if magic != self.MAGIC_HEADER:
                    print(f"⚠️ Magic header invalide de {address}")
                    break
                
                # Lire les données
                data = b''
                while len(data) < data_len:
                    chunk = client_socket.recv(min(data_len - len(data), self.BUFFER_SIZE))
                    if not chunk:
                        break
                    data += chunk
                
                # Traiter le message
                self._traiter_message(client_socket, msg_type, data, address)
                
        except Exception as e:
            print(f"❌ Erreur connexion {address}: {e}")
        finally:
            client_socket.close()
    
    def _traiter_message(self, sock: socket.socket, msg_type: int, data: bytes, address: Tuple):
        """Traite un message reçu selon son type"""
        try:
            payload = json.loads(data.decode('utf-8'))
            
            if msg_type == self.MSG_HELLO:
                self._traiter_hello(sock, payload, address)
            
            elif msg_type == self.MSG_FILE_LIST:
                self._traiter_file_list(sock, payload)
            
            elif msg_type == self.MSG_FILE_REQUEST:
                self._traiter_file_request(sock, payload)
            
            elif msg_type == self.MSG_FILE_DATA:
                self._traiter_file_data(payload)
            
            elif msg_type == self.MSG_PING:
                self._envoyer_message(sock, self.MSG_PONG, {'timestamp': time.time()})
                
        except Exception as e:
            print(f"❌ Erreur traitement message: {e}")
    
    def _traiter_hello(self, sock: socket.socket, payload: Dict, address: Tuple):
        """Traite un message HELLO (découverte de peer)"""
        peer_id = payload.get('user_id')
        peer_port = payload.get('port', self.port)
        
        if peer_id and peer_id != self.user_id:
            self.peers[peer_id] = (address[0], peer_port)
            print(f"🤝 Nouveau peer: {peer_id} @ {address[0]}:{peer_port}")
            
            # Répondre avec HELLO_ACK
            response = {
                'user_id': self.user_id,
                'port': self.port,
                'version': self.VERSION
            }
            self._envoyer_message(sock, self.MSG_HELLO_ACK, response)
            
            # Envoyer la liste de nos fichiers
            self._envoyer_liste_fichiers(sock)
    
    def _traiter_file_list(self, sock: socket.socket, payload: Dict):
        """Traite une liste de fichiers reçue d'un peer"""
        peer_id = payload.get('user_id')
        fichiers = payload.get('fichiers', {})
        
        print(f"📋 Liste de fichiers reçue de {peer_id}: {len(fichiers)} fichiers")
        
        # Comparer avec nos fichiers locaux et demander les manquants
        for nom_fichier, file_hash in fichiers.items():
            if nom_fichier not in self.fichiers_locaux or self.fichiers_locaux[nom_fichier] != file_hash:
                print(f"📥 Demande du fichier: {nom_fichier}")
                self._demander_fichier(sock, nom_fichier)
    
    def _traiter_file_request(self, sock: socket.socket, payload: Dict):
        """Traite une demande de fichier"""
        nom_fichier = payload.get('nom_fichier')
        chemin_fichier = self.dossier_partage / nom_fichier
        
        if chemin_fichier.exists():
            print(f"📤 Envoi du fichier: {nom_fichier}")
            self._envoyer_fichier(sock, nom_fichier, chemin_fichier)
        else:
            print(f"⚠️ Fichier non trouvé: {nom_fichier}")
    
    def _traiter_file_data(self, payload: Dict):
        """Traite la réception de données d'un fichier"""
        nom_fichier = payload.get('nom_fichier')
        data_b64 = payload.get('data')
        file_hash = payload.get('hash')
        
        # Décoder les données
        import base64
        data = base64.b64decode(data_b64)
        
        # Vérifier le hash
        calculated_hash = hashlib.sha256(data).hexdigest()
        if calculated_hash != file_hash:
            print(f"❌ Hash invalide pour {nom_fichier}")
            return
        
        # Sauvegarder le fichier
        chemin_fichier = self.dossier_partage / nom_fichier
        chemin_fichier.parent.mkdir(parents=True, exist_ok=True)
        
        with open(chemin_fichier, 'wb') as f:
            f.write(data)
        
        self.fichiers_locaux[nom_fichier] = file_hash
        print(f"✅ Fichier reçu et sauvegardé: {nom_fichier}")
    
    def _envoyer_message(self, sock: socket.socket, msg_type: int, payload: Dict):
        """Envoie un message via le protocole ZNK"""
        try:
            # Sérialiser le payload
            data = json.dumps(payload).encode('utf-8')
            data_len = len(data)
            
            # Construire l'en-tête: MAGIC(4) + TYPE(1) + RESERVED(1) + LENGTH(2)
            header = struct.pack('!4sBBH', self.MAGIC_HEADER, msg_type, 0, data_len)
            
            # Envoyer header + data
            sock.sendall(header + data)
            
        except Exception as e:
            print(f"❌ Erreur envoi message: {e}")
    
    def _envoyer_fichier(self, sock: socket.socket, nom_fichier: str, chemin: Path):
        """Envoie un fichier à un peer"""
        try:
            with open(chemin, 'rb') as f:
                data = f.read()
            
            import base64
            payload = {
                'nom_fichier': nom_fichier,
                'data': base64.b64encode(data).decode('utf-8'),
                'hash': hashlib.sha256(data).hexdigest(),
                'timestamp': time.time()
            }
            
            self._envoyer_message(sock, self.MSG_FILE_DATA, payload)
            
        except Exception as e:
            print(f"❌ Erreur envoi fichier: {e}")
    
    def _demander_fichier(self, sock: socket.socket, nom_fichier: str):
        """Demande un fichier à un peer"""
        payload = {
            'user_id': self.user_id,
            'nom_fichier': nom_fichier
        }
        self._envoyer_message(sock, self.MSG_FILE_REQUEST, payload)
    
    def _envoyer_liste_fichiers(self, sock: socket.socket):
        """Envoie la liste de nos fichiers à un peer"""
        payload = {
            'user_id': self.user_id,
            'fichiers': self.fichiers_locaux,
            'timestamp': time.time()
        }
        self._envoyer_message(sock, self.MSG_FILE_LIST, payload)
    
    def _decouvrir_peers(self):
        """Découvre les peers sur le réseau local via broadcast UDP"""
        broadcast_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        broadcast_socket.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        broadcast_socket.settimeout(1.0)
        
        # Socket pour écouter les broadcasts
        listen_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        listen_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listen_socket.bind(('', self.port + 1))
        listen_socket.settimeout(1.0)
        
        while self.running:
            try:
                # Envoyer un broadcast toutes les 10 secondes
                message = json.dumps({
                    'type': 'discovery',
                    'user_id': self.user_id,
                    'port': self.port
                }).encode('utf-8')
                
                broadcast_socket.sendto(message, ('<broadcast>', self.port + 1))
                
                # Écouter les réponses
                try:
                    data, address = listen_socket.recvfrom(1024)
                    peer_info = json.loads(data.decode('utf-8'))
                    
                    if peer_info.get('type') == 'discovery':
                        peer_id = peer_info.get('user_id')
                        peer_port = peer_info.get('port', self.port)
                        
                        if peer_id and peer_id != self.user_id and peer_id not in self.peers:
                            print(f"🔍 Peer découvert: {peer_id} @ {address[0]}:{peer_port}")
                            self._connecter_a_peer(address[0], peer_port)
                            
                except socket.timeout:
                    pass
                
                time.sleep(10)
                
            except Exception as e:
                if self.running:
                    print(f"❌ Erreur découverte: {e}")
                time.sleep(5)
    
    def _connecter_a_peer(self, ip: str, port: int):
        """Se connecte à un peer découvert"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.connect((ip, port))
            
            # Envoyer HELLO
            payload = {
                'user_id': self.user_id,
                'port': self.port,
                'version': self.VERSION
            }
            self._envoyer_message(sock, self.MSG_HELLO, payload)
            
            # Garder la connexion ouverte pour recevoir les réponses
            threading.Thread(target=self._gerer_connexion, args=(sock, (ip, port)), daemon=True).start()
            
        except Exception as e:
            print(f"❌ Erreur connexion à {ip}:{port}: {e}")
    
    def _scanner_fichiers_locaux(self):
        """Scanne les fichiers dans le dossier partagé"""
        self.fichiers_locaux = {}
        
        if not self.dossier_partage.exists():
            self.dossier_partage.mkdir(parents=True, exist_ok=True)
            return
        
        for fichier in self.dossier_partage.rglob('*'):
            if fichier.is_file():
                nom_relatif = str(fichier.relative_to(self.dossier_partage))
                with open(fichier, 'rb') as f:
                    file_hash = hashlib.sha256(f.read()).hexdigest()
                self.fichiers_locaux[nom_relatif] = file_hash
        
        print(f"📁 {len(self.fichiers_locaux)} fichiers locaux scannés")
    
    def _surveiller_fichiers(self):
        """Surveille les changements dans le dossier partagé"""
        while self.running:
            time.sleep(5)
            fichiers_avant = set(self.fichiers_locaux.keys())
            self._scanner_fichiers_locaux()
            fichiers_apres = set(self.fichiers_locaux.keys())
            
            nouveaux = fichiers_apres - fichiers_avant
            if nouveaux:
                print(f"📢 Nouveaux fichiers détectés: {nouveaux}")
                # Notifier tous les peers
                self._notifier_peers_nouveaux_fichiers()
    
    def _notifier_peers_nouveaux_fichiers(self):
        """Notifie tous les peers de nos nouveaux fichiers"""
        for peer_id, (ip, port) in self.peers.items():
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.connect((ip, port))
                self._envoyer_liste_fichiers(sock)
                sock.close()
            except Exception as e:
                print(f"⚠️ Impossible de notifier {peer_id}: {e}")
    
    def publier_fichier(self, chemin_local: str):
        """Publie un nouveau fichier dans le réseau P2P"""
        try:
            chemin = Path(chemin_local)
            if not chemin.exists():
                print(f"❌ Fichier non trouvé: {chemin_local}")
                return False
            
            # Copier dans le dossier partagé
            destination = self.dossier_partage / chemin.name
            
            import shutil
            shutil.copy2(chemin, destination)
            
            # Scanner les nouveaux fichiers
            self._scanner_fichiers_locaux()
            
            # Notifier les peers
            self._notifier_peers_nouveaux_fichiers()
            
            print(f"✅ Fichier publié: {chemin.name}")
            return True
            
        except Exception as e:
            print(f"❌ Erreur publication: {e}")
            return False
    
    def obtenir_statut(self) -> Dict:
        """Retourne le statut du nœud P2P"""
        return {
            'user_id': self.user_id,
            'port': self.port,
            'peers_connectes': len(self.peers),
            'fichiers_locaux': len(self.fichiers_locaux),
            'running': self.running
        }


# Exemple d'utilisation
if __name__ == "__main__":
    import sys
    import uuid
    
    # Générer un user_id unique
    user_id = str(uuid.uuid4())[:8]
    
    # Port par défaut ou depuis argument
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9876
    
    # Créer le protocole
    znk = ZNKProtocole(
        user_id=user_id,
        dossier_partage=f"./data/shared",
        port=port
    )
    
    # Démarrer
    znk.demarrer()
    
    print("\n" + "="*50)
    print("ZNKprotocole P2P en cours d'exécution")
    print("="*50)
    print("Commandes disponibles:")
    print("  status  - Afficher le statut")
    print("  peers   - Lister les peers connectés")
    print("  files   - Lister les fichiers locaux")
    print("  publish <chemin> - Publier un fichier")
    print("  quit    - Quitter")
    print("="*50 + "\n")
    
    # Boucle de commandes
    try:
        while True:
            cmd = input("> ").strip().lower()
            
            if cmd == "quit":
                break
            elif cmd == "status":
                statut = znk.obtenir_statut()
                print(f"\n📊 Statut:")
                for k, v in statut.items():
                    print(f"  {k}: {v}")
                print()
            elif cmd == "peers":
                print(f"\n👥 Peers connectés ({len(znk.peers)}):")
                for peer_id, (ip, port) in znk.peers.items():
                    print(f"  {peer_id} @ {ip}:{port}")
                print()
            elif cmd == "files":
                print(f"\n📁 Fichiers locaux ({len(znk.fichiers_locaux)}):")
                for nom, hash_val in znk.fichiers_locaux.items():
                    print(f"  {nom} ({hash_val[:8]}...)")
                print()
            elif cmd.startswith("publish "):
                chemin = cmd.split(" ", 1)[1]
                znk.publier_fichier(chemin)
            else:
                print("❌ Commande inconnue")
    
    except KeyboardInterrupt:
        print("\n\n🛑 Arrêt...")
    
    finally:
        znk.arreter()
