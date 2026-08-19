#!/usr/bin/env node
/**
 * ZNK Build Preparation Script
 * Copie automatiquement les vidéos persistantes et le manifest vers assets/
 * pour inclusion dans le build Electron
 */

const fs = require('fs-extra');
const path = require('path');

// Couleurs console
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m'
};

function log(msg, color = 'reset') {
    console.log(`${colors[color]}${msg}${colors.reset}`);
}

// Déterminer le chemin userData selon la plateforme
function getUserDataPath() {
    const home = process.env.HOME || process.env.USERPROFILE;
    
    if (process.platform === 'darwin') {
        return path.join(home, 'Library', 'Application Support', 'ZNK');
    } else if (process.platform === 'win32') {
        return path.join(home, 'AppData', 'Roaming', 'ZNK');
    } else {
        return path.join(home, '.config', 'ZNK');
    }
}

async function prepareForBuild() {
    log('\n🔧 Préparation du build ZNK...', 'cyan');
    log('━'.repeat(50), 'cyan');
    
    const userDataPath = getUserDataPath();
    const manifestPath = path.join(userDataPath, 'manifests', 'znk-video-manifest.json');
    const persistentVideosPath = path.join(userDataPath, 'persistent-videos');
    
    const projectRoot = path.join(__dirname, '..');
    const targetAssetsPath = path.join(projectRoot, 'assets', 'videos');
    const targetManifestPath = path.join(projectRoot, 'assets', 'znk-video-manifest.json');
    
    log(`\n📁 UserData: ${userDataPath}`, 'bright');
    log(`📁 Target: ${targetAssetsPath}`, 'bright');
    
    try {
        // Vérifier si le manifest existe
        if (!await fs.pathExists(manifestPath)) {
            log('\n⚠️  Aucun manifest vidéo trouvé', 'yellow');
            log('   Aucune vidéo ne sera incluse dans le build', 'yellow');
            log('   Pour inclure des vidéos, utilisez Video Manager en dev', 'yellow');
            return;
        }
        
        // Lire le manifest
        const manifest = await fs.readJson(manifestPath);
        const videos = manifest.items || [];
        
        log(`\n📹 Manifest trouvé: ${videos.length} vidéo(s)`, 'green');
        
        if (videos.length === 0) {
            log('   Aucune vidéo à copier', 'yellow');
            return;
        }
        
        // Créer le dossier cible
        await fs.ensureDir(targetAssetsPath);
        log(`\n✅ Dossier créé: ${targetAssetsPath}`, 'green');
        
        // Statistiques
        let copied = 0;
        let skipped = 0;
        let errors = 0;
        let totalSize = 0;
        
        log('\n🎬 Copie des vidéos...', 'cyan');
        log('━'.repeat(50), 'cyan');
        
        // Copier chaque vidéo
        for (const video of videos) {
            const sourcePath = video.persistentPath || video.path;
            
            if (!sourcePath) {
                log(`⚠️  ${video.id}: Pas de chemin source`, 'yellow');
                skipped++;
                continue;
            }
            
            // Vérifier si le fichier existe
            if (!await fs.pathExists(sourcePath)) {
                log(`⚠️  ${video.id}: Fichier introuvable`, 'yellow');
                log(`   ${sourcePath}`, 'yellow');
                skipped++;
                continue;
            }
            
            try {
                // Obtenir les infos du fichier
                const stats = await fs.stat(sourcePath);
                const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
                totalSize += stats.size;
                
                // Nom du fichier
                const filename = path.basename(sourcePath);
                const destPath = path.join(targetAssetsPath, filename);
                
                // Copier
                await fs.copy(sourcePath, destPath, { overwrite: true });
                
                log(`✅ ${filename} (${sizeMB} MB)`, 'green');
                copied++;
                
            } catch (error) {
                log(`❌ ${video.id}: ${error.message}`, 'red');
                errors++;
            }
        }
        
        // Copier le manifest
        log('\n📋 Copie du manifest...', 'cyan');
        await fs.copy(manifestPath, targetManifestPath, { overwrite: true });
        log('✅ Manifest copié vers assets/', 'green');
        
        // Résumé
        log('\n━'.repeat(50), 'cyan');
        log('📊 RÉSUMÉ', 'bright');
        log('━'.repeat(50), 'cyan');
        log(`✅ Copiées:  ${copied}/${videos.length}`, 'green');
        if (skipped > 0) log(`⚠️  Ignorées:  ${skipped}`, 'yellow');
        if (errors > 0) log(`❌ Erreurs:   ${errors}`, 'red');
        log(`💾 Taille:   ${(totalSize / (1024 * 1024)).toFixed(2)} MB`, 'cyan');
        log('━'.repeat(50), 'cyan');
        
        if (copied > 0) {
            log('\n🎉 Build prêt! Les vidéos seront incluses.', 'green');
        } else {
            log('\n⚠️  Aucune vidéo copiée - le build ne contiendra pas de vidéos', 'yellow');
        }
        
    } catch (error) {
        log('\n❌ ERREUR FATALE', 'red');
        log(error.message, 'red');
        if (error.stack) {
            log('\nStack trace:', 'red');
            log(error.stack, 'red');
        }
        process.exit(1);
    }
}

// Exécuter
prepareForBuild()
    .then(() => {
        log('\n✅ Préparation terminée\n', 'green');
        process.exit(0);
    })
    .catch((error) => {
        log('\n❌ Échec de la préparation', 'red');
        log(error.message, 'red');
        process.exit(1);
    });