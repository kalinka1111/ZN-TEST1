#!/bin/bash

# ============================================================================
# ZNK P2P System - Launcher Complet v2.0
# ============================================================================

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                   🚀 ZNK P2P SYSTEM LAUNCHER v2.0             ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Couleurs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Variables globales
PYTHON_CMD=""
PIP_CMD=""
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ============================================================================
# FONCTIONS DE VÉRIFICATION
# ============================================================================

check_python() {
    echo -n "🔍 Vérification de Python... "
    if command -v python3 &> /dev/null; then
        PYTHON_CMD="python3"
        echo -e "${GREEN}✓ Python3 trouvé${NC}"
        return 0
    elif command -v python &> /dev/null; then
        PYTHON_CMD="python"
        echo -e "${GREEN}✓ Python trouvé${NC}"
        return 0
    else
        echo -e "${RED}✗ Python non trouvé${NC}"
        echo "  Installez Python 3.8+ depuis https://python.org"
        return 1
    fi
}

check_pip() {
    echo -n "🔍 Vérification de pip... "
    if command -v pip3 &> /dev/null; then
        PIP_CMD="pip3"
        echo -e "${GREEN}✓ pip3 trouvé${NC}"
        return 0
    elif command -v pip &> /dev/null; then
        PIP_CMD="pip"
        echo -e "${GREEN}✓ pip trouvé${NC}"
        return 0
    else
        echo -e "${RED}✗ pip non trouvé${NC}"
        return 1
    fi
}

check_node() {
    echo -n "🔍 Vérification de Node.js... "
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        echo -e "${GREEN}✓ Node.js $NODE_VERSION trouvé${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠ Node.js non trouvé (requis pour Electron)${NC}"
        echo "  Installez depuis https://nodejs.org"
        return 1
    fi
}

check_npm() {
    echo -n "🔍 Vérification de npm... "
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm --version)
        echo -e "${GREEN}✓ npm $NPM_VERSION trouvé${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠ npm non trouvé${NC}"
        return 1
    fi
}

check_dependencies() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${BLUE}📦 Vérification des dépendances...${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Python dependencies
    if [ -f "backend/requirements.txt" ]; then
        echo "📦 Installation des dépendances Python..."
        cd backend
        $PIP_CMD install -r requirements.txt --quiet
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Dépendances Python installées${NC}"
        else
            echo -e "${YELLOW}⚠ Certaines dépendances Python manquantes${NC}"
        fi
        cd ..
    fi
    
    # Node dependencies (si package.json existe)
    if [ -f "package.json" ]; then
        echo "📦 Installation des dépendances Node.js..."
        npm install --silent
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Dépendances Node.js installées${NC}"
        else
            echo -e "${YELLOW}⚠ Erreur installation Node.js${NC}"
        fi
    fi
}

create_structure() {
    echo ""
    echo "📁 Création de la structure de dossiers..."
    
    mkdir -p backend/data/publications
    mkdir -p backend/data/shared
    mkdir -p logs
    mkdir -p .pids
    
    # Créer index/ s'il n'existe pas (sans écraser)
    if [ ! -d "index" ]; then
        mkdir -p index
    fi
    
    echo -e "${GREEN}✓ Structure créée${NC}"
}

check_files() {
    echo ""
    echo "🔍 Vérification des fichiers requis..."
    
    local all_ok=true
    
    # Backend
    if [ -f "backend/server.py" ]; then
        echo -e "${GREEN}✓${NC} backend/server.py"
    elif [ -f "server.py" ]; then
        echo -e "${GREEN}✓${NC} server.py"
    else
        echo -e "${RED}✗${NC} backend/server.py manquant"
        all_ok=false
    fi
    
    # Frontend - chercher dans plusieurs emplacements
    if [ -f "index/index.html" ]; then
        echo -e "${GREEN}✓${NC} index/index.html"
    elif [ -f "frontend/index.html" ]; then
        echo -e "${GREEN}✓${NC} frontend/index.html"
    elif [ -f "index.html" ]; then
        echo -e "${GREEN}✓${NC} index.html"
    else
        echo -e "${RED}✗${NC} index.html manquant (cherché dans index/, frontend/, ./)"
        all_ok=false
    fi
    
    # P2P Protocol
    if [ -f "znk_p2p_protocol.py" ]; then
        echo -e "${GREEN}✓${NC} znk_p2p_protocol.py"
    else
        echo -e "${YELLOW}⚠${NC} znk_p2p_protocol.py manquant (optionnel)"
    fi
    
    # Electron (optionnel)
    if [ -f "main.js" ] || [ -f "electron/main.js" ]; then
        echo -e "${GREEN}✓${NC} Electron configuré"
    else
        echo -e "${YELLOW}⚠${NC} Electron non configuré (mode navigateur)"
    fi
    
    if [ "$all_ok" = false ]; then
        echo ""
        echo -e "${RED}Certains fichiers critiques manquent !${NC}"
        return 1
    fi
    
    return 0
}

