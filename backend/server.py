#!/usr/bin/env python3
"""
ZNK Backend API - Version Minimale
Port: 5000
"""

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import os
import sys
import json
import time
from datetime import datetime

# Configuration
app = Flask(__name__)
CORS(app)  # Permettre les requêtes cross-origin

# Chemins
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
PUBLICATIONS_DIR = os.path.join(DATA_DIR, 'publications')
SHARED_DIR = os.path.join(DATA_DIR, 'shared')

# Créer les dossiers si nécessaire
for directory in [DATA_DIR, PUBLICATIONS_DIR, SHARED_DIR]:
    os.makedirs(directory, exist_ok=True)

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
    print(f"📡 Server: http://localhost:5000")
    print(f"🔗 Health Check: http://localhost:5000/health")
    print(f"📊 Stats: http://localhost:5000/api/stats")
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
            port=5000,
            debug=False,  # Désactiver debug en production
            threaded=True
        )
    except KeyboardInterrupt:
        print("\n👋 Arrêt du serveur...")
    except Exception as e:
        print(f"\n❌ Erreur fatale: {e}")
        sys.exit(1)