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
import requests
import re
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
FLASK_PORT = int(os.environ.get('PORT', 5001))  # 5000 souvent squatté par AirPlay Receiver sur macOS
P2P_PORT = int(os.environ.get('P2P_PORT', 9876))

# IA locale (ZNKOMia) : Ollama tourne à côté de ce serveur, sur la même machine
# (démarré depuis modules-admin/terminal-ZNK.html, Canal Serveur). Pour l'instant
# réservé à ton propre poste — voir /api/ia/chat plus bas.
OLLAMA_URL = os.environ.get('OLLAMA_URL', 'http://localhost:11434')
OLLAMA_MODEL = os.environ.get('OLLAMA_MODEL', 'llama3.2')
# Modèle Ollama avec vision, pour l'OCR manuscrit 100% local (voir OCR_PROVIDER
# plus bas). 'moondream' est petit et rapide (adapté à un Mac 2017) ; 'llava'
# est plus lourd mais souvent plus précis si la machine suit.
OLLAMA_VISION_MODEL = os.environ.get('OLLAMA_VISION_MODEL', 'moondream')

# IA cloud (transcription d'écriture manuscrite, module LIVREmoi) : contrairement
# à ZNKOMia (Ollama, local), l'OCR manuscrit s'appuie sur une IA avec vision
# hébergée. Le fournisseur est configurable — chaque utilisateur de l'app ZNK
# peut choisir celle qu'il préfère (ou qu'il a déjà en abonnement). Clé(s) à
# définir sur CE serveur uniquement — jamais côté client.
#   export OCR_PROVIDER=anthropic          (ou: openai)
#   export ANTHROPIC_API_KEY=sk-ant-...    (si anthropic)
#   export OPENAI_API_KEY=sk-...           (si openai)
OCR_PROVIDER = os.environ.get('OCR_PROVIDER', 'ollama').strip().lower()

ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')
ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
ANTHROPIC_MODEL = 'claude-sonnet-4-6'

OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
OPENAI_MODEL = os.environ.get('OPENAI_MODEL', 'gpt-4o')

# Chemins
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, os.environ.get('DATA_DIR', 'data'))
PUBLICATIONS_DIR = os.path.join(DATA_DIR, 'publications')
SHARED_DIR = os.path.join(DATA_DIR, 'shared')
BOOKS_DIR = os.path.join(DATA_DIR, 'books')  # livres publiés depuis ZNK-LIVREmoi, lus par ZNKLibrairie.html
ARTFLOW_DIR = os.path.join(DATA_DIR, 'artflow-posts')  # publications ArtFlow visibles par tous
PROFILES_DIR = os.path.join(DATA_DIR, 'profiles')  # profils utilisateurs publiés (user-profile.html)
EXPOS_DIR = os.path.join(DATA_DIR, 'expos')  # expositions publiées (expo-manager.html, lues par ZNKExpos.html)
CARNETS_DIR = os.path.join(DATA_DIR, 'carnets')  # carnets de croquis publiés (elevesArt.html, seuil 10 pages)
RADIO_DIR = os.path.join(DATA_DIR, 'radio-emissions')  # catalogue radio officiel ZNK (radiobyznk), publié depuis le dash admin

# Créer les dossiers si nécessaire
for directory in [DATA_DIR, PUBLICATIONS_DIR, SHARED_DIR, BOOKS_DIR, ARTFLOW_DIR, PROFILES_DIR, EXPOS_DIR, CARNETS_DIR, RADIO_DIR]:
    os.makedirs(directory, exist_ok=True)

# ============================================================================
# STOCKAGE OBJET — Cloudflare R2 (compatible S3, egress gratuit)
# ============================================================================
# Optionnel : si les 5 variables ci-dessous sont définies, les fichiers vidéo
# ArtFlow partent directement sur R2 (URL publique renvoyée telle quelle) au
# lieu du disque local du VPS — le VPS ne voit alors plus jamais passer les
# octets vidéo, ce qui laisse les 8 To de bande passante KVM 2 intacts.
# Sinon (une seule variable manquante suffit), comportement inchangé :
# SHARED_DIR local + /files/<filename>, comme avant R2.
#   export R2_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
#   export R2_ACCESS_KEY_ID=xxxx
#   export R2_SECRET_ACCESS_KEY=xxxx
#   export R2_BUCKET_NAME=znk-artflow
#   export R2_PUBLIC_URL=https://cdn.tondomaine.com   (domaine personnalisé
#       attaché au bucket, ou la "Public Development URL" fournie par
#       Cloudflare — sans slash final. Se configure dans le dashboard R2,
#       rien à faire ici.)
R2_ACCOUNT_ID = os.environ.get('R2_ACCOUNT_ID', '')
R2_ACCESS_KEY_ID = os.environ.get('R2_ACCESS_KEY_ID', '')
R2_SECRET_ACCESS_KEY = os.environ.get('R2_SECRET_ACCESS_KEY', '')
R2_BUCKET_NAME = os.environ.get('R2_BUCKET_NAME', '')
R2_PUBLIC_URL = os.environ.get('R2_PUBLIC_URL', '').rstrip('/')
R2_ENABLED = bool(R2_ACCOUNT_ID and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME and R2_PUBLIC_URL)

_r2_client = None
def get_r2_client():
    """Client S3 (boto3) pointé vers l'endpoint R2 du compte. Lazy-init :
    boto3 n'est importé que si R2 est réellement utilisé, pour ne pas casser
    le démarrage du serveur sur un déploiement qui ne s'en sert pas encore."""
    global _r2_client
    if _r2_client is None:
        import boto3
        from botocore.config import Config
        _r2_client = boto3.client(
            's3',
            endpoint_url=f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com',
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            region_name='auto',
            config=Config(signature_version='s3v4')
        )
    return _r2_client

