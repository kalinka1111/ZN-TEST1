#!/usr/bin/env python3
"""
ZNK Backend API - Version VPS (registre de pairs + auth par clé API)
Port: 5000
"""

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import os
import sys
import json
import time
import uuid
import secrets
from functools import wraps
from datetime import datetime, timedelta

# Pont vers le démon P2P (découverte + transport local, voir znk_p2p_protocol.py)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from znk_p2p_protocol import ZNKProtocole

# Configuration
app = Flask(__name__)
CORS(app)  # Permettre les requêtes cross-origin

# Configuration multi-instance : permet de lancer plusieurs identités ZNK
# en parallèle sur la même machine (utile pour tester entre plusieurs devices).
# Exemple : PORT=5001 P2P_PORT=9877 DATA_DIR=data_iphone python3 server.py
FLASK_PORT = int(os.environ.get('PORT', 5000))
P2P_PORT = int(os.environ.get('P2P_PORT', 9876))

# Chemins
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, os.environ.get('DATA_DIR', 'data'))
PUBLICATIONS_DIR = os.path.join(DATA_DIR, 'publications')
SHARED_DIR = os.path.join(DATA_DIR, 'shared')
BOOKS_DIR = os.path.join(DATA_DIR, 'books')  # livres publiés depuis ZNK-LIVREmoi, lus par ZNKLibrairie.html
ARTFLOW_DIR = os.path.join(DATA_DIR, 'artflow-posts')  # publications ArtFlow visibles par tous
PROFILES_DIR = os.path.join(DATA_DIR, 'profiles')  # profils utilisateurs publiés (user-profile.html)
CARNETS_DIR = os.path.join(DATA_DIR, 'carnets')  # carnets de croquis publiés (elevesArt.html, seuil 10 pages)

# Créer les dossiers si nécessaire
for directory in [DATA_DIR, PUBLICATIONS_DIR, SHARED_DIR, BOOKS_DIR, ARTFLOW_DIR, PROFILES_DIR, CARNETS_DIR]:
    os.makedirs(directory, exist_ok=True)

# ============================================================================
# AUTH PAR CLÉ API (obligatoire sur un serveur exposé publiquement)
# ============================================================================
# Fichier local de clés valides (une par device ZNK). Sur le VPS, ce fichier
# ne doit être lisible que par l'utilisateur qui lance le service.
API_KEYS_FILE = os.path.join(DATA_DIR, 'api_keys.json')

def _charger_cles():
    if os.path.exists(API_KEYS_FILE):
        with open(API_KEYS_FILE, 'r') as f:
            return json.load(f)
    return {}

def _sauver_cles(cles):
    with open(API_KEYS_FILE, 'w') as f:
        json.dump(cles, f, indent=2)

def require_api_key(f):
    """Décorateur : exige un header 'X-ZNK-Key' valide, associé à un idZNK"""
    @wraps(f)
    def wrapper(*args, **kwargs):
        cle = request.headers.get('X-ZNK-Key')
        cles = _charger_cles()
        if not cle or cle not in cles:
            return jsonify({'status': 'error', 'message': 'Clé API manquante ou invalide'}), 401
        request.id_znk_authentifie = cles[cle]
        return f(*args, **kwargs)
    return wrapper

# ============================================================================
# REGISTRE DE PAIRS (remplace la découverte broadcast UDP, qui ne marche
# qu'en réseau local — sur Internet, chaque device s'enregistre ici via un
# heartbeat périodique, et interroge la liste pour joindre les autres)
# ============================================================================
PEER_TIMEOUT_SECONDS = 90  # pair considéré hors-ligne après ce délai sans heartbeat
peer_registry = {}  # id_znk -> {'ip': str, 'port': int, 'last_seen': datetime}

# ============================================================================
# NŒUD P2P (découverte + transport local, voir znk_p2p_protocol.py)
# ============================================================================
# Le nœud n'est démarré qu'une fois l'identité ZNK de l'appareil connue
# (voir /api/identity/register, appelé par l'app juste après connexion).
znk_node = None

