const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// 📁 Configuration des dossiers
const INPUT_DIR = './videos-source';        // Mets tes vidéos brutes ici
const OUTPUT_DIR = './persistent-videos';   // Vidéos converties ici

// 🎬 Profils de compression (choisis celui qui te convient)
const PROFILE = 'light'; // 'light', 'medium', ou 'high'

// 🔧 CHEMIN FFMPEG - Détection automatique
// Cherche d'abord dans le projet, puis dans PATH
const localFFmpeg = path.join(__dirname, 'ffmpeg');
const FFMPEG_PATH = fs.existsSync(localFFmpeg) ? localFFmpeg : 'ffmpeg';

const profiles = {
  light: {
    scale: '720',
    crf: '28',
    bitrate: '1.5M',
    preset: 'fast',
    audio: '128k'
  },
  medium: {
    scale: '1080',
    crf: '23',
    bitrate: '2.5M',
    preset: 'medium',
    audio: '128k'
  },
  high: {
    scale: '1080',
    crf: '20',
    bitrate: '4M',
    preset: 'slow',
    audio: '192k'
  }
};

// 📊 Statistiques
let stats = {
  total: 0,
  converted: 0,
  failed: 0,
  originalSize: 0,
  convertedSize: 0
};

// ✅ Créer les dossiers si nécessaire
function ensureDirs() {
  if (!fs.existsSync(INPUT_DIR)) {
    fs.mkdirSync(INPUT_DIR, { recursive: true });
    console.log(`📁 Dossier créé: ${INPUT_DIR}`);
    console.log(`⚠️  Ajoute tes vidéos dans ce dossier et relance le script`);
    process.exit(0);
  }
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

// 🔍 Vérifier si FFmpeg est disponible
function checkFFmpeg() {
  return new Promise((resolve) => {
    exec(`${FFMPEG_PATH} -version`, (error, stdout) => {
      if (error) {
        console.error('❌ FFmpeg introuvable !');
        console.error('   Vérifie l\'installation avec: ffmpeg -version');
        console.error('   Ou modifie FFMPEG_PATH dans le script');
        process.exit(1);
      }
      const versionMatch = stdout.match(/ffmpeg version ([^\s]+)/);
      const version = versionMatch ? versionMatch[1] : 'inconnue';
      console.log(`✅ FFmpeg détecté: version ${version}\n`);
      resolve();
    });
  });
}

// 📐 Formater la taille
function formatSize(bytes) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1000 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(2)} MB`;
}

// 🎥 Convertir une vidéo
function convertVideo(inputPath, outputPath, profile) {
  return new Promise((resolve, reject) => {
    const p = profiles[profile];
    
    const cmd = `"${FFMPEG_PATH}" -i "${inputPath}" -vf scale=-2:${p.scale} -c:v libx264 -preset ${p.preset} -crf ${p.crf} -b:v ${p.bitrate} -c:a aac -b:a ${p.audio} -movflags +faststart -y "${outputPath}"`;
    
    console.log(`\n🔄 Conversion: ${path.basename(inputPath)}`);
    console.log(`   Profil: ${profile.toUpperCase()} (${p.scale}p, CRF ${p.crf})`);
    
    const startTime = Date.now();
    
    const process = exec(cmd, { 
      maxBuffer: 1024 * 1024 * 10,
      shell: true
    });
    
    let lastProgress = '';
    let hasError = false;
    
    process.stderr.on('data', (data) => {
      const str = data.toString();
      
      // Extraire la progression (time=00:01:23.45)
      const timeMatch = str.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      if (timeMatch) {
        const progress = `   ⏱️  ${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}`;
        if (progress !== lastProgress) {
          process.stdout.write(`\r${progress}`);
          lastProgress = progress;
        }
      }
      
      // Détecter les erreurs critiques
      if (str.includes('No such file') || str.includes('Invalid') || str.includes('error')) {
        if (!hasError) {
          console.error(`\n⚠️  Avertissement FFmpeg: ${str.substring(0, 100)}...`);
          hasError = true;
        }
      }
    });

    process.stdout.on('data', (data) => {
      // Certaines infos passent par stdout
      const str = data.toString();
      if (str.includes('error') || str.includes('Error')) {
        console.error(`\n⚠️  ${str}`);
      }
    });
    
    process.on('error', (err) => {
      console.error(`\n❌ Erreur d'exécution: ${err.message}`);
      if (err.code === 'ENOENT') {
        console.error(`   FFmpeg introuvable au chemin: ${FFMPEG_PATH}`);
      }
      reject(err);
    });
    
    process.on('close', (code) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      
      if (code === 0) {
        try {
          const originalSize = fs.statSync(inputPath).size;
          const convertedSize = fs.statSync(outputPath).size;
          const reduction = ((1 - convertedSize / originalSize) * 100).toFixed(1);
          
          stats.originalSize += originalSize;
          stats.convertedSize += convertedSize;
          
          console.log(`\n   ✅ Converti en ${duration}s`);
          console.log(`   📉 ${formatSize(originalSize)} → ${formatSize(convertedSize)} (${reduction}% de réduction)`);
          
          resolve({ success: true, originalSize, convertedSize });
        } catch (e) {
          resolve({ success: true });
        }
      } else {
        console.log(`\n   ❌ Échec (code ${code})`);
        if (code === 127) {
          console.log(`   💡 Code 127 = FFmpeg non trouvé dans le PATH`);
        }
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });
}

