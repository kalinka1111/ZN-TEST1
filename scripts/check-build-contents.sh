#!/bin/bash

# Script pour vérifier le contenu du build macOS

BUILD_PATH="/Volumes/ZNKfly/ZNK_Builds/mac/ZNK.app"

echo "🔍 VÉRIFICATION DU BUILD"
echo "======================="
echo ""

if [ ! -d "$BUILD_PATH" ]; then
    echo "❌ Build non trouvé: $BUILD_PATH"
    exit 1
fi

echo "✅ Build trouvé: $BUILD_PATH"
echo ""

# Vérifier l'ASAR
ASAR_PATH="$BUILD_PATH/Contents/Resources/app.asar"
if [ -f "$ASAR_PATH" ]; then
    echo "✅ app.asar trouvé"
    ASAR_SIZE=$(du -h "$ASAR_PATH" | cut -f1)
    echo "   Taille: $ASAR_SIZE"
    echo ""
    
    # Extraire et vérifier le contenu
    TEMP_DIR=$(mktemp -d)
    echo "📦 Extraction de l'ASAR..."
    npx asar extract "$ASAR_PATH" "$TEMP_DIR"
    
    echo ""
    echo "📄 Fichiers à la racine de l'ASAR:"
    ls -lh "$TEMP_DIR" | grep -E '\.(js|html|json)$'
    
    echo ""
    echo "🔍 Vérification des fichiers critiques:"
    
    CRITICAL_FILES=("main.js" "preload.js" "index.html" "package.json" "manifest-manager.js" "user-storage-native.js")
    
    for file in "${CRITICAL_FILES[@]}"; do
        if [ -f "$TEMP_DIR/$file" ]; then
            SIZE=$(du -h "$TEMP_DIR/$file" | cut -f1)
            echo "   ✅ $file ($SIZE)"
        else
            echo "   ❌ $file - MANQUANT !"
        fi
    done
    
    echo ""
    echo "📁 Dossiers dans l'ASAR:"
    find "$TEMP_DIR" -maxdepth 1 -type d ! -name "$(basename $TEMP_DIR)" -exec basename {} \;
    
    # Vérifier les manifests
    echo ""
    echo "📋 Manifests dans l'ASAR:"
    find "$TEMP_DIR" -name "*manifest*.json" -exec basename {} \;
    
    # Vérifier persistent-videos et persistent-audio
    echo ""
    echo "🎬 Dossiers de persistence:"
    if [ -d "$TEMP_DIR/persistent-videos" ]; then
        VIDEO_COUNT=$(find "$TEMP_DIR/persistent-videos" -type f | wc -l)
        echo "   ✅ persistent-videos/ ($VIDEO_COUNT fichiers)"
    else
        echo "   ⚠️  persistent-videos/ - absent"
    fi
    
    if [ -d "$TEMP_DIR/persistent-audio" ]; then
        AUDIO_COUNT=$(find "$TEMP_DIR/persistent-audio" -type f | wc -l)
        echo "   ✅ persistent-audio/ ($AUDIO_COUNT fichiers)"
    else
        echo "   ⚠️  persistent-audio/ - absent"
    fi
    
    # Nettoyer
    rm -rf "$TEMP_DIR"
    
else
    echo "❌ app.asar non trouvé !"
fi

# Vérifier extraResources
echo ""
echo "🔧 Extra Resources:"
BIN_PATH="$BUILD_PATH/Contents/Resources/bin"
if [ -d "$BIN_PATH" ]; then
    echo "   ✅ bin/ trouvé"
    ls -lh "$BIN_PATH"
else
    echo "   ❌ bin/ non trouvé"
fi

# Vérifier app/assets si utilisé
APP_ASSETS="$BUILD_PATH/Contents/Resources/app/assets"
if [ -d "$APP_ASSETS" ]; then
    echo "   ✅ app/assets/ trouvé"
    du -sh "$APP_ASSETS"
else
    echo "   ⚠️  app/assets/ non trouvé"
fi

echo ""
echo "======================="
echo "✅ Vérification terminée"
echo ""
echo "💡 Pour tester le build:"
echo "   open '$BUILD_PATH'"
