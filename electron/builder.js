#!/usr/bin/env node

// ==========================================
// ZNK BUILDER - Script de Build Automatisé
// ==========================================

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Couleurs pour la console
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n${step} ${message}`, 'bright');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

// ==========================================
// BANNER
// ==========================================

console.clear();
log('\n╔══════════════════════════════════════╗', 'cyan');
log('║     🏗️  ZNK BUILDER v1.0.0          ║', 'cyan');
log('╚══════════════════════════════════════╝', 'cyan');
log('');

// ==========================================
// ÉTAPE 1 : VÉRIFICATIONS
// ==========================================

logStep('📋', 'Vérifications préalables...');

// Vérifier Node.js
try {
  const nodeVersion = execSync('node --version', { encoding: 'utf-8' }).trim();
  logSuccess(`Node.js: ${nodeVersion}`);
} catch (error) {
  logError('Node.js non trouvé');
  process.exit(1);
}

// Vérifier npm
try {
  const npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim();
  logSuccess(`npm: ${npmVersion}`);
} catch (error) {
  logError('npm non trouvé');
  process.exit(1);
}

// Vérifier la structure des fichiers
const requiredPaths = [
  { path: '../index.html', name: 'index.html' },
  { path: '../server/server.js', name: 'server/server.js' },
  { path: '../server/package.json', name: 'server/package.json' },
  { path: '../icons', name: 'icons/' },
  { path: '../modules', name: 'modules/' },
  { path: './main.js', name: 'electron/main.js' },
  { path: './preload.js', name: 'electron/preload.js' },
  { path: './package.json', name: 'electron/package.json' }
];

let missingFiles = false;
for (const item of requiredPaths) {
  const fullPath = path.join(__dirname, item.path);
  if (!fs.existsSync(fullPath)) {
    logError(`Fichier manquant: ${item.name}`);
    missingFiles = true;
  } else {
    logSuccess(`${item.name}`);
  }
}

if (missingFiles) {
  logError('\nFichiers manquants - Impossible de continuer');
  process.exit(1);
}

// ==========================================
// ÉTAPE 2 : DÉPENDANCES SERVEUR
// ==========================================

logStep('📦', 'Installation des dépendances serveur...');

const serverDir = path.join(__dirname, '..', 'server');

try {
  // Vérifier si node_modules existe déjà
  const serverNodeModules = path.join(serverDir, 'node_modules');
  
  if (fs.existsSync(serverNodeModules)) {
    logInfo('node_modules serveur déjà présent');
    logInfo('Mise à jour si nécessaire...');
  }
  
  execSync('npm install --production --no-audit --no-fund', {
    cwd: serverDir,
    stdio: 'inherit'
  });
  
  logSuccess('Dépendances serveur installées');
  
} catch (error) {
  logError('Erreur installation dépendances serveur');
  logError(error.message);
  process.exit(1);
}

// ==========================================
// ÉTAPE 3 : DÉPENDANCES ELECTRON
// ==========================================

logStep('📦', 'Installation des dépendances Electron...');

try {
  // Vérifier si node_modules existe déjà
  const electronNodeModules = path.join(__dirname, 'node_modules');
  
  if (fs.existsSync(electronNodeModules)) {
    logInfo('node_modules Electron déjà présent');
  }
  
  execSync('npm install --no-audit --no-fund', {
    cwd: __dirname,
    stdio: 'inherit'
  });
  
  logSuccess('Dépendances Electron installées');
  
} catch (error) {
  logError('Erreur installation dépendances Electron');
  logError(error.message);
  process.exit(1);
}

// ==========================================
// ÉTAPE 4 : PRÉPARATION DES ICÔNES
// ==========================================

logStep('🎨', 'Préparation des icônes...');

const buildResourcesDir = path.join(__dirname, 'build-resources');

// Créer le dossier build-resources s'il n'existe pas
if (!fs.existsSync(buildResourcesDir)) {
  fs.mkdirSync(buildResourcesDir, { recursive: true });
  logSuccess('Dossier build-resources créé');
}

// Vérifier les icônes
const iconsPath = path.join(__dirname, '..', 'icons');
const iconFiles = fs.readdirSync(iconsPath);
const pngIcons = iconFiles.filter(f => f.endsWith('.png'));

if (pngIcons.length > 0) {
  logSuccess(`${pngIcons.length} icônes PNG trouvées`);
  logInfo('Note: Pour un build optimal, convertir en .icns (Mac) et .ico (Win)');
} else {
  logWarning('Aucune icône PNG trouvée');
}

// Copier une icône par défaut si disponible
const defaultIcon = path.join(iconsPath, 'icon.png');
if (fs.existsSync(defaultIcon)) {
  const destIcon = path.join(buildResourcesDir, 'icon.png');
  fs.copyFileSync(defaultIcon, destIcon);
  logSuccess('Icône par défaut copiée');
}

// ==========================================
// ÉTAPE 5 : NETTOYAGE
// ==========================================

logStep('🧹', 'Nettoyage des builds précédents...');

const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  try {
    fs.rmSync(distPath, { recursive: true, force: true });
    logSuccess('Dossier dist nettoyé');
  } catch (error) {
    logWarning('Impossible de nettoyer dist (peut-être en cours d\'utilisation)');
  }
} else {
  logInfo('Aucun build précédent à nettoyer');
}

// ==========================================
// ÉTAPE 6 : BUILD
// ==========================================

const platform = process.platform;
let buildCommand;
let expectedOutput;

logStep('🚀', `Build pour ${platform}...`);
log('');

if (platform === 'darwin') {
  // macOS
  buildCommand = 'npm run build:mac';
  expectedOutput = 'ZNK*.dmg et ZNK*.zip';
  logInfo('Cibles: DMG (installeur) + ZIP (portable)');
  logInfo('Architectures: x64 + arm64 (Apple Silicon)');
  
} else if (platform === 'win32') {
  // Windows
  buildCommand = 'npm run build:win';
  expectedOutput = 'ZNK Setup.exe et ZNK Portable.exe';
  logInfo('Cibles: NSIS (installeur) + Portable (sans installation)');
  logInfo('Architecture: x64');
  
} else {
  logError(`Plateforme non supportée: ${platform}`);
  logInfo('Plateformes supportées: darwin (macOS), win32 (Windows)');
  process.exit(1);
}

log('');
logInfo('⏳ Le build peut prendre 2-5 minutes...');
logInfo('📊 Progression ci-dessous:');
log('');
log('─'.repeat(50), 'cyan');
log('');

try {
  execSync(buildCommand, {
    cwd: __dirname,
    stdio: 'inherit'
  });
  
  log('');
  log('─'.repeat(50), 'cyan');
  log('');
  
} catch (error) {
  log('');
  log('─'.repeat(50), 'cyan');
  log('');
  logError('Erreur lors du build');
  logError(error.message);
  process.exit(1);
}

// ==========================================
// ÉTAPE 7 : VÉRIFICATION DU BUILD
// ==========================================

logStep('🔍', 'Vérification du build...');

if (fs.existsSync(distPath)) {
  const distFiles = fs.readdirSync(distPath);
  
  if (distFiles.length > 0) {
    logSuccess('Build terminé avec succès !');
    log('');
    log('📦 Fichiers générés:', 'bright');
    
    distFiles.forEach(file => {
      const filePath = path.join(distPath, file);
      const stats = fs.statSync(filePath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      log(`   • ${file} (${sizeMB} MB)`, 'green');
    });
    
  } else {
    logWarning('Dossier dist vide');
  }
} else {
  logError('Dossier dist non créé');
  process.exit(1);
}

// ==========================================
// RÉSUMÉ FINAL
// ==========================================

log('');
log('╔══════════════════════════════════════╗', 'cyan');
log('║   🎉 BUILD TERMINÉ AVEC SUCCÈS      ║', 'cyan');
log('╚══════════════════════════════════════╝', 'cyan');
log('');

log('📍 Emplacement:', 'bright');
log(`   ${distPath}`, 'cyan');
log('');

log('📖 Instructions:', 'bright');

if (platform === 'darwin') {
  log('   • Fichier .dmg: Drag & drop dans /Applications', 'cyan');
  log('   • Fichier .zip: Extraire et déplacer ZNK.app', 'cyan');
  log('');
  log('⚠️  Note macOS:', 'yellow');
  log('   Si "app endommagée" au premier lancement:', 'yellow');
  log('   → Clic droit > Ouvrir > Ouvrir quand même', 'yellow');
  log('   → Ou: xattr -cr ZNK.app', 'yellow');
  
} else if (platform === 'win32') {
  log('   • Setup.exe: Installeur classique', 'cyan');
  log('   • Portable.exe: Lance directement sans installation', 'cyan');
}

log('');
log('🚀 Distribution:', 'bright');
log('   1. Tester le fichier généré', 'cyan');
log('   2. Distribuer à tes utilisateurs', 'cyan');
log('   3. Ils double-cliquent → ZNK démarre !', 'cyan');
log('');

log('💡 Conseils:', 'bright');
log('   • Taille: ~200-300 MB (normal, Node.js inclus)', 'cyan');
log('   • Premier lancement: 3-5 secondes', 'cyan');
log('   • Pas de configuration utilisateur nécessaire', 'cyan');
log('');

log('🎊 Merci d\'utiliser ZNK Builder !', 'bright');
log('');