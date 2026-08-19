#!/usr/bin/env node
/**
 * Vérifie que tout est en place pour le build
 */

const fs = require('fs');
const path = require('path');

const checks = {
    passed: 0,
    failed: 0,
    warnings: 0
};

function check(name, test, required = true) {
    process.stdout.write(`${name}... `);
    
    try {
        const result = test();
        
        if (result === true) {
            console.log('✅');
            checks.passed++;
        } else if (result === 'warning') {
            console.log('⚠️ ');
            checks.warnings++;
        } else {
            console.log('❌');
            if (required) checks.failed++;
            else checks.warnings++;
        }
    } catch (error) {
        console.log('❌', error.message);
        if (required) checks.failed++;
        else checks.warnings++;
    }
}

console.log('\n🔍 Vérification de l\'installation...\n');

// Fichiers requis
check('user-storage-native.js', () => fs.existsSync('user-storage-native.js'));
check('manifest-manager.js', () => fs.existsSync('manifest-manager.js'));
check('main.js', () => fs.existsSync('main.js'));
check('preload.js', () => fs.existsSync('preload.js'));
check('package.json', () => fs.existsSync('package.json'));

// Vérifier package.json
check('package.json valide', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    return pkg.build && pkg.build.asar === true;
});

check('script prepare-build', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    return pkg.scripts && pkg.scripts['build:prod'] && pkg.scripts['build:prod'].includes('prepare-build');
});

// Vérifier main.js
check('main.js avec ManifestManager', () => {
    const content = fs.readFileSync('main.js', 'utf8');
    return content.includes('getManifestManager') && content.includes('manifestManager');
});

check('main.js handlers manifest', () => {
    const content = fs.readFileSync('main.js', 'utf8');
    return content.includes('manifest:load-videos') && content.includes('manifest:save-video');
});

// Vérifier preload.js
check('preload.js avec znkManifest', () => {
    const content = fs.readFileSync('preload.js', 'utf8');
    return content.includes('znkManifest');
});

// Scripts
check('scripts/prepare-build.js', () => fs.existsSync('scripts/prepare-build.js'), false);

// Dossiers
check('assets/', () => fs.existsSync('assets'));
check('bin/', () => fs.existsSync('bin'), false);

// Dependencies
check('fs-extra installé', () => {
    try {
        require.resolve('fs-extra');
        return true;
    } catch {
        return false;
    }
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`✅ Réussis:      ${checks.passed}`);
if (checks.warnings > 0) console.log(`⚠️  Avertissements: ${checks.warnings}`);
if (checks.failed > 0) console.log(`❌ Échecs:       ${checks.failed}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (checks.failed > 0) {
    console.log('❌ Des corrections sont nécessaires avant de build\n');
    process.exit(1);
} else if (checks.warnings > 0) {
    console.log('⚠️  Vous pouvez build mais certains éléments sont manquants\n');
    process.exit(0);
} else {
    console.log('✅ Tout est prêt pour le build!\n');
    console.log('Commandes disponibles:');
    console.log('  npm run build:mac    # Build macOS');
    console.log('  npm run build:win    # Build Windows');
    console.log('  npm run build:prod   # Build multi-plateformes\n');
    process.exit(0);
}