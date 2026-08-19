#!/bin/bash

# ============================================================================
# ZNK237 - Build Standalone Complet avec Python Embarqué
# ============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║      🚀 ZNK237 - BUILD STANDALONE 100% (avec Python)         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# ============================================================================
# 1. VÉRIFICATIONS
# ============================================================================

echo -e "${BLUE}📋 Étape 1/7 - Vérifications${NC}"
echo ""

# Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js requis${NC}"
    echo "   Télécharger: https://nodejs.org"
    exit 1
fi
echo -e "${GREEN}✓${NC} Node.js $(node --version)"

# npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm requis${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} npm $(npm --version)"

# Fichiers critiques
REQUIRED_FILES=(
    "main.js"
    "preload.js"
    "package.json"
    "index.html"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}❌ Fichier manquant: $file${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓${NC} $file"
done

echo ""

# ============================================================================
# 2. VÉRIFICATION PYTHON PORTABLE
# ============================================================================

echo -e "${BLUE}📋 Étape 2/7 - Vérification Python portable${NC}"
echo ""

if [ ! -d "python-portable" ]; then
    echo -e "${RED}❌ Dossier python-portable/ manquant${NC}"
    echo ""
    echo "   Vous devez d'abord créer le Python portable:"
    echo ""
    echo "   1. Lancez: ./setup-python-portable.sh"
    echo "   2. Attendez la fin du téléchargement"
    echo "   3. Relancez ce script"
    echo ""
    exit 1
fi

PYTHON_BIN="python-portable/python/bin/python3"
if [ ! -f "$PYTHON_BIN" ]; then
    echo -e "${RED}❌ Python executable manquant: $PYTHON_BIN${NC}"
    echo ""
    echo "   Relancez: ./setup-python-portable.sh"
    echo ""
    exit 1
fi

# Vérifier que Python fonctionne
if ! "$PYTHON_BIN" --version &> /dev/null; then
    echo -e "${RED}❌ Python ne fonctionne pas${NC}"
    exit 1
fi

PYTHON_VERSION=$("$PYTHON_BIN" --version)
echo -e "${GREEN}✓${NC} Python portable trouvé: $PYTHON_VERSION"

# Vérifier backend
if [ ! -f "python-portable/backend/server.py" ]; then
    echo -e "${RED}❌ Backend manquant dans python-portable/${NC}"
    echo "   Relancez: ./setup-python-portable.sh"
    exit 1
fi
echo -e "${GREEN}✓${NC} Backend Flask présent"

# Vérifier P2P
if [ ! -f "python-portable/znk_p2p_protocol.py" ]; then
    echo -e "${RED}❌ P2P manquant dans python-portable/${NC}"
    echo "   Relancez: ./setup-python-portable.sh"
    exit 1
fi
echo -e "${GREEN}✓${NC} Protocole P2P présent"

# Vérifier Flask
if ! "$PYTHON_BIN" -c "import flask" &> /dev/null; then
    echo -e "${RED}❌ Flask non installé dans Python portable${NC}"
    echo "   Relancez: ./setup-python-portable.sh"
    exit 1
fi
echo -e "${GREEN}✓${NC} Flask installé"

echo ""

# ============================================================================
# 3. TAILLE PYTHON PORTABLE
# ============================================================================

echo -e "${BLUE}📋 Étape 3/7 - Analyse taille${NC}"
echo ""

PYTHON_SIZE=$(du -sh python-portable | cut -f1)
echo "   Taille Python portable: $PYTHON_SIZE"

# Avertissement si trop gros
PYTHON_SIZE_MB=$(du -sm python-portable | cut -f1)
if [ $PYTHON_SIZE_MB -gt 150 ]; then
    echo -e "${YELLOW}⚠️  Python > 150MB${NC}"
    echo "   L'app finale sera volumineuse (~200-300MB)"
    echo ""
    echo -n "   Continuer quand même ? (y/n) "
    read -n 1 CONTINUE
    echo ""
    if [ "$CONTINUE" != "y" ] && [ "$CONTINUE" != "Y" ]; then
        echo "Build annulé"
        exit 0
    fi
fi

echo ""

# ============================================================================
# 4. NETTOYAGE
# ============================================================================

echo -e "${BLUE}📋 Étape 4/7 - Nettoyage${NC}"
echo ""

rm -rf dist
rm -rf node_modules/.cache

echo -e "${GREEN}✓${NC} Anciens builds supprimés"
echo ""

# ============================================================================
# 5. DÉPENDANCES NODE
# ============================================================================

echo -e "${BLUE}📋 Étape 5/7 - Installation dépendances Node${NC}"
echo ""

npm install --silent

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Dépendances installées"
else
    echo -e "${RED}❌ Erreur npm install${NC}"
    exit 1
fi

echo ""

# ============================================================================
# 6. VÉRIFICATION FINALE
# ============================================================================

echo -e "${BLUE}📋 Étape 6/7 - Vérification pré-build${NC}"
echo ""

echo "📦 Contenu à builder:"
echo ""
echo "   Electron:"
echo "   ├── main.js, preload.js"
echo "   ├── index.html + index/"
echo "   └── assets/"
echo ""
echo "   Python Portable ($PYTHON_SIZE):"
echo "   ├── python/bin/python3"
echo "   ├── backend/server.py"
echo "   └── znk_p2p_protocol.py"
echo ""

# ============================================================================
# 7. BUILD ELECTRON
# ============================================================================

echo -e "${BLUE}📋 Étape 7/7 - Build Electron${NC}"
echo ""

# Détecter architecture
ARCH=$(uname -m)
if [ "$ARCH" == "arm64" ]; then
    BUILD_ARCH="--arm64"
    echo "   Architecture: Apple Silicon (ARM64)"
elif [ "$ARCH" == "x86_64" ]; then
    BUILD_ARCH="--x64"
    echo "   Architecture: Intel (x64)"
else
    BUILD_ARCH="--x64 --arm64"
    echo "   Architecture: Universal"
fi

echo ""
echo -e "${YELLOW}🔨 Compilation en cours (cela peut prendre 2-5 minutes)...${NC}"
echo ""

npm run build -- $BUILD_ARCH

if [ $? -eq 0 ]; then
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                ✅ BUILD RÉUSSI - 100% STANDALONE              ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    
    if [ -d "dist" ]; then
        echo -e "${GREEN}📦 Fichiers créés dans dist/:${NC}"
        echo ""
        
        # DMG
        if ls dist/*.dmg 1> /dev/null 2>&1; then
            for dmg in dist/*.dmg; do
                SIZE=$(du -h "$dmg" | cut -f1)
                echo "   📀 $(basename "$dmg")"
                echo "      Taille: $SIZE"
                echo ""
            done
        fi
        
        # APP
        if ls dist/mac*/*.app 1> /dev/null 2>&1; then
            for app in dist/mac*/*.app; do
                SIZE=$(du -sh "$app" | cut -f1)
                echo "   📱 $(basename "$app")"
                echo "      Taille: $SIZE"
                echo ""
            done
        fi
        
        # ZIP
        if ls dist/*.zip 1> /dev/null 2>&1; then
            for zip in dist/*.zip; do
                SIZE=$(du -h "$zip" | cut -f1)
                echo "   📦 $(basename "$zip")"
                echo "      Taille: $SIZE"
                echo ""
            done
        fi
        
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo -e "${GREEN}🎉 SUCCÈS - Application 100% Standalone${NC}"
        echo ""
        echo "✅ Inclus:"
        echo "   • Python 3.11 embarqué"
        echo "   • Backend Flask"
        echo "   • Protocole P2P"
        echo "   • Interface complète"
        echo "   • Aucune dépendance externe"
        echo ""
        echo "📖 Pour distribuer:"
        echo ""
        echo "   1. Envoyez le fichier .dmg"
        echo "   2. User double-clic → Glisse dans Applications"
        echo "   3. Premier lancement: Ctrl+Clic → Ouvrir"
        echo ""
        echo -e "${BLUE}ℹ️  Pourquoi Ctrl+Clic ?${NC}"
        echo "   Votre app n'est pas signée Apple (pas de certificat)."
        echo "   macOS bloque les apps non signées par défaut."
        echo "   Ctrl+Clic contourne cette sécurité."
        echo ""
        echo -e "${YELLOW}💡 Astuce:${NC}"
        echo "   Testez l'app sur votre Mac avant de distribuer:"
        echo "   open dist/mac*/ZNK237.app"
        echo ""
        
    else
        echo -e "${RED}❌ dist/ non créé${NC}"
        exit 1
    fi
    
else
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                     ❌ BUILD ÉCHOUÉ                            ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    echo -e "${RED}Causes possibles:${NC}"
    echo "  • Python portable incomplet"
    echo "  • Fichiers manquants"
    echo "  • Permissions insuffisantes"
    echo "  • Mémoire insuffisante"
    echo ""
    echo "Solutions:"
    echo "  1. Vérifier: ls -la python-portable/"
    echo "  2. Relancer: ./setup-python-portable.sh"
    echo "  3. Nettoyer: rm -rf dist node_modules && npm install"
    echo ""
    exit 1
fi

# ============================================================================
# TEST OPTIONNEL
# ============================================================================

echo -e "${BLUE}🧪 Voulez-vous tester l'app maintenant ? (y/n)${NC}"
read -t 10 -n 1 TEST_NOW || TEST_NOW="n"
echo ""

if [ "$TEST_NOW" == "y" ] || [ "$TEST_NOW" == "Y" ]; then
    echo -e "${GREEN}🚀 Lancement de l'app...${NC}"
    echo ""
    
    if [ -d "dist/mac/ZNK237.app" ]; then
        open "dist/mac/ZNK237.app"
    elif [ -d "dist/mac-arm64/ZNK237.app" ]; then
        open "dist/mac-arm64/ZNK237.app"
    elif [ -d "dist/mac-x64/ZNK237.app" ]; then
        open "dist/mac-x64/ZNK237.app"
    else
        echo -e "${YELLOW}⚠️  .app non trouvé directement${NC}"
        echo "   Installez le .dmg d'abord"
    fi
fi

echo ""
echo -e "${GREEN}✅ Build terminé avec succès !${NC}"
echo ""