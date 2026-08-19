#!/bin/bash

# ============================================================================
# Script de Diagnostic ZNK Backend
# ============================================================================

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║              🔍 ZNK BACKEND DIAGNOSTIC TOOL                   ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ============================================================================
# 1. VÉRIFICATION PYTHON
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}1️⃣ Vérification Python${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
    PY_VERSION=$($PYTHON_CMD --version)
    echo -e "${GREEN}✓${NC} Python3 trouvé: $PY_VERSION"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
    PY_VERSION=$($PYTHON_CMD --version)
    echo -e "${GREEN}✓${NC} Python trouvé: $PY_VERSION"
else
    echo -e "${RED}✗${NC} Python non trouvé"
    exit 1
fi

# ============================================================================
# 2. RECHERCHE DU FICHIER SERVER
# ============================================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}2️⃣ Recherche du fichier backend${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

BACKEND_FILE=""

# Chercher dans plusieurs emplacements
SEARCH_PATHS=(
    "backend/server.py"
    "server.py"
    "backend/app.py"
    "app.py"
    "src/server.py"
    "api/server.py"
)

echo ""
echo "📂 Vérification de la structure frontend..."
FRONTEND_PATHS=(
    "index/index.html"
    "frontend/index.html"
    "index.html"
)

FRONTEND_FOUND=""
for fpath in "${FRONTEND_PATHS[@]}"; do
    if [ -f "$fpath" ]; then
        echo -e "${GREEN}✓${NC} Frontend trouvé: $fpath"
        FRONTEND_FOUND="$fpath"
        break
    else
        echo -e "${YELLOW}⊘${NC} Non trouvé: $fpath"
    fi
done

if [ -z "$FRONTEND_FOUND" ]; then
    echo -e "${RED}✗ Aucun index.html trouvé !${NC}"
fi

echo ""
echo "📂 Vérification backend..."

for path in "${SEARCH_PATHS[@]}"; do
    if [ -f "$path" ]; then
        echo -e "${GREEN}✓${NC} Trouvé: $path"
        BACKEND_FILE="$path"
        break
    else
        echo -e "${YELLOW}⊘${NC} Non trouvé: $path"
    fi
done

if [ -z "$BACKEND_FILE" ]; then
    echo ""
    echo -e "${RED}✗ Aucun fichier backend trouvé !${NC}"
    echo ""
    echo "Créez un fichier server.py dans backend/ ou à la racine"
    exit 1
fi

echo ""
echo -e "${GREEN}📂 Utilisation de: $BACKEND_FILE${NC}"

# ============================================================================
# 3. VÉRIFICATION DU CONTENU
# ============================================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}3️⃣ Analyse du fichier backend${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Vérifier si Flask est utilisé
if grep -q "from flask import" "$BACKEND_FILE" || grep -q "import flask" "$BACKEND_FILE"; then
    echo -e "${GREEN}✓${NC} Flask détecté"
else
    echo -e "${YELLOW}⚠${NC} Flask non détecté (peut être normal)"
fi

# Vérifier le port
if grep -q "5000" "$BACKEND_FILE"; then
    echo -e "${GREEN}✓${NC} Port 5000 détecté dans le code"
else
    echo -e "${YELLOW}⚠${NC} Port 5000 non trouvé explicitement"
fi

# Afficher les premières lignes
echo ""
echo "📄 Premières lignes du fichier:"
head -15 "$BACKEND_FILE"

# ============================================================================
# 4. VÉRIFICATION DES DÉPENDANCES
# ============================================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}4️⃣ Vérification des dépendances${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Vérifier Flask
if $PYTHON_CMD -c "import flask" 2>/dev/null; then
    FLASK_VER=$($PYTHON_CMD -c "import flask; print(flask.__version__)")
    echo -e "${GREEN}✓${NC} Flask installé (version $FLASK_VER)"
else
    echo -e "${RED}✗${NC} Flask non installé"
    echo "  Installez avec: pip3 install flask"
fi

# Vérifier flask-cors si nécessaire
if grep -q "CORS" "$BACKEND_FILE"; then
    if $PYTHON_CMD -c "import flask_cors" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} flask-cors installé"
    else
        echo -e "${RED}✗${NC} flask-cors requis mais non installé"
        echo "  Installez avec: pip3 install flask-cors"
    fi
