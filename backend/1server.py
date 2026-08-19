"""
Backend Flask Complet pour ZNK P2P System
Serveur unique qui gère tout : publications, compression, P2P
"""

from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from pathlib import Path
import json
import gzip
import hashlib
import base64
from datetime import datetime
import io
from PIL import Image
import mimetypes

# =============================================================================
# CONFIGURATION
# =============================================================================

app = Flask(__name__)
CORS(app)  # Permet les requêtes depuis le frontend

# Chemins
BASE_DIR = Path(__file__).parent
PUBLICATIONS_DIR = BASE_DIR / "data" / "publications"
SHARED_DIR = BASE_DIR / "data" / "shared"

# Créer les dossiers si nécessaire
PUBLICATIONS_DIR.mkdir(parents=True, exist_ok=True)
SHARED_DIR.mkdir(parents=True, exist_ok=True)

# =============================================================================
# CLASSES DE GESTION
# =============================================================================

class CompressionManager:
    """Gère la compression/décompression"""
    
    @staticmethod
    def compress_file(file_path: Path):
        """Compresse un fichier"""
        try:
            with open(file_path, 'rb') as f:
                original_data = f.read()
            
            compressed_data = gzip.compress(original_data, compresslevel=6)
            
            metadata = {
                'original_size': len(original_data),
                'compressed_size': len(compressed_data),
                'compression_ratio': round((1 - len(compressed_data) / len(original_data)) * 100, 2),
                'algorithm': 'gzip',
                'original_hash': hashlib.sha256(original_data).hexdigest()
            }
            
            print(f"✅ Compression: {metadata['original_size']} → {metadata['compressed_size']} bytes")
            
            return compressed_data, metadata
            
        except Exception as e:
            print(f"❌ Erreur compression: {e}")
            return None, None
    
    @staticmethod
    def decompress_file(compressed_data: bytes):
        """Décompresse des données"""
        try:
            return gzip.decompress(compressed_data)
        except Exception as e:
            print(f"❌ Erreur décompression: {e}")
            return None


