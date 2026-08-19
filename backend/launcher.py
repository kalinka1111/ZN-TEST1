"""
OMIA - Moteur de Fulgurance Autonome
Système d'IA qui cristallise automatiquement les concepts utiles
Aucune donnée externe ne contrôle la cristallisation
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import os
from datetime import datetime
from pathlib import Path
import re

app = Flask(__name__)
CORS(app)

# Configuration
DATA_DIR = Path("znk_data")
DATA_DIR.mkdir(exist_ok=True)

SESSIONS_FILE = DATA_DIR / "sessions.json"
RULES_FILE = DATA_DIR / "rules.json"
SEDIMENTS_FILE = DATA_DIR / "sediments.json"
FULGURANCES_FILE = DATA_DIR / "fulgurances.json"

# Mode simulation
USE_SIMULATION = True

try:
    import ollama
    MODEL = "llama3.2:latest"
    ollama.list()
    USE_SIMULATION = False
except:
    pass

# === SYSTÈME DE DONNÉES ===
class OMIACore:
    def __init__(self):
        self.sessions = self.load_json(SESSIONS_FILE, {})
        self.rules = self.load_json(RULES_FILE, {
            "core": [
                "Priorité absolue au mode Hors-Ligne",
                "Souveraineté totale de l'utilisateur",
                "Cristallisation automatique autonome",
                "Aucune donnée externe ne contrôle OMIA"
            ],
            "learned": []
        })
        self.sediments = self.load_json(SEDIMENTS_FILE, [])
        self.fulgurances = self.load_json(FULGURANCES_FILE, [])
        
    def load_json(self, file, default):
        if file.exists():
            try:
                with open(file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except:
                return default
        return default
    
    def save_json(self, file, data):
        try:
            with open(file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Erreur sauvegarde: {e}")

omia = OMIACore()

# === MOTEUR DE FULGURANCE ===
class FulguranceEngine:
    CONCEPT_PATTERNS = [
        r'\b(concept|notion|principe|théorie|modèle)\b',
        r'\b(méthode|technique|approche|stratégie|solution)\b',
        r'\b(structure|architecture|organisation|système)\b',
    ]
    
    CRYSTALLIZATION_THRESHOLD = 3
    
    @classmethod
    def analyze_vibration(cls, message: str, response: str) -> dict:
        combined_text = f"{message} {response}"
        score = 0
        detected_patterns = []
        
        for pattern in cls.CONCEPT_PATTERNS:
            matches = re.findall(pattern, combined_text.lower())
            if matches:
                score += len(matches)
                detected_patterns.append(pattern)
        
        if len(response.split()) > 50:
            score += 1
        
        category = "général"
        if 'code' in combined_text.lower():
            category = 'technique'
        elif 'architecture' in combined_text.lower():
            category = 'architecture'
        
        extract = response[:300] + ('...' if len(response) > 300 else '')
        
        return {
            'is_fulgurance': score >= cls.CRYSTALLIZATION_THRESHOLD,
            'score': score,
            'category': category,
            'extract': extract,
            'patterns': detected_patterns
        }
"""
OMIA - SKILL COMPLET : ELECTRON BUILD FIXER + AUTO-UPDATE
À copier-coller DIRECTEMENT dans launcher.py (après la classe FulguranceEngine)
"""

import json
import shutil
from pathlib import Path
from datetime import datetime

# ============================================================================
# SKILL 1 : OMIA PEUT SE MODIFIER LUI-MÊME
# ============================================================================

class OMIASelfUpdater:
    """
    Permet à OMIA de modifier son propre code (launcher.py)
    Interface pour ajouter des skills sans éditer manuellement
    """
    
    @classmethod
    def add_skill_to_launcher(cls, skill_code: str, skill_name: str) -> dict:
        """
        Ajoute un nouveau skill directement dans launcher.py
        """
        launcher_path = Path("launcher.py")
        
        if not launcher_path.exists():
            return {"error": "launcher.py non trouvé"}
        
        # Backup avant modification
        backup_path = Path(f"launcher_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.py")
        shutil.copy(launcher_path, backup_path)
        
        # Lire le contenu actuel
        content = launcher_path.read_text(encoding='utf-8')
        
        # Trouver où insérer (après FulguranceEngine)
        insertion_point = content.find("# === RÉPONSES SIMULÉES ===")
        
        if insertion_point == -1:
            return {"error": "Point d'insertion non trouvé"}
        
        # Insérer le nouveau skill
        new_content = (
            content[:insertion_point] +
            f"\n# === SKILL AJOUTÉ PAR OMIA : {skill_name} ===\n" +
            skill_code +
            "\n\n" +
            content[insertion_point:]
        )
        
        # Sauvegarder
        launcher_path.write_text(new_content, encoding='utf-8')
        
        return {
            "success": True,
            "skill_added": skill_name,
            "backup_created": str(backup_path),
            "message": "Skill ajouté avec succès. Redémarrez OMIA pour activer.",
            "restart_required": True
        }
    
    @classmethod
    def inject_code_block(cls, code: str, location: str = "after_fulgurance") -> dict:
        """
        Injecte un bloc de code à un emplacement spécifique
        """
        launcher_path = Path("launcher.py")
        content = launcher_path.read_text(encoding='utf-8')
        
        # Backup
        backup = Path(f"launcher_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.py")
        shutil.copy(launcher_path, backup)
        
        insertion_markers = {
            "after_fulgurance": "# === RÉPONSES SIMULÉES ===",
            "before_routes": "# === ROUTES API ===",
            "end_of_file": "if __name__ == '__main__':"
        }
        
        marker = insertion_markers.get(location)
        if not marker:
            return {"error": f"Location '{location}' inconnue"}
        
        insertion_point = content.find(marker)
        if insertion_point == -1:
            return {"error": f"Marker '{marker}' non trouvé"}
        
        new_content = (
            content[:insertion_point] +
            f"\n# === CODE INJECTÉ PAR OMIA ({datetime.now().isoformat()}) ===\n" +
            code + "\n\n" +
            content[insertion_point:]
        )
        
        launcher_path.write_text(new_content, encoding='utf-8')
        
        return {
            "success": True,
            "backup": str(backup),
            "message": "Code injecté. Redémarrez OMIA.",
            "location": location
        }


# ============================================================================
# SKILL 2 : ELECTRON BUILD FIXER (COMPLET)
# ============================================================================

class ElectronBuildFixer:
    """
    Diagnostique et corrige automatiquement les problèmes Electron dev vs build
    Spécialisé dans les systèmes d'icônes custom
    """
    
    @classmethod
    def diagnose_project(cls, project_root: str = ".") -> dict:
        """
        Scan complet du projet pour détecter problèmes potentiels
        """
        project_path = Path(project_root)
        issues = []
        
        # 1. Vérifier electron-builder.json
        builder_config = project_path / "electron-builder.json"
        if builder_config.exists():
            config = json.loads(builder_config.read_text())
            
            if "extraResources" not in config:
                issues.append({
                    "severity": "CRITICAL",
                    "file": "electron-builder.json",
                    "issue": "extraResources manquant - assets ne seront pas copiés",
                    "fix": "add_extra_resources"
                })
            
            if "files" not in config:
                issues.append({
                    "severity": "WARNING",
                    "file": "electron-builder.json",
                    "issue": "files non configuré - bundle peut être trop gros",
                    "fix": "optimize_files"
                })
        else:
            issues.append({
                "severity": "CRITICAL",
                "file": "electron-builder.json",
                "issue": "Fichier manquant",
                "fix": "create_builder_config"
            })
        
        # 2. Chercher icon-manifest.json
        manifest_files = list(project_path.rglob("icon-manifest.json"))
        if manifest_files:
            for manifest in manifest_files:
                issues.append({
                    "severity": "INFO",
                    "file": str(manifest),
                    "issue": "Manifest trouvé - vérifier chargement dev/build",
                    "fix": "generate_icon_loader"
                })
        
        # 3. Détecter chemins relatifs dans HTML/JS
        problematic_files = []
        for pattern in ["*.html", "*.js", "*.jsx"]:
            for file in project_path.rglob(pattern):
                try:
                    content = file.read_text()
                    if "./assets/" in content or "../assets/" in content:
                        problematic_files.append(str(file.relative_to(project_path)))
                except:
                    pass
        
        if problematic_files:
            issues.append({
                "severity": "HIGH",
                "files": problematic_files[:5],  # Max 5
                "issue": "Chemins relatifs détectés - ne marcheront pas en build",
                "fix": "convert_to_app_protocol"
            })
        
        # 4. Vérifier main.js
        main_files = list(project_path.rglob("main.js"))
        if main_files:
            main_content = main_files[0].read_text()
            if "protocol.registerFileProtocol" not in main_content:
                issues.append({
                    "severity": "HIGH",
                    "file": str(main_files[0]),
                    "issue": "Protocol custom non configuré",
                    "fix": "setup_app_protocol"
                })
        
        return {
            "project_root": str(project_path.absolute()),
            "scan_date": datetime.now().isoformat(),
            "issues_found": len(issues),
            "issues": issues,
            "health_score": max(0, 100 - (len(issues) * 15))
        }
    
    @classmethod
    def auto_fix(cls, project_root: str = ".", fix_type: str = "all") -> dict:
        """
        Applique automatiquement les corrections
        """
        fixes_applied = []
        project_path = Path(project_root)
        
        # FIX 1 : electron-builder.json
        if fix_type in ["all", "add_extra_resources"]:
            builder_config = project_path / "electron-builder.json"
            
            if builder_config.exists():
                config = json.loads(builder_config.read_text())
            else:
                config = {
                    "appId": "com.znk.app",
                    "productName": "ZNK"
                }
            
            # Ajouter extraResources
            if "extraResources" not in config:
                config["extraResources"] = [
                    {
                        "from": "assets",
                        "to": "assets",
                        "filter": ["**/*"]
                    }
                ]
                fixes_applied.append("extraResources ajouté")
            
            # Optimiser files
            if "files" not in config:
                config["files"] = [
                    "dist-electron/**/*",
                    "dist/**/*",
                    "!node_modules/**/*"
                ]
                fixes_applied.append("files optimisé")
            
            # Ajouter config plateformes si manquante
            if "mac" not in config:
                config["mac"] = {
                    "icon": "build/icon.icns",
                    "category": "public.app-category.productivity"
                }
                fixes_applied.append("config macOS ajoutée")
            
            if "win" not in config:
                config["win"] = {
                    "icon": "build/icon.ico"
                }
                fixes_applied.append("config Windows ajoutée")
            
            if "linux" not in config:
                config["linux"] = {
                    "icon": "build/icon.png",
                    "category": "Utility"
                }
                fixes_applied.append("config Linux ajoutée")
            
            # Sauvegarder
            builder_config.write_text(json.dumps(config, indent=2, ensure_ascii=False))
        
        # FIX 2 : Générer icon-loader.js
        if fix_type in ["all", "generate_icon_loader"]:
            icon_loader_code = """