def demarrer_noeud_p2p(id_znk: str):
    """Démarre (ou redémarre si changement de compte) le nœud P2P pour cette identité.

    ZNK_REGISTRY_URL et ZNK_API_KEY : à définir sur CHAQUE DEVICE (pas sur le VPS),
    ex. export ZNK_REGISTRY_URL=https://api.tondomaine.com
        export ZNK_API_KEY=la_cle_recue_via_provision
    Si absentes, le nœud reste en découverte locale (broadcast UDP) uniquement.
    """
    global znk_node
    if znk_node is not None and znk_node.user_id == id_znk:
        return znk_node  # déjà démarré pour cette identité

    if znk_node is not None:
        znk_node.arreter()

    registry_url = os.environ.get('ZNK_REGISTRY_URL')
    api_key = os.environ.get('ZNK_API_KEY')

    znk_node = ZNKProtocole(
        user_id=id_znk,
        dossier_partage=SHARED_DIR,
        port=P2P_PORT,
        registry_url=registry_url,
        api_key=api_key
    )
    znk_node.demarrer()
    print(f"📡 Nœud P2P démarré pour l'identité: {id_znk}")
    return znk_node

# Statistiques en mémoire
stats = {
    'start_time': datetime.now().isoformat(),
    'total_requests': 0,
    'total_publications': 0
}

# ============================================================================
# MIDDLEWARE
# ============================================================================

@app.before_request
def before_request():
    """Compteur de requêtes"""
    stats['total_requests'] += 1

@app.after_request
def after_request(response):
    """Ajout des headers CORS"""
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

# ============================================================================
# ROUTES - HEALTH CHECK
# ============================================================================

@app.route('/')
def index():
    """Page d'accueil API"""
    return jsonify({
        'status': 'online',
        'service': 'ZNK Backend API',
        'version': '2.0.0',
        'timestamp': datetime.now().isoformat(),
        'endpoints': {
            'health': '/health',
            'stats': '/api/stats',
            'publications': '/api/publications',
            'upload': '/api/upload'
        }
    })

@app.route('/health')
def health():
    """Health check pour monitoring"""
    uptime = (datetime.now() - datetime.fromisoformat(stats['start_time'])).total_seconds()
    return jsonify({
        'status': 'healthy',
        'uptime_seconds': uptime,
        'timestamp': datetime.now().isoformat()
    })

# ============================================================================
# ROUTES - PROVISIONNEMENT DE CLÉ API
# ============================================================================
# À appeler UNE FOIS par device, idéalement protégé en amont (ex: invitation
# à usage unique) — sinon n'importe qui pourrait s'auto-provisionner. Pour un
# lancement contrôlé, désactive cette route après avoir généré les clés dont
# tu as besoin, ou ajoute un code d'invitation vérifié ici.
@app.route('/api/auth/provision', methods=['POST'])
def provision_key():
    """Génère une clé API pour un idZNK donné (une seule fois)"""
    data = request.get_json() or {}
    id_znk = data.get('idZNK')
    if not id_znk:
        return jsonify({'status': 'error', 'message': 'idZNK manquant'}), 400

    cles = _charger_cles()
    for k, v in cles.items():
        if v == id_znk:
            return jsonify({'status': 'success', 'api_key': k, 'idZNK': id_znk})

    nouvelle_cle = secrets.token_hex(24)
    cles[nouvelle_cle] = id_znk
    _sauver_cles(cles)
    return jsonify({'status': 'success', 'api_key': nouvelle_cle, 'idZNK': id_znk}), 201

# ============================================================================
# ROUTES - REGISTRE DE PAIRS (découverte via Internet, remplace le broadcast)
# ============================================================================

@app.route('/api/p2p/heartbeat', methods=['POST'])
@require_api_key
def peer_heartbeat():
    """À appeler toutes les 30-60s par chaque device en ligne"""
    data = request.get_json() or {}
    port_local = data.get('port', 9876)
    id_znk = request.id_znk_authentifie

    ip_publique = request.headers.get('X-Forwarded-For', request.remote_addr)
    if ip_publique and ',' in ip_publique:
        ip_publique = ip_publique.split(',')[0].strip()

    peer_registry[id_znk] = {
        'ip': ip_publique,
        'port': port_local,
        'last_seen': datetime.now()
    }
    return jsonify({'status': 'success', 'registered_as': id_znk, 'ip_seen': ip_publique})


@app.route('/api/p2p/directory', methods=['GET'])
@require_api_key
def peer_directory():
    """Liste des pairs actifs (heartbeat reçu dans le délai de timeout)"""
    maintenant = datetime.now()
    actifs = {}
    for id_znk, info in list(peer_registry.items()):
        if (maintenant - info['last_seen']).total_seconds() <= PEER_TIMEOUT_SECONDS:
            actifs[id_znk] = {'ip': info['ip'], 'port': info['port']}
        else:
            del peer_registry[id_znk]

    return jsonify({'status': 'success', 'peers': actifs, 'count': len(actifs)})