def upload_object_to_r2(fileobj, key, content_type=None):
    """Envoie fileobj (file-like, ex: request.files['file'].stream) vers R2
    sous 'key' et renvoie l'URL publique complète. Suppose un bucket rendu
    public (Public Development URL activée, ou domaine personnalisé attaché
    — se règle dans le dashboard Cloudflare, pas dans ce code)."""
    client = get_r2_client()
    extra = {'ContentType': content_type} if content_type else {}
    client.upload_fileobj(fileobj, R2_BUCKET_NAME, key, ExtraArgs=extra)
    return f"{R2_PUBLIC_URL}/{key}"

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
            'upload': '/api/upload',
            'ia_status': '/api/ia/status',
            'ia_chat': '/api/ia/chat'
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
# ROUTES - IA (ZNKOMia <-> Ollama)
# ============================================================================
# Le dashboard (ZNKOMia.html) n'appelle jamais Ollama en direct : il passe par
# ici, ce qui garde l'authentification par clé API et laisse la porte ouverte
# pour changer le backend IA plus tard (autre modèle, autre machine) sans
# toucher au frontend.

import re
import platform

def obtenir_contexte_systeme():
    """Contexte auto injecté dans tous les prompts : OS, shell, dossier utilisateur.
    Évite que Llama suppose un mauvais OS ou un mauvais chemin par défaut."""
    os_nom = platform.system()  # 'Darwin', 'Linux', 'Windows'
    os_version = platform.mac_ver()[0] if os_nom == 'Darwin' else platform.release()
    home = os.path.expanduser('~')
    shell = os.environ.get('SHELL', '/bin/zsh')
    return f"Contexte système : OS={os_nom} {os_version}, shell={shell}, dossier utilisateur={home}."

CONTEXTE_SYSTEME = obtenir_contexte_systeme()

ZNKOMIA_SYSTEM_PROMPT = (
    "Tu es ZNKOMia, l'assistant IA de l'écosystème ZNK. "
    "Réponds en français, de façon claire et concise. "
    "Tu tournes en local sur la machine de l'utilisateur, aucune donnée n'est envoyée en ligne."
)

# Mode terminal : activé quand le message commence par ce préfixe.
# Dans ce mode, Ollama est forcé en sortie JSON structurée (format='json'),
# ce qui garantit une commande exploitable plutôt qu'une réponse en prose.
TDV_TERMINAL_TRIGGER = "tdv-terminal:"

# Mode explication : l'utilisateur colle une commande existante et veut
# comprendre ce qu'elle fait, sans qu'une nouvelle commande soit générée.
TDV_EXPLAIN_TRIGGER = "tdv-explique:"

ZNKOMIA_TERMINAL_PROMPT = (
    "Tu es ZNKOMia en mode TERMINAL, sur un Mac (zsh/bash). L'utilisateur veut une "
    "commande shell PRÊTE À COLLER, pas une discussion et pas un exemple générique.\n\n"
    "RÈGLE LA PLUS IMPORTANTE : reprends TOUJOURS les mots-clés exacts de la demande "
    "de l'utilisateur (nom de fichier, nom de dossier, extension, motif) dans la "
    "commande. N'invente jamais une commande générique sans rapport direct avec ce "
    "qui est demandé — si l'utilisateur cherche 'icon', la commande doit contenir "
    "'icon' (avec des jokers *icon* pour élargir la recherche), pas juste lister "
    "un dossier au hasard.\n\n"
    "Réponds UNIQUEMENT avec un JSON, rien d'autre, pas de texte avant/après :\n"
    '{"intention": "...", "commande": "...", "explication": "...", "danger": false}\n\n'
    "- 'commande' : la commande shell exacte, ou null si la demande est trop ambiguë "
    "pour être traduite sans risque d'erreur (dans ce cas, 'explication' doit dire "
    "ce qu'il manque pour préciser).\n"
    "- 'danger': true si la commande peut être destructive (rm, dd, kill, mkfs...).\n"
    "- Si plusieurs étapes sont nécessaires (ex: build), enchaîne-les dans 'commande' "
    "avec ' && ', dans l'ordre d'exécution.\n\n"
    "Exemples :\n\n"
    'Demande: "trouve dossier icon"\n'
    '{"intention": "chercher un dossier nommé icon", "commande": '
    '"find ~ -iname \'*icon*\' -type d 2>/dev/null", '
    '"explication": "Cherche récursivement depuis ton dossier utilisateur tout dossier dont le nom contient icon.", '
    '"danger": false}\n\n'
    'Demande: "supprime les fichiers .log de mon projet"\n'
    '{"intention": "supprimer les fichiers .log", "commande": '
    '"find . -name \'*.log\' -delete", '
    '"explication": "Supprime tous les fichiers .log dans le dossier courant et ses sous-dossiers.", '
    '"danger": true}\n\n'
    'Demande: "fais un truc avec mes fichiers"\n'
    '{"intention": "demande trop vague", "commande": null, '
    '"explication": "Précise ce que tu veux faire : lister, chercher, déplacer, supprimer ? Et quel dossier ou fichier ?", '
    '"danger": false}'
)

