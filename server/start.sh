#!/bin/bash

# ========================================
# ZNK System - Script de Démarrage
# ========================================

echo "🚀 Démarrage de ZNK System..."
echo ""

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ========================================
# 1. VÉRIFICATIONS
# ========================================

echo "🔍 Vérification des prérequis..."

# Vérifier Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js n'est pas installé${NC}"
    echo "   Installez-le depuis: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✅ Node.js détecté: $NODE_VERSION${NC}"

# Vérifier npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm n'est pas installé${NC}"
    exit 1
fi

NPM_VERSION=$(npm -v)
echo -e "${GREEN}✅ npm détecté: $NPM_VERSION${NC}"

echo ""

# ========================================
# 2. STRUCTURE DES DOSSIERS
# ========================================

echo "📁 Vérification de la structure..."

# Créer les dossiers s'ils n'existent pas
mkdir -p server/data/workflows
mkdir -p server/data/published
mkdir -p js
mkdir -p logs

echo -e "${GREEN}✅ Structure des dossiers créée${NC}"
echo ""

# ========================================
# 3. INSTALLATION DES DÉPENDANCES
# ========================================

echo "📦 Installation des dépendances..."

cd server

# Vérifier si package.json existe
if [ ! -f "package.json" ]; then
    echo -e "${YELLOW}⚠️  package.json introuvable, création...${NC}"
    
    cat > package.json << 'EOF'
{
  "name": "znk-sync-server",
  "version": "1.0.0",
  "description": "Serveur de synchronisation ZNK",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
EOF
fi

# Installer les dépendances
if [ ! -d "node_modules" ]; then
    echo "Installation en cours..."
    npm install --silent
    echo -e "${GREEN}✅ Dépendances installées${NC}"
else
    echo -e "${BLUE}ℹ️  Dépendances déjà installées${NC}"
fi

cd ..
echo ""

# ========================================
# 4. DÉTECTION DE L'IP LOCALE
# ========================================

echo "🌐 Détection de l'adresse IP..."

# Détection selon l'OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1)
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    LOCAL_IP=$(hostname -I | awk '{print $1}')
else
    # Fallback
    LOCAL_IP="localhost"
fi

echo -e "${GREEN}✅ IP locale: $LOCAL_IP${NC}"
echo ""

# ========================================
# 5. AFFICHAGE DES INFORMATIONS
# ========================================

echo "=========================================="
echo "📋 Informations de connexion:"
echo "=========================================="
echo ""
echo "🖥️  Local:    http://localhost:3000"
echo "📱 Réseau:   http://$LOCAL_IP:3000"
echo ""
echo "📄 Admin:    archives.html"
echo "📺 ACTV:     actv.html"
echo ""
echo "=========================================="
echo ""

# ========================================
# 6. OPTIONS DE DÉMARRAGE
# ========================================

echo "Choisissez le mode de démarrage:"
echo ""
echo "1) Démarrage simple (Ctrl+C pour arrêter)"
echo "2) Démarrage en arrière-plan (daemon)"
echo "3) Démarrage avec logs détaillés"
echo "4) Ouvrir les interfaces (+ démarrage serveur)"
echo "5) Arrêter le serveur en arrière-plan"
echo "6) Voir les logs"
echo ""
read -p "Votre choix (1-6): " choice

case $choice in
    1)
        echo ""
        echo "🚀 Démarrage du serveur..."
        echo "   Appuyez sur Ctrl+C pour arrêter"
        echo ""
        cd server
        node server.js
        ;;
    
    2)
        echo ""
        echo "🚀 Démarrage en arrière-plan..."
        
        # Vérifier si déjà lancé
        if [ -f "server/.pid" ]; then
            PID=$(cat server/.pid)
            if ps -p $PID > /dev/null 2>&1; then
                echo -e "${YELLOW}⚠️  Le serveur est déjà en cours d'exécution (PID: $PID)${NC}"
                echo "   Utilisez l'option 5 pour l'arrêter"
                exit 0
            fi
        fi
        
        # Démarrer
        cd server
        nohup node server.js > ../logs/server.log 2>&1 &
        SERVER_PID=$!
        echo $SERVER_PID > .pid
        cd ..
        
        echo -e "${GREEN}✅ Serveur démarré (PID: $SERVER_PID)${NC}"
        echo "   Logs: tail -f logs/server.log"
        echo "   Arrêt: ./start.sh puis option 5"
        ;;
    
    3)
        echo ""
        echo "🚀 Démarrage avec logs détaillés..."
        echo ""
        cd server
        NODE_ENV=development node server.js | tee ../logs/server.log
        ;;
    
    4)
        echo ""
        echo "🚀 Démarrage du serveur et ouverture des interfaces..."
        
        # Démarrer le serveur en arrière-plan
        cd server
        nohup node server.js > ../logs/server.log 2>&1 &
        SERVER_PID=$!
        echo $SERVER_PID > .pid
        cd ..
        
        echo -e "${GREEN}✅ Serveur démarré (PID: $SERVER_PID)${NC}"
        
        # Attendre que le serveur soit prêt
        echo "⏳ Attente du démarrage du serveur..."
        sleep 3
        
        # Ouvrir les interfaces
        echo "🌐 Ouverture des interfaces..."
        
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            open "file://$(pwd)/modules/archives.html"
            sleep 1
            open "file://$(pwd)/modules/actv.html"
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            # Linux
            xdg-open "file://$(pwd)/modules/archives.html" &
            sleep 1
            xdg-open "file://$(pwd)/module/actv.html" &
        fi
        
        echo ""
        echo -e "${GREEN}✅ Interfaces ouvertes${NC}"
        echo "   Arrêt: ./start.sh puis option 5"
        ;;
    
    5)
        echo ""
        echo "⏹️  Arrêt du serveur..."
        
        if [ -f "server/.pid" ]; then
            PID=$(cat server/.pid)
            
            if ps -p $PID > /dev/null 2>&1; then
                kill $PID
                rm server/.pid
                echo -e "${GREEN}✅ Serveur arrêté${NC}"
            else
                echo -e "${YELLOW}⚠️  Serveur non actif${NC}"
                rm server/.pid
            fi
        else
            echo -e "${YELLOW}⚠️  Aucun serveur en cours d'exécution${NC}"
        fi
        ;;
    
    6)
        echo ""
        echo "📄 Affichage des logs..."
        echo "   Appuyez sur Ctrl+C pour quitter"
        echo ""
        
        if [ -f "logs/server.log" ]; then
            tail -f logs/server.log
        else
            echo -e "${YELLOW}⚠️  Aucun fichier de logs trouvé${NC}"
        fi
        ;;
    
    *)
        echo -e "${RED}❌ Choix invalide${NC}"
        exit 1
        ;;
esac

echo ""
echo "=========================================="
echo "💡 Conseils:"
echo "=========================================="
echo ""
echo "• Admin (archives.html) : Créez et publiez des workflows"
echo "• ACTV (actv.html) : Visualisez les workflows publiés"
echo "• Les workflows sont stockés dans: server/data/published"
echo "• Partagez http://$LOCAL_IP:3000 aux autres appareils"
echo ""
echo "🎉 ZNK System est prêt!"
echo ""