fi

# Vérifier requirements.txt
if [ -f "backend/requirements.txt" ]; then
    echo ""
    echo "📦 Contenu de requirements.txt:"
    cat backend/requirements.txt
elif [ -f "requirements.txt" ]; then
    echo ""
    echo "📦 Contenu de requirements.txt:"
    cat requirements.txt
else
    echo -e "${YELLOW}⚠${NC} Aucun fichier requirements.txt trouvé"
fi

# ============================================================================
# 5. TEST SYNTAXE PYTHON
# ============================================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}5️⃣ Test de syntaxe Python${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

$PYTHON_CMD -m py_compile "$BACKEND_FILE" 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Syntaxe Python valide"
else
    echo -e "${RED}✗${NC} Erreurs de syntaxe détectées"
fi

# ============================================================================
# 6. TEST D'IMPORT
# ============================================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}6️⃣ Test d'import des modules${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Extraire les imports du fichier
echo "Imports détectés dans $BACKEND_FILE:"
grep -E "^import |^from " "$BACKEND_FILE" | head -10

echo ""
echo "Test des imports principaux:"

# Test des imports courants
for module in flask flask_cors json os sys; do
    if $PYTHON_CMD -c "import $module" 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} $module"
    else
        echo -e "  ${RED}✗${NC} $module (non installé)"
    fi
done

# ============================================================================
# 7. VÉRIFICATION DU PORT 5000
# ============================================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}7️⃣ Vérification du port 5000${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if lsof -i :5000 &> /dev/null; then
    echo -e "${YELLOW}⚠${NC} Port 5000 déjà utilisé par:"
    lsof -i :5000
    echo ""
    echo "Pour libérer le port:"
    echo "  kill \$(lsof -ti :5000)"
else
    echo -e "${GREEN}✓${NC} Port 5000 disponible"
fi

# ============================================================================
# 8. TEST DE DÉMARRAGE
# ============================================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}8️⃣ Test de démarrage du backend${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Tentative de démarrage (5 secondes)..."
echo ""

BACKEND_DIR=$(dirname "$BACKEND_FILE")
BACKEND_NAME=$(basename "$BACKEND_FILE")

cd "$BACKEND_DIR"
timeout 5 $PYTHON_CMD "$BACKEND_NAME" 2>&1 | head -20
RESULT=$?
cd - > /dev/null

echo ""
if [ $RESULT -eq 124 ]; then
    echo -e "${GREEN}✓${NC} Backend a démarré (timeout après 5s = normal)"
elif [ $RESULT -eq 0 ]; then
    echo -e "${YELLOW}⚠${NC} Backend s'est arrêté immédiatement"
else
    echo -e "${RED}✗${NC} Erreur de démarrage (code $RESULT)"
fi

# ============================================================================
# 9. VÉRIFICATION DES LOGS
# ============================================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}9️⃣ Vérification des logs${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f "logs/backend.log" ]; then
    echo "📋 Dernières lignes de logs/backend.log:"
    tail -30 logs/backend.log
else
    echo -e "${YELLOW}⚠${NC} Aucun fichier logs/backend.log"
fi

# ============================================================================
# RÉSUMÉ ET RECOMMANDATIONS
# ============================================================================

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                        📊 RÉSUMÉ                               ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

if [ -n "$BACKEND_FILE" ]; then
    echo -e "${GREEN}✓${NC} Backend trouvé: $BACKEND_FILE"
else
    echo -e "${RED}✗${NC} Backend non trouvé"
fi

echo ""
echo "🔧 Pour démarrer manuellement:"
echo "   cd $(dirname "$BACKEND_FILE")"
echo "   $PYTHON_CMD $(basename "$BACKEND_FILE")"
echo ""
echo "📋 Pour voir les logs en direct:"
echo "   tail -f logs/backend.log"
echo ""