ZNKOMIA_EXPLAIN_PROMPT = (
    "Tu es ZNKOMia en mode EXPLICATION. L'utilisateur va te donner une commande "
    "shell (bash/zsh, macOS) et tu dois l'expliquer clairement, en français, "
    "SANS générer de nouvelle commande.\n\n"
    "Structure ta réponse ainsi :\n"
    "1. Une phrase résumant ce que fait la commande globalement.\n"
    "2. Un décorticage partie par partie : chaque commande, option/flag et argument "
    "expliqué séparément, sous forme de liste à puces.\n"
    "3. Si la commande est potentiellement destructive, irréversible, ou peut affecter "
    "le système (rm, dd, chmod -R, sudo, kill, mkfs...), préviens-le en premier, en gras, "
    "avant le reste de l'explication.\n\n"
    "Réponds en texte normal (pas de JSON), en français, sans reformuler la commande "
    "en une nouvelle version — explique celle donnée telle quelle."
)

# Liste noire : motifs de commandes bloqués quoi qu'il arrive, même si Llama
# les génère ou si l'utilisateur les demande explicitement. C'est un filet de
# sécurité indépendant du jugement du modèle (qui peut se tromper ou halluciner).
COMMANDE_BLACKLIST = [
    r'rm\s+-[a-z]*r[a-z]*f?\s+/\s*(?:$|&&|;)',   # rm -rf / (racine)
    r'rm\s+-[a-z]*r[a-z]*f?\s+~\s*(?:$|&&|;)',   # rm -rf ~ (home entier)
    r'rm\s+-[a-z]*r[a-z]*f?\s+\*\s*(?:$|&&|;)',  # rm -rf * sans ciblage
    r':\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:', # fork bomb classique
    r'dd\s+.*of=/dev/(disk|rdisk|sda|nvme)',     # écrasement disque brut
    r'mkfs(\.\w+)?\s+/dev/',                     # formatage disque
    r'>\s*/dev/(disk|rdisk|sda|nvme)',           # redirection vers disque brut
    r'chmod\s+-R\s+777\s+/\s*(?:$|&&|;)',        # permissions système grand ouvert
    r'diskutil\s+eraseDisk',                     # effacement disque macOS
]

def commande_est_bloquee(commande):
    """True si la commande correspond à un motif jugé trop dangereux pour être
    proposée automatiquement, quelle que soit la demande d'origine."""
    if not commande:
        return False
    for motif in COMMANDE_BLACKLIST:
        if re.search(motif, commande, re.IGNORECASE):
            return True
    return False

@app.route('/api/ia/status', methods=['GET'])
@require_api_key
def ia_status():
    """Vérifie si Ollama répond et liste les modèles déjà téléchargés"""
    try:
        resp = requests.get(f'{OLLAMA_URL}/api/tags', timeout=3)
        resp.raise_for_status()
        modeles = [m.get('name') for m in resp.json().get('models', [])]
        return jsonify({'status': 'success', 'ollama_actif': True, 'modeles': modeles})
    except requests.exceptions.RequestException:
        return jsonify({'status': 'success', 'ollama_actif': False, 'modeles': []})

@app.route('/api/ia/chat', methods=['POST'])
@require_api_key
def ia_chat():
    """
    Point d'entrée unique pour ZNKOMia : reçoit un message utilisateur,
    interroge Ollama en interne (localhost) et renvoie la réponse.

    Trois modes selon le préfixe du message :
    - (aucun préfixe) : discussion normale
    - 'tdv-terminal:'  : génère une commande shell (JSON forcé + liste noire)
    - 'tdv-explique:'  : explique une commande shell fournie, sans en générer
    """
    data = request.get_json() or {}
    message = (data.get('message') or '').strip()
    conversation_id = data.get('conversation_id')
    historique = data.get('historique') or []  # [{role: 'user'|'assistant', content: '...'}]

    if not message:
        return jsonify({'status': 'error', 'message': 'message manquant'}), 400

    mode = 'chat'
    contenu_message = message
    if message.lower().startswith(TDV_TERMINAL_TRIGGER):
        mode = 'terminal'
        contenu_message = message[len(TDV_TERMINAL_TRIGGER):].strip()
    elif message.lower().startswith(TDV_EXPLAIN_TRIGGER):
        mode = 'explain'
        contenu_message = message[len(TDV_EXPLAIN_TRIGGER):].strip()

    if mode == 'terminal':
        # Contexte système (OS, shell, home) utile uniquement ici : Llama en a
        # besoin pour générer une commande correcte pour cette machine.
        system_prompt = f"{CONTEXTE_SYSTEME}\n\n{ZNKOMIA_TERMINAL_PROMPT}"
    elif mode == 'explain':
        system_prompt = f"{CONTEXTE_SYSTEME}\n\n{ZNKOMIA_EXPLAIN_PROMPT}"
    else:
        # Chat classique : prompt court, pas de contexte système inutile,
        # pour garder ce mode aussi rapide qu'avant sur du matériel limité.
        system_prompt = ZNKOMIA_SYSTEM_PROMPT

    messages = [{'role': 'system', 'content': system_prompt}]
    messages.extend(historique)
    messages.append({'role': 'user', 'content': contenu_message})

    try:
        payload = {
            'model': OLLAMA_MODEL,
            'messages': messages,
            'stream': False,
            'keep_alive': '30m',
            # num_ctx par défaut du modèle (souvent 32768) fait exploser la RAM
            # sur du matériel limité (7.8 Go rien que pour le contexte, vu via
            # `ollama ps`) -> swap disque -> lenteur énorme. On le plafonne
            # systématiquement, pas seulement en mode terminal.
            'options': {'num_ctx': 2048}
        }
        if mode == 'terminal':
            payload['format'] = 'json'
            # Température basse = réponses plus littérales, moins "créatives" :
            # utile pour un petit modèle local qui doit coller à la demande
            # exacte plutôt qu'inventer une commande plausible mais hors-sujet.
            payload['options']['temperature'] = 0.2
            payload['options']['num_ctx'] = 1024

        resp = requests.post(f'{OLLAMA_URL}/api/chat', json=payload, timeout=280)
        resp.raise_for_status()
        result = resp.json()
        reponse_texte = result.get('message', {}).get('content', '')

        # En mode terminal, on reformate le JSON structuré en bloc ```bash
        # exploitable tel quel par formatMessage() côté frontend (aucune
        # modif du HTML nécessaire). On garde aussi 'commande'/'intention' en
        # champs séparés dans la réponse, pour que le frontend alimente
        # l'historique sans avoir à reparser le texte formaté.
        commande_extraite = None
        intention_extraite = None
        if mode == 'terminal':
            try:
                cmd_json = json.loads(reponse_texte)
                commande = cmd_json.get('commande')
                if commande and commande_est_bloquee(commande):
                    reponse_texte = (
                        "🚫 **Commande bloquée par la liste noire**\n\n"
                        "Cette commande correspond à un motif jugé trop dangereux pour "
                        "être proposée automatiquement (suppression massive, formatage "
                        "disque, fork bomb...). Si tu es sûr de ce que tu fais, écris-la "
                        "toi-même directement dans terminal ZNK."
                    )
                elif commande:
                    intention_extraite = cmd_json.get('intention', '')
                    commande_extraite = commande
                    prefixe = "⚠️ **Commande sensible**\n\n" if cmd_json.get('danger') else ""
                    reponse_texte = (
                        f"{prefixe}**{cmd_json.get('intention', '')}**\n\n"
                        f"```bash\n{commande}\n```\n\n"
                        f"{cmd_json.get('explication', '')}"
                    )
                else:
                    reponse_texte = cmd_json.get('explication') or "Je n'ai pas compris la demande de commande, précise ta demande."
            except json.JSONDecodeError:
                pass  # réponse brute renvoyée telle quelle si le JSON est mal formé

        return jsonify({
            'status': 'success',
            'response': reponse_texte,
            'model': OLLAMA_MODEL,
            'mode': mode,
            'commande': commande_extraite,
            'intention': intention_extraite,
            'conversation_id': conversation_id or f"conv_{int(time.time())}",
            'timestamp': datetime.now().isoformat()
        })
    except requests.exceptions.ConnectionError:
        return jsonify({
            'status': 'error',
            'message': "Ollama injoignable sur localhost:11434 — démarre-le depuis terminal-ZNK (Canal Serveur, bouton 🦙 Ollama serve)."
        }), 503
    except requests.exceptions.Timeout:
        return jsonify({'status': 'error', 'message': 'Ollama a mis trop de temps à répondre (timeout)'}), 504
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# ============================================================================
# ROUTES - LIVREmoi (transcription d'écriture manuscrite)
# ============================================================================