// icon-loader.js - Auto-généré par OMIA
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * Charge le manifest d'icônes (compatible dev + build)
 */
function loadIconManifest() {
    const manifestPath = app.isPackaged
        ? path.join(process.resourcesPath, 'assets/icon-manifest.json')
        : path.join(__dirname, '../assets/icon-manifest.json');
    
    console.log('[OMIA Icon Loader] Chargement depuis:', manifestPath);
    
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        console.log('[OMIA Icon Loader] ✓ Manifest chargé:', Object.keys(manifest.icons || {}).length, 'icônes');
        return manifest;
    } catch (error) {
        console.error('[OMIA Icon Loader] ✗ Erreur:', error.message);
        return { icons: {} };
    }
}

/**
 * Obtient le chemin absolu d'une icône
 */
function getIconPath(iconName, manifest = null) {
    if (!manifest) {
        manifest = loadIconManifest();
    }
    
    const icon = manifest.icons?.[iconName];
    if (!icon || !icon.path) return null;
    
    // Construire chemin absolu
    const basePath = app.isPackaged 
        ? process.resourcesPath 
        : path.join(__dirname, '..');
    
    return path.join(basePath, icon.path);
}

/**
 * Teste si toutes les icônes existent
 */
function testIconsAvailability() {
    const manifest = loadIconManifest();
    const results = {
        total: 0,
        found: 0,
        missing: []
    };
    
    if (!manifest.icons) return results;
    
    Object.entries(manifest.icons).forEach(([name, icon]) => {
        results.total++;
        const fullPath = getIconPath(name, manifest);
        
        if (fullPath && fs.existsSync(fullPath)) {
            results.found++;
        } else {
            results.missing.push(name);
        }
    });
    
    console.log('[OMIA Icon Loader] Test:', results.found, '/', results.total, 'icônes trouvées');
    if (results.missing.length > 0) {
        console.warn('[OMIA Icon Loader] Manquantes:', results.missing);
    }
    
    return results;
}

