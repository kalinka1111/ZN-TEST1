#!/bin/bash

# 🌈 Script d'installation ZAZA Launcher + ZNK Config
# Compatible macOS et Linux

echo "🚀 Installation ZAZA Launcher avec configuration ZNK"
echo "===================================================="
echo ""

# Couleurs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Vérifier si npm est installé
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm n'est pas installé!${NC}"
    echo "Installez Node.js depuis: https://nodejs.org/"
    exit 1
fi

echo -e "${GREEN}✅ npm trouvé: $(npm --version)${NC}"
echo ""

# Demander le dossier d'installation
read -p "📂 Dossier du projet (laissez vide pour dossier actuel): " PROJECT_DIR
PROJECT_DIR=${PROJECT_DIR:-.}

cd "$PROJECT_DIR" || exit 1
echo -e "${BLUE}📁 Installation dans: $(pwd)${NC}"
echo ""

# Étape 1: Installer Electron
echo -e "${YELLOW}📦 Étape 1/4: Installation d'Electron...${NC}"
if [ -f "package.json" ]; then
    npm install electron --save-dev
else
    echo "Création de package.json..."
    npm init -y
    npm install electron --save-dev
fi
echo -e "${GREEN}✅ Electron installé${NC}"
echo ""

# Étape 2: Créer znk-config.js
echo -e "${YELLOW}📝 Étape 2/4: Création de znk-config.js...${NC}"
cat > znk-config.js << 'EOF'
// 🌈 ZNK Configuration Centralisée
window.ZNK_CONFIG = {
    PORTS: [
        { port: 3000, name: '🔄 ZNK Sync', service: 'http:// 192.168.1.142:5555/api', priority: 1 },
        { port: 3001, name: '💬 WhatsZNK', service: 'WhatsZNK Video Chat', priority: 1 },
        { port: 5000, name: '🤖 ZAZA IA', service: 'ZAZA IA System', priority: 1 },
        { port: 8080, name: 'HTTP Dev', service: 'http:// 192.168.1.142:5555/api', priority: 2 },
        { port: 5173, name: 'Vite', service: 'Vite Development', priority: 2 },
        { port: 3002, name: 'React Dev', service: 'React Development', priority: 2 }
    ],

    APPS: [
        { name: '🏠 Accueil ZNK', port: 8080, path: '/index.html', 
          description: 'Point d\'entrée utilisateurs', 
          command: 'electron . --port=3000 --app=accueil' },
        { name: '📊 Dashboard Principal', port: 3000, path: '/ZNKmembresdash.html', 
          description: 'Dashboard avec navigation', 
          command: 'electron . --port=3000 --app=dashboard' },
        { name: '🎨 ZNK Studios', port: 3000, path: '/ZNKStudiosDash.html', 
          description: 'Interface créative', 
          command: 'electron . --port=3000 --app=studios' },
        { name: '💬 WhatsZNK', port: 3001, path: '/whatsznk.html', 
          description: 'Video chat', 
          command: 'electron . --port=3001 --app=whatsznk' },
        { name: '🎥 Camera Core', port: 3000, path: '/znk-camera-core-local.html', 
          description: 'Effets vidéo', 
          command: 'electron . --port=3000 --app=camera' },
        { name: '👥 ACTV Users', port: 3000, path: '/actv.html', 
          description: 'Interface utilisateurs', 
          command: 'electron . --port=3000 --app=actv' },
        { name: '📁 Archives', port: 3000, path: '/archives.html', 
          description: 'Gestion admin', 
          command: 'electron . --port=3000 --app=archives' },
        { name: '🤖 ZAZA IA', port: 5000, path: '/', 
          description: 'App principale', 
          command: 'electron . --port=5000 --app=zaza' }
    ]
};
console.log('✅ ZNK Config loaded');
EOF
echo -e "${GREEN}✅ znk-config.js créé${NC}"
echo ""