TRANSCRIPTION_PROMPT = "Transcris fidèlement, en français, le texte manuscrit visible sur cette image. Réponds uniquement avec le texte transcrit, sans commentaire ni ajout."

def _ocr_via_anthropic(media_type, base64_data):
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY non configurée sur ce serveur")
    resp = requests.post(
        ANTHROPIC_API_URL,
        headers={
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
        },
        json={
            'model': ANTHROPIC_MODEL,
            'max_tokens': 1000,
            'messages': [{
                'role': 'user',
                'content': [
                    {'type': 'image', 'source': {'type': 'base64', 'media_type': media_type, 'data': base64_data}},
                    {'type': 'text', 'text': TRANSCRIPTION_PROMPT}
                ]
            }]
        },
        timeout=60
    )
    resp.raise_for_status()
    result = resp.json()
    return next((b.get('text', '') for b in result.get('content', []) if b.get('type') == 'text'), '')

def _ocr_via_openai(media_type, base64_data):
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY non configurée sur ce serveur")
    resp = requests.post(
        OPENAI_API_URL,
        headers={
            'Authorization': f'Bearer {OPENAI_API_KEY}',
            'Content-Type': 'application/json'
        },
        json={
            'model': OPENAI_MODEL,
            'max_tokens': 1000,
            'messages': [{
                'role': 'user',
                'content': [
                    {'type': 'text', 'text': TRANSCRIPTION_PROMPT},
                    {'type': 'image_url', 'image_url': {'url': f'data:{media_type};base64,{base64_data}'}}
                ]
            }]
        },
        timeout=60
    )
    resp.raise_for_status()
    result = resp.json()
    return result.get('choices', [{}])[0].get('message', {}).get('content', '')

def _ocr_via_ollama(media_type, base64_data):
    """
    100% local, sans connexion : passe par le même Ollama que ZNKOMia, avec
    un modèle vision (moondream/llava). À la différence des fournisseurs
    cloud, la qualité dépend beaucoup du modèle installé et de l'écriture —
    à tester avec de vraies pages avant de s'y fier pleinement.
    """
    try:
        resp = requests.post(
            f'{OLLAMA_URL}/api/chat',
            json={
                'model': OLLAMA_VISION_MODEL,
                'messages': [{
                    'role': 'user',
                    'content': TRANSCRIPTION_PROMPT,
                    'images': [base64_data]
                }],
                'stream': False
            },
            timeout=120
        )
        resp.raise_for_status()
    except requests.exceptions.ConnectionError:
        raise RuntimeError("Ollama injoignable sur localhost:11434 — démarre-le depuis terminal-ZNK (Canal Serveur, bouton 🦙 Ollama serve).")
    result = resp.json()
    return result.get('message', {}).get('content', '')

OCR_PROVIDERS = {
    'anthropic': _ocr_via_anthropic,
    'openai': _ocr_via_openai,
    'ollama': _ocr_via_ollama
}

