@echo off
REM Script de build Windows EXE généré par ZNK DMG Creator
REM Projet: ZNK237
REM Version: 1.0.0
REM Auteur: ZNK Systems

setlocal enabledelayedexpansion

echo 🪟 Début création EXE pour ZNK237
echo 📋 Version: 1.0.0
echo.

REM Vérification Node.js
echo ℹ️ Vérification de l'environnement...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js n'est pas installé
    echo Installez Node.js depuis https://nodejs.org/
    pause
    exit /b 1
)

npm --version >nul 2>&1
if errorlevel 1 (
    echo ❌ npm n'est pas installé
    pause
    exit /b 1
)

REM Affichage des versions
for /f %%i in ('node --version') do set NODE_VERSION=%%i
for /f %%i in ('npm --version') do set NPM_VERSION=%%i
echo ✅ Node.js !NODE_VERSION! détecté
echo ✅ npm !NPM_VERSION! détecté

REM Nettoyage
if exist "dist" (
    echo ℹ️ Nettoyage du dossier dist...
    rmdir /s /q "dist"
)

REM Installation des dépendances
if exist "node_modules" (
    echo ℹ️ node_modules existant trouvé
) else (
    echo ℹ️ Installation des dépendances...
    npm install
    if errorlevel 1 (
        echo ❌ Erreur lors de l'installation des dépendances
        pause
        exit /b 1
    )
    echo ✅ Dépendances installées
)

REM Vérification d'Electron
npm list electron >nul 2>&1
if errorlevel 1 (
    echo ⚠️ Electron non trouvé, installation...
    npm install electron --save-dev
)

REM Vérification d'electron-builder
npm list electron-builder >nul 2>&1
if errorlevel 1 (
    echo ⚠️ electron-builder non trouvé, installation...
    npm install electron-builder --save-dev
)

REM Créer le dossier build
if not exist "build" (
    mkdir build
    echo ℹ️ Dossier build créé pour les icônes
)

REM Build de l'application
echo ℹ️ Compilation de l'application pour Windows...
npm run build

REM Vérification du résultat
if exist "dist" (
    echo ✅ EXE créé avec succès!
    echo.
    echo ℹ️ Fichiers générés:
    dir dist
    echo.
    echo ✅ Build terminé pour ZNK237!
    
    REM Ouvrir le dossier
    start dist\
) else (
    echo ❌ Erreur lors de la création de l'EXE
    echo Vérifiez les logs ci-dessus pour plus de détails
    pause
    exit /b 1
)

echo 🎉 Build EXE terminé avec succès!
pause
