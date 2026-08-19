#!/usr/bin/env python3
"""
ZNKapp Terminal Manager
Mini application terminal pour gérer votre volume ZNKapp
Version étendue avec diagnostics XAMPP/Apache
"""

import os
import sys
import subprocess
import json
import glob
import psutil
from pathlib import Path
from typing import List, Dict, Optional

class ZNKappTerminal:
    def __init__(self):
        self.base_path = Path("ZNKapp")
        self.apps_path = self.base_path / "applications"
        self.current_path = self.base_path
        self.ensure_structure()
    
    def ensure_structure(self):
        """Créer la structure de base si elle n'existe pas"""
        self.base_path.mkdir(exist_ok=True)
        self.apps_path.mkdir(exist_ok=True)
        
        # Créer d'autres dossiers utiles
        (self.base_path / "backups").mkdir(exist_ok=True)
        (self.base_path / "logs").mkdir(exist_ok=True)
        (self.base_path / "config").mkdir(exist_ok=True)
    
    def show_banner(self):
        """Afficher le banner de l'application"""
        print("\n" + "="*50)
        print("    ZNKapp Terminal Manager v2.0")
        print("    Gestionnaire de volume ZNKapp")
        print("    + Diagnostics XAMPP/Apache")
        print("="*50)
        print(f"Volume: {self.base_path.absolute()}")
        print(f"Applications: {self.apps_path.absolute()}")
        print("="*50 + "\n")
    
    def show_help(self):
        """Afficher l'aide des commandes"""
        help_text = """
COMMANDES DISPONIBLES:
═══════════════════════

📁 NAVIGATION & FICHIERS:
  ls [path]           - Lister les fichiers/dossiers
  cd <path>           - Changer de répertoire
  pwd                 - Afficher le répertoire courant
  mkdir <name>        - Créer un dossier
  rmdir <name>        - Supprimer un dossier vide
  rm <file>           - Supprimer un fichier
  cp <src> <dest>     - Copier un fichier
  mv <src> <dest>     - Déplacer/renommer un fichier
  
🚀 APPLICATIONS:
  newapp <name>       - Créer une nouvelle application
  listapps            - Lister toutes les applications
  runapp <name>       - Lancer une application
  appinfo <name>      - Informations sur une application
  
🔧 DÉVELOPPEMENT:
  serve <port>        - Serveur HTTP local (défaut: 8000)
  git <cmd>           - Commandes Git
  npm <cmd>           - Commandes NPM
  python <script>     - Exécuter un script Python
  
🌐 XAMPP/APACHE DIAGNOSTICS:
  findhtdocs          - Localiser tous les dossiers htdocs
  checkhtdocs         - Vérifier le contenu du htdocs ZNKapp
  findindex           - Chercher tous les index.php
  checkxampp          - Vérifier les processus XAMPP actifs
  checkapache         - Vérifier les processus Apache (port 80)
  findconfig          - Localiser les fichiers httpd.conf
  checkdocroot        - Vérifier le DocumentRoot d'Apache
  xamppstatus         - Statut complet XAMPP
  
📊 SYSTÈME:
  status              - Statut du volume
  backup              - Créer une sauvegarde
  logs                - Voir les logs
  config              - Configuration
  
❓ AIDE:
  help                - Afficher cette aide
  exit/quit           - Quitter l'application
        """
        print(help_text)
    
    def find_htdocs(self):
        """Localiser tous les dossiers htdocs"""
        print("\n🔍 RECHERCHE DES DOSSIERS HTDOCS:")
        print("-" * 50)
        
        # Chercher dans les répertoires courants
        search_paths = [
            Path.home(),
            Path("/Applications"),
            Path("/opt"),
            Path("/usr/local"),
            self.base_path
        ]
        
        found_htdocs = []
        
        for search_path in search_paths:
            if search_path.exists():
                try:
                    for htdocs_path in search_path.rglob("htdocs"):
                        if htdocs_path.is_dir():
                            found_htdocs.append(htdocs_path)
                            print(f"📁 {htdocs_path}")
                except PermissionError:
                    continue
        
        if not found_htdocs:
            print("❌ Aucun dossier htdocs trouvé")
        else:
            print(f"\n✅ {len(found_htdocs)} dossier(s) htdocs trouvé(s)")
        
        return found_htdocs
    
    def check_htdocs_content(self):
        """Vérifier le contenu du htdocs ZNKapp"""
        print("\n🔍 CONTENU DU HTDOCS ZNKAPP:")
        print("-" * 50)
        
        # Chercher le htdocs ZNKapp
        znkapp_htdocs = self.base_path / "XAMPP" / "htdocs"
        
        if not znkapp_htdocs.exists():
            print(f"❌ Dossier htdocs introuvable: {znkapp_htdocs}")
            return
        
        print(f"📁 Chemin: {znkapp_htdocs}")
        print(f"📊 Contenu:")
        
        try:
            items = list(znkapp_htdocs.iterdir())
            if not items:
                print("   📄 Dossier vide")
            else:
                for item in sorted(items):
                    if item.is_dir():
                        print(f"   📁 {item.name}/")
                    else:
                        size = item.stat().st_size
                        print(f"   📄 {item.name} ({size} bytes)")
        except Exception as e:
            print(f"❌ Erreur lors de la lecture: {e}")
    
    def find_index_php(self):
        """Chercher tous les fichiers index.php"""
        print("\n🔍 RECHERCHE DES FICHIERS INDEX.PHP:")
        print("-" * 50)
        
        search_paths = [
            Path.home(),
            Path("/Applications"),
            self.base_path
        ]
        
        found_files = []
        
        for search_path in search_paths:
            if search_path.exists():
                try:
                    for index_file in search_path.rglob("index.php"):
                        if index_file.is_file():
                            found_files.append(index_file)
                            print(f"📄 {index_file}")
                except PermissionError:
                    continue
        
        if not found_files:
            print("❌ Aucun fichier index.php trouvé")
        else:
            print(f"\n✅ {len(found_files)} fichier(s) index.php trouvé(s)")
    
    def check_xampp_processes(self):
        """Vérifier les processus XAMPP actifs"""
        print("\n🔍 PROCESSUS XAMPP ACTIFS:")
        print("-" * 50)
        
        xampp_processes = []
        
        for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                proc_info = proc.info
                if proc_info['name'] and 'xampp' in proc_info['name'].lower():
                    xampp_processes.append(proc_info)
                elif proc_info['cmdline'] and any('xampp' in str(cmd).lower() for cmd in proc_info['cmdline']):
                    xampp_processes.append(proc_info)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        
        if xampp_processes:
            for proc in xampp_processes:
                print(f"🔄 PID: {proc['pid']} - {proc['name']}")
                if proc['cmdline']:
                    print(f"   📝 Commande: {' '.join(proc['cmdline'])}")
        else:
            print("❌ Aucun processus XAMPP actif trouvé")
    
    def check_apache_processes(self):
        """Vérifier les processus Apache sur le port 80"""
        print("\n🔍 PROCESSUS APACHE (PORT 80):")
        print("-" * 50)
        
        try:
            # Vérifier les connexions sur le port 80
            connections = psutil.net_connections(kind='inet')
            port_80_procs = []
            
            for conn in connections:
                if conn.laddr.port == 80:
                    try:
                        proc = psutil.Process(conn.pid)
                        port_80_procs.append({
                            'pid': conn.pid,
                            'name': proc.name(),
                            'status': conn.status
                        })
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue
            
            if port_80_procs:
                for proc in port_80_procs:
                    print(f"🌐 PID: {proc['pid']} - {proc['name']} ({proc['status']})")
            else:
                print("❌ Aucun processus sur le port 80")
                
        except Exception as e:
            print(f"❌ Erreur lors de la vérification: {e}")
    
    def find_httpd_config(self):
        """Localiser les fichiers httpd.conf"""
        print("\n🔍 FICHIERS DE CONFIGURATION APACHE:")
        print("-" * 50)
        
        search_paths = [
            Path.home(),
            Path("/Applications"),
            Path("/etc"),
            Path("/usr/local"),
            self.base_path
        ]
        
        found_configs = []
        
        for search_path in search_paths:
            if search_path.exists():
                try:
                    for config_file in search_path.rglob("httpd.conf"):
                        if config_file.is_file():
                            found_configs.append(config_file)
                            print(f"⚙️  {config_file}")
                except PermissionError:
                    continue
        
        if not found_configs:
            print("❌ Aucun fichier httpd.conf trouvé")
        else:
            print(f"\n✅ {len(found_configs)} fichier(s) de configuration trouvé(s)")
        
        return found_configs
    
    def check_document_root(self):
        """Vérifier le DocumentRoot d'Apache"""
        print("\n🔍 DOCUMENT ROOT D'APACHE:")
        print("-" * 50)
        
        config_files = self.find_httpd_config()
        
        for config_file in config_files:
            try:
                with open(config_file, 'r') as f:
                    lines = f.readlines()
                
                print(f"\n📄 Fichier: {config_file}")
                doc_root_found = False
                
                for i, line in enumerate(lines):
                    if 'DocumentRoot' in line and not line.strip().startswith('#'):
                        print(f"   📍 Ligne {i+1}: {line.strip()}")
                        doc_root_found = True
                
                if not doc_root_found:
                    print("   ❌ DocumentRoot non trouvé")
                    
            except Exception as e:
                print(f"❌ Erreur lors de la lecture de {config_file}: {e}")
    
    def xampp_full_status(self):
        """Statut complet XAMPP"""
        print("\n🌐 STATUT COMPLET XAMPP:")
        print("=" * 50)
        
        self.find_htdocs()
        print()
        self.check_htdocs_content()
        print()
        self.find_index_php()
        print()
        self.check_xampp_processes()
        print()
        self.check_apache_processes()
        print()
        self.check_document_root()
    
    def list_files(self, path: str = "."):
        """Lister les fichiers et dossiers"""
        target_path = self.resolve_path(path)
        if not target_path.exists():
            print(f"❌ Chemin introuvable: {path}")
            return
        
        print(f"\n📁 Contenu de {target_path}:")
        print("-" * 40)
        
        try:
            items = sorted(target_path.iterdir())
            for item in items:
                if item.is_dir():
                    print(f"📁 {item.name}/")
                else:
                    size = item.stat().st_size
                    print(f"📄 {item.name} ({size} bytes)")
        except PermissionError:
            print("❌ Permission refusée")
    
    def change_directory(self, path: str):
        """Changer de répertoire"""
        target_path = self.resolve_path(path)
        if not target_path.exists():
            print(f"❌ Répertoire introuvable: {path}")
            return
        
        if not target_path.is_dir():
            print(f"❌ {path} n'est pas un répertoire")
            return
        
        self.current_path = target_path
        print(f"📁 Répertoire changé: {self.current_path}")
    
    def resolve_path(self, path: str) -> Path:
        """Résoudre un chemin relatif ou absolu"""
        if path == ".":
            return self.current_path
        elif path == "..":
            return self.current_path.parent
        elif path.startswith("/"):
            return self.base_path / path[1:]
        else:
            return self.current_path / path
    
    def create_app(self, name: str):
        """Créer une nouvelle application"""
        app_path = self.apps_path / name
        if app_path.exists():
            print(f"❌ L'application '{name}' existe déjà")
            return
        
        # Créer la structure de l'app
        app_path.mkdir()
        (app_path / "src").mkdir()
        (app_path / "public").mkdir()
        (app_path / "config").mkdir()
        
        # Créer des fichiers de base
        (app_path / "README.md").write_text(f"# {name}\n\nDescription de l'application {name}")
        (app_path / "package.json").write_text(json.dumps({
            "name": name,
            "version": "1.0.0",
            "description": f"Application {name}",
            "main": "src/index.js",
            "scripts": {
                "start": "node src/index.js",
                "dev": "nodemon src/index.js"
            }
        }, indent=2))
        
        (app_path / "src" / "index.js").write_text(f"""// Application {name}
console.log('🚀 Application {name} démarrée');

// Votre code ici
""")
        
        print(f"✅ Application '{name}' créée avec succès!")
        print(f"📁 Chemin: {app_path}")
    
    def list_apps(self):
        """Lister toutes les applications"""
        print("\n📱 APPLICATIONS DISPONIBLES:")
        print("-" * 40)
        
        apps = [d for d in self.apps_path.iterdir() if d.is_dir()]
        if not apps:
            print("Aucune application trouvée")
            return
        
        for app in apps:
            package_json = app / "package.json"
            if package_json.exists():
                try:
                    with open(package_json) as f:
                        data = json.load(f)
                    print(f"📱 {app.name} (v{data.get('version', '?')})")
                    print(f"   📝 {data.get('description', 'Pas de description')}")
                except:
                    print(f"📱 {app.name}")
            else:
                print(f"📱 {app.name}")
    
    def run_command(self, command: str, args: List[str]):
        """Exécuter une commande système"""
        try:
            result = subprocess.run([command] + args, 
                                  cwd=self.current_path, 
                                  capture_output=True, 
                                  text=True)
            if result.stdout:
                print(result.stdout)
            if result.stderr:
                print(f"❌ Erreur: {result.stderr}")
        except FileNotFoundError:
            print(f"❌ Commande introuvable: {command}")
    
    def serve_http(self, port: int = 8000):
        """Démarrer un serveur HTTP local"""
        print(f"🌐 Démarrage du serveur HTTP sur le port {port}")
        print(f"📂 Répertoire: {self.current_path}")
        print(f"🔗 URL: http://localhost:{port}")
        print("Ctrl+C pour arrêter")
        
        try:
            subprocess.run(["python", "-m", "http.server", str(port)], 
                          cwd=self.current_path)
        except KeyboardInterrupt:
            print("\n🛑 Serveur arrêté")
    
    def show_status(self):
        """Afficher le statut du volume"""
        print("\n📊 STATUT DU VOLUME:")
        print("-" * 40)
        print(f"📁 Volume: {self.base_path.absolute()}")
        print(f"📁 Répertoire courant: {self.current_path}")
        
        # Compter les applications
        apps_count = len([d for d in self.apps_path.iterdir() if d.is_dir()])
        print(f"📱 Applications: {apps_count}")
        
        # Taille du volume
        total_size = sum(f.stat().st_size for f in self.base_path.rglob('*') if f.is_file())
        print(f"💾 Taille totale: {total_size / 1024 / 1024:.2f} MB")
    
    def run(self):
        """Boucle principale de l'application"""
        self.show_banner()
        print("Tapez 'help' pour voir les commandes disponibles")
        print("🌐 Nouvelles commandes XAMPP disponibles!")
        
        while True:
            try:
                # Prompt personnalisé
                prompt = f"ZNKapp:{self.current_path.name}$ "
                user_input = input(prompt).strip()
                
                if not user_input:
                    continue
                
                parts = user_input.split()
                command = parts[0].lower()
                args = parts[1:] if len(parts) > 1 else []
                
                # Commandes de base
                if command in ['exit', 'quit']:
                    print("👋 Au revoir!")
                    break
                elif command == 'help':
                    self.show_help()
                elif command == 'ls':
                    path = args[0] if args else "."
                    self.list_files(path)
                elif command == 'cd':
                    if args:
                        self.change_directory(args[0])
                    else:
                        self.change_directory(str(self.base_path))
                elif command == 'pwd':
                    print(f"📁 {self.current_path}")
                elif command == 'mkdir':
                    if args:
                        (self.current_path / args[0]).mkdir(exist_ok=True)
                        print(f"✅ Dossier '{args[0]}' créé")
                    else:
                        print("❌ Nom du dossier requis")
                
                # Commandes applications
                elif command == 'newapp':
                    if args:
                        self.create_app(args[0])
                    else:
                        print("❌ Nom de l'application requis")
                elif command == 'listapps':
                    self.list_apps()
                elif command == 'serve':
                    port = int(args[0]) if args else 8000
                    self.serve_http(port)
                elif command == 'status':
                    self.show_status()
                
                # Commandes XAMPP/Apache
                elif command == 'findhtdocs':
                    self.find_htdocs()
                elif command == 'checkhtdocs':
                    self.check_htdocs_content()
                elif command == 'findindex':
                    self.find_index_php()
                elif command == 'checkxampp':
                    self.check_xampp_processes()
                elif command == 'checkapache':
                    self.check_apache_processes()
                elif command == 'findconfig':
                    self.find_httpd_config()
                elif command == 'checkdocroot':
                    self.check_document_root()
                elif command == 'xamppstatus':
                    self.xampp_full_status()
                
                # Commandes système
                elif command == 'git':
                    self.run_command('git', args)
                elif command == 'npm':
                    self.run_command('npm', args)
                elif command == 'python':
                    self.run_command('python', args)
                
                else:
                    print(f"❌ Commande inconnue: {command}")
                    print("Tapez 'help' pour voir les commandes disponibles")
            
            except KeyboardInterrupt:
                print("\n👋 Au revoir!")
                break
            except Exception as e:
                print(f"❌ Erreur: {e}")

def main():
    """Point d'entrée principal"""
    try:
        terminal = ZNKappTerminal()
        terminal.run()
    except ImportError as e:
        print(f"❌ Module manquant: {e}")
        print("Installez psutil avec: pip install psutil")
    except Exception as e:
        print(f"❌ Erreur fatale: {e}")

if __name__ == "__main__":
    main()