@app.route('/api/ocr-handwriting', methods=['POST'])
@require_api_key
def ocr_handwriting():
    """
    Reçoit une photo (data URL base64) d'une page manuscrite et renvoie sa
    transcription, via l'IA vision choisie (OCR_PROVIDER : anthropic ou
    openai), appelée ici côté serveur — la clé de l'API ne doit jamais être
    exposée côté client. Chaque utilisateur de l'app ZNK peut choisir son
    fournisseur préféré en réglant OCR_PROVIDER sur son propre poste.
    """
    ocr_fn = OCR_PROVIDERS.get(OCR_PROVIDER)
    if not ocr_fn:
        return jsonify({
            'status': 'error',
            'message': f"OCR_PROVIDER inconnu : '{OCR_PROVIDER}' (valeurs possibles : {', '.join(OCR_PROVIDERS)})"
        }), 503

    data = request.get_json() or {}
    image_data_url = data.get('image', '')
    match = re.match(r'^data:([^;]+);base64,(.*)$', image_data_url)
    if not match:
        return jsonify({'status': 'error', 'message': 'image invalide (data URL attendue)'}), 400
    media_type, base64_data = match.group(1), match.group(2)

    try:
        texte = ocr_fn(media_type, base64_data)
        return jsonify({'status': 'success', 'provider': OCR_PROVIDER, 'text': (texte or '').strip()})
    except RuntimeError as e:
        return jsonify({'status': 'error', 'message': str(e)}), 503
    except requests.exceptions.Timeout:
        return jsonify({'status': 'error', 'message': f"L'API {OCR_PROVIDER} a mis trop de temps à répondre (timeout)"}), 504
    except requests.exceptions.RequestException as e:
        return jsonify({'status': 'error', 'message': f"API {OCR_PROVIDER} injoignable : {e}"}), 502
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

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
# ROUTES - RADIO (catalogue officiel ZNK, publié depuis le dash admin,
# lu par tous les clients ZNK au lancement pour compléter le seed embarqué
# au build sans nécessiter de nouvelle release à chaque ajout d'émission)
# ============================================================================

