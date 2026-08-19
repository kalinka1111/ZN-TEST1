@echo off
REM ========================================
REM ZNK System - Script de Démarrage Windows
REM ========================================

title ZNK System Launcher
color 0A

echo.
echo ========================================
echo    ZNK SYSTEM - LAUNCHER
echo ========================================
echo.

REM ========================================
REM 1. VÉRIFICATIONS
REM ========================================

echo [*] Verification des prerequis...
echo.

REM Vérifier Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo [X] Node.js n'est pas installe
    echo     Installez-le depuis: https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo [OK] Node.js detecte: %NODE_VERSION%

REM Vérifier npm
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo [X] npm n'est pas installe
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
echo [OK] npm detecte: %NPM_VERSION%

echo.

REM ========================================
REM 2. STRUCTURE DES DOSSIERS
REM ========================================

echo [*] Verification de la structure...

if not exist "server\data\workflows" mkdir "server\data\workflows"
if not exist "server\data\published" mkdir "server\data\published"
if not exist "js" mkdir "js"
if not exist "logs" mkdir "logs"

echo [OK] Structure des dossiers creee
echo.

REM ========================================
REM 3. INSTALLATION DES DÉPENDANCES
REM ========================================

echo [*] Installation des dependances...

cd server

if not exist "package.json" (
    echo [!] package.json introuvable, creation...
    (
        echo {
        echo   "name": "znk-sync-server",
        echo   "version": "1.0.0",
        echo   "description": "Serveur de synchronisation ZNK",
        echo   "main": "server.js",
        echo   "scripts": {
        echo     "start": "node server.js"
        echo   },
        echo   "dependencies": {
        echo     "express": "^4.18.2",
        echo     "cors": "^2.8.5"
        echo   }
        echo }
    ) > package.json
)

if not exist "node_modules" (
    echo Installation en cours...
    call npm install --silent
    echo [OK] Dependances installees
) else (
    echo [i] Dependances deja installees
)

cd ..
echo.

REM ========================================
REM 4. DÉTECTION DE L'IP LOCALE
REM ========================================

echo [*] Detection de l'adresse IP...

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set LOCAL_IP=%%a
    goto :ip_found
)

:ip_found
set LOCAL_IP=%LOCAL_IP:~1%
echo [OK] IP locale: %LOCAL_IP%
echo.

REM ========================================
REM 5. AFFICHAGE DES INFORMATIONS
REM ========================================

echo ==========================================
echo    INFORMATIONS DE CONNEXION
echo ==========================================
echo.
echo  Local:    http://localhost:3000
echo  Reseau:   http://%LOCAL_IP%:3000
echo.
echo  Admin:    archives.html
echo  ACTV:     actv.html
echo.
echo ==========================================
echo.

REM ========================================
REM 6. MENU DE DÉMARRAGE
REM ========================================

:menu
echo Choisissez le mode de demarrage:
echo.
echo 1) Demarrage simple (Ctrl+C pour arreter)
echo 2) Demarrage en arriere-plan
echo 3) Ouvrir les interfaces (+ demarrage serveur)
echo 4) Arreter le serveur
echo 5) Voir les logs
echo 6) Quitter
echo.

set /p choice="Votre choix (1-6): "

if "%choice%"=="1" goto start_simple
if "%choice%"=="2" goto start_background
if "%choice%"=="3" goto start_with_ui
if "%choice%"=="4" goto stop_server
if "%choice%"=="5" goto show_logs
if "%choice%"=="6" goto end

echo [X] Choix invalide
goto menu

REM ========================================
REM DÉMARRAGE SIMPLE
REM ========================================

:start_simple
echo.
echo [*] Demarrage du serveur...
echo     Appuyez sur Ctrl+C pour arreter
echo.
cd server
node server.js
goto end

REM ========================================
REM DÉMARRAGE EN ARRIÈRE-PLAN
REM ========================================

:start_background
echo.
echo [*] Demarrage en arriere-plan...

REM Vérifier si déjà lancé
if exist "server\.pid" (
    set /p PID=<server\.pid
    tasklist /FI "PID eq %PID%" 2>nul | find "%PID%" >nul
    if %ERRORLEVEL% EQU 0 (
        color 0E
        echo [!] Le serveur est deja en cours d'execution (PID: %PID%)
        echo     Utilisez l'option 4 pour l'arreter
        pause
        goto menu
    )
)

REM Démarrer
cd server
start /B node server.js > ..\logs\server.log 2>&1
for /f "tokens=2" %%i in ('tasklist /FI "IMAGENAME eq node.exe" /NH') do (
    echo %%i > .pid
    goto pid_saved
)

:pid_saved
cd ..

set /p SERVER_PID=<server\.pid
echo [OK] Serveur demarre (PID: %SERVER_PID%)
echo     Logs: type logs\server.log
echo     Arret: start.bat puis option 4
pause
goto menu

REM ========================================
REM DÉMARRAGE AVEC INTERFACES
REM ========================================

:start_with_ui
echo.
echo [*] Demarrage du serveur et ouverture des interfaces...

REM Démarrer le serveur
cd server
start /B node server.js > ..\logs\server.log 2>&1
for /f "tokens=2" %%i in ('tasklist /FI "IMAGENAME eq node.exe" /NH') do (
    echo %%i > .pid
    goto ui_pid_saved
)

:ui_pid_saved
cd ..

set /p SERVER_PID=<server\.pid
echo [OK] Serveur demarre (PID: %SERVER_PID%)

REM Attendre que le serveur soit prêt
echo [*] Attente du demarrage du serveur...
timeout /t 3 /nobreak >nul

REM Ouvrir les interfaces
echo [*] Ouverture des interfaces...
start "" "%CD%\archives.html"
timeout /t 1 /nobreak >nul
start "" "%CD%\actv.html"

echo.
echo [OK] Interfaces ouvertes
echo     Arret: start.bat puis option 4
pause
goto menu

REM ========================================
REM ARRÊTER LE SERVEUR
REM ========================================

:stop_server
echo.
echo [*] Arret du serveur...

if exist "server\.pid" (
    set /p PID=<server\.pid
    taskkill /F /PID %PID% >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        del server\.pid
        echo [OK] Serveur arrete
    ) else (
        echo [!] Serveur non actif
        del server\.pid
    )
) else (
    echo [!] Aucun serveur en cours d'execution
)

pause
goto menu

REM ========================================
REM VOIR LES LOGS
REM ========================================

:show_logs
echo.
echo [*] Affichage des logs...
echo     Appuyez sur Ctrl+C pour quitter
echo.

if exist "logs\server.log" (
    type logs\server.log
    echo.
    echo [Fin des logs]
) else (
    echo [!] Aucun fichier de logs trouve
)

pause
goto menu

REM ========================================
REM FIN
REM ========================================

:end
echo.
echo ==========================================
echo    CONSEILS
echo ==========================================
echo.
echo  * Admin (archives.html) : Creez et publiez des workflows
echo  * ACTV (actv.html) : Visualisez les workflows publies
echo  * Les workflows sont stockes dans: server\data\published
echo  * Partagez http://%LOCAL_IP%:3000 aux autres appareils
echo.
echo  ZNK System est pret!
echo.
pause