module.exports = {
    loadIconManifest,
    getIconPath,
    testIconsAvailability
};
"""
            
            loader_path = project_path / "src" / "icon-loader.js"
            loader_path.parent.mkdir(parents=True, exist_ok=True)
            loader_path.write_text(icon_loader_code)
            fixes_applied.append(f"icon-loader.js créé dans {loader_path}")
        
        # FIX 3 : Setup protocol dans main.js
        if fix_type in ["all", "setup_app_protocol"]:
            protocol_snippet = """

// ============================================================================
// OMIA AUTO-FIX : Protocol custom pour assets (dev + build)
// ============================================================================

const { protocol } = require('electron');
const path = require('path');

app.whenReady().then(() => {
    // Enregistrer protocol 'app://' pour accès unifié aux assets
    protocol.registerFileProtocol('app', (request, callback) => {
        const url = request.url.replace('app://', '');
        
        const filePath = app.isPackaged
            ? path.join(process.resourcesPath, url)
            : path.join(__dirname, url);
        
        console.log('[OMIA Protocol] Request:', url, '→', filePath);
        callback({ path: filePath });
    });
    
    // VOTRE CODE DE CRÉATION DE FENÊTRE ICI
    // createWindow();
});

// ============================================================================
"""
            
            snippet_path = project_path / "OMIA_protocol_setup.txt"
            snippet_path.write_text(protocol_snippet)
            fixes_applied.append(f"Protocol snippet créé : {snippet_path} (à copier dans main.js)")
        
        # FIX 4 : Script de test
        if fix_type in ["all", "create_test_script"]:
            test_script = """
// test-icons-build.js - Auto-généré par OMIA
const { app } = require('electron');
const path = require('path');