@app.route('/api/radio-emissions', methods=['GET'])
def get_radio_emissions():
    """Liste allégée des émissions (sans les pistes/audio complet) — pour
    savoir rapidement ce qui a changé avant d'aller chercher le détail."""
    try:
        emissions = []
        for filename in os.listdir(RADIO_DIR):
            if not filename.endswith('.json'):
                continue
            filepath = os.path.join(RADIO_DIR, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    e = json.load(f)
                emissions.append({
                    'id': e.get('id'),
                    'name': e.get('name'),
                    'description': e.get('description'),
                    'coverImage': e.get('coverImage'),
                    'trackCount': len(e.get('tracks') or []),
                    'publishedAt': e.get('publishedAt')
                })
            except Exception:
                pass

        emissions.sort(key=lambda x: x.get('publishedAt') or '', reverse=True)

        return jsonify({'status': 'success', 'emissions': emissions})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/radio-emissions/<emission_id>', methods=['GET'])
def get_radio_emission(emission_id):
    """Émission complète (pistes + audio en base64) — pour le téléchargement
    et la mise en cache locale (userData/persistent-audio) côté client."""
    try:
        filepath = os.path.join(RADIO_DIR, f"{emission_id}.json")
        if not os.path.exists(filepath):
            return jsonify({'status': 'error', 'message': 'Émission non trouvée'}), 404
        with open(filepath, 'r', encoding='utf-8') as f:
            emission = json.load(f)
        return jsonify({'status': 'success', 'emission': emission})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/radio-emissions/<emission_id>', methods=['POST'])
@require_api_key
def publish_radio_emission(emission_id):
    """Publie (ou republie) une émission du catalogue officiel — écrase le
    fichier existant si l'id est déjà connu. Protégé par clé API : contrairement
    aux livres/ArtFlow (contenu par utilisateur), le catalogue radio officiel
    est unique et ne doit être modifiable que depuis le dash admin."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'message': 'Données manquantes'}), 400

        published_at = datetime.now().isoformat()
        emission = {**data, 'id': emission_id, 'publishedAt': published_at}

        filepath = os.path.join(RADIO_DIR, f"{emission_id}.json")
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(emission, f, indent=2, ensure_ascii=False)

        return jsonify({'status': 'success', 'publishedAt': published_at, 'emission': emission}), 200
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# ----------------------------------------------------------------------------
# PROXY VERS LE VPS — utilisé par le server.py LOCAL de chaque device (celui
# que main.js lance sur 127.0.0.1:5001). Le VPS lui-même n'a pas besoin de ces
# routes (ZNK_REGISTRY_URL n'y est pas défini) ; elles ne servent que côté
# client, pour que main.js n'ait jamais à connaître ni stocker ZNK_API_KEY —
# seul ce server.py local le connaît déjà (mêmes identifiants que le P2P,
# voir demarrer_noeud_p2p plus haut).
# ----------------------------------------------------------------------------

def _vps_config_ou_erreur():
    registry_url = os.environ.get('ZNK_REGISTRY_URL')
    api_key = os.environ.get('ZNK_API_KEY')
    if not registry_url:
        return None, None, (jsonify({'status': 'error', 'message': 'ZNK_REGISTRY_URL non configuré sur ce device'}), 503)
    return registry_url.rstrip('/'), api_key, None

@app.route('/api/radio-emissions/sync-pull', methods=['GET'])
def sync_pull_radio_emissions():
    """Va chercher le catalogue complet (liste + détail de chaque émission)
    sur le VPS en un seul aller-retour côté client, pour limiter le nombre
    d'appels réseau que main.js doit faire."""
    registry_url, _api_key, error = _vps_config_ou_erreur()
    if error:
        return error
    try:
        r = requests.get(f"{registry_url}/api/radio-emissions", timeout=10)
        r.raise_for_status()
        liste = r.json().get('emissions', [])

        emissions = []
        for meta in liste:
            eid = meta.get('id')
            if not eid:
                continue
            rd = requests.get(f"{registry_url}/api/radio-emissions/{eid}", timeout=15)
            if rd.ok:
                emissions.append(rd.json().get('emission'))

        return jsonify({'status': 'success', 'emissions': emissions})
    except requests.exceptions.RequestException as e:
        # VPS injoignable (hors-ligne, etc.) : on ne casse rien, l'app
        # continue avec ce qui est déjà en cache local.
        return jsonify({'status': 'error', 'offline': True, 'message': str(e)}), 502

@app.route('/api/radio-emissions/<emission_id>/sync-push', methods=['POST'])
def sync_push_radio_emission(emission_id):
    """Republie une émission vers le VPS, en ajoutant la clé API de CE device
    (jamais transmise par le client Electron)."""
    registry_url, api_key, error = _vps_config_ou_erreur()
    if error:
        return error
    if not api_key:
        return jsonify({'status': 'error', 'message': 'ZNK_API_KEY non configuré sur ce device'}), 503
    try:
        data = request.get_json()
        r = requests.post(
            f"{registry_url}/api/radio-emissions/{emission_id}",
            json=data,
            headers={'X-ZNK-Key': api_key},
            timeout=30
        )
        return jsonify(r.json()), r.status_code
    except requests.exceptions.RequestException as e:
        return jsonify({'status': 'error', 'offline': True, 'message': str(e)}), 502

# ----------------------------------------------------------------------------
# ÉMISSION PERSO (user-publish-radio.html) — chaque compte user publie SA
# seule émission (id = user_<idZNK>), scellée à l'idZNK authentifié via
# X-ZNK-Key (voir /api/auth/provision), pas besoin de la clé admin.
#
# Contrairement au catalogue officiel plus haut (protégé, écrit uniquement
# depuis le dash admin), ces routes ci-dessous sont ouvertes à tout compte
# provisionné — même logique que /api/artflow-posts, /api/profiles, etc.
#
# Deux jeux de routes, comme pour le catalogue officiel :
#   - routes "VPS" (protégées @require_api_key) : à appeler directement quand
#     ce process EST le VPS (ZNK_REGISTRY_URL non défini dessus)
#   - routes ".../sync-*" (non protégées, en local uniquement) : le renderer
#     les appelle sans connaître aucune clé ; c'est CE server.py local qui
#     attache la clé du device (ZNK_API_KEY) avant de relayer vers le VPS —
#     même principe que sync_push_radio_emission plus haut.
# ----------------------------------------------------------------------------

@app.route('/api/radio-emissions/mine', methods=['GET'])
@require_api_key
def get_my_radio_emission():
    """VPS uniquement : émission perso de l'idZNK authentifié, si publiée."""
    emission_id = f"user_{request.id_znk_authentifie}"
    filepath = os.path.join(RADIO_DIR, f"{emission_id}.json")
    if not os.path.exists(filepath):
        return jsonify({'status': 'error', 'message': 'Aucune émission publiée'}), 404
    with open(filepath, 'r', encoding='utf-8') as f:
        emission = json.load(f)
    return jsonify({'status': 'success', 'emission': emission})

@app.route('/api/radio-emissions/mine', methods=['POST'])
@require_api_key
def publish_my_radio_emission():
    """VPS uniquement : publie/republie l'émission perso de l'idZNK authentifié."""
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'message': 'Données manquantes'}), 400

    id_znk = request.id_znk_authentifie
    emission_id = f"user_{id_znk}"
    published_at = datetime.now().isoformat()
    emission = {
        **data,
        'id': emission_id,
        'userId': id_znk,
        'isOfficial': False,
        'publishedAt': published_at
    }
    filepath = os.path.join(RADIO_DIR, f"{emission_id}.json")
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(emission, f, indent=2, ensure_ascii=False)
    return jsonify({'status': 'success', 'publishedAt': published_at, 'emission': emission}), 200

@app.route('/api/radio-emissions/mine/upload-track', methods=['POST'])
@require_api_key
def upload_my_radio_track():
    """VPS uniquement : upload d'une piste audio pour l'émission perso.
    Sauvée dans SHARED_DIR (même mécanisme que /api/upload générique),
    préfixée par l'idZNK pour éviter toute collision entre users, et
    servie ensuite via /files/<filename> (route déjà existante)."""
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'Aucun fichier fourni'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'status': 'error', 'message': 'Nom de fichier vide'}), 400

    id_znk = request.id_znk_authentifie
    filename = f"radio_{id_znk}_{int(time.time() * 1000)}_{file.filename}"
    filepath = os.path.join(SHARED_DIR, filename)
    file.save(filepath)

    return jsonify({
        'status': 'success',
        'url': f"/files/{filename}",
        'filename': filename,
        'size': os.path.getsize(filepath)
    }), 201

@app.route('/api/radio-emissions/mine/sync-pull', methods=['GET'])
def sync_pull_my_radio_emission():
    """Local uniquement : le renderer appelle CETTE route (pas d'auth requise
    ici — machine de confiance) ; c'est ce process qui attache ZNK_API_KEY
    avant d'interroger le VPS."""
    registry_url, api_key, error = _vps_config_ou_erreur()
    if error:
        return error
    if not api_key:
        return jsonify({'status': 'error', 'message': 'ZNK_API_KEY non configuré sur ce device'}), 503
    try:
        r = requests.get(
            f"{registry_url}/api/radio-emissions/mine",
            headers={'X-ZNK-Key': api_key},
            timeout=15
        )
        return jsonify(r.json()), r.status_code
    except requests.exceptions.RequestException as e:
        return jsonify({'status': 'error', 'offline': True, 'message': str(e)}), 502

