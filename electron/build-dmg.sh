#!/bin/bash
# Script de build DMG généré par ZNK DMG Creator
# Projet: ZNK237
# Version: 1.0.0
# Auteur: ZNK Systems

set -e  # Arrêter en cas d'erreur

echo "🍎 Début création DMG pour ZNK237"
echo "📋 Version: 1.0.0"
echo ""

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonction pour afficher les messages colorés
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Vérification de l'environnement
log_info "Vérification de l'environnement..."

if ! command -v node &> /dev/null; then
    log_error "Node.js n'est pas installé"
    echo "Installez Node.js depuis https://nodejs.org/"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    log_error "npm n'est pas installé"
    exit 1
fi

# Afficher les versions
NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
log_success "Node.js $NODE_VERSION détecté"
log_success "npm $NPM_VERSION détecté"

# Nettoyage des builds précédents
if [ -d "dist" ]; then
    log_info "Nettoyage du dossier dist..."
    rm -rf dist/
fi

if [ -d "node_modules" ]; then
    log_info "node_modules existant trouvé"
else
    log_info "Installation des dépendances..."
    npm install
    if [ $? -ne 0 ]; then
        log_error "Erreur lors de l'installation des dépendances"
        exit 1
    fi
    log_success "Dépendances installées"
fi

# Vérification d'Electron
if ! npm list electron &> /dev/null; then
    log_warning "Electron non trouvé, installation..."
    npm install electron --save-dev
fi

# Vérification d'electron-builder
if ! npm list electron-builder &> /dev/null; then
    log_warning "electron-builder non trouvé, installation..."
    npm install electron-builder --save-dev
fi

# Créer le dossier build pour les icônes si nécessaire
if [ ! -d "build" ]; then
    mkdir -p build
    log_info "Dossier build créé pour les icônes"
fi

# Build de l'application
log_info "Compilation de l'application pour macOS..."
npm run build

# Vérification du résultat
if [ -d "dist" ]; then
    log_success "DMG créé avec succès!"
    echo ""
    log_info "Fichiers générés:"
    ls -la dist/
    echo ""
    log_success "Build terminé pour ZNK237!"
    
    # Ouvrir le dossier de distribution
    if command -v open &> /dev/null; then
        log_info "Ouverture du dossier dist..."
        open dist/
    fi
else
    log_error "Erreur lors de la création du DMG"
    echo "Vérifiez les logs ci-dessus pour plus de détails"
    exit 1
fi

log_success "🎉 Build DMG terminé avec succès!"