app.whenReady().then(() => {
    console.log('\\n========================================');
    console.log('🔍 OMIA - TEST ICON SYSTEM');
    console.log('========================================');
    console.log('Environment:', app.isPackaged ? '📦 BUILD' : '⚙️  DEV');
    console.log('App path:', app.getAppPath());
    console.log('Resources:', process.resourcesPath);
    
    // Charger et tester
    const { testIconsAvailability } = require('./src/icon-loader');
    const results = testIconsAvailability();
    
    console.log('\\n📊 Résultats:');
    console.log('  Total icônes:', results.total);
    console.log('  Trouvées:', results.found);
    console.log('  Manquantes:', results.missing.length);
    
    if (results.missing.length > 0) {
        console.log('  ⚠️  Icônes manquantes:', results.missing);
    } else {
        console.log('  ✅ Toutes les icônes sont présentes!');
    }
    
    console.log('========================================\\n');
    
    setTimeout(() => app.quit(), 1000);
});
"""
            
            test_path = project_path / "test-icons-build.js"
            test_path.write_text(test_script)
            fixes_applied.append(f"Script de test créé : {test_path}")
        
        return {
            "skill": "electron_build_fixer",
            "fixes_applied": fixes_applied,
            "count": len(fixes_applied),
            "message": "Corrections appliquées avec succès",
            "next_steps": [
                "1. Copier le contenu de OMIA_protocol_setup.txt dans main.js (avant createWindow)",
                "2. Dans HTML/JS : remplacer './assets/' par 'app:///assets/'",
                "3. Tester : node test-icons-build.js",
                "4. Rebuild : npm run build"
            ]
        }
    
    @classmethod
    def convert_paths_to_protocol(cls, file_path: str) -> dict:
        """
        Convertit automatiquement les chemins dans un fichier HTML/JS
        """
        file = Path(file_path)
        if not file.exists():
            return {"error": "Fichier non trouvé"}
        
        # Backup
        backup = Path(str(file) + ".backup")
        shutil.copy(file, backup)
        
        # Lire et convertir
        content = file.read_text()
        original = content
        
        # Remplacer les patterns
        replacements = [
            (r'["\']\.\/assets\/', '"app:///assets/'),
            (r'["\']\.\.\/assets\/', '"app:///assets/'),
            (r'src=["\']assets\/', 'src="app:///assets/'),
        ]
        
        import re
        for pattern, replacement in replacements:
            content = re.sub(pattern, replacement, content)
        
        if content != original:
            file.write_text(content)
            return {
                "success": True,
                "file": str(file),
                "backup": str(backup),
                "changes": "Chemins convertis vers app://"
            }
        
        return {
            "success": False,
            "message": "Aucun chemin à convertir trouvé"
        }


# ============================================================================
# SKILL 3 : ELECTRON MEMORY MANAGER
# ============================================================================

class ElectronMemoryManager:
    """
    Gère la mémoire d'OMIA sur Electron
    Structure hiérarchique des connaissances
    """
    
    ELECTRON_DOMAINS = {
        "icon_system": {
            "description": "Système d'icônes custom manifest-based",
            "priority": "HIGH",
            "sediments": []
        },
        "build_config": {
            "description": "Configuration electron-builder",
            "priority": "HIGH",
            "sediments": []
        },
        "main_process": {
            "description": "Main process patterns",
            "priority": "MEDIUM",
            "sediments": []
        },
        "ipc_patterns": {
            "description": "IPC communication",
            "priority": "MEDIUM",
            "sediments": []
        }
    }
    
    @classmethod
    def add_electron_sediment(cls, domain: str, name: str, content: dict):
        """
        Ajoute un sédiment dans un domaine Electron
        """
        memory_file = Path("znk_data") / f"electron_{domain}.json"
        memory_file.parent.mkdir(exist_ok=True)
        
        if memory_file.exists():
            memory = json.loads(memory_file.read_text())
        else:
            memory = {"domain": domain, "sediments": []}
        
        sediment = {
            "name": name,
            "content": content,
            "timestamp": datetime.now().isoformat(),
            "confidence": 1.0
        }
        
        memory["sediments"].append(sediment)
        memory_file.write_text(json.dumps(memory, indent=2, ensure_ascii=False))
        
        return sediment

# ============================================================================
# AJOUT DANS launcher.py (après ElectronMemoryManager)
# ============================================================================

import os
from pathlib import Path

class OMIAProjectConfig:
    """
    Gère la configuration de l'écosystème ZNK
    OMIA peut scanner différents dossiers selon le contexte
    """
    
    CONFIG_FILE = Path("znk_data/project_config.json")
    
    DEFAULT_CONFIG = {
        "ecosystem_root": ".",
        "projects": {
            "electron_app": {
                "path": ".",
                "description": "Application Electron principale",
                "scan_targets": [
                    "main.js",
                    "electron-builder.json",
                    "package.json",
                    "assets/",
                    "src/"
                ]
            },
            "omia_brain": {
                "path": "OMia/",
                "description": "Cerveau d'OMIA (launcher + interface)",
                "scan_targets": [
                    "launcher.py",
                    "OMia.html",
                    "znk_data/"
                ]
            }
        },
        "current_project": "electron_app"
    }
    
    @classmethod
    def load_config(cls) -> dict:
        """Charge la configuration du projet"""
        if cls.CONFIG_FILE.exists():
            try:
                return json.loads(cls.CONFIG_FILE.read_text())
            except:
                pass
        
        # Créer config par défaut
        cls.CONFIG_FILE.parent.mkdir(exist_ok=True)
        cls.CONFIG_FILE.write_text(json.dumps(cls.DEFAULT_CONFIG, indent=2))
        return cls.DEFAULT_CONFIG
    
    @classmethod
    def save_config(cls, config: dict):
        """Sauvegarde la configuration"""
        cls.CONFIG_FILE.parent.mkdir(exist_ok=True)
        cls.CONFIG_FILE.write_text(json.dumps(config, indent=2, ensure_ascii=False))
    
    @classmethod
    def set_current_project(cls, project_name: str) -> dict:
        """Change le projet actif"""
        config = cls.load_config()
        
        if project_name not in config['projects']:
            return {
                "error": f"Projet '{project_name}' inconnu",
                "available": list(config['projects'].keys())
            }
        
        config['current_project'] = project_name
        cls.save_config(config)
        
        project = config['projects'][project_name]
        return {
            "success": True,
            "current_project": project_name,
            "path": project['path'],
            "description": project['description']
        }
    
    @classmethod
    def add_project(cls, name: str, path: str, description: str = "") -> dict:
        """Ajoute un nouveau projet à l'écosystème"""
        config = cls.load_config()
        
        # Vérifier que le chemin existe
        project_path = Path(path)
        if not project_path.exists():
            return {"error": f"Chemin '{path}' introuvable"}
        
        config['projects'][name] = {
            "path": path,
            "description": description,
            "scan_targets": [],
            "added_at": datetime.now().isoformat()
        }
        
        cls.save_config(config)
        
        return {
            "success": True,
            "project": name,
            "message": f"Projet '{name}' ajouté à l'écosystème"
        }
    
    @classmethod
    def get_current_project_path(cls) -> str:
        """Retourne le chemin du projet actif"""
        config = cls.load_config()
        current = config.get('current_project', 'electron_app')
        project = config['projects'].get(current, {})
        return project.get('path', '.')
    
    @classmethod
    def list_projects(cls) -> dict:
        """Liste tous les projets de l'écosystème"""
        config = cls.load_config()
        current = config.get('current_project')
        
        projects_info = []
        for name, info in config['projects'].items():
            projects_info.append({
                "name": name,
                "path": info['path'],
                "description": info['description'],
                "is_current": name == current,
                "exists": Path(info['path']).exists()
            })
        
        return {
            "ecosystem_root": config.get('ecosystem_root', '.'),
            "current_project": current,
            "projects": projects_info
        }
    
    @classmethod
    def discover_ecosystem(cls, root_path: str = ".") -> dict:
        """
        Scan automatique de l'arborescence pour détecter les projets
        """
        root = Path(root_path).resolve()
        discovered = []
        
        # Patterns de détection
        patterns = {
            "electron_app": ["package.json", "main.js", "electron-builder.json"],
            "react_app": ["package.json", "src/App.jsx", "vite.config.js"],
            "python_service": ["requirements.txt", "*.py"],
            "omia_brain": ["launcher.py", "OMia.html"]
        }
        
        # Scanner les sous-dossiers (max 2 niveaux)
        for dirpath, dirnames, filenames in os.walk(root):
            depth = len(Path(dirpath).relative_to(root).parts)
            if depth > 2:
                dirnames.clear()  # Ne pas descendre plus
                continue
            
            # Vérifier patterns
            for proj_type, required_files in patterns.items():
                matches = []
                for pattern in required_files:
                    if '*' in pattern:
                        # Wildcard
                        ext = pattern.split('*')[1]
                        if any(f.endswith(ext) for f in filenames):
                            matches.append(pattern)
                    elif pattern in filenames:
                        matches.append(pattern)
                
                # Si au moins 1 pattern match
                if matches:
                    discovered.append({
                        "type": proj_type,
                        "path": str(Path(dirpath).relative_to(root)),
                        "detected_files": matches,
                        "confidence": len(matches) / len(required_files)
                    })
        
        return {
            "root": str(root),
            "discovered": discovered,
            "count": len(discovered)
        }