@app.route('/api/radio-emissions/mine/sync-push', methods=['POST'])
def sync_push_my_radio_emission():
    """Local uniquement : publie l'émission perso vers le VPS avec la clé de
    CE device — le renderer n'a jamais besoin de connaître ZNK_API_KEY."""
    registry_url, api_key, error = _vps_config_ou_erreur()
    if error:
        return error
    if not api_key:
        return jsonify({'status': 'error', 'message': 'ZNK_API_KEY non configuré sur ce device'}), 503
    try:
        data = request.get_json()
        r = requests.post(
            f"{registry_url}/api/radio-emissions/mine",
            json=data,
            headers={'X-ZNK-Key': api_key},
            timeout=30
        )
        return jsonify(r.json()), r.status_code
    except requests.exceptions.RequestException as e:
        return jsonify({'status': 'error', 'offline': True, 'message': str(e)}), 502

@app.route('/api/radio-emissions/mine/track/sync-push', methods=['POST'])
def sync_push_my_radio_track():
    """Local uniquement : relaie l'upload d'une piste audio vers le VPS avec
    la clé de CE device. Le fichier reçu du renderer est retransmis tel quel."""
    registry_url, api_key, error = _vps_config_ou_erreur()
    if error:
        return error
    if not api_key:
        return jsonify({'status': 'error', 'message': 'ZNK_API_KEY non configuré sur ce device'}), 503
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'Aucun fichier fourni'}), 400
    f = request.files['file']
    try:
        r = requests.post(
            f"{registry_url}/api/radio-emissions/mine/upload-track",
            files={'file': (f.filename, f.stream, f.mimetype)},
            headers={'X-ZNK-Key': api_key},
            timeout=60
        )
        return jsonify(r.json()), r.status_code
    except requests.exceptions.RequestException as e:
        return jsonify({'status': 'error', 'offline': True, 'message': str(e)}), 502

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
@require_api_key
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

@app.route('/api/artflow-posts/<post_id>/upload-video', methods=['POST'])
@require_api_key
def upload_artflow_video(post_id):
    """VPS uniquement : upload du fichier vidéo (converti en WebM côté
    client) associé à une publication ArtFlow. Part sur Cloudflare R2 si
    R2_ENABLED (voir plus haut) — le VPS ne stocke ni ne sert alors plus les
    octets vidéo, seul R2 encaisse la bande passante (egress gratuit).
    Sinon, repli sur SHARED_DIR local + /files/<filename>, comme avant."""
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'Aucun fichier fourni'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'status': 'error', 'message': 'Nom de fichier vide'}), 400

    id_znk = request.id_znk_authentifie
    filename = f"artflow_{id_znk}_{post_id}_{int(time.time() * 1000)}_{file.filename}"

    if R2_ENABLED:
        try:
            url = upload_object_to_r2(file.stream, f"artflow/{filename}", content_type=file.mimetype)
            return jsonify({
                'status': 'success',
                'url': url,
                'filename': filename,
                'storage': 'r2'
            }), 201
        except Exception as e:
            return jsonify({'status': 'error', 'message': f'Upload R2 échoué: {e}'}), 502

    filepath = os.path.join(SHARED_DIR, filename)
    file.save(filepath)
    return jsonify({
        'status': 'success',
        'url': f"/files/{filename}",
        'filename': filename,
        'size': os.path.getsize(filepath),
        'storage': 'local'
    }), 201

# ----------------------------------------------------------------------------
# Local uniquement (même principe que /api/radio-emissions/mine/* plus haut) :
# ce server.py tourne aussi localement sur chaque device (127.0.0.1, lancé par
# main.js). Ces deux routes relaient vers le VPS avec ZNK_API_KEY — main.js
# n'a jamais besoin de connaître ni stocker cette clé.
# ----------------------------------------------------------------------------

@app.route('/api/artflow-posts/mine/sync-push', methods=['POST'])
def sync_push_my_artflow_post():
    """Local uniquement : publie les métadonnées (JSON, sans le fichier) vers
    le VPS avec la clé de CE device. Attendu : un champ 'id' dans le JSON."""
    registry_url, api_key, error = _vps_config_ou_erreur()
    if error:
        return error
    if not api_key:
        return jsonify({'status': 'error', 'message': 'ZNK_API_KEY non configuré sur ce device'}), 503
    try:
        data = request.get_json()
        post_id = data.get('id') if data else None
        if not post_id:
            return jsonify({'status': 'error', 'message': "Champ 'id' manquant"}), 400
        r = requests.post(
            f"{registry_url}/api/artflow-posts/{post_id}",
            json=data,
            headers={'X-ZNK-Key': api_key},
            timeout=30
        )
        return jsonify(r.json()), r.status_code
    except requests.exceptions.RequestException as e:
        return jsonify({'status': 'error', 'offline': True, 'message': str(e)}), 502

