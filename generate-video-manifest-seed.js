#!/usr/bin/env node
// Régénère assets/seed-manifests/znk-video-manifest.json à partir des vrais
// fichiers présents dans assets/videos-seed/ — élimine tout risque de
// désaccord entre le nom stocké (espaces/casse) et le nom réel sur disque,
// puisque le manifest est dérivé directement des noms de fichiers réels.
//
// Usage : node generate-video-manifest-seed.js
// (à lancer depuis la racine du projet ZNK237-APP)

const fs = require('fs');
const path = require('path');

const VIDEOS_SEED_DIR = path.join(__dirname, 'assets', 'videos-seed');
const OUTPUT_PATH = path.join(__dirname, 'assets', 'seed-manifests', 'znk-video-manifest.json');

if (!fs.existsSync(VIDEOS_SEED_DIR)) {
    console.error('❌ Dossier introuvable :', VIDEOS_SEED_DIR);
    process.exit(1);
}

const files = fs.readdirSync(VIDEOS_SEED_DIR).filter(f => /\.(mp4|webm|mov)$/i.test(f));

if (files.length === 0) {
    console.error('❌ Aucun fichier vidéo trouvé dans', VIDEOS_SEED_DIR);
    process.exit(1);
}

const items = files.map(filename => {
    // Le nom de fichier réel commence par <videoId>_<reste> quand la vidéo
    // vient de znk-publish-studio.html (ex: video_1784311158858_0_titre.mp4).
    // Sinon (fichier ajouté manuellement), on génère un id stable dérivé du nom.
    const m = filename.match(/^(video_\d+_\d+)_(.+)$/);
    const id = m ? m[1] : `persistent_${Buffer.from(filename).toString('hex').slice(0, 20)}`;
    const stats = fs.statSync(path.join(VIDEOS_SEED_DIR, filename));

    return {
        id,
        title: (m ? m[2] : filename).replace(/\.(mp4|webm|mov)$/i, ''),
        description: '',
        filename,
        size: (stats.size / (1024 * 1024)).toFixed(2),
        type: 'video/mp4',
        dashboard: 'actv',
        category: 'general',
        persistent: true
        // Pas de "path"/"url" ici : recalculés dynamiquement à la lecture
        // (voir le handler manifest:load-videos dans main.js).
    };
});

const manifest = {
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
    items
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(manifest, null, 2), 'utf-8');

console.log(`✅ Manifest régénéré : ${items.length} vidéo(s) trouvée(s)`);
items.forEach(it => console.log(`   - ${it.id} → ${it.filename}`));
console.log(`📄 Écrit dans : ${OUTPUT_PATH}`);