# ============================================================================
# FONCTIONS DE DÉMARRAGE
# ============================================================================

start_backend() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${BLUE}⚙️ Démarrage du Backend Flask...${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Chercher server.py dans plusieurs emplacements
    BACKEND_SCRIPT=""
    if [ -f "backend/server.py" ]; then
        BACKEND_SCRIPT="backend/server.py"
    elif [ -f "server.py" ]; then
        BACKEND_SCRIPT="server.py"
    elif [ -f "backend/app.py" ]; then
        BACKEND_SCRIPT="backend/app.py"
    else
        echo -e "${RED}✗ Fichier server.py introuvable${NC}"
        echo "  Cherché dans: backend/server.py, server.py, backend/app.py"
        return 1
    fi
    
    echo "📂 Utilisation de: $BACKEND_SCRIPT"
    
    # Tester d'abord si le script fonctionne
    echo "🔍 Test du backend..."
    $PYTHON_CMD $BACKEND_SCRIPT --test 2>&1 | head -5
    
    # Démarrer en arrière-plan avec chemin absolu
    BACKEND_DIR=$(dirname "$BACKEND_SCRIPT")
    BACKEND_FILE=$(basename "$BACKEND_SCRIPT")
    
    cd "$BACKEND_DIR"
    $PYTHON_CMD "$BACKEND_FILE" > "$PROJECT_ROOT/logs/backend.log" 2>&1 &
    BACKEND_PID=$!
    cd "$PROJECT_ROOT"
    
    # Sauvegarder le PID
    echo $BACKEND_PID > .pids/backend.pid
    
    # Attendre et vérifier plusieurs fois
    echo -n "⏳ Démarrage"
    for i in {1..10}; do
        sleep 1
        echo -n "."
        
        if ! kill -0 $BACKEND_PID 2>/dev/null; then
            echo ""
            echo -e "${RED}✗ Backend crashé immédiatement${NC}"
            echo ""
            echo "📋 Dernières lignes du log:"
            tail -20 logs/backend.log
            return 1
        fi
        
        # Vérifier si le port répond
        if curl -s http://localhost:5000 > /dev/null 2>&1; then
            echo ""
            echo -e "${GREEN}✓ Backend démarré (PID: $BACKEND_PID)${NC}"
            echo "  URL: http://localhost:5000"
            echo "  Logs: logs/backend.log"
            return 0
        fi
    done
    
    echo ""
    echo -e "${YELLOW}⚠ Backend démarré mais ne répond pas encore${NC}"
    echo "  PID: $BACKEND_PID (toujours actif)"
    echo "  Logs: tail -f logs/backend.log"
    return 0
}

start_frontend() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${BLUE}🌐 Démarrage du Frontend HTTP...${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Chercher index.html dans plusieurs emplacements
    FRONTEND_DIR=""
    if [ -f "index/index.html" ]; then
        FRONTEND_DIR="index"
    elif [ -f "frontend/index.html" ]; then
        FRONTEND_DIR="frontend"
    elif [ -f "index.html" ]; then
        FRONTEND_DIR="."
    else
        echo -e "${RED}✗ index.html introuvable${NC}"
        echo "  Cherché dans: index/, frontend/, ./"
        return 1
    fi
    
    echo "📂 Utilisation de: $FRONTEND_DIR/"
    
    cd "$FRONTEND_DIR"
    
    # Démarrer serveur HTTP Python
    $PYTHON_CMD -m http.server 8000 > "$PROJECT_ROOT/logs/frontend.log" 2>&1 &
    FRONTEND_PID=$!
    
    cd "$PROJECT_ROOT"
    
    echo $FRONTEND_PID > .pids/frontend.pid
    
    sleep 1
    
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        echo -e "${GREEN}✓ Frontend démarré (PID: $FRONTEND_PID)${NC}"
        echo "  URL: http://localhost:8000"
        echo "  Serveur dans: $FRONTEND_DIR/"
        echo "  Logs: logs/frontend.log"
        return 0
    else
        echo -e "${RED}✗ Erreur démarrage frontend${NC}"
        return 1
    fi
}