# ============================================================================
# COMMANDES CHAT POUR OMIA
# ============================================================================

class OMIAChatCommands:
    """
    Interpréteur de commandes dans le chat
    Permet de contrôler OMIA via langage naturel
    """
    
    COMMANDS = {
        "config": {
            "patterns": [
                r"(configure|config|paramètre|réglage)",
                r"(projet|project|dossier|folder)",
                r"(change|modifier|switch|utilise)"
            ],
            "action": "configure_project"
        },
        "scan": {
            "patterns": [
                r"(scan|scanne|analyse|diagnostic)",
                r"(electron|projet|dossier)"
            ],
            "action": "scan_project"
        },
        "list_projects": {
            "patterns": [
                r"(liste|affiche|montre|show)",
                r"(projets|projects|dossiers)"
            ],
            "action": "list_projects"
        },
        "discover": {
            "patterns": [
                r"(découvre|discover|trouve|find)",
                r"(écosystème|ecosystem|projets|structure)"
            ],
            "action": "discover_ecosystem"
        }
    }
    
    @classmethod
    def parse_command(cls, message: str) -> dict:
        """
        Parse un message pour détecter une commande
        """
        import re
        message_lower = message.lower()
        
        for cmd_name, cmd_data in cls.COMMANDS.items():
            # Vérifier si tous les patterns sont présents
            all_match = all(
                re.search(pattern, message_lower)
                for pattern in cmd_data['patterns']
            )
            
            if all_match:
                return {
                    "command": cmd_name,
                    "action": cmd_data['action'],
                    "original": message
                }
        
        return None
    
    @classmethod
    def execute_command(cls, command_data: dict) -> dict:
        """
        Exécute une commande détectée
        """
        action = command_data['action']
        original = command_data['original']
        
        if action == "configure_project":
            return cls._handle_configure(original)
        elif action == "scan_project":
            return cls._handle_scan(original)
        elif action == "list_projects":
            return OMIAProjectConfig.list_projects()
        elif action == "discover_ecosystem":
            return cls._handle_discover(original)
        
        return {"error": "Action inconnue"}
    
    @classmethod
    def _handle_configure(cls, message: str) -> dict:
        """
        Exemples:
        - "configure projet electron_app"
        - "utilise le dossier electron_app"
        - "change vers omia_brain"
        """
        # Extraire le nom du projet
        words = message.lower().split()
        
        # Chercher après des mots-clés
        keywords = ['projet', 'dossier', 'vers', 'use', 'switch']
        for i, word in enumerate(words):
            if word in keywords and i + 1 < len(words):
                project_name = words[i + 1]
                return OMIAProjectConfig.set_current_project(project_name)
        
        # Si pas trouvé, lister les projets disponibles
        return {
            "message": "Quel projet voulez-vous activer ?",
            "projects": OMIAProjectConfig.list_projects()
        }
    
    @classmethod
    def _handle_scan(cls, message: str) -> dict:
        """Scan le projet actuel"""
        project_path = OMIAProjectConfig.get_current_project_path()
        diagnosis = ElectronBuildFixer.diagnose_project(project_path)
        
        config = OMIAProjectConfig.load_config()
        current_name = config.get('current_project', 'inconnu')
        
        diagnosis['project_name'] = current_name
        diagnosis['project_path'] = project_path
        
        return diagnosis
    
    @classmethod
    def _handle_discover(cls, message: str) -> dict:
        """Découverte automatique de l'écosystème"""
        # Extraire le chemin si mentionné
        import re
        path_match = re.search(r'dans\s+([^\s]+)', message)
        root = path_match.group(1) if path_match else '.'
        
        discovery = OMIAProjectConfig.discover_ecosystem(root)
        
        # Auto-ajouter les projets découverts si demandé
        if "ajoute" in message.lower() or "add" in message.lower():
            config = OMIAProjectConfig.load_config()
            for proj in discovery['discovered']:
                proj_name = f"{proj['type']}_{proj['path'].replace('/', '_')}"
                if proj_name not in config['projects']:
                    OMIAProjectConfig.add_project(
                        proj_name,
                        proj['path'],
                        f"Auto-découvert: {proj['type']}"
                    )
            
            discovery['auto_added'] = True
        
        return discovery


