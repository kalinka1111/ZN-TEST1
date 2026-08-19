#!/usr/bin/env node
/**
 * Script de vérification FFmpeg
 * Vérifie si FFmpeg est installé sur le système
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function getFFmpegPaths() {
    const platform = process.platform;
    const binDir = path.join(__dirname, '..', 'bin');
    
    const paths = {
        win32: [
            path.join(binDir, 'ffmpeg.exe'),
            'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
            'ffmpeg.exe'
        ],
        darwin: [
            path.join(binDir, 'ffmpeg'),
            '/usr/local/bin/ffmpeg',
            '/opt/homebrew/bin/ffmpeg',
            'ffmpeg'
        ],
        linux: [
            path.join(binDir, 'ffmpeg'),
            '/usr/bin/ffmpeg',
            '/usr/local/bin/ffmpeg',
            'ffmpeg'
        ]
    };
    
    return paths[platform] || paths.linux;
}

async function checkFFmpeg(ffmpegPath) {
    return new Promise((resolve) => {
        const process = spawn(ffmpegPath, ['-version']);
        let output = '';
        
        process.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        process.on('close', (code) => {
            if (code === 0) {
                const versionMatch = output.match(/ffmpeg version ([^\s]+)/);
                const version = versionMatch ? versionMatch[1] : 'unknown';
                resolve({ success: true, version, path: ffmpegPath });
            } else {
                resolve({ success: false });
            }
        });
        
        process.on('error', () => {
            resolve({ success: false });
        });
    });
}

async function main() {
    log('\n╔════════════════════════════════════════════╗', 'cyan');
    log('║   🎬 Vérification FFmpeg - ZNK SmartHub   ║', 'cyan');
    log('╚════════════════════════════════════════════╝\n', 'cyan');
    
    const paths = getFFmpegPaths();
    let foundFFmpeg = null;
    
    log('🔍 Recherche de FFmpeg...\n', 'yellow');
    
    for (const ffmpegPath of paths) {
        log(`   Vérification: ${ffmpegPath}`, 'reset');
        const result = await checkFFmpeg(ffmpegPath);
        
        if (result.success) {
            foundFFmpeg = result;
            break;
        }
    }
    
    console.log('');
    
    if (foundFFmpeg) {
        log('✅ FFmpeg trouvé !', 'green');
        log(`   📍 Chemin: ${foundFFmpeg.path}`, 'green');
        log(`   📦 Version: ${foundFFmpeg.version}`, 'green');
        log('\n✨ La conversion vidéo est disponible !', 'bold');
        process.exit(0);
    } else {
        log('❌ FFmpeg non trouvé', 'red');
        log('\n📖 Instructions d\'installation :', 'yellow');
        
        const platform = process.platform;
        if (platform === 'win32') {
            log('\n   Windows:', 'cyan');
            log('   • Chocolatey: choco install ffmpeg', 'reset');
            log('   • Scoop: scoop install ffmpeg', 'reset');
            log('   • Manuel: https://ffmpeg.org/download.html', 'reset');
        } else if (platform === 'darwin') {
            log('\n   macOS:', 'cyan');
            log('   • Homebrew: brew install ffmpeg', 'reset');
            log('   • MacPorts: sudo port install ffmpeg', 'reset');
        } else {
            log('\n   Linux:', 'cyan');
            log('   • Ubuntu/Debian: sudo apt install ffmpeg', 'reset');
            log('   • Fedora: sudo dnf install ffmpeg', 'reset');
            log('   • Arch: sudo pacman -S ffmpeg', 'reset');
        }
        
        log('\n⚠️  La conversion vidéo ne sera pas disponible sans FFmpeg', 'yellow');
        log('   Les autres fonctionnalités de ZNK SmartHub fonctionneront normalement.\n', 'reset');
        
        // Ne pas faire échouer l'installation
        process.exit(0);
    }
}

main().catch(error => {
    log(`\n❌ Erreur: ${error.message}`, 'red');
    process.exit(0); // Ne pas bloquer l'installation
});