start_p2p() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${BLUE}🌍 Démarrage du Réseau P2P...${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    if [ ! -f "znk_p2p_protocol.py" ]; then
        echo -e "${YELLOW}⚠ znk_p2p_protocol.py non trouvé, P2P ignoré${NC}"
        return 1
    fi
    
    # Lancement du protocole P2P
    $PYTHON_CMD znk_p2p_protocol.py > logs/p2p.log 2>&1 &
    P2P_PID=$!
    
    echo $P2P_PID > .pids/p2p.pid
    
    sleep 2
    
    if kill -0 $P2P_PID 2>/dev/null; then
        echo -e "${GREEN}✓ P2P démarré (PID: $P2P_PID)${NC}"
        echo "  Port: 9876"
        echo "  Logs: logs/p2p.log"
        return 0
    else
        echo -e "${RED}✗ Erreur démarrage P2P${NC}"
        echo "  Consultez: tail -f logs/p2p.log"
        return 1
    fi
}

start_electron() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${PURPLE}⚡ Démarrage d'Electron...${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Vérifier si Electron est disponible
    if [ -f "package.json" ] && command -v npm &> /dev/null; then
        # Vérifier si electron est installé
        if npm list electron &> /dev/null; then
            echo "🚀 Lancement d'Electron..."
            npm start > logs/electron.log 2>&1 &
            ELECTRON_PID=$!
            echo $ELECTRON_PID > .pids/electron.pid
            
            sleep 2
            
            if kill -0 $ELECTRON_PID 2>/dev/null; then
                echo -e "${GREEN}✓ Electron lancé (PID: $ELECTRON_PID)${NC}"
                echo "  Interface: Application desktop"
                return 0
            else
                echo -e "${YELLOW}⚠ Échec lancement Electron${NC}"
                echo "  Fallback: ouverture navigateur"
                open_browser
                return 1
            fi
        else
            echo -e "${YELLOW}⚠ Electron non installé${NC}"
            echo "  Installez avec: npm install electron --save-dev"
            echo "  Fallback: ouverture navigateur"
            open_browser
            return 1
        fi
    else
        echo -e "${YELLOW}⚠ Configuration Electron non détectée${NC}"
        echo "  Fallback: ouverture navigateur"
        open_browser
        return 1
    fi
}

open_browser() {
    echo ""
    echo "🌐 Ouverture dans le navigateur..."
    
    URL="http://localhost:8000/index.html"
    
    # Détecter l'OS et ouvrir
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        open "$URL"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command -v xdg-open &> /dev/null; then
            xdg-open "$URL"
        elif command -v gnome-open &> /dev/null; then
            gnome-open "$URL"
        fi
    elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
        # Windows Git Bash
        start "$URL"
    fi
    
    echo -e "${GREEN}✓ Navigateur ouvert${NC}"
}

# ============================================================================
# STATUT ET MONITORING
# ============================================================================

show_status() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                    ✅ SYSTÈME DÉMARRÉ                          ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "📡 Services actifs:"
    echo ""
    
    # Backend
    if [ -f .pids/backend.pid ] && kill -0 $(cat .pids/backend.pid) 2>/dev/null; then
        echo -e "   ${GREEN}✓${NC} Backend API      → http://localhost:5000"
    else
        echo -e "   ${RED}✗${NC} Backend API      → Arrêté"
    fi
    
    # Frontend
    if [ -f .pids/frontend.pid ] && kill -0 $(cat .pids/frontend.pid) 2>/dev/null; then
        echo -e "   ${GREEN}✓${NC} Frontend         → http://localhost:8000"
    else
        echo -e "   ${RED}✗${NC} Frontend         → Arrêté"
    fi
    
    # P2P
    if [ -f .pids/p2p.pid ] && kill -0 $(cat .pids/p2p.pid) 2>/dev/null; then
        echo -e "   ${GREEN}✓${NC} Réseau P2P       → Port 9876"
    else
        echo -e "   ${YELLOW}⚠${NC} Réseau P2P       → Non démarré"
    fi
    
    # Electron
    if [ -f .pids/electron.pid ] && kill -0 $(cat .pids/electron.pid) 2>/dev/null; then
        echo -e "   ${GREEN}✓${NC} Electron         → Application desktop"
    else
        echo -e "   ${YELLOW}⚠${NC} Electron         → Mode navigateur"
    fi
    
    echo ""
    echo "📋 Logs en temps réel:"
    echo "   Backend:  tail -f logs/backend.log"
    echo "   Frontend: tail -f logs/frontend.log"
    echo "   P2P:      tail -f logs/p2p.log"
    echo ""
    echo "🛑 Pour arrêter: ./stop_all_services.sh ou Ctrl+C"
    echo ""
}

