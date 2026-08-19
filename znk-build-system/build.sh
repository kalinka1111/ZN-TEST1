#!/bin/bash
# Script de build généré automatiquement

echo "🚀 Préparation du build avec adaptateur..."

# Copier les fichiers de build dans le projet
cp build-files/path-adapter.js ./
cp build-files/preload-build.js ./
cp build-files/main-build.js ./

# Sauvegarder package.json original
if [ -f "package.json" ]; then
    cp package.json package-original.json
    echo "✅ package.json original sauvegardé"
fi

# Utiliser package-build.json pour le build
cp build-files/package-build.json package.json

# Installer les dépendances si nécessaire
if [ ! -d "node_modules" ]; then
    echo "📦 Installation des dépendances..."
    npm install
fi

# Build
echo "🔨 Build en cours..."
npm run build

# Restaurer package.json original
if [ -f "package-original.json" ]; then
    mv package-original.json package.json
    echo "✅ package.json original restauré"
fi

# Nettoyer les fichiers temporaires
rm -f path-adapter.js preload-build.js main-build.js

echo "✅ Build terminé ! Voir dossier dist/"
