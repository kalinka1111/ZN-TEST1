"""
ZNK P2P avec Compression de fichiers et système de Preview
Permet de voir les publications sans télécharger le fichier complet
"""

import zlib
import gzip
import io
import json
import base64
from pathlib import Path
from typing import Dict, Optional, Tuple
import hashlib
from PIL import Image
import mimetypes

class CompressionManager:
    """Gère la compression/décompression des fichiers"""
    
    COMPRESSION_LEVEL = 6  # Niveau de compression (0-9)
    CHUNK_SIZE = 1024 * 1024  # 1 MB chunks
    
    @staticmethod
    def compress_file(file_path: Path) -> Tuple[bytes, Dict]:
        """
        Compresse un fichier et retourne les données + métadonnées
        """
        try:
            with open(file_path, 'rb') as f:
                original_data = f.read()
            
            # Compression avec gzip
            compressed_data = gzip.compress(
                original_data, 
                compresslevel=CompressionManager.COMPRESSION_LEVEL
            )
            
            # Calculer les ratios
            original_size = len(original_data)
            compressed_size = len(compressed_data)
            ratio = (1 - compressed_size / original_size) * 100
            
            metadata = {
                'original_size': original_size,
                'compressed_size': compressed_size,
                'compression_ratio': round(ratio, 2),
                'algorithm': 'gzip',
                'original_hash': hashlib.sha256(original_data).hexdigest(),
                'compressed_hash': hashlib.sha256(compressed_data).hexdigest()
            }
            
            print(f"✅ Compression: {original_size} → {compressed_size} bytes ({ratio:.1f}% réduit)")
            
            return compressed_data, metadata
            
        except Exception as e:
            print(f"❌ Erreur compression: {e}")
            return None, None
    
    @staticmethod
    def decompress_file(compressed_data: bytes) -> bytes:
        """Décompresse des données"""
        try:
            return gzip.decompress(compressed_data)
        except Exception as e:
            print(f"❌ Erreur décompression: {e}")
            return None
    
    @staticmethod
    def compress_stream(data: bytes) -> bytes:
        """Compression rapide pour streaming"""
        return zlib.compress(data, level=3)
    
    @staticmethod
    def decompress_stream(data: bytes) -> bytes:
        """Décompression rapide pour streaming"""
        return zlib.decompress(data)


class PreviewGenerator:
    """Génère des previews pour différents types de fichiers"""
    
    PREVIEW_SIZE = (400, 400)  # Taille max des previews
    PREVIEW_QUALITY = 70  # Qualité JPEG pour previews
    
    @staticmethod
    def generate_preview(file_path: Path) -> Optional[Dict]:
        """
        Génère un preview selon le type de fichier
        Retourne: {type, data, mime_type}
        """
        mime_type, _ = mimetypes.guess_type(str(file_path))
        
        if not mime_type:
            return PreviewGenerator._generate_text_preview(file_path)
        
        # Images
        if mime_type.startswith('image/'):
            return PreviewGenerator._generate_image_preview(file_path, mime_type)
        
        # Vidéos (thumbnail)
        elif mime_type.startswith('video/'):
            return PreviewGenerator._generate_video_preview(file_path)
        
        # Audio (waveform ou metadata)
        elif mime_type.startswith('audio/'):
            return PreviewGenerator._generate_audio_preview(file_path)
        
        # Documents texte
        elif mime_type in ['text/plain', 'application/json', 'text/markdown']:
            return PreviewGenerator._generate_text_preview(file_path)
        
        # PDF
        elif mime_type == 'application/pdf':
            return PreviewGenerator._generate_pdf_preview(file_path)
        
        # Par défaut: métadonnées
        return PreviewGenerator._generate_metadata_preview(file_path)
    
    @staticmethod
    def _generate_image_preview(file_path: Path, mime_type: str) -> Dict:
        """Génère un preview d'image (thumbnail)"""
        try:
            with Image.open(file_path) as img:
                # Créer thumbnail
                img.thumbnail(PreviewGenerator.PREVIEW_SIZE, Image.Resampling.LANCZOS)
                
                # Convertir en bytes
                buffer = io.BytesIO()
                img_format = 'JPEG' if img.mode == 'RGB' else 'PNG'
                img.save(buffer, format=img_format, quality=PreviewGenerator.PREVIEW_QUALITY)
                
                preview_data = base64.b64encode(buffer.getvalue()).decode('utf-8')
                
                return {
                    'type': 'image',
                    'data': preview_data,
                    'mime_type': f'image/{img_format.lower()}',
                    'dimensions': f"{img.size[0]}x{img.size[1]}",
                    'size': len(buffer.getvalue())
                }
                
        except Exception as e:
            print(f"❌ Erreur preview image: {e}")
            return PreviewGenerator._generate_metadata_preview(file_path)
    
    @staticmethod
    def _generate_video_preview(file_path: Path) -> Dict:
        """Génère un preview vidéo (première frame)"""
        # Note: Nécessite ffmpeg-python pour extraction de frame
        # Pour simplifier, on retourne les métadonnées
        return {
            'type': 'video',
            'data': '🎥',
            'mime_type': 'text/plain',
            'info': 'Preview vidéo (nécessite téléchargement pour voir)',
            'size': file_path.stat().st_size
        }
    
    @staticmethod
    def _generate_audio_preview(file_path: Path) -> Dict:
        """Génère un preview audio (waveform ou metadata)"""
        return {
            'type': 'audio',
            'data': '🎵',
            'mime_type': 'text/plain',
            'info': 'Fichier audio',
            'size': file_path.stat().st_size
        }
    
    @staticmethod
    def _generate_text_preview(file_path: Path) -> Dict:
        """Génère un preview de fichier texte (premiers 500 caractères)"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read(500)
                
            return {
                'type': 'text',
                'data': content,
                'mime_type': 'text/plain',
                'truncated': len(content) == 500,
                'size': file_path.stat().st_size
            }
        except Exception as e:
            return PreviewGenerator._generate_metadata_preview(file_path)
    
    @staticmethod
    def _generate_pdf_preview(file_path: Path) -> Dict:
        """Génère un preview PDF (première page en image)"""
        # Note: Nécessite PyPDF2 ou pdf2image
        return {
            'type': 'pdf',
            'data': '📄',
            'mime_type': 'text/plain',
            'info': 'Document PDF',
            'size': file_path.stat().st_size
        }
    
    @staticmethod
    def _generate_metadata_preview(file_path: Path) -> Dict:
        """Génère un preview basique avec métadonnées"""
        stat = file_path.stat()
        return {
            'type': 'metadata',
            'data': {
                'name': file_path.name,
                'size': stat.st_size,
                'modified': stat.st_mtime,
                'extension': file_path.suffix
            },
            'mime_type': 'application/json'
        }


class PublicationManager:
    """Gère les publications avec preview et compression"""
    
    def __init__(self, user_id: str, storage_path: Path):
        self.user_id = user_id
        self.storage_path = storage_path
        self.publications = {}
        self.previews_cache = {}
    
    def create_publication(self, file_path: Path, metadata: Dict = None) -> Dict:
        """
        Crée une publication avec preview et fichier compressé
        """
        try:
            # 1. Générer le preview
            print(f"📸 Génération du preview pour {file_path.name}...")
            preview = PreviewGenerator.generate_preview(file_path)
            
            # 2. Compresser le fichier
            print(f"🗜️ Compression de {file_path.name}...")
            compressed_data, compression_meta = CompressionManager.compress_file(file_path)
            
            if not compressed_data:
                return None
            
            # 3. Créer la structure de publication
            pub_id = self._generate_pub_id()
            publication = {
                'id': pub_id,
                'user_id': self.user_id,
                'filename': file_path.name,
                'timestamp': self._get_timestamp(),
                'preview': preview,
                'compression': compression_meta,
                'metadata': metadata or {},
                'downloads': 0,
                'views': 0
            }
            
            # 4. Sauvegarder le fichier compressé
            compressed_path = self.storage_path / f"{pub_id}.znk"
            with open(compressed_path, 'wb') as f:
                f.write(compressed_data)
            
            publication['compressed_path'] = str(compressed_path)
            
            # 5. Sauvegarder les métadonnées de la publication
            pub_meta_path = self.storage_path / f"{pub_id}.json"
            with open(pub_meta_path, 'w', encoding='utf-8') as f:
                # Ne pas inclure les données binaires dans le JSON
                pub_meta = publication.copy()
                if 'preview' in pub_meta and pub_meta['preview'].get('type') == 'image':
                    pub_meta['preview']['data'] = '[IMAGE_DATA]'
                json.dump(pub_meta, f, indent=2, ensure_ascii=False)
            
            self.publications[pub_id] = publication
            
            print(f"✅ Publication créée: {pub_id}")
            print(f"   Preview: {preview['type']}")
            print(f"   Compression: {compression_meta['compression_ratio']}%")
            
            return publication
            
        except Exception as e:
            print(f"❌ Erreur création publication: {e}")
            return None
    
    def get_preview_only(self, pub_id: str) -> Optional[Dict]:
        """
        Récupère uniquement le preview (sans télécharger le fichier)
        """
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
    
    def download_file(self, pub_id: str, output_path: Path) -> bool:
        """
        Télécharge et décompresse le fichier complet
        """
        try:
            if pub_id not in self.publications:
                print(f"❌ Publication {pub_id} introuvable")
                return False
            
            pub = self.publications[pub_id]
            pub['downloads'] += 1
            
            # Lire le fichier compressé
            compressed_path = Path(pub['compressed_path'])
            with open(compressed_path, 'rb') as f:
                compressed_data = f.read()
            
            # Décompresser
            print(f"📦 Décompression de {pub['filename']}...")
            original_data = CompressionManager.decompress_file(compressed_data)
            
            if not original_data:
                return False
            
            # Sauvegarder
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, 'wb') as f:
                f.write(original_data)
            
            print(f"✅ Fichier téléchargé: {output_path}")
            return True
            
        except Exception as e:
            print(f"❌ Erreur téléchargement: {e}")
            return False
    
    def list_publications(self, user_id: Optional[str] = None) -> list:
        """
        Liste toutes les publications (preview only)
        """
        publications = []
        
        for pub_id, pub in self.publications.items():
            if user_id and pub['user_id'] != user_id:
                continue
            
            publications.append(self.get_preview_only(pub_id))
        
        return publications
    
    def _generate_pub_id(self) -> str:
        """Génère un ID unique pour la publication"""
        import time
        return f"pub_{int(time.time())}_{hash(self.user_id) % 10000}"
    
    def _get_timestamp(self) -> str:
        """Retourne le timestamp actuel"""
        from datetime import datetime
        return datetime.now().isoformat()


# Exemple d'utilisation
if __name__ == "__main__":
    import tempfile
    import os
    
    # Créer un dossier temporaire pour les tests
    with tempfile.TemporaryDirectory() as temp_dir:
        storage_path = Path(temp_dir) / "publications"
        storage_path.mkdir(exist_ok=True)
        
        print("=" * 60)
        print("🧪 TEST DU SYSTÈME DE PUBLICATIONS AVEC COMPRESSION")
        print("=" * 60)
        
        # Créer un gestionnaire de publications
        pub_manager = PublicationManager("user_alice", storage_path)
        
        # Test 1: Créer un fichier texte de test
        print("\n📝 Test 1: Publication d'un fichier texte")
        test_file = Path(temp_dir) / "test.txt"
        with open(test_file, 'w') as f:
            f.write("Ceci est un test de publication ZNK.\n" * 100)
        
        pub1 = pub_manager.create_publication(
            test_file,
            metadata={'title': 'Mon premier post', 'tags': ['test', 'demo']}
        )
        
        # Test 2: Créer une "image" de test (simulée)
        print("\n🖼️ Test 2: Publication d'une image (simulée)")
        # Note: Dans un vrai cas, ce serait une vraie image
        test_json = Path(temp_dir) / "data.json"
        with open(test_json, 'w') as f:
            json.dump({'type': 'data', 'values': list(range(100))}, f)
        
        pub2 = pub_manager.create_publication(
            test_json,
            metadata={'title': 'Données importantes', 'category': 'data'}
        )
        
        # Test 3: Lister toutes les publications (PREVIEW ONLY)
        print("\n" + "=" * 60)
        print("📋 LISTE DES PUBLICATIONS (Preview seulement - Pas de téléchargement)")
        print("=" * 60)
        
        publications = pub_manager.list_publications()
        for pub in publications:
            print(f"\n📄 {pub['filename']}")
            print(f"   ID: {pub['id']}")
            print(f"   Utilisateur: {pub['user_id']}")
            print(f"   Taille originale: {pub['size_info']['original']} bytes")
            print(f"   Taille compressée: {pub['size_info']['compressed']} bytes")
            print(f"   Économie: {pub['size_info']['ratio']}%")
            print(f"   Preview: {pub['preview']['type']}")
            print(f"   Vues: {pub['stats']['views']} | Téléchargements: {pub['stats']['downloads']}")
        
        # Test 4: Voir un preview sans télécharger
        print("\n" + "=" * 60)
        print("👀 CONSULTATION D'UN PREVIEW (Sans téléchargement)")
        print("=" * 60)
        
        preview = pub_manager.get_preview_only(pub1['id'])
        print(f"\n📖 Aperçu de: {preview['filename']}")
        print(f"Preview type: {preview['preview']['type']}")
        if preview['preview']['type'] == 'text':
            print(f"Contenu (extrait):\n{preview['preview']['data'][:200]}...")
        
        # Test 5: Télécharger le fichier complet
        print("\n" + "=" * 60)
        print("💾 TÉLÉCHARGEMENT DU FICHIER COMPLET")
        print("=" * 60)
        
        download_path = Path(temp_dir) / "downloaded" / "test_downloaded.txt"
        success = pub_manager.download_file(pub1['id'], download_path)
        
        if success:
            with open(download_path, 'r') as f:
                content = f.read()
            print(f"✅ Fichier téléchargé: {len(content)} caractères")
        
        # Afficher les statistiques finales
        print("\n" + "=" * 60)
        print("📊 STATISTIQUES FINALES")
        print("=" * 60)
        
        publications = pub_manager.list_publications()
        for pub in publications:
            print(f"\n📄 {pub['filename']}")
            print(f"   Vues: {pub['stats']['views']}")
            print(f"   Téléchargements: {pub['stats']['downloads']}")
            print(f"   Ratio téléchargement/vue: {pub['stats']['downloads']}/{pub['stats']['views']}")
        
        print("\n✅ Tests terminés avec succès!")
