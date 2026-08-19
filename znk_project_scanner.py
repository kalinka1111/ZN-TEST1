#!/usr/bin/env python3
"""
ZNK237-APP Scanner & Auto-Fix
Scanne le projet, détecte les problèmes et propose des corrections automatiques
"""

import os
import json
import shutil
from pathlib import Path
from datetime import datetime

class ZNK237Scanner:
    def __init__(self, project_root="."):
        self.root = Path(project_root)
        self.issues = []
        self.files_found = {}
        self.config = {}
        
    def scan_complete(self):
        """Scan complet du projet ZNK237-APP"""
        print("🔍 SCAN COMPLET DE ZNK237-APP")
        print("=" * 60)
        
        # 1. Vérifier structure de base
        self.check_structure()
        
        # 2. Analyser système d'authentification
        self.check_auth_system()
        
        # 3. Vérifier dashboards
        self.check_dashboards()
        
        # 4. Analyser configuration Electron
        self.check_electron_config()
        
        # 5. Vérifier dossier vidéos
        self.check_videos_folder()
        
        # 6. Analyser backend/base de données
        self.check_backend()
        
        # Générer rapport
        self.generate_report()
        
        return self.issues
    
    def check_structure(self):
        """Vérifier la structure des dossiers"""
        print("\n📂 Vérification structure...")
        
        required_folders = [
            'modules', 'modules-admin', 'assets', 'electron', 
            'backend', 'frontend', 'datas', 'server'
        ]
        
        for folder in required_folders:
            path = self.root / folder
            if path.exists():
                print(f"  ✅ {folder}/ trouvé")
                self.files_found[folder] = True
            else:
                print(f"  ❌ {folder}/ MANQUANT")
                self.issues.append({
                    'type': 'missing_folder',
                    'severity': 'error',
                    'path': folder,
                    'message': f"Dossier {folder}/ manquant",
                    'fix': f"Créer le dossier {folder}/"
                })
    
    def check_auth_system(self):
        """Analyser le système d'authentification"""
        print("\n🔐 Analyse système d'authentification...")
        
        auth_files = {
            'auth-hub.html': 'Page de connexion',
            'inscription.html': 'Page d\'inscription',
        }
        
        auth_found = False
        for file, desc in auth_files.items():
            path = self.root / file
            if path.exists():
                print(f"  ✅ {file} trouvé ({desc})")
                auth_found = True
                
                # Analyser le contenu
                content = path.read_text(encoding='utf-8', errors='ignore')
                
                # Vérifier s'il y a un système de création de compte
                if 'function' in content and ('createUser' in content or 'register' in content):
                    print(f"    ✓ Fonction de création détectée dans {file}")
                else:
                    print(f"    ⚠️  Pas de fonction de création dans {file}")
                    self.issues.append({
                        'type': 'auth_incomplete',
                        'severity': 'warning',
                        'file': file,
                        'message': 'Système de création utilisateur incomplet',
                        'fix': 'Ajouter fonction createUser() ou register()'
                    })
        
        if not auth_found:
            self.issues.append({
                'type': 'auth_missing',
                'severity': 'critical',
                'message': 'Système d\'authentification introuvable',
                'fix': 'Créer auth-hub.html avec système de login/register'
            })
    
    def check_dashboards(self):
        """Vérifier les dashboards"""
        print("\n📊 Vérification dashboards...")
        
        dashboards = {
            'ZNKvisiteurDash.html': 'visiteur',
            'ZNKMembresDash.html': 'membre',
            'ZNKartEtudesDash.html': 'etudes',
            'ZNKadminDash.html': 'admin/studio'
        }
        
        for file, role in dashboards.items():
            path = self.root / file
            if path.exists():
                print(f"  ✅ Dashboard {role}: {file}")
            else:
                print(f"  ❌ Dashboard {role}: MANQUANT")
                self.issues.append({
                    'type': 'missing_dashboard',
                    'severity': 'error',
                    'file': file,
                    'role': role,
                    'message': f'Dashboard {role} manquant',
                    'fix': f'Créer {file}'
                })
    
    def check_electron_config(self):
        """Vérifier configuration Electron"""
        print("\n⚡ Analyse configuration Electron...")
        
        electron_files = {
            'electron/package.json': 'Configuration Electron',
            'electron/preload.js': 'Script preload',
            'electron/znk-electron-bridge.js': 'Bridge Electron'
        }
        
        for file, desc in electron_files.items():
            path = self.root / file
            if path.exists():
                print(f"  ✅ {desc}: {file}")
                
                if file.endswith('package.json'):
                    try:
                        with open(path, 'r', encoding='utf-8') as f:
                            pkg = json.load(f)
                            print(f"    📦 Nom: {pkg.get('name', 'N/A')}")
                            print(f"    📦 Version: {pkg.get('version', 'N/A')}")
                            
                            # Vérifier main entry
                            if 'main' not in pkg:
                                self.issues.append({
                                    'type': 'electron_config',
                                    'severity': 'error',
                                    'file': file,
                                    'message': 'Pas de "main" dans package.json',
                                    'fix': 'Ajouter "main": "main.js" dans package.json'
                                })
                    except Exception as e:
                        print(f"    ⚠️  Erreur lecture: {e}")
            else:
                print(f"  ❌ {desc}: MANQUANT")
                self.issues.append({
                    'type': 'electron_missing',
                    'severity': 'error',
                    'file': file,
                    'message': f'{desc} manquant',
                    'fix': f'Créer {file}'
                })
    
    def check_videos_folder(self):
        """Vérifier dossier vidéos et assets"""
        print("\n🎥 Vérification dossier vidéos...")
        
        video_paths = [
            'assets/videos',
            'assets',
            'videos'
        ]
        
        video_folder_found = False
        for vpath in video_paths:
            path = self.root / vpath
            if path.exists():
                print(f"  ✅ {vpath}/ trouvé")
                video_folder_found = True
                
                # Lister vidéos
                videos = list(path.glob('**/*.mp4')) + list(path.glob('**/*.webm')) + list(path.glob('**/*.mov'))
                if videos:
                    print(f"    📹 {len(videos)} vidéo(s) trouvée(s)")
                    for video in videos[:5]:  # Afficher max 5
                        print(f"      • {video.name}")
                else:
                    print(f"    ⚠️  Aucune vidéo trouvée dans {vpath}/")
                    self.issues.append({
                        'type': 'no_videos',
                        'severity': 'warning',
                        'path': vpath,
                        'message': 'Dossier vidéos vide',
                        'fix': 'Ajouter vidéos persistantes avant build'
                    })
        
        if not video_folder_found:
            self.issues.append({
                'type': 'videos_folder_missing',
                'severity': 'error',
                'message': 'Dossier vidéos introuvable',
                'fix': 'Créer assets/videos/ et y placer les vidéos'
            })
    
    def check_backend(self):
        """Vérifier backend et base de données"""
        print("\n💾 Analyse backend/base de données...")
        
        backend_paths = [
            'backend',
            'server',
            'datas'
        ]
        
        for bpath in backend_paths:
            path = self.root / bpath
            if path.exists():
                print(f"  ✅ {bpath}/ trouvé")
                
                # Chercher fichiers de config
                configs = list(path.glob('**/*.json'))
                db_files = list(path.glob('**/*.db')) + list(path.glob('**/*.sqlite'))
                
                if configs:
                    print(f"    📄 {len(configs)} fichier(s) config")
                if db_files:
                    print(f"    💾 {len(db_files)} base(s) de données")
                    
                    # Vérifier si BDD contient des users
                    for db_file in db_files:
                        print(f"      • {db_file.name}")
                else:
                    print(f"    ⚠️  Pas de base de données trouvée")
                    self.issues.append({
                        'type': 'no_database',
                        'severity': 'warning',
                        'path': bpath,
                        'message': 'Aucune base de données détectée',
                        'fix': 'Créer base de données users.db avec table users'
                    })
    
    def generate_report(self):
        """Générer rapport final"""
        print("\n" + "=" * 60)
        print("📊 RAPPORT FINAL")
        print("=" * 60)
        
        if not self.issues:
            print("✅ Aucun problème détecté ! Projet OK.")
            return
        
        # Compter par sévérité
        critical = [i for i in self.issues if i.get('severity') == 'critical']
        errors = [i for i in self.issues if i.get('severity') == 'error']
        warnings = [i for i in self.issues if i.get('severity') == 'warning']
        
        print(f"\n🔴 Critique: {len(critical)}")
        print(f"🟠 Erreurs: {len(errors)}")
        print(f"🟡 Avertissements: {len(warnings)}")
        print(f"📊 Total: {len(self.issues)} problèmes")
        
        print("\n📋 DÉTAILS DES PROBLÈMES:\n")
        for i, issue in enumerate(self.issues, 1):
            severity_icon = {
                'critical': '🔴',
                'error': '🟠',
                'warning': '🟡'
            }.get(issue['severity'], '⚪')
            
            print(f"{i}. {severity_icon} [{issue['type']}] {issue['message']}")
            print(f"   💡 Fix: {issue['fix']}")
            if 'file' in issue:
                print(f"   📄 Fichier: {issue['file']}")
            print()
    
    def export_report(self, output_file='znk237_scan_report.json'):
        """Exporter rapport en JSON"""
        report = {
            'timestamp': datetime.now().isoformat(),
            'project_root': str(self.root),
            'total_issues': len(self.issues),
            'issues': self.issues,
            'files_found': self.files_found
        }
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        
        print(f"\n💾 Rapport exporté: {output_file}")