monitor_services() {
    while true; do
        sleep 10
        
        # Vérifier Backend
        if [ -f .pids/backend.pid ]; then
            if ! kill -0 $(cat .pids/backend.pid) 2>/dev/null; then
                echo -e "${RED}⚠ Backend arrêté de façon inattendue !${NC}"
            fi
        fi
        
        # Vérifier Frontend
        if [ -f .pids/frontend.pid ]; then
            if ! kill -0 $(cat .pids/frontend.pid) 2>/dev/null; then
                echo -e "${RED}⚠ Frontend arrêté de façon inattendue !${NC}"
            fi
        fi
        
        # Vérifier P2P
        if [ -f .pids/p2p.pid ]; then
            if ! kill -0 $(cat .pids/p2p.pid) 2>/dev/null; then
                echo -e "${YELLOW}⚠ P2P arrêté de façon inattendue${NC}"
            fi
        fi
    done
}

# ============================================================================
# NETTOYAGE ET ARRÊT
# ============================================================================

cleanup() {
    echo ""
    echo "🛑 Arrêt du système ZNK..."
    echo ""
    
    # Backend
    if [ -f .pids/backend.pid ]; then
        PID=$(cat .pids/backend.pid)
        if kill -0 $PID 2>/dev/null; then
            kill $PID 2>/dev/null
            echo -e "${GREEN}✓${NC} Backend arrêté"
        fi
        rm .pids/backend.pid
    fi
    
    # Frontend
    if [ -f .pids/frontend.pid ]; then
        PID=$(cat .pids/frontend.pid)
        if kill -0 $PID 2>/dev/null; then
            kill $PID 2>/dev/null
            echo -e "${GREEN}✓${NC} Frontend arrêté"
        fi
        rm .pids/frontend.pid
    fi
    
    # P2P
    if [ -f .pids/p2p.pid ]; then
        PID=$(cat .pids/p2p.pid)
        if kill -0 $PID 2>/dev/null; then
            kill $PID 2>/dev/null
            echo -e "${GREEN}✓${NC} P2P arrêté"
        fi
        rm .pids/p2p.pid
    fi
    
    # Electron
    if [ -f .pids/electron.pid ]; then
        PID=$(cat .pids/electron.pid)
        if kill -0 $PID 2>/dev/null; then
            kill $PID 2>/dev/null
            echo -e "${GREEN}✓${NC} Electron arrêté"
        fi
        rm .pids/electron.pid
    fi
    
    echo ""
    echo "✅ Système ZNK arrêté proprement"
    exit 0
}

# ============================================================================
# EXÉCUTION PRINCIPALE
# ============================================================================

main() {
    # Vérifications système
    check_python || exit 1
    check_pip || exit 1
    check_node
    check_npm
    
    # Préparation
    create_structure
    check_dependencies
    check_files || exit 1
    
    # Démarrage des services
    start_backend || exit 1
    start_frontend || exit 1
    start_p2p  # Continue même si P2P échoue
    
    # Attendre que tout soit prêt
    sleep 2
    
    # Lancer interface (Electron prioritaire)
    start_electron || true  # Continue même si échec
    
    # Afficher statut
    show_status
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${GREEN}🚀 Système ZNK P2P en cours d'exécution${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Appuyez sur Ctrl+C pour arrêter..."
    echo ""
    
    # Monitoring en arrière-plan
    monitor_services &
    MONITOR_PID=$!
    
    # Attendre signal d'arrêt
    wait
}

# Gestion du Ctrl+C
trap cleanup INT TERM

# Lancer
main