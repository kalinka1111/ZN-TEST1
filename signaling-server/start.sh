#!/bin/bash

# Script de démarrage ZNK - Vérifie la structure

echo "╔═══════════════════════════════════════╗"
echo "║   🚀 ZNK SYSTEM LAUNCHER              ║"
echo "╚═══════════════════════════════════════╝"
echo ""

# Aller dans le dossier du script
cd "$(dirname "$0")"

echo "📁 Dossier actuel: $(pwd)"
echo ""

# Vérifications
if [ ! -d "server" ]; then
    echo "❌ Erreur: Dossier 'server/' introuvable"
    echo "   Vous devez être dans ZNK237/"
    echo ""
    echo "📂 Contenu actuel:"
    ls -la
    exit 1
fi

if [ ! -d "electron" ]; then
    echo "❌ Erreur: Dossier 'electron/' introuvable"
    exit 1
fi

if [ ! -f "package.json" ]; then
    echo "❌ Erreur: package.json introuvable"
    exit 1
fi

echo "✅ Structure vérifiée"
echo ""

# Vérifier node_modules
if [ ! -d "node_modules" ]; then
    echo "📦 Installation des dépendances..."
    npm install
    echo ""
fi

# Lancer Electron
echo "🚀 Démarrage de ZNK..."
echo ""

npm start