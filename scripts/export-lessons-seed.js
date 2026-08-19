/**
 * export-lessons-seed.js
 * ---------------------------------------------------------
 * À lancer manuellement AVANT chaque `npm run build` / `build:mac` / `build:win`,
 * une fois que le nettoyage des leçons/interrogations a été fait dans l'app
 * (ZNKManifest.lessons.wipeAll() sur les vieux profId de test).
 *
 * Copie userData/znk-professeur-data.json (fichier réel, à jour, sur cette
 * machine) vers assets/seed-manifests/znk-professeur-data-seed.json (le
 * fichier réellement embarqué dans le build, via extraResources dans
 * package.json — voir main.js: seedInitialContentIfEmpty()).
 *
 * Ces deux fichiers ne sont JAMAIS synchronisés automatiquement par l'app :
 * sans cette étape manuelle, le build repart avec l'ancien seed (donc les
 * anciens tests) même après un nettoyage réussi côté app.
 *
 * Usage : node scripts/export-lessons-seed.js
 * ---------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

// Reproduit exactement la logique de main.js :
//   app.setPath('userData', path.join(app.getPath('appData'), 'ZNK'))
// où app.getPath('appData') vaut :
//   macOS   -> ~/Library/Application Support
//   Windows -> %APPDATA%
//   Linux   -> ~/.config
function getElectronUserDataDir() {
    const platform = process.platform;
    let appDataBase;
    if (platform === 'darwin') {
        appDataBase = path.join(os.homedir(), 'Library', 'Application Support');
    } else if (platform === 'win32') {
        appDataBase = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    } else {
        appDataBase = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    }
    return path.join(appDataBase, 'ZNK');
}

function main() {
    const sourcePath = path.join(getElectronUserDataDir(), 'znk-professeur-data.json');
    const destDir = path.join(__dirname, '..', 'assets', 'seed-manifests');
    const destPath = path.join(destDir, 'znk-professeur-data-seed.json');

    if (!fs.existsSync(sourcePath)) {
        console.error('❌ Fichier introuvable :', sourcePath);
        console.error('   Lance l\'app au moins une fois, et fais ton nettoyage (wipeAll) avant de relancer ce script.');
        process.exit(1);
    }

    let data;
    try {
        data = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
    } catch (e) {
        console.error('❌ JSON invalide dans', sourcePath, ':', e.message);
        process.exit(1);
    }

    const lessonCount = Array.isArray(data.lessons) ? data.lessons.length : 0;
    const quizCount = Array.isArray(data.quizzes) ? data.quizzes.length : 0;

    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(destPath, JSON.stringify(data, null, 2), 'utf-8');

    console.log('✅ Seed leçons exporté :', destPath);
    console.log(`   → ${lessonCount} leçon(s), ${quizCount} interrogation(s)`);

    if (lessonCount !== 55 || quizCount !== 54) {
        console.warn(`⚠️  Attendu 55 leçons / 54 interrogations, trouvé ${lessonCount}/${quizCount}.`);
        console.warn('   Vérifie que le nettoyage (wipeAll sur les anciens profId de test) est bien terminé avant de builder.');
    }
}

main();