# Étape 3: Backup de l'ancien launcher si existe
echo -e "${YELLOW}💾 Étape 3/4: Backup et création du launcher...${NC}"
if [ -f "zaza-launcher-electron.html" ]; then
    BACKUP_NAME="zaza-launcher-electron.backup.$(date +%Y%m%d_%H%M%S).html"
    cp zaza-launcher-electron.html "$BACKUP_NAME"
    echo -e "${GREEN}✅ Ancien launcher sauvegardé: $BACKUP_NAME${NC}"
fi
echo -e "${BLUE}📝 Téléchargez le nouveau launcher depuis l'artifact...${NC}"
echo ""

# Étape 4: Configurer package.json
echo -e "${YELLOW}⚙️ Étape 4/4: Configuration des scripts npm...${NC}"

# Créer un backup de package.json
if [ -f "package.json" ]; then
    cp package.json package.json.backup
fi

# Ajouter les scripts (utilise jq si disponible, sinon instructions manuelles)
if command -v jq &> /dev/null; then
    # Utiliser jq pour modifier le JSON
    jq '.scripts += {
        "electron": "electron .",
        "dashboard": "electron . --port=3000 --app=dashboard",
        "accueil": "electron . --port=3000 --app=accueil",
        "studios": "electron . --port=3000 --app=studios",
        "whatsznk": "electron . --port=3001 --app=whatsznk",
        "camera": "electron . --port=3000 --app=camera",
        "actv": "electron . --port=3000 --app=actv",
        "archives": "electron . --port=3000 --app=archives",
        "zaza": "electron . --port=5000 --app=zaza"
    }' package.json > package.json.tmp && mv package.json.tmp package.json
    
    echo -e "${GREEN}✅ Scripts npm configurés automatiquement${NC}"
else
    echo -e "${YELLOW}⚠️ jq non trouvé. Ajoutez manuellement ces scripts dans package.json:${NC}"
    cat << 'SCRIPTS'
  "scripts": {
    "electron": "electron .",
    "dashboard": "electron . --port=3000 --app=dashboard",
    "accueil": "electron . --port=3000 --app=accueil",
    "studios": "electron . --port=3000 --app=studios",
    "whatsznk": "electron . --port=3001 --app=whatsznk",
    "camera": "electron . --port=3000 --app=camera",
    "actv": "electron . --port=3000 --app=actv",
    "archives": "electron . --port=3000 --app=archives",
    "zaza": "electron . --port=5000 --app=zaza"
  }
SCRIPTS
fi
echo ""

# Vérifier si main.js existe
if [ ! -f "main.js" ]; then
    echo -e "${RED}⚠️ main.js n'existe pas!${NC}"
    echo -e "${YELLOW}Créez main.js ou copiez-le depuis le guide.${NC}"
fi

# Résumé final
echo ""
echo "=================================================="
echo -e "${GREEN}🎉 Installation terminée!${NC}"
echo "=================================================="
echo ""
echo -e "${BLUE}📋 Fichiers créés:${NC}"
echo "  ✅ znk-config.js"
echo "  ✅ package.json (mis à jour)"
if [ -f "$BACKUP_NAME" ]; then
    echo "  💾 $BACKUP_NAME (backup)"
fi
echo ""
echo -e "${BLUE}📝 Prochaines étapes:${NC}"
echo "  1. Téléchargez le nouveau zaza-launcher-electron.html"
echo "  2. Vérifiez que main.js existe"
echo "  3. Ouvrez zaza-launcher-electron.html dans un navigateur"
echo ""
echo -e "${BLUE}⚡ Commandes disponibles:${NC}"
echo "  npm run accueil    # Lancer l'accueil"
echo "  npm run dashboard  # Lancer le dashboard"
echo "  npm run studios    # Lancer ZNK Studios"
echo "  npm run whatsznk   # Lancer WhatsZNK"
echo "  npm run actv       # Lancer ACTV"
echo ""
echo -e "${GREEN}✅ Système prêt!${NC}"