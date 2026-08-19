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
from typing import Dict, List, Tuple, Optional
import struct
from datetime import datetime

try:
    import requests
except ImportError:
    requests = None  # la découverte via registre VPS sera simplement désactivée

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
    MSG_TEXT = 0x09         # Message texte privé (email @echo.znk / ZnkWhatsApp)
    
    def __init__(self, user_id: str, dossier_partage: str, port: int = PORT_DEFAULT,
                 registry_url: Optional[str] = None, api_key: Optional[str] = None,
                 classe_id: Optional[str] = None):
        """
        registry_url : ex. 'https://api.tondomaine.com' — si fourni, active la
                       découverte de pairs via Internet (registre VPS) EN PLUS
                       du broadcast local. Laisser à None pour rester en LAN pur.
        api_key      : clé obtenue via /api/auth/provision, requise si registry_url est fourni.
        classe_id    : scope "P2P actif par classe" (ex: "classe-primaire-EN2468").
                       Quand défini, le partage AUTOMATIQUE de fichiers (liste de
                       fichiers, notifications de nouveaux fichiers) ne se fait
                       qu'avec les pairs de la même classe. La messagerie privée
                       (envoyer_message_texte) n'est jamais bloquée par ce scope :
                       un élève doit toujours pouvoir écrire à un pair connu, même
                       hors de sa classe. Laisser à None pour ne pas scoper (ex:
                       compte admin/prof qui doit tout voir).
        """
        self.user_id = user_id
        self.port = port
        self.dossier_partage = Path(dossier_partage)
        self.peers: Dict[str, Tuple[str, int]] = {}  # {peer_id: (ip, port)}
        self.peers_classe: Dict[str, Optional[str]] = {}  # {peer_id: classe_id annoncée}
        self.running = False
        self.server_socket = None
        self.fichiers_locaux: Dict[str, str] = {}  # {nom_fichier: hash}
        self.registry_url = registry_url.rstrip('/') if registry_url else None
        self.api_key = api_key
        self.classe_id = classe_id

        # Messagerie texte (email @echo.znk / ZnkWhatsApp)
        self.messages_dir = self.dossier_partage.parent / 'messages'
        self.messages_dir.mkdir(parents=True, exist_ok=True)
        self.inbox_file = self.messages_dir / 'inbox.json'
        self.outbox_queue_file = self.messages_dir / 'outbox_queue.json'
        self.inbox: List[Dict] = self._charger_json(self.inbox_file)
        self.outbox_queue: List[Dict] = self._charger_json(self.outbox_queue_file)
        
    def definir_classe(self, classe_id: Optional[str]):
        """Change la classe courante (ex: professeur qui bascule de niveau/classe,
        ou élève qui vient de se connecter). Affecte uniquement le partage
        automatique de fichiers entre pairs ; la messagerie privée n'est pas concernée."""
        self.classe_id = classe_id
        print(f"🏫 Classe P2P définie: {classe_id or '(aucune - non scopé)'}")

    def _meme_classe(self, peer_id: str) -> bool:
        """Détermine si un pair fait partie de notre classe pour le partage
        automatique de fichiers. Si l'un des deux côtés n'a pas défini de classe
        (None), on considère qu'il n'y a pas de restriction pour ce côté-là
        (comportement rétrocompatible pour les comptes admin/prof non scopés)."""
        peer_classe = self.peers_classe.get(peer_id)
        if self.classe_id is None or peer_classe is None:
            return True
        return peer_classe == self.classe_id

    def demarrer(self):
        """Démarre le nœud P2P"""
        self.running = True
        self._scanner_fichiers_locaux()
        
        # Thread serveur pour écouter les connexions entrantes
        server_thread = threading.Thread(target=self._serveur_ecoute, daemon=True)
        server_thread.start()
        
        # Thread découverte de peers (réseau local, broadcast UDP)
        discovery_thread = threading.Thread(target=self._decouvrir_peers, daemon=True)
        discovery_thread.start()

        # Thread découverte via registre VPS (fonctionne à travers Internet)
        if self.registry_url and requests is not None:
            registry_thread = threading.Thread(target=self._sync_registre_vps, daemon=True)
            registry_thread.start()
            print(f"🌐 Synchronisation registre VPS activée: {self.registry_url}")
        elif self.registry_url and requests is None:
            print("⚠️ registry_url fourni mais le module 'requests' n'est pas installé (pip install requests)")
        
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
                # Lire l'en-tête complet du message : MAGIC(4) + TYPE(1) + RESERVED(1) + LENGTH(2) = 8 octets
                header = client_socket.recv(8)
                if not header or len(header) < 8:
                    break
                
                magic, msg_type, _reserved, data_len = struct.unpack('!4sBBH', header)
                
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

            elif msg_type == self.MSG_TEXT:
                self._traiter_message_texte(payload)
                
        except Exception as e:
            print(f"❌ Erreur traitement message: {e}")
    
    def _traiter_hello(self, sock: socket.socket, payload: Dict, address: Tuple):
        """Traite un message HELLO (découverte de peer)"""
        peer_id = payload.get('user_id')
        peer_port = payload.get('port', self.port)
        
        if peer_id and peer_id != self.user_id:
            self.peers[peer_id] = (address[0], peer_port)
            self.peers_classe[peer_id] = payload.get('classe_id')
            print(f"🤝 Nouveau peer: {peer_id} @ {address[0]}:{peer_port}")
            
            # Répondre avec HELLO_ACK
            response = {
                'user_id': self.user_id,
                'port': self.port,
                'version': self.VERSION,
                'classe_id': self.classe_id
            }
            self._envoyer_message(sock, self.MSG_HELLO_ACK, response)
            
            # Partage automatique de fichiers réservé aux pairs de la même classe
            # (P2P actif par classe) — un pair hors classe reste joignable pour la
            # messagerie privée, mais ne reçoit pas notre liste de fichiers.
            if self._meme_classe(peer_id):
                self._envoyer_liste_fichiers(sock)

            # Ce pair vient de réapparaître : on tente de lui livrer les messages en attente
            self._traiter_queue_pour_peer(peer_id)
    
    def _traiter_file_list(self, sock: socket.socket, payload: Dict):
        """Traite une liste de fichiers reçue d'un peer"""
        peer_id = payload.get('user_id')

        # P2P actif par classe : on ignore les listes de fichiers venant d'un pair
        # d'une autre classe (pas de téléchargement automatique croisé entre classes).
        if peer_id and not self._meme_classe(peer_id):
            print(f"⏭️ Liste de fichiers ignorée (classe différente): {peer_id}")
            return

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
    
    def _sync_registre_vps(self):
        """
        Découverte de pairs via Internet : envoie un heartbeat périodique au VPS
        et récupère l'annuaire des pairs actifs pour s'y connecter directement.
        Tourne en parallèle du broadcast local (_decouvrir_peers) — les deux
        coexistent sans conflit, ils remplissent juste self.peers.
        """
        headers = {'X-ZNK-Key': self.api_key, 'Content-Type': 'application/json'}

        while self.running:
            try:
                # 1. Signaler qu'on est en ligne (classe_id transmis pour que le
                # registre VPS puisse lui-même grouper/filtrer par classe côté serveur)
                requests.post(
                    f"{self.registry_url}/api/p2p/heartbeat",
                    headers=headers,
                    json={'port': self.port, 'classe_id': self.classe_id},
                    timeout=5
                )

                # 2. Récupérer l'annuaire et se connecter aux nouveaux pairs
                params = {'classe_id': self.classe_id} if self.classe_id else {}
                resp = requests.get(
                    f"{self.registry_url}/api/p2p/directory",
                    headers=headers,
                    params=params,
                    timeout=5
                )
                if resp.ok:
                    annuaire = resp.json().get('peers', {})
                    for peer_id, info in annuaire.items():
                        if peer_id == self.user_id or peer_id in self.peers:
                            continue
                        ip, port = info.get('ip'), info.get('port')
                        if ip and port:
                            print(f"🌐 Pair distant découvert via VPS: {peer_id} @ {ip}:{port}")
                            self.peers_classe[peer_id] = info.get('classe_id')
                            self._connecter_a_peer(ip, port)

            except Exception as e:
                if self.running:
                    print(f"⚠️ Erreur sync registre VPS: {e}")

            time.sleep(30)  # heartbeat toutes les 30s

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
                    'port': self.port,
                    'classe_id': self.classe_id
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
                            self.peers_classe[peer_id] = peer_info.get('classe_id')
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
                'version': self.VERSION,
                'classe_id': self.classe_id
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
        """Notifie les peers de la même classe de nos nouveaux fichiers
        (P2P actif par classe : pas de diffusion croisée entre classes)"""
        for peer_id, (ip, port) in self.peers.items():
            if not self._meme_classe(peer_id):
                continue
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
            'classe_id': self.classe_id,
            'peers_connectes': len(self.peers),
            'fichiers_locaux': len(self.fichiers_locaux),
            'messages_en_attente': len(self.outbox_queue),
            'running': self.running
        }

    # ========================================
    # MESSAGERIE TEXTE (email @echo.znk / ZnkWhatsApp)
    # ========================================

    def _charger_json(self, chemin: Path) -> List[Dict]:
        """Charge une liste JSON depuis le disque (retourne [] si absent/invalide)"""
        try:
            if chemin.exists():
                with open(chemin, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except Exception as e:
            print(f"⚠️ Erreur lecture {chemin.name}: {e}")
        return []

    def _sauvegarder_json(self, chemin: Path, contenu: List[Dict]):
        """Sauvegarde une liste JSON sur le disque"""
        try:
            with open(chemin, 'w', encoding='utf-8') as f:
                json.dump(contenu, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"⚠️ Erreur écriture {chemin.name}: {e}")

    def envoyer_message_texte(self, destinataire_id: str, sujet: str, corps: str,
                               canal: str = 'email') -> Dict:
        """
        Envoie un message privé (email @echo.znk ou ZnkWhatsApp) à un destinataire.
        - Si le destinataire est actuellement connu/joignable en local -> envoi direct immédiat.
        - Sinon -> mis en file d'attente, livré automatiquement dès que ce pair réapparaît.
        """
        message = {
            'id': f"msg_{int(time.time() * 1000)}_{self.user_id}",
            'from': self.user_id,
            'to': destinataire_id,
            'canal': canal,          # 'email' ou 'whatszapp'
            'sujet': sujet,
            'corps': corps,
            'timestamp': time.time(),
            'date': datetime.now().isoformat()
        }

        if destinataire_id in self.peers:
            if self._envoyer_message_a_peer(destinataire_id, message):
                message['statut'] = 'livre'
                self._archiver_message_envoye(message)
                return {'success': True, 'delivered': True, 'message': message}

        # Pair non joignable maintenant : on met en file d'attente pour retenter plus tard
        message['statut'] = 'en_attente'
        self.outbox_queue.append(message)
        self._sauvegarder_json(self.outbox_queue_file, self.outbox_queue)
        self._archiver_message_envoye(message)
        print(f"📋 Message mis en attente pour {destinataire_id} (pair hors-ligne)")
        return {'success': True, 'delivered': False, 'message': message}

    def _envoyer_message_a_peer(self, peer_id: str, message: Dict) -> bool:
        """Ouvre une connexion directe vers un pair précis et lui envoie le message"""
        ip, port = self.peers[peer_id]
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(5.0)
            sock.connect((ip, port))
            self._envoyer_message(sock, self.MSG_TEXT, message)
            sock.close()
            print(f"✅ Message envoyé directement à {peer_id}")
            return True
        except Exception as e:
            print(f"⚠️ Échec envoi direct à {peer_id}: {e}")
            return False

    def _traiter_message_texte(self, payload: Dict):
        """Traite un message texte reçu d'un pair : l'ajoute à la boîte de réception locale"""
        payload['statut'] = 'recu'
        payload['recu_le'] = time.time()
        self.inbox.insert(0, payload)
        self.inbox = self.inbox[:500]  # Limite raisonnable
        self._sauvegarder_json(self.inbox_file, self.inbox)
        print(f"📨 Nouveau message de {payload.get('from')} : {payload.get('sujet')}")

    def _archiver_message_envoye(self, message: Dict):
        """Garde une trace locale des messages envoyés (boîte d'envoi), livrés ou en attente"""
        outbox_file = self.messages_dir / 'sent.json'
        sent = self._charger_json(outbox_file)
        sent.insert(0, message)
        self._sauvegarder_json(outbox_file, sent[:500])

    def _traiter_queue_pour_peer(self, peer_id: str):
        """Dès qu'un pair redevient joignable, on lui livre les messages qui l'attendaient"""
        if not self.outbox_queue:
            return

        restants = []
        for message in self.outbox_queue:
            if message.get('to') == peer_id:
                if self._envoyer_message_a_peer(peer_id, message):
                    message['statut'] = 'livre'
                    self._archiver_message_envoye(message)
                    print(f"✅ Message en attente livré à {peer_id}")
                    continue
            restants.append(message)

        if len(restants) != len(self.outbox_queue):
            self.outbox_queue = restants
            self._sauvegarder_json(self.outbox_queue_file, self.outbox_queue)

    def lire_boite_reception(self) -> List[Dict]:
        """Retourne les messages reçus (boîte de réception)"""
        return self.inbox

    def lire_messages_envoyes(self) -> List[Dict]:
        """Retourne l'historique des messages envoyés (livrés ou en attente)"""
        return self._charger_json(self.messages_dir / 'sent.json')

    def obtenir_file_attente(self) -> List[Dict]:
        """Retourne les messages actuellement en attente d'un destinataire hors-ligne"""
        return self.outbox_queue


# Exemple d'utilisation
if __name__ == "__main__":
    import sys
    import uuid
    
    # Générer un user_id unique
    user_id = str(uuid.uuid4())[:8]
    
    # Port par défaut ou depuis argument
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9876

    # Classe optionnelle (2e argument), ex: python znk_p2p_protocol.py 9876 classe-primaire-EN2468
    classe_id = sys.argv[2] if len(sys.argv) > 2 else None
    
    # Créer le protocole
    znk = ZNKProtocole(
        user_id=user_id,
        dossier_partage=f"./data/shared",
        port=port,
        classe_id=classe_id
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
    print("  classe <id> - Changer la classe active (P2P actif par classe), 'classe' seul = enlever le scope")
    print("  quit    - Quitter")
    print("="*50 + "\n")
    
    # Boucle de commandes (optionnelle : si lancé en arrière-plan sans terminal
    # interactif, stdin n'a rien à lire — on reste alors simplement actif en service)
    try:
        while True:
            try:
                cmd = input("> ").strip().lower()
            except EOFError:
                print("\nℹ️ Aucun terminal interactif détecté — service P2P actif en arrière-plan.")
                while znk.running:
                    time.sleep(1)
                break
            
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
            elif cmd.startswith("classe"):
                reste = cmd[len("classe"):].strip()
                znk.definir_classe(reste or None)
            else:
                print("❌ Commande inconnue")
    
    except KeyboardInterrupt:
        print("\n\n🛑 Arrêt...")
    
    finally:
        znk.arreter()