// 🚀 Main
async function main() {
  console.log('🎬 ZNK237 Video Converter\n');
  
  // Vérifier FFmpeg d'abord
  await checkFFmpeg();
  
  ensureDirs();
  
  // Lister les vidéos
  const files = fs.readdirSync(INPUT_DIR).filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.m4v'].includes(ext);
  });
  
  if (files.length === 0) {
    console.log(`❌ Aucune vidéo trouvée dans ${INPUT_DIR}`);
    console.log(`   Formats supportés: MP4, MOV, AVI, MKV, WebM, FLV, M4V`);
    process.exit(1);
  }
  
  stats.total = files.length;
  
  console.log(`📁 Dossier source: ${INPUT_DIR}`);
  console.log(`📁 Dossier sortie: ${OUTPUT_DIR}`);
  console.log(`⚙️  Profil: ${PROFILE.toUpperCase()}`);
  console.log(`📊 Vidéos trouvées: ${files.length}\n`);
  console.log('─'.repeat(60));
  
  // Convertir chaque vidéo
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const inputPath = path.join(INPUT_DIR, file);
    const basename = path.basename(file, path.extname(file));
    const outputPath = path.join(OUTPUT_DIR, `${basename}_${PROFILE}.mp4`);
    
    console.log(`\n[${i + 1}/${files.length}] ${file}`);
    
    try {
      await convertVideo(inputPath, outputPath, PROFILE);
      stats.converted++;
    } catch (error) {
      console.error(`❌ Erreur: ${error.message}`);
      stats.failed++;
    }
  }
  
  // Résumé final
  console.log('\n' + '='.repeat(60));
  console.log('📊 RÉSUMÉ');
  console.log('='.repeat(60));
  console.log(`✅ Converties: ${stats.converted}/${stats.total}`);
  if (stats.failed > 0) {
    console.log(`❌ Échecs: ${stats.failed}`);
  }
  
  if (stats.originalSize > 0 && stats.convertedSize > 0) {
    const totalReduction = ((1 - stats.convertedSize / stats.originalSize) * 100).toFixed(1);
    console.log(`📉 Taille totale: ${formatSize(stats.originalSize)} → ${formatSize(stats.convertedSize)}`);
    console.log(`💾 Réduction: ${totalReduction}%`);
    console.log(`🎉 Espace économisé: ${formatSize(stats.originalSize - stats.convertedSize)}`);
  }
  
  console.log('\n✨ Terminé ! Les vidéos sont dans:', OUTPUT_DIR);
}

// Lancer le script
main().catch(err => {
  console.error('\n❌ Erreur fatale:', err.message);
  process.exit(1);
});