#!/usr/bin/env node

/**
 * Script de vérification pré-build
 * Vérifie que tous les fichiers nécessaires sont présents
 */

const fs = require('fs');
const path = require('path');

const REQUIRED_FILES = [
    'main.js',
    'preload.js',
    'index.html',
    'package.json',
    'manifest-manager.js',
    'user-storage-native.js',
    'path-helper.js',
    'updater.js'
];

const REQUIRED_DIRS = [
    'assets',
    'bin'
];

const OPTIONAL_PAGES = [
    'ZNKStudiosDash.html',
    'auth-hub.html'
];

console.log('🔍 Vérification des fichiers pour le build...\n');

let errors = 0;
let warnings = 0;

// Vérifier les fichiers obligatoires
console.log('📄 Fichiers obligatoires:');
REQUIRED_FILES.forEach(file => {
    const exists = fs.existsSync(path.join(__dirname, '..', file));
    if (exists) {
        console.log(`  ✅ ${file}`);
    } else {
        console.log(`  ❌ ${file} - MANQUANT`);
        errors++;
    }
});

// Vérifier les dossiers obligatoires
console.log('\n📁 Dossiers obligatoires:');
REQUIRED_DIRS.forEach(dir => {
    const dirPath = path.join(__dirname, '..', dir);
    const exists = fs.existsSync(dirPath);
    if (exists) {
        const files = fs.readdirSync(dirPath);
        console.log(`  ✅ ${dir}/ (${files.length} fichiers)`);
    } else {
        console.log(`  ❌ ${dir}/ - MANQUANT`);
        errors++;
    }
});

// Vérifier les pages optionnelles
console.log('\n📄 Pages optionnelles:');
OPTIONAL_PAGES.forEach(file => {
    const exists = fs.existsSync(path.join(__dirname, '..', file));
    if (exists) {
        console.log(`  ✅ ${file}`);
    } else {
        console.log(`  ⚠️  ${file} - absent (optionnel)`);
        warnings++;
    }
});

// Vérifier la taille du dossier assets/videos
const videosDir = path.join(__dirname, '..', 'assets', 'videos');
if (fs.existsSync(videosDir)) {
    const files = fs.readdirSync(videosDir);
    const videoFiles = files.filter(f => /\.(mp4|webm|mov)$/i.test(f));
    
    let totalSize = 0;
    videoFiles.forEach(file => {
        const stats = fs.statSync(path.join(videosDir, file));
        totalSize += stats.size;
    });
    
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    console.log(`\n📊 Vidéos dans assets/videos: ${videoFiles.length} fichiers (${totalSizeMB} MB)`);
    
    if (totalSize > 500 * 1024 * 1024) { // > 500MB
        console.log('  ⚠️  ATTENTION: Les vidéos représentent plus de 500MB');
        console.log('     Elles seront EXCLUES du build (voir package.json)');
        console.log('     Utilisez plutôt persistent-videos pour les données utilisateur');
        warnings++;
    }
}

// Vérifier package.json
const packageJson = require('../package.json');
console.log(`\n📦 Package:
  Nom: ${packageJson.name}
  Version: ${packageJson.version}
  Main: ${packageJson.main}
  Output: ${packageJson.build?.directories?.output || 'dist'}`);

// Résumé
console.log(`\n${'='.repeat(50)}`);
if (errors > 0) {
    console.log(`❌ ${errors} erreur(s) critique(s) détectée(s)`);
    console.log('   Le build échouera probablement.');
    process.exit(1);
} else if (warnings > 0) {
    console.log(`⚠️  ${warnings} avertissement(s)`);
    console.log('✅ Tous les fichiers obligatoires sont présents');
    console.log('   Le build peut continuer mais vérifiez les avertissements.');
    process.exit(0);
} else {
    console.log('✅ Tous les fichiers sont présents');
    console.log('   Prêt pour le build!');
    process.exit(0);
}