# ============================================================================
# ROUTES - IDENTITÉ ZNK (branche le nœud P2P sur le compte connecté)
# ============================================================================

@app.route('/api/identity/register', methods=['POST'])
@require_api_key
def register_identity():
    """
    À appeler juste après connexion (auth-hub.html) : indique au backend local
    quelle identité ZNK (idZNK) cet appareil représente, pour démarrer/rattacher
    le nœud P2P correspondant.
    """
    data = request.get_json() or {}
    id_znk = data.get('idZNK')

    if not id_znk:
        return jsonify({'status': 'error', 'message': 'idZNK manquant'}), 400

    node = demarrer_noeud_p2p(id_znk)

    return jsonify({
        'status': 'success',
        'message': f'Nœud P2P actif pour {id_znk}',
        'statut_p2p': node.obtenir_statut()
    })


def _require_node():
    """Vérifie que le nœud P2P est démarré, sinon retourne une réponse d'erreur claire"""
    if znk_node is None:
        return jsonify({
            'status': 'error',
            'message': "Identité non enregistrée : appelez /api/identity/register d'abord"
        }), 409
    return None

# ============================================================================
# ROUTES - MESSAGERIE (email @echo.znk / ZnkWhatsApp, via P2P local)
# ============================================================================

@app.route('/api/messages/send', methods=['POST'])
@require_api_key
def send_message():
    """Envoie un message privé à un destinataire (par idZNK) - direct si en ligne, sinon mis en attente"""
    err = _require_node()
    if err:
        return err

    data = request.get_json() or {}
    destinataire = data.get('to')
    sujet = data.get('subject', '')
    corps = data.get('body', '')
    canal = data.get('canal', 'email')  # 'email' ou 'whatszapp'

    if not destinataire or not corps:
        return jsonify({'status': 'error', 'message': 'Destinataire ou contenu manquant'}), 400

    resultat = znk_node.envoyer_message_texte(destinataire, sujet, corps, canal)
    return jsonify({'status': 'success', **resultat}), 201


@app.route('/api/messages/inbox', methods=['GET'])
@require_api_key
def get_inbox():
    """Boîte de réception (messages reçus d'autres pairs)"""
    err = _require_node()
    if err:
        return err
    return jsonify({'status': 'success', 'messages': znk_node.lire_boite_reception()})


@app.route('/api/messages/sent', methods=['GET'])
@require_api_key
def get_sent():
    """Historique des messages envoyés (livrés ou en attente)"""
    err = _require_node()
    if err:
        return err
    return jsonify({'status': 'success', 'messages': znk_node.lire_messages_envoyes()})


@app.route('/api/messages/queue', methods=['GET'])
@require_api_key
def get_queue():
    """Messages en attente d'un destinataire actuellement hors-ligne"""
    err = _require_node()
    if err:
        return err
    return jsonify({'status': 'success', 'messages': znk_node.obtenir_file_attente()})


@app.route('/api/p2p/status', methods=['GET'])
@require_api_key
def get_p2p_status():
    """Statut du nœud P2P (pairs connectés, fichiers locaux, messages en attente...)"""
    err = _require_node()
    if err:
        return err
    return jsonify({'status': 'success', 'p2p': znk_node.obtenir_statut()})


@app.route('/api/p2p/peers', methods=['GET'])
@require_api_key
def get_peers():
    """Liste des pairs actuellement joignables sur le réseau local"""
    err = _require_node()
    if err:
        return err
    peers = [{'id_znk': pid, 'ip': ip, 'port': port} for pid, (ip, port) in znk_node.peers.items()]
    return jsonify({'status': 'success', 'peers': peers})

# ============================================================================
# ROUTES - STATISTIQUES
# ============================================================================

@app.route('/api/stats')
def get_stats():
    """Récupérer les statistiques du système"""
    # Compter les publications
    try:
        publications = [f for f in os.listdir(PUBLICATIONS_DIR) if f.endswith('.json')]
        stats['total_publications'] = len(publications)
    except:
        stats['total_publications'] = 0
    
    uptime = (datetime.now() - datetime.fromisoformat(stats['start_time'])).total_seconds()
    
    return jsonify({
        'status': 'success',
        'stats': {
            **stats,
            'uptime_seconds': uptime,
            'uptime_human': f"{int(uptime // 60)}min {int(uptime % 60)}s"
        }
    })

# ============================================================================
# ROUTES - PUBLICATIONS
# ============================================================================

@app.route('/api/publications', methods=['GET'])
def get_publications():
    """Lister toutes les publications"""
    try:
        publications = []
        
        for filename in os.listdir(PUBLICATIONS_DIR):
            if filename.endswith('.json'):
                filepath = os.path.join(PUBLICATIONS_DIR, filename)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        pub = json.load(f)
                        pub['filename'] = filename
                        publications.append(pub)
                except:
                    pass
        
        # Trier par date (plus récent en premier)
        publications.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        
        return jsonify({
            'status': 'success',
            'count': len(publications),
            'publications': publications
        })
    
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/publications/<pub_id>', methods=['GET'])
def get_publication(pub_id):
    """Récupérer une publication spécifique"""
    try:
        filepath = os.path.join(PUBLICATIONS_DIR, f"{pub_id}.json")
        
        if not os.path.exists(filepath):
            return jsonify({
                'status': 'error',
                'message': 'Publication non trouvée'
            }), 404
        
        with open(filepath, 'r', encoding='utf-8') as f:
            publication = json.load(f)
        
        return jsonify({
            'status': 'success',
            'publication': publication
        })
    
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/publications', methods=['POST'])
def create_publication():
    """Créer une nouvelle publication"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'status': 'error',
                'message': 'Données manquantes'
            }), 400
        
        # Générer un ID unique
        pub_id = f"pub_{int(time.time() * 1000)}"
        
        # Ajouter métadonnées
        publication = {
            'id': pub_id,
            'created_at': datetime.now().isoformat(),
            **data
        }
        
        # Sauvegarder
        filepath = os.path.join(PUBLICATIONS_DIR, f"{pub_id}.json")
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(publication, f, indent=2, ensure_ascii=False)
        
        stats['total_publications'] += 1
        
        return jsonify({
            'status': 'success',
            'message': 'Publication créée',
            'publication': publication
        }), 201
    
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

# ============================================================================
# ROUTES - LIVRES (ZNK-LIVREmoi -> ZNK Librairie)
# ============================================================================
# Manquaient jusqu'ici : ZNK-LIVREmoi.html (bouton "Publier dans ZNK Librairie")
# et ZNKLibrairie.html appelaient déjà /api/books et /api/books/<id>, en
# supposant un serveur Node/Express ("server.js" dans un commentaire) — mais
# le vrai backend de l'app est ce fichier, Flask. D'où le lien qui ne
# fonctionnait pas : les routes n'existaient simplement pas côté serveur.
# Même convention que /api/publications : un fichier JSON par livre.

@app.route('/api/books', methods=['GET'])
def get_books():
    """Liste allégée des livres publiés (sans le contenu des pages, pour
    rester rapide même avec beaucoup d'images) — pour la grille de ZNKLibrairie."""
    try:
        books = []
        for filename in os.listdir(BOOKS_DIR):
            if not filename.endswith('.json'):
                continue
            filepath = os.path.join(BOOKS_DIR, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    b = json.load(f)
                books.append({
                    'id': b.get('id'),
                    'title': b.get('title'),
                    'author': b.get('author'),
                    'cover': b.get('cover'),
                    'pagesCount': len(b.get('pages') or []),
                    'publishedAt': b.get('publishedAt')
                })
            except Exception:
                pass

        books.sort(key=lambda x: x.get('publishedAt') or '', reverse=True)

        return jsonify({'status': 'success', 'books': books})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/books/<book_id>', methods=['GET'])
def get_book(book_id):
    """Livre complet (avec pages/images) — pour la visionneuse de ZNKLibrairie."""
    try:
        filepath = os.path.join(BOOKS_DIR, f"{book_id}.json")
        if not os.path.exists(filepath):
            return jsonify({'status': 'error', 'message': 'Livre non trouvé'}), 404
        with open(filepath, 'r', encoding='utf-8') as f:
            book = json.load(f)
        return jsonify({'status': 'success', 'book': book})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/books/<book_id>', methods=['POST'])
def publish_book(book_id):
    """Publie (ou republie) un livre — écrase le fichier existant si l'id est
    déjà connu, pour que republier mette à jour le même livre plutôt que d'en
    créer un doublon."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'message': 'Données manquantes'}), 400

        published_at = datetime.now().isoformat()
        book = {**data, 'id': book_id, 'publishedAt': published_at}

        filepath = os.path.join(BOOKS_DIR, f"{book_id}.json")
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(book, f, indent=2, ensure_ascii=False)

        return jsonify({'status': 'success', 'publishedAt': published_at, 'book': book}), 200
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# ============================================================================
# ROUTES - ARTFLOW (publications visibles par tous, artflow.html)
# ============================================================================

@app.route('/api/artflow-posts', methods=['GET'])
def get_artflow_posts():
    """Liste allégée (sans le fichier vidéo/audio complet) pour la grille ArtFlow."""
    try:
        posts = []
        for filename in os.listdir(ARTFLOW_DIR):
            if not filename.endswith('.json'):
                continue
            try:
                with open(os.path.join(ARTFLOW_DIR, filename), 'r', encoding='utf-8') as f:
                    p = json.load(f)
                posts.append({
                    'id': p.get('id'),
                    'authorId': p.get('authorId'),
                    'authorName': p.get('authorName'),
                    'title': p.get('title'),
                    'thumbnail': p.get('thumbnail'),
                    'priority': p.get('priority'),
                    'publishedAt': p.get('publishedAt')
                })
            except Exception:
                pass
        posts.sort(key=lambda x: x.get('publishedAt') or '', reverse=True)
        return jsonify({'status': 'success', 'posts': posts})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/artflow-posts/<post_id>', methods=['GET'])
def get_artflow_post(post_id):
    """Publication complète (avec la vidéo/audio) — lue au clic dans la grille."""
    try:
        filepath = os.path.join(ARTFLOW_DIR, f"{post_id}.json")
        if not os.path.exists(filepath):
            return jsonify({'status': 'error', 'message': 'Publication non trouvée'}), 404
        with open(filepath, 'r', encoding='utf-8') as f:
            post = json.load(f)
        return jsonify({'status': 'success', 'post': post})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/artflow-posts/<post_id>', methods=['POST'])
def publish_artflow_post(post_id):
    try:
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'message': 'Données manquantes'}), 400
        published_at = datetime.now().isoformat()
        post = {**data, 'id': post_id, 'publishedAt': published_at}
        filepath = os.path.join(ARTFLOW_DIR, f"{post_id}.json")
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(post, f, indent=2, ensure_ascii=False)
        return jsonify({'status': 'success', 'publishedAt': published_at, 'post': post}), 200
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# ============================================================================
# ROUTES - PROFILS (user-profile.html)
# ============================================================================

@app.route('/api/profiles', methods=['GET'])
def get_profiles():
    """Liste allégée (sans les posts complets) pour un futur annuaire/recherche."""
    try:
        profiles = []
        for filename in os.listdir(PROFILES_DIR):
            if not filename.endswith('.json'):
                continue
            try:
                with open(os.path.join(PROFILES_DIR, filename), 'r', encoding='utf-8') as f:
                    p = json.load(f)
                profiles.append({
                    'id': p.get('id'),
                    'name': p.get('name'),
                    'avatar': p.get('avatar'),
                    'stats': p.get('stats'),
                    'publishedAt': p.get('publishedAt')
                })
            except Exception:
                pass
        profiles.sort(key=lambda x: x.get('publishedAt') or '', reverse=True)
        return jsonify({'status': 'success', 'profiles': profiles})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/profiles/<user_id>', methods=['GET'])
def get_profile(user_id):
    """Profil complet (avec ses posts publics) — pour consulter le profil d'un autre utilisateur."""
    try:
        filepath = os.path.join(PROFILES_DIR, f"{user_id}.json")
        if not os.path.exists(filepath):
            return jsonify({'status': 'error', 'message': 'Profil non trouvé'}), 404
        with open(filepath, 'r', encoding='utf-8') as f:
            profile = json.load(f)
        return jsonify({'status': 'success', 'profile': profile})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/profiles/<user_id>', methods=['POST'])
def publish_profile(user_id):
    """Publie/republie le profil de l'utilisateur connecté — écrase le fichier
    existant pour ce user_id à chaque appel (toujours l'état le plus récent)."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'message': 'Données manquantes'}), 400
        published_at = datetime.now().isoformat()
        profile = {**data, 'id': user_id, 'publishedAt': published_at}
        filepath = os.path.join(PROFILES_DIR, f"{user_id}.json")
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(profile, f, indent=2, ensure_ascii=False)
        return jsonify({'status': 'success', 'publishedAt': published_at, 'profile': profile}), 200
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# ============================================================================
# ROUTES - CARNETS DE CROQUIS (elevesArt.html, publiés au seuil de 10 pages)
# ============================================================================

@app.route('/api/carnets', methods=['GET'])
def get_carnets():
    """Liste allégée pour la grille de la Galerie des Artistes."""
    try:
        carnets = []
        for filename in os.listdir(CARNETS_DIR):
            if not filename.endswith('.json'):
                continue
            try:
                with open(os.path.join(CARNETS_DIR, filename), 'r', encoding='utf-8') as f:
                    c = json.load(f)
                carnets.append({
                    'id': c.get('id'),
                    'displayName': c.get('displayName'),
                    'niveau': c.get('niveau'),
                    'pageCount': len(c.get('pages') or []),
                    'thumbnail': c.get('thumbnail'),
                    'publishedAt': c.get('publishedAt')
                })
            except Exception:
                pass
        carnets.sort(key=lambda x: x.get('publishedAt') or '', reverse=True)
        return jsonify({'status': 'success', 'carnets': carnets})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/carnets/<student_id>', methods=['GET'])
def get_carnet(student_id):
    """Carnet complet (toutes les pages) — pour ouvrir la carte d'un élève."""
    try:
        filepath = os.path.join(CARNETS_DIR, f"{student_id}.json")
        if not os.path.exists(filepath):
            return jsonify({'status': 'error', 'message': 'Carnet non trouvé'}), 404
        with open(filepath, 'r', encoding='utf-8') as f:
            carnet = json.load(f)
        return jsonify({'status': 'success', 'carnet': carnet})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/carnets/<student_id>', methods=['POST'])
def publish_carnet(student_id):
    """Publie/met à jour le carnet d'un élève (appelé automatiquement dès que
    son carnet atteint le seuil de publication, voir elevesArt.html)."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'message': 'Données manquantes'}), 400
        published_at = datetime.now().isoformat()
        carnet = {**data, 'id': student_id, 'publishedAt': published_at}
        filepath = os.path.join(CARNETS_DIR, f"{student_id}.json")
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(carnet, f, indent=2, ensure_ascii=False)
        return jsonify({'status': 'success', 'publishedAt': published_at, 'carnet': carnet}), 200
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# ============================================================================
# ROUTES - UPLOAD
# ============================================================================

@app.route('/api/upload', methods=['POST'])
def upload_file():
    """Upload de fichiers"""
    try:
        if 'file' not in request.files:
            return jsonify({
                'status': 'error',
                'message': 'Aucun fichier fourni'
            }), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({
                'status': 'error',
                'message': 'Nom de fichier vide'
            }), 400
        
        # Sauvegarder le fichier
        filename = f"{int(time.time() * 1000)}_{file.filename}"
        filepath = os.path.join(SHARED_DIR, filename)
        file.save(filepath)
        
        return jsonify({
            'status': 'success',
            'message': 'Fichier uploadé',
            'filename': filename,
            'size': os.path.getsize(filepath)
        }), 201
    
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

# ============================================================================
# ROUTES - STATIC FILES
# ============================================================================

@app.route('/files/<path:filename>')
def serve_file(filename):
    """Servir les fichiers uploadés"""
    return send_from_directory(SHARED_DIR, filename)

# ============================================================================
# ERROR HANDLERS
# ============================================================================

@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'status': 'error',
        'message': 'Endpoint non trouvé',
        'code': 404
    }), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({
        'status': 'error',
        'message': 'Erreur serveur interne',
        'code': 500
    }), 500

# ============================================================================
# MAIN
# ============================================================================

if __name__ == '__main__':
    # Afficher les informations de démarrage
    print("=" * 70)
    print("🚀 ZNK Backend API Starting...")
    print("=" * 70)
    print(f"📂 Base Directory: {BASE_DIR}")
    print(f"📁 Data Directory: {DATA_DIR}")
    print(f"📡 Server: http://localhost:{FLASK_PORT}  (P2P port: {P2P_PORT})")
    print(f"🔗 Health Check: http://localhost:{FLASK_PORT}/health")
    print(f"📊 Stats: http://localhost:{FLASK_PORT}/api/stats")
    print("=" * 70)
    print()
    
    # Vérifier les arguments (mode test)
    if '--test' in sys.argv:
        print("✓ Test mode: configuration OK")
        sys.exit(0)
    
    # Démarrer le serveur
    try:
        app.run(
            host='0.0.0.0',  # Accessible depuis l'extérieur
            port=FLASK_PORT,
            debug=False,  # Désactiver debug en production
            threaded=True
        )
    except KeyboardInterrupt:
        print("\n👋 Arrêt du serveur...")
    except Exception as e:
        print(f"\n❌ Erreur fatale: {e}")
        sys.exit(1)