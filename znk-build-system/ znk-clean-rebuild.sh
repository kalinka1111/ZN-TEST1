#!/bin/bash
# ZNK CLEAN & REBUILD - Nettoie tout et reconstruit proprement

set -e

echo "🧹 NETTOYAGE COMPLET ZNK237-APP"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. SUPPRIMER TOUS LES BUILDS EXISTANTS
echo "🗑️  Suppression des anciens builds..."
rm -rf dist/
rm -rf build/
rm -rf electron/dist/
rm -rf electron/build/
echo "✅ Anciens builds supprimés"
echo ""

# 2. NETTOYER LES FICHIERS BUILD TEMPORAIRES
echo "🗑️  Nettoyage fichiers temporaires..."
rm -f main-build.js
rm -f path-adapter.js
rm -f preload-build.js
rm -f package-build.json
rm -f electron/main-build.js
rm -f electron/path-adapter.js
rm -f electron/preload-build.js
echo "✅ Fichiers temporaires supprimés"
echo ""

# 3. SAUVEGARDER LES FICHIERS IMPORTANTS
echo "💾 Sauvegarde fichiers importants..."
if [ -f "package.json" ]; then
    cp package.json package-original-backup.json
    echo "✅ package.json sauvegardé"
fi
if [ -f "electron/main.js" ]; then
    cp electron/main.js electron/main-original-backup.js
    echo "✅ electron/main.js sauvegardé"
fi
echo ""

# 4. CRÉER LA STRUCTURE PROPRE
echo "📁 Création structure propre..."
mkdir -p znk-build-system
echo "✅ znk-build-system/ créé"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ NETTOYAGE TERMINÉ"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 PROCHAINE ÉTAPE:"
echo "   node znk-build-system/generate-all.js"