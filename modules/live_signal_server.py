"""
live_signal_server.py — Mini serveur LOCAL pour ZNKlive Studio
--------------------------------------------------------------------------------
Deux rôles :
  1. Sert le fichier Live.html lui-même en HTTP sur le réseau local, pour que
     le smartphone puisse l'ouvrir (un iPhone ne peut pas ouvrir un fichier
     local file:// se trouvant sur l'ordinateur).
  2. Sert de signalisation : fait se rencontrer l'ordinateur (régie) et le
     smartphone (caméra) le temps d'établir la connexion WebRTC directe entre
     eux. Une fois connectés, la vidéo/audio ne repasse plus par ce serveur :
     il ne fait que transmettre de petits messages texte (offre/réponse SDP +
     candidats ICE).

Aucune dépendance externe, aucun accès internet requis (tout reste sur le
réseau WiFi local). À remplacer plus tard par le VPS en changeant simplement
l'adresse indiquée dans ZNKlive Studio — le protocole ne change pas.

Installation :
    pip install flask

Placement : mets ce fichier DANS LE MÊME DOSSIER que Live.html.

Lancement :
    python live_signal_server.py
    → écoute sur http://0.0.0.0:5051

Trouver l'adresse IP locale de cet ordinateur :
    Windows : ipconfig            → "Adresse IPv4"
    Mac     : ipconfig getifaddr en0
    Linux   : ip a                → inet 192.168.x.x

Sur l'ORDINATEUR (régie), ouvre ZNKlive Studio via :
    http://<IP-locale-de-cet-ordinateur>:5051/Live.html
(pas en double-cliquant le fichier — sinon le lien généré pour le téléphone
sera un file:// injoignable depuis l'iPhone)

Le téléphone et l'ordinateur doivent être sur le même réseau WiFi.
"""
import os
import time
from flask import Flask, request, jsonify, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__)

# Stockage en mémoire : { session_id: { channel: [ {ts, data}, ... ] } }
SESSIONS = {}
SESSION_TTL_SECONDS = 30 * 60  # purge une session inactive depuis 30 min


def _get_channel(session_id, channel):
    sess = SESSIONS.setdefault(session_id, {})
    return sess.setdefault(channel, [])


def _purge_old_sessions():
    now = time.time()
    for sid in list(SESSIONS.keys()):
        last_ts = 0
        for items in SESSIONS[sid].values():
            if items:
                last_ts = max(last_ts, items[-1]['ts'])
        if last_ts and (now - last_ts) > SESSION_TTL_SECONDS:
            del SESSIONS[sid]


@app.after_request
def add_cors_headers(resp):
    # Ouvert pour un usage strictement local (réseau WiFi de la maison/studio).
    # Si ce serveur devait un jour être exposé publiquement, restreindre cette
    # origine et ajouter une authentification (cf. require_api_key du reste
    # de l'écosystème ZNK).
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return resp


# ---------- Sert la page ZNKlive Studio elle-même ----------
@app.route('/', methods=['GET'])
@app.route('/Live.html', methods=['GET'])
def serve_live_page():
    return send_from_directory(BASE_DIR, 'Live.html')


# ---------- Signalisation WebRTC ----------
@app.route('/api/live/<session_id>/<channel>', methods=['OPTIONS'])
def options_handler(session_id, channel):
    return ('', 204)


@app.route('/api/live/<session_id>/<channel>', methods=['POST'])
def post_signal(session_id, channel):
    _purge_old_sessions()
    data = request.get_json(force=True, silent=True) or {}
    items = _get_channel(session_id, channel)
    items.append({'ts': time.time(), 'data': data})
    return jsonify({'ok': True})


@app.route('/api/live/<session_id>/<channel>', methods=['GET'])
def get_signal(session_id, channel):
    since = int(request.args.get('from', 0))
    items = _get_channel(session_id, channel)
    return jsonify({'items': [it['data'] for it in items[since:]]})


@app.route('/api/live/health', methods=['GET'])
def health():
    return jsonify({'ok': True, 'sessions': len(SESSIONS)})


if __name__ == '__main__':
    live_html_path = os.path.join(BASE_DIR, 'Live.html')
    if not os.path.exists(live_html_path):
        print("⚠️  Live.html introuvable dans ce dossier — place live_signal_server.py")
        print("    au même endroit que Live.html avant de relancer.")
    print("ZNKlive — serveur local démarré sur le port 5051")
    print("Sur l'ordinateur, ouvre : http://localhost:5051/Live.html")
    print("Sur le téléphone (via le QR code généré), la page s'ouvrira automatiquement au bon endroit.")
    app.run(host='0.0.0.0', port=5051)