class PreviewGenerator:
    """Génère des previews"""
    
    PREVIEW_SIZE = (400, 400)
    PREVIEW_QUALITY = 70
    
    @staticmethod
    def generate_preview(file_path: Path):
        """Génère un preview selon le type"""
        mime_type, _ = mimetypes.guess_type(str(file_path))
        
        if not mime_type:
            return PreviewGenerator._generate_text_preview(file_path)
        
        if mime_type.startswith('image/'):
            return PreviewGenerator._generate_image_preview(file_path, mime_type)
        
        elif mime_type.startswith('video/'):
            return PreviewGenerator._generate_video_preview(file_path)
        
        elif mime_type.startswith('audio/'):
            return PreviewGenerator._generate_audio_preview(file_path)
        
        elif mime_type in ['text/plain', 'application/json', 'text/markdown']:
            return PreviewGenerator._generate_text_preview(file_path)
        
        return PreviewGenerator._generate_metadata_preview(file_path)
    
    @staticmethod
    def _generate_image_preview(file_path: Path, mime_type: str):
        """Preview d'image (thumbnail)"""
        try:
            with Image.open(file_path) as img:
                img.thumbnail(PreviewGenerator.PREVIEW_SIZE, Image.Resampling.LANCZOS)
                
                buffer = io.BytesIO()
                img_format = 'JPEG' if img.mode == 'RGB' else 'PNG'
                img.save(buffer, format=img_format, quality=PreviewGenerator.PREVIEW_QUALITY)
                
                preview_data = base64.b64encode(buffer.getvalue()).decode('utf-8')
                
                return {
                    'type': 'image',
                    'data': preview_data,
                    'mime_type': f'image/{img_format.lower()}',
                    'dimensions': f"{img.size[0]}x{img.size[1]}"
                }
                
        except Exception as e:
            print(f"❌ Erreur preview image: {e}")
            return PreviewGenerator._generate_metadata_preview(file_path)
    
    @staticmethod
    def _generate_video_preview(file_path: Path):
        return {
            'type': 'video',
            'data': '🎥',
            'mime_type': 'text/plain',
            'info': 'Vidéo - Télécharger pour voir'
        }
    
    @staticmethod
    def _generate_audio_preview(file_path: Path):
        return {
            'type': 'audio',
            'data': '🎵',
            'mime_type': 'text/plain',
            'info': 'Fichier audio'
        }
    
    @staticmethod
    def _generate_text_preview(file_path: Path):
        """Preview de fichier texte"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read(500)
                
            return {
                'type': 'text',
                'data': content,
                'mime_type': 'text/plain',
                'truncated': len(content) == 500
            }
        except:
            return PreviewGenerator._generate_metadata_preview(file_path)
    
    @staticmethod
    def _generate_metadata_preview(file_path: Path):
        """Preview basique avec métadonnées"""
        stat = file_path.stat()
        return {
            'type': 'metadata',
            'data': {
                'name': file_path.name,
                'size': stat.st_size,
                'extension': file_path.suffix
            },
            'mime_type': 'application/json'
        }


class PublicationManager:
    """Gère les publications"""
    
    def __init__(self, storage_path: Path):
        self.storage_path = storage_path
        self.publications = {}
        self.load_existing_publications()
    
    def load_existing_publications(self):
        """Charge les publications existantes"""
        for meta_file in self.storage_path.glob("*.json"):
            try:
                with open(meta_file, 'r', encoding='utf-8') as f:
                    pub = json.load(f)
                    self.publications[pub['id']] = pub
                    print(f"📂 Publication chargée: {pub['filename']}")
            except Exception as e:
                print(f"⚠️ Erreur chargement {meta_file}: {e}")
    
    def create_publication(self, file_path: Path, user_id: str, metadata: dict = None):
        """Crée une nouvelle publication"""
        try:
            print(f"\n📝 Création publication pour: {file_path.name}")
            
            # 1. Preview
            preview = PreviewGenerator.generate_preview(file_path)
            print(f"   ✅ Preview: {preview['type']}")
            
            # 2. Compression
            compressed_data, compression_meta = CompressionManager.compress_file(file_path)
            if not compressed_data:
                return None
            
            # 3. Créer ID unique
            pub_id = self._generate_id()
            
            # 4. Structure publication
            publication = {
                'id': pub_id,
                'user_id': user_id,
                'filename': file_path.name,
                'timestamp': datetime.now().isoformat(),
                'preview': preview,
                'compression': compression_meta,
                'metadata': metadata or {},
                'downloads': 0,
                'views': 0
            }
            
            # 5. Sauvegarder fichier compressé
            compressed_path = self.storage_path / f"{pub_id}.znk"
            with open(compressed_path, 'wb') as f:
                f.write(compressed_data)
            
            publication['compressed_path'] = str(compressed_path)
            
            # 6. Sauvegarder métadonnées
            pub_meta = publication.copy()
            if pub_meta['preview']['type'] == 'image':
                pub_meta['preview']['data'] = '[IMAGE_DATA]'
            
            meta_path = self.storage_path / f"{pub_id}.json"
            with open(meta_path, 'w', encoding='utf-8') as f:
                json.dump(pub_meta, f, indent=2, ensure_ascii=False)
            
            self.publications[pub_id] = publication
            
            print(f"   ✅ Publication créée: {pub_id}")
            return publication
            
        except Exception as e:
            print(f"❌ Erreur création publication: {e}")
            return None
    
    def get_preview_only(self, pub_id: str):
        """Récupère uniquement le preview"""
        if pub_id in self.publications:
            pub = self.publications[pub_id]
            pub['views'] += 1
            
            return {
                'id': pub['id'],
                'user_id': pub['user_id'],
                'filename': pub['filename'],
                'timestamp': pub['timestamp'],
                'preview': pub['preview'],
                'size_info': {
                    'original': pub['compression']['original_size'],
                    'compressed': pub['compression']['compressed_size'],
                    'ratio': pub['compression']['compression_ratio']
                },
                'stats': {
                    'views': pub['views'],
                    'downloads': pub['downloads']
                }
            }
        return None
    
    def list_publications(self, user_id: str = None):
        """Liste toutes les publications (preview only)"""
        publications = []
        
        for pub_id, pub in self.publications.items():
            if user_id and pub['user_id'] != user_id:
                continue
            
            preview = self.get_preview_only(pub_id)
            if preview:
                publications.append(preview)
        
        return publications
    
    def get_compressed_file(self, pub_id: str):
        """Récupère le fichier compressé pour téléchargement"""
        if pub_id not in self.publications:
            return None, None
        
        pub = self.publications[pub_id]
        pub['downloads'] += 1
        
        compressed_path = Path(pub['compressed_path'])
        if not compressed_path.exists():
            return None, None
        
        with open(compressed_path, 'rb') as f:
            compressed_data = f.read()
        
        # Décompresser
        original_data = CompressionManager.decompress_file(compressed_data)
        
        return original_data, pub['filename']
    
    def _generate_id(self):
        """Génère un ID unique"""
        import time
        return f"pub_{int(time.time() * 1000)}"


# =============================================================================
# INITIALISATION
# =============================================================================

pub_manager = PublicationManager(PUBLICATIONS_DIR)

print("\n" + "="*60)
print("🚀 ZNK Backend Server - Initialisé")
print("="*60)
print(f"📁 Publications: {PUBLICATIONS_DIR}")
print(f"📂 Shared: {SHARED_DIR}")
print(f"📊 {len(pub_manager.publications)} publications chargées")
print("="*60 + "\n")


# =============================================================================
# ROUTES API
# =============================================================================

@app.route('/')
def index():
    """Page d'accueil de l'API"""
    return jsonify({
        'status': 'online',
        'service': 'ZNK Backend API',
        'version': '1.0.0',
        'endpoints': {
            'previews': '/api/publications/previews',
            'download': '/api/publications/<pub_id>/download',
            'upload': '/api/publications/upload',
            'stats': '/api/stats'
        }
    })


@app.route('/api/publications/previews')
def get_previews():
    """Retourne tous les previews (légers)"""
    try:
        user_id = request.args.get('user_id')
        publications = pub_manager.list_publications(user_id)
        
        print(f"📋 Previews demandés: {len(publications)} publications")
        
        return jsonify(publications)
    
    except Exception as e:
        print(f"❌ Erreur get_previews: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/publications/<pub_id>/download')
def download_publication(pub_id):
    """Télécharge le fichier complet décompressé"""
    try:
        print(f"📥 Téléchargement demandé: {pub_id}")
        
        original_data, filename = pub_manager.get_compressed_file(pub_id)
        
        if not original_data:
            return jsonify({'error': 'Publication non trouvée'}), 404
        
        return send_file(
            io.BytesIO(original_data),
            as_attachment=True,
            download_name=filename,
            mimetype='application/octet-stream'
        )
    
    except Exception as e:
        print(f"❌ Erreur download: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/publications/upload', methods=['POST'])
def upload_publication():
    """Upload une nouvelle publication"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'Aucun fichier'}), 400
        
        file = request.files['file']
        user_id = request.form.get('user_id', 'anonymous')
        metadata = json.loads(request.form.get('metadata', '{}'))
        
        # Sauvegarder temporairement
        temp_path = SHARED_DIR / file.filename
        file.save(temp_path)
        
        # Créer publication
        pub = pub_manager.create_publication(temp_path, user_id, metadata)
        
        # Supprimer temporaire
        temp_path.unlink()
        
        if pub:
            return jsonify({
                'success': True,
                'pub_id': pub['id'],
                'filename': pub['filename']
            })
        else:
            return jsonify({'error': 'Erreur création publication'}), 500
    
    except Exception as e:
        print(f"❌ Erreur upload: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/stats')
def get_stats():
    """Statistiques globales"""
    total_pubs = len(pub_manager.publications)
    total_views = sum(p.get('views', 0) for p in pub_manager.publications.values())
    total_downloads = sum(p.get('downloads', 0) for p in pub_manager.publications.values())
    
    return jsonify({
        'total_publications': total_pubs,
        'total_views': total_views,
        'total_downloads': total_downloads,
        'compression_saved': '...'  # TODO: calculer
    })


@app.route('/api/publications/<pub_id>', methods=['DELETE'])
def delete_publication(pub_id):
    """Supprime une publication"""
    try:
        if pub_id not in pub_manager.publications:
            return jsonify({'error': 'Publication non trouvée'}), 404
        
        pub = pub_manager.publications[pub_id]
        
        # Supprimer fichiers
        compressed_path = Path(pub['compressed_path'])
        if compressed_path.exists():
            compressed_path.unlink()
        
        meta_path = PUBLICATIONS_DIR / f"{pub_id}.json"
        if meta_path.exists():
            meta_path.unlink()
        
        # Retirer de la liste
        del pub_manager.publications[pub_id]
        
        return jsonify({'success': True})
    
    except Exception as e:
        print(f"❌ Erreur delete: {e}")
        return jsonify({'error': str(e)}), 500


# =============================================================================
# DONNÉES DE DÉMONSTRATION
# =============================================================================

def create_demo_publications():
    """Crée des publications de démonstration"""
    import tempfile
    
    print("\n📦 Création des publications de démonstration...")
    
    demos = [
        {
            'filename': 'demo_text.txt',
            'content': 'Ceci est une publication de test ZNK P2P.\n' * 50,
            'user_id': 'user_alice'
        },
        {
            'filename': 'demo_data.json',
            'content': json.dumps({'type': 'data', 'values': list(range(100))}, indent=2),
            'user_id': 'user_bob'
        },
        {
            'filename': 'demo_code.py',
            'content': '# Code Python de démonstration\n' + 'print("Hello ZNK")\n' * 20,
            'user_id': 'user_charlie'
        }
    ]
    
    for demo in demos:
        temp_path = Path(tempfile.gettempdir()) / demo['filename']
        
        with open(temp_path, 'w', encoding='utf-8') as f:
            f.write(demo['content'])
        
        pub_manager.create_publication(
            temp_path,
            demo['user_id'],
            {'title': f"Démo - {demo['filename']}", 'demo': True}
        )
        
        temp_path.unlink()
    
    print(f"✅ {len(demos)} publications de démo créées\n")


# =============================================================================
# LANCEMENT DU SERVEUR
# =============================================================================

if __name__ == '__main__':
    # Créer des données de démo si aucune publication
    if len(pub_manager.publications) == 0:
        create_demo_publications()
    
    print("🌐 Serveur démarré sur http://localhost:5000")
    print("📡 API disponible sur http://localhost:5000/api")
    print("\nAppuyez sur Ctrl+C pour arrêter\n")
    
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True
    )
