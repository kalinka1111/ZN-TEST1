#!/usr/bin/env node
/**
 * Script de configuration FFmpeg
 * Exécuté automatiquement après npm install
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m',
    bold: '\x1b[1m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function checkFFmpeg() {
    const commands = process.platform === 'win32' ? ['ffmpeg.exe', 'ffmpeg'] : ['ffmpeg'];
    
    for (const cmd of commands) {
        try {
            const result = await new Promise((resolve) => {
                const proc = spawn(cmd, ['-version']);
                proc.on('close', (code) => resolve(code === 0));
                proc.on('error', () => resolve(false));
            });
            
            if (result) return true;
        } catch {
            continue;
        }
    }
    
    return false;
}

async function createBinDirectory() {
    const binDir = path.join(__dirname, '..', 'bin');
    
    if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
        log(`✅ Dossier bin/ créé`, 'green');
    }
    
    // Créer un fichier README dans bin/
    const readmePath = path.join(binDir, 'README.txt');
    const readmeContent = `
Ce dossier peut contenir l'exécutable FFmpeg pour la conversion vidéo.

Instructions:
-------------

Windows:
- Télécharger FFmpeg depuis https://ffmpeg.org/download.html
- Extraire ffmpeg.exe dans ce dossier

macOS/Linux:
- Télécharger FFmpeg depuis https://ffmpeg.org/download.html
- Copier l'exécutable ffmpeg dans ce dossier
- Rendre exécutable: chmod +x bin/ffmpeg

Ou installer FFmpeg système:
-----------------------------

Windows:  choco install ffmpeg
macOS:    brew install ffmpeg
Linux:    sudo apt install ffmpeg

L'application détectera automatiquement FFmpeg installé sur le système.
`.trim();
    
    if (!fs.existsSync(readmePath)) {
        fs.writeFileSync(readmePath, readmeContent);
    }
}

async function main() {
    log('\n╔════════════════════════════════════════════╗', 'blue');
    log('║   🚀 Configuration ZNK SmartHub            ║', 'blue');
    log('╚════════════════════════════════════════════╝\n', 'blue');
    
    // Créer le dossier bin/
    await createBinDirectory();
    
    // Vérifier FFmpeg
    log('🔍 Vérification de FFmpeg...', 'yellow');
    const hasFFmpeg = await checkFFmpeg();
    
    if (hasFFmpeg) {
        log('✅ FFmpeg détecté sur le système', 'green');
        log('   La conversion vidéo est disponible !', 'green');
    } else {
        log('⚠️  FFmpeg non détecté', 'yellow');
        log('\n📖 Pour activer la conversion vidéo, installez FFmpeg:', 'blue');
        
        const platform = process.platform;
        if (platform === 'win32') {
            log('   Windows: choco install ffmpeg', 'reset');
        } else if (platform === 'darwin') {
            log('   macOS: brew install ffmpeg', 'reset');
        } else {
            log('   Linux: sudo apt install ffmpeg', 'reset');
        }
        
        log('\n   Ou placez l\'exécutable FFmpeg dans le dossier bin/', 'reset');
        log('   ℹ️  L\'application fonctionnera sans FFmpeg (sauf conversion vidéo)\n', 'yellow');
    }
    
    log('✨ Configuration terminée !', 'green');
    log('   Démarrez l\'application avec: npm start\n', 'bold');
}

main().catch(error => {
    console.error('Erreur:', error.message);
    process.exit(0); // Ne pas bloquer l'installation
});