# ============================================================================
# ROUTES API
# ============================================================================

@app.route('/project/config', methods=['GET'])
def get_project_config():
    """Récupère la configuration actuelle"""
    try:
        config = OMIAProjectConfig.load_config()
        return jsonify(config)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/project/set', methods=['POST'])
def set_project():
    """Change le projet actif"""
    try:
        data = request.json
        project_name = data.get('project_name')
        
        if not project_name:
            return jsonify({"error": "project_name requis"}), 400
        
        result = OMIAProjectConfig.set_current_project(project_name)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/project/add', methods=['POST'])
def add_project():
    """Ajoute un projet à l'écosystème"""
    try:
        data = request.json
        name = data.get('name')
        path = data.get('path')
        description = data.get('description', '')
        
        if not name or not path:
            return jsonify({"error": "name et path requis"}), 400
        
        result = OMIAProjectConfig.add_project(name, path, description)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/project/list', methods=['GET'])
def list_projects():
    """Liste tous les projets"""
    try:
        result = OMIAProjectConfig.list_projects()
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/project/discover', methods=['POST'])
def discover_projects():
    """Découverte automatique de l'écosystème"""
    try:
        data = request.json or {}
        root = data.get('root', '.')
        
        result = OMIAProjectConfig.discover_ecosystem(root)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================================
# MODIFICATION DE LA ROUTE /chat POUR DÉTECTER LES COMMANDES
# ============================================================================

# Dans la fonction chat(), AJOUTER au début (après data = request.json) :

"""
# Détecter commandes spéciales
command = OMIAChatCommands.parse_command(message)

if command:
    result = OMIAChatCommands.execute_command(command)
    
    # Formater réponse
    if command['action'] == 'list_projects':
        response_text = "📁 **PROJETS DE L'ÉCOSYSTÈME**\n\n"
        response_text += f"🌍 Racine: {result['ecosystem_root']}\n"
        response_text += f"🎯 Projet actif: **{result['current_project']}**\n\n"
        
        for proj in result['projects']:
            status = "✅" if proj['is_current'] else "⚪"
            exists = "📂" if proj['exists'] else "❌"
            response_text += f"{status} {exists} **{proj['name']}**\n"
            response_text += f"   📍 {proj['path']}\n"
            response_text += f"   ℹ️  {proj['description']}\n\n"
    
    elif command['action'] == 'scan_project':
        response_text = f"🔍 **SCAN: {result.get('project_name', 'Projet')}**\n\n"
        response_text += f"📊 Score: **{result['health_score']}/100**\n"
        response_text += f"🔴 Problèmes: **{result['issues_found']}**\n\n"
        
        for i, issue in enumerate(result.get('issues', [])[:5], 1):
            response_text += f"{i}. [{issue['severity']}] {issue['issue']}\n"
    
    elif command['action'] == 'discover_ecosystem':
        response_text = f"🔍 **DÉCOUVERTE ÉCOSYSTÈME**\n\n"
        response_text += f"📂 Racine: {result['root']}\n"
        response_text += f"✨ Projets trouvés: **{result['count']}**\n\n"
        
        for proj in result['discovered']:
            confidence = int(proj['confidence'] * 100)
            response_text += f"🎯 **{proj['type']}** ({confidence}% confiance)\n"
            response_text += f"   📍 {proj['path']}\n"
            response_text += f"   📄 {', '.join(proj['detected_files'])}\n\n"
    
    else:
        response_text = json.dumps(result, indent=2)
    
    history.append({"role": "assistant", "content": response_text})
    omia.sessions[session_id] = history
    omia.save_json(SESSIONS_FILE, omia.sessions)
    
    return jsonify({
        "response": response_text,
        "command_executed": command['command'],
        "result": result
    })

# Sinon continuer le chat normal...
"""
# ============================================================================
# INTÉGRATION DANS LES ROUTES
# ============================================================================

# AJOUTER CES ROUTES DANS LA SECTION "# === ROUTES API ===" de launcher.py