class ZNK237AutoFix:
    """Correctifs automatiques pour ZNK237-APP"""
    
    def __init__(self, project_root="."):
        self.root = Path(project_root)
        self.fixes_applied = []
    
    def create_user_management_system(self):
        """Créer système complet de gestion utilisateurs"""
        print("\n🔧 Création système de gestion utilisateurs...")
        
        # Créer dossier datas si nécessaire
        datas_dir = self.root / 'datas'
        datas_dir.mkdir(exist_ok=True)
        
        # Créer fichier users.json
        users_file = datas_dir / 'users.json'
        if not users_file.exists():
            initial_users = {
                "users": [
                    {
                        "id": "admin_001",
                        "username": "admin",
                        "email": "admin@znk237.com",
                        "password": "ZNK237_Admin_2024",  # À hasher en production
                        "role": "admin",
                        "status": "admin",
                        "dashboards": ["visitor", "membre", "etudes", "studio"],
                        "createdAt": datetime.now().isoformat(),
                        "active": True
                    }
                ],
                "roles": {
                    "visiteur": {"level": 1, "dashboards": ["visitor"]},
                    "membre": {"level": 2, "dashboards": ["visitor", "membre"]},
                    "etudes": {"level": 3, "dashboards": ["visitor", "membre", "etudes"]},
                    "admin": {"level": 4, "dashboards": ["visitor", "membre", "etudes", "studio"]}
                }
            }
            
            with open(users_file, 'w', encoding='utf-8') as f:
                json.dump(initial_users, f, indent=2, ensure_ascii=False)
            
            print(f"  ✅ {users_file} créé avec compte admin")
            self.fixes_applied.append(f"Créé {users_file}")
        else:
            print(f"  ⚠️  {users_file} existe déjà")
    
    def create_video_config(self):
        """Créer configuration vidéos persistantes"""
        print("\n🎥 Configuration vidéos persistantes...")
        
        # Créer dossier assets/videos
        videos_dir = self.root / 'assets' / 'videos'
        videos_dir.mkdir(parents=True, exist_ok=True)
        
        # Créer fichier de configuration
        config_file = self.root / 'assets' / 'videos-config.json'
        
        video_config = {
            "videos": [
                {
                    "id": "intro_znk",
                    "title": "Introduction ZNK237",
                    "path": "./assets/videos/intro.mp4",
                    "dashboard": "visiteur",
                    "category": "tutorial",
                    "persistent": True,
                    "autoplay": False
                }
            ],
            "settings": {
                "format": "mp4",
                "quality": "1080p",
                "location": "./assets/videos/",
                "preload": True
            }
        }
        
        with open(config_file, 'w', encoding='utf-8') as f:
            json.dump(video_config, f, indent=2, ensure_ascii=False)
        
        print(f"  ✅ {config_file} créé")
        print(f"  📁 Placez vos vidéos dans: {videos_dir}")
        self.fixes_applied.append(f"Créé {config_file}")
    
    def fix_electron_package(self):
        """Corriger configuration Electron"""
        print("\n⚡ Correction configuration Electron...")
        
        electron_dir = self.root / 'electron'
        pkg_file = electron_dir / 'package.json'
        
        if pkg_file.exists():
            with open(pkg_file, 'r', encoding='utf-8') as f:
                pkg = json.load(f)
            
            # Vérifier/ajouter main entry
            if 'main' not in pkg:
                pkg['main'] = 'main.js'
                print("  ✅ Ajouté 'main': 'main.js'")
            
            # Vérifier build config
            if 'build' not in pkg:
                pkg['build'] = {
                    "appId": "com.znk237.app",
                    "productName": "ZNK237-APP",
                    "directories": {
                        "output": "dist"
                    },
                    "files": [
                        "**/*",
                        "!**/*.map",
                        "../assets/**/*"
                    ],
                    "extraResources": [
                        {
                            "from": "../assets/videos",
                            "to": "assets/videos"
                        }
                    ]
                }
                print("  ✅ Configuration build ajoutée")
            
            with open(pkg_file, 'w', encoding='utf-8') as f:
                json.dump(pkg, f, indent=2, ensure_ascii=False)
            
            self.fixes_applied.append("Configuration Electron corrigée")
        else:
            print(f"  ⚠️  {pkg_file} introuvable")
    
    def create_auth_functions(self):
        """Créer fichier JS avec fonctions auth"""
        print("\n🔐 Création fonctions d'authentification...")
        
        js_dir = self.root / 'js'
        js_dir.mkdir(exist_ok=True)
        
        auth_js_file = js_dir / 'auth-manager.js'
        
        auth_js_content = '''
// ZNK237 Auth Manager
class AuthManager {
    constructor() {
        this.usersFile = './datas/users.json';
        this.currentUser = null;
    }
    
    async loadUsers() {
        try {
            const response = await fetch(this.usersFile);
            const data = await response.json();
            return data.users || [];
        } catch (error) {
            console.error('Erreur chargement users:', error);
            return [];
        }
    }
    
    async login(email, password) {
        const users = await this.loadUsers();
        const user = users.find(u => u.email === email && u.password === password);
        
        if (user && user.active) {
            this.currentUser = user;
            localStorage.setItem('znk_user', JSON.stringify(user));
            return { success: true, user };
        }
        
        return { success: false, error: 'Identifiants invalides' };
    }
    
    async register(userData) {
        const users = await this.loadUsers();
        
        // Vérifier si email existe
        if (users.find(u => u.email === userData.email)) {
            return { success: false, error: 'Email déjà utilisé' };
        }
        
        const newUser = {
            id: `user_${Date.now()}`,
            username: userData.username,
            email: userData.email,
            password: userData.password, // À hasher en production !
            role: userData.role || 'visiteur',
            status: 'visiteur',
            dashboards: ['visitor'],
            createdAt: new Date().toISOString(),
            active: true
        };
        
        // Dans une vraie app, sauvegarder via backend
        console.log('Nouvel utilisateur créé:', newUser);
        
        return { success: true, user: newUser };
    }
    
    logout() {
        this.currentUser = null;
        localStorage.removeItem('znk_user');
    }
    
    getCurrentUser() {
        if (!this.currentUser) {
            const stored = localStorage.getItem('znk_user');
            if (stored) {
                this.currentUser = JSON.parse(stored);
            }
        }
        return this.currentUser;
    }
    
    redirectToDashboard(user) {
        const dashboards = {
            'visiteur': 'ZNKvisiteurDash.html',
            'membre': 'ZNKMembresDash.html',
            'etudes': 'ZNKartEtudesDash.html',
            'admin': 'ZNKadminDash.html'
        };
        
        window.location.href = dashboards[user.status] || 'ZNKvisiteurDash.html';
    }
}

// Instance globale
const authManager = new AuthManager();
'''
        
        with open(auth_js_file, 'w', encoding='utf-8') as f:
            f.write(auth_js_content)
        
        print(f"  ✅ {auth_js_file} créé")
        self.fixes_applied.append(f"Créé {auth_js_file}")
    
    def apply_all_fixes(self):
        """Appliquer toutes les corrections"""
        print("\n🚀 APPLICATION DES CORRECTIONS AUTOMATIQUES")
        print("=" * 60)
        
        self.create_user_management_system()
        self.create_video_config()
        self.fix_electron_package()
        self.create_auth_functions()
        
        print("\n✅ CORRECTIONS TERMINÉES")
        print(f"📊 {len(self.fixes_applied)} corrections appliquées:")
        for fix in self.fixes_applied:
            print(f"  • {fix}")
        
        return self.fixes_applied


def main():
    """Fonction principale"""
    import sys
    
    project_root = sys.argv[1] if len(sys.argv) > 1 else "."
    
    print("🚀 ZNK237-APP Scanner & Auto-Fix")
    print(f"📂 Projet: {Path(project_root).resolve()}")
    print()
    
    # Scanner
    scanner = ZNK237Scanner(project_root)
    issues = scanner.scan_complete()
    scanner.export_report()
    
    # Proposer corrections
    if issues:
        print("\n❓ Voulez-vous appliquer les corrections automatiques ? (o/n)")
        response = input().lower()
        
        if response == 'o':
            fixer = ZNK237AutoFix(project_root)
            fixer.apply_all_fixes()
            
            print("\n🎯 PROCHAINES ÉTAPES:")
            print("1. Placez vos vidéos dans ./assets/videos/")
            print("2. Testez le login avec: admin@znk237.com / ZNK237_Admin_2024")
            print("3. CHANGEZ le mot de passe admin immédiatement")
            print("4. Lancez: npm run build (dans ./electron/)")
        else:
            print("\n⏭️  Corrections non appliquées")
    else:
        print("\n✅ Projet OK - Prêt pour le build !")


if __name__ == '__main__':
    main()