@app.route('/api/artflow-posts/mine/video/sync-push', methods=['POST'])
def sync_push_my_artflow_video():
    """Local uniquement : relaie l'upload du fichier vidéo (WebM) vers le VPS
    avec la clé de CE device. Attendu : le fichier dans 'file' + un champ de
    form 'post_id'. Le fichier reçu de main.js est retransmis tel quel."""
    registry_url, api_key, error = _vps_config_ou_erreur()
    if error:
        return error
    if not api_key:
        return jsonify({'status': 'error', 'message': 'ZNK_API_KEY non configuré sur ce device'}), 503
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'Aucun fichier fourni'}), 400
    post_id = request.form.get('post_id')
    if not post_id:
        return jsonify({'status': 'error', 'message': "Champ 'post_id' manquant"}), 400
    f = request.files['file']
    try:
        r = requests.post(
            f"{registry_url}/api/artflow-posts/{post_id}/upload-video",
            files={'file': (f.filename, f.stream, f.mimetype)},
            headers={'X-ZNK-Key': api_key},
            timeout=120  # vidéo plus lourde qu'une piste audio, timeout plus large
        )
        return jsonify(r.json()), r.status_code
    except requests.exceptions.RequestException as e:
        return jsonify({'status': 'error', 'offline': True, 'message': str(e)}), 502

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
# ROUTES - EXPOSITIONS (expo-manager.html, lues par ZNKExpos.html)
# ============================================================================
# Une exposition = un artiste = un compte, identifiée par son nom d'artiste
# brut (voir commentaire dans expo-manager.html : aucune normalisation, pour
# rester identique à la clé que recalcule ZNKExpos.html). On sécurise juste
# le nom de fichier pour éviter toute traversée de répertoire.

def _safe_expo_filename(expo_id):
    cleaned = re.sub(r'[\\/:*?"<>|]', '_', (expo_id or '').strip())
    cleaned = cleaned.replace('..', '_')
    return cleaned or 'exposition'

@app.route('/api/expos', methods=['GET'])
def list_expos():
    """Liste allégée de toutes les expositions publiées (tous users confondus) —
    utilisée par gallery-manager.html pour la curation, indépendamment de la
    machine sur laquelle chaque exposition a été publiée."""
    try:
        expos = []
        for filename in os.listdir(EXPOS_DIR):
            if not filename.endswith('.json'):
                continue
            try:
                with open(os.path.join(EXPOS_DIR, filename), 'r', encoding='utf-8') as f:
                    data = json.load(f)
                expos.append({
                    'id': data.get('id', filename[:-5]),
                    'title': data.get('title', ''),
                    'artist': data.get('artist', ''),
                    'artistId': data.get('artistId'),
                    'panelCount': len(data.get('panels', [])),
                    'publishedAt': data.get('publishedAt')
                })
            except Exception as e:
                print(f"⚠️ Expo illisible ({filename}): {e}")
        expos.sort(key=lambda e: e.get('publishedAt') or '', reverse=True)
        return jsonify({'status': 'success', 'expos': expos})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/expos/<expo_id>', methods=['GET'])
def get_expo(expo_id):
    """Exposition complète publiée par un artiste — consultée par ZNKExpos.html."""
    try:
        filepath = os.path.join(EXPOS_DIR, f"{_safe_expo_filename(expo_id)}.json")
        if not os.path.exists(filepath):
            return jsonify({'status': 'error', 'message': 'Exposition non trouvée'}), 404
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify({'status': 'success', 'data': data})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/expos/<expo_id>', methods=['POST'])
def publish_expo(expo_id):
    """Publie/republie l'exposition d'un artiste — écrase le fichier existant
    à chaque appel (toujours l'état le plus récent), sur le modèle de /api/profiles."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'message': 'Données manquantes'}), 400
        published_at = datetime.now().isoformat()
        expo = {**data, 'id': expo_id, 'publishedAt': published_at}
        filepath = os.path.join(EXPOS_DIR, f"{_safe_expo_filename(expo_id)}.json")
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(expo, f, indent=2, ensure_ascii=False)
        return jsonify({'status': 'success', 'publishedAt': published_at, 'data': expo}), 200
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# ============================================================================
# ROUTES - GALERIE COLLECTIVE (gallery-manager.html = curation Admin,
# gallery.html = vitrine publique)
# ============================================================================
# Contrairement aux expositions (une par artiste), la galerie est UN SEUL
# document global : le roster (ordre + sélection des expos mises en avant)
# et le manifest (artiste du mois, etc.), décidés uniquement par l'Admin.
# Avant cette route, gallery-manager.html exportait un fichier JSON à intégrer
# manuellement au build ; désormais la curation est immédiatement visible par
# tous via cette route, sans nouvelle release de l'app.

GALLERY_FILE = os.path.join(DATA_DIR, 'gallery.json')

@app.route('/api/gallery', methods=['GET'])
def get_gallery():
    """Curation actuelle de la galerie — lue par gallery.html (vitrine publique)."""
    try:
        if not os.path.exists(GALLERY_FILE):
            return jsonify({'status': 'success', 'data': {'roster': [], 'featuredArtist': {'name': '', 'photo': '', 'bio': ''}}})
        with open(GALLERY_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify({'status': 'success', 'data': data})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/gallery', methods=['POST'])
def publish_gallery():
    """Écrase la curation de la galerie — appelée uniquement par gallery-manager.html (Admin).
    ⚠️ Pas d'authentification ici, comme /api/profiles et /api/artflow-posts —
    cohérent avec le reste du code, mais ça veut dire que N'IMPORTE QUI connaissant
    l'URL du VPS peut réécrire la galerie. Ton codebase n'a pour l'instant aucune
    notion de "clé admin" distincte de @require_api_key (qui authentifie n'importe
    quel device provisionné, pas spécifiquement toi) : le catalogue radio officiel,
    par exemple, a le même point faible. À sécuriser un jour avec une vraie
    distinction admin/user si la galerie doit résister à un acteur malveillant."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'message': 'Données manquantes'}), 400
        published_at = datetime.now().isoformat()
        gallery = {**data, 'publishedAt': published_at}
        with open(GALLERY_FILE, 'w', encoding='utf-8') as f:
            json.dump(gallery, f, indent=2, ensure_ascii=False)
        return jsonify({'status': 'success', 'publishedAt': published_at, 'data': gallery}), 200
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

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