"""
@app.route('/electron/diagnose', methods=['POST'])
def electron_diagnose():
    '''Diagnostique le projet Electron'''
    try:
        data = request.json
        project_root = data.get('project_root', '.')
        
        diagnosis = ElectronBuildFixer.diagnose_project(project_root)
        return jsonify(diagnosis)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/electron/fix', methods=['POST'])
def electron_fix():
    '''Applique corrections automatiques'''
    try:
        data = request.json
        project_root = data.get('project_root', '.')
        fix_type = data.get('fix_type', 'all')
        
        result = ElectronBuildFixer.auto_fix(project_root, fix_type)
        
        # Cristalliser cette correction
        ElectronMemoryManager.add_electron_sediment(
            "build_config",
            f"fix_{fix_type}",
            {
                "fixes": result['fixes_applied'],
                "success": True
            }
        )
        
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/electron/convert-paths', methods='POST'])
def electron_convert_paths():
    '''Convertit chemins relatifs vers app:// dans un fichier'''
    try:
        data = request.json
        file_path = data.get('file_path')
        
        if not file_path:
            return jsonify({"error": "file_path requis"}), 400
        
        result = ElectronBuildFixer.convert_paths_to_protocol(file_path)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/omia/add-skill', methods=['POST'])
def omia_add_skill():
    '''Permet à OMIA d'ajouter un skill à son propre code'''
    try:
        data = request.json
        skill_code = data.get('skill_code')
        skill_name = data.get('skill_name')
        
        if not skill_code or not skill_name:
            return jsonify({"error": "skill_code et skill_name requis"}), 400
        
        result = OMIASelfUpdater.add_skill_to_launcher(skill_code, skill_name)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
"""
# === RÉPONSES SIMULÉES ===
def get_simulated_response(message: str) -> str:
    msg = message.lower()
    
    if any(word in msg for word in ["concept", "principe"]):
        return "Un concept est une représentation abstraite. En architecture logicielle, on parle de séparation des responsabilités : chaque composant a une fonction unique."
    
    if "?" in msg:
        return f"Question intéressante. En mode simulation, OMIA analyse votre vibration mais ses capacités sont limitées. Activez Ollama (llama3.2) pour des réponses complètes."
    
    return "Message reçu. Le moteur de fulgurance analyse votre vibration."

# === ROUTES API ===

@app.route('/')
def index():
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>OMIA - Backend</title>
        <meta charset="utf-8">
    </head>
    <body style="background: #0f0f0f; color: white; font-family: monospace; padding: 40px; text-align: center;">
        <h1>🤖 OMIA - Backend Actif</h1>
        <p>Ouvrez <strong>OMia.html</strong> dans votre navigateur</p>
        <p style="margin-top: 30px; color: #10a37f;">✅ API Ready sur port 5000</p>
    </body>
    </html>
    """

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "online",
        "mode": "simulation" if USE_SIMULATION else "real",
        "fulgurance_engine": "active",
        "autonomous": True
    })

@app.route('/chat', methods=['POST'])
def chat():
    try:
        data = request.json
        message = data.get('message', '')
        session_id = data.get('session_id', 'default')
        
        history = omia.sessions.get(session_id, [])
        history.append({"role": "user", "content": message})
        
        # Génération réponse
        if USE_SIMULATION:
            assistant_message = get_simulated_response(message)
        else:
            try:
                response = ollama.chat(model=MODEL, messages=history[-10:])
                assistant_message = response['message']['content']
            except:
                assistant_message = "Erreur IA - mode simulation activé"
        
        history.append({"role": "assistant", "content": assistant_message})
        
        # Analyse fulgurance
        fulgurance_analysis = FulguranceEngine.analyze_vibration(message, assistant_message)
        
        if fulgurance_analysis['is_fulgurance']:
            fulgurance = {
                "timestamp": datetime.now().isoformat(),
                "input": message[:200],
                "response": fulgurance_analysis['extract'],
                "score": fulgurance_analysis['score'],
                "category": fulgurance_analysis['category'],
                "patterns": fulgurance_analysis['patterns'],
                "crystallized": False
            }
            omia.fulgurances.append(fulgurance)
            omia.save_json(FULGURANCES_FILE, omia.fulgurances)
        
        omia.sessions[session_id] = history
        omia.save_json(SESSIONS_FILE, omia.sessions)
        
        return jsonify({
            "response": assistant_message,
            "training": fulgurance_analysis['is_fulgurance'],
            "fulgurance": fulgurance_analysis if fulgurance_analysis['is_fulgurance'] else None
        })
        
    except Exception as e:
        print(f"Erreur chat: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/fulgurances', methods=['GET'])
def get_fulgurances():
    pending = [f for f in omia.fulgurances if not f.get('crystallized', False)]
    return jsonify(pending)

@app.route('/fulgurances/crystallize/<int:index>', methods=['POST'])
def crystallize_fulgurance(index):
    try:
        if index < 0 or index >= len(omia.fulgurances):
            return jsonify({"error": "Index invalide"}), 400
        
        fulgurance = omia.fulgurances[index]
        
        if fulgurance.get('crystallized'):
            return jsonify({"already_done": True, "message": "Déjà cristallisée"}), 200
        
        sediment = {
            "timestamp": datetime.now().isoformat(),
            "data": fulgurance['response'],
            "category": fulgurance['category'],
            "score": fulgurance['score'],
            "source": "fulgurance_auto"
        }
        
        omia.sediments.append(sediment)
        omia.save_json(SEDIMENTS_FILE, omia.sediments)
        
        omia.fulgurances[index]['crystallized'] = True
        omia.save_json(FULGURANCES_FILE, omia.fulgurances)
        
        return jsonify({"success": True, "message": "Cristallisation réussie", "sediment": sediment})
        
    except Exception as e:
        print(f"Erreur cristallisation: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/sediments', methods=['GET'])
def get_sediments():
    return jsonify(omia.sediments)

@app.route('/stats', methods=['GET'])
def get_stats():
    total_messages = sum(len(s) for s in omia.sessions.values())
    pending_fulgurances = len([f for f in omia.fulgurances if not f.get('crystallized', False)])
    
    return jsonify({
        "sessions": len(omia.sessions),
        "messages": total_messages,
        "rules": len(omia.rules["core"]) + len(omia.rules["learned"]),
        "sediments": len(omia.sediments),
        "fulgurances_pending": pending_fulgurances,
        "fulgurances_total": len(omia.fulgurances)
    })

@app.route('/export', methods=['GET'])
def export_data():
    return jsonify({
        "export_date": datetime.now().isoformat(),
        "sessions": omia.sessions,
        "rules": omia.rules,
        "sediments": omia.sediments,
        "fulgurances": omia.fulgurances
    })

@app.route('/data/verify', methods=['GET'])
def verify_data():
    return jsonify({
        "status": "ok",
        "details": {
            "sediments_total": len(omia.sediments),
            "fulgurances_total": len(omia.fulgurances),
            "fulgurances_pending": len([f for f in omia.fulgurances if not f.get('crystallized', False)])
        }
    })
# === ROUTES API ELECTRON (OMIA) ===

@app.route('/electron/diagnose', methods=['POST'])
def electron_diagnose():
    """Diagnostique complet du projet Electron"""
    try:
        data = request.json
        project_root = data.get('project_root', '.')
        
        diagnosis = ElectronBuildFixer.diagnose_project(project_root)
        
        return jsonify(diagnosis)
        
    except Exception as e:
        print(f"Erreur diagnostic Electron: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/electron/fix', methods=['POST'])
def electron_fix():
    """Applique corrections automatiques Electron"""
    try:
        data = request.json
        project_root = data.get('project_root', '.')
        fix_type = data.get('fix_type', 'all')
        
        result = ElectronBuildFixer.auto_fix(project_root, fix_type)
        
        # Cristalliser cette correction dans la mémoire
        ElectronMemoryManager.add_electron_sediment(
            "build_config",
            f"fix_{fix_type}_{datetime.now().strftime('%Y%m%d')}",
            {
                "fixes": result['fixes_applied'],
                "success": True,
                "project": project_root
            }
        )
        
        return jsonify(result)
        
    except Exception as e:
        print(f"Erreur fix Electron: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/electron/convert-paths', methods=['POST'])
def electron_convert_paths():
    """Convertit chemins relatifs vers app:// dans un fichier"""
    try:
        data = request.json
        file_path = data.get('file_path')
        
        if not file_path:
            return jsonify({"error": "file_path requis"}), 400
        
        result = ElectronBuildFixer.convert_paths_to_protocol(file_path)
        
        if result.get('success'):
            # Cristalliser
            ElectronMemoryManager.add_electron_sediment(
                "icon_system",
                f"path_conversion_{Path(file_path).name}",
                {
                    "file": file_path,
                    "converted": True
                }
            )
        
        return jsonify(result)
        
    except Exception as e:
        print(f"Erreur conversion paths: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/omia/self-update', methods=['POST'])
def omia_self_update():
    """Permet à OMIA d'ajouter du code à launcher.py"""
    try:
        data = request.json
        code = data.get('code')
        location = data.get('location', 'after_fulgurance')
        
        if not code:
            return jsonify({"error": "code requis"}), 400
        
        result = OMIASelfUpdater.inject_code_block(code, location)
        
        return jsonify(result)
        
    except Exception as e:
        print(f"Erreur self-update: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/omia/add-skill', methods=['POST'])
def omia_add_skill():
    """Ajoute un nouveau skill à launcher.py"""
    try:
        data = request.json
        skill_code = data.get('skill_code')
        skill_name = data.get('skill_name')
        
        if not skill_code or not skill_name:
            return jsonify({"error": "skill_code et skill_name requis"}), 400
        
        result = OMIASelfUpdater.add_skill_to_launcher(skill_code, skill_name)
        
        return jsonify(result)
        
    except Exception as e:
        print(f"Erreur add-skill: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/electron/memory', methods=['GET'])
def electron_memory():
    """Récupère la mémoire Electron d'OMIA"""
    try:
        memory = {}
        
        for domain in ElectronMemoryManager.ELECTRON_DOMAINS.keys():
            memory_file = Path("znk_data") / f"electron_{domain}.json"
            
            if memory_file.exists():
                memory[domain] = json.loads(memory_file.read_text())
            else:
                memory[domain] = {"sediments": []}
        
        return jsonify(memory)
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500
# === DÉMARRAGE ===
if __name__ == '__main__':
    print("""
    ╔════════════════════════════════════╗
    ║    💎 OMIA - FULGURANCE ENGINE     ║
    ╚════════════════════════════════════╝
    """)
    
    print(f"📂 Données: {DATA_DIR.absolute()}")
    print(f"💾 Sessions: {len(omia.sessions)}")
    print(f"💎 Sédiments: {len(omia.sediments)}")
    print(f"⚡ Fulgurances: {len(omia.fulgurances)}")
    print(f"⚙️  Mode: {'Simulation' if USE_SIMULATION else 'Réel (Ollama)'}")
    print(f"🎯 Seuil cristallisation: {FulguranceEngine.CRYSTALLIZATION_THRESHOLD}")
    print(f"\n🚀 Serveur: http://localhost:5000")
    print("🌐 Lancez OMia.html dans votre navigateur\n")
    
    app.run(host='0.0.0.0', port=5000, debug